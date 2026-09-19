/**
 * NOTE FORMATTING — a small, safe subset of Markdown.
 *
 * Round: Planner rework, Sep 2026. AJ asked for a "rich-text editor". A true
 * rich-text editor stores HTML, and HTML in a note that is copied onto a
 * client's record and shown to the whole team is a script-injection risk the
 * rules cannot check. It also needs a heavy editor library on an iPad.
 *
 * So a note stays plain text, with a handful of marks a trainer can type or
 * tap from the toolbar, and the screen draws them:
 *
 *   # Heading / ## Smaller heading
 *   - a bullet            1. a numbered step
 *   - [ ] a checklist     - [x] a ticked item
 *   > a quote             ---  a divider
 *   **bold**   *italic*   [a link](https://…)   and bare https:// links
 *
 * Old notes are already plain text and read exactly as before. Nothing is
 * ever rendered as HTML: this module returns a tree, and NoteBody.tsx turns
 * it into React elements. Only http(s) links are ever made clickable.
 *
 * PURE MODULE — no React.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export interface ListItem {
  c: Inline[];
  /** null: a plain bullet; true/false: a checklist item. */
  check: boolean | null;
  /** The body line it came from, for ticking it. */
  line: number;
}

export type Block =
  | { t: "h"; level: 1 | 2; c: Inline[] }
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: ListItem[] }
  | { t: "ol"; items: ListItem[] }
  | { t: "quote"; c: Inline[] }
  | { t: "hr" };

const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

/** A URL a note may link to, or null. */
export function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (!SAFE_URL.test(url)) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Inline marks. Links first (their label may hold marks), then bold, then
 * italic, then bare URLs in what is left. Unclosed marks stay as typed.
 */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  // [label](url) | **bold** | *italic* | _italic_ | https://bare
  //
  // No lookbehind: iPads before iPadOS 16.4 cannot parse it, and a regex the
  // engine cannot parse fails the whole Planner, not just this line. The
  // character before an italic mark is captured instead and put back.
  const re = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+?)\*\*|(^|[^\w*])\*([^*\n]+?)\*(?![\w*])|(^|[^\w_])_([^_\n]+?)_(?![\w_])|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/;
  while (rest.length) {
    const m = re.exec(rest);
    if (!m) {
      out.push({ t: "text", v: rest });
      break;
    }
    if (m.index > 0) out.push({ t: "text", v: rest.slice(0, m.index) });
    const [whole, label, href, bold, starPre, star, underPre, under, bare] = m;
    if (label !== undefined && href !== undefined) {
      const safe = safeHref(href);
      out.push(safe ? { t: "link", href: safe, c: parseInline(label) } : { t: "text", v: whole });
    } else if (bold !== undefined) {
      out.push({ t: "b", c: parseInline(bold) });
    } else if (star !== undefined || under !== undefined) {
      const pre = (star !== undefined ? starPre : underPre) ?? "";
      if (pre) out.push({ t: "text", v: pre });
      out.push({ t: "i", c: parseInline((star ?? under)!) });
    } else if (bare !== undefined) {
      const safe = safeHref(bare);
      out.push(safe ? { t: "link", href: safe, c: [{ t: "text", v: bare }] } : { t: "text", v: bare });
    }
    rest = rest.slice(m.index + whole.length);
  }
  return merge(out);
}

function merge(list: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const n of list) {
    const last = out[out.length - 1];
    if (n.t === "text" && last?.t === "text") last.v += n.v;
    else if (n.t !== "text" || n.v) out.push(n);
  }
  return out;
}

const BULLET = /^\s*[-*•]\s+(?:\[( |x|X)\]\s+)?(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;

export function parseNote(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ t: "p", c: parseInline(para.join("\n")) });
      para = [];
    }
  };
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      return;
    }
    const h = HEADING.exec(trimmed);
    if (h) {
      flush();
      blocks.push({ t: "h", level: h[1].length === 1 ? 1 : 2, c: parseInline(h[2]) });
      return;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ t: "hr" });
      return;
    }
    const b = BULLET.exec(line);
    if (b) {
      flush();
      const item: ListItem = { c: parseInline(b[2]), check: b[1] === undefined ? null : b[1].toLowerCase() === "x", line: i };
      const last = blocks[blocks.length - 1];
      if (last?.t === "ul") last.items.push(item);
      else blocks.push({ t: "ul", items: [item] });
      return;
    }
    const n = NUMBERED.exec(line);
    if (n) {
      flush();
      const item: ListItem = { c: parseInline(n[1]), check: null, line: i };
      const last = blocks[blocks.length - 1];
      if (last?.t === "ol") last.items.push(item);
      else blocks.push({ t: "ol", items: [item] });
      return;
    }
    if (trimmed.startsWith(">")) {
      flush();
      const text = trimmed.replace(/^>\s?/, "");
      const last = blocks[blocks.length - 1];
      if (last?.t === "quote") last.c = merge([...last.c, { t: "text", v: "\n" }, ...parseInline(text)]);
      else blocks.push({ t: "quote", c: parseInline(text) });
      return;
    }
    para.push(line);
  });
  flush();
  return blocks;
}

/** Ticks or unticks the checklist item on one line. Other lines are untouched. */
export function toggleCheck(body: string, line: number): string {
  const lines = body.split("\n");
  const src = lines[line];
  if (src === undefined) return body;
  const m = /^(\s*[-*•]\s+)\[( |x|X)\](\s+.*)$/.exec(src);
  if (!m) return body;
  lines[line] = `${m[1]}[${m[2] === " " ? "x" : " "}]${m[3]}`;
  return lines.join("\n");
}

/** Checklist counts, for the list card: "2 of 5 ticked". */
export function checklistCount(body: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const line of body.split("\n")) {
    const m = /^\s*[-*•]\s+\[( |x|X)\]\s+/.exec(line);
    if (!m) continue;
    total += 1;
    if (m[1] !== " ") done += 1;
  }
  return { done, total };
}

/** The body as plain words, marks removed — for excerpts and search. */
export function plainText(body: string): string {
  return body
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|$|[.,;:!?])/g, "$1$2")
    .replace(/^\s*#{1,3}\s+/gm, "")
    .replace(/^\s*[-*•]\s+\[( |x|X)\]\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, "");
}

/* ------------------------------------------------------------------ *
 * The toolbar: what a tap does to the text and the selection
 * ------------------------------------------------------------------ */

export type FormatAction = "h" | "ul" | "check" | "ol" | "quote" | "bold" | "italic" | "link";

export interface Edit {
  text: string;
  selStart: number;
  selEnd: number;
}

const LINE_PREFIX: Record<"h" | "ul" | "check" | "ol" | "quote", string> = {
  h: "## ",
  ul: "- ",
  check: "- [ ] ",
  ol: "1. ",
  quote: "> ",
};

const ANY_PREFIX = /^(\s*)(#{1,3}\s+|[-*•]\s+\[[ xX]\]\s+|[-*•]\s+|\d{1,3}[.)]\s+|>\s?)/;

/**
 * Applies a toolbar action to a text and its selection.
 *
 * Line actions set (or, when already set, clear) the prefix on every line the
 * selection touches; a numbered list counts up. Inline actions wrap the
 * selection, or insert a placeholder to type over.
 */
export function applyFormat(text: string, selStart: number, selEnd: number, action: FormatAction): Edit {
  if (action === "bold" || action === "italic" || action === "link") {
    const chosen = text.slice(selStart, selEnd);
    if (action === "link") {
      const label = chosen || "link text";
      const insert = `[${label}](https://)`;
      const next = text.slice(0, selStart) + insert + text.slice(selEnd);
      // Put the cursor where the address goes.
      const at = selStart + label.length + 3 + "https://".length;
      return { text: next, selStart: at, selEnd: at };
    }
    const mark = action === "bold" ? "**" : "*";
    const inner = chosen || (action === "bold" ? "bold" : "italic");
    const next = text.slice(0, selStart) + mark + inner + mark + text.slice(selEnd);
    return { text: next, selStart: selStart + mark.length, selEnd: selStart + mark.length + inner.length };
  }

  const lineStart = text.lastIndexOf("\n", selStart - 1) + 1;
  const endNl = text.indexOf("\n", Math.max(selEnd - (selEnd > selStart && text[selEnd - 1] === "\n" ? 1 : 0), selStart));
  const lineEnd = endNl === -1 ? text.length : endNl;
  const block = text.slice(lineStart, lineEnd).split("\n");
  const want = LINE_PREFIX[action];
  const allHave = block.every((l) =>
    action === "ol" ? /^\s*\d{1,3}[.)]\s+/.test(l) : l.trimStart().startsWith(want) && (action !== "ul" || !/^\s*[-*•]\s+\[/.test(l)),
  );
  let n = 0;
  const changed = block.map((l) => {
    const bare = l.replace(ANY_PREFIX, "$1");
    if (allHave) return bare;
    if (!bare.trim() && block.length > 1) return bare;
    n += 1;
    return action === "ol" ? `${n}. ${bare.trimStart()}` : `${want}${bare.trimStart()}`;
  });
  const replaced = changed.join("\n");
  const next = text.slice(0, lineStart) + replaced + text.slice(lineEnd);
  const end = lineStart + replaced.length;
  return block.length === 1
    ? { text: next, selStart: end, selEnd: end }
    : { text: next, selStart: lineStart, selEnd: end };
}
