// Number and time formats shared by the build and the tests; Node and the browser both have full ICU.

const fmt2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat('en-US');

/** Rupees as the doc's demo shows them: "PKR 4,350.00". */
export const pkr = (rupees: number) => `PKR ${fmt2.format(rupees)}`;

export const int = (n: number) => fmt0.format(n);

/** Big amounts for stat tiles: "PKR 3.94M", "PKR 500K", "PKR 12.5K". */
export function compactPkr(rupees: number): string {
  if (rupees >= 1_000_000) return `PKR ${+(rupees / 1_000_000).toFixed(2)}M`;
  if (rupees >= 1_000) return `PKR ${+(rupees / 1_000).toFixed(1)}K`;
  return pkr(rupees);
}

/** Axis ticks: 0, 50, 1K, 2.2M. */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Time since a transaction started: "+19 ms", "+1.84 s". */
export const since = (ms: number) => (ms < 1000 ? `+${ms} ms` : `+${(ms / 1000).toFixed(2)} s`);

export const pct = (part: number, whole: number, digits = 1) => `${((part / whole) * 100).toFixed(digits)}%`;

/** Signed change against a named period, for stat-tile deltas. */
export function delta(now: number, before: number): { text: string; up: boolean } {
  const change = ((now - before) / before) * 100;
  return { text: `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}%`, up: change >= 0 };
}

const pktLong = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Karachi',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const pktShort = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** An ISO time in Pakistan time: "21 Oct 2026, 21:08", or "21 Oct, 21:08" when short. */
export const pkt = (iso: string, short = false) => (short ? pktShort : pktLong).format(new Date(iso));

const pktClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

/** An ISO time as a Pakistan-time clock: "23:41:07". */
export const pktTime = (iso: string) => pktClock.format(new Date(iso));

const pktDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' });
const pktDayMonth = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', day: 'numeric', month: 'short' });

/** "Today, 08:08:04", "Yesterday, 23:41:07" or "20 Oct, 11:02:00", by the Pakistan calendar. */
export function pktWhen(iso: string, now = new Date()): string {
  const days = Math.round((Date.parse(pktDate.format(now)) - Date.parse(pktDate.format(new Date(iso)))) / 86_400_000);
  const day = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : pktDayMonth.format(new Date(iso));
  return `${day}, ${pktTime(iso)}`;
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string, now = new Date()): string {
  const s = Math.max(0, (now.getTime() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86_400);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** A reply time: "391 ms", "1.24 s". */
export const duration = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`);

/** The Pakistan calendar day of an ISO time, "2026-10-22", for grouping by day. */
export const pktDay = (iso: string | Date) => pktDate.format(new Date(iso));

const pktHourOf = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', hourCycle: 'h23' });

/** The Pakistan-time hour of an ISO time, 0–23. */
export const pktHour = (iso: string | Date) => Number(pktHourOf.format(new Date(iso)));

const pktFullDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "Thursday 22 October 2026", by the Pakistan calendar. */
export const pktLongDay = (iso: string | Date) => pktFullDay.format(new Date(iso)).replace(',', '');
