import type { Flow, TxnEvent } from '../../lib/flow.ts';
import { pkr } from '../../lib/format.ts';
import { banks, bills, paymentRefs } from '../sample.ts';

const { propertyTax: pt, waterBill: wb, propertyTax2: pt2, waterBill2: wb2 } = bills;

interface Pay {
  ref: string;
  bank: string;
  inquiryId: string;
  billAmount: number;
  paid: number;
  code: string;
}

const minor = (rupees: number) => Math.round(rupees * 100);

/** From pacs.008 arriving to the inquiry being found; every payment starts this way. */
function intake(p: Pay, t: number[]): TxnEvent[] {
  const [tIn, tWsi, tLookup, tFound] = t;
  return [
    {
      at: 0,
      node: 'start',
      tone: 'info',
      title: 'pacs.008 in',
      text: `Raast forwards ${p.bank}'s payment for ${p.inquiryId}: ${pkr(p.paid)}.`,
      data: { message: 'pacs.008', paymentReference: p.ref, inquiryId: p.inquiryId, amount: pkr(p.paid), payerBank: p.bank },
    },
    {
      at: tIn,
      node: 'incoming',
      tone: 'ok',
      title: 'Received',
      text: 'Incoming Bill accepts the pacs.008. This payment reference has not been seen before, so it is not a repeat.',
      data: { message: 'pacs.008', paymentReference: p.ref, duplicate: false },
    },
    {
      at: tWsi,
      node: 'wsi',
      tone: 'ok',
      title: 'Mapped',
      text: 'WSI maps the pacs.008 with bill-payment.yml into RSOP’s own message.',
      data: {
        template: 'templates/bill-payment.yml',
        out: { inquiryId: p.inquiryId, amountMinor: minor(p.paid), currency: 'PKR', paymentReference: p.ref },
      },
    },
    {
      at: tLookup,
      node: 'validate',
      tone: 'info',
      title: 'Looking up',
      text: `Validate looks up ${p.inquiryId} in the inquiry store.`,
      data: { lookup: 'inquiries', inquiryId: p.inquiryId },
    },
    {
      at: tFound,
      node: 'store',
      tone: 'ok',
      title: 'Inquiry found',
      text: `The store has ${p.inquiryId} for ${pkr(p.billAmount)}, status OPEN.`,
      data: { inquiryId: p.inquiryId, amountMinor: minor(p.billAmount), status: 'OPEN' },
    },
  ];
}

/** A valid payment: checked, reserved and authorised. */
function authorised(p: Pay, t: number[]): TxnEvent[] {
  const [tValid, tReserved, tAuth] = t;
  return [
    {
      at: tValid,
      node: 'validate',
      tone: 'ok',
      title: 'Valid',
      text: 'The inquiry ID is known, the amount matches exactly and the inquiry is still OPEN.',
      data: { inquiryExists: true, expectedMinor: minor(p.billAmount), receivedMinor: minor(p.paid), eligible: true },
    },
    {
      at: tReserved,
      node: 'store',
      tone: 'ok',
      title: 'Reserved',
      text: `${p.inquiryId} is reserved for this payment, so no second payment can use it: AWAITING_ACSP.`,
      data: { inquiryId: p.inquiryId, status: 'OPEN → AWAITING_ACSP', reservedFor: p.ref },
    },
    {
      at: tAuth,
      node: 'validate',
      tone: 'ok',
      title: 'AUTH sent',
      text: 'RSOP answers Raast with pacs.002 AUTH: go ahead and settle.',
      data: { message: 'pacs.002', status: 'AUTH', paymentReference: p.ref },
    },
  ];
}

const acsp = (p: Pay, at: number): TxnEvent => ({
  at,
  node: 'await',
  tone: 'ok',
  title: 'ACSP in',
  text: 'Raast has settled and sends pacs.002 ACSP. RSOP marks the payment DONE and keeps a bill-marking task.',
  data: { message: 'pacs.002', status: 'ACSP', paymentReference: p.ref, payment: 'DONE', inquiry: 'AWAITING_ACSP → DONE', task: 'persisted' },
});

const queued = (p: Pay, at: number, attempt: number): TxnEvent => ({
  at,
  node: 'queue',
  tone: attempt === 1 ? 'ok' : 'wait',
  title: attempt === 1 ? 'Task queued' : 'Retry queued',
  text:
    attempt === 1
      ? 'The bill-marking task goes on rsop.billmarking.tasks, a durable queue, so it survives a restart.'
      : `The task goes back on the queue for attempt ${attempt}, with the same payment reference.`,
  data: { queue: 'rsop.billmarking.tasks', attempt, idempotencyKey: p.ref, payment: 'DONE' },
});

const calling = (p: Pay, at: number, attempt: number): TxnEvent => ({
  at,
  node: 'rest',
  tone: 'ok',
  title: attempt === 1 ? 'Calling biller' : 'Calling again',
  text: 'REST converts the headers and calls Bill Marking, keyed by the payment reference.',
  data: {
    url: 'https://biller.example/ws/bill-marking',
    attempt,
    headers: { 'X-Correlation-Id': p.ref, 'Idempotency-Key': p.ref, Authorization: 'Bearer ••••••' },
    body: { inquiryId: p.inquiryId, amount: p.paid.toFixed(2), paymentReference: p.ref },
  },
});

function marked(p: Pay, t: number[], retried: boolean): TxnEvent[] {
  const [tBiller, tDone] = t;
  return [
    {
      at: tBiller,
      node: 'biller',
      tone: 'ok',
      title: 'Bill marked',
      text: retried
        ? 'The biller marks the bill paid. The same payment reference means a repeat could never mark it twice.'
        : 'The biller marks the bill paid and confirms.',
      data: { status: 200, marked: true, paymentReference: p.ref },
    },
    {
      at: tDone,
      node: 'rest',
      tone: 'ok',
      title: 'Notified',
      text: retried ? 'RSOP records the bill notification as COMPLETE, one retry later.' : 'RSOP records the bill notification as COMPLETE.',
      data: { payment: 'DONE', notification: 'COMPLETE' },
    },
  ];
}

const first: Pay = { ref: paymentRefs.first, bank: banks.demo, inquiryId: pt.inquiryId, billAmount: pt.amount, paid: pt.amount, code: pt.code };
const refused: Pay = { ref: paymentRefs.refused, bank: banks.sample, inquiryId: wb.inquiryId, billAmount: wb.amount, paid: 1200, code: wb.code };
const retried: Pay = { ref: paymentRefs.retried, bank: banks.demo, inquiryId: pt2.inquiryId, billAmount: pt2.amount, paid: pt2.amount, code: pt2.code };
const awaiting: Pay = { ref: paymentRefs.awaiting, bank: banks.sample, inquiryId: wb2.inquiryId, billAmount: wb2.amount, paid: wb2.amount, code: wb2.code };

export const paymentFlow: Flow = {
  id: 'payment',
  name: 'Bill payment',
  nav: 'Payment',
  summary: 'A bank pays against an inquiry; RSOP checks it, Raast settles it, then RSOP tells the biller.',
  version: 'v0.1 draft',
  nodes: [
    {
      id: 'start',
      kind: 'start',
      family: 'raast',
      label: 'Start',
      sub: 'Raast',
      origin: 'sketch',
      col: 0,
      row: 0,
      about: 'Where a bill payment enters RSOP: the payer bank’s pacs.008, delivered over Raast messaging.',
      params: { flow: 'bill-payment', version: '0.1', trigger: 'raast-message', message: 'pacs.008' },
    },
    {
      id: 'incoming',
      kind: 'inbound',
      family: 'raast',
      label: 'Incoming Bill',
      sub: 'Payment · pacs.008',
      origin: 'sketch',
      col: 1,
      row: 0,
      about: 'Receives the payment. A pacs.008 that repeats a payment reference already seen is handled once, never paid twice.',
      params: {
        name: 'incoming-bill-payment',
        channel: 'raast-messaging',
        message: 'pacs.008',
        idempotencyKey: 'paymentReference',
        duplicates: 'ignore # a repeated pacs.008 is handled once',
      },
    },
    {
      id: 'wsi',
      kind: 'wsi',
      family: 'rsop',
      label: 'WSI',
      sub: 'bill-payment.yml',
      template: 'templates/bill-payment.yml',
      origin: 'sketch',
      col: 2,
      row: 0,
      about: 'The web-service interface. Its YAML template maps the pacs.008 into RSOP’s own message, with the inquiry ID and the amount in minor units.',
      params: {
        name: 'wsi-bill-payment',
        template: 'templates/bill-payment.yml',
        direction: 'inbound',
        map: {
          inquiryId: 'TBC # which pacs.008 element carries it is open in the doc',
          amountMinor: 'settlement amount, in paisa',
          currency: 'PKR',
          paymentReference: 'the payment’s own reference',
          payerBank: 'the sending bank',
        },
      },
    },
    {
      id: 'validate',
      kind: 'decision',
      family: 'rsop',
      label: 'Validate',
      sub: 'Inquiry ID + amount',
      origin: 'doc',
      col: 3,
      row: 0,
      about:
        'Checks the payment against the stored inquiry: the ID exists, the amount matches exactly and the inquiry can still be paid. Valid means AUTH; anything else means NAUT.',
      params: {
        checks: ['inquiry ID exists', 'amount matches exactly, in minor units', 'inquiry is OPEN'],
        onValid: { reserve: 'OPEN → AWAITING_ACSP', reply: 'pacs.002 AUTH' },
        onInvalid: {
          reply: 'pacs.002 NAUT',
          reasons: ['Unknown inquiry', 'Amount does not match', 'Inquiry not eligible'],
          reasonCodes: 'TBC # the rejection reason mapping is open in the doc',
        },
        atomic: true,
      },
    },
    {
      id: 'store',
      kind: 'store',
      family: 'store',
      label: 'Inquiry store',
      sub: 'Read + reserve',
      origin: 'doc',
      col: 3,
      row: -1,
      about: 'The inquiries kept by the Inquiry flow. Validate reads one, and reserves it in the same step so two payments can never use the same inquiry.',
      params: {
        table: 'inquiries',
        read: 'inquiryId',
        reserve: 'OPEN → AWAITING_ACSP',
        onAcsp: 'AWAITING_ACSP → DONE',
        lock: 'one payment per inquiry',
      },
    },
    {
      id: 'await',
      kind: 'wait',
      family: 'raast',
      label: 'Await ACSP',
      sub: 'pacs.002 from Raast',
      origin: 'doc',
      col: 4,
      row: 0,
      about:
        'After AUTH, Raast settles and sends pacs.002 ACSP. Only then is the payment DONE and the biller told. If ACSP is late, the payment stays pending until its status is known.',
      params: {
        expects: 'pacs.002',
        status: 'ACSP',
        correlateBy: 'paymentReference',
        onAcsp: ['mark payment DONE', 'persist a bill-marking task'],
        ifLate: 'keep pending; resolve before any new attempt',
        duplicates: 'ignore # a repeated ACSP is handled once',
      },
    },
    {
      id: 'rejected',
      kind: 'end',
      family: 'reject',
      label: 'Rejected',
      sub: 'RJCT from Raast',
      origin: 'doc',
      col: 4,
      row: 1,
      about: 'After NAUT, Raast rejects the transaction and sends pacs.002 RJCT. RSOP records the attempt as REJECTED and never calls Bill Marking.',
      params: {
        expects: 'pacs.002',
        status: 'RJCT',
        marks: 'payment attempt REJECTED',
        inquiry: 'stays OPEN',
        billMarking: 'never # a rejected attempt is not a paid bill',
      },
    },
    {
      id: 'queue',
      kind: 'queue',
      family: 'queue',
      label: 'RabbitMQ',
      sub: 'rsop.billmarking',
      origin: 'sketch',
      col: 5,
      row: 0,
      about:
        'Holds the bill-marking task durably. If the biller fails, the task is retried from here without touching the payment, which is already DONE.',
      params: {
        exchange: 'rsop.bills',
        routingKey: 'billmarking.task',
        queue: 'rsop.billmarking.tasks',
        durable: true,
        retry: { attempts: 5, backoff: 'exponential, from 2 s' },
        deadLetter: 'rsop.billmarking.dlq',
      },
    },
    {
      id: 'rest',
      kind: 'rest',
      family: 'outbound',
      label: 'REST',
      sub: 'Header conversion',
      origin: 'sketch',
      col: 6,
      row: 0,
      about:
        'Calls the biller’s Bill Marking web service. It converts the headers and sends the payment reference as an idempotency key, so a retry can never mark a bill twice.',
      params: {
        name: 'rest-bill-marking',
        target: 'biller.billMarking',
        method: 'POST',
        timeoutMs: 4000,
        headers: {
          convert: { 'x-request-id': 'X-Correlation-Id', 'x-institution': 'X-Biller-Code' },
          add: { Authorization: 'Bearer ${BILLER_TOKEN}', 'Idempotency-Key': '${paymentReference}' },
        },
      },
    },
    {
      id: 'biller',
      kind: 'end',
      family: 'biller',
      label: 'Government biller',
      sub: 'Bill Marking WS · mock',
      origin: 'sketch',
      col: 7,
      row: 0,
      about: 'The mock government biller’s Bill Marking web service. It marks the bill paid, once per payment reference.',
      params: {
        service: 'Bill Marking web service',
        mock: true,
        endpoint: 'https://biller.example/ws/bill-marking',
        sends: ['inquiryId', 'amount', 'paymentReference'],
        idempotent: true,
        schema: 'TBC # the mock API schemas are open in the doc',
      },
    },
  ],
  edges: [
    { from: 'start', to: 'incoming', kind: 'flow' },
    { from: 'incoming', to: 'wsi', kind: 'flow' },
    { from: 'wsi', to: 'validate', kind: 'flow' },
    { from: 'validate', to: 'await', kind: 'ok', label: 'AUTH' },
    { from: 'validate', to: 'rejected', kind: 'fail', label: 'NAUT' },
    { from: 'await', to: 'queue', kind: 'flow', label: 'ACSP' },
    { from: 'queue', to: 'rest', kind: 'flow' },
    { from: 'rest', to: 'biller', kind: 'flow', label: 'WS' },
    { from: 'validate', to: 'store', kind: 'link' },
  ],
  txns: [
    {
      n: 1,
      ref: first.ref,
      title: 'Property tax',
      detail: pkr(first.paid),
      outcome: 'Settled · bill marked',
      tone: 'ok',
      started: '15:39:02',
      events: [
        ...intake(first, [2, 7, 9, 11]),
        ...authorised(first, [13, 16, 18]),
        acsp(first, 1842),
        queued(first, 1846, 1),
        calling(first, 1851, 1),
        ...marked(first, [2290, 2296], false),
      ],
    },
    {
      n: 2,
      ref: refused.ref,
      title: 'Water bill',
      detail: pkr(refused.paid),
      outcome: 'Refused · NAUT',
      tone: 'fail',
      started: '15:47:21',
      events: [
        ...intake(refused, [2, 6, 8, 10]),
        {
          at: 12,
          node: 'validate',
          tone: 'fail',
          title: 'Amount wrong',
          text: `Expected ${pkr(refused.billAmount)}, received ${pkr(refused.paid)}. The inquiry stays OPEN for a correct payment.`,
          data: {
            inquiryExists: true,
            expectedMinor: minor(refused.billAmount),
            receivedMinor: minor(refused.paid),
            reason: 'Amount does not match',
          },
        },
        {
          at: 14,
          node: 'validate',
          tone: 'fail',
          title: 'NAUT sent',
          text: 'RSOP answers Raast with pacs.002 NAUT and the reason “Amount does not match”.',
          data: { message: 'pacs.002', status: 'NAUT', reason: 'Amount does not match', reasonCode: 'TBC # reason mapping is open in the doc' },
        },
        {
          at: 612,
          node: 'rejected',
          tone: 'fail',
          title: 'RJCT in',
          text: 'Raast rejects the transaction and sends pacs.002 RJCT. The attempt is REJECTED, and Bill Marking is never called.',
          data: { message: 'pacs.002', status: 'RJCT', paymentReference: refused.ref, attempt: 'REJECTED', billMarking: 'not called' },
        },
      ],
    },
    {
      n: 3,
      ref: retried.ref,
      title: 'Property tax',
      detail: pkr(retried.paid),
      outcome: 'Settled · marked on retry',
      tone: 'ok',
      started: '15:52:03',
      events: [
        ...intake(retried, [2, 7, 8, 10]),
        ...authorised(retried, [12, 15, 17]),
        acsp(retried, 1630),
        queued(retried, 1634, 1),
        calling(retried, 1639, 1),
        {
          at: 5641,
          node: 'rest',
          tone: 'fail',
          title: 'Timed out',
          text: 'The biller did not answer within 4 s. The payment stays DONE; only the bill notification is PENDING.',
          data: { timeoutMs: 4000, attempt: 1, payment: 'DONE', notification: 'PENDING' },
        },
        queued(retried, 5645, 2),
        calling(retried, 7650, 2),
        ...marked(retried, [8032, 8037], true),
      ],
    },
    {
      n: 4,
      ref: awaiting.ref,
      title: 'Water bill',
      detail: pkr(awaiting.paid),
      outcome: 'Awaiting ACSP',
      tone: 'wait',
      started: '15:57:40',
      events: [
        ...intake(awaiting, [2, 6, 7, 9]),
        ...authorised(awaiting, [11, 13, 15]),
        {
          at: 16,
          node: 'await',
          tone: 'wait',
          title: 'Waiting',
          text: 'AUTH is with Raast and no ACSP has come back yet. The payment stays pending; a new attempt must wait until its status is known.',
          data: { expects: 'pacs.002 ACSP', paymentReference: awaiting.ref, inquiry: 'AWAITING_ACSP', payment: 'pending' },
        },
      ],
    },
  ],
};
