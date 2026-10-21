import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLines, yaml } from '../src/lib/yaml.ts';

test('maps, lists, nested lists of maps and scalars', () => {
  const out = yaml({
    name: 'rest-bill-marking',
    timeoutMs: 4000,
    durable: true,
    schema: null,
    checks: ['inquiry ID exists', 'inquiry is OPEN'],
    headers: { convert: { 'x-request-id': 'X-Correlation-Id' } },
    steps: [{ id: 1, run: 'map' }, 'done'],
    empty: [],
  });
  assert.equal(
    out,
    [
      'name: rest-bill-marking',
      'timeoutMs: 4000',
      'durable: true',
      'schema: null',
      'checks:',
      '  - inquiry ID exists',
      '  - inquiry is OPEN',
      'headers:',
      '  convert:',
      '    x-request-id: X-Correlation-Id',
      'steps:',
      '  - id: 1',
      '    run: map',
      '  - done',
      'empty: []',
    ].join('\n'),
  );
});

test('quotes what YAML would otherwise misread', () => {
  assert.equal(yaml({ a: '15:39:02', b: 'true', c: '4350.00', d: 'https://biller.example/ws' }), [
    'a: "15:39:02"',
    'b: "true"',
    'c: "4350.00"',
    'd: "https://biller.example/ws"',
  ].join('\n'));
  assert.equal(yaml({ 'Content Type': 'x' }), '"Content Type": x');
});

test('a trailing " # note" becomes a comment token', () => {
  assert.equal(yaml({ inquiryId: 'TBC # open in the doc' }), 'inquiryId: TBC # open in the doc');
  const [line] = toLines({ inquiryId: 'TBC # open in the doc' });
  assert.deepEqual(
    line.toks.map((t) => t.k),
    ['key', 'punct', 'punct', 'str', 'comment'],
  );
});
