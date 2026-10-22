import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetchInquiryLog, parseHeaders, readLog, snapshotLog, summarize, type RawInquiry } from '../src/data/api/inquiry-log.ts';
import { ago, pktWhen } from '../src/lib/format.ts';

// Entries in the API's shape, one per case the page distinguishes.
const entry = (over: Partial<RawInquiry>): RawInquiry => ({
  id: 1,
  ipAddress: '0:0:0:0:0:0:0:1',
  requestDate: '2026-10-22T03:00:00.000+00:00',
  requestHeaders:
    'x-request-id:aaaa,charset:UTF-8,receiver-participant-code:RCVRPKKA,host:localhost:9993,sender-user-code:SNDRPKKAUSR,sender-participant-code:SNDRPKKA,authorization:,user-agent:curl/8.0.0',
  responseDate: '2026-10-22T03:00:00.400+00:00',
  responseHeaders: 'X-Request-ID:aaaa,Date:Thu, 22 Oct 2026 03:00:00 GMT,Cache-Control:no-cache, no-store, max-age=0',
  rrn: null,
  stan: null,
  correlationId: 'c1',
  uid: 'REF0000001',
  responseCode: '0',
  responseDesc: 'SUCCESS',
  originalMessageId: null,
  ...over,
});

const sample = [
  entry({ id: 1 }),
  entry({ id: 2, requestDate: '2026-10-22T03:05:00.000+00:00', responseDate: '2026-10-22T03:05:00.900+00:00', responseCode: '101', responseDesc: 'Bill Reference not found' }),
  entry({ id: 3, requestDate: '2026-10-22T03:10:00.000+00:00', responseDate: null, responseHeaders: null, responseCode: null, responseDesc: null, uid: null }),
  entry({ id: 4, requestDate: '2026-10-22T02:00:00.000+00:00', responseDate: '2026-10-22T02:00:00.100+00:00', ipAddress: '192.0.2.10', requestHeaders: 'x-request-id:bbbb,user-agent:unirest-java/1.3.11' }),
];

test('headers split on commas that start a header, not on commas inside a value', () => {
  assert.deepEqual(parseHeaders('Date:Thu, 22 Oct 2026 03:00:00 GMT,Cache-Control:no-cache, no-store,authorization:,Vary:Origin'), [
    ['Date', 'Thu, 22 Oct 2026 03:00:00 GMT'],
    ['Cache-Control', 'no-cache, no-store'],
    ['authorization', ''],
    ['Vary', 'Origin'],
  ]);
  assert.deepEqual(parseHeaders(null), []);
});

test('each entry gets a plain result, a reply time and its caller', () => {
  const [silent, error, ok, remote] = readLog(sample);
  assert.deepEqual([silent.id, error.id, ok.id, remote.id], [3, 2, 1, 4], 'newest first');
  assert.equal(ok.outcome, 'returned');
  assert.equal(ok.replyMs, 400);
  assert.equal(error.outcome, 'error');
  assert.equal(error.code, '101');
  assert.equal(silent.outcome, 'silent');
  assert.equal(silent.replyMs, null);
  assert.equal(silent.billRef, null);
  assert.equal(ok.local, true);
  assert.equal(ok.client, 'curl 8.0.0');
  assert.deepEqual([ok.sender, ok.senderUser, ok.receiver, ok.requestId], ['SNDRPKKA', 'SNDRPKKAUSR', 'RCVRPKKA', 'aaaa']);
  assert.equal(remote.local, false);
  assert.equal(remote.ip, '192.0.2.10');
});

test('a reply with a code but no time, or a time but no code, is still an error reply, never a success', () => {
  const [a, b] = readLog([
    entry({ id: 1, responseDate: null, responseCode: '500', responseDesc: 'Down' }),
    entry({ id: 2, requestDate: '2026-10-22T02:00:00.000+00:00', responseCode: null, responseDesc: null }),
  ]);
  assert.equal(a.outcome, 'error');
  assert.equal(b.outcome, 'error');
});

test('the summary counts every result, the median reply and shared request IDs', () => {
  const s = summarize(readLog(sample));
  assert.equal(s.total, 4);
  assert.deepEqual(s.counts, { returned: 2, error: 1, silent: 1 });
  assert.equal(s.medianMs, 400);
  assert.equal(s.slowestMs, 900);
  assert.deepEqual(s.errors, [['Bill Reference not found', 1]]);
  assert.equal(s.requestIds.get('aaaa'), 3);
  assert.equal(s.newest, '2026-10-22T03:10:00.000+00:00');
  assert.equal(s.oldest, '2026-10-22T02:00:00.000+00:00');
});

test('an answer that is not a list of inquiries is refused, naming the problem', () => {
  assert.throws(() => readLog({ items: [] }), /wasn't a list/);
  assert.throws(() => readLog([entry({}), { id: 'x' }]), /Entry 2/);
});

test('the server reads the log, and says why when it cannot', async () => {
  const server = createServer((req, res) => {
    if (req.url === '/api/v1/billInquirylist') return res.end(JSON.stringify(sample));
    res.statusCode = 503;
    res.end();
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const ok = await fetchInquiryLog(base);
    assert.ok(ok.live);
    assert.equal(ok.inquiries.length, 4);
    const bad = await fetchInquiryLog(`${base}/elsewhere`);
    assert.ok(!bad.live && /HTTP 503/.test(bad.error ?? ''));
  } finally {
    server.close();
  }
  const down = await fetchInquiryLog('http://127.0.0.1:59999', 1500);
  assert.ok(!down.live && /Couldn't connect|No answer/.test(down.error ?? ''));
  assert.equal(down.tried, 'http://127.0.0.1:59999/api/v1/billInquirylist');
  assert.deepEqual(down.inquiries, snapshotLog().inquiries, 'falls back to the snapshot');
});

test('the committed snapshot reads cleanly, so the fallback always has something to show', () => {
  const s = snapshotLog();
  assert.ok(s.inquiries.length > 0);
  assert.ok(s.inquiries.every((q) => q.request.length > 0 && !Number.isNaN(Date.parse(q.at))));
});

test('times read as the Pakistan calendar day and a plain "ago"', () => {
  const now = new Date('2026-10-22T04:30:00Z'); // 09:30 PKT
  assert.equal(pktWhen('2026-10-22T03:08:04Z', now), 'Today, 08:08:04');
  assert.equal(pktWhen('2026-10-21T18:30:00Z', now), 'Yesterday, 23:30:00');
  assert.equal(pktWhen('2026-10-21T19:00:00Z', now), 'Today, 00:00:00');
  assert.equal(pktWhen('2026-10-19T09:00:00Z', now), '19 Oct, 14:00:00');
  assert.equal(ago('2026-10-22T04:29:30Z', now), 'just now');
  assert.equal(ago('2026-10-22T03:08:04Z', now), '1 h ago');
  assert.equal(ago('2026-10-20T04:30:00Z', now), '2 days ago');
});
