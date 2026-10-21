import { config } from '../config.ts';

export interface CompleteRequest {
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
}

export const anthropicAvailable = () => config.anthropicKey.length > 0;

/**
 * Calls the Anthropic Messages API from the server. The key never leaves this process.
 * Temperature 0 and fixed token/time limits keep competition conditions identical for every agent.
 * To add another provider, write a function with the same signature and select it in runner.ts.
 */
export async function anthropicComplete(req: CompleteRequest): Promise<string> {
  if (!anthropicAvailable()) throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Math.min(req.timeoutMs, config.modelTimeoutMs));
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: config.anthropicModel,
        max_tokens: req.maxTokens,
        temperature: 0,
        system: req.system,
        messages: [{ role: 'user', content: req.user }],
      }),
    });
    if (!res.ok) throw new Error(`Provider returned HTTP ${res.status}`);
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    if (!text) throw new Error('Provider returned an empty response.');
    return text;
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('The model did not answer before the time limit.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
