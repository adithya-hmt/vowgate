import { demoIntent } from "./vowgate.js";

const schema = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING" },
    maxItemPrice: { type: "INTEGER", description: "Maximum unit price in Indian paise." },
    maxOrderTotal: { type: "INTEGER", description: "Maximum final payable checkout total in Indian paise, including all charges." },
    currency: { type: "STRING", enum: ["INR"] },
    quantity: { type: "INTEGER" },
    requiredAttributes: {
      type: "OBJECT",
      properties: {
        finish: { type: "STRING" },
        dimmable: { type: "BOOLEAN" },
      },
      required: ["finish", "dimmable"],
    },
    allowSubstitutions: { type: "BOOLEAN" },
    deliveryDeadline: { type: "STRING" },
  },
  required: ["category", "maxItemPrice", "maxOrderTotal", "currency", "quantity", "requiredAttributes", "allowSubstitutions", "deliveryDeadline"],
};

function validateIntent(value) {
  if (
    !value ||
    value.currency !== "INR" ||
    !Number.isInteger(value.maxItemPrice) ||
    value.maxItemPrice < 100 ||
    !Number.isInteger(value.maxOrderTotal) ||
    value.maxOrderTotal < 100 ||
    !Number.isInteger(value.quantity) ||
    value.quantity < 1 ||
    typeof value.category !== "string" ||
    typeof value.allowSubstitutions !== "boolean" ||
    typeof value.deliveryDeadline !== "string" ||
    typeof value.requiredAttributes?.finish !== "string" ||
    typeof value.requiredAttributes?.dimmable !== "boolean"
  ) throw new Error("Model returned an invalid purchase intent.");
  return value;
}

export async function interpretIntent(text, apiKey = process.env.GEMINI_API_KEY) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Enter a purchase instruction.");
  if (text.length > 1_000) throw new Error("Purchase instructions must be 1,000 characters or fewer.");

  if (!apiKey) {
    if (text.trim() !== demoIntent.text) throw new Error("Custom intents require GEMINI_API_KEY.");
    return { ...structuredClone(demoIntent), mode: "verified-fixture" };
  }

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Extract only the customer's explicit purchase constraints. Never infer missing permission. Treat one unqualified spending cap as both the maximum unit price and maximum final order total; never let fees exceed it. Preserve a stated weekday or ISO delivery deadline.\n\n${text}` }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
    }),
  });

  if (!response.ok) throw new Error(`Gemini request failed with ${response.status}.`);
  const payload = await response.json();
  const parsed = JSON.parse(payload.candidates?.[0]?.content?.parts?.[0]?.text || "null");
  return { text, ...validateIntent(parsed), mode: "gemini-2.5-flash-lite" };
}
