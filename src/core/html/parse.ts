/**
 * A small, tolerant HTML scanner.
 *
 * Deliberately dependency-free: the audit engine only needs element names,
 * attributes and text, and a forgiving scanner handles real-world markup
 * (unclosed tags, unquoted attributes, raw <script> bodies) without pulling in
 * a full parser. It is not a spec-compliant HTML5 tree builder and does not
 * execute JavaScript — see docs/SEO_ENGINE.md for what that implies.
 */
export type Attrs = Record<string, string>;
export type El = { tag: string; attrs: Attrs; text: string; depth: number; ancestors: string[] };

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
]);
const RAW = new Set(['script', 'style', 'textarea', 'title']);

export type Doc = { els: El[]; text: string };

export function parseHtml(html: string): Doc {
  const els: El[] = [];
  const textParts: string[] = [];
  const stack: string[] = [];
  let i = 0;
  const n = html.length;

  while (i < n) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      textParts.push(html.slice(i));
      break;
    }
    if (lt > i) textParts.push(html.slice(i, lt));

    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt);
      i = end === -1 ? n : end + 1;
      continue;
    }

    const gt = findTagEnd(html, lt);
    if (gt === -1) {
      textParts.push(html.slice(lt));
      break;
    }
    const inner = html.slice(lt + 1, gt).trim();
    i = gt + 1;

    if (inner.startsWith('/')) {
      const tag = inner.slice(1).trim().toLowerCase();
      const at = stack.lastIndexOf(tag);
      if (at !== -1) stack.length = at;
      continue;
    }

    const selfClosing = inner.endsWith('/');
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const m = /^([a-zA-Z][\w:-]*)/.exec(body);
    if (!m) continue;
    const tag = m[1].toLowerCase();
    const attrs = parseAttrs(body.slice(m[1].length));
    const depth = stack.length;
    const ancestors = stack.slice();

    let text = '';
    if (RAW.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, 'i').exec(html.slice(i));
      if (close) {
        text = html.slice(i, i + close.index);
        i += close.index + close[0].length;
      } else {
        text = html.slice(i);
        i = n;
      }
      if (tag !== 'script' && tag !== 'style') textParts.push(text);
    } else if (!selfClosing && !VOID.has(tag)) {
      stack.push(tag);
      text = innerTextOf(html, i, tag);
    }

    els.push({
      tag,
      attrs,
      text: tag === 'script' || tag === 'style' ? text : decode(text).trim(),
      depth,
      ancestors,
    });
  }

  return { els, text: normalizeWs(decode(textParts.join(' '))) };
}

/** Scans to the '>' that closes a tag, respecting quoted attribute values. */
function findTagEnd(html: string, from: number): number {
  let q: string | null = null;
  for (let k = from + 1; k < html.length; k++) {
    const c = html[k];
    if (q) {
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") q = c;
    else if (c === '>') return k;
  }
  return -1;
}

function parseAttrs(s: string): Attrs {
  const attrs: Attrs = {};
  const re = /([^\s"'=<>/]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const name = m[1].toLowerCase();
    if (!name) continue;
    attrs[name] = decode(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return attrs;
}

/** Best-effort inner text: content up to the matching close tag (no re-nesting). */
function innerTextOf(html: string, from: number, tag: string): string {
  const close = new RegExp(`</${tag}\\s*>`, 'i').exec(html.slice(from, from + 20000));
  const chunk = close ? html.slice(from, from + close.index) : html.slice(from, from + 2000);
  return stripTags(chunk);
}

export function stripTags(s: string): string {
  return normalizeWs(s.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' '));
}

export function normalizeWs(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-',
  hellip: '...', rsquo: "'", lsquo: "'", ldquo: '"', rdquo: '"', copy: '(c)', reg: '(r)', trade: '(tm)',
};
export function decode(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : full;
    }
    return ENTITIES[body.toLowerCase()] ?? full;
  });
}

export const byTag = (doc: Doc, tag: string): El[] => doc.els.filter((e) => e.tag === tag);

/** True when the element sits inside one of the given ancestor tags (e.g. an SVG <title>). */
export const insideAny = (e: El, tags: string[]): boolean => e.ancestors.some((a) => tags.includes(a));

/** Document-level elements only: skips anything nested in inline SVG, templates or noscript. */
export const byTagInDocument = (doc: Doc, tag: string): El[] =>
  doc.els.filter((e) => e.tag === tag && !insideAny(e, ['svg', 'template', 'noscript']));

export function metaContent(doc: Doc, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const e of doc.els) {
    if (e.tag !== 'meta') continue;
    const key = (e.attrs['name'] || e.attrs['property'] || e.attrs['http-equiv'] || '').toLowerCase();
    if (key === lower) return e.attrs['content'];
  }
  return undefined;
}

export function linkHref(doc: Doc, rel: string): string | undefined {
  const lower = rel.toLowerCase();
  for (const e of doc.els) {
    if (e.tag !== 'link') continue;
    const rels = (e.attrs['rel'] || '').toLowerCase().split(/\s+/);
    if (rels.includes(lower)) return e.attrs['href'];
  }
  return undefined;
}
