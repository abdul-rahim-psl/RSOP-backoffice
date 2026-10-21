import type { Flow, TxnEvent } from '../../lib/flow.ts';
import { banks, bills } from '../sample.ts';

const { propertyTax: pt, waterBill: wb, vehicleTax: vt, courtFee: cf } = bills;

/** The request leg every inquiry shares, up to the call to the biller. */
function requestLeg(o: { ref: string; code: string; billRef: string; bank: string; institution: string; t: number[] }): TxnEvent[] {
  const [tIn, tWsi, tQueue, tRest] = o.t;
  return [
    {
      at: 0,
      node: 'start',
      tone: 'info',
      title: 'Request in',
      text: `The Raast API Gateway forwards ${o.bank}'s bill inquiry.`,
      data: { from: 'raast-api-gateway', bank: o.bank, institution: o.institution, billReference: o.billRef },
    },
    {
      at: tIn,
      node: 'incoming',
      tone: 'ok',
      title: 'Accepted',
      text: 'Incoming Bill accepts the request: the institution and bill reference are both there.',
      data: {
        method: 'POST',
        path: '/rsop/v1/bill-inquiry',
        headers: { 'x-request-id': o.ref },
        body: { institution: o.code, billReference: o.billRef },
      },
    },
    {
      at: tWsi,
      node: 'wsi',
      tone: 'ok',
      title: 'Mapped',
      text: 'WSI checks the request against bill-inquiry.yml and maps it into RSOP’s own message.',
      data: {
        template: 'templates/bill-inquiry.yml',
        out: { institutionCode: o.code, billRef: o.billRef, correlationId: o.ref },
      },
    },
    {
      at: tQueue,
      node: 'queue',
      tone: 'ok',
      title: 'Queued',
      text: 'The request goes on rsop.inquiry.requests; the answer will come back on rsop.inquiry.replies.',
      data: { exchange: 'rsop.bills', routingKey: 'inquiry.request', replyTo: 'rsop.inquiry.replies', correlationId: o.ref },
    },
    {
      at: tRest,
      node: 'rest',
      tone: 'ok',
      title: 'Calling biller',
      text: 'REST converts the headers and calls the biller’s Bill Inquiry web service.',
      data: {
        url: 'https://biller.example/ws/bill-inquiry',
        headers: { 'X-Correlation-Id': o.ref, 'X-Biller-Code': o.code, Authorization: 'Bearer ••••••' },
        body: { billRef: o.billRef },
      },
    },
  ];
}

/** The reply leg of a successful inquiry: back through the queue, stored, then returned unchanged. */
function replyLeg(o: { ref: string; code: string; billRef: string; type: string; amount: number; inquiryId: string; callAt: number; t: number[] }): TxnEvent[] {
  const [tBiller, tRest, tQueue, tWsi, tStore, tOut] = o.t;
  const answer = { billDetails: `${o.type} 2026`, amount: o.amount.toFixed(2), currency: 'PKR', inquiryId: o.inquiryId };
  return [
    {
      at: tBiller,
      node: 'biller',
      tone: 'ok',
      title: 'Bill found',
      text: `The biller finds the bill and generates inquiry ID ${o.inquiryId}.`,
      data: answer,
    },
    {
      at: tRest,
      node: 'rest',
      tone: 'ok',
      title: 'Reply in',
      text: 'REST receives the biller’s 200 reply and passes it back.',
      data: { status: 200, durationMs: tRest - o.callAt, correlationId: o.ref },
    },
    {
      at: tQueue,
      node: 'queue',
      tone: 'ok',
      title: 'Reply queued',
      text: 'The answer travels back on rsop.inquiry.replies.',
      data: { queue: 'rsop.inquiry.replies', correlationId: o.ref },
    },
    {
      at: tWsi,
      node: 'wsi',
      tone: 'ok',
      title: 'Reply mapped',
      text: 'WSI maps the biller’s answer back and hands it to the inquiry store first.',
      data: { template: 'templates/bill-inquiry.yml', in: answer },
    },
    {
      at: tStore,
      node: 'store',
      tone: 'ok',
      title: 'Stored OPEN',
      text: `RSOP stores ${o.inquiryId} with the exact amount, status OPEN, before it answers.`,
      data: {
        inquiryId: o.inquiryId,
        amountMinor: Math.round(o.amount * 100),
        currency: 'PKR',
        institution: o.code,
        billReference: o.billRef,
        status: 'OPEN',
      },
    },
    {
      at: tOut,
      node: 'wsi',
      tone: 'ok',
      title: 'Answered',
      text: `WSI returns the bill, amount and ${o.inquiryId} to the gateway, unchanged.`,
      data: { status: 200, body: answer },
    },
  ];
}

export const inquiryFlow: Flow = {
  id: 'inquiry',
  name: 'Bill inquiry',
  nav: 'Inquiry',
  summary: 'A bank asks what a bill costs; RSOP asks the biller, keeps the answer and returns it.',
  version: 'v0.1 draft',
  nodes: [
    {
      id: 'start',
      kind: 'start',
      family: 'raast',
      label: 'Start',
      sub: 'Raast API Gateway',
      origin: 'sketch',
      col: 0,
      row: 0,
      about: 'Where a bill inquiry enters RSOP: a bank’s request, forwarded by the Raast API Gateway.',
      params: { flow: 'bill-inquiry', version: '0.1', trigger: 'http', from: 'raast-api-gateway' },
    },
    {
      id: 'incoming',
      kind: 'inbound',
      family: 'raast',
      label: 'Incoming Bill',
      sub: 'Inquiry request',
      origin: 'sketch',
      col: 1,
      row: 0,
      about: 'Receives the inquiry: which institution, and which bill reference. Nothing is looked up yet.',
      params: {
        name: 'incoming-bill-inquiry',
        listen: { protocol: 'https', method: 'POST', path: '/rsop/v1/bill-inquiry' },
        accepts: 'application/json',
        required: ['institution', 'billReference'],
        timeoutMs: 5000,
      },
    },
    {
      id: 'wsi',
      kind: 'wsi',
      family: 'rsop',
      label: 'WSI',
      sub: 'bill-inquiry.yml',
      template: 'templates/bill-inquiry.yml',
      origin: 'sketch',
      col: 2,
      row: 0,
      about:
        'The web-service interface. Its YAML template checks the request and maps it into RSOP’s own message. On the way back it stores the biller’s answer, then replies.',
      params: {
        name: 'wsi-bill-inquiry',
        template: 'templates/bill-inquiry.yml',
        direction: 'inbound',
        validate: { institution: 'a known institution code', billReference: '6 to 24 letters, digits or dashes' },
        map: { institutionCode: '$.institution', billRef: '$.billReference', correlationId: '$.headers.x-request-id' },
        onReply: { store: 'inquiry-store', status: 'OPEN' },
      },
    },
    {
      id: 'store',
      kind: 'store',
      family: 'store',
      label: 'Inquiry store',
      sub: 'Keeps ID + amount',
      origin: 'doc',
      col: 2,
      row: -1,
      about:
        'RSOP keeps the biller’s inquiry ID with the exact amount, so the later payment can be checked against it. The doc requires this; attaching it to the WSI is a draft choice.',
      params: {
        table: 'inquiries',
        key: 'inquiryId',
        fields: ['inquiryId', 'amountMinor', 'currency', 'institution', 'billReference', 'status'],
        statuses: ['OPEN', 'AWAITING_ACSP', 'DONE'],
        expiry: 'TBC # the inquiry expiry policy is open in the doc',
      },
    },
    {
      id: 'queue',
      kind: 'queue',
      family: 'queue',
      label: 'RabbitMQ',
      sub: 'rsop.inquiry',
      origin: 'sketch',
      col: 3,
      row: 0,
      about:
        'Hands the request to the outbound side through a queue, so a slow biller never blocks incoming traffic. The answer comes back on a reply queue.',
      params: {
        exchange: 'rsop.bills',
        type: 'direct',
        routingKey: 'inquiry.request',
        queue: 'rsop.inquiry.requests',
        replyTo: 'rsop.inquiry.replies',
        durable: true,
        prefetch: 20,
        deadLetter: 'rsop.inquiry.dlq',
      },
    },
    {
      id: 'rest',
      kind: 'rest',
      family: 'outbound',
      label: 'REST',
      sub: 'Header conversion',
      origin: 'sketch',
      col: 4,
      row: 0,
      about:
        'Calls the biller’s web service. It converts RSOP’s internal headers into the ones the biller expects and adds the biller’s credentials.',
      params: {
        name: 'rest-bill-inquiry',
        target: 'biller.billInquiry',
        method: 'POST',
        timeoutMs: 4000,
        retries: 2,
        headers: {
          convert: { 'x-request-id': 'X-Correlation-Id', 'x-institution': 'X-Biller-Code' },
          add: { Authorization: 'Bearer ${BILLER_TOKEN}', 'Content-Type': 'application/json' },
        },
      },
    },
    {
      id: 'biller',
      kind: 'end',
      family: 'biller',
      label: 'Government biller',
      sub: 'Bill Inquiry WS · mock',
      origin: 'sketch',
      col: 5,
      row: 0,
      about: 'The mock government biller’s Bill Inquiry web service. It finds the bill and generates the unique inquiry ID.',
      params: {
        service: 'Bill Inquiry web service',
        mock: true,
        endpoint: 'https://biller.example/ws/bill-inquiry',
        returns: ['billDetails', 'amount', 'currency', 'inquiryId # generated by the biller'],
        schema: 'TBC # the mock API schemas are open in the doc',
      },
    },
  ],
  edges: [
    { from: 'start', to: 'incoming', kind: 'flow' },
    { from: 'incoming', to: 'wsi', kind: 'flow' },
    { from: 'wsi', to: 'queue', kind: 'flow' },
    { from: 'queue', to: 'rest', kind: 'flow' },
    { from: 'rest', to: 'biller', kind: 'flow', label: 'WS' },
    { from: 'wsi', to: 'store', kind: 'link' },
  ],
  txns: [
    {
      n: 1,
      ref: 'RQ-4471',
      title: pt.type,
      detail: pt.ref,
      outcome: 'Answered · OPEN',
      tone: 'ok',
      started: '15:38:20',
      events: [
        ...requestLeg({ ref: 'RQ-4471', code: pt.code, billRef: pt.ref, bank: banks.demo, institution: pt.institution, t: [2, 8, 13, 20] }),
        ...replyLeg({
          ref: 'RQ-4471',
          code: pt.code,
          billRef: pt.ref,
          type: pt.type,
          amount: pt.amount,
          inquiryId: pt.inquiryId,
          callAt: 20,
          t: [611, 617, 620, 624, 627, 630],
        }),
      ],
    },
    {
      n: 2,
      ref: 'RQ-4503',
      title: wb.type,
      detail: wb.ref,
      outcome: 'Answered · OPEN',
      tone: 'ok',
      started: '15:46:05',
      events: [
        ...requestLeg({ ref: 'RQ-4503', code: wb.code, billRef: wb.ref, bank: banks.sample, institution: wb.institution, t: [2, 7, 12, 18] }),
        ...replyLeg({
          ref: 'RQ-4503',
          code: wb.code,
          billRef: wb.ref,
          type: wb.type,
          amount: wb.amount,
          inquiryId: wb.inquiryId,
          callAt: 18,
          t: [398, 403, 406, 410, 412, 415],
        }),
      ],
    },
    {
      n: 3,
      ref: 'RQ-4529',
      title: vt.type,
      detail: vt.ref,
      outcome: 'Bill not found',
      tone: 'fail',
      started: '15:41:30',
      events: [
        ...requestLeg({ ref: 'RQ-4529', code: vt.code, billRef: vt.ref, bank: banks.demo, institution: vt.institution, t: [2, 7, 12, 19] }),
        {
          at: 402,
          node: 'biller',
          tone: 'fail',
          title: 'No such bill',
          text: 'The biller has no bill with this reference, so no inquiry ID is generated.',
          data: { status: 404, error: 'bill not found', billRef: vt.ref },
        },
        {
          at: 408,
          node: 'rest',
          tone: 'fail',
          title: 'Reply in',
          text: 'REST receives the biller’s 404 and passes it back. A 404 is an answer, so there is no retry.',
          data: { status: 404, retried: false, correlationId: 'RQ-4529' },
        },
        {
          at: 411,
          node: 'queue',
          tone: 'info',
          title: 'Reply queued',
          text: 'The error travels back on rsop.inquiry.replies.',
          data: { queue: 'rsop.inquiry.replies', correlationId: 'RQ-4529' },
        },
        {
          at: 415,
          node: 'wsi',
          tone: 'fail',
          title: 'Error returned',
          text: 'WSI tells the gateway the bill was not found. Nothing is stored. (Draft behaviour: the doc only covers a found bill.)',
          data: { status: 404, body: { error: 'BILL_NOT_FOUND # error format is a draft placeholder' }, stored: false },
        },
      ],
    },
    {
      n: 4,
      ref: 'RQ-4566',
      title: cf.type,
      detail: cf.ref,
      outcome: 'Waiting on the biller',
      tone: 'wait',
      started: '15:58:12',
      events: [
        ...requestLeg({ ref: 'RQ-4566', code: cf.code, billRef: cf.ref, bank: banks.sample, institution: cf.institution, t: [2, 8, 14, 21] }).map(
          (ev): TxnEvent =>
            ev.node === 'rest'
              ? {
                  ...ev,
                  tone: 'wait',
                  title: 'Waiting on biller',
                  text: 'REST called the Bill Inquiry web service 2.4 s ago and is still waiting; it gives up at 4 s and retries.',
                }
              : ev,
        ),
      ],
    },
  ],
};
