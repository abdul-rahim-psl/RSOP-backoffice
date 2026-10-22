import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLog, type LogSource, type RawEntry } from '../src/data/api/bill-log.ts';
import { buildDashboard } from '../src/data/dashboard.ts';

// Times are UTC; Pakistan is UTC+5, so 19:00Z is midnight PKT.
const raw = (id: number, at: string, code: string | null, desc: string | null = null): RawEntry => ({
  id,
  ipAddress: '10.0.70.144',
  requestDate: at,
  requestHeaders: 'x-request-id:r' + id,
  responseDate: code === null ? null : new Date(Date.parse(at) + 200).toISOString(),
  responseHeaders: null,
  rrn: null,
  stan: null,
  correlationId: null,
  uid: 'REF' + id,
  responseCode: code,
  responseDesc: desc,
  originalMessageId: null,
});
const src = (entries: RawEntry[], live = true, fetchedAt = '2026-10-22T06:00:00Z'): LogSource => ({
  live,
  url: 'http://log.test',
  fetchedAt,
  entries: readLog(entries),
});

const now = new Date('2026-10-22T06:00:00Z'); // 11:00 PKT
const inquiries = src([
  raw(1, '2026-10-22T03:10:00Z', '0'), // 08:10 PKT
  raw(2, '2026-10-22T03:20:00Z', '101', 'Bill Reference not found'),
  raw(3, '2026-10-22T05:30:00Z', null), // 10:30, no reply
  raw(4, '2026-10-21T19:30:00Z', '0'), // 00:30 PKT today
  raw(5, '2026-10-21T18:30:00Z', '0'), // 23:30 PKT yesterday
]);
const payments = src([raw(10, '2026-10-22T04:00:00Z', '0'), raw(11, '2026-10-22T05:59:00Z', null)]);

test('counts only today by the Pakistan calendar, across UTC midnight', () => {
  const d = buildDashboard(inquiries, payments, now);
  assert.equal(d.today, true);
  assert.deepEqual(d.inquiry.entries.map((e) => e.id), [3, 2, 1, 4]);
  assert.deepEqual(d.inquiry.sum.counts, { returned: 2, error: 1, silent: 1 });
  assert.deepEqual(d.payment.sum.counts, { returned: 1, error: 0, silent: 1 });
  assert.equal(d.hours[0], '00:00', 'from the first hour with activity');
  assert.equal(d.hours.at(-1), '11:00', 'to the hour of the read');
});

test('each hourly series adds up to its count and lands in the right hour', () => {
  const d = buildDashboard(inquiries, payments, now);
  for (const day of [d.inquiry, d.payment]) {
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    assert.equal(sum(day.hourly.ok), day.sum.counts.returned);
    assert.equal(sum(day.hourly.error), day.sum.counts.error);
    assert.equal(sum(day.hourly.silent), day.sum.counts.silent);
    for (const s of Object.values(day.hourly)) assert.equal(s.length, d.hours.length);
  }
  assert.equal(d.inquiry.hourly.ok[d.hours.indexOf('08:00')], 1);
  assert.equal(d.inquiry.hourly.silent[d.hours.indexOf('10:00')], 1);
});

test('yesterday is compared only when the log reaches back to it', () => {
  const d = buildDashboard(inquiries, payments, now);
  assert.equal(d.inquiry.yesterday, 0, 'entry 5 is yesterday but after this time yesterday');
  assert.equal(d.payment.yesterday, null, 'the payment log starts today');
  const early = src([raw(20, '2026-10-21T04:00:00Z', '0'), raw(21, '2026-10-22T04:00:00Z', '0')]);
  assert.equal(buildDashboard(early, payments, now).inquiry.yesterday, 1);
});

test('latest activity merges both logs, newest first', () => {
  const d = buildDashboard(inquiries, payments, now, 3);
  assert.deepEqual(d.latest.map((l) => [l.log, l.entry.id]), [['payment', 11], ['inquiry', 3], ['payment', 10]]);
});

test('with both logs on snapshots, the figures count up to the newest snapshot', () => {
  const old = '2026-10-20T09:00:00Z'; // 14:00 PKT, two days earlier
  const d = buildDashboard(src([raw(30, '2026-10-20T08:00:00Z', '0')], false, old), src([], false, '2026-10-19T09:00:00Z'), now);
  assert.equal(d.asOf, old);
  assert.equal(d.today, false);
  assert.equal(d.inquiry.sum.total, 1);
  assert.deepEqual(d.hours, ['13:00', '14:00']);
});
