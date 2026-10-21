import { test } from 'node:test';
import assert from 'node:assert/strict';
import { excerpt, houseSpelling, parseChain } from '../src/lib/chain.ts';

// The three chains exactly as the API returned them on 2026-10-21.
const INQUIRY =
  'Start<-->raast-api-gateway<-->mpg-incoming-billing-service<-->web-service-interface<-->queue-processor<-->rest-handler<-->fbr-biller-mock-->End';
const PAY1 =
  'Start-->raast-->GET PACS008-->notification-service-->notification-broker-service-->receiving-service<-->Post PACS002 AUTH<-->web-service-interface<-->queue-processor<-->rest-handler<-->raast-->END';
const PAY2 =
  'Start-->raast-->GET PACS002 ACSP-->notification-service-->notification-broker-service-->receiving-service-->saf-dispatcher<-->saf-consumer<-->fbr-biller-mock-->END';

const names = (s: string) => parseChain(s).steps.map((x) => x.name);

test('the inquiry chain: eight steps, every hop two-way except into End', () => {
  const c = parseChain(INQUIRY);
  assert.deepEqual(names(INQUIRY), [
    'Start',
    'raast-api-gateway',
    'mpg-incoming-billing-service',
    'web-service-interface',
    'queue-processor',
    'rest-handler',
    'fbr-biller-mock',
    'End',
  ]);
  assert.deepEqual(
    c.hops.map((h) => h.dir),
    ['both', 'both', 'both', 'both', 'both', 'both', 'one'],
  );
  assert.ok(c.hops.every((h) => !h.message));
});

test('payment part 1: messages fold into hops, and Raast appears twice', () => {
  const c = parseChain(PAY1);
  assert.equal(c.steps.length, 10);
  assert.deepEqual(
    c.steps.filter((s) => s.name === 'raast').map((s) => s.occurrence),
    [1, 2],
  );
  const pacs008 = c.hops.find((h) => h.message?.raw === 'GET PACS008')!;
  assert.deepEqual([c.steps[pacs008.from].name, c.steps[pacs008.to].name, pacs008.dir], ['raast', 'notification-service', 'one']);
  assert.deepEqual(pacs008.message, { raw: 'GET PACS008', verb: 'GET', text: 'pacs.008' });
  const auth = c.hops.find((h) => h.message?.raw === 'Post PACS002 AUTH')!;
  assert.deepEqual([c.steps[auth.from].name, c.steps[auth.to].name, auth.dir], ['receiving-service', 'web-service-interface', 'both']);
  assert.deepEqual(auth.message, { raw: 'Post PACS002 AUTH', verb: 'POST', text: 'pacs.002 AUTH' });
});

test('payment part 2: ACSP in, then store-and-forward to the biller', () => {
  const c = parseChain(PAY2);
  assert.deepEqual(names(PAY2), [
    'Start',
    'raast',
    'notification-service',
    'notification-broker-service',
    'receiving-service',
    'saf-dispatcher',
    'saf-consumer',
    'fbr-biller-mock',
    'End',
  ]);
  assert.equal(c.hops[1].message?.text, 'pacs.002 ACSP');
  assert.deepEqual(
    c.hops.map((h) => h.dir),
    ['one', 'one', 'one', 'one', 'one', 'both', 'both', 'one'],
  );
});

test('End and END are the same terminal', () => {
  assert.equal(parseChain(INQUIRY).steps.at(-1)?.name, 'End');
  assert.equal(parseChain(PAY1).steps.at(-1)?.name, 'End');
});

test('house spelling', () => {
  assert.equal(houseSpelling('PACS002 ACSP'), 'pacs.002 ACSP');
  assert.equal(houseSpelling('PACS008'), 'pacs.008');
});

test('an excerpt shows a step with its neighbours, messages included', () => {
  assert.equal(excerpt(PAY1, 4), 'notification-broker-service-->receiving-service<-->Post PACS002 AUTH<-->web-service-interface');
  assert.equal(excerpt(INQUIRY, 0), 'Start<-->raast-api-gateway');
  assert.equal(excerpt(INQUIRY, 7), 'fbr-biller-mock-->End');
});

test('malformed chains are refused, naming the problem', () => {
  const bad: [string, RegExp][] = [
    ['', /empty token/],
    ['raast-->End', /begin with Start/],
    ['Start-->raast', /finish with End/],
    ['Start-->-->End', /empty token/],
    ['Start-->raast==>queue-->End', /unrecognised token/],
    ['Start-->Raast_Gateway-->End', /unrecognised token/],
    ['Start-->a-->End-->b-->End', /middle of the chain/],
    ['Start-->a-->GET X-->Post Y-->b-->End', /two messages in a row/],
    ['Start-->a-->GET X<-->b-->End', /different arrows/],
  ];
  for (const [chain, err] of bad) assert.throws(() => parseChain(chain), err, chain);
});
