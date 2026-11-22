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
export async function api<T = unknown>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(withBase(`/api${path}`), {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: { 'content-type': 'application/json', 'x-station': stationId() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

/** Poll `fn` until `done` returns true (or the returned stop() is called). */
export function poll<T>(fn: () => Promise<T>, onValue: (v: T) => boolean | void, everyMs = 700): () => void {
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const v = await fn();
      if (onValue(v) === true) { stopped = true; return; }
    } catch (e) {
      console.warn('poll error', e);
    }
    if (!stopped) setTimeout(tick, everyMs);
  };
  tick();
  return () => { stopped = true; };
}
