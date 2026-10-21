import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byType, funnel, hourly, hours, totals } from '../src/data/dashboard.ts';
import { billRows, filterOf } from '../src/data/bills.ts';
import { flows } from '../src/data/flows/index.ts';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

test('every hourly series covers every hour and adds up to its total', () => {
  for (const series of Object.values(hourly)) assert.equal(series.length, hours.length);
  assert.equal(sum(hourly.inquiries), totals.inquiries);
  assert.equal(sum(hourly.settled), totals.acsp);
  assert.equal(sum(hourly.refused), totals.naut);
  assert.equal(sum(hourly.awaiting), totals.awaiting);
});

test('payment outcomes reconcile: AUTH + NAUT, ACSP + awaiting, marked + retrying', () => {
  assert.equal(totals.auth + totals.naut, totals.payments);
  assert.equal(totals.acsp + totals.awaiting, totals.auth);
  assert.equal(totals.marked + totals.retrying, totals.acsp);
});

test('the funnel never grows from one stage to the next', () => {
  for (let i = 1; i < funnel.length; i++) assert.ok(funnel[i].value <= funnel[i - 1].value, funnel[i].label);
});

test('bill types add up to settled payments and the amount collected', () => {
  assert.equal(sum(byType.map((t) => t.payments)), totals.acsp);
  assert.equal(sum(byType.map((t) => t.collected)), totals.collected);
});

test('every trace link in the billing table opens a real sample transaction', () => {
  for (const row of billRows) {
    for (const { href } of row.traces) {
      const m = href.match(/^\/designer\/(inquiry|payment)\/\?txn=(\d)$/);
      assert.ok(m, href);
      const flow = flows.find((f) => f.id === m[1])!;
      assert.ok(flow.txns.some((t) => t.n === Number(m[2])), href);
    }
  }
});

test('billing rows are newest first and each lands in one filter', () => {
  for (let i = 1; i < billRows.length; i++) assert.ok(billRows[i].time < billRows[i - 1].time, billRows[i].ref);
  for (const row of billRows) assert.ok(filterOf(row), row.ref);
});
