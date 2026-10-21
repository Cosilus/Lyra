import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {}

export async function api<T = any>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Cannot reach the AI ARENA server. Is it running?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const get = <T = any>(url: string) => api<T>('GET', url);

/** Loads data on mount / when deps change, exposing loading + error + reload. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const load = useCallback(() => {
    if (!url) return;
    setLoading(true);
    get<T>(url)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [url]);
  useEffect(load, [load]);
  return { data, error, loading, reload: load };
}
