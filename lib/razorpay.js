import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function hasRazorpayCliConfig() {
  return existsSync(join(homedir(), ".razorpay", "config.yaml"));
}

export function createOrderOnce(cache, mandateId, create) {
  if (!cache.has(mandateId)) {
    cache.set(mandateId, Promise.resolve().then(create).catch((error) => {
      cache.delete(mandateId);
      throw error;
    }));
  }
  return cache.get(mandateId);
}

export async function createRazorpayOrder(checkout, mandateId, env = process.env, { useCli = false, exec = execFileAsync } = {}) {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  const receipt = checkout.id.slice(0, 40);
  const notes = { vowgate_mandate: mandateId.slice(0, 256), merchant: "Nightswitch Supply" };

  if (keyId && keySecret) {
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ amount: checkout.amount, currency: checkout.currency, receipt, notes }),
    });

    if (!response.ok) throw new Error(`Razorpay order creation failed with ${response.status}.`);
    return { ...(await response.json()), mode: "razorpay-test" };
  }

  if (useCli) {
    const { stdout } = await exec("razorpay", [
      "orders", "create",
      "--amount", String(checkout.amount),
      "--currency", checkout.currency,
      "--receipt", receipt,
      "--note", `vowgate_mandate=${notes.vowgate_mandate}`,
      "--note", `merchant=${notes.merchant}`,
    ], { encoding: "utf8", env: { ...process.env, RAZORPAY_OUTPUT_FORMAT: "json" } });
    return { ...JSON.parse(stdout), mode: "razorpay-cli" };
  }

  return {
    id: `order_sim_${checkout.id.slice(-8)}`,
    amount: checkout.amount,
    currency: checkout.currency,
    status: "created",
    mode: "simulated",
  };
}
