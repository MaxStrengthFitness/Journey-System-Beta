/**
 * A STRUCTURAL LINT FOR `firestore.rules`, WITH NO EMULATOR.
 *
 * `npm run test:rules` is the real check, and it stays the real check. But it
 * needs a JDK and a download from storage.googleapis.com, so it does not run
 * everywhere the rest of the suite runs — which means a rules file can be
 * edited, typechecked, built, committed and pushed without anything once
 * looking at it. This closes the cheapest part of that gap: it cannot tell
 * you a rule is WRONG, only that the file is still a file.
 *
 * Added during the Demo Mode round (Sep 20 2026), after editing six helpers
 * in a 2,700-line security file that no test in reach could compile.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(resolve(__dirname, "../firestore.rules"), "utf8");

/** The file with comments and string literals removed, for counting. */
function stripped(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (two === "//") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (two === "/*") {
      i += 2;
      while (i < text.length && text.slice(i, i + 2) !== "*/") i += 1;
      i += 2;
      continue;
    }
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      i += 1;
      while (i < text.length && text[i] !== ch) i += text[i] === "\\" ? 2 : 1;
      i += 1;
      out += "''";
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const CODE = stripped(SOURCE);

/** Everything the rules language gives you for free. */
const BUILT_INS = new Set([
  "exists", "get", "getAfter", "existsAfter", "debug", "int", "float",
  "string", "bool", "duration", "timestamp", "math", "hashing", "latlng",
  "path", "request", "resource", "keys", "values", "size", "hasAll",
  "hasAny", "hasOnly", "matches", "lower", "upper", "trim", "split",
  "toUtf8", "toBase64", "diff", "affectedKeys", "removedKeys", "addedKeys",
  "changedKeys", "unchangedKeys", "toMillis", "date", "time", "year",
  "month", "day", "hours", "minutes", "seconds", "nanos", "dayOfWeek",
  "toSet", "difference", "union", "intersection", "abs", "ceil", "floor",
  "round", "isEqual", "is_string", "value", "replace", "toDate",
]);

/** Language keywords that are followed by "(" and are not calls. */
const KEYWORDS = new Set(["return", "if", "function", "allow", "match"]);

describe("firestore.rules stays syntactically whole", () => {
  it("balances every brace", () => {
    const open = (CODE.match(/\{/g) || []).length;
    const close = (CODE.match(/\}/g) || []).length;
    expect({ open, close }).toEqual({ open: close, close });
  });

  it("balances every parenthesis", () => {
    const open = (CODE.match(/\(/g) || []).length;
    const close = (CODE.match(/\)/g) || []).length;
    expect({ open, close }).toEqual({ open: close, close });
  });

  it("never goes negative on either, which a stray closer would", () => {
    let braces = 0;
    let parens = 0;
    for (const ch of CODE) {
      if (ch === "{") braces += 1;
      else if (ch === "}") braces -= 1;
      else if (ch === "(") parens += 1;
      else if (ch === ")") parens -= 1;
      expect(braces).toBeGreaterThanOrEqual(0);
      expect(parens).toBeGreaterThanOrEqual(0);
    }
  });

  it("calls no function it does not define", () => {
    const defined = new Set(
      [...CODE.matchAll(/function\s+(\w+)\s*\(/g)].map((m) => m[1]),
    );
    const called = new Set(
      [...CODE.matchAll(/(?<![\w.])(\w+)\s*\(/g)].map((m) => m[1]),
    );
    const unknown = [...called].filter(
      (name) => !defined.has(name) && !BUILT_INS.has(name) && !KEYWORDS.has(name),
    );
    expect(unknown).toEqual([]);
  });

  it("opens with the version and the global deny", () => {
    expect(SOURCE.trimStart().startsWith("rules_version = '2';")).toBe(true);
    expect(CODE).toContain("allow read, write: if false;");
  });

  it("names the demo studio exactly where it is meant to", () => {
    // The id is a literal on purpose (a lookup would cost a read on every
    // rule that asks). If somebody renames it, this says so loudly rather
    // than the demo quietly losing its access.
    expect(SOURCE).toContain("function isDemoStudioId(studioId)");
    expect(SOURCE).toContain("function hasRunOfDemo(studioId)");
    expect(SOURCE).toContain("function isDemoTrainerPayload(trainerId, data)");
    expect(SOURCE.match(/'demo-studio'/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
