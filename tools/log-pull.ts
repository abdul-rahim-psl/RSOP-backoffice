// Pulls the bill logs into src/data/api/<log>-log.snapshot.json, each page's fallback when the API is down.
// Usage: npm run log:pull [inquiry|payment]   (both when none is named; each log's env variable overrides its base URL)
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { logs, logUrl, readLog, type LogId, type LogSnapshot } from '../src/data/api/bill-log.ts';

async function pull(id: LogId) {
  const kind = logs[id];
  const file = new URL(`../src/data/api/${id}-log.snapshot.json`, import.meta.url);
  const url = logUrl(kind);
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  const entries: unknown = await res.json();
  // Refuse to save an answer the page couldn't read.
  const read = readLog(entries, kind);
  const next: LogSnapshot = { url, fetchedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), entries };
  await writeFile(file, JSON.stringify(next, null, 2) + '\n');
  console.log(`Wrote ${read.length} ${kind.many} (newest ${read[0]?.at ?? 'none'}) to ${fileURLToPath(file)}.`);
}

async function main() {
  const asked = process.argv.slice(2);
  const unknown = asked.filter((a) => !(a in logs));
  if (unknown.length) throw new Error(`no log named ${unknown.join(', ')}; use ${Object.keys(logs).join(' or ')}`);
  for (const id of (asked.length ? asked : Object.keys(logs)) as LogId[]) await pull(id);
}

main().catch((e: Error) => {
  console.error(`log:pull failed: ${e.message}`);
  process.exitCode = 1;
});
