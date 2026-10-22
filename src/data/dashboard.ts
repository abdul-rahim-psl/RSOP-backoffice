// The dashboard's figures, all counted from the bill inquiry and bill payment logs; nothing here is made up.
// "Today" is the Pakistan calendar day of the read, so the figures match the log screens' times.
import { summarize, type LogEntry, type LogId, type LogSource, type LogSummary } from './api/bill-log.ts';
import { pktDay, pktHour } from '../lib/format.ts';

export interface LogDay {
  /** Today's entries, newest first. */
  entries: LogEntry[];
  sum: LogSummary;
  /** Per hour in `hours`: SUCCESS, error replies and no reply. */
  hourly: { ok: number[]; error: number[]; silent: number[] };
  /** Entries yesterday up to the same time of day; null when the log doesn't reach back to yesterday. */
  yesterday: number | null;
  yesterdayOk: number | null;
}

export interface Dashboard {
  /** The moment the figures count up to: the read time, or the newest snapshot's when no log could be read. */
  asOf: string;
  /** Whether `asOf` is the Pakistan calendar day of the page's own clock. */
  today: boolean;
  /** "08:00", "09:00", … from the first hour with activity to the hour of `asOf`. */
  hours: string[];
  inquiry: LogDay;
  payment: LogDay;
  /** Both logs' replies today, for one typical reply time. */
  medianMs: number | null;
  /** The newest entries across both logs. */
  latest: { log: LogId; entry: LogEntry }[];
}

const DAY_MS = 86_400_000;

function day(src: LogSource, asOf: string, hours: number[]): LogDay {
  const d = pktDay(asOf);
  const entries = src.entries.filter((e) => pktDay(e.at) === d && Date.parse(e.at) <= Date.parse(asOf));
  const per = (pick: (e: LogEntry) => boolean) => hours.map((h) => entries.filter((e) => pktHour(e.at) === h && pick(e)).length);

  // A log that starts today says nothing about yesterday, so the comparison needs an entry from yesterday or earlier.
  const cut = Date.parse(asOf) - DAY_MS;
  const yd = pktDay(new Date(cut));
  const reachesBack = src.entries.some((e) => pktDay(e.at) <= yd);
  const before = src.entries.filter((e) => pktDay(e.at) === yd && Date.parse(e.at) <= cut);

  return {
    entries,
    sum: summarize(entries),
    hourly: {
      ok: per((e) => e.outcome === 'returned'),
      error: per((e) => e.outcome === 'error'),
      silent: per((e) => e.outcome === 'silent'),
    },
    yesterday: reachesBack ? before.length : null,
    yesterdayOk: reachesBack ? before.filter((e) => e.outcome === 'returned').length : null,
  };
}

export function buildDashboard(inquiry: LogSource, payment: LogSource, now = new Date(), latestCount = 8): Dashboard {
  const live = [inquiry, payment].filter((s) => s.live);
  const asOf = live.length ? now.toISOString() : [inquiry.fetchedAt, payment.fetchedAt].sort().at(-1)!;

  const d = pktDay(asOf);
  const todays = [...inquiry.entries, ...payment.entries].filter((e) => pktDay(e.at) === d && Date.parse(e.at) <= Date.parse(asOf));
  const first = todays.length ? Math.min(...todays.map((e) => pktHour(e.at))) : pktHour(asOf);
  const hourNums = Array.from({ length: pktHour(asOf) - first + 1 }, (_, i) => first + i);

  const inq = day(inquiry, asOf, hourNums);
  const pay = day(payment, asOf, hourNums);
  const latest = [
    ...inq.entries.map((entry) => ({ log: 'inquiry' as const, entry })),
    ...pay.entries.map((entry) => ({ log: 'payment' as const, entry })),
  ]
    .sort((a, b) => Date.parse(b.entry.at) - Date.parse(a.entry.at))
    .slice(0, latestCount);

  return {
    asOf,
    today: d === pktDay(now),
    hours: hourNums.map((h) => `${String(h).padStart(2, '0')}:00`),
    inquiry: inq,
    payment: pay,
    medianMs: summarize([...inq.entries, ...pay.entries]).medianMs,
    latest,
  };
}
