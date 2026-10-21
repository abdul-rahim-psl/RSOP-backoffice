import type { Flow, TxnEvent } from '../../lib/flow.ts';
import { buildFlow, snapshotSource } from '../api/build.ts';
import type { Source } from '../api/endpoints.ts';
import { banks, bills } from '../sample.ts';

const { propertyTax: pt } = bills;

/** The request leg every inquiry shares, up to the call to the biller. */
function requestLeg(o: { ref: string; code: string; billRef: string; bank: string; institution: string; t: number[] }): TxnEvent[] {
  const [tIn, tWsi, tQueue, tRest] = o.t;
  return [
    {
      at: 0,
      node: 'gateway',
      tone: 'info',
      title: 'Request in',
      text: `The Raast API Gateway forwards ${o.bank}'s bill inquiry to RSOP.`,
      data: { bank: o.bank, institution: o.institution, billReference: o.billRef },
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

/** The reply leg of a successful inquiry: back the way it came, stored on the way, returned unchanged. */
function replyLeg(o: { ref: string; code: string; billRef: string; type: string; amount: number; inquiryId: string; callAt: number; t: number[] }): TxnEvent[] {
  const [tBiller, tRest, tQueue, tWsi, tStore, tOut, tIncoming, tGateway] = o.t;
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
      title: 'Answer mapped',
      text: 'With the answer stored, WSI maps it back into the reply Incoming Bill owes the gateway.',
      data: { template: 'templates/bill-inquiry.yml', out: answer },
    },
    {
      at: tIncoming,
      node: 'incoming',
      tone: 'ok',
      title: 'Replied',
      text: 'Incoming Bill answers the gateway’s request.',
      data: { status: 200, correlationId: o.ref },
    },
    {
      at: tGateway,
      node: 'gateway',
      tone: 'ok',
      title: 'Answered',
      text: `The gateway returns the bill, amount and ${o.inquiryId} to the bank, unchanged.`,
      data: { status: 200, body: answer },
    },
  ];
}

/** The flow drawn from one API answer; the page calls this on every request. */
export const makeInquiryFlow = (source: Source): Flow => ({
  id: 'inquiry',
  name: 'Bill inquiry',
  nav: 'Inquiry',
  summary: 'A bank asks what a bill costs; RSOP asks the biller, keeps the answer and returns it.',
  version: 'v0.1 draft',
  ...buildFlow(source, {
    lanes: [{ key: 'billInquiryFlow', title: 'Bill inquiry', note: 'Gateway in, biller out, the answer back the same way' }],
    labels: { 'rest>biller': 'WS' },
    details: {
      start: {
        sub: 'Bank request',
        about: 'Where the API’s bill-inquiry chain starts: a bank’s request for a bill, on its way to the Raast API Gateway.',
        params: { flow: 'bill-inquiry', version: '0.1', trigger: 'http' },
      },
      gateway: {
        about:
          'The Raast API Gateway passes the bank’s inquiry to RSOP and returns RSOP’s answer to the bank. Only the inquiry goes through it; payments use Raast messaging.',
        params: {
          forwardsTo: { method: 'POST', path: '/rsop/v1/bill-inquiry' },
          returns: 'RSOP’s answer, unchanged',
          timeoutMs: 6000,
          credentials: 'TBC # gateway credentials are not in the doc',
        },
      },
      incoming: {
        about: 'Receives the inquiry: which institution, and which bill reference. Nothing is looked up yet.',
        params: {
          name: 'incoming-bill-inquiry',
          listen: { protocol: 'https', method: 'POST', path: '/rsop/v1/bill-inquiry' },
          accepts: 'application/json',
          required: ['institution', 'billReference'],
          timeoutMs: 5000,
        },
      },
      wsi: {
        template: 'templates/bill-inquiry.yml',
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
      queue: {
        about:
          'Hands the request to the outbound side through RabbitMQ, so a slow biller never blocks incoming traffic. The answer comes back on a reply queue.',
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
      rest: {
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
      biller: {
        about: 'The mock government biller’s Bill Inquiry web service. It finds the bill and generates the unique inquiry ID.',
        params: {
          service: 'Bill Inquiry web service',
          mock: true,
          endpoint: 'https://biller.example/ws/bill-inquiry',
          returns: ['billDetails', 'amount', 'currency', 'inquiryId # generated by the biller'],
          schema: 'TBC # the mock API schemas are open in the doc',
        },
      },
      end: {
        about:
          'Where the API’s chain ends. Every hop up to the biller is a request and its reply, so the answer goes back the way it came, to the gateway.',
        params: { flow: 'bill-inquiry', reply: 'back along the chain to raast-api-gateway' },
      },
    },
    docSteps: [
      {
        id: 'store',
        kind: 'store',
        family: 'store',
        label: 'Inquiry store',
        sub: 'Keeps ID + amount',
        anchor: 'wsi',
        row: -1,
        about:
          'RSOP keeps the biller’s inquiry ID with the exact amount, so the later payment can be checked against it. The doc requires this; the API does not show where, so it hangs off the WSI.',
        params: {
          table: 'inquiries',
          key: 'inquiryId',
          fields: ['inquiryId', 'amountMinor', 'currency', 'institution', 'billReference', 'status'],
          statuses: ['OPEN', 'AWAITING_ACSP', 'DONE'],
          expiry: 'TBC # the inquiry expiry policy is open in the doc',
        },
      },
    ],
    docEdges: [{ from: 'wsi', to: 'store', kind: 'link' }],
  }),
  txns: [
    {
      n: 1,
      ref: 'RQ-4471',
      title: 'FBR',
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
          t: [611, 617, 620, 624, 627, 630, 633, 636],
        }),
      ],
    },
  ],
});

export const inquiryFlow = makeInquiryFlow(snapshotSource);
