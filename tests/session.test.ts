import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOpen, safeNext } from '../src/lib/session.ts';

test('only the sign-in page and its two routes open without a session', () => {
  for (const p of ['/', '/signin', '/logout']) assert.ok(isOpen(p), p);
  for (const p of ['/dashboard/', '/payments/', '/designer/inquiry/', '/users/']) assert.ok(!isOpen(p), p);
});

test('after signing in, only a same-site screen is a place to go back to', () => {
  assert.equal(safeNext('/payments/?show=error#log'), '/payments/?show=error#log');
  for (const bad of [null, '', 'https://example.com/', '//example.com/x', '/logout', '/signin?x=1', '/'])
    assert.equal(safeNext(bad), '/dashboard/', String(bad));
});
