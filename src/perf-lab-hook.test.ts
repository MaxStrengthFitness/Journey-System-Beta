/**
 * The performance lab's hook stays out of every real build (harness/perf-lab,
 * Oct 6 2026). The lab's code is only reachable behind the literal build-time
 * flag `import.meta.env.VITE_PERF_LAB === "1"`, which Vite replaces at build
 * time, so a build without it drops the branch, the hook and the emulator
 * imports. These read the source; the lab's README says how the built output
 * was checked too (no connectFirestoreEmulator, __perfLab or 127.0.0.1:8085).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(__dirname);
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const FLAG = 'import.meta.env.VITE_PERF_LAB === "1"';

/** The source without comments, so a comment may name what the code may not use. */
function codeOf(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

function allSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) allSourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe("the performance lab's hook", () => {
  const firebase = codeOf(read("firebase.ts"));
  const hook = codeOf(read("perf-lab-hook.ts"));

  it("firebase.ts reaches the lab only behind the exact flag", () => {
    const lines = firebase.split("\n").filter((l) => /startPerfLab\(|labFirebaseConfig\(/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const line of lines) expect(line).toContain(FLAG);
  });

  it("the flag is compared as written, never through a variable Vite can't replace", () => {
    const uses = firebase.match(/import\.meta\.env\.VITE_PERF_LAB[^\n]*/g) ?? [];
    expect(uses.length).toBeGreaterThan(0);
    for (const use of uses) expect(use.startsWith(FLAG)).toBe(true);
  });

  it("the hook does nothing when imported: only imports, constants and functions at the top", () => {
    const top = hook
      .split("\n")
      .filter((l) => l.length > 0 && !/^\s/.test(l) && !/^[})\]]/.test(l));
    for (const line of top) {
      expect(line).toMatch(/^(import |export (const [A-Z_]+ = ['\d]|function |async function ))/);
    }
  });

  it("the hook refuses any project that isn't demo-*", () => {
    expect(hook).toContain("projectId.startsWith('demo-')");
  });

  it("only the hook connects to an emulator or exposes __perfLab, and only firebase.ts imports it", () => {
    for (const file of allSourceFiles(SRC)) {
      const rel = file.slice(SRC.length + 1).replace(/\\/g, "/");
      const code = codeOf(readFileSync(file, "utf8"));
      if (rel !== "perf-lab-hook.ts") {
        expect(code, rel).not.toMatch(/connectFirestoreEmulator|connectAuthEmulator|__perfLab/);
      }
      if (rel !== "firebase.ts" && rel !== "perf-lab-hook.ts") {
        expect(code, rel).not.toMatch(/perf-lab-hook/);
      }
    }
  });
});
