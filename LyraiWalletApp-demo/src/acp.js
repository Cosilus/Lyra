// ACP (Agentic Commerce Protocol) client: a conversational checkout,
// right in the chat. Real flow: create a checkout session (line
// items + total), then complete it once payment is provided. This
// demo merchant settles that payment over x402 (see x402.js) -- the
// same EIP-3009 signature flow already used for PAY_X402, just
// gating a checkout session's completion instead of a generic
// resource fetch.
import { API_BASE_URL } from "./config.js";

export async function createCheckoutSession(items) {
  const res = await fetch(`${API_BASE_URL}/api/acp/checkout_sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const session = await res.json();
  if (!res.ok) throw new Error(session.error || "Couldn't create that checkout session.");
  return session;
}

export async function completeCheckoutSession(sessionId, paymentHeader) {
  const res = await fetch(`${API_BASE_URL}/api/acp/checkout_sessions/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-PAYMENT": paymentHeader },
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || "Couldn't complete that checkout.");
  return result;
}
