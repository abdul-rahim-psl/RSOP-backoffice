// Pulls the bill inquiry log into src/data/api/inquiry-log.snapshot.json, the page's fallback when the API is down.
// Usage: npm run log:pull   (RSOP_INQUIRY_LOG_BASE overrides the base URL)
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LOG_BASE, LOG_PATH, readLog, type LogSnapshot } from '../src/data/api/inquiry-log.ts';

const FILE = new URL('../src/data/api/inquiry-log.snapshot.json', import.meta.url);
const url = (process.env.RSOP_INQUIRY_LOG_BASE || LOG_BASE).replace(/\/+$/, '') + LOG_PATH;

async function main() {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  const entries: unknown = await res.json();
  // Refuse to save an answer the page couldn't read.
  const read = readLog(entries);
  const next: LogSnapshot = { url, fetchedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), entries };
  await writeFile(FILE, JSON.stringify(next, null, 2) + '\n');
  console.log(`Wrote ${read.length} inquiries (newest ${read[0]?.at ?? 'none'}) to ${fileURLToPath(FILE)}.`);
}

main().catch((e: Error) => {
  console.error(`log:pull failed: ${e.message}`);
  process.exitCode = 1;
});
