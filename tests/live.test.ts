import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshot, snapshotSource } from '../src/data/api/build.ts';
import type { Source } from '../src/data/api/endpoints.ts';
import { sourceFrom } from '../src/data/api/live.ts';
import { flows, flowsFrom } from '../src/data/flows/index.ts';

test('an unreachable API falls back to the snapshot and says why', async () => {
  const src = await sourceFrom('http://127.0.0.1:59999', 1500);
  assert.equal(src.live, false);
  assert.match(src.error ?? '', /could not be reached|did not answer/);
  assert.deepEqual(src.responses, snapshot.responses);
});

test('a live answer draws the same flows as the snapshot when the chains match', () => {
  const live: Source = { ...snapshot, fetchedAt: '2026-10-21T18:30:00Z', live: true };
  const drawn = flowsFrom(live);
  assert.deepEqual(
    drawn.map((f) => f.nodes.map((n) => n.id)),
    flows.map((f) => f.nodes.map((n) => n.id)),
  );
  assert.ok(drawn.filter((f) => !f.source.static).every((f) => f.source.live && f.source.fetchedAt === live.fetchedAt));
});

test('a live answer missing a chain falls back to the snapshot, naming the chain', () => {
  const { billPaymentFlow2: _gone, ...rest } = snapshot.responses['/api/v1/billPaymentFlow'];
  const live: Source = { ...snapshot, live: true, responses: { ...snapshot.responses, '/api/v1/billPaymentFlow': rest } };
  const drawn = flowsFrom(live);
  assert.ok(drawn.filter((f) => !f.source.static).every((f) => !f.source.live && /billPaymentFlow2/.test(f.source.error ?? '')));
  assert.deepEqual(drawn[1].nodes.length, flows[1].nodes.length);
});

test('a live answer with a new service still draws, and reports the gap', () => {
  const chains = snapshot.responses['/api/v1/billInquiryFlow'];
  const live: Source = {
    ...snapshot,
    live: true,
    responses: { ...snapshot.responses, '/api/v1/billInquiryFlow': { billInquiryFlow: chains.billInquiryFlow.replace('-->End', '<-->audit-log-->End') } },
  };
  const inquiry = flowsFrom(live)[0];
  assert.ok(inquiry.source.live);
  assert.ok(inquiry.nodes.some((n) => n.service === 'audit-log' && n.kind === 'service'));
  assert.ok(inquiry.gaps.some((g) => g.includes('audit-log')));
  assert.equal(snapshotSource.live, false);
});
