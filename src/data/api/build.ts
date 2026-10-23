// Builds a flow's steps and hops from the API snapshot, adding this back office's descriptions and the doc's steps.
import { excerpt, parseChain, type Message } from '../../lib/chain.ts';
import type { Flow, FlowEdge, FlowNode, Lane } from '../../lib/flow.ts';
import type { Yaml } from '../../lib/yaml.ts';
import type { Snapshot, Source } from './endpoints.ts';
import { services } from './services.ts';
import raw from './snapshot.json' with { type: 'json' };

export const snapshot = raw as Snapshot;

/** The committed snapshot as a source: what the tests use, and what a page falls back to. */
export const snapshotSource: Source = { ...snapshot, live: false };

/** What the API does not say about a step. */
export interface StepDetail {
  about: string;
  params: Yaml;
  /** Replaces the sub line; API services otherwise show their service name there. */
  sub?: string;
  template?: string;
}

export interface LaneSpec extends Lane {
  /** Put before every step id in the lane, so two lanes can share a service. */
  prefix?: string;
}

/** A step the doc adds, placed relative to the step it hangs off. */
export interface DocStep extends Omit<FlowNode, 'origin' | 'lane' | 'col' | 'row' | 'source' | 'service'> {
  anchor: string;
  row: -1 | 1;
  /** Columns right of the anchor; a branch below needs 1 so its edge can turn down. */
  shift?: number;
}

export interface FlowSpec {
  lanes: LaneSpec[];
  /** Keyed by step id, after the lane prefix; terminals included. */
  details: Record<string, StepDetail>;
  docSteps?: DocStep[];
  /** Edges the API does not return: links to the store, the doc's branches, handoffs between lanes. */
  docEdges?: FlowEdge[];
  /** Labels KJ's sketch puts on a hop, keyed "from>to". */
  labels?: Record<string, string>;
}

export type BuiltFlow = Pick<Flow, 'lanes' | 'source' | 'nodes' | 'edges' | 'gaps'>;

function chainFor(source: Source, key: string) {
  for (const [endpoint, chains] of Object.entries(source.responses)) {
    const chain = chains[key];
    if (chain !== undefined) return { endpoint, chain };
  }
  return null;
}

/** The hop's status word, short enough for the gap between two boxes: "pacs.002 AUTH" → "AUTH". */
const shortLabel = (m: Message) => m.text.split(' ').at(-1)!;

/** A missing chain is reported with this prefix, so a live answer without it can fall back to the snapshot. */
export const NO_CHAIN = 'the API answer has no chain';

export function buildFlow(source: Source, spec: FlowSpec): BuiltFlow {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const gaps: string[] = [];

  spec.lanes.forEach((lane, li) => {
    const found = chainFor(source, lane.key);
    if (!found) {
      gaps.push(`${NO_CHAIN} "${lane.key}"`);
      return;
    }
    const chain = parseChain(found.chain);
    const ids = chain.steps.map((s) => {
      const base = s.kind === 'service' ? (services[s.name]?.id ?? s.name) : s.kind;
      return `${lane.prefix ?? ''}${base}${s.occurrence > 1 ? `-${s.occurrence}` : ''}`;
    });

    chain.steps.forEach((s, i) => {
      const id = ids[i];
      const svc = s.kind === 'service' ? services[s.name] : undefined;
      if (s.kind === 'service' && !svc) gaps.push(`service "${s.name}" in ${lane.key} has no entry in src/data/api/services.ts`);
      const detail = spec.details[id];
      if (!detail) gaps.push(`step ${id} (${s.name}) has no description in its flow file`);
      const terminal = s.kind !== 'service';
      nodes.push({
        id,
        kind: terminal ? s.kind : (svc?.kind ?? 'service'),
        family: terminal ? (s.kind === 'start' ? 'raast' : 'store') : (svc?.family ?? 'rsop'),
        label: terminal ? s.name : (svc?.label ?? s.name),
        sub: detail?.sub ?? (terminal ? '' : s.name),
        origin: 'api',
        ...(!terminal && { service: s.name }),
        ...(s.kind === 'start' ? { sketch: 'start' as const } : svc?.sketch && { sketch: svc.sketch }),
        lane: li,
        col: i,
        row: 0,
        ...(detail?.template && { template: detail.template }),
        about: detail?.about ?? 'Not described in this back office yet.',
        params: detail?.params ?? { config: 'TBC # not described in this back office yet' },
        source: { endpoint: found.endpoint, key: lane.key, position: i + 1, of: chain.steps.length, excerpt: excerpt(found.chain, i) },
      });
    });

    for (const h of chain.hops) {
      const [from, to] = [ids[h.from], ids[h.to]];
      const label = spec.labels?.[`${from}>${to}`] ?? (h.message && shortLabel(h.message));
      edges.push({ from, to, kind: 'flow', dir: h.dir, ...(label && { label }), ...(h.message && { message: h.message }) });
    }
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const { anchor, row, shift = 0, ...step } of spec.docSteps ?? []) {
    const at = byId.get(anchor);
    if (!at) {
      gaps.push(`doc step ${step.id} hangs off ${anchor}, which the API no longer returns`);
      continue;
    }
    nodes.push({ ...step, origin: 'doc', lane: at.lane, col: at.col + shift, row });
  }
  edges.push(...(spec.docEdges ?? []));

  return {
    lanes: spec.lanes.map(({ key, title, note }) => ({ key, title, note })),
    source: {
      baseUrl: source.baseUrl,
      fetchedAt: source.fetchedAt,
      live: source.live,
      ...(source.error && { error: source.error }),
      ...(source.static && { static: true }),
    },
    nodes,
    edges,
    gaps,
  };
}
