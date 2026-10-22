// The bill inquiry log: every inquiry the log API recorded, with its headers and the reply.
// The server asks on every page load; the API fails CORS preflight, so the browser can't ask it directly.
import type { Tone } from '../../lib/flow.ts';
import snap from './inquiry-log.snapshot.json' with { type: 'json' };

/** Overridden by RSOP_INQUIRY_LOG_BASE. */
export const LOG_BASE = 'http://10.0.150.35:7774';
export const LOG_PATH = '/api/v1/billInquirylist';
/** The API answers in about a second; this bounds a page load when it doesn't. */
export const LOG_TIMEOUT_MS = 5000;

/** One element of the API's answer, as it sends it. */
export interface RawInquiry {
  id: number;
  ipAddress: string | null;
  requestDate: string;
  requestHeaders: string | null;
  responseDate: string | null;
  responseHeaders: string | null;
  rrn: string | null;
  stan: string | null;
  correlationId: string | null;
  uid: string | null;
  responseCode: string | null;
  responseDesc: string | null;
  originalMessageId: string | null;
}

/** `returned`: SUCCESS (code 0). `error`: any other reply. `silent`: logged, with no reply recorded. */
export type Outcome = 'returned' | 'error' | 'silent';

export const outcomes: { id: Outcome; label: string; tone: Tone; means: string }[] = [
  { id: 'returned', label: 'Bill returned', tone: 'ok', means: 'The reply was SUCCESS (code 0): the bill was found.' },
  { id: 'error', label: 'Error reply', tone: 'fail', means: 'A reply came back with an error code, such as 101, Bill Reference not found.' },
  { id: 'silent', label: 'No reply', tone: 'wait', means: 'The inquiry was logged, but no reply was recorded for it.' },
];

export type Header = [name: string, value: string];

export interface Inquiry {
  id: number;
  at: string;
  repliedAt: string | null;
  replyMs: number | null;
  billRef: string | null;
  outcome: Outcome;
  code: string | null;
  desc: string | null;
  ip: string | null;
  /** The caller was the log's own host. */
  local: boolean;
  /** The user agent, e.g. "curl 8.21.0". */
  client: string | null;
  host: string | null;
  sender: string | null;
  senderUser: string | null;
  receiver: string | null;
  requestId: string | null;
  correlationId: string | null;
  rrn: string | null;
  stan: string | null;
  originalMessageId: string | null;
  request: Header[];
  response: Header[];
}

/** The log as read: live from the API, or the snapshot with why the API couldn't be used and the URL that was tried. */
export interface LogSource {
  live: boolean;
  url: string;
  fetchedAt: string;
  inquiries: Inquiry[];
  error?: string;
  tried?: string;
}

/** What `npm run log:pull` writes: the API's answer verbatim, so a parser change never needs a new pull. */
export interface LogSnapshot {
  url: string;
  fetchedAt: string;
  entries: unknown;
}

/**
 * The API flattens headers into one string: "a:1,b:x, y,c:". A comma starts a new header only when a name and a colon
 * follow it directly, so values such as "Thu, 22 Oct 2026" or "no-cache, no-store" stay whole.
 */
export function parseHeaders(text: string | null): Header[] {
  if (!text) return [];
  return text.split(/,(?=[A-Za-z][A-Za-z0-9-]*:)/).map((part): Header => {
    const i = part.indexOf(':');
    return i < 0 ? [part.trim(), ''] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  });
}

export const header = (list: Header[], name: string) => list.find(([n]) => n.toLowerCase() === name)?.[1] || null;

export const isLoopback = (ip: string | null) =>
  !!ip && (ip === '::1' || ip === '0:0:0:0:0:0:0:1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.'));

const text = (v: unknown) => (typeof v === 'string' ? v : v == null ? null : String(v));

export function toInquiry(r: RawInquiry): Inquiry {
  const request = parseHeaders(text(r.requestHeaders));
  const response = parseHeaders(text(r.responseHeaders));
  const code = text(r.responseCode);
  const repliedAt = text(r.responseDate);
  const ua = header(request, 'user-agent');
  return {
    id: r.id,
    at: r.requestDate,
    repliedAt,
    replyMs: repliedAt ? Date.parse(repliedAt) - Date.parse(r.requestDate) : null,
    billRef: text(r.uid) || null,
    outcome: code === '0' ? 'returned' : code !== null || repliedAt ? 'error' : 'silent',
    code,
    desc: text(r.responseDesc),
    ip: text(r.ipAddress),
    local: isLoopback(text(r.ipAddress)),
    client: ua ? ua.replace('/', ' ') : null,
    host: header(request, 'host'),
    sender: header(request, 'sender-participant-code'),
    senderUser: header(request, 'sender-user-code'),
    receiver: header(request, 'receiver-participant-code'),
    requestId: header(request, 'x-request-id'),
    correlationId: text(r.correlationId),
    rrn: text(r.rrn),
    stan: text(r.stan),
    originalMessageId: text(r.originalMessageId),
    request,
    response,
  };
}

const newestFirst = (a: Inquiry, b: Inquiry) => Date.parse(b.at) - Date.parse(a.at) || b.id - a.id;

/** The answer as inquiries, newest first; throws a short reason when it isn't a list of them. */
export function readLog(body: unknown): Inquiry[] {
  if (!Array.isArray(body)) throw new Error("Its answer wasn't a list of inquiries");
  body.forEach((e, i) => {
    if (!e || typeof e !== 'object' || typeof e.id !== 'number' || typeof e.requestDate !== 'string' || Number.isNaN(Date.parse(e.requestDate)))
      throw new Error(`Entry ${i + 1} of its answer has no ID or request time`);
  });
  return (body as RawInquiry[]).map(toInquiry).sort(newestFirst);
}

/** The committed snapshot: the tests' fixture, and what the page shows when the API can't be read. */
export const snapshotLog = (): LogSource => {
  const s = snap as LogSnapshot;
  return { live: false, url: s.url, fetchedAt: s.fetchedAt, inquiries: readLog(s.entries) };
};

export async function fetchInquiryLog(base = process.env.RSOP_INQUIRY_LOG_BASE || LOG_BASE, timeoutMs = LOG_TIMEOUT_MS): Promise<LogSource> {
  const url = base.replace(/\/+$/, '') + LOG_PATH;
  const fetchedAt = new Date().toISOString();
  const fail = (error: string): LogSource => ({ ...snapshotLog(), error, tried: url });
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  } catch (e) {
    const err = e as Error;
    if (err.name === 'TimeoutError') return fail(`No answer within ${timeoutMs / 1000} s`);
    return fail(`Couldn't connect (${(err.cause as Error | undefined)?.message ?? err.message})`);
  }
  if (!res.ok) return fail(`It answered HTTP ${res.status}`);
  try {
    const body: unknown = await res.json().catch(() => {
      throw new Error("Its answer wasn't JSON");
    });
    return { live: true, url, fetchedAt, inquiries: readLog(body) };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export interface LogSummary {
  total: number;
  counts: Record<Outcome, number>;
  medianMs: number | null;
  slowestMs: number | null;
  newest: string | null;
  oldest: string | null;
  /** Error replies by description, most common first. */
  errors: [desc: string, count: number][];
  /** How many inquiries carry each request ID; more than one means the ID can't tell them apart. */
  requestIds: Map<string, number>;
}

export function summarize(list: Inquiry[]): LogSummary {
  const counts: Record<Outcome, number> = { returned: 0, error: 0, silent: 0 };
  const errors = new Map<string, number>();
  const requestIds = new Map<string, number>();
  for (const q of list) {
    counts[q.outcome]++;
    if (q.outcome === 'error') {
      const desc = q.desc || `code ${q.code ?? 'missing'}`;
      errors.set(desc, (errors.get(desc) ?? 0) + 1);
    }
    if (q.requestId) requestIds.set(q.requestId, (requestIds.get(q.requestId) ?? 0) + 1);
  }
  const times = list.flatMap((q) => (q.replyMs === null ? [] : [q.replyMs])).sort((a, b) => a - b);
  const mid = times.length >> 1;
  return {
    total: list.length,
    counts,
    medianMs: times.length ? (times.length % 2 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2)) : null,
    slowestMs: times.at(-1) ?? null,
    newest: list[0]?.at ?? null,
    oldest: list.at(-1)?.at ?? null,
    errors: [...errors].sort((a, b) => b[1] - a[1]),
    requestIds,
  };
}
