import { demoIntent } from "./vowgate.js";

const schema = {
  type: "OBJECT",
  properties: {
    category: { type: "STRING" },
    maxAmount: { type: "INTEGER", description: "Maximum amount in Indian paise." },
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
  required: ["category", "maxAmount", "currency", "quantity", "requiredAttributes", "allowSubstitutions", "deliveryDeadline"],
};

function validateIntent(value) {
  if (
    !value ||
    value.currency !== "INR" ||
    !Number.isInteger(value.maxAmount) ||
    value.maxAmount < 100 ||
    !Number.isInteger(value.quantity) ||
    value.quantity < 1 ||
    typeof value.category !== "string" ||
    typeof value.allowSubstitutions !== "boolean" ||
    typeof value.requiredAttributes?.finish !== "string" ||
    typeof value.requiredAttributes?.dimmable !== "boolean"
  ) throw new Error("Model returned an invalid purchase intent.");
  return value;
}

export async function interpretIntent(text, apiKey = process.env.GEMINI_API_KEY) {
  if (!apiKey) {
    if (text.trim() !== demoIntent.text) throw new Error("Custom intents require GEMINI_API_KEY.");
    return { ...structuredClone(demoIntent), mode: "verified-fixture" };
  }

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `Extract only the customer's explicit purchase constraints. Never infer missing permission.\n\n${text}` }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
    }),
  });

  if (!response.ok) throw new Error(`Gemini request failed with ${response.status}.`);
  const payload = await response.json();
  const parsed = JSON.parse(payload.candidates?.[0]?.content?.parts?.[0]?.text || "null");
  return { text, ...validateIntent(parsed), mode: "gemini-2.5-flash-lite" };
}
