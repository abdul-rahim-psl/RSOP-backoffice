import type { Yaml } from './yaml.ts';

export type Family = 'raast' | 'rsop' | 'queue' | 'outbound' | 'store' | 'biller' | 'reject';
export type NodeKind = 'start' | 'inbound' | 'wsi' | 'decision' | 'wait' | 'queue' | 'rest' | 'store' | 'end';
export type Tone = 'ok' | 'fail' | 'wait' | 'info';
export type EdgeKind = 'flow' | 'ok' | 'fail' | 'link';

export interface FlowNode {
  id: string;
  kind: NodeKind;
  family: Family;
  label: string;
  /** One line under the label. */
  sub: string;
  /** Whether KJ's sketch draws this step, or it was added from the Open Connect doc. */
  origin: 'sketch' | 'doc';
  col: number;
  /** -1 sits above the main line (the store), 1 below it (the refusal branch). */
  row: -1 | 0 | 1;
  /** The WSI's YAML template, the sketch's "YML T…". */
  template?: string;
  about: string;
  params: Yaml;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
  kind: EdgeKind;
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

export interface Flow {
  id: 'inquiry' | 'payment';
  name: string;
  nav: string;
  summary: string;
  version: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  txns: Txn[];
}

// ── Layout ────────────────────────────────────────────────────────────────

/** Grid sizes in canvas pixels; captions sit under each box, as on the sketch. */
export const GRID = { col: 116, box: 64, boxH: 56, ring: 46, pad: 22, storeGap: 44, rowGap: 78, caption: 50 } as const;

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
  label: { x: number; y: number } | null;
}

export interface Scene {
  width: number;
  height: number;
  nodes: PlacedNode[];
  edges: PlacedEdge[];
}

export const isRound = (n: FlowNode) => n.kind === 'start' || n.kind === 'end';

export function layout(flow: Flow): Scene {
  const cols = Math.max(...flow.nodes.map((n) => n.col)) + 1;
  const hasTop = flow.nodes.some((n) => n.row === -1);
  const hasBottom = flow.nodes.some((n) => n.row === 1);
  const main = GRID.pad + (hasTop ? GRID.boxH + GRID.storeGap : 0);
  const rowTop = (r: number) => (r < 0 ? GRID.pad : r === 0 ? main : main + GRID.boxH + GRID.rowGap);

  const nodes: PlacedNode[] = flow.nodes.map((node) => {
    const round = isRound(node);
    const w = round ? GRID.ring : GRID.box;
    const h = round ? GRID.ring : GRID.boxH;
    const cx = GRID.pad + node.col * GRID.col + GRID.col / 2;
    const cy = rowTop(node.row) + GRID.boxH / 2;
    return { node, round, box: { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy } };
  });
  const at = new Map(nodes.map((p) => [p.node.id, p.box]));

  const edges: PlacedEdge[] = flow.edges.map((edge) => {
    const a = at.get(edge.from)!;
    const b = at.get(edge.to)!;
    const arrowAt = (x: number, y: number) => `M${x} ${y}l-7 -4.2v8.4z`;

    if (edge.kind === 'link') {
      const [upper, lower] = a.cy < b.cy ? [a, b] : [b, a];
      return { edge, d: `M${upper.cx} ${upper.y + upper.h}V${lower.y}`, arrow: null, label: null };
    }
    if (a.cy === b.cy) {
      const x1 = a.x + a.w;
      const x2 = b.x - 2;
      return { edge, d: `M${x1} ${a.cy}H${x2}`, arrow: arrowAt(b.x, b.cy), label: { x: (x1 + b.x) / 2, y: a.cy - 9 } };
    }
    // A branch leaves the box sideways, turns down at the column boundary, then runs into its target.
    const mx = a.cx + GRID.col / 2;
    return {
      edge,
      d: `M${a.x + a.w} ${a.cy}H${mx}V${b.cy}H${b.x - 2}`,
      arrow: arrowAt(b.x, b.cy),
      label: { x: (mx + b.x) / 2, y: b.cy - 9 },
    };
  });

  return {
    width: GRID.pad * 2 + cols * GRID.col,
    height: rowTop(hasBottom ? 1 : 0) + GRID.boxH + GRID.caption + GRID.pad,
    nodes,
    edges,
  };
}

// ── Graph checks ──────────────────────────────────────────────────────────

export const nodeById = (flow: Flow) => new Map(flow.nodes.map((n) => [n.id, n]));

/** Whether two steps are joined by any edge, in either direction. */
export function adjacent(flow: Flow, a: string, b: string): boolean {
  return flow.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
}

/** The steps a transaction takes from the start when everything succeeds. */
export function mainLine(flow: Flow): string[] {
  const line = ['start'];
  for (;;) {
    const last = line[line.length - 1];
    const next = flow.edges.find((e) => e.from === last && (e.kind === 'flow' || e.kind === 'ok'));
    if (!next || line.includes(next.to)) return line;
    line.push(next.to);
  }
}

/** Everything wrong with a flow's shape or its transactions; empty means sound. */
export function problems(flow: Flow): string[] {
  const out: string[] = [];
  const ids = flow.nodes.map((n) => n.id);
  const byId = nodeById(flow);

  if (new Set(ids).size !== ids.length) out.push('node ids are not unique');
  const starts = flow.nodes.filter((n) => n.kind === 'start');
  if (starts.length !== 1 || starts[0].id !== 'start') out.push('needs exactly one start, with id "start"');

  for (const e of flow.edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) out.push(`edge ${e.from}→${e.to} joins a missing node`);
    if (e.kind !== 'link' && byId.get(e.from)?.kind === 'end') out.push(`end ${e.from} has an outgoing edge`);
  }

  const seen = new Set(['start']);
  for (let grew = true; grew; ) {
    grew = false;
    for (const e of flow.edges) {
      if (seen.has(e.from) && !seen.has(e.to)) {
        seen.add(e.to);
        grew = true;
      }
    }
  }
  for (const id of ids) if (!seen.has(id)) out.push(`${id} is not reachable from the start`);

  const cells = new Set<string>();
  for (const n of flow.nodes) {
    const cell = `${n.col},${n.row}`;
    if (cells.has(cell)) out.push(`two nodes share grid cell ${cell}`);
    cells.add(cell);
  }

  const numbers = flow.txns.map((t) => t.n).join(',');
  if (numbers !== '1,2,3,4') out.push(`transactions should be numbered 1–4, got ${numbers}`);

  for (const t of flow.txns) {
    t.events.forEach((ev, i) => {
      if (!byId.has(ev.node)) out.push(`txn ${t.n} event ${i + 1} names missing node ${ev.node}`);
      if (i === 0) return;
      const prev = t.events[i - 1];
      if (ev.at <= prev.at) out.push(`txn ${t.n} event ${i + 1} does not move forward in time`);
      if (ev.node !== prev.node && !adjacent(flow, prev.node, ev.node)) {
        out.push(`txn ${t.n} jumps from ${prev.node} to ${ev.node} without an edge`);
      }
    });
    if (t.events[0]?.node !== 'start') out.push(`txn ${t.n} does not begin at the start`);
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
