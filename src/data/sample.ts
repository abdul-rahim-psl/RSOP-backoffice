// Fictional bills shared by the Designer's transactions and the dashboard's billing table.
// The first carries over RSOP demo's sample (PT-2026-004512, PKR 4,350.00, INQ-8F2C41).

export type BillType = 'Property tax' | 'Water bill' | 'Vehicle tax' | 'Court fee';

export interface Bill {
  type: BillType;
  ref: string;
  institution: string;
  /** Short institution code, as RSOP's mapped message carries it. */
  code: string;
  /** Rupees, as the biller returned it; absent while no inquiry has succeeded. */
  amount?: number;
  inquiryId?: string;
}

export const bills = {
  propertyTax: {
    type: 'Property tax',
    ref: 'PT-2026-004512',
    institution: 'Demo Municipal Authority',
    code: 'DMA',
    amount: 4350,
    inquiryId: 'INQ-8F2C41',
  },
  waterBill: {
    type: 'Water bill',
    ref: 'WB-2026-118840',
    institution: 'Demo Water Board',
    code: 'DWB',
    amount: 1280,
    inquiryId: 'INQ-2D7A90',
  },
  vehicleTax: { type: 'Vehicle tax', ref: 'VT-2026-000031', institution: 'Demo Excise Office', code: 'DEO' },
  courtFee: { type: 'Court fee', ref: 'CF-2026-007719', institution: 'Demo District Court', code: 'DDC' },
  propertyTax2: {
    type: 'Property tax',
    ref: 'PT-2026-009877',
    institution: 'Demo Municipal Authority',
    code: 'DMA',
    amount: 7120,
    inquiryId: 'INQ-77E0D3',
  },
  waterBill2: {
    type: 'Water bill',
    ref: 'WB-2026-120311',
    institution: 'Demo Water Board',
    code: 'DWB',
    amount: 960,
    inquiryId: 'INQ-5B19AF',
  },
} satisfies Record<string, Bill>;

export const banks = { demo: 'Demo Bank', sample: 'Sample Bank' } as const;

export const paymentRefs = {
  first: 'PAY-20261021-000187',
  refused: 'PAY-20261021-000203',
  retried: 'PAY-20261021-000231',
  awaiting: 'PAY-20261021-000245',
} as const;

/** Where a sample transaction's trace lives in the Designer. */
export const traceHref = (flow: 'inquiry' | 'payment', n: number) => `/designer/${flow}/?txn=${n}`;
