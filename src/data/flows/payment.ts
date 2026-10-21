import type { Flow, Tone, TxnEvent } from '../../lib/flow.ts';
import { pkr } from '../../lib/format.ts';
import { buildFlow } from '../api/build.ts';
import { banks, bills, paymentRefs } from '../sample.ts';

const { propertyTax: pt } = bills;

interface Pay {
  ref: string;
  bank: string;
  inquiryId: string;
  billAmount: number;
  paid: number;
  code: string;
}

const minor = (rupees: number) => Math.round(rupees * 100);
const MISMATCH = 'Amount does not match';

/** Part 1 up to the decision: the pacs.008 comes in through the notification chain and the inquiry is found. */
function intake(p: Pay, t: number[]): TxnEvent[] {
  const [tNotify, tBroker, tReceive, tStore] = t;
  return [
    {
      at: 0,
      node: 'auth-raast',
      tone: 'info',
      title: 'pacs.008 in',
      text: `Raast forwards ${p.bank}'s payment for ${p.inquiryId}: ${pkr(p.paid)}.`,
      data: { message: 'pacs.008', paymentReference: p.ref, inquiryId: p.inquiryId, amount: pkr(p.paid), payerBank: p.bank },
    },
    {
      at: tNotify,
      node: 'auth-notify',
      tone: 'ok',
      title: 'Fetched',
      text: 'The notification service picks up the pacs.008 from Raast.',
      data: { request: 'GET pacs.008', paymentReference: p.ref },
    },
    {
      at: tBroker,
      node: 'auth-broker',
      tone: 'ok',
      title: 'Published',
      text: 'The broker passes the notification on to the receiving service.',
      data: { topic: 'rsop.payments.incoming', paymentReference: p.ref },
    },
    {
      at: tReceive,
      node: 'auth-receive',
      tone: 'ok',
      title: 'Received',
      text: `The payment reference has not been seen before, so this is not a repeat. The receiving service looks up ${p.inquiryId}.`,
      data: { message: 'pacs.008', paymentReference: p.ref, duplicate: false, lookup: p.inquiryId },
    },
    {
      at: tStore,
      node: 'store',
      tone: 'ok',
      title: 'Inquiry found',
      text: `The store has ${p.inquiryId} for ${pkr(p.billAmount)}, status OPEN.`,
      data: { inquiryId: p.inquiryId, amountMinor: minor(p.billAmount), status: 'OPEN' },
    },
  ];
}

const valid = (p: Pay, at: number): TxnEvent => ({
  at,
  node: 'auth-receive',
  tone: 'ok',
  title: 'Valid · reserved',
  text: `The ID is known, the amount matches exactly and the inquiry is OPEN. ${p.inquiryId} is reserved for this payment, so no second payment can use it.`,
  data: {
    inquiryExists: true,
    expectedMinor: minor(p.billAmount),
    receivedMinor: minor(p.paid),
    inquiry: 'OPEN → AWAITING_ACSP',
    reservedFor: p.ref,
    reply: 'pacs.002 AUTH',
  },
});

/** Part 1's answer: the pacs.002 leaves through WSI, the queue and REST, back to Raast. */
function answer(p: Pay, status: 'AUTH' | 'NAUT', t: number[]): TxnEvent[] {
  const [tWsi, tQueue, tRest, tRaast] = t;
  const tone: Tone = status === 'AUTH' ? 'ok' : 'info';
  const naut = status === 'NAUT' && { reason: MISMATCH, reasonCode: 'TBC # the reason mapping is open in the doc' };
  return [
    {
      at: tWsi,
      node: 'auth-wsi',
      tone,
      title: `${status} mapped`,
      text: `WSI maps the decision into a pacs.002 ${status} with bill-payment.yml.`,
      data: { template: 'templates/bill-payment.yml', out: { message: 'pacs.002', status, paymentReference: p.ref, ...naut } },
    },
    {
      at: tQueue,
      node: 'auth-queue',
      tone,
      title: 'Queued',
      text: `The pacs.002 ${status} goes on rsop.raast.outbound for REST to send.`,
      data: { queue: 'rsop.raast.outbound', paymentReference: p.ref },
    },
    {
      at: tRest,
      node: 'auth-rest',
      tone,
      title: `Posting ${status}`,
      text: `REST converts the headers and posts the pacs.002 ${status} to Raast.`,
      data: {
        request: `POST pacs.002 ${status}`,
        url: 'https://raast.example/messages/pacs.002',
        headers: { 'X-Correlation-Id': p.ref, Authorization: 'Bearer ••••••' },
      },
    },
    status === 'AUTH'
      ? {
          at: tRaast,
          node: 'auth-raast-2',
          tone: 'ok',
          title: 'AUTH in',
          text: 'Raast has RSOP’s go-ahead and settles the payment.',
          data: { message: 'pacs.002', status: 'AUTH', paymentReference: p.ref, next: 'settlement' },
        }
      : {
          at: tRaast,
          node: 'auth-raast-2',
          tone: 'fail',
          title: 'NAUT in',
          text: `Raast has RSOP’s refusal, “${MISMATCH}”, and rejects the payment.`,
          data: { message: 'pacs.002', status: 'NAUT', paymentReference: p.ref, next: 'rejection' },
        },
  ];
}

/** Part 2's intake: Raast's pacs.002 comes in through the same notification chain. */
function notice(p: Pay, status: 'ACSP' | 'RJCT', t: number[]): TxnEvent[] {
  const [tRaast, tNotify, tBroker, tReceive] = t;
  const acsp = status === 'ACSP';
  const passing: Tone = acsp ? 'ok' : 'info';
  return [
    acsp
      ? {
          at: tRaast,
          node: 'acsp-raast',
          tone: 'info',
          title: 'Settled',
          text: 'Raast has settled and sends pacs.002 ACSP to the payer bank and to RSOP.',
          data: { message: 'pacs.002', status: 'ACSP', paymentReference: p.ref, to: ['payer bank', 'RSOP'] },
        }
      : {
          at: tRaast,
          node: 'acsp-raast',
          tone: 'fail',
          title: 'Rejected',
          text: 'Raast rejects the transaction and sends pacs.002 RJCT to the payer bank and to RSOP.',
          data: { message: 'pacs.002', status: 'RJCT', paymentReference: p.ref, to: ['payer bank', 'RSOP'] },
        },
    {
      at: tNotify,
      node: 'acsp-notify',
      tone: passing,
      title: 'Fetched',
      text: `The notification service picks up the pacs.002 ${status}.`,
      data: { request: `GET pacs.002 ${status}`, paymentReference: p.ref },
    },
    {
      at: tBroker,
      node: 'acsp-broker',
      tone: passing,
      title: 'Published',
      text: 'The broker passes it on to the receiving service.',
      data: { topic: 'rsop.payments.status', paymentReference: p.ref },
    },
    acsp
      ? {
          at: tReceive,
          node: 'acsp-receive',
          tone: 'ok',
          title: 'ACSP in',
          text: 'The receiving service matches the ACSP to the payment, marks it DONE and hands a bill-marking task to the SAF dispatcher.',
          data: { message: 'pacs.002', status: 'ACSP', paymentReference: p.ref, payment: 'DONE', inquiry: 'AWAITING_ACSP → DONE', task: 'bill-marking' },
        }
      : {
          at: tReceive,
          node: 'acsp-receive',
          tone: 'fail',
          title: 'RJCT in',
          text: 'The receiving service matches the RJCT to the payment attempt. No bill-marking task is created.',
          data: { message: 'pacs.002', status: 'RJCT', paymentReference: p.ref, task: 'none' },
        },
  ];
}

const dispatched = (p: Pay, at: number, attempt: number): TxnEvent => ({
  at,
  node: 'acsp-saf-dispatch',
  tone: attempt === 1 ? 'ok' : 'wait',
  title: attempt === 1 ? 'Task stored' : 'Retry scheduled',
  text:
    attempt === 1
      ? 'The SAF dispatcher stores the bill-marking task durably, so it survives a restart, and dispatches it.'
      : `The dispatcher still holds the task and dispatches attempt ${attempt}, with the same payment reference.`,
  data: { task: 'bill-marking', attempt, idempotencyKey: p.ref, payment: 'DONE' },
});

const calling = (p: Pay, at: number, attempt: number): TxnEvent => ({
  at,
  node: 'acsp-saf-consume',
  tone: 'ok',
  title: attempt === 1 ? 'Calling biller' : 'Calling again',
  text: 'The SAF consumer converts the headers and calls Bill Marking, keyed by the payment reference.',
  data: {
    url: 'https://biller.example/ws/bill-marking',
    attempt,
    headers: { 'X-Correlation-Id': p.ref, 'Idempotency-Key': p.ref, Authorization: 'Bearer ••••••' },
    body: { inquiryId: p.inquiryId, amount: p.paid.toFixed(2), paymentReference: p.ref },
  },
});

function marked(p: Pay, t: number[], retried: boolean): TxnEvent[] {
  const [tBiller, tNotified, tDone] = t;
  return [
    {
      at: tBiller,
      node: 'acsp-biller',
      tone: 'ok',
      title: 'Bill marked',
      text: retried
        ? 'The biller marks the bill paid. The same payment reference means a repeat could never mark it twice.'
        : 'The biller marks the bill paid and confirms.',
      data: { status: 200, marked: true, paymentReference: p.ref },
    },
    {
      at: tNotified,
      node: 'acsp-saf-consume',
      tone: 'ok',
      title: 'Notified',
      text: retried ? 'RSOP records the bill notification as COMPLETE, one retry later.' : 'RSOP records the bill notification as COMPLETE.',
      data: { payment: 'DONE', notification: 'COMPLETE' },
    },
    {
      at: tDone,
      node: 'acsp-saf-dispatch',
      tone: 'ok',
      title: 'Task closed',
      text: 'The dispatcher closes the task; nothing is left to forward.',
      data: { task: 'bill-marking', status: 'COMPLETE', payment: 'DONE' },
    },
  ];
}

const first: Pay = { ref: paymentRefs.first, bank: banks.demo, inquiryId: pt.inquiryId, billAmount: pt.amount, paid: pt.amount, code: pt.code };

const notifyParams = (message: string, topic: string) => ({
  fetch: { method: 'GET', message, from: 'raast' },
  publishTo: 'notification-broker-service',
  topic,
  timeoutMs: 3000,
});

const brokerParams = (topic: string) => ({ topic, durable: true, consumers: ['receiving-service'], deadLetter: `${topic}.dlq` });

export const paymentFlow: Flow = {
  id: 'payment',
  name: 'Bill payment',
  nav: 'Payment',
  summary: 'A bank pays against an inquiry; RSOP checks it, Raast settles it, then RSOP tells the biller.',
  version: 'v0.1 draft',
  ...buildFlow({
    lanes: [
      { key: 'billPaymentFlow1', prefix: 'auth-', title: '1 · pacs.008 → AUTH', note: 'Raast forwards the payment; RSOP checks it and answers' },
      { key: 'billPaymentFlow2', prefix: 'acsp-', title: '2 · ACSP → bill marking', note: 'Raast settles; RSOP marks the bill through store-and-forward' },
    ],
    labels: { 'acsp-saf-consume>acsp-biller': 'WS' },
    details: {
      'auth-start': {
        sub: 'Payer bank',
        about: 'Where the API’s first payment chain starts: the payer bank’s pacs.008, sent over Raast messaging.',
        params: { flow: 'bill-payment', part: 1, version: '0.1', trigger: 'raast-message', message: 'pacs.008' },
      },
      'auth-raast': {
        about: 'Raast forwards the payer bank’s pacs.008 to RSOP, with the inquiry ID, the amount and the payment reference.',
        params: {
          message: 'pacs.008',
          channel: 'raast-messaging',
          carries: { inquiryId: 'TBC # which pacs.008 element carries it is open in the doc', amount: 'settlement amount', paymentReference: 'the payment’s own reference' },
        },
      },
      'auth-notify': {
        about: 'Picks up the pacs.008 from Raast and publishes it for the receiving service. The API writes this hop as “GET PACS008”.',
        params: notifyParams('pacs.008', 'rsop.payments.incoming'),
      },
      'auth-broker': {
        about: 'Passes notifications on to the receiving service, so a burst of Raast messages queues instead of being dropped.',
        params: brokerParams('rsop.payments.incoming'),
      },
      'auth-receive': {
        about:
          'Receives the payment and checks it against the stored inquiry: the ID exists, the amount matches exactly and the inquiry is still OPEN. Valid means AUTH, anything else NAUT; both go out through WSI. A repeated pacs.008 is handled once.',
        params: {
          idempotencyKey: 'paymentReference',
          duplicates: 'ignore # a repeated pacs.008 is handled once',
          checks: ['inquiry ID exists', 'amount matches exactly, in minor units', 'inquiry is OPEN'],
          onValid: { reserve: 'OPEN → AWAITING_ACSP', reply: 'pacs.002 AUTH' },
          onInvalid: { reply: 'pacs.002 NAUT', reasons: ['Unknown inquiry', MISMATCH, 'Inquiry not eligible'] },
          atomic: true,
        },
      },
      'auth-wsi': {
        template: 'templates/bill-payment.yml',
        about: 'The web-service interface. Its YAML template maps the receiving service’s decision into the pacs.002 for Raast: AUTH, or NAUT with a reason.',
        params: {
          name: 'wsi-bill-payment',
          template: 'templates/bill-payment.yml',
          direction: 'outbound',
          map: {
            status: 'AUTH or NAUT',
            paymentReference: 'from the pacs.008',
            reason: 'on NAUT only',
            reasonCode: 'TBC # the rejection reason mapping is open in the doc',
          },
        },
      },
      'auth-queue': {
        about: 'Queues the pacs.002 for sending, so a slow Raast endpoint never holds up the checks.',
        params: {
          exchange: 'rsop.raast',
          type: 'direct',
          routingKey: 'pacs002.out',
          queue: 'rsop.raast.outbound',
          durable: true,
          deadLetter: 'rsop.raast.dlq',
        },
      },
      'auth-rest': {
        about: 'Posts the pacs.002 to Raast. It converts RSOP’s internal headers into the ones Raast expects. The API writes the message as “Post PACS002 AUTH”.',
        params: {
          name: 'rest-pacs002',
          target: 'raast.pacs002',
          method: 'POST',
          timeoutMs: 4000,
          headers: {
            convert: { 'x-request-id': 'X-Correlation-Id' },
            add: { Authorization: 'Bearer ${RAAST_TOKEN}', 'Content-Type': 'application/xml' },
          },
        },
      },
      'auth-raast-2': {
        about: 'Raast receives RSOP’s answer. After AUTH it settles the payment and sends pacs.002 ACSP, which starts part 2; after NAUT it rejects the payment and sends RJCT.',
        params: {
          receives: 'pacs.002',
          onAuth: 'settle, then pacs.002 ACSP to both parties',
          onNaut: 'reject, then pacs.002 RJCT to both parties',
        },
      },
      'auth-end': {
        sub: 'Awaiting ACSP',
        about: 'Where the API’s first payment chain ends: RSOP has answered. An authorised payment stays AWAITING_ACSP until Raast’s pacs.002 starts the second chain.',
        params: { part: 1, status: 'AWAITING_ACSP', next: 'billPaymentFlow2, on pacs.002 from Raast' },
      },
      'acsp-start': {
        sub: 'Raast settles',
        about: 'Where the API’s second payment chain starts: Raast has settled, or rejected, a payment RSOP answered.',
        params: { flow: 'bill-payment', part: 2, version: '0.1', trigger: 'raast-message', message: 'pacs.002' },
      },
      'acsp-raast': {
        about:
          'Raast sends pacs.002 ACSP to the payer bank and to RSOP once it settles; the two can arrive in either order. After a NAUT it sends RJCT instead, which comes the same way.',
        params: {
          message: 'pacs.002',
          statuses: ['ACSP', 'RJCT # after NAUT; the API names ACSP only'],
          to: ['payer bank', 'RSOP'],
          order: 'not guaranteed',
        },
      },
      'acsp-notify': {
        about: 'Picks up Raast’s pacs.002 and publishes it for the receiving service. The API writes this hop as “GET PACS002 ACSP”.',
        params: notifyParams('pacs.002', 'rsop.payments.status'),
      },
      'acsp-broker': {
        about: 'Passes status notifications on to the receiving service.',
        params: brokerParams('rsop.payments.status'),
      },
      'acsp-receive': {
        about:
          'Matches the pacs.002 to the payment by its reference. On ACSP it marks the payment and the inquiry DONE, then hands a bill-marking task to the SAF dispatcher. On RJCT it records the attempt as rejected. A repeated ACSP is handled once.',
        params: {
          correlateBy: 'paymentReference',
          onAcsp: ['payment DONE', 'inquiry AWAITING_ACSP → DONE', 'bill-marking task to saf-dispatcher'],
          onRjct: ['attempt REJECTED', 'no bill marking'],
          duplicates: 'ignore # a repeated ACSP is handled once',
          ifLate: 'keep pending; resolve before any new attempt',
        },
      },
      'acsp-saf-dispatch': {
        about:
          'Store and forward: keeps the bill-marking task durably and dispatches it until the biller confirms. A failure is retried from here without touching the payment, which is already DONE.',
        params: {
          store: 'saf_tasks',
          task: 'bill-marking',
          idempotencyKey: 'paymentReference',
          retry: { attempts: 5, backoff: 'exponential, from 2 s' },
          deadLetter: 'saf.billmarking.dlq',
        },
      },
      'acsp-saf-consume': {
        about:
          'Takes each dispatched task and calls the biller’s Bill Marking web service, with the payment reference as an idempotency key, so a retry can never mark a bill twice.',
        params: {
          name: 'saf-bill-marking',
          target: 'biller.billMarking',
          method: 'POST',
          timeoutMs: 4000,
          headers: {
            convert: { 'x-request-id': 'X-Correlation-Id', 'x-institution': 'X-Biller-Code' },
            add: { Authorization: 'Bearer ${BILLER_TOKEN}', 'Idempotency-Key': '${paymentReference}' },
          },
        },
      },
      'acsp-biller': {
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
      'acsp-end': {
        about: 'Where the API’s second payment chain ends: the bill is marked and the notification is COMPLETE.',
        params: { part: 2, result: 'bill marked; notification COMPLETE' },
      },
    },
    docSteps: [
      {
        id: 'store',
        kind: 'store',
        family: 'store',
        label: 'Inquiry store',
        sub: 'Read + reserve',
        anchor: 'auth-receive',
        row: -1,
        about:
          'The inquiries kept by the Inquiry flow. The receiving service reads one and reserves it in the same step, so two payments can never use the same inquiry.',
        params: {
          table: 'inquiries',
          read: 'inquiryId',
          reserve: 'OPEN → AWAITING_ACSP',
          onAcsp: 'AWAITING_ACSP → DONE',
          lock: 'one payment per inquiry',
        },
      },
      {
        id: 'rejected',
        kind: 'reject',
        family: 'reject',
        label: 'Rejected',
        sub: 'RJCT recorded',
        anchor: 'acsp-receive',
        row: 1,
        shift: 1,
        about:
          'After NAUT, Raast rejects the transaction and sends pacs.002 RJCT. RSOP records the attempt as REJECTED and never calls Bill Marking. The API returns no step for this; the doc requires it.',
        params: {
          expects: 'pacs.002',
          status: 'RJCT',
          marks: 'payment attempt REJECTED',
          inquiry: 'stays OPEN',
          billMarking: 'never # a rejected attempt is not a paid bill',
        },
      },
    ],
    docEdges: [
      { from: 'auth-receive', to: 'store', kind: 'link' },
      { from: 'acsp-receive', to: 'rejected', kind: 'fail', label: 'RJCT' },
      { from: 'auth-raast-2', to: 'acsp-raast', kind: 'handoff' },
    ],
  }),
  txns: [
    {
      n: 1,
      ref: first.ref,
      title: 'FBR',
      detail: pkr(first.paid),
      outcome: 'Settled · bill marked',
      tone: 'ok',
      started: '15:39:02',
      events: [
        ...intake(first, [3, 5, 7, 9]),
        valid(first, 11),
        ...answer(first, 'AUTH', [13, 15, 17, 24]),
        ...notice(first, 'ACSP', [1842, 1845, 1847, 1849]),
        dispatched(first, 1852, 1),
        calling(first, 1855, 1),
        ...marked(first, [2290, 2296, 2299], false),
      ],
    },
  ],
};
