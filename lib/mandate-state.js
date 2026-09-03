const CREATE_LUA = `
local existing = redis.call('GET', KEYS[1])
if existing then
  local record = cjson.decode(existing)
  return cjson.encode({ok=false, state=record.state, reason='EXISTS', record=record})
end
local now = tonumber(ARGV[2])
local expiresAt = tonumber(ARGV[3])
if now > expiresAt then
  return cjson.encode({ok=false, state='EXPIRED', reason='EXPIRED'})
end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('PEXPIREAT', KEYS[1], expiresAt)
local record = cjson.decode(ARGV[1])
return cjson.encode({ok=true, state=record.state, record=record})
`;

const TRANSITION_LUA = `
local raw = redis.call('GET', KEYS[1])
if not raw then
  return cjson.encode({ok=false, state='MISSING', reason='MISSING'})
end
local record = cjson.decode(raw)
local now = tonumber(ARGV[5])
if now > tonumber(record.expiresAt) then
  redis.call('DEL', KEYS[1])
  return cjson.encode({ok=false, state='EXPIRED', reason='EXPIRED'})
end
if record.state ~= ARGV[1] then
  return cjson.encode({ok=false, state=record.state, reason='STATE_MISMATCH', record=record})
end
if ARGV[3] ~= '' and record.checkoutHash ~= ARGV[3] then
  return cjson.encode({ok=false, state=record.state, reason='CHECKOUT_HASH_MISMATCH', record=record})
end
if ARGV[4] ~= '' and record.razorpayOrderId ~= ARGV[4] then
  return cjson.encode({ok=false, state=record.state, reason='ORDER_ID_MISMATCH', record=record})
end
local patch = cjson.decode(ARGV[6])
for key, value in pairs(patch) do record[key] = value end
record.state = ARGV[2]
record.updatedAt = now
local encoded = cjson.encode(record)
redis.call('SET', KEYS[1], encoded)
redis.call('PEXPIREAT', KEYS[1], tonumber(record.expiresAt))
return cjson.encode({ok=true, state=record.state, record=record})
`;

function newRecord({ mandateId, checkoutHash, issuedAt, expiresAt }) {
  return {
    mandateId,
    state: "ISSUED",
    checkoutHash,
    issuedAt,
    expiresAt,
    updatedAt: issuedAt,
    lastEvent: "MANDATE_ISSUED",
  };
}

function result(ok, state, reason, record) {
  return { ok, state, ...(reason && { reason }), ...(record && { record: structuredClone(record) }) };
}

class MandateStateTransitions {
  async recordOrder(mandateId, razorpayOrderId, checkoutHash, now = Date.now()) {
    return this.compareAndTransition(mandateId, "RESERVED", "ORDER_CREATED", {
      now,
      checkoutHash,
      metadata: { razorpayOrderId, orderCreatedAt: now, lastEvent: "ORDER_CREATED" },
    });
  }

  async recoverReservation(mandateId, checkoutHash, now = Date.now()) {
    return this.compareAndTransition(mandateId, "RESERVED", "ISSUED", {
      now,
      checkoutHash,
      metadata: { reservationRecoveredAt: now, lastEvent: "RESERVATION_RECOVERED" },
    });
  }

  async markOrderCreationAmbiguous(mandateId, checkoutHash, now = Date.now()) {
    return this.compareAndTransition(mandateId, "RESERVED", "ORDER_CREATION_AMBIGUOUS", {
      now,
      checkoutHash,
      metadata: { orderCreationAmbiguousAt: now, lastEvent: "ORDER_CREATION_AMBIGUOUS" },
    });
  }

  async recordPaymentVerified(mandateId, razorpayOrderId, paymentId, checkoutHash, now = Date.now()) {
    const transition = await this.compareAndTransition(mandateId, "ORDER_CREATED", "PAYMENT_VERIFIED", {
      now,
      checkoutHash,
      expectedOrderId: razorpayOrderId,
      metadata: { paymentId, paymentVerifiedAt: now, lastEvent: "PAYMENT_VERIFIED" },
    });
    if (transition.ok) return transition;
    const record = transition.record || await this.getMandateState(mandateId);
    if (record?.state === "PAYMENT_VERIFIED" && record.razorpayOrderId === razorpayOrderId && record.paymentId === paymentId) {
      return { ok: true, state: "PAYMENT_VERIFIED", duplicate: true, record };
    }
    if (record?.razorpayOrderId && record.razorpayOrderId !== razorpayOrderId) {
      return { ok: false, state: record.state, reason: "ORDER_ID_MISMATCH", record };
    }
    return transition;
  }
}

export class MemoryMandateStateStore extends MandateStateTransitions {
  #records = new Map();
  kind = "memory";

  async createMandateState(input, now = Date.now()) {
    if (now > input.expiresAt) return result(false, "EXPIRED", "EXPIRED");
    const existing = this.#records.get(input.mandateId);
    if (existing && now <= existing.expiresAt) return result(false, existing.state, "EXISTS", existing);
    const record = newRecord(input);
    this.#records.set(input.mandateId, record);
    return result(true, record.state, undefined, record);
  }

  async getMandateState(mandateId) {
    const record = this.#records.get(mandateId);
    if (!record) return undefined;
    if (Date.now() > record.expiresAt) {
      this.#records.delete(mandateId);
      return undefined;
    }
    return structuredClone(record);
  }

  async compareAndTransition(mandateId, expectedState, nextState, options = {}) {
    const now = options.now ?? Date.now();
    const record = this.#records.get(mandateId);
    if (!record) return result(false, "MISSING", "MISSING");
    if (now > record.expiresAt) {
      this.#records.delete(mandateId);
      return result(false, "EXPIRED", "EXPIRED");
    }
    if (record.state !== expectedState) return result(false, record.state, "STATE_MISMATCH", record);
    if (options.checkoutHash && record.checkoutHash !== options.checkoutHash) {
      return result(false, record.state, "CHECKOUT_HASH_MISMATCH", record);
    }
    if (options.expectedOrderId && record.razorpayOrderId !== options.expectedOrderId) {
      return result(false, record.state, "ORDER_ID_MISMATCH", record);
    }
    const updated = { ...record, ...options.metadata, state: nextState, updatedAt: now, expiresAt: record.expiresAt };
    this.#records.set(mandateId, updated);
    return result(true, nextState, undefined, updated);
  }
}

export class UpstashMandateStateStore extends MandateStateTransitions {
  #url;
  #token;
  #fetch;
  kind = "upstash";

  constructor(env = process.env, fetchImplementation = fetch) {
    super();
    this.#url = env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
    this.#token = env.UPSTASH_REDIS_REST_TOKEN;
    this.#fetch = fetchImplementation;
    if (!this.#url || !this.#token) throw new Error("Upstash Redis REST configuration is incomplete.");
  }

  #key(mandateId) {
    return `vowgate:mandate:${mandateId}`;
  }

  async #command(command) {
    try {
      const response = await this.#fetch(this.#url, {
        method: "POST",
        headers: { authorization: `Bearer ${this.#token}`, "content-type": "application/json" },
        body: JSON.stringify(command),
        signal: AbortSignal.timeout(5_000),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error("Persistent mandate state operation failed.");
      return payload.result;
    } catch (cause) {
      throw Object.assign(new Error("Persistent mandate state unavailable.", { cause }), { status: 503, code: "PERSISTENT_STATE_UNAVAILABLE" });
    }
  }

  async #eval(script, key, args) {
    const value = await this.#command(["EVAL", script, "1", key, ...args.map(String)]);
    return typeof value === "string" ? JSON.parse(value) : value;
  }

  async createMandateState(input, now = Date.now()) {
    const record = newRecord(input);
    return this.#eval(CREATE_LUA, this.#key(input.mandateId), [JSON.stringify(record), now, input.expiresAt]);
  }

  async getMandateState(mandateId) {
    const value = await this.#command(["GET", this.#key(mandateId)]);
    return typeof value === "string" ? JSON.parse(value) : value || undefined;
  }

  async compareAndTransition(mandateId, expectedState, nextState, options = {}) {
    return this.#eval(TRANSITION_LUA, this.#key(mandateId), [
      expectedState,
      nextState,
      options.checkoutHash || "",
      options.expectedOrderId || "",
      options.now ?? Date.now(),
      JSON.stringify(options.metadata || {}),
    ]);
  }
}

export function createMandateStateStore(env = process.env) {
  const hasUrl = Boolean(env.UPSTASH_REDIS_REST_URL);
  const hasToken = Boolean(env.UPSTASH_REDIS_REST_TOKEN);
  if (hasUrl || hasToken) {
    if (!hasUrl || !hasToken) throw new Error("Persistent mandate state configuration is incomplete.");
    return new UpstashMandateStateStore(env);
  }
  if (env.VERCEL || env.NODE_ENV === "production") {
    throw new Error("Persistent mandate state is required in production.");
  }
  return new MemoryMandateStateStore();
}
