import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhookSignature(rawBody, receivedSignature, secret) {
  if (!secret || !receivedSignature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = Buffer.from(receivedSignature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}

export class EventLedger {
  #eventIds = new Set();

  claim(eventId) {
    if (!eventId || this.#eventIds.has(eventId)) return false;
    this.#eventIds.add(eventId);
    return true;
  }

}
