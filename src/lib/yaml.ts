// Turns plain data into YAML lines made of typed tokens, so the inspector can colour them at build time.

export type Yaml = string | number | boolean | null | Yaml[] | { [key: string]: Yaml };

export type TokKind = 'key' | 'str' | 'num' | 'bool' | 'null' | 'punct' | 'comment';

export interface Tok {
  k: TokKind;
  v: string;
}

export interface Line {
  indent: number;
  toks: Tok[];
}

/** A string value may end in ` # note`; the note becomes a YAML comment (used for TBC values). */
const COMMENT = ' # ';
const RESERVED = /^(true|false|null|yes|no|on|off|~)$/i;
const PLAIN = /^[A-Za-z_./$][\w ./$@{}()+,'-]*$/;
const PLAIN_KEY = /^[A-Za-z_][\w.-]*$/;

type Scalar = string | number | boolean | null;

const isScalar = (v: Yaml): v is Scalar => v === null || typeof v !== 'object';

function quote(s: string): string {
  const plain = PLAIN.test(s) && !RESERVED.test(s) && !s.endsWith(' ') && !s.includes(' #');
  // YAML's double-quoted style accepts JSON string escapes as they are.
  return plain ? s : JSON.stringify(s);
}

function scalar(v: Scalar): Tok[] {
  if (v === null) return [{ k: 'null', v: 'null' }];
  if (typeof v === 'boolean') return [{ k: 'bool', v: String(v) }];
  if (typeof v === 'number') return [{ k: 'num', v: String(v) }];
  const at = v.lastIndexOf(COMMENT);
  const text = at >= 0 ? v.slice(0, at) : v;
  const note = at >= 0 ? v.slice(at + COMMENT.length) : '';
  const toks: Tok[] = text ? [{ k: 'str', v: quote(text) }] : [];
  if (note) toks.push({ k: 'comment', v: `${toks.length ? ' ' : ''}# ${note}` });
  return toks;
}

const afterColon = (toks: Tok[]): Tok[] => (toks.length ? [{ k: 'punct', v: ' ' }, ...toks] : []);

function block(v: Yaml, indent: number): Line[] {
  if (isScalar(v)) return [{ indent, toks: scalar(v) }];

  if (Array.isArray(v)) {
    const out: Line[] = [];
    for (const item of v) {
      if (isScalar(item)) {
        out.push({ indent, toks: [{ k: 'punct', v: '- ' }, ...scalar(item)] });
        continue;
      }
      // A nested map or list starts on the dash line; its other lines align under its first key.
      const inner = block(item, indent + 2);
      inner[0] = { indent, toks: [{ k: 'punct', v: '- ' }, ...inner[0].toks] };
      out.push(...inner);
    }
    return out;
  }

  const out: Line[] = [];
  for (const [key, val] of Object.entries(v)) {
    const head: Tok[] = [
      { k: 'key', v: PLAIN_KEY.test(key) ? key : JSON.stringify(key) },
      { k: 'punct', v: ':' },
    ];
    if (isScalar(val)) out.push({ indent, toks: [...head, ...afterColon(scalar(val))] });
    else if (Array.isArray(val) && !val.length) out.push({ indent, toks: [...head, { k: 'punct', v: ' []' }] });
    else if (!Array.isArray(val) && !Object.keys(val).length) out.push({ indent, toks: [...head, { k: 'punct', v: ' {}' }] });
    else out.push({ indent, toks: head }, ...block(val, indent + 2));
  }
  return out;
}

export const toLines = (value: Yaml): Line[] => block(value, 0);

export const toText = (lines: Line[]): string =>
  lines.map((l) => ' '.repeat(l.indent) + l.toks.map((t) => t.v).join('')).join('\n');

export const yaml = (value: Yaml): string => toText(toLines(value));
