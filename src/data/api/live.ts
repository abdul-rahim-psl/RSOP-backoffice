// The Designer asks the API afresh on every page request; this is the only place the running site calls it.
import { snapshotSource } from './build.ts';
import { API_BASE, type Source } from './endpoints.ts';
import { fetchChains } from './fetch.ts';

/** Short, so a down API costs a page load seconds, not a hang. */
export const LIVE_TIMEOUT_MS = 3000;

/** A fresh answer from `base`, or the snapshot with the reason the API could not be used. */
export async function sourceFrom(base: string, timeoutMs = LIVE_TIMEOUT_MS): Promise<Source> {
  const baseUrl = base.replace(/\/+$/, '');
  try {
    const responses = await fetchChains(baseUrl, timeoutMs);
    return { baseUrl, fetchedAt: new Date().toISOString(), responses, live: true };
  } catch (e) {
    return { ...snapshotSource, error: (e as Error).message };
  }
}

export const liveSource = () => sourceFrom(process.env.RSOP_API_BASE || API_BASE);
