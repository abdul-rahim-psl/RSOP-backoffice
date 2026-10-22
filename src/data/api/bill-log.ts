// The bill inquiry and bill payment logs: every call the log API recorded, with its headers and the reply.
// Both logs share one shape. The server asks on every page load; the API fails CORS preflight, so the browser can't ask it directly.
import type { Tone } from '../../lib/flow.ts';
import inquirySnap from './inquiry-log.snapshot.json' with { type: 'json' };
import paymentSnap from './payment-log.snapshot.json' with { type: 'json' };

/** Overridden per log by its `env` variable. */
export const LOG_BASE = 'http://10.0.150.35:7774';
/** The payment log has taken 5–7 s to answer; the page shows a loader meanwhile, and this bounds the wait. */
export const LOG_TIMEOUT_MS = 15_000;

export type LogId = 'inquiry' | 'payment';

/** `returned`: SUCCESS (code 0). `error`: any other reply. `silent`: logged, with no reply recorded. */
export type Outcome = 'returned' | 'error' | 'silent';

export interface OutcomeInfo {
  id: Outcome;
  label: string;
  tone: Tone;
  means: string;
}

/** Where one log lives and the words its screen uses. */
export interface LogKind {
  id: LogId;
  path: string;
  env: string;
  title: string;
  /** "inquiry" / "inquiries"; the capitalised forms start a label, `aOne` carries its article. */
  one: string;
  many: string;
  One: string;
  Many: string;
  aOne: string;
  /** The KPI for successful calls, e.g. "Bills returned". */
  okKpi: string;
  /** Ends "SUCCESS came back in 130 ms, …". */
  okStory: string;
  /** The detail's label for the request time, and its section on the caller. */
  asked: string;
  whoAsked: string;
  /** Prefixes each entry's element id, and so the deep link `#inq-123`. */
  anchor: string;
  outcomes: OutcomeInfo[];
  snapshot: unknown;
}

export const logs: Record<LogId, LogKind> = {
  inquiry: {
    id: 'inquiry',
    path: '/api/v1/billInquirylist',
    env: 'RSOP_INQUIRY_LOG_BASE',
    title: 'Bill Inquiries',
    one: 'inquiry',
    many: 'inquiries',
    One: 'Inquiry',
    Many: 'Inquiries',
    aOne: 'an inquiry',
    okKpi: 'Bills returned',
    okStory: 'so the bill was found',
    asked: 'Asked',
    whoAsked: 'Who asked',
    anchor: 'inq',
    outcomes: [
      { id: 'returned', label: 'Bill returned', tone: 'ok', means: 'The reply was SUCCESS (code 0): the bill was found.' },
      { id: 'error', label: 'Error reply', tone: 'fail', means: 'A reply came back with an error code, such as 101, Bill Reference not found.' },
      { id: 'silent', label: 'No reply', tone: 'wait', means: 'The inquiry was logged, but no reply was recorded for it.' },
    ],
    snapshot: inquirySnap,
  },
  payment: {
    id: 'payment',
    path: '/api/v1/billPaymentlist',
    env: 'RSOP_PAYMENT_LOG_BASE',
    title: 'Bill Payments',
    one: 'payment',
    many: 'payments',
    One: 'Payment',
    Many: 'Payments',
    aOne: 'a payment',
    okKpi: 'Paid',
    okStory: 'so the bill was paid',
    asked: 'Sent',
    whoAsked: 'Who paid',
    anchor: 'pay',
    outcomes: [
      { id: 'returned', label: 'Paid', tone: 'ok', means: 'The reply was SUCCESS (code 0): the bill was paid.' },
      { id: 'error', label: 'Error reply', tone: 'fail', means: 'A reply came back with an error code, so the bill was not paid.' },
      { id: 'silent', label: 'No reply', tone: 'wait', means: 'The payment was logged, but no reply was recorded for it.' },
    ],
    snapshot: paymentSnap,
  },
};

/**
 * One element of the API's answer, as it sends it. The inquiry log sends the raw call (headers, IP, `uid`); since
 * 2026-10-22 the payment log sends the payment's own fields instead (`billReference`, `billId`, `totalAmount`, the
 * participants). Either may come, so every field but the ID and request time is optional.
 */
export interface RawEntry {
  id: number;
  requestDate: string;
  responseDate?: string | null;
  responseCode?: string | null;
  responseDesc?: string | null;
  ipAddress?: string | null;
  requestHeaders?: string | null;
  responseHeaders?: string | null;
  rrn?: string | null;
  stan?: string | null;
  correlationId?: string | null;
  uid?: string | null;
  originalMessageId?: string | null;
  billReference?: string | null;
  billId?: string | null;
  totalAmount?: string | number | null;
  sender?: string | null;
  receiver?: string | null;
}

export type Header = [name: string, value: string];

export interface LogEntry {
  id: number;
  at: string;
  repliedAt: string | null;
  replyMs: number | null;
  billRef: string | null;
  billId: string | null;
  /** Rupees, for a payment that carries its total. */
  amount: number | null;
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
  entries: LogEntry[];
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
const rupees = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function toEntry(r: RawEntry): LogEntry {
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
    billRef: text(r.billReference) || text(r.uid) || null,
    billId: text(r.billId) || null,
    amount: rupees(r.totalAmount),
    outcome: code === '0' ? 'returned' : code !== null || repliedAt ? 'error' : 'silent',
    code,
    desc: text(r.responseDesc),
    ip: text(r.ipAddress),
    local: isLoopback(text(r.ipAddress)),
    client: ua ? ua.replace('/', ' ') : null,
    host: header(request, 'host'),
    sender: text(r.sender) || header(request, 'sender-participant-code'),
    senderUser: header(request, 'sender-user-code'),
    receiver: text(r.receiver) || header(request, 'receiver-participant-code'),
    requestId: header(request, 'x-request-id'),
    correlationId: text(r.correlationId),
    rrn: text(r.rrn),
    stan: text(r.stan),
    originalMessageId: text(r.originalMessageId),
    request,
    response,
  };
}

const newestFirst = (a: LogEntry, b: LogEntry) => Date.parse(b.at) - Date.parse(a.at) || b.id - a.id;

/** The answer as entries, newest first; throws a short reason when it isn't a list of them. */
export function readLog(body: unknown, kind: LogKind = logs.inquiry): LogEntry[] {
  if (!Array.isArray(body)) throw new Error(`Its answer wasn't a list of ${kind.many}`);
  body.forEach((e, i) => {
    if (!e || typeof e !== 'object' || typeof e.id !== 'number' || typeof e.requestDate !== 'string' || Number.isNaN(Date.parse(e.requestDate)))
      throw new Error(`Entry ${i + 1} of its answer has no ID or request time`);
  });
  return (body as RawEntry[]).map(toEntry).sort(newestFirst);
}

export const logUrl = (kind: LogKind, base = process.env[kind.env] || LOG_BASE) => base.replace(/\/+$/, '') + kind.path;

/** The committed snapshot: the tests' fixture, and what the page shows when the API can't be read. */
export const snapshotLog = (kind: LogKind): LogSource => {
  const s = kind.snapshot as LogSnapshot;
  return { live: false, url: s.url, fetchedAt: s.fetchedAt, entries: readLog(s.entries, kind) };
};

export async function fetchLog(kind: LogKind, base?: string, timeoutMs = LOG_TIMEOUT_MS): Promise<LogSource> {
  const url = logUrl(kind, base);
  const fetchedAt = new Date().toISOString();
  const fail = (error: string): LogSource => ({ ...snapshotLog(kind), error, tried: url });
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
    return { live: true, url, fetchedAt, entries: readLog(body, kind) };
  } catch (e) {
    return fail((e as Error).message);
  }
}

export interface LogSummary {
  total: number;
  /** Rupees across SUCCESS entries that carry an amount, and how many did. */
  collected: number;
  priced: number;
  counts: Record<Outcome, number>;
  medianMs: number | null;
  slowestMs: number | null;
  newest: string | null;
  oldest: string | null;
  /** Error replies by description, most common first. */
  errors: [desc: string, count: number][];
  /** How many entries carry each request ID; more than one means the ID can't tell them apart. */
  requestIds: Map<string, number>;
}

export function summarize(list: LogEntry[]): LogSummary {
  const counts: Record<Outcome, number> = { returned: 0, error: 0, silent: 0 };
  const errors = new Map<string, number>();
  const requestIds = new Map<string, number>();
  let collected = 0;
  let priced = 0;
  for (const q of list) {
    counts[q.outcome]++;
    if (q.outcome === 'returned' && q.amount !== null) {
      collected += q.amount;
      priced++;
    }
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
    collected,
    priced,
    counts,
    medianMs: times.length ? (times.length % 2 ? times[mid] : Math.round((times[mid - 1] + times[mid]) / 2)) : null,
    slowestMs: times.at(-1) ?? null,
    newest: list[0]?.at ?? null,
    oldest: list.at(-1)?.at ?? null,
    errors: [...errors].sort((a, b) => b[1] - a[1]),
    requestIds,
  };
}
