// Reads the flow API's chains, e.g. "Start<-->raast-api-gateway<-->…-->End", into steps and hops.

export type Dir = 'one' | 'both';

export interface Message {
  /** As the API sends it: "Post PACS002 AUTH". */
  raw: string;
  /** "POST". */
  verb: string;
  /** In house spelling: "pacs.002 AUTH". */
  text: string;
}

export interface ChainStep {
  kind: 'start' | 'end' | 'service';
  /** The service name, or "Start" / "End". */
  name: string;
  /** 1 the first time a service appears in the chain, 2 the second. */
  occurrence: number;
}

export interface Hop {
  /** Indexes into the chain's steps. */
  from: number;
  to: number;
  /** `<-->` is a request and its reply; `-->` is one way. */
  dir: Dir;
  message?: Message;
}

export interface Chain {
  steps: ChainStep[];
  hops: Hop[];
}

const ARROW = /(<-->|-->)/;
// Capitals allowed: the API names some systems in upper case ("CAS").
const SERVICE = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;
const MESSAGE = /^([A-Za-z]+) ([A-Za-z0-9 ]+)$/;

/** "PACS008" → "pacs.008", as the rest of the UI writes it. */
export const houseSpelling = (s: string) => s.replace(/\bPACS(\d{3})\b/gi, (_, n: string) => `pacs.${n}`);

type Token = { t: 'start' | 'end' | 'service' | 'message'; v: string };

function classify(v: string): Token {
  if (/^start$/i.test(v)) return { t: 'start', v };
  if (/^end$/i.test(v)) return { t: 'end', v };
  if (SERVICE.test(v)) return { t: 'service', v };
  if (MESSAGE.test(v)) return { t: 'message', v };
  throw new Error(`unrecognised token "${v}"`);
}

// Strict on purpose: a changed API should fail the pull loudly rather than draw the wrong flow.
export function parseChain(chain: string): Chain {
  const parts = chain.trim().split(ARROW);
  const tokens = parts.filter((_, i) => i % 2 === 0).map((p) => p.trim());
  const arrows = parts.filter((_, i) => i % 2 === 1);
  if (tokens.some((v) => v === '')) throw new Error(`empty token in "${chain}": two arrows in a row, or one at an end`);

  const toks = tokens.map(classify);
  if (toks[0].t !== 'start') throw new Error(`chain must begin with Start, not "${toks[0].v}"`);
  if (toks[toks.length - 1].t !== 'end') throw new Error(`chain must finish with End, not "${toks[toks.length - 1].v}"`);
  toks.forEach((k, i) => {
    if ((k.t === 'start' && i > 0) || (k.t === 'end' && i < toks.length - 1)) throw new Error(`"${k.v}" in the middle of the chain`);
    if (k.t === 'message' && toks[i + 1].t === 'message') throw new Error(`two messages in a row: "${k.v}", "${toks[i + 1].v}"`);
    if (k.t === 'message' && arrows[i - 1] !== arrows[i]) throw new Error(`message "${k.v}" has different arrows on each side`);
  });

  const steps: ChainStep[] = [];
  const hops: Hop[] = [];
  const seen = new Map<string, number>();
  let message: Message | undefined;
  toks.forEach((k, i) => {
    if (k.t === 'message') {
      const [, verb, text] = k.v.match(MESSAGE)!;
      message = { raw: k.v, verb: verb.toUpperCase(), text: houseSpelling(text) };
      return;
    }
    const name = k.t === 'start' ? 'Start' : k.t === 'end' ? 'End' : k.v;
    const occurrence = (seen.get(name) ?? 0) + 1;
    seen.set(name, occurrence);
    steps.push({ kind: k.t, name, occurrence });
    if (steps.length > 1) {
      hops.push({ from: steps.length - 2, to: steps.length - 1, dir: arrows[i - 1] === '<-->' ? 'both' : 'one', ...(message && { message }) });
      message = undefined;
    }
  });
  return { steps, hops };
}

/** A step and its neighbours in the API's own notation, e.g. "a-->b<-->Post PACS002 AUTH<-->c". */
export function excerpt(chain: string, index: number): string {
  const parts = chain.trim().split(ARROW);
  // Steps sit at even positions once message tokens are skipped; find where step `index` is in `parts`.
  const at: number[] = [];
  parts.forEach((p, i) => {
    if (i % 2 === 0 && classify(p.trim()).t !== 'message') at.push(i);
  });
  const lo = index > 0 ? at[index - 1] : at[index];
  const hi = index < at.length - 1 ? at[index + 1] : at[index];
  return parts
    .slice(lo, hi + 1)
    .map((p) => p.trim())
    .join('');
}
