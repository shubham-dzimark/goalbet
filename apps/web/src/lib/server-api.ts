import 'server-only';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';

/** Server-side read of public catalogue data for the first render; null when the API is unreachable. */
export async function serverGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
