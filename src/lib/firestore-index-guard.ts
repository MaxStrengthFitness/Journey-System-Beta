/**
 * EVERY FIRESTORE QUERY SHIPS WITH ITS INDEX (speed round, Oct 5 2026, R3).
 *
 * Production is Firestore's ENTERPRISE edition. It builds no index by itself,
 * and a query with no index still answers — by reading every document in the
 * collection (or, for a collection group, in every collection of that name
 * across the company), billed by the byte. Nothing fails, nothing is slow in
 * a test, so nothing noticed: the Oct 5 audit found about 35 query shapes
 * that scanned, five of them on the session and profile path. The habit came
 * from the Standard edition, where a single-field equality "needs no index".
 * On this database it does.
 *
 * This file is the pure half of the guard: it reads source text (TypeScript's
 * own parser, never a regular expression over code), finds every query, and
 * says which collection it reads and which fields it filters and orders on.
 * `firestore-indexes.test.ts` runs it over src, server and functions/src
 * against `firestore.indexes.json`.
 *
 * WHAT COUNTS AS SERVED
 * ---------------------
 * A query is served when an index of the same collection and the same scope
 * (a `collectionGroup(...)` query needs a COLLECTION_GROUP index, a plain
 * collection query a COLLECTION one) LEADS with one of its equality fields
 * (`==` or `in`), or with its `array-contains` field. A query with no
 * equality at all is served by an index that leads with its range or orderBy
 * field. That is the test of "does Firestore walk an index or the whole
 * collection", not of whether the index is the best one.
 *
 * Every equality field counts, not just the first constraint written: a
 * naive "first where() against first index field" version produced 229
 * misses against about 35 real ones, because code writes the range before
 * the studio, and builds constraints in arrays and helpers.
 *
 * A query that can run more than one way (`flag ? where(a) : where(b)`, or an
 * `or(...)`, which Firestore runs as one query per disjunct) is judged way by
 * way: it is served only when every way is.
 *
 * WHAT IT CANNOT SEE
 * ------------------
 * A query whose collection, field or constraints are decided where the guard
 * can't follow (a parameter nobody bound, a value from a document, a call to a
 * function it can't find, a name imported from a library) is reported as
 * unreadable rather than guessed at or dropped, and the test fails on it
 * unless the file is in its EXPANDED list with how to read it. Renamed
 * Firestore imports (`limit as fsLimit`) are read as the name they import.
 */
import ts from "typescript";

export type Scope = "COLLECTION" | "COLLECTION_GROUP";

export interface IndexField {
  fieldPath: string;
  order?: "ASCENDING" | "DESCENDING";
  arrayConfig?: "CONTAINS";
}

export interface CompositeIndex {
  collectionGroup: string;
  queryScope: Scope;
  fields: IndexField[];
}

export interface QueryShape {
  /** Repo-relative path with forward slashes. */
  file: string;
  line: number;
  /** The collection id read, or null when the guard can't tell. */
  group: string | null;
  scope: Scope | null;
  /** `==` and `in`. */
  equality: string[];
  /** `array-contains` and `array-contains-any`. */
  contains: string[];
  /** `<`, `<=`, `>`, `>=`, `!=`, `not-in`. */
  range: string[];
  orderBy: { field: string; direction: "ASCENDING" | "DESCENDING" }[];
  /**
   * Set when the query can run more than one way (a branch, an `or(...)`):
   * each way, with every constraint it carries. The lists above are then the
   * union, for the message; the query is served only when EVERY way is.
   */
  variants?: Conj[];
  /** A field or an operator the guard couldn't read. */
  unreadable: boolean;
  /** Only document-id constraints: a key lookup, never a scan. */
  docIdOnly: boolean;
}

const DOC_ID = "__name__";

const CHAIN_OPS = new Set([
  "where",
  "orderBy",
  "limit",
  "limitToLast",
  "offset",
  "startAt",
  "startAfter",
  "endAt",
  "endBefore",
  "select",
]);

const EQUALITY_OPS = new Set(["==", "in"]);
const CONTAINS_OPS = new Set(["array-contains", "array-contains-any"]);
const RANGE_OPS = new Set(["<", "<=", ">", ">=", "!=", "not-in"]);

/* ------------------------------------------------------------------ */
/* The program: every file parsed once, with its names.                */
/* ------------------------------------------------------------------ */

interface FileInfo {
  rel: string;
  sf: ts.SourceFile;
  /** Names imported from a Firestore module, local name -> exported name (`limit as fsLimit`). */
  fsImports: Map<string, string>;
}

type FnLike = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

interface Helper {
  fn: FnLike;
  file: FileInfo;
}

/** A name bound to an expression while resolving a helper call. */
type Env = Map<string, { expr: ts.Expression; file: FileInfo; env: Env }>;

const EMPTY_ENV: Env = new Map();

interface Program {
  files: FileInfo[];
  /** Top-level `const NAME = "literal"`, by name; a name defined twice differently is dropped. */
  constants: Map<string, string | null>;
  /** Functions by name (declarations and `const f = () =>`), anywhere in a file. */
  helpers: Map<string, Helper[]>;
}

function isFnLike(node: ts.Node | undefined): node is FnLike {
  return !!node && (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

function unwrap(expr: ts.Expression): ts.Expression {
  let e = expr;
  for (;;) {
    if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e) || ts.isSatisfiesExpression(e)) {
      e = e.expression;
    } else if (ts.isTypeAssertionExpression(e)) {
      e = e.expression;
    } else if (ts.isAwaitExpression(e)) {
      e = e.expression;
    } else {
      return e;
    }
  }
}

export function buildProgram(sources: { rel: string; text: string }[]): Program {
  const files: FileInfo[] = sources.map(({ rel, text }) => {
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    return { rel, sf, fsImports: firestoreImports(sf) };
  });
  const constants = new Map<string, string | null>();
  const helpers = new Map<string, Helper[]>();
  const addHelper = (name: string, fn: FnLike, file: FileInfo) => {
    const list = helpers.get(name) ?? [];
    list.push({ fn, file });
    helpers.set(name, list);
  };
  for (const file of files) {
    for (const st of file.sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        const lit = literalString(unwrap(d.initializer));
        if (lit === null) continue;
        const name = d.name.text;
        if (constants.has(name) && constants.get(name) !== lit) constants.set(name, null);
        else constants.set(name, lit);
      }
    }
    const visit = (node: ts.Node) => {
      if (ts.isFunctionDeclaration(node) && node.name) addHelper(node.name.text, node, file);
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const init = unwrap(node.initializer);
        if (isFnLike(init)) addHelper(node.name.text, init, file);
      }
      ts.forEachChild(node, visit);
    };
    visit(file.sf);
  }
  return { files, constants, helpers };
}

/** `import { limit as fsLimit } from "firebase/firestore"`: fsLimit -> limit. */
function firestoreImports(sf: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!/firestore|^firebase-admin$/.test(st.moduleSpecifier.text)) continue;
    const named = st.importClause?.namedBindings;
    if (!named || !ts.isNamedImports(named)) continue;
    for (const el of named.elements) out.set(el.name.text, (el.propertyName ?? el.name).text);
  }
  return out;
}

function literalString(e: ts.Expression): string | null {
  if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) return e.text;
  return null;
}

/* ------------------------------------------------------------------ */
/* Lexical lookup inside one file.                                      */
/* ------------------------------------------------------------------ */

interface Binding {
  init: ts.Expression | null;
  decl: ts.Node;
  /** The block, function body or file that declares it. */
  scope: ts.Node;
  isParam: boolean;
}

/** The nearest declaration of `name` visible at `at`. */
function lookup(name: string, at: ts.Node): Binding | null {
  let node: ts.Node | undefined = at;
  while (node) {
    if (isFnLike(node)) {
      for (const p of node.parameters) {
        if (ts.isIdentifier(p.name) && p.name.text === name) {
          return { init: p.initializer ?? null, decl: p, scope: node, isParam: true };
        }
      }
    }
    const statements: readonly ts.Statement[] | undefined =
      ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node) || ts.isCaseClause(node) || ts.isDefaultClause(node)
        ? (node as ts.Block).statements
        : undefined;
    if (statements) {
      for (const st of statements) {
        if (ts.isVariableStatement(st)) {
          for (const d of st.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && d.name.text === name) {
              return { init: d.initializer ?? null, decl: d, scope: node, isParam: false };
            }
          }
        }
        if (ts.isFunctionDeclaration(st) && st.name?.text === name) {
          return { init: null, decl: st, scope: node, isParam: false };
        }
      }
    }
    if ((ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isForStatement(node)) && node.initializer && ts.isVariableDeclarationList(node.initializer)) {
      for (const d of node.initializer.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === name) {
          return { init: ts.isForStatement(node) ? (d.initializer ?? null) : null, decl: d, scope: node, isParam: false };
        }
      }
    }
    node = node.parent;
  }
  return null;
}

/** Every expression assigned to `name` inside `scope` after its declaration (`q = q.where(...)`). */
function reassignments(name: string, scope: ts.Node): ts.Expression[] {
  const out: ts.Expression[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(n.left) &&
      n.left.text === name
    ) {
      out.push(n.right);
    }
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return out;
}

/** `name.push(...)` arguments inside `scope`. */
function pushes(name: string, scope: ts.Node): ts.Expression[] {
  const out: ts.Expression[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "push" &&
      ts.isIdentifier(n.expression.expression) &&
      n.expression.expression.text === name
    ) {
      out.push(...n.arguments);
    }
    ts.forEachChild(n, visit);
  };
  visit(scope);
  return out;
}

/** The expressions a function returns (an arrow's body, or every `return`). */
function returnsOf(fn: FnLike): ts.Expression[] {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const out: ts.Expression[] = [];
  const visit = (n: ts.Node) => {
    if (isFnLike(n) && n !== fn) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(n.expression);
    ts.forEachChild(n, visit);
  };
  visit(fn.body);
  return out;
}

/* ------------------------------------------------------------------ */
/* The resolver.                                                        */
/* ------------------------------------------------------------------ */

interface Ctx {
  prog: Program;
  file: FileInfo;
  env: Env;
  depth: number;
}

const MAX_DEPTH = 12;

function sub(ctx: Ctx, file: FileInfo = ctx.file, env: Env = ctx.env): Ctx {
  return { prog: ctx.prog, file, env, depth: ctx.depth + 1 };
}

/** A string an expression stands for, or null. */
function stringOf(expr: ts.Expression, ctx: Ctx): string | null {
  if (ctx.depth > MAX_DEPTH) return null;
  const e = unwrap(expr);
  const lit = literalString(e);
  if (lit !== null) return lit;
  if (ts.isIdentifier(e)) {
    const bound = ctx.env.get(e.text);
    if (bound) return stringOf(bound.expr, sub(ctx, bound.file, bound.env));
    const b = lookup(e.text, e);
    if (b && b.init && !b.isParam) return stringOf(b.init, sub(ctx));
    if (b && b.isParam) return null;
    const c = ctx.prog.constants.get(e.text);
    return c ?? null;
  }
  if (ts.isPropertyAccessExpression(e)) {
    // `COLLECTIONS.notes` style: a top-level object of names.
    const obj = unwrap(e.expression);
    if (ts.isIdentifier(obj)) {
      const b = lookup(obj.text, obj);
      const init = b?.init ? unwrap(b.init) : null;
      if (init && ts.isObjectLiteralExpression(init)) {
        for (const p of init.properties) {
          if (ts.isPropertyAssignment(p) && p.name.getText() === e.name.text) return stringOf(p.initializer, sub(ctx));
        }
      }
    }
    return null;
  }
  if (ts.isTemplateExpression(e)) {
    // Only the tail matters for a path's last segment; keep the shape.
    let s = e.head.text;
    for (const span of e.templateSpans) s += "${}" + span.literal.text;
    return s;
  }
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = stringOf(e.left, ctx) ?? "${}";
    const r = stringOf(e.right, ctx) ?? "${}";
    return l + r;
  }
  if (ts.isConditionalExpression(e)) {
    const a = stringOf(e.whenTrue, ctx);
    const b = stringOf(e.whenFalse, ctx);
    return a !== null && a === b ? a : null;
  }
  return null;
}

/** The last segment of a slash path, when it is a name and not a `${}`. */
function lastSegment(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || last.includes("${}")) return null;
  return last;
}

interface Ref {
  group: string;
  scope: Scope;
}

/** One way a query can run: every constraint on it at once. */
export interface Conj {
  equality: string[];
  contains: string[];
  range: string[];
  orderBy: { field: string; direction: "ASCENDING" | "DESCENDING" }[];
  /** This way carries a constraint the guard could not read. */
  unreadable?: true;
}

/**
 * What a query's constraints stand for. `variants` are the ways it can run:
 * one, unless a branch (`flag ? where(a) : where(b)`) or an `or(...)` makes
 * alternatives, and then each alternative runs as its own query and needs
 * its own index, so each is judged on its own.
 */
interface Constraints {
  variants: Conj[];
  unreadable: boolean;
  /** Saw at least one where/orderBy. */
  any: boolean;
}

/** More alternatives than this and the guard says it can't read the query rather than guess. */
const MAX_VARIANTS = 64;

function emptyConj(): Conj {
  return { equality: [], contains: [], range: [], orderBy: [] };
}

function emptyConstraints(): Constraints {
  return { variants: [emptyConj()], unreadable: false, any: false };
}

function unreadableConstraints(): Constraints {
  return { variants: [{ ...emptyConj(), unreadable: true }], unreadable: true, any: true };
}

function joinConj(a: Conj, b: Conj): Conj {
  return {
    equality: [...a.equality, ...b.equality],
    contains: [...a.contains, ...b.contains],
    range: [...a.range, ...b.range],
    orderBy: [...a.orderBy, ...b.orderBy],
    ...(a.unreadable || b.unreadable ? { unreadable: true as const } : {}),
  };
}

/** A constraint the guard could not read: the query, and every way it runs. */
function markUnreadable(c: Constraints) {
  c.unreadable = true;
  for (const v of c.variants) v.unreadable = true;
}

function capped(c: Constraints): Constraints {
  if (c.variants.length > MAX_VARIANTS) {
    c.variants = [c.variants.reduce(joinConj, emptyConj())];
    markUnreadable(c);
  }
  return c;
}

/** AND: every way of `into` with every way of `from`. */
function merge(into: Constraints, from: Constraints) {
  const product: Conj[] = [];
  for (const a of into.variants) for (const b of from.variants) product.push(joinConj(a, b));
  into.variants = product;
  into.unreadable ||= from.unreadable;
  into.any ||= from.any;
  capped(into);
}

/** OR: the query runs as one of these. */
function alternatives(list: Constraints[]): Constraints {
  return capped({
    variants: list.flatMap((x) => x.variants),
    unreadable: list.some((x) => x.unreadable),
    any: list.some((x) => x.any),
  });
}

/** What a query-like expression reads, plus any constraints already applied to it. */
interface Target {
  ref: Ref | null;
  constraints: Constraints;
}

function calleeName(call: ts.CallExpression): string | null {
  const c = unwrap(call.expression);
  if (ts.isIdentifier(c)) return c.text;
  if (ts.isPropertyAccessExpression(c)) return c.name.text;
  return null;
}

/** The Firestore name a call's callee stands for (`fsLimit` -> `limit`), else its own name. */
function firestoreName(call: ts.CallExpression, ctx: Ctx): string | null {
  const c = unwrap(call.expression);
  if (ts.isIdentifier(c)) return ctx.file.fsImports.get(c.text) ?? c.text;
  return calleeName(call);
}

/** The functions a call could be: a local one first, else any of that name in the program. */
function helperCandidates(call: ts.CallExpression, ctx: Ctx): Helper[] {
  const name = calleeName(call);
  if (!name) return [];
  const local = ts.isIdentifier(unwrap(call.expression)) ? lookup(name, call) : null;
  if (local && !local.isParam) {
    const init = local.init ? unwrap(local.init) : null;
    if (isFnLike(local.decl)) return [{ fn: local.decl, file: ctx.file }];
    if (init && isFnLike(init)) return [{ fn: init, file: ctx.file }];
  }
  return ctx.prog.helpers.get(name) ?? [];
}

/** Resolve a helper call: bind its parameters to the arguments and read what it returns. */
function viaHelper<T>(call: ts.CallExpression, ctx: Ctx, read: (e: ts.Expression, c: Ctx) => T | null): T | null {
  for (const h of helperCandidates(call, ctx)) {
    const env: Env = new Map();
    h.fn.parameters.forEach((p, i) => {
      if (ts.isIdentifier(p.name) && call.arguments[i]) env.set(p.name.text, { expr: call.arguments[i], file: ctx.file, env: ctx.env });
    });
    for (const r of returnsOf(h.fn)) {
      const got = read(r, sub(ctx, h.file, env));
      if (got !== null) return got;
    }
  }
  return null;
}

/** What collection an expression reads, with constraints it already carries (a base query). */
function targetOf(expr: ts.Expression, ctx: Ctx): Target | null {
  if (ctx.depth > MAX_DEPTH) return null;
  const e = unwrap(expr);
  if (ts.isIdentifier(e)) {
    const bound = ctx.env.get(e.text);
    if (bound) return targetOf(bound.expr, sub(ctx, bound.file, bound.env));
    const b = lookup(e.text, e);
    if (!b || b.isParam) return null;
    if (b.init) {
      const t = targetOf(b.init, sub(ctx));
      if (t) return t;
    }
    return null;
  }
  if (ts.isConditionalExpression(e)) {
    return targetOf(e.whenTrue, ctx) ?? targetOf(e.whenFalse, ctx);
  }
  if (ts.isBinaryExpression(e) && (e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken || e.operatorToken.kind === ts.SyntaxKind.BarBarToken || e.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) {
    return targetOf(e.right, ctx) ?? targetOf(e.left, ctx);
  }
  if (!ts.isCallExpression(e)) return null;
  const callee = unwrap(e.expression);
  const name = calleeName(e);

  // Modular SDK.
  if (ts.isIdentifier(callee) && name === "collection") {
    const segs = e.arguments.slice(1);
    if (segs.length === 0) return null;
    const last = stringOf(segs[segs.length - 1], ctx);
    const group = last === null ? null : lastSegment(last);
    return group ? { ref: { group, scope: "COLLECTION" }, constraints: emptyConstraints() } : null;
  }
  if (ts.isIdentifier(callee) && name === "collectionGroup") {
    const g = e.arguments[1] ? stringOf(e.arguments[1], ctx) : null;
    return g ? { ref: { group: g, scope: "COLLECTION_GROUP" }, constraints: emptyConstraints() } : null;
  }
  if (ts.isIdentifier(callee) && name === "query") {
    if (!e.arguments[0]) return null;
    const base = targetOf(e.arguments[0], sub(ctx));
    if (!base) return null;
    const c = emptyConstraints();
    merge(c, base.constraints);
    for (const a of e.arguments.slice(1)) merge(c, constraintsOf(a, sub(ctx)));
    return { ref: base.ref, constraints: c };
  }
  if (ts.isIdentifier(callee) && name === "useMemo" && e.arguments[0] && isFnLike(e.arguments[0])) {
    for (const r of returnsOf(e.arguments[0])) {
      const t = targetOf(r, sub(ctx));
      if (t) return t;
    }
    return null;
  }

  // Admin SDK.
  if (ts.isPropertyAccessExpression(callee)) {
    if (name === "collection") {
      const p = e.arguments[0] ? stringOf(e.arguments[0], ctx) : null;
      const group = p === null ? null : lastSegment(p);
      return group ? { ref: { group, scope: "COLLECTION" }, constraints: emptyConstraints() } : null;
    }
    if (name === "collectionGroup") {
      const g = e.arguments[0] ? stringOf(e.arguments[0], ctx) : null;
      return g ? { ref: { group: g, scope: "COLLECTION_GROUP" }, constraints: emptyConstraints() } : null;
    }
    if (name && CHAIN_OPS.has(name)) {
      const base = targetOf(callee.expression, sub(ctx));
      if (!base) return null;
      const c = emptyConstraints();
      merge(c, base.constraints);
      merge(c, chainStep(name, e, ctx));
      return { ref: base.ref, constraints: c };
    }
  }

  // A helper that returns a collection or a query.
  return viaHelper(e, ctx, targetOf);
}

function fieldOf(expr: ts.Expression | undefined, ctx: Ctx): string | null {
  if (!expr) return null;
  const e = unwrap(expr);
  if (ts.isCallExpression(e) && calleeName(e) === "documentId") return DOC_ID;
  if (ts.isNewExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === "FieldPath") {
    const parts = (e.arguments ?? []).map((a) => stringOf(a, ctx));
    return parts.every((p): p is string => p !== null) ? parts.join(".") : null;
  }
  const s = stringOf(e, ctx);
  if (s === null || s.includes("${}")) return null;
  return s;
}

function addWhere(c: Constraints, field: string | null, op: string | null) {
  c.any = true;
  if (field === null || op === null) {
    markUnreadable(c);
    return;
  }
  const kind = EQUALITY_OPS.has(op) ? "equality" : CONTAINS_OPS.has(op) ? "contains" : RANGE_OPS.has(op) ? "range" : null;
  if (kind === null) {
    markUnreadable(c);
    return;
  }
  for (const v of c.variants) v[kind].push(field);
}

function addOrder(c: Constraints, field: string | null, dir: string | null) {
  c.any = true;
  if (field === null) {
    markUnreadable(c);
    return;
  }
  for (const v of c.variants) v.orderBy.push({ field, direction: dir === "desc" ? "DESCENDING" : "ASCENDING" });
}

/** One `.where(...)` / `.orderBy(...)` link of an admin chain. */
function chainStep(name: string, call: ts.CallExpression, ctx: Ctx): Constraints {
  const c = emptyConstraints();
  if (name === "where") {
    if (call.arguments.length === 1) {
      // `.where(Filter.or(...))`
      merge(c, constraintsOf(call.arguments[0], sub(ctx)));
    } else {
      addWhere(c, fieldOf(call.arguments[0], ctx), call.arguments[1] ? stringOf(call.arguments[1], ctx) : null);
    }
  } else if (name === "orderBy") {
    addOrder(c, fieldOf(call.arguments[0], ctx), call.arguments[1] ? stringOf(call.arguments[1], ctx) : "asc");
  }
  return c;
}

/** The constraints an argument of `query(...)` stands for. */
function constraintsOf(expr: ts.Expression | ts.SpreadElement, ctx: Ctx): Constraints {
  const c = emptyConstraints();
  if (ctx.depth > MAX_DEPTH) return c;
  if (ts.isSpreadElement(expr)) {
    merge(c, constraintsOf(expr.expression, sub(ctx)));
    return c;
  }
  const e = unwrap(expr);
  if (ts.isArrayLiteralExpression(e)) {
    for (const el of e.elements) merge(c, constraintsOf(el, sub(ctx)));
    return c;
  }
  if (ts.isConditionalExpression(e)) {
    // Either branch runs, never both: each is its own way the query runs.
    return alternatives([constraintsOf(e.whenTrue, sub(ctx)), constraintsOf(e.whenFalse, sub(ctx))]);
  }
  if (ts.isBinaryExpression(e)) {
    merge(c, constraintsOf(e.right, sub(ctx)));
    if (e.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) merge(c, constraintsOf(e.left, sub(ctx)));
    return c;
  }
  if (ts.isIdentifier(e)) {
    if (e.text === "undefined") return c;
    const bound = ctx.env.get(e.text);
    if (bound) return constraintsOf(bound.expr, sub(ctx, bound.file, bound.env));
    const b = lookup(e.text, e);
    // A parameter nobody bound, or a name from another module: the constraints
    // are decided where the guard isn't looking. Say so; never pass quietly.
    if (!b || b.isParam) return unreadableConstraints();
    if (b.init) merge(c, constraintsOf(b.init, sub(ctx)));
    for (const p of pushes(e.text, b.scope)) merge(c, constraintsOf(p, sub(ctx)));
    for (const r of reassignments(e.text, b.scope)) merge(c, constraintsOf(r, sub(ctx)));
    return c;
  }
  if (!ts.isCallExpression(e)) {
    // `opts.constraints`, `list[i]`: read from somewhere the guard can't follow.
    if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) return unreadableConstraints();
    return c;
  }
  const name = firestoreName(e, ctx);
  const callee = unwrap(e.expression);
  if (ts.isIdentifier(callee) || (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "Filter")) {
    if (name === "where") {
      addWhere(c, fieldOf(e.arguments[0], ctx), e.arguments[1] ? stringOf(e.arguments[1], ctx) : null);
      return c;
    }
    if (name === "orderBy") {
      addOrder(c, fieldOf(e.arguments[0], ctx), e.arguments[1] ? stringOf(e.arguments[1], ctx) : "asc");
      return c;
    }
    if (name === "and") {
      for (const a of e.arguments) merge(c, constraintsOf(a, sub(ctx)));
      return c;
    }
    if (name === "or") {
      // Firestore runs each disjunct as its own query: each needs an index.
      // An empty way is a spread that added no disjunct (`...(x ? [w] : [])`),
      // not a disjunct that matches everything, so it is dropped.
      const alt = alternatives(e.arguments.map((a) => constraintsOf(a, sub(ctx))));
      const real = alt.variants.filter((v) => v.unreadable || v.equality.length + v.contains.length + v.range.length + v.orderBy.length > 0);
      if (real.length > 0) alt.variants = real;
      return alt;
    }
    if (name && ["limit", "limitToLast", "startAt", "startAfter", "endAt", "endBefore"].includes(name)) return c;
  }
  // `[...].filter(Boolean)` and the like: read the receiver.
  if (ts.isPropertyAccessExpression(callee) && ["filter", "concat", "slice"].includes(callee.name.text)) {
    merge(c, constraintsOf(callee.expression, sub(ctx)));
    for (const a of callee.name.text === "concat" ? e.arguments : []) merge(c, constraintsOf(a, sub(ctx)));
    return c;
  }
  // A helper that builds constraints. One the guard can't find (an import from
  // a library, a call it doesn't know) is unreadable, never nothing.
  if (helperCandidates(e, ctx).length === 0) return unreadableConstraints();
  const viaFn = viaHelper(e, ctx, (r, cc) => {
    const got = constraintsOf(r, cc);
    return got.any || got.unreadable ? got : null;
  });
  if (viaFn) merge(c, viaFn);
  return c;
}

/* ------------------------------------------------------------------ */
/* Finding the queries.                                                 */
/* ------------------------------------------------------------------ */

function shapeFrom(file: FileInfo, node: ts.Node, t: Target | null, extra: Constraints | null): QueryShape | null {
  const c = emptyConstraints();
  if (t) merge(c, t.constraints);
  if (extra) merge(c, extra);
  if (!c.any) return null; // no filter, no order: a whole read, which an index can't help
  const u = c.variants.reduce(joinConj, emptyConj());
  const all = [...u.equality, ...u.contains, ...u.range, ...u.orderBy.map((o) => o.field)];
  const docIdOnly = all.length > 0 && all.every((f) => f === DOC_ID) && !c.unreadable;
  const strip = (xs: string[]) => [...new Set(xs.filter((f) => f !== DOC_ID))];
  const stripOrder = (xs: Conj["orderBy"]) => {
    const seen = new Set<string>();
    return xs.filter((o) => {
      if (o.field === DOC_ID || seen.has(o.field)) return false;
      seen.add(o.field);
      return true;
    });
  };
  const clean = (v: Conj): Conj => ({ equality: strip(v.equality), contains: strip(v.contains), range: strip(v.range), orderBy: stripOrder(v.orderBy), ...(v.unreadable ? { unreadable: true as const } : {}) });
  const variants = [...new Map(c.variants.map(clean).map((v) => [JSON.stringify(v), v] as const)).values()];
  return {
    file: file.rel,
    line: file.sf.getLineAndCharacterOfPosition(node.getStart(file.sf)).line + 1,
    group: t?.ref?.group ?? null,
    scope: t?.ref?.scope ?? null,
    equality: strip(u.equality),
    contains: strip(u.contains),
    range: strip(u.range),
    orderBy: stripOrder(u.orderBy),
    ...(variants.length > 1 ? { variants } : {}),
    unreadable: c.unreadable,
    docIdOnly,
  };
}

/** Is this call the receiver of another chain link (so not the top of its chain)? */
function isInnerLink(call: ts.CallExpression): boolean {
  const p = call.parent;
  if (!p || !ts.isPropertyAccessExpression(p) || p.expression !== call) return false;
  const pp = p.parent;
  return !!pp && ts.isCallExpression(pp) && pp.expression === p && CHAIN_OPS.has(p.name.text);
}

/** Every query in the program. */
export function findQueries(prog: Program): QueryShape[] {
  const out: QueryShape[] = [];
  for (const file of prog.files) {
    const ctx: Ctx = { prog, file, env: EMPTY_ENV, depth: 0 };
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const callee = unwrap(node.expression);
        // Modular: query(ref, ...constraints). A query() whose result feeds
        // another query() is read once, from the outer one.
        if (ts.isIdentifier(callee) && callee.text === "query" && node.arguments.length > 0) {
          const parentCall = node.parent && ts.isCallExpression(node.parent) && ts.isIdentifier(unwrap(node.parent.expression)) && (unwrap(node.parent.expression) as ts.Identifier).text === "query" && node.parent.arguments[0] === node;
          if (!parentCall) {
            const t = targetOf(node, ctx);
            const shape = t ? shapeFrom(file, node, t, null) : shapeFrom(file, node, null, queryArgsOnly(node, ctx));
            if (shape) out.push(shape);
          }
        }
        // Admin: x.collection(...).where(...).orderBy(...), read at the top link.
        if (ts.isPropertyAccessExpression(callee) && (callee.name.text === "where" || callee.name.text === "orderBy" || CHAIN_OPS.has(callee.name.text)) && !isInnerLink(node)) {
          const t = targetOf(node, ctx);
          if (t && t.constraints.any) {
            const shape = shapeFrom(file, node, t, null);
            if (shape) out.push(shape);
          } else if (!t) {
            const c = chainOnly(node, ctx);
            if (c.any && looksLikeFirestoreChain(node)) {
              const shape = shapeFrom(file, node, null, c);
              if (shape) out.push(shape);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file.sf);
  }
  return out;
}

/** Constraints of a `query(...)` whose collection couldn't be read. */
function queryArgsOnly(call: ts.CallExpression, ctx: Ctx): Constraints {
  const c = emptyConstraints();
  for (const a of call.arguments.slice(1)) merge(c, constraintsOf(a, ctx));
  return c;
}

/** Constraints of an admin chain whose root couldn't be read. */
function chainOnly(call: ts.CallExpression, ctx: Ctx): Constraints {
  const c = emptyConstraints();
  let e: ts.Expression = call;
  while (ts.isCallExpression(e) && ts.isPropertyAccessExpression(unwrap(e.expression))) {
    const pa = unwrap(e.expression) as ts.PropertyAccessExpression;
    if (!CHAIN_OPS.has(pa.name.text)) break;
    merge(c, chainStep(pa.name.text, e, ctx));
    e = unwrap(pa.expression);
  }
  return c;
}

/** Every `.where(` in the chain has Firestore's shape (a field, an operator, a value). */
function looksLikeFirestoreChain(top: ts.CallExpression): boolean {
  let e: ts.Expression = top;
  while (ts.isCallExpression(e) && ts.isPropertyAccessExpression(unwrap(e.expression))) {
    const pa = unwrap(e.expression) as ts.PropertyAccessExpression;
    if (!CHAIN_OPS.has(pa.name.text)) break;
    if (pa.name.text === "where" && e.arguments.length !== 3 && e.arguments.length !== 1) return false;
    e = unwrap(pa.expression);
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Judging a query against the index file.                              */
/* ------------------------------------------------------------------ */

export function isServed(q: QueryShape, indexes: CompositeIndex[]): boolean {
  if (q.docIdOnly) return true;
  return waysOf(q).every((v) => isWayServed(q, v, indexes));
}

/** Each way a query can run (one, unless it branches). */
function waysOf(q: QueryShape): Conj[] {
  return q.variants ?? [{ equality: q.equality, contains: q.contains, range: q.range, orderBy: q.orderBy, ...(q.unreadable ? { unreadable: true as const } : {}) }];
}

function isWayServed(at: Pick<QueryShape, "group" | "scope">, q: Conj, indexes: CompositeIndex[]): boolean {
  // A way with no field left (no filter, or document ids only) is a whole read
  // or a key read: there is nothing for an index to serve.
  // A way with a constraint the guard couldn't read is never served by having none.
  if (q.equality.length + q.contains.length + q.range.length + q.orderBy.length === 0) return !q.unreadable;
  const mine = indexes.filter((i) => i.collectionGroup === at.group && i.queryScope === at.scope);
  const leads = (field: string, contains: boolean) =>
    mine.some((i) => {
      const f = i.fields[0];
      if (!f || f.fieldPath !== field) return false;
      return contains ? f.arrayConfig === "CONTAINS" : f.arrayConfig === undefined;
    });
  if (q.equality.some((f) => leads(f, false))) return true;
  if (q.contains.some((f) => leads(f, true))) return true;
  if (q.equality.length === 0 && q.contains.length === 0) {
    const fallbacks = [...q.range, ...q.orderBy.map((o) => o.field)];
    if (fallbacks.some((f) => leads(f, false))) return true;
  }
  return false;
}

/**
 * Printed in place of a second field when a query names only one. A composite
 * needs two (a one-field composite is unchecked on Enterprise, and the index
 * file's own test refuses one), and the guard can't know which other field
 * the collection's documents carry.
 */
export const SECOND_FIELD_PLACEHOLDER = "CHOOSE_A_SECOND_FIELD_THESE_DOCUMENTS_CARRY";

/**
 * The two-field composite that would serve this query (the first of its ways
 * the indexes don't serve, when it branches), as the index file writes it.
 */
export function suggestedIndex(shape: QueryShape, indexes: CompositeIndex[] = []): CompositeIndex {
  const ways = waysOf(shape);
  const q = ways.find((v) => !isWayServed(shape, v, indexes)) ?? ways[0];
  const fields: IndexField[] = [];
  const seen = new Set<string>();
  const add = (f: IndexField) => {
    if (seen.has(f.fieldPath) || fields.length >= 2) return;
    seen.add(f.fieldPath);
    fields.push(f);
  };
  const order = (field: string) => q.orderBy.find((o) => o.field === field)?.direction ?? "ASCENDING";
  for (const f of q.equality) add({ fieldPath: f, order: "ASCENDING" });
  for (const f of q.contains) add({ fieldPath: f, arrayConfig: "CONTAINS" });
  for (const o of q.orderBy) add({ fieldPath: o.field, order: o.direction });
  for (const f of q.range) add({ fieldPath: f, order: order(f) });
  if (fields.length < 2) add({ fieldPath: SECOND_FIELD_PLACEHOLDER, order: "ASCENDING" });
  return { collectionGroup: shape.group ?? "?", queryScope: shape.scope ?? "COLLECTION", fields };
}

export function describeShape(q: QueryShape): string {
  if (q.variants) {
    const ways = q.variants.map((v) => describeShape({ ...q, ...v, variants: undefined }).replace(/^[^(]*/, ""));
    return `${q.file}:${q.line}  ${q.scope === "COLLECTION_GROUP" ? "collectionGroup " : ""}${q.group ?? "?"} one of ${ways.join(" | ")}`;
  }
  const parts = [
    ...q.equality.map((f) => `${f} ==`),
    ...q.contains.map((f) => `${f} contains`),
    ...q.range.map((f) => `${f} range`),
    ...q.orderBy.map((o) => `orderBy ${o.field}${o.direction === "DESCENDING" ? " desc" : ""}`),
  ];
  return `${q.file}:${q.line}  ${q.scope === "COLLECTION_GROUP" ? "collectionGroup " : ""}${q.group ?? "?"} (${parts.join(", ")})`;
}
