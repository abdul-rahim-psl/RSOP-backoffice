// Asks RSOP's flow API for every chain; `npm run api:pull` and the Designer's per-request render both use it.
import { parseChain } from '../../lib/chain.ts';
import { ENDPOINTS, type Endpoint, type Snapshot } from './endpoints.ts';

async function get(base: string, path: Endpoint, timeoutMs: number): Promise<Record<string, string>> {
  const url = base + path;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'TimeoutError') throw new Error(`${url} did not answer within ${timeoutMs / 1000} s`);
    throw new Error(`${url} could not be reached (${(err.cause as Error | undefined)?.message ?? err.message})`);
  }
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const body: unknown = await res.json().catch(() => {
    throw new Error(`${url} did not answer JSON`);
  });
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(`${url} did not answer a JSON object`);
  const out: Record<string, string> = {};
  for (const [key, chain] of Object.entries(body)) {
    if (typeof chain !== 'string') throw new Error(`${url}: "${key}" is not a chain string`);
    try {
      parseChain(chain);
    } catch (e) {
      throw new Error(`${url}: "${key}" does not parse: ${(e as Error).message}`);
    }
    out[key] = chain;
  }
  return out;
}

/** Both endpoints' answers, every chain already checked to parse; throws on the first problem. */
export async function fetchChains(base: string, timeoutMs: number): Promise<Snapshot['responses']> {
  const pairs = await Promise.all(ENDPOINTS.map(async (path) => [path, await get(base, path, timeoutMs)] as const));
  return Object.fromEntries(pairs) as Snapshot['responses'];
}
