import type { BillType } from './sample.ts';

// Mock bill-pay stats for one day; the tests check that every series adds up to its total.

export const asOf = { day: 'Wednesday 21 October 2026', short: 'Today, 21 Oct', time: '16:00 PKT' } as const;

export const hours = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];

export const hourly = {
  inquiries: [72, 138, 181, 197, 166, 142, 175, 177],
  settled: [52, 98, 131, 142, 121, 104, 126, 105],
  refused: [1, 3, 5, 6, 3, 2, 5, 4],
  /** Payments that had AUTH but no ACSP yet at 16:00. */
  awaiting: [0, 0, 0, 0, 0, 0, 0, 5],
};

export const totals = {
  inquiries: 1248,
  /** pacs.008 received. */
  payments: 913,
  auth: 884,
  naut: 29,
  acsp: 879,
  awaiting: 5,
  marked: 871,
  /** Settled payments whose bill marking is still being retried. */
  retrying: 8,
  collected: 3_937_800,
};

export const yesterday = { inquiries: 1176, payments: 861, collected: 3_712_450, successRate: 95.8 };

export const byType: { type: BillType; payments: number; collected: number }[] = [
  { type: 'Property tax', payments: 312, collected: 2_184_600 },
  { type: 'Vehicle tax', payments: 187, collected: 1_084_600 },
  { type: 'Water bill', payments: 268, collected: 388_600 },
  { type: 'Court fee', payments: 112, collected: 280_000 },
];

export const funnel: { label: string; code?: string; value: number }[] = [
  { label: 'Inquiries', value: totals.inquiries },
  { label: 'Payments sent', code: 'pacs.008', value: totals.payments },
  { label: 'Authorised', code: 'AUTH', value: totals.auth },
  { label: 'Settled', code: 'ACSP', value: totals.acsp },
  { label: 'Bill marked', value: totals.marked },
];

export const successRate = (totals.acsp / totals.payments) * 100;
