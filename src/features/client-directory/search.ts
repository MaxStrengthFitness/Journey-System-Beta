/**
 * FINDING A PERSON FROM PARTIAL MEMORY — the one name matcher. Pure:
 * search.test.ts.
 *
 * The directory round (Sep 27 2026), research-directory §8.1. AJ: "if I
 * remember my client Nancy but I forget her last name I should be able to
 * use this client directory to just search Nancy". The old search wanted
 * every typed word inside "first last mindbody-name" as written: "Judy"
 * never found Judith, "obrien" never found O'Brien, and a typo found no one.
 *
 * NORMALISATION. Lower case; accents stripped (Zoë = zoe); punctuation and
 * spaces ignored (O'Brien = obrien, Mary-Ann = mary ann = maryann). Each name
 * keeps its word boundaries too, so "ann" finds the second half of Mary-Ann.
 *
 * TIERS, best first. Every client carries the best tier she matched on:
 *   exact         a whole first name, nickname or last name
 *   first-prefix  the start of her first name or nickname ("nan" → Nancy)
 *   last-prefix   the start of her last name
 *   alias         the typed word is a known nickname of her first name, or
 *                 the other way round — looked up BOTH ways (judy → Judith,
 *                 judith → Judy), from the curated table below
 *   close         a typo: edit distance 1 for a word of five letters or
 *                 fewer, 2 for longer — ONLY when nothing matched otherwise,
 *                 and labelled, never mixed in silently
 *
 * SEVERAL WORDS. "nancy b" is first name "nancy" AND a name starting "b";
 * "b nancy" works too. Every typed word must match something.
 *
 * ORDER. In the directory the active sort orders the results, not the tier
 * ("search narrows, sort orders"); `tier` is for a quick-find that ranks.
 * Each match says WHY ("matched nickname") and which letters matched, so the
 * screen can bold them.
 */

/* ------------------------------------------------------------------ */
/* Normalisation                                                       */
/* ------------------------------------------------------------------ */

/** Lower case, accents stripped, letters and digits only. */
export function normalizeName(text: string | null | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** The words of a name, each normalised: "Mary-Ann" → ["mary", "ann"]. Apostrophes join ("O'Brien" → ["obrien"]). */
export function nameWords(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/[\s\-\u2010-\u2015/,.&+]+/)
    .map(normalizeName)
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Nicknames — a curated table, read both ways                         */
/* ------------------------------------------------------------------ */

/**
 * Each group is a formal name and the names people go by for it. A typed
 * word finds everyone in ANY group it belongs to (not transitively: "nan"
 * finds Nancy, and "nancy" also finds Anne, but "nan" does not find Anne).
 * Seeded from the common English diminutives and the names on MSF's floors;
 * pruned of pairs that surprise more than they help.
 */
export const NICKNAME_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  ["nancy", "nan", "nance"],
  ["anne", "ann", "annie", "nancy"],
  ["margaret", "peggy", "maggie", "meg", "marge", "margie"],
  ["judith", "judy", "jude"],
  ["dorothy", "dot", "dottie"],
  ["barbara", "barb"],
  ["robert", "bob", "bobby", "rob", "robbie"],
  ["william", "bill", "billy", "will", "willie"],
  ["elizabeth", "liz", "lizzie", "beth", "betty", "betsy", "libby", "eliza"],
  ["katherine", "kathy", "kate", "katie", "kathie", "kat"],
  ["catherine", "cathy", "cate", "cat", "kate"],
  ["kathleen", "kathy", "kate"],
  ["patricia", "pat", "patty", "patti", "trish", "tricia"],
  ["richard", "dick", "rick", "ricky", "rich", "richie"],
  ["james", "jim", "jimmy", "jamie"],
  ["joseph", "joe", "joey"],
  ["thomas", "tom", "tommy"],
  ["michael", "mike", "mikey", "mick"],
  ["charles", "charlie", "chuck"],
  ["edward", "ed", "eddie", "ted", "ned"],
  ["john", "jack", "johnny"],
  ["daniel", "dan", "danny"],
  ["david", "dave", "davey"],
  ["donald", "don", "donnie"],
  ["ronald", "ron", "ronnie"],
  ["kenneth", "ken", "kenny"],
  ["lawrence", "larry"],
  ["gerald", "gerry", "jerry"],
  ["gregory", "greg"],
  ["stephen", "steve", "stevie"],
  ["steven", "steve", "stevie"],
  ["frederick", "fred", "freddie"],
  ["albert", "al", "bert"],
  ["alfred", "al", "alf", "fred"],
  ["alexander", "alex", "al", "sandy"],
  ["anthony", "tony"],
  ["benjamin", "ben", "benny"],
  ["christopher", "chris"],
  ["matthew", "matt"],
  ["nicholas", "nick", "nicky"],
  ["samuel", "sam", "sammy"],
  ["timothy", "tim", "timmy"],
  ["andrew", "andy", "drew"],
  ["harold", "hal", "harry"],
  ["henry", "hank", "harry"],
  ["eugene", "gene"],
  ["raymond", "ray"],
  ["walter", "walt", "wally"],
  ["leonard", "len", "lenny", "leo"],
  ["louis", "lou"],
  ["francis", "frank", "fran"],
  ["frances", "fran", "frannie"],
  ["peter", "pete"],
  ["philip", "phil"],
  ["phillip", "phil"],
  ["douglas", "doug"],
  ["herbert", "herb", "bert"],
  ["bernard", "bernie"],
  ["vincent", "vince", "vinny"],
  ["patrick", "pat", "patty"],
  ["jennifer", "jen", "jenny"],
  ["jessica", "jess", "jessie"],
  ["susan", "sue", "susie", "suzy"],
  ["deborah", "deb", "debbie"],
  ["debra", "deb", "debbie"],
  ["cynthia", "cindy"],
  ["pamela", "pam"],
  ["victoria", "vicky", "vicki", "tori"],
  ["rebecca", "becky", "becca"],
  ["virginia", "ginny", "ginger"],
  ["theresa", "terry", "tess", "tessa"],
  ["teresa", "terry", "tess", "tessa"],
  ["eleanor", "ellie", "nell", "nellie"],
  ["helen", "nell", "nellie"],
  ["jacqueline", "jackie"],
  ["josephine", "jo", "josie"],
  ["joanne", "jo"],
  ["kimberly", "kim"],
  ["sandra", "sandy"],
  ["gwendolyn", "gwen"],
  ["abigail", "abby"],
  ["christine", "chris", "chrissy", "tina"],
  ["christina", "chris", "chrissy", "tina"],
  ["constance", "connie"],
  ["florence", "flo"],
  ["gertrude", "gertie", "trudy"],
  ["mildred", "millie"],
  ["winifred", "winnie"],
  ["dolores", "dee", "lola"],
  ["carolyn", "carol", "carrie"],
  ["caroline", "carol", "carrie"],
  ["jonathan", "jon"],
  ["nathaniel", "nate", "nat"],
  ["nathan", "nate"],
  ["zachary", "zach", "zack"],
];

const ALIASES: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const group of NICKNAME_GROUPS) {
    for (const name of group) {
      const set = map.get(name) ?? new Set<string>();
      for (const other of group) if (other !== name) set.add(other);
      map.set(name, set);
    }
  }
  return map;
})();

/** Every name the table says this one goes with (never including itself). */
export function aliasesOf(word: string): ReadonlySet<string> {
  return ALIASES.get(normalizeName(word)) ?? new Set();
}

/* ------------------------------------------------------------------ */
/* The index                                                           */
/* ------------------------------------------------------------------ */

export interface NameSource {
  id: string;
  first: string;
  nickname?: string | null;
  last: string;
}

type Field = "first" | "nickname" | "last";

interface IndexedField {
  raw: string;
  joined: string;
  words: string[];
}

interface IndexedPerson {
  id: string;
  fields: Record<Field, IndexedField>;
}

export interface NameIndex {
  people: IndexedPerson[];
}

function indexField(raw: string | null | undefined): IndexedField {
  const text = raw ?? "";
  return { raw: text, joined: normalizeName(text), words: nameWords(text) };
}

/** Built once per roster change (about 300 people × 3 fields). */
export function buildNameIndex(people: ReadonlyArray<NameSource>): NameIndex {
  return {
    people: people.map((p) => ({
      id: p.id,
      fields: { first: indexField(p.first), nickname: indexField(p.nickname), last: indexField(p.last) },
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

export type MatchTier = "exact" | "first-prefix" | "last-prefix" | "alias" | "close";
const TIER_RANK: Record<MatchTier, number> = { exact: 0, "first-prefix": 1, "last-prefix": 2, alias: 3, close: 4 };

/** [start, end) into a field's RAW text, for bolding. */
export type Range = [number, number];

export interface NameMatch {
  id: string;
  tier: MatchTier;
  /** "matched nickname", "close match" — null for a plain name match. */
  why: string | null;
  /** The typed word that found her by alias, capitalised: `Judith (Judy)`. */
  alias: string | null;
  ranges: Partial<Record<Field, Range[]>>;
}

export interface SearchResult {
  /** Everyone who matched, keyed by id. Empty for an empty query. */
  matches: Map<string, NameMatch>;
  /** True when these are close matches only: nothing matched exactly or by prefix. */
  closeOnly: boolean;
  /** The normalised words searched for. */
  words: string[];
}

/**
 * Where a normalised prefix of `len` letters, starting at the normalised
 * word `wordIndex` of the field, sits in the raw text. Walks the raw text,
 * counting only the characters normalisation keeps.
 */
function rawRange(raw: string, wordIndex: number, len: number): Range | null {
  // Find the raw start of the word: skip `wordIndex` words.
  const parts = [...raw.matchAll(/[^\s\-\u2010-\u2015/,.&+]+/g)];
  let seen = -1;
  for (const m of parts) {
    if (!normalizeName(m[0])) continue;
    seen += 1;
    if (seen !== wordIndex) continue;
    const start = m.index ?? 0;
    let kept = 0;
    let i = start;
    let first = -1;
    for (; i < raw.length && kept < len; i++) {
      if (normalizeName(raw[i])) {
        if (first < 0) first = i;
        kept += normalizeName(raw[i]).length;
      }
    }
    return first < 0 ? null : [first, i];
  }
  return null;
}

interface WordHit {
  tier: MatchTier;
  field: Field;
  range: Range | null;
  alias?: string;
}

/** Optimal string alignment distance (adjacent swaps count once), capped for speed. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > cap) return cap + 1;
  }
  return d[a.length][b.length];
}

/** How far off a typo may be: 1 letter for words of five or fewer, 2 for longer. */
export function typoAllowance(word: string): number {
  return word.length <= 5 ? 1 : 2;
}

function wholeRange(f: IndexedField): Range | null {
  return f.raw ? [0, f.raw.length] : null;
}

/** The best way one typed word matches one person, or null. */
function matchWord(p: IndexedPerson, w: string, allowClose: boolean): WordHit | null {
  const { first, nickname, last } = p.fields;
  const within = (f: IndexedField, field: Field, tier: MatchTier, test: (s: string) => boolean): WordHit | null => {
    if (!f.joined) return null;
    if (test(f.joined)) return { tier, field, range: tier === "exact" ? wholeRange(f) : rawRange(f.raw, 0, w.length) };
    for (let i = 0; i < f.words.length; i++) {
      if (test(f.words[i])) return { tier, field, range: tier === "exact" ? rawRange(f.raw, i, f.words[i].length) : rawRange(f.raw, i, w.length) };
    }
    return null;
  };
  const exact = (s: string) => s === w;
  const prefix = (s: string) => s.startsWith(w);

  const hit =
    within(first, "first", "exact", exact) ??
    within(nickname, "nickname", "exact", exact) ??
    within(last, "last", "exact", exact) ??
    within(first, "first", "first-prefix", prefix) ??
    within(nickname, "nickname", "first-prefix", prefix) ??
    within(last, "last", "last-prefix", prefix);
  if (hit) return hit;

  // Alias, both ways: "judy" finds Judith, "judith" finds a Judy.
  const aliases = ALIASES.get(w);
  if (aliases) {
    for (const [f, field] of [
      [first, "first"],
      [nickname, "nickname"],
    ] as const) {
      if (!f.joined) continue;
      if (aliases.has(f.joined) || f.words.some((x) => aliases.has(x))) {
        return { tier: "alias", field, range: wholeRange(f), alias: w };
      }
    }
  }

  if (!allowClose) return null;
  const max = typoAllowance(w);
  for (const [f, field] of [
    [first, "first"],
    [nickname, "nickname"],
    [last, "last"],
  ] as const) {
    if (!f.joined) continue;
    const candidates = [f.joined, ...f.words];
    if (candidates.some((c) => editDistance(w, c, max) <= max)) return { tier: "close", field, range: wholeRange(f) };
  }
  return null;
}

function cap(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function run(index: NameIndex, words: string[], allowClose: boolean): Map<string, NameMatch> {
  const out = new Map<string, NameMatch>();
  for (const p of index.people) {
    const hits: WordHit[] = [];
    let ok = true;
    for (const w of words) {
      const hit = matchWord(p, w, allowClose);
      if (!hit) {
        ok = false;
        break;
      }
      hits.push(hit);
    }
    if (!ok) continue;
    // The person's tier is her weakest word: "nancy k" is as good as the "k".
    const worst = hits.reduce((a, b) => (TIER_RANK[b.tier] > TIER_RANK[a.tier] ? b : a));
    const ranges: Partial<Record<Field, Range[]>> = {};
    for (const h of hits) {
      if (!h.range) continue;
      (ranges[h.field] ??= []).push(h.range);
    }
    const aliasHit = hits.find((h) => h.tier === "alias");
    out.set(p.id, {
      id: p.id,
      tier: worst.tier,
      why: worst.tier === "close" ? "close match" : aliasHit ? "matched nickname" : null,
      alias: aliasHit?.alias ? cap(aliasHit.alias) : null,
      ranges,
    });
  }
  return out;
}

/** The words a query searches for: typed words, normalised, empty ones dropped. */
export function queryWords(query: string): string[] {
  return query
    .split(/\s+/)
    .map(normalizeName)
    .filter(Boolean);
}

/**
 * Everyone the query finds. An empty query finds nobody (the caller shows
 * everyone). Close matches are tried only when nothing else matched.
 */
export function searchNames(index: NameIndex, query: string): SearchResult {
  const words = queryWords(query);
  if (words.length === 0) return { matches: new Map(), closeOnly: false, words };
  const matches = run(index, words, false);
  if (matches.size > 0) return { matches, closeOnly: false, words };
  // Spaces don't count either: "mc donald" is McDonald, "de la cruz" DeLaCruz.
  if (words.length > 1) {
    const joined = run(index, [words.join("")], false);
    if (joined.size > 0) return { matches: joined, closeOnly: false, words };
  }
  const close = run(index, words, true);
  return { matches: close, closeOnly: close.size > 0, words };
}

/** Best tier first, for a quick-find that ranks rather than sorts. */
export function compareTier(a: NameMatch, b: NameMatch): number {
  return TIER_RANK[a.tier] - TIER_RANK[b.tier];
}
