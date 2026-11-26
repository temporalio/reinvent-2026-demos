import { stationId } from './station';

/**
 * A server-relative URL under the path the app is served at (Vite's `base`,
 * e.g. /photobooth/ behind the booth gateway, which strips that prefix before
 * the backend). Without it a request leaves the app's prefix and reaches
 * whatever serves the site's root. Other URLs, and ones already under the
 * prefix, are returned as they are.
 */
export function withBase(url: string): string {
  const base = import.meta.env.BASE_URL;
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith(base)) return url;
  return base + url.slice(1);
}

/** Thin JSON client for the Holodeck backend (proxied at /api by Vite). */
export async function api<T = unknown>(path: string, body?: unknown, method?: string, signal?:AbortSignal): Promise<T> {
  const timeout=AbortSignal.timeout(15_000);
  const res = await fetch(withBase(`/api${path}`), {
    signal: signal ? AbortSignal.any([signal,timeout]) : timeout,
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', 'x-station': stationId() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export {poll} from './polling';
