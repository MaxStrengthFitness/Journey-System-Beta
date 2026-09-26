import { describe, expect, it } from "vitest";
import { nothingKind, nothingWords, type NothingKind } from "./nothing-on-screen";

describe("nothingKind", () => {
  it("is no session when no client was chosen", () => {
    expect(nothingKind(null, undefined)).toBe("no-session");
    expect(nothingKind(null, "failed")).toBe("no-session");
  });

  it("names a failed read and a missing record as what they are", () => {
    expect(nothingKind("c1", "failed")).toBe("failed");
    expect(nothingKind("c1", "missing")).toBe("missing");
  });

  it("is still loading otherwise, including when the host did not say", () => {
    expect(nothingKind("c1", "loading")).toBe("loading");
    expect(nothingKind("c1", undefined)).toBe("loading");
    expect(nothingKind("c1", "ready")).toBe("loading");
  });
});

describe("nothingWords", () => {
  const kinds: NothingKind[] = ["loading", "failed", "missing", "no-session"];

  it("says a sentence for every case, never nothing", () => {
    for (const k of kinds) {
      const w = nothingWords(k);
      expect(w.title.length).toBeGreaterThan(10);
      expect(w.body.length).toBeGreaterThan(10);
    }
  });

  it("offers a retry only for a read that failed, and a client search where there is no client", () => {
    expect(nothingWords("failed").primary).toBe("retry");
    expect(nothingWords("missing").primary).toBe("find-client");
    expect(nothingWords("no-session").primary).toBe("find-client");
    expect(nothingWords("loading").primary).toBeNull();
  });

  it("never uses developer words", () => {
    const all = kinds.map((k) => `${nothingWords(k).title} ${nothingWords(k).body}`).join(" ");
    expect(all).not.toMatch(/firestore|firebase|null|undefined|error|document|fetch/i);
  });
});
