import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout, mainLine, nodeById, problems, statesAt, type Flow, type Txn } from '../src/lib/flow.ts';
import type { Yaml } from '../src/lib/yaml.ts';
import { flows } from '../src/data/flows/index.ts';
import { inquiryFlow } from '../src/data/flows/inquiry.ts';
import { paymentFlow } from '../src/data/flows/payment.ts';

/** KJ's sketch, left to right: Green start → Incoming Bill → WSI → RabbitMQ → REST → WS → Gov. */
const SKETCH = ['start', 'incoming', 'wsi', 'queue', 'rest', 'biller'];

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

test('both flows are sound graphs with well-formed transactions', () => {
  for (const flow of flows) assert.deepEqual(problems(flow), [], flow.id);
});

test('the inquiry main line is exactly the sketch', () => {
  assert.deepEqual(mainLine(inquiryFlow), SKETCH);
  const last = inquiryFlow.edges.find((e) => e.to === 'biller');
  assert.equal(last?.label, 'WS');
});

test('the payment flow keeps the sketch’s blocks in the sketch’s order', () => {
  const byId = nodeById(paymentFlow);
  const fromSketch = mainLine(paymentFlow).filter((id) => byId.get(id)?.origin === 'sketch');
  assert.deepEqual(fromSketch, SKETCH);
  assert.equal(paymentFlow.edges.find((e) => e.to === 'biller')?.label, 'WS');
});

test('every step the sketch does not draw is tagged as coming from the doc', () => {
  for (const flow of flows) {
    for (const n of flow.nodes) assert.equal(n.origin, SKETCH.includes(n.id) ? 'sketch' : 'doc', `${flow.id}/${n.id}`);
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
  const refused = paymentFlow.txns.filter((t) => t.events.some((e) => e.node === 'validate' && e.tone === 'fail'));
  assert.ok(refused.length > 0, 'at least one sample payment is refused');
  for (const t of refused) {
    assert.ok(!nodesOf(t).includes('biller'), `payment ${t.n} calls the biller`);
    assert.ok(!nodesOf(t).includes('queue'), `payment ${t.n} queues bill marking`);
    assert.equal(t.events[t.events.length - 1].node, 'rejected', `payment ${t.n} ends rejected`);
  }
});

test('doc check: bill marking happens only after ACSP', () => {
  for (const t of paymentFlow.txns) {
    const acsp = t.events.findIndex((e) => e.node === 'await' && e.tone === 'ok');
    const firstCall = t.events.findIndex((e) => e.node === 'queue' || e.node === 'biller');
    if (firstCall >= 0) assert.ok(acsp >= 0 && acsp < firstCall, `payment ${t.n} marks the bill before ACSP`);
  }
});

test('doc check: a bill-marking failure is retried without reversing the payment', () => {
  const failed = paymentFlow.txns.filter((t) => t.events.some((e) => e.node === 'rest' && e.tone === 'fail'));
  assert.ok(failed.length > 0, 'at least one sample payment has a bill-marking failure');
  for (const t of failed) {
    const acsp = t.events.findIndex((e) => e.node === 'await' && e.tone === 'ok');
    for (const e of t.events.slice(acsp)) {
      const payment = find(e.data, 'payment');
      if (payment !== undefined) assert.equal(payment, 'DONE', `payment ${t.n} at "${e.title}"`);
    }
    const marked = t.events.filter((e) => e.node === 'biller' && e.tone === 'ok');
    assert.equal(marked.length, 1, `payment ${t.n} is marked exactly once`);
  }
});

test('doc check: no payment marks a bill twice', () => {
  for (const t of paymentFlow.txns) {
    assert.ok(t.events.filter((e) => e.node === 'biller' && e.tone === 'ok').length <= 1, `payment ${t.n}`);
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
