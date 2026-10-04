/**
 * DESCRIBING SOMEONE — plain words become filters you can see and remove.
 * Pure: tokens.test.ts.
 *
 * The directory round (Sep 27 2026), research-directory §8.2. AJ (Sep 20):
 * "all our nurses, all female clients, female clients over 60, everyone
 * who's five foot six" — the purpose is "find me someone like this". The
 * search field takes names AND descriptions: a small grammar that runs on
 * the iPad turns the words it knows into TOKENS, shown on an "Understood
 * as:" line, each removable. Anything it does not understand stays a name
 * search. It never guesses silently:
 *
 *   gender       female, women, woman, ladies · male, men, man, gentlemen
 *   age          over 60, 60+, 60 and up, older than 60 · under 50, younger
 *                than 50 · 70s, seventies, in her 70s · 60-70, between 60
 *                and 70
 *   occupation   a word that matches an occupation ON FILE, stemmed
 *                ("nurses", "nursing" → nurse) · retired
 *   height       5'6, 5′6″, 5 ft 6, 5 foot 6, 66 in, 168 cm
 *   renewal      renewing / renews / up for renewal / contract ending, then
 *                this week · next week · this month · next month · in or
 *                within 3 weeks / 30 days · in November · soon; alone it is
 *                the next 30 days (AJ, Oct 3 2026). Matched on the row's
 *                renewal day, the one the Renewal sort reads.
 *
 * A word that is both a name on the roster and an occupation on file
 * ("Baker", "Cook", "Porter") is left a NAME and reported as ambiguous, so
 * the screen can offer it as an occupation instead — never a guess.
 *
 * Filtering says what it does not know: a client with no occupation on file
 * is not a match for "nurse", and she is COUNTED ("41 have no occupation on
 * file"), so a filter never implies a completeness it doesn't have.
 */
import type { DirectoryRow } from "./row";
import { heightWords, plainHeightText } from "./row";
import { normalizeName } from "./search";
import { parseHeightInches } from "../machine-trends/trends";
import { addDays, weekdayOf } from "../client-history/model";

export type TokenKind = "gender" | "age" | "occupation" | "height" | "renews";

export type Token =
  | { kind: "gender"; value: "female" | "male"; label: string; source: string }
  | { kind: "age"; min: number | null; max: number | null; label: string; source: string }
  | { kind: "occupation"; stem: string; label: string; source: string }
  | { kind: "height"; inches: number; label: string; source: string }
  /** A window of studio days, both ends included (`YYYY-MM-DD`). */
  | { kind: "renews"; from: string; to: string; label: string; source: string };

export interface Ambiguity {
  /** The word as typed. */
  word: string;
  /** The occupation it would be. */
  occupation: string;
  /** How many clients have it as a name. */
  asName: number;
  /** How many have it as an occupation. */
  asOccupation: number;
}

export interface ParsedQuery {
  tokens: Token[];
  /** What is left for the name search. */
  nameText: string;
  ambiguous: Ambiguity[];
}

/* ------------------------------------------------------------------ */
/* Occupation words, stemmed                                           */
/* ------------------------------------------------------------------ */

/** "nurses", "nursing", "nurse" → "nurs"; "teachers" → "teacher"; "retired" stays. */
export function stemWord(word: string): string {
  let w = normalizeName(word);
  if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
  else if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith("es") && !w.endsWith("ies")) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

/** The occupation words on file: stem → how it is spelt most often, and how many clients. */
export interface OccupationVocab {
  words: Map<string, { display: string; count: number }>;
}

const OCC_SKIP = new Set(["a", "an", "the", "of", "and", "at", "in", "for", "to", "on", "or"]);

function occupationStems(row: Pick<DirectoryRow, "occupation">): Set<string> {
  const out = new Set<string>();
  for (const w of (row.occupation.text ?? "").split(/[^A-Za-z\u00c0-\u024f]+/)) {
    if (!w || OCC_SKIP.has(w.toLowerCase())) continue;
    out.add(stemWord(w));
  }
  if (row.occupation.retired) out.add(stemWord("retired"));
  return out;
}

export function buildOccupationVocab(rows: ReadonlyArray<Pick<DirectoryRow, "occupation">>): OccupationVocab {
  const counts = new Map<string, Map<string, number>>();
  const clients = new Map<string, number>();
  for (const row of rows) {
    const stems = occupationStems(row);
    for (const s of stems) clients.set(s, (clients.get(s) ?? 0) + 1);
    for (const w of (row.occupation.text ?? "").split(/[^A-Za-z\u00c0-\u024f]+/)) {
      if (!w || OCC_SKIP.has(w.toLowerCase())) continue;
      const s = stemWord(w);
      const spell = counts.get(s) ?? new Map<string, number>();
      spell.set(w.toLowerCase(), (spell.get(w.toLowerCase()) ?? 0) + 1);
      counts.set(s, spell);
    }
    if (row.occupation.retired && !counts.has(stemWord("retired"))) counts.set(stemWord("retired"), new Map([["retired", 1]]));
  }
  const words = new Map<string, { display: string; count: number }>();
  for (const [stem, spell] of counts) {
    const display = [...spell.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    words.set(stem, { display, count: clients.get(stem) ?? 0 });
  }
  return { words };
}

/* ------------------------------------------------------------------ */
/* The grammar                                                         */
/* ------------------------------------------------------------------ */

const FEMALE = new Set(["female", "females", "woman", "women", "ladies", "lady"]);
const MALE = new Set(["male", "males", "man", "men", "gentlemen", "gentleman"]);
const DECADE_WORDS: Record<string, number> = { forties: 40, fifties: 50, sixties: 60, seventies: 70, eighties: 80, nineties: 90 };
/** Dropped only when the query described someone; on their own they stay a name search. */
const FILLER = new Set(["all", "our", "the", "who", "whos", "who's", "is", "are", "clients", "client", "people", "everyone", "anyone", "and", "with", "that", "of", "a", "an", "in", "her", "his", "their", "aged", "age", "years", "old"]);

const n = (s: string) => Number(s);

function ageToken(min: number | null, max: number | null, source: string): Token {
  const label =
    min !== null && max !== null
      ? `Age: ${min}\u2013${max}`
      : min !== null
        ? `Age: ${min} and over`
        : `Age: under ${(max as number) + 1}`;
  return { kind: "age", min, max, label, source };
}

interface Extract {
  re: RegExp;
  make: (m: RegExpExecArray) => Token | null;
}

/** Height and age phrases, tried on the whole text before it is split into words. */
const PHRASES: Extract[] = [
  // 5'6, 5'6", 5′6″, 5 ft 6, 5 foot 6 in, 5ft6
  {
    re: /\b(\d)\s*(?:'|ft\.?|feet|foot)\s*(\d{1,2})?\s*(?:"|in\b\.?|inches\b)?/gi,
    make: (m) => {
      const inches = parseHeightInches(`${m[1]}'${m[2] ?? "0"}"`);
      return inches === null ? null : { kind: "height", inches, label: `Height: ${heightWords(inches)}`, source: m[0].trim() };
    },
  },
  // 66 in, 66 inches
  {
    re: /\b(\d{2})\s*(?:in|inches)\b/gi,
    make: (m) => {
      const inches = parseHeightInches(m[1]);
      return inches === null ? null : { kind: "height", inches, label: `Height: ${heightWords(inches)}`, source: m[0].trim() };
    },
  },
  // 168 cm
  {
    re: /\b(\d{3})\s*cm\b/gi,
    make: (m) => {
      const inches = Math.round(n(m[1]) / 2.54);
      return inches < 36 || inches > 96 ? null : { kind: "height", inches, label: `Height: ${heightWords(inches)}`, source: m[0].trim() };
    },
  },
  // between 60 and 70, 60-70, 60 to 70
  {
    re: /\b(?:between\s+)?(\d{2})\s*(?:-|\u2013|to|and)\s*(\d{2})\b/gi,
    make: (m) => {
      const a = n(m[1]);
      const b = n(m[2]);
      return a < b ? ageToken(a, b, m[0].trim()) : null;
    },
  },
  // over 60, older than 60, 60+, 60 and up / and over / and older
  {
    re: /\b(?:over|older\s+than|above)\s+(\d{2})\b|\b(\d{2})\s*(?:\+|and\s+(?:up|over|older))/gi,
    make: (m) => ageToken(n(m[1] ?? m[2]), null, m[0].trim()),
  },
  // under 50, younger than 50, below 50
  {
    re: /\b(?:under|younger\s+than|below)\s+(\d{2})\b/gi,
    make: (m) => ageToken(null, n(m[1]) - 1, m[0].trim()),
  },
  // 70s, in her 70s, seventies
  {
    re: /\b(?:in\s+(?:her|his|their)\s+)?(\d)0'?s\b|\b(forties|fifties|sixties|seventies|eighties|nineties)\b/gi,
    make: (m) => {
      const decade = m[1] ? n(m[1]) * 10 : DECADE_WORDS[m[2].toLowerCase()];
      return decade >= 20 ? ageToken(decade, decade + 9, m[0].trim()) : null;
    },
  },
];

/* ------------------------------------------------------------------ */
/* Renewal windows                                                     */
/* ------------------------------------------------------------------ */

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const RENEW_RE = new RegExp(
  String.raw`\b(?:up\s+for\s+renewal|renew(?:s|ing|al|als)?|contracts?\s+(?:ending|ends|end))\b(?:\s+(?:clients?|contracts?|packages?|on|by))?(?:\s+(this\s+week|next\s+week|this\s+month|next\s+month|soon|(?:in|within|in\s+the\s+next|next)\s+(\d{1,3})\s+(days?|weeks?)|(?:in\s+)?(${MONTH_RE})\b))?`,
  "gi",
);

function monthEnd(year: number, month0: number): string {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function monthStart(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}-01`;
}

/** The window a renewal phrase means, from the studio's today. */
export function renewalWindow(m: RegExpExecArray, today: string): { from: string; to: string; label: string } | null {
  const when = (m[1] ?? "").toLowerCase().replace(/\s+/g, " ");
  const year = Number(today.slice(0, 4));
  const month0 = Number(today.slice(5, 7)) - 1;
  // Monday to Sunday, the studio's week.
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  if (!when || when === "soon") return { from: today, to: addDays(today, 30), label: "Renewal: next 30 days" };
  if (when === "this week") return { from: monday, to: addDays(monday, 6), label: "Renewal: this week" };
  if (when === "next week") return { from: addDays(monday, 7), to: addDays(monday, 13), label: "Renewal: next week" };
  if (when === "this month") return { from: monthStart(year, month0), to: monthEnd(year, month0), label: "Renewal: this month" };
  if (when === "next month") {
    const y = month0 === 11 ? year + 1 : year;
    const mo = (month0 + 1) % 12;
    return { from: monthStart(y, mo), to: monthEnd(y, mo), label: "Renewal: next month" };
  }
  if (m[2]) {
    const count = Number(m[2]);
    if (count < 1) return null;
    const days = /^week/.test(m[3].toLowerCase()) ? count * 7 : count;
    return { from: today, to: addDays(today, days), label: `Renewal: next ${count} ${m[3].toLowerCase().replace(/s$/, "")}${count === 1 ? "" : "s"}` };
  }
  if (m[4]) {
    const mo = MONTHS.findIndex((name) => name.startsWith(m[4].toLowerCase().slice(0, 3)));
    if (mo < 0) return null;
    // The next one: a month already gone this year means next year's.
    const y = mo < month0 ? year + 1 : year;
    const name = MONTHS[mo].charAt(0).toUpperCase() + MONTHS[mo].slice(1);
    return { from: monthStart(y, mo), to: monthEnd(y, mo), label: `Renewal: ${name}${y === year ? "" : ` ${y}`}` };
  }
  return null;
}

export interface ParseOptions {
  /** The studio's day; without it a renewal phrase is not read. */
  today?: string;
  /** Every name word on the roster (first, nickname, last), normalised → how many clients. */
  names?: ReadonlyMap<string, number>;
  /** Words the trainer chose to read as an occupation after an ambiguity. */
  asOccupation?: ReadonlySet<string>;
}

/** Every normalised first, nickname and last name on the roster, counted by client. */
export function buildNameVocab(rows: ReadonlyArray<Pick<DirectoryRow, "name">>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    const words = new Set([r.name.first, r.name.nickname ?? "", r.name.last].flatMap((x) => x.split(/[\s-]+/)).map(normalizeName).filter(Boolean));
    for (const w of words) out.set(w, (out.get(w) ?? 0) + 1);
  }
  return out;
}

export function parseQuery(input: string, occupations: OccupationVocab, opts: ParseOptions = {}): ParsedQuery {
  let text = ` ${plainHeightText(input ?? "")} `;
  const tokens: Token[] = [];
  if (opts.today) {
    const today = opts.today;
    RENEW_RE.lastIndex = 0;
    text = text.replace(RENEW_RE, (...args) => {
      const match = Object.assign([...args.slice(0, -2)], { index: args[args.length - 2] as number, input: text }) as unknown as RegExpExecArray;
      const w = renewalWindow(match, today);
      if (!w) return match[0];
      tokens.push({ kind: "renews", ...w, source: match[0].trim() });
      return " ";
    });
  }
  for (const { re, make } of PHRASES) {
    re.lastIndex = 0;
    text = text.replace(re, (...args) => {
      const m = args as unknown as RegExpExecArray;
      // Rebuild the exec-shaped match the makers read.
      const match = Object.assign([...args.slice(0, -2)], { index: args[args.length - 2] as number, input: text }) as unknown as RegExpExecArray;
      const token = make(match);
      if (!token) return m[0];
      tokens.push(token);
      return " ";
    });
  }

  const nameWordsLeft: string[] = [];
  const ambiguous: Ambiguity[] = [];
  const pending: string[] = [];
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    const word = raw.toLowerCase().replace(/[.,;:!?]+$/g, "");
    if (!word) continue;
    if (FEMALE.has(word)) {
      tokens.push({ kind: "gender", value: "female", label: "Gender: female", source: raw });
      continue;
    }
    if (MALE.has(word)) {
      tokens.push({ kind: "gender", value: "male", label: "Gender: male", source: raw });
      continue;
    }
    const stem = stemWord(word);
    const occ = stem.length >= 3 ? occupations.words.get(stem) : undefined;
    if (occ) {
      const asName = opts.names?.get(normalizeName(word)) ?? 0;
      if (asName > 0 && !opts.asOccupation?.has(word)) {
        ambiguous.push({ word: raw, occupation: occ.display, asName, asOccupation: occ.count });
        nameWordsLeft.push(raw);
        continue;
      }
      tokens.push({ kind: "occupation", stem, label: `Occupation: ${occ.display}`, source: raw });
      continue;
    }
    pending.push(raw);
  }
  // Filler words ("clients", "who's", "all") only describe; on their own they
  // are someone's name as far as anyone can tell, so they stay a name search.
  for (const raw of pending) {
    if (tokens.length > 0 && FILLER.has(raw.toLowerCase().replace(/[.,;:!?]+$/g, ""))) continue;
    nameWordsLeft.push(raw);
  }
  // One token of a kind is enough; a second of the same kind replaces the first.
  const byKind = new Map<string, Token>();
  for (const t of tokens) byKind.set(t.kind === "occupation" ? `occupation:${t.stem}` : t.kind, t);
  return { tokens: [...byKind.values()], nameText: nameWordsLeft.join(" "), ambiguous };
}

/* ------------------------------------------------------------------ */
/* Applying tokens                                                     */
/* ------------------------------------------------------------------ */

/** true / false, or null when the row has nothing on file to judge by. */
export function tokenMatches(row: DirectoryRow, t: Token): boolean | null {
  switch (t.kind) {
    case "gender":
      return row.gender === null ? null : row.gender === t.value;
    case "age": {
      const a = row.age.value;
      if (a === null) return null;
      return (t.min === null || a >= t.min) && (t.max === null || a <= t.max);
    }
    case "occupation": {
      if (!row.occupation.text && !row.occupation.retired) return null;
      return occupationStems(row).has(t.stem);
    }
    case "height":
      return row.height.inches === null ? null : row.height.inches === t.inches;
    case "renews":
      // Already renewed is an answer (not in the window); no date is not.
      if (row.renews.state === "renewed") return false;
      if (row.renews.state !== "known" || !row.renews.day) return null;
      return row.renews.day >= t.from && row.renews.day <= t.to;
  }
}

export interface TokenFilter {
  rows: DirectoryRow[];
  /** Per kind: how many of the rows tested had nothing on file for it. */
  notOnFile: Partial<Record<TokenKind, number>>;
}

/** Keep the rows every token matches; count, per kind, the rows it could not judge. */
export function applyTokens(rows: ReadonlyArray<DirectoryRow>, tokens: ReadonlyArray<Token>): TokenFilter {
  if (tokens.length === 0) return { rows: [...rows], notOnFile: {} };
  const notOnFile: Partial<Record<TokenKind, number>> = {};
  const kept: DirectoryRow[] = [];
  for (const row of rows) {
    let ok = true;
    const unknownKinds = new Set<TokenKind>();
    for (const t of tokens) {
      const m = tokenMatches(row, t);
      if (m === null) unknownKinds.add(t.kind);
      if (m !== true) ok = false;
    }
    for (const k of unknownKinds) notOnFile[k] = (notOnFile[k] ?? 0) + 1;
    if (ok) kept.push(row);
  }
  return { rows: kept, notOnFile };
}

const KIND_WORD: Record<TokenKind, string> = { gender: "gender", age: "birth date", occupation: "occupation", height: "height", renews: "renewal date" };

/** "41 have no occupation on file" — one phrase per kind, in the order the tokens were typed. */
export function notOnFileWords(filter: TokenFilter, tokens: ReadonlyArray<Token>): string[] {
  const kinds = [...new Set(tokens.map((t) => t.kind))];
  return kinds
    .filter((k) => (filter.notOnFile[k] ?? 0) > 0)
    .map((k) => {
      const c = filter.notOnFile[k] as number;
      return `${c} ${c === 1 ? "has" : "have"} no ${KIND_WORD[k]} on file`;
    });
}
