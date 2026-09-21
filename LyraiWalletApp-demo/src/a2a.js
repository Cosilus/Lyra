// A2A (Agent2Agent Protocol) client: lets Lyra's own assistant
// delegate a task to a different, specialized agent instead of
// doing everything itself. Real flow: fetch the target agent's Agent
// Card (its published capabilities, conventionally at
// /.well-known/agent.json), then submit a task with the JSON-RPC 2.0
// "message/send" method. The agent answers with a Task carrying
// artifacts (the actual result parts) -- no funds move, this is pure
// task delegation, not a payment protocol.
import { API_BASE_URL } from "./config.js";

export const DEMO_A2A_AGENT_URL = `${API_BASE_URL}/api/a2a/tasks`;

export async function fetchAgentCard(baseUrl) {
  const origin = new URL(baseUrl).origin;
  const res = await fetch(`${origin}/.well-known/agent.json`);
  if (!res.ok) throw new Error(`Couldn't fetch that agent's card (HTTP ${res.status}).`);
  return res.json();
}

function extractTaskText(task) {
  return task?.artifacts?.[0]?.parts?.find(p => p.type === "text")?.text
    || task?.status?.message?.parts?.find(p => p.type === "text")?.text
    || null;
}

// Lyra's own demo agent lives on the same backend as everything
// else the app already calls directly (no CORS issue there, same as
// /api/ai or /api/mpc/*). A genuinely external agent's own server
// almost certainly won't send CORS headers for this origin, so that
// case goes through the backend's /api/a2a/request proxy instead --
// same reasoning as x402's /api/x402/request.
export async function sendA2ATask(agentUrl, taskText) {
  const rpcBody = {
    jsonrpc: "2.0",
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    method: "message/send",
    params: {
      message: {
        role: "user",
        parts: [{ type: "text", text: taskText }],
      },
    },
  };

  const isDemoAgent = agentUrl.startsWith(API_BASE_URL);

  let rpcResponse;
  if (isDemoAgent) {
    const res = await fetch(agentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rpcBody),
    });
    rpcResponse = await res.json();
    if (!res.ok && !rpcResponse?.error) throw new Error(`The agent returned HTTP ${res.status}.`);
  } else {
    const res = await fetch(`${API_BASE_URL}/api/a2a/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentUrl, rpcBody }),
    });
    const proxied = await res.json();
    if (!res.ok) throw new Error(proxied.error || "Couldn't reach that agent.");
    rpcResponse = proxied.body;
  }

  if (rpcResponse?.error) throw new Error(rpcResponse.error.message || "The agent returned an error.");

  const task = rpcResponse?.result;
  const text = extractTaskText(task);
  if (!text) throw new Error("The agent didn't return a readable result.");

  return { task, text };
}
