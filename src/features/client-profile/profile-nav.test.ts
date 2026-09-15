import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_LOCATION,
  defaultProgrammingView,
  initialNavState,
  isLocation,
  legacyLocation,
  profileNavReducer,
  readStoredLocation,
  writeStoredLocation,
  type ProfileNavState,
} from "./profile-nav";

describe("legacyLocation", () => {
  it("keeps Journey where it was", () => {
    expect(legacyLocation("journey")).toEqual({ tab: "journey" });
  });

  it("sends the two old programming tabs into Programming", () => {
    expect(legacyLocation("routines")).toEqual({ tab: "programming", view: "routine-a" });
    expect(legacyLocation("equipment")).toEqual({ tab: "programming", view: "machines" });
  });

  it("sends the journal and the dossier sections into the record", () => {
    expect(legacyLocation("journal")).toEqual({ tab: "record", section: "notes" });
    expect(legacyLocation("details")).toEqual({ tab: "record", section: "general" });
    expect(legacyLocation("lifestyle")).toEqual({ tab: "record", section: "life" });
    expect(legacyLocation("events")).toEqual({ tab: "record", section: "life" });
    expect(legacyLocation("medical")).toEqual({ tab: "record", section: "medical" });
  });

  it("sends History and Clinical into the Activity Archive, on their own segments", () => {
    expect(legacyLocation("history")).toEqual({ tab: "clinical", view: "calendar" });
    expect(legacyLocation("clinical")).toEqual({ tab: "clinical", view: "trends" });
    expect(legacyLocation("reports")).toEqual({ tab: "clinical", view: "reports" });
  });

  it("is case-insensitive and falls back rather than throwing", () => {
    expect(legacyLocation("EQUIPMENT")).toEqual({ tab: "programming", view: "machines" });
    expect(legacyLocation("nonsense")).toEqual(DEFAULT_LOCATION);
    expect(legacyLocation(null)).toEqual(DEFAULT_LOCATION);
    expect(legacyLocation(undefined)).toEqual(DEFAULT_LOCATION);
  });

  it("has a real home for every id the seven-tab profile used", () => {
    // The exact strings ClientProfileView's TabsList carried before the merge.
    // None of them may fall through to the Journey default except Journey.
    for (const id of ["routines", "equipment", "journal", "history", "clinical", "details"]) {
      const to = legacyLocation(id);
      expect(isLocation(to)).toBe(true);
      expect(to).not.toEqual(DEFAULT_LOCATION);
    }
    expect(legacyLocation("journey")).toEqual(DEFAULT_LOCATION);
  });
});

describe("defaultProgrammingView", () => {
  it("opens on the routine the client is doing today", () => {
    expect(defaultProgrammingView({ todayRoutine: "Routine B", isBActive: true })).toBe("routine-b");
    expect(defaultProgrammingView({ todayRoutine: "Routine A" })).toBe("routine-a");
  });

  it("ignores a today-B that is switched off", () => {
    expect(defaultProgrammingView({ todayRoutine: "Routine B", isBActive: false })).toBe("routine-a");
  });

  it("opens on B when A is empty and B is not — an empty list reads as broken", () => {
    expect(defaultProgrammingView({ countA: 0, countB: 7, isBActive: true })).toBe("routine-b");
  });

  it("opens on A otherwise, including when both are empty", () => {
    expect(defaultProgrammingView({})).toBe("routine-a");
    expect(defaultProgrammingView({ countA: 0, countB: 0, isBActive: true })).toBe("routine-a");
    expect(defaultProgrammingView({ countA: 8, countB: 8, isBActive: true })).toBe("routine-a");
  });
});

describe("profileNavReducer", () => {
  const start = (): ProfileNavState => initialNavState();

  it("switches tabs", () => {
    const s = profileNavReducer(start(), { type: "tab", tab: "clinical" });
    expect(s.location).toEqual({ tab: "clinical", view: "calendar" });
  });

  it("returns you to the segment you left a tab on", () => {
    let s = start();
    s = profileNavReducer(s, { type: "tab", tab: "programming" });
    s = profileNavReducer(s, { type: "programming", view: "machines" });
    s = profileNavReducer(s, { type: "tab", tab: "journey" });
    s = profileNavReducer(s, { type: "tab", tab: "programming" });
    expect(s.location).toEqual({ tab: "programming", view: "machines" });
  });

  it("remembers each tab separately", () => {
    let s = start();
    s = profileNavReducer(s, { type: "programming", view: "routine-b" });
    s = profileNavReducer(s, { type: "clinical", view: "trends" });
    s = profileNavReducer(s, { type: "tab", tab: "programming" });
    expect(s.location).toEqual({ tab: "programming", view: "routine-b" });
    s = profileNavReducer(s, { type: "tab", tab: "clinical" });
    expect(s.location).toEqual({ tab: "clinical", view: "trends" });
  });

  it("uses the action's default only for a tab that has not been visited", () => {
    // The default rides IN the action, never in a closure the reducer reads.
    // See the note on ProfileNavAction: a reducer that closes over anything
    // declared below the useReducer call reads it in its temporal dead zone.
    const toProgramming = {
      type: "tab",
      tab: "programming",
      programmingDefault: "routine-b",
    } as const;

    let s = profileNavReducer(start(), toProgramming);
    expect(s.location).toEqual({ tab: "programming", view: "routine-b" });

    s = profileNavReducer(s, { type: "programming", view: "machines" });
    s = profileNavReducer(s, { type: "tab", tab: "journey" });
    s = profileNavReducer(s, toProgramming);
    expect(s.location).toEqual({ tab: "programming", view: "machines" });
  });

  it("takes exactly two arguments and closes over nothing", () => {
    // A guard on the shape, not the behaviour. This reducer went into
    // useReducer directly precisely so it could not reach outside itself;
    // giving it a third parameter again would reintroduce the wrapper closure
    // that crashed the profile.
    expect(profileNavReducer.length).toBe(2);
  });

  it("is a no-op when the tab is already active, so a stray tap cannot reset a segment", () => {
    let s = profileNavReducer(start(), { type: "clinical", view: "reports" });
    const again = profileNavReducer(s, { type: "tab", tab: "clinical" });
    expect(again).toBe(s);
  });

  it("takes a legacy id straight", () => {
    const s = profileNavReducer(start(), { type: "legacy", id: "equipment" });
    expect(s.location).toEqual({ tab: "programming", view: "machines" });
    expect(s.lastProgramming).toBe("machines");
  });

  it("jumps to a dossier section and remembers it", () => {
    let s = profileNavReducer(start(), { type: "section", section: "medical" });
    expect(s.location).toEqual({ tab: "record", section: "medical" });
    s = profileNavReducer(s, { type: "tab", tab: "journey" });
    s = profileNavReducer(s, { type: "tab", tab: "record" });
    expect(s.location).toEqual({ tab: "record", section: "medical" });
  });

  it("seeds the memory from the location it starts on", () => {
    const s = initialNavState({ tab: "clinical", view: "reports" });
    expect(s.lastClinical).toBe("reports");
    const moved = profileNavReducer(
      profileNavReducer(s, { type: "tab", tab: "journey" }),
      { type: "tab", tab: "clinical" },
    );
    expect(moved.location).toEqual({ tab: "clinical", view: "reports" });
  });
});

describe("isLocation", () => {
  it("accepts the real shapes", () => {
    expect(isLocation({ tab: "journey" })).toBe(true);
    expect(isLocation({ tab: "programming", view: "machines" })).toBe(true);
    expect(isLocation({ tab: "clinical", view: "trends" })).toBe(true);
    expect(isLocation({ tab: "record" })).toBe(true);
    expect(isLocation({ tab: "record", section: "goals" })).toBe(true);
  });

  it("rejects anything else — session storage is user-writable and outlives a deploy", () => {
    expect(isLocation(null)).toBe(false);
    expect(isLocation("journey")).toBe(false);
    expect(isLocation({ tab: "equipment" })).toBe(false);
    expect(isLocation({ tab: "programming" })).toBe(false);
    expect(isLocation({ tab: "programming", view: "routine-c" })).toBe(false);
    expect(isLocation({ tab: "clinical", view: "list" })).toBe(false);
  });
});

describe("stored location", () => {
  // These tests run in the node environment, which has no window. The module
  // is written to survive that (a private window throws the same way), so the
  // storage is stubbed here rather than the suite moved to jsdom for two
  // functions.
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

  it("gives up quietly when there is no storage at all", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(readStoredLocation("judy")).toBeNull();
    expect(() => writeStoredLocation("judy", { tab: "journey" })).not.toThrow();
  });

  it("round-trips per client", () => {
    writeStoredLocation("judy", { tab: "programming", view: "routine-b" });
    writeStoredLocation("marcus", { tab: "clinical", view: "trends" });
    expect(readStoredLocation("judy")).toEqual({ tab: "programming", view: "routine-b" });
    expect(readStoredLocation("marcus")).toEqual({ tab: "clinical", view: "trends" });
  });

  it("returns null for an unknown client, no client, and rubbish", () => {
    expect(readStoredLocation("nobody")).toBeNull();
    expect(readStoredLocation(null)).toBeNull();
    window.sessionStorage.setItem("msf_profile_nav:bad", "{not json");
    expect(readStoredLocation("bad")).toBeNull();
    window.sessionStorage.setItem("msf_profile_nav:stale", JSON.stringify({ tab: "equipment" }));
    expect(readStoredLocation("stale")).toBeNull();
  });
});
