import type { Dir, Message } from './chain.ts';
import type { Yaml } from './yaml.ts';

export type Family = 'raast' | 'rsop' | 'queue' | 'outbound' | 'store' | 'biller' | 'reject';
/** What a step does; it picks the icon. `start` and `end` are the chain's terminals, drawn as rings. */
export type NodeKind =
  | 'start'
  | 'end'
  | 'party'
  | 'inbound'
  | 'notify'
  | 'wsi'
  | 'queue'
  | 'rest'
  | 'saf'
  | 'store'
  | 'biller'
  | 'reject'
  | 'service';
export type Tone = 'ok' | 'fail' | 'wait' | 'info';
/** `handoff` joins one lane to the next for transactions; it is not drawn. */
export type EdgeKind = 'flow' | 'fail' | 'link' | 'handoff';
/** The blocks of KJ's sketch, left to right. */
export type SketchBlock = 'start' | 'incoming' | 'wsi' | 'queue' | 'rest' | 'biller';

/** Where the flow API puts a step. */
export interface StepSource {
  endpoint: string;
  key: string;
  /** 1-based, counting Start and End. */
  position: number;
  of: number;
  /** The step and its neighbours, in the API's own notation. */
  excerpt: string;
}

export interface FlowNode {
  id: string;
  kind: NodeKind;
  family: Family;
  label: string;
  /** One line under the label: the API's service name, or a short note. */
  sub: string;
  /** Whether the flow API returns this step, or it was added from the Open Connect doc. */
  origin: 'api' | 'doc';
  /** The API's name for the step. */
  service?: string;
  sketch?: SketchBlock;
  lane: number;
  col: number;
  /** Within the lane: -1 sits above the main line (the store), 1 below it (the refusal branch). */
  row: -1 | 0 | 1;
  /** The WSI's YAML template, the sketch's "YML T…". */
  template?: string;
  about: string;
  params: Yaml;
  source?: StepSource;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  kind: EdgeKind;
  /** Hops from the API: `both` is a request and its reply. */
  dir?: Dir;
  message?: Message;
}

export interface TxnEvent {
  /** Milliseconds since the transaction started. */
  at: number;
  node: string;
  tone: Tone;
  title: string;
  text: string;
  data?: Yaml;
}

export interface Txn {
  n: 1 | 2 | 3 | 4;
  ref: string;
  /** Short: the bill type. */
  title: string;
  /** The bill reference for an inquiry, the amount for a payment. */
  detail: string;
  outcome: string;
  tone: Tone;
  /** Clock time the transaction started, PKT. */
  started: string;
  events: TxnEvent[];
}

/** One chain from the API, drawn as one row of the canvas. */
export interface Lane {
  /** The API's key for the chain. */
  key: string;
  title: string;
  note: string;
}

export interface Flow {
  id: 'inquiry' | 'payment';
  name: string;
  nav: string;
  summary: string;
  version: string;
  lanes: Lane[];
  /** Where the steps came from: a live API answer, or the snapshot and why the API could not be used. */
  source: { baseUrl: string; fetchedAt: string; live: boolean; error?: string };
  nodes: FlowNode[];
  edges: FlowEdge[];
  txns: Txn[];
  /** What the API returned that this back office cannot describe yet; empty when complete. */
  gaps: string[];
}

// ── Layout ────────────────────────────────────────────────────────────────

/** Grid sizes in canvas pixels; captions sit under each box, as on the sketch. */
export const GRID = {
  col: 116,
  box: 64,
  boxH: 56,
  ring: 46,
  pad: 22,
  storeGap: 44,
  rowGap: 78,
  /** Room for a two-line label over a service name that wraps once. */
  caption: 66,
  title: 30,
  laneGap: 18,
} as const;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface PlacedNode {
  node: FlowNode;
  box: Box;
  round: boolean;
}

export interface PlacedEdge {
  edge: FlowEdge;
  d: string;
  /** Arrowhead path; links to the store have none. */
  arrow: string | null;
  /** The reply's arrowhead, at the source end of a two-way hop. */
  back: string | null;
  label: { x: number; y: number; anchor: 'middle' | 'end' } | null;
}

export interface Scene {
  width: number;
  height: number;
  /** Titles are drawn only when a flow has more than one lane. */
  lanes: { lane: Lane; y: number }[];
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}

export const isRound = (n: FlowNode) => n.kind === 'start' || n.kind === 'end';

export function layout(flow: Flow): Scene {
  const cols = Math.max(...flow.nodes.map((n) => n.col)) + 1;
  const titled = flow.lanes.length > 1;
  const lanes: Scene['lanes'] = [];
  const mains: number[] = [];

  // Lanes stack top to bottom; each has its own store row above and branch row below when it needs them.
  let y = GRID.pad;
  flow.lanes.forEach((lane, i) => {
    const mine = flow.nodes.filter((n) => n.lane === i);
    if (titled) {
      lanes.push({ lane, y });
      y += GRID.title;
    }
    const main = y + (mine.some((n) => n.row === -1) ? GRID.boxH + GRID.storeGap : 0);
    mains.push(main);
    const bottom = main + (mine.some((n) => n.row === 1) ? GRID.boxH + GRID.rowGap : 0);
    y = bottom + GRID.boxH + GRID.caption + (i < flow.lanes.length - 1 ? GRID.laneGap : GRID.pad);
  });
  const rowTop = (n: FlowNode) =>
    n.row < 0 ? mains[n.lane] - GRID.boxH - GRID.storeGap : n.row === 0 ? mains[n.lane] : mains[n.lane] + GRID.boxH + GRID.rowGap;

  const nodes: PlacedNode[] = flow.nodes.map((node) => {
    const round = isRound(node);
    const w = round ? GRID.ring : GRID.box;
    const h = round ? GRID.ring : GRID.boxH;
    const cx = GRID.pad + node.col * GRID.col + GRID.col / 2;
    const cy = rowTop(node) + GRID.boxH / 2;
    return { node, round, box: { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy } };
  });
  const at = new Map(nodes.map((p) => [p.node.id, p.box]));

  const edges: PlacedEdge[] = flow.edges
    .filter((edge) => edge.kind !== 'handoff')
    .map((edge) => {
      const a = at.get(edge.from)!;
      const b = at.get(edge.to)!;
      const arrowAt = (x: number, y: number) => `M${x} ${y}l-7 -4.2v8.4z`;
      const backAt = (x: number, y: number) => `M${x} ${y}l7 -4.2v8.4z`;

      if (edge.kind === 'link') {
        const [upper, lower] = a.cy < b.cy ? [a, b] : [b, a];
        return { edge, d: `M${upper.cx} ${upper.y + upper.h}V${lower.y}`, arrow: null, back: null, label: null };
      }
      const both = edge.dir === 'both';
      const x1 = a.x + a.w + (both ? 2 : 0);
      const back = both ? backAt(a.x + a.w, a.cy) : null;
      if (a.cy === b.cy) {
        return {
          edge,
          d: `M${x1} ${a.cy}H${b.x - 2}`,
          arrow: arrowAt(b.x, b.cy),
          back,
          label: { x: (a.x + a.w + b.x) / 2, y: a.cy - 9, anchor: 'middle' },
        };
      }
      // A branch leaves the box sideways, turns down at the column boundary, then runs into its target.
      // Its label sits left of the corner, where the source's column is empty below its caption.
      const mx = a.cx + GRID.col / 2;
      return {
        edge,
        d: `M${x1} ${a.cy}H${mx}V${b.cy}H${b.x - 2}`,
        arrow: arrowAt(b.x, b.cy),
        back,
        label: { x: mx - 6, y: b.cy + 4, anchor: 'end' },
      };
    });

  return { width: GRID.pad * 2 + cols * GRID.col, height: y, lanes, nodes, edges };
}

// ── Graph checks ──────────────────────────────────────────────────────────

export const nodeById = (flow: Flow) => new Map(flow.nodes.map((n) => [n.id, n]));

/** Whether two steps are joined by any edge, in either direction. */
export function adjacent(flow: Flow, a: string, b: string): boolean {
  return flow.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
}

/** A lane's steps from its Start when everything succeeds. */
export function mainLine(flow: Flow, lane = 0): string[] {
  const start = flow.nodes.find((n) => n.lane === lane && n.kind === 'start');
  if (!start) return [];
  const line = [start.id];
  for (;;) {
    const last = line[line.length - 1];
    const next = flow.edges.find((e) => e.from === last && e.kind === 'flow');
    if (!next || line.includes(next.to)) return line;
    line.push(next.to);
  }
}

/** Everything wrong with a flow's shape or its transactions; empty means sound. */
export function problems(flow: Flow): string[] {
  const out: string[] = [...flow.gaps];
  const ids = flow.nodes.map((n) => n.id);
  const byId = nodeById(flow);
  const starts = new Set(flow.nodes.filter((n) => n.kind === 'start').map((n) => n.id));

  if (new Set(ids).size !== ids.length) out.push('node ids are not unique');
  flow.lanes.forEach((lane, i) => {
    const n = flow.nodes.filter((x) => x.lane === i && x.kind === 'start').length;
    if (n !== 1) out.push(`lane ${lane.key} needs exactly one start, has ${n}`);
  });
  for (const n of flow.nodes) if (!flow.lanes[n.lane]) out.push(`${n.id} sits in lane ${n.lane}, which does not exist`);

  for (const e of flow.edges) {
    const from = byId.get(e.from);
    if (!from || !byId.has(e.to)) out.push(`edge ${e.from}→${e.to} joins a missing node`);
    if (e.kind !== 'link' && (from?.kind === 'end' || from?.kind === 'reject')) out.push(`${e.from} ends the flow but has an outgoing edge`);
  }

  const seen = new Set(starts);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of flow.edges) {
      if (seen.has(e.from) && !seen.has(e.to)) {
        seen.add(e.to);
        grew = true;
      }
    }
  }
  for (const id of ids) if (!seen.has(id)) out.push(`${id} is not reachable from a start`);

  const cells = new Set<string>();
  for (const n of flow.nodes) {
    const cell = `${n.lane},${n.col},${n.row}`;
    if (cells.has(cell)) out.push(`two nodes share grid cell ${cell}`);
    cells.add(cell);
  }

  const numbers = flow.txns.map((t) => t.n);
  if (!numbers.length || numbers.some((n, i) => n !== i + 1)) out.push(`transactions should be numbered 1, 2, …; got ${numbers.join(',') || 'none'}`);

  for (const t of flow.txns) {
    t.events.forEach((ev, i) => {
      const node = byId.get(ev.node);
      if (!node) out.push(`txn ${t.n} event ${i + 1} names missing node ${ev.node}`);
      else if (isRound(node)) out.push(`txn ${t.n} event ${i + 1} sits on terminal ${ev.node}`);
      if (i === 0) return;
      const prev = t.events[i - 1];
      if (ev.at <= prev.at) out.push(`txn ${t.n} event ${i + 1} does not move forward in time`);
      if (ev.node !== prev.node && !adjacent(flow, prev.node, ev.node)) {
        out.push(`txn ${t.n} jumps from ${prev.node} to ${ev.node} without an edge`);
      }
    });
    const first = t.events[0]?.node;
    if (!flow.edges.some((e) => starts.has(e.from) && e.to === first)) out.push(`txn ${t.n} does not begin at a lane's first step`);
  }
  return out;
}

// ── Transaction state at a timeline position ─────────────────────────────

export type NodeState = Tone | 'todo';

/** The parts of a flow the browser needs; the page ships this much as JSON. */
export interface FlowShape {
  nodes: { id: string }[];
  edges: FlowEdge[];
}

export interface TxnShape {
  events: { node: string; tone: Tone }[];
}

/** Each step's status after the first `upto + 1` events: its latest event's tone, or "todo". */
export function statesAt(flow: FlowShape, txn: TxnShape, upto: number): Record<string, NodeState> {
  const states: Record<string, NodeState> = Object.fromEntries(flow.nodes.map((n) => [n.id, 'todo' as NodeState]));
  txn.events.slice(0, upto + 1).forEach((ev) => (states[ev.node] = ev.tone));
  return states;
}

/** Edges crossed by the first `upto + 1` events, as "from>to" keys in the flow's own direction. */
export function crossedAt(flow: FlowShape, txn: TxnShape, upto: number): Set<string> {
  const crossed = new Set<string>();
  const evs = txn.events.slice(0, upto + 1);
  for (let i = 1; i < evs.length; i++) {
    const [a, b] = [evs[i - 1].node, evs[i].node];
    const e = flow.edges.find((x) => (x.from === a && x.to === b) || (x.from === b && x.to === a));
    if (e) crossed.add(`${e.from}>${e.to}`);
  }
  return crossed;
}
