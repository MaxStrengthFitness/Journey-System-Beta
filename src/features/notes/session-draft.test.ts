import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_SESSION_DRAFT,
  clearSessionDraft,
  hasDraftText,
  isSessionNoteDraft,
  readSessionDraft,
  writeSessionDraft,
} from "./session-draft";

const store = new Map<string, string>();
const shim = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

beforeEach(() => {
  store.clear();
  (globalThis as { window?: unknown }).window = { sessionStorage: shim };
});

describe("the session note draft", () => {
  it("is a draft only when there are words in it", () => {
    expect(hasDraftText(EMPTY_SESSION_DRAFT)).toBe(false);
    expect(hasDraftText({ ...EMPTY_SESSION_DRAFT, body: "   " })).toBe(false);
    expect(hasDraftText({ ...EMPTY_SESSION_DRAFT, body: "holds her breath at rep 8" })).toBe(true);
    expect(hasDraftText(null)).toBe(false);
  });

  it("survives a round trip under the session id", () => {
    const d = { ...EMPTY_SESSION_DRAFT, body: "ask about the knee", category: "coaching" as const, machineId: "leg-press" };
    writeSessionDraft("s1", d);
    expect(readSessionDraft("s1")).toEqual(d);
    expect(readSessionDraft("s2")).toBeNull();
  });

  it("removes the key once the words are gone — a saved note leaves nothing behind", () => {
    writeSessionDraft("s1", { ...EMPTY_SESSION_DRAFT, body: "something" });
    writeSessionDraft("s1", EMPTY_SESSION_DRAFT);
    expect(readSessionDraft("s1")).toBeNull();
    writeSessionDraft("s1", { ...EMPTY_SESSION_DRAFT, body: "again" });
    clearSessionDraft("s1");
    expect(readSessionDraft("s1")).toBeNull();
  });

  it("refuses rubbish and fills in what an older draft lacks", () => {
    expect(isSessionNoteDraft({ body: "x" })).toBe(true);
    expect(isSessionNoteDraft({ category: "coaching" })).toBe(false);
    store.set("msf_session_note:s1", JSON.stringify({ body: "old shape" }));
    expect(readSessionDraft("s1")).toEqual({ ...EMPTY_SESSION_DRAFT, body: "old shape" });
    store.set("msf_session_note:bad", "{not json");
    expect(readSessionDraft("bad")).toBeNull();
  });

  it("gives up quietly without storage", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(readSessionDraft("s1")).toBeNull();
    expect(() => writeSessionDraft("s1", { ...EMPTY_SESSION_DRAFT, body: "x" })).not.toThrow();
    expect(() => clearSessionDraft("s1")).not.toThrow();
  });
});
