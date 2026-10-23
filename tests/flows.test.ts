import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChain } from '../src/lib/chain.ts';
import { isRound, layout, mainLine, nodeById, problems, statesAt, type Flow, type Txn } from '../src/lib/flow.ts';
import type { Yaml } from '../src/lib/yaml.ts';
import { snapshot } from '../src/data/api/build.ts';
import { TALHA_BHAI_API } from '../src/data/api/talha-bhai-api.ts';
import { services } from '../src/data/api/services.ts';
import { flows } from '../src/data/flows/index.ts';
import { inquiryFlow } from '../src/data/flows/inquiry.ts';
import { paymentFlow } from '../src/data/flows/payment.ts';

/** KJ's sketch, left to right: Green start → Incoming Bill → WSI → RabbitMQ → REST → WS → Gov. */
const SKETCH = ['start', 'incoming', 'wsi', 'queue', 'rest', 'biller'];

/** Where bill marking happens in the payment flow: the store-and-forward pair and the biller. */
const MARKING = ['acsp-saf-dispatch', 'acsp-saf-consume', 'acsp-biller'];

/** The first value under `key` anywhere in a payload. */
function find(data: Yaml | undefined, key: string): Yaml | undefined {
  if (data === null || typeof data !== 'object') return undefined;
  if (!Array.isArray(data) && key in data) return data[key];
  for (const v of Object.values(data)) {
    const hit = find(v, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

const nodesOf = (t: Txn) => t.events.map((e) => e.node);

test('every flow is a sound graph with well-formed transactions', () => {
  for (const flow of flows) assert.deepEqual(problems(flow), [], flow.id);
});

test('the inquiry keeps the sketch’s blocks in the sketch’s order, with only the gateway and End added', () => {
  const byId = nodeById(inquiryFlow);
  const line = mainLine(inquiryFlow);
  assert.deepEqual(
    line.map((id) => byId.get(id)?.sketch).filter(Boolean),
    SKETCH,
  );
  assert.deepEqual(
    line.filter((id) => !byId.get(id)?.sketch),
    ['gateway', 'end'],
  );
  assert.equal(inquiryFlow.edges.find((e) => e.to === 'biller')?.label, 'WS');
});

test('each lane’s steps are exactly its chain, from the API snapshot or the hard-coded file', () => {
  const chains = Object.assign({}, ...Object.values(snapshot.responses), TALHA_BHAI_API) as Record<string, string>;
  for (const flow of flows) {
    const byId = nodeById(flow);
    flow.lanes.forEach((lane, i) => {
      const expected = parseChain(chains[lane.key]).steps.map((s) => s.name);
      const drawn = mainLine(flow, i).map((id) => byId.get(id)!).map((n) => n.service ?? n.label);
      assert.deepEqual(drawn, expected, `${flow.id} ${lane.key}`);
    });
  }
});

test('every service in the API snapshot and the hard-coded file has a registry entry', () => {
  for (const response of [...Object.values(snapshot.responses), TALHA_BHAI_API]) {
    for (const [key, chain] of Object.entries(response)) {
      for (const s of parseChain(chain).steps) if (s.kind === 'service') assert.ok(services[s.name], `${key}: ${s.name}`);
    }
  }
});

test('every step is from the API or added from the doc, and only API steps name a service', () => {
  for (const flow of flows) {
    for (const n of flow.nodes) {
      if (n.origin === 'api') assert.ok(n.service || isRound(n), `${flow.id}/${n.id} is from the API but names no service`);
      else assert.ok(!n.service && !n.source, `${flow.id}/${n.id} is from the doc but carries API data`);
    }
  }
});

test('no two steps overlap on the canvas', () => {
  for (const flow of flows) {
    const boxes = layout(flow).nodes.map((p) => p.box);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        assert.ok(apart, `${flow.id}: ${flow.nodes[i].id} overlaps ${flow.nodes[j].id}`);
      }
    }
  }
});

test('doc check: a successful inquiry returns the biller’s inquiry ID unchanged', () => {
  for (const t of inquiryFlow.txns.filter((x) => x.tone === 'ok')) {
    const fromBiller = find(t.events.find((e) => e.node === 'biller')?.data, 'inquiryId');
    const stored = find(t.events.find((e) => e.node === 'store')?.data, 'inquiryId');
    const returned = find(t.events[t.events.length - 1].data, 'inquiryId');
    assert.ok(fromBiller, `inquiry ${t.n} has an ID from the biller`);
    assert.equal(stored, fromBiller, `inquiry ${t.n} stores the biller's ID`);
    assert.equal(returned, fromBiller, `inquiry ${t.n} returns the biller's ID`);
  }
});

test('doc check: a refused payment never reaches bill marking', () => {
  const refused = paymentFlow.txns.filter((t) => t.events.some((e) => e.node === 'auth-receive' && e.tone === 'fail'));
  for (const t of refused) {
    for (const step of MARKING) assert.ok(!nodesOf(t).includes(step), `payment ${t.n} reaches ${step}`);
    assert.equal(t.events[t.events.length - 1].node, 'rejected', `payment ${t.n} ends rejected`);
  }
});

test('doc check: bill marking happens only after ACSP', () => {
  for (const t of paymentFlow.txns) {
    const acsp = t.events.findIndex((e) => e.node === 'acsp-receive' && e.tone === 'ok');
    const firstCall = t.events.findIndex((e) => MARKING.includes(e.node));
    if (firstCall >= 0) assert.ok(acsp >= 0 && acsp < firstCall, `payment ${t.n} marks the bill before ACSP`);
  }
});

test('doc check: a bill-marking failure is retried without reversing the payment', () => {
  const failed = paymentFlow.txns.filter((t) => t.events.some((e) => e.node === 'acsp-saf-consume' && e.tone === 'fail'));
  for (const t of failed) {
    const acsp = t.events.findIndex((e) => e.node === 'acsp-receive' && e.tone === 'ok');
    for (const e of t.events.slice(acsp)) {
      const payment = find(e.data, 'payment');
      if (payment !== undefined) assert.equal(payment, 'DONE', `payment ${t.n} at "${e.title}"`);
    }
    const marked = t.events.filter((e) => e.node === 'acsp-biller' && e.tone === 'ok');
    assert.equal(marked.length, 1, `payment ${t.n} is marked exactly once`);
  }
});

test('doc check: no payment marks a bill twice', () => {
  for (const t of paymentFlow.txns) {
    assert.ok(t.events.filter((e) => e.node === 'acsp-biller' && e.tone === 'ok').length <= 1, `payment ${t.n}`);
  }
});

test('each transaction’s overall status matches where it ends', () => {
  const check = (flow: Flow) => {
    for (const t of flow.txns) {
      const last = t.events[t.events.length - 1];
      const end = statesAt(flow, t, t.events.length - 1)[last.node];
      assert.equal(end, t.tone, `${flow.id} ${t.n}`);
    }
  };
  flows.forEach(check);
});
