// Pulls RSOP's flow chains into src/data/api/snapshot.json. With --check it only compares and writes nothing.
// Usage: npm run api:pull | npm run api:check   (RSOP_API_BASE overrides the base URL)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseChain } from '../src/lib/chain.ts';
import { API_BASE, ENDPOINTS, type Snapshot } from '../src/data/api/endpoints.ts';
import { fetchChains } from '../src/data/api/fetch.ts';

const FILE = new URL('../src/data/api/snapshot.json', import.meta.url);
const TIMEOUT_MS = 5000;
const base = (process.env.RSOP_API_BASE || API_BASE).replace(/\/+$/, '');
const checkOnly = process.argv.includes('--check');

const steps = (chain: string) => parseChain(chain).steps.map((s) => s.name).join(' → ');

function diff(before: Snapshot['responses'] | undefined, after: Snapshot['responses']): string[] {
  const lines: string[] = [];
  for (const path of ENDPOINTS) {
    const a = before?.[path] ?? {};
    const b = after[path];
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[key] === b[key]) continue;
      if (!(key in a)) lines.push(`+ ${key} (new): ${steps(b[key])}`);
      else if (!(key in b)) lines.push(`- ${key} (gone)`);
      else lines.push(`~ ${key}\n    was: ${a[key]}\n    now: ${b[key]}`);
    }
  }
  return lines;
}

async function main() {
  const old: Snapshot | undefined = await readFile(FILE, 'utf8')
    .then((s) => JSON.parse(s) as Snapshot)
    .catch(() => undefined);
  const responses = await fetchChains(base, TIMEOUT_MS);
  const changes = diff(old?.responses, responses);
  // A new address is worth recording even when the chains match, since the page names its source.
  if (old && old.baseUrl !== base) changes.unshift(`~ source: ${old.baseUrl} → ${base}`);

  if (!changes.length) {
    console.log(`No change: the API matches the snapshot pulled ${old!.fetchedAt} from ${old!.baseUrl}.`);
    return;
  }
  console.log(changes.join('\n'));
  if (checkOnly) {
    console.log('\nThe API differs from the snapshot. Run `npm run api:pull`, then `npm run check`.');
    process.exitCode = 1;
    return;
  }
  const next: Snapshot = { baseUrl: base, fetchedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), responses };
  await writeFile(FILE, JSON.stringify(next, null, 2) + '\n');
  console.log(`\nWrote ${fileURLToPath(FILE)}. Run \`npm run check\`: it names any step or sample transaction that no longer fits.`);
}

main().catch((e: Error) => {
  console.error(`api:${checkOnly ? 'check' : 'pull'} failed: ${e.message}`);
  process.exitCode = 1;
});
