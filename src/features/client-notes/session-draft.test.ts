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

  it("keeps the machine menu's floor switch only when it is exactly true", () => {
    const floor = { ...EMPTY_SESSION_DRAFT, body: "seat pin sticks", machineId: "leg-press", toFloor: true };
    writeSessionDraft("s1", floor);
    expect(readSessionDraft("s1")).toEqual(floor);
    expect(readSessionDraft("s1")?.toFloor).toBe(true);

    // Storage is user-writable: anything but true is a note about the client, and the key goes.
    for (const odd of ["true", 1, "yes", false, null, {}]) {
      store.set("msf_session_note:s2", JSON.stringify({ body: "seat pin sticks", toFloor: odd }));
      const read = readSessionDraft("s2");
      expect(read?.body).toBe("seat pin sticks");
      expect(read && "toFloor" in read).toBe(false);
    }
  });

  it("reads a draft written before the switch as a note about the client", () => {
    store.set("msf_session_note:s1", JSON.stringify({ body: "ask about the knee", machineId: "leg-press", aboutMachine: true }));
    const read = readSessionDraft("s1");
    expect(read?.toFloor).toBeUndefined();
    expect(read).toEqual({ ...EMPTY_SESSION_DRAFT, body: "ask about the knee", machineId: "leg-press" });
  });

  it("gives up quietly without storage", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(readSessionDraft("s1")).toBeNull();
    expect(() => writeSessionDraft("s1", { ...EMPTY_SESSION_DRAFT, body: "x" })).not.toThrow();
    expect(() => clearSessionDraft("s1")).not.toThrow();
  });
});
