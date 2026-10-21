import type { Tone } from '../lib/flow.ts';
import { bills, traceHref, type BillType } from './sample.ts';

// The latest bills of the day, newest first: the dashboard's "billing" branch on the sketch.

export type PaymentState = 'IN FLIGHT' | 'NOT FOUND' | 'OPEN' | 'AWAITING_ACSP' | 'DONE' | 'REJECTED';
export type MarkingState = 'COMPLETE' | 'PENDING' | null;

export const paymentTone: Record<PaymentState, Tone> = {
  'IN FLIGHT': 'wait',
  'NOT FOUND': 'fail',
  OPEN: 'info',
  AWAITING_ACSP: 'wait',
  DONE: 'ok',
  REJECTED: 'fail',
};

/** Only the doc's own states are status codes; the two inquiry-only states are plain words. */
export const isCode = (s: PaymentState) => s !== 'IN FLIGHT' && s !== 'NOT FOUND';

export const paymentWord: Record<PaymentState, string> = {
  'IN FLIGHT': 'Inquiry in flight',
  'NOT FOUND': 'Bill not found',
  OPEN: 'Inquired, not paid',
  AWAITING_ACSP: 'Awaiting ACSP',
  DONE: 'Paid',
  REJECTED: 'Refused',
};

export interface BillRow {
  time: string;
  type: BillType;
  ref: string;
  institution: string;
  inquiryId: string | null;
  amount: number | null;
  payment: PaymentState;
  marking: MarkingState;
  note?: string;
  traces: { label: string; href: string }[];
}

/** The filter chips over the table; each row belongs to one. */
export const filters = [
  { id: 'all', label: 'All' },
  { id: 'paid', label: 'Paid' },
  { id: 'marking', label: 'Marking pending' },
  { id: 'awaiting', label: 'Awaiting ACSP' },
  { id: 'refused', label: 'Refused' },
  { id: 'inquiry', label: 'Inquiry only' },
] as const;

export type FilterId = (typeof filters)[number]['id'];

export function filterOf(row: BillRow): Exclude<FilterId, 'all'> {
  if (row.payment === 'DONE') return row.marking === 'COMPLETE' ? 'paid' : 'marking';
  if (row.payment === 'AWAITING_ACSP') return 'awaiting';
  if (row.payment === 'REJECTED') return 'refused';
  return 'inquiry';
}

const { propertyTax: pt, waterBill: wb, vehicleTax: vt, courtFee: cf, propertyTax2: pt2, waterBill2: wb2 } = bills;

export const billRows: BillRow[] = [
  {
    time: '15:58:12',
    type: cf.type,
    ref: cf.ref,
    institution: cf.institution,
    inquiryId: null,
    amount: null,
    payment: 'IN FLIGHT',
    marking: null,
    traces: [],
  },
  {
    time: '15:57:40',
    type: wb2.type,
    ref: wb2.ref,
    institution: wb2.institution,
    inquiryId: wb2.inquiryId,
    amount: wb2.amount,
    payment: 'AWAITING_ACSP',
    marking: null,
    traces: [],
  },
  {
    time: '15:55:31',
    type: 'Property tax',
    ref: 'PT-2026-010254',
    institution: 'Demo Municipal Authority',
    inquiryId: 'INQ-91AC3E',
    amount: 3980,
    payment: 'DONE',
    marking: 'COMPLETE',
    traces: [],
  },
  {
    time: '15:52:03',
    type: pt2.type,
    ref: pt2.ref,
    institution: pt2.institution,
    inquiryId: pt2.inquiryId,
    amount: pt2.amount,
    payment: 'DONE',
    marking: 'COMPLETE',
    note: 'Marked on the second attempt',
    traces: [],
  },
  {
    time: '15:49:47',
    type: 'Vehicle tax',
    ref: 'VT-2026-004410',
    institution: 'Demo Excise Office',
    inquiryId: 'INQ-3F0B62',
    amount: 5800,
    payment: 'DONE',
    marking: 'PENDING',
    note: 'Biller timed out; retrying',
    traces: [],
  },
  {
    time: '15:47:21',
    type: wb.type,
    ref: wb.ref,
    institution: wb.institution,
    inquiryId: wb.inquiryId,
    amount: wb.amount,
    payment: 'REJECTED',
    marking: null,
    note: 'Paid PKR 1,200.00: amount does not match',
    traces: [],
  },
  {
    time: '15:44:18',
    type: 'Court fee',
    ref: 'CF-2026-006930',
    institution: 'Demo District Court',
    inquiryId: 'INQ-0A55D2',
    amount: 2500,
    payment: 'OPEN',
    marking: null,
    traces: [],
  },
  {
    time: '15:41:30',
    type: vt.type,
    ref: vt.ref,
    institution: vt.institution,
    inquiryId: null,
    amount: null,
    payment: 'NOT FOUND',
    marking: null,
    traces: [],
  },
  {
    time: '15:39:02',
    type: pt.type,
    ref: pt.ref,
    institution: pt.institution,
    inquiryId: pt.inquiryId,
    amount: pt.amount,
    payment: 'DONE',
    marking: 'COMPLETE',
    traces: [
      { label: 'Inquiry 1', href: traceHref('inquiry', 1) },
      { label: 'Payment 1', href: traceHref('payment', 1) },
    ],
  },
  {
    time: '15:36:44',
    type: 'Water bill',
    ref: 'WB-2026-117702',
    institution: 'Demo Water Board',
    inquiryId: 'INQ-6C2E18',
    amount: 1515,
    payment: 'DONE',
    marking: 'COMPLETE',
    traces: [],
  },
  {
    time: '15:33:09',
    type: 'Vehicle tax',
    ref: 'VT-2026-003987',
    institution: 'Demo Excise Office',
    inquiryId: 'INQ-E8B471',
    amount: 6250,
    payment: 'DONE',
    marking: 'COMPLETE',
    traces: [],
  },
  {
    time: '15:30:52',
    type: 'Property tax',
    ref: 'PT-2026-008415',
    institution: 'Demo Municipal Authority',
    inquiryId: 'INQ-4D9921',
    amount: 9240,
    payment: 'REJECTED',
    marking: null,
    note: 'Paid PKR 9,000.00: amount does not match',
    traces: [],
  },
];
