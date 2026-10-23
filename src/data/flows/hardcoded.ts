// The flows RSOP's API does not serve yet, built from the chains in talha-bhai-api.ts exactly as the API's flows are.
import { isRound, mainLine, type Flow, type FlowEdge, type TxnEvent } from '../../lib/flow.ts';
import type { Yaml } from '../../lib/yaml.ts';
import { buildFlow, type FlowSpec, type LaneSpec, type StepDetail } from '../api/build.ts';
import type { Source } from '../api/endpoints.ts';
import { TALHA_BHAI_API } from '../api/talha-bhai-api.ts';
import { inquiryFlow } from './inquiry.ts';
import { paymentFlow } from './payment.ts';

const source: Source = {
  baseUrl: 'src/data/api/talha-bhai-api.ts',
  fetchedAt: '2026-10-23T13:00:00.000Z',
  responses: { 'talha-bhai-api': TALHA_BHAI_API },
  live: false,
  static: true,
};

/** What each service does, whatever flow it is in. */
const about: Record<string, (inMessage?: string) => string> = {
  raast: () => 'Raast, the State Bank of Pakistan’s instant payment system. It exchanges this flow’s ISO 20022 messages with RSOP.',
  'raast-api-gateway': () => 'The Raast API Gateway, through which RSOP and Raast exchange API calls.',
  channel: () => 'The bank’s customer channel, such as its mobile or internet banking app. The customer starts the request here and sees the result here.',
  'cas-service': () => 'Takes the channel’s request into RSOP and returns the result to the channel.',
  'mpg-incoming-title-fetch': () => 'Receives the title fetch from the Raast API Gateway: which account’s title is being asked for.',
  'notification-service': (m) => `Picks up the ${m ?? 'message'} from Raast and publishes it for the next service.`,
  'notification-broker-service': () => 'Passes notifications on, so a burst of Raast messages queues instead of being dropped.',
  'receiving-service': () => 'Receives the notification and drives the flow’s next steps.',
  'web-service-interface': () => 'The web-service interface. It checks the request and maps it into RSOP’s own message, then maps the answer back.',
  'queue-processor': () =>
    'Hands the request to the outbound side through RabbitMQ, so a slow system never blocks incoming traffic. The answer comes back on a reply queue.',
  'rest-handler': () => 'Calls the next system’s web service, converting RSOP’s internal headers into the ones it expects.',
  'saf-dispatcher': () => 'Store-and-forward: keeps the task until it is delivered, so nothing is lost while the next system is down.',
  'saf-consumer': () => 'Delivers the stored task to the next system, retrying until it succeeds.',
  cbs: () => 'The bank’s core banking system, which holds the customer’s account.',
  'acquiring-system': () => 'The merchant acquiring system, which settles the payment to the merchant.',
  CAS: () => 'CAS, the directory that resolves a Raast ID to the account behind it.',
};

/** Configs are per service, so these reuse what the API's flows show; any other service shows no parameters. */
const SHARED = ['web-service-interface', 'queue-processor', 'rest-handler', 'notification-service'];
const known = [...inquiryFlow.nodes, ...paymentFlow.nodes];
const paramsOf = (service: string): Yaml => (SHARED.includes(service) ? (known.find((n) => n.service === service)?.params ?? null) : null);

interface LaneDef extends LaneSpec {
  /** Under Start: who begins this chain. */
  from: string;
  /** Under End, when the chain stops to wait. */
  until?: string;
}

interface FlowDef {
  id: string;
  name: string;
  nav: string;
  summary: string;
  lanes: LaneDef[];
  txn: { ref: string; title: string; detail: string; outcome: string; started: string };
}

/** Every step's description, from the services it names; Start and End describe the lane. */
function details(built: ReturnType<typeof buildFlow>, def: FlowDef): Record<string, StepDetail> {
  const out: Record<string, StepDetail> = {};
  for (const n of built.nodes) {
    const lane = def.lanes[n.lane];
    if (n.kind === 'start') out[n.id] = { sub: lane.from, about: `Where this chain begins: ${lane.note.charAt(0).toLowerCase()}${lane.note.slice(1)}.`, params: null };
    else if (n.kind === 'end') out[n.id] = { ...(lane.until && { sub: lane.until }), about: 'Where this chain ends.', params: null };
    else {
      const inMessage = built.edges.find((e) => e.to === n.id && e.message)?.message?.text;
      out[n.id] = { about: about[n.service!]?.(inMessage) ?? `${n.label}.`, params: paramsOf(n.service!) };
    }
  }
  return out;
}

/** Each lane's last step hands over to the next lane's first, so one transaction runs through every lane. */
function handoffs(built: Pick<Flow, 'nodes' | 'edges' | 'lanes'>): FlowEdge[] {
  const steps = built.lanes.map((_, i) => mainLine(built as Flow, i).filter((id) => !isRound(built.nodes.find((n) => n.id === id)!)));
  return steps.slice(1).map((next, i) => ({ from: steps[i].at(-1)!, to: next[0], kind: 'handoff' as const }));
}

/** A successful run that visits every step of every lane in order. */
function sampleRun(flow: Pick<Flow, 'nodes' | 'edges' | 'lanes' | 'name'>): TxnEvent[] {
  const label = new Map(flow.nodes.map((n) => [n.id, n.label]));
  const events: TxnEvent[] = [];
  let at = 0;
  flow.lanes.forEach((_, li) => {
    const line = mainLine(flow as Flow, li).filter((id) => !isRound(flow.nodes.find((n) => n.id === id)!));
    if (li > 0) at += 1200;
    line.forEach((id, i) => {
      const prev = i > 0 ? line[i - 1] : null;
      const m = prev && flow.edges.find((e) => e.from === prev && e.to === id)?.message;
      const name = label.get(id)!;
      const last = li === flow.lanes.length - 1 && i === line.length - 1;
      const [title, text] = events.length === 0
        ? ['Started', `${name} starts the flow.`]
        : last
          ? ['Completed', `${name} completes the flow.`]
          : m
            ? [m.text, `${label.get(prev!)} → ${name}: ${m.verb} ${m.text}.`]
            : ['Passed on', `${name} handles it and passes it on.`];
      events.push({ at, node: id, tone: 'ok', title, text });
      at += 3 + ((i * 7) % 5);
    });
  });
  return events;
}

function make(def: FlowDef): Flow {
  const lanes = def.lanes.map(({ key, prefix, title, note }) => ({ key, prefix, title, note }));
  const first = buildFlow(source, { lanes, details: {} });
  const spec: FlowSpec = { lanes, details: details(first, def), docEdges: handoffs(first) };
  const built = buildFlow(source, spec);
  const flow = { id: def.id, name: def.name, nav: def.nav, summary: def.summary, version: 'v1.0', ...built };
  return { ...flow, txns: [{ n: 1, ...def.txn, tone: 'ok', events: sampleRun(flow) }] };
}

const DEFS: FlowDef[] = [
  {
    id: 'p2p-incoming',
    name: 'P2P incoming',
    nav: 'P2P incoming',
    summary: 'A customer of another bank sends money to this bank’s customer; RSOP checks the account, answers Raast, then credits it on ACSP.',
    lanes: [
      { key: 'p2pIncoming1', prefix: 'auth-', title: '1 · pacs.008 → AUTH', note: 'Raast forwards the payment; RSOP checks the account with core banking and answers', from: 'Payer bank', until: 'Awaiting ACSP' },
      { key: 'p2pIncoming2', prefix: 'acsp-', title: '2 · ACSP → credit', note: 'Raast settles; RSOP credits the account in core banking', from: 'Raast settles' },
    ],
    txn: { ref: 'P2P-IN-20261023-000214', title: 'P2P', detail: 'PKR 2,500.00', outcome: 'Settled · credited', started: '15:41:06' },
  },
  {
    id: 'p2p-outgoing',
    name: 'P2P outgoing',
    nav: 'P2P outgoing',
    summary: 'A customer sends money from the bank’s channel; RSOP sends the pacs.008 to Raast, then tells the channel on ACSP.',
    lanes: [
      { key: 'p2pOutgoing1', prefix: 'send-', title: '1 · Channel → pacs.008', note: 'The customer sends money; RSOP sends the payment to Raast', from: 'Customer', until: 'Awaiting ACSP' },
      { key: 'p2pOutgoing2', prefix: 'acsp-', title: '2 · ACSP → channel', note: 'Raast settles; RSOP tells the channel', from: 'Raast settles' },
    ],
    txn: { ref: 'P2P-OUT-20261023-000377', title: 'P2P', detail: 'PKR 1,200.00', outcome: 'Settled · customer told', started: '15:42:18' },
  },
  {
    id: 'p2m-incoming',
    name: 'P2M incoming',
    nav: 'P2M incoming',
    summary: 'A customer of another bank pays this bank’s merchant; RSOP checks with the acquiring system, answers Raast, then settles on ACSP.',
    lanes: [
      { key: 'p2mIncoming1', prefix: 'auth-', title: '1 · pacs.008 → AUTH', note: 'Raast forwards the payment; RSOP checks it with the acquiring system and answers', from: 'Payer bank', until: 'Awaiting ACSP' },
      { key: 'p2mIncoming2', prefix: 'acsp-', title: '2 · ACSP → settlement', note: 'Raast settles; RSOP settles the merchant through the acquiring system', from: 'Raast settles' },
    ],
    txn: { ref: 'P2M-IN-20261023-000091', title: 'P2M', detail: 'PKR 3,450.00', outcome: 'Settled · merchant credited', started: '15:43:40' },
  },
  {
    id: 'p2m-outgoing',
    name: 'P2M outgoing',
    nav: 'P2M outgoing',
    summary: 'A customer pays a merchant from the bank’s channel; RSOP sends the pacs.008 to Raast, then tells the channel on ACSP.',
    lanes: [
      { key: 'p2mOutgoing1', prefix: 'send-', title: '1 · Channel → pacs.008', note: 'The customer pays the merchant; RSOP sends the payment to Raast', from: 'Customer', until: 'Awaiting ACSP' },
      { key: 'p2mOutgoing2', prefix: 'acsp-', title: '2 · ACSP → channel', note: 'Raast settles; RSOP tells the channel', from: 'Raast settles' },
    ],
    txn: { ref: 'P2M-OUT-20261023-000158', title: 'P2M', detail: 'PKR 860.00', outcome: 'Settled · customer told', started: '15:44:05' },
  },
  {
    id: 'title-fetch-incoming',
    name: 'Incoming title fetch',
    nav: 'Incoming title fetch',
    summary: 'Another bank asks for an account title before it pays; RSOP reads it from core banking and answers.',
    lanes: [{ key: 'incomingTitleFetch', title: 'Incoming title fetch', note: 'Another bank asks for an account title', from: 'Bank request' }],
    txn: { ref: 'TF-IN-20261023-000532', title: 'Title fetch', detail: 'PK36 •••• 0021', outcome: 'Title returned', started: '15:45:12' },
  },
  {
    id: 'title-fetch-outgoing',
    name: 'Outgoing title fetch',
    nav: 'Outgoing title fetch',
    summary: 'The channel asks for an account title at another bank; RSOP asks through the Raast API Gateway.',
    lanes: [{ key: 'outgoingTitleFetch', title: 'Outgoing title fetch', note: 'The customer asks for an account title at another bank', from: 'Customer' }],
    txn: { ref: 'TF-OUT-20261023-000610', title: 'Title fetch', detail: 'PK58 •••• 4410', outcome: 'Title returned', started: '15:45:48' },
  },
  {
    id: 'raast-id-inquiry',
    name: 'Raast ID inquiry',
    nav: 'Raast ID inquiry',
    summary: 'The channel looks up a Raast ID; RSOP asks CAS for the account behind it.',
    lanes: [{ key: 'raastIDInquiry', title: 'Raast ID inquiry', note: 'The customer looks up a Raast ID', from: 'Customer' }],
    txn: { ref: 'RID-20261023-000733', title: 'Raast ID', detail: '0300 •••• 567', outcome: 'Account found', started: '15:46:20' },
  },
];

/** Built once: nothing about them changes between requests. */
export const hardcodedFlows: Flow[] = DEFS.map(make);
