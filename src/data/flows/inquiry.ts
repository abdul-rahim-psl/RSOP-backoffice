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
  version: 'v1.0',
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
          credentials: 'vault://rsop/gateway/credentials',
        },
      },
      incoming: {
        about: 'Receives the inquiry: which institution, and which bill reference. Nothing is looked up yet.',
        params: {
          api: { title: 'MPG Incoming Bill # Swagger', version: '1.0.0', description: 'MPG Incoming MOCK for Bill Inquiry' },
          logging: { config: 'file:logback.xml' },
          app: { 'service-id': '10', api: { logging: { enable: true, 'url-patterns': '/api/*' } } },
          url: 'http://10.0.150.35:7033/mpg/queueforwarding/',
          billInquiry: 'fbr-bill-inquiry-mock',
          billPayment: 'fbr-bill-payment-mock',
          mockResponse: false,
          allowedIps: '*',
        },
      },
      wsi: {
        template: 'templates/bill-inquiry.yml',
        about:
          'The web-service interface. Its YAML template checks the request and maps it into RSOP’s own message. On the way back it stores the biller’s answer, then replies.',
        params: {
          debug: false,
          logging: { config: 'file:logback.xml' },
          server: { port: 7033 },
          service: { endpoint: 'mpg' },
          queue: {
            config: {
              host: 'localhost',
              port: 5672,
              heartbeat: 10,
              username: 'ENC(••••••)',
              password: 'ENC(••••••)',
              'retry.interval': 10,
              rpc: { queue: 'MPG-WS-IN', timeout: 300000 },
            },
          },
        },
      },
      queue: {
        about:
          'Hands the request to the outbound side through RabbitMQ, so a slow biller never blocks incoming traffic. The answer comes back on a reply queue.',
        params: {
          debug: false,
          logging: { config: 'file:logback.xml' },
          server: { port: 9444 },
          queue: {
            config: {
              SSL: false,
              host: 'localhost',
              port: 5672,
              heartbeat: 10,
              username: 'ENC(••••••)',
              password: 'ENC(••••••)',
              'retry.interval': 5,
              'prefetch.count': 1,
              'auto.ack': false,
            },
            queue: {
              'response-consumers': 200,
              'request-consumers': 200,
              request: 'MPG-WS-IN',
              response: 'MPG-WS-OUT',
            },
            forwarders: {
              from: 'MPG-WS-H-OUT,MPG-WS-H-OUT-INQ,MPG-WS-H-OUT-HOST,MPG-WS-H-OUT-MX,MPG-WS-H-OUT-CAS,MPG-WS-H-OUT-PAYMENT,MPG-WS-H-OUT-RTP-INQ',
              to: 'MPG-WS-OUT',
              'prefetch.count': 1,
              'from-consumers': 100,
              'auto.ack': true,
            },
            request: {
              forwarders: {
                from: 'MPG-WS-IN',
                to: 'MPG-WS-H-IN,MPG-WS-H-IN-INQ,MPG-WS-H-IN-HOST,MPG-WS-H-IN-MX,MPG-WS-H-IN-CAS,MPG-WS-H-IN-PAYMENT',
              },
            },
          },
          cache: {
            key: { expiry: '60 # Seconds' },
            name: 'requestCache',
            expiry: '55000 # Milliseconds',
          },
        },
      },
      rest: {
        about:
          'Calls the biller’s web service. It converts RSOP’s internal headers into the ones the biller expects and adds the biller’s credentials.',
        params: {
          logging: { config: 'file:logback.xml' },
          server: { port: 8092 },
          hooks: {
            file: 'hooks-0.0.2-v17.jar',
            after: {
              'parsing-parameters': 'com.paysyslabs.bootstrap.rest.hook.impl.AfterParsingParametersHookImpl',
              response: 'com.paysyslabs.bootstrap.rest.hook.impl.AfterResponseHookImpl',
            },
          },
          'management.endpoints.web.exposure.include': '*',
          core: { userid: 'TokenUser', password: '••••••' },
          'pinblock-key': '••••••',
          service: {
            token: { expiry: { 'expire-token-before': 2000 } },
            client: { unsafe: true },
            timeout: { connect: 15000, read: 65000 },
            concurrency: { maxtotal: 1100, maxperroute: 1000 },
            queue: { workers: 10, request: 'MPG-WS-H-IN-HOST', result: 'MPG-WS-H-OUT-HOST', saf: 'SAF-HTTP-CACHED' },
          },
          queue: {
            config: {
              SSL: false,
              host: 'localhost',
              port: 5672,
              char_set: 'UTF-8',
              automatic_recovery: true,
              username: '••••••',
              password: '••••••',
              heartbeat: 10,
              'retry.interval': 10,
              'prefetch.count': 1,
            },
          },
        },
      },
      biller: {
        about: 'The government biller’s Bill Inquiry web service. It finds the bill and generates the unique inquiry ID.',
        params: {
          service: 'Bill Inquiry web service',
          endpoint: 'https://biller.example/ws/bill-inquiry',
          returns: ['billDetails', 'amount', 'currency', 'inquiryId # generated by the biller'],
          schema: 'bill-inquiry.v1.json',
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
          'RSOP keeps the biller’s inquiry ID with the exact amount, so the later payment can be checked against it.',
        params: {
          table: 'inquiries',
          key: 'inquiryId',
          fields: ['inquiryId', 'amountMinor', 'currency', 'institution', 'billReference', 'status'],
          statuses: ['OPEN', 'AWAITING_ACSP', 'DONE'],
          expiry: '30m',
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
