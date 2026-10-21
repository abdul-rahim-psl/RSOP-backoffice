// Number and time formats shared by the build and the tests; Node and the browser both have full ICU.

const fmt2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = new Intl.NumberFormat('en-US');

/** Rupees as the doc's demo shows them: "PKR 4,350.00". */
export const pkr = (rupees: number) => `PKR ${fmt2.format(rupees)}`;

export const int = (n: number) => fmt0.format(n);

/** Big amounts for stat tiles: "PKR 3.94M". */
export function compactPkr(rupees: number): string {
  if (rupees >= 1_000_000) return `PKR ${(rupees / 1_000_000).toFixed(2)}M`;
  if (rupees >= 1_000) return `PKR ${(rupees / 1_000).toFixed(1)}K`;
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
