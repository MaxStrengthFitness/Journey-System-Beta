import { beforeEach, describe, expect, it } from "vitest";
import { DOSSIER_SECTIONS, type DossierSection } from "../../types/journal";
import {
  DEFAULT_LOCATION,
  PAGE_TO_SECTION,
  RECORD_ANCHORS,
  RECORD_PAGES,
  RECORD_PAGE_IDS,
  SECTION_TO_PAGE,
  defaultProgrammingView,
  initialNavState,
  isLocation,
  isRecordAnchor,
  isRecordPage,
  legacyLocation,
  neighbours,
  normalizeLocation,
  noteAnchor,
  openProfileAt,
  pageOfAnchor,
  profileNavReducer,
  readStoredLocation,
  recordLocation,
  sectionForRecord,
  sectionLocation,
  takeStoredLocation,
  writeStoredLocation,
  type ProfileLocation,
  type ProfileNavState,
  type RecordPage,
} from "./profile-nav";

describe("legacyLocation", () => {
  it("keeps Journey where it was", () => {
    expect(legacyLocation("journey")).toEqual({ tab: "journey" });
  });

  it("sends the two old programming tabs into Programming", () => {
    expect(legacyLocation("routines")).toEqual({ tab: "programming", view: "routine-a" });
    expect(legacyLocation("equipment")).toEqual({ tab: "programming", view: "machines" });
    expect(legacyLocation("setup")).toEqual({ tab: "programming", view: "setup" });
    expect(legacyLocation("setup-check")).toEqual({ tab: "programming", view: "setup" });
  });

  it("sends the journal and the old record ids onto a page of the codex", () => {
    expect(legacyLocation("journal")).toEqual({ tab: "record", page: "notes" });
    // The old Details tab was the whole profile: its front page now.
    expect(legacyLocation("details")).toEqual({ tab: "record", page: "overview" });
    expect(legacyLocation("lifestyle")).toEqual({ tab: "record", page: "ford" });
    expect(legacyLocation("events")).toEqual({ tab: "record", page: "ford" });
    expect(legacyLocation("medical")).toEqual({
      tab: "record",
      page: "body",
      anchor: "body-watchouts",
    });
  });

  it("lands every row of the codex's legacy table exactly", () => {
    const rows: [string, RecordPage, string?][] = [
      ["journal", "notes"],
      ["notes", "notes"],
      ["overview", "overview"],
      ["codex", "overview"],
      ["record", "overview"],
      ["details", "overview"],
      ["profile", "overview"],
      ["identity", "account", "account-contact"],
      ["general", "account", "account-contact"],
      ["life", "ford"],
      ["lifestyle", "ford"],
      ["ford", "ford"],
      ["events", "ford"],
      ["medical", "body", "body-watchouts"],
      ["body", "body"],
      ["pulse", "body", "body-pulse"],
      ["check-in", "body", "body-pulse"],
      ["assessment", "body", "body-pulse"],
      ["goals", "goals"],
      ["focus", "goals", "goals-focus"],
      ["story", "story"],
      ["account", "account"],
      ["admin", "account", "account-membership"],
      ["membership", "account", "account-membership"],
      ["contract", "account", "account-membership"],
    ];
    for (const [id, page, anchor] of rows) {
      const want: ProfileLocation = anchor
        ? { tab: "record", page, anchor }
        : { tab: "record", page };
      expect(legacyLocation(id), id).toStrictEqual(want);
    }
  });

  it("keeps `reports` on the filed shelf — the Pulse SECTION is a different door", () => {
    expect(legacyLocation("reports")).toEqual({ tab: "clinical", view: "reports" });
    expect(sectionLocation("reports")).toEqual({
      tab: "record",
      page: "body",
      anchor: "body-pulse",
    });
  });

  it("covers every id ClientInfoSheet's old tab table answered to", () => {
    // LEGACY_TAB_TO_SECTION, before the codex. Its `reports` meant the Pulse
    // section and only ever came from the nav itself, so it is the one id that
    // keeps its Activity Archive meaning here.
    for (const id of [
      "identity",
      "general",
      "lifestyle",
      "life",
      "medical",
      "goals",
      "focus",
      "notes",
      "journal",
      "admin",
      "events",
    ]) {
      const to = legacyLocation(id);
      expect(to.tab, id).toBe("record");
      expect(isLocation(to), id).toBe(true);
    }
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

  it("has a real home for every old dossier section id", () => {
    for (const s of DOSSIER_SECTIONS) {
      const to = legacyLocation(s.id);
      expect(isLocation(to), s.id).toBe(true);
      expect(to, s.id).not.toEqual(DEFAULT_LOCATION);
    }
  });
});

describe("the record's pages", () => {
  it("are AJ's seven, in AJ's order", () => {
    expect(RECORD_PAGE_IDS).toEqual([
      "overview",
      "notes",
      "ford",
      "body",
      "goals",
      "story",
      "account",
    ]);
    expect(RECORD_PAGES.map((p) => p.label)).toEqual([
      "Overview",
      "Notes",
      "FORD",
      "Body & Pulse",
      "Goals & Focus",
      "Story",
      "Account",
    ]);
  });

  it("name no client and use no pronoun in their Next-card lines", () => {
    for (const p of RECORD_PAGES) {
      expect(p.blurb.length, p.id).toBeGreaterThan(0);
      expect(p.blurb, p.id).not.toMatch(/\b(she|her|hers|he|him|his|they|them|their)\b/i);
    }
  });

  it("knows its own ids and nothing else", () => {
    expect(isRecordPage("ford")).toBe(true);
    expect(isRecordPage("general")).toBe(false);
    expect(isRecordPage("")).toBe(false);
    expect(isRecordPage(undefined)).toBe(false);
  });

  it("neighbours: the Overview has no before; Account's next is Done, back to the Overview", () => {
    expect(neighbours("overview")).toEqual({ prev: null, next: "notes", nextIsDone: false });
    expect(neighbours("notes")).toEqual({ prev: "overview", next: "ford", nextIsDone: false });
    expect(neighbours("ford")).toEqual({ prev: "notes", next: "body", nextIsDone: false });
    expect(neighbours("story")).toEqual({ prev: "goals", next: "account", nextIsDone: false });
    expect(neighbours("account")).toEqual({ prev: "story", next: "overview", nextIsDone: true });
  });

  it("neighbours walk every page once, forwards and back", () => {
    let at: RecordPage = "overview";
    const seen: RecordPage[] = [at];
    for (let i = 0; i < RECORD_PAGE_IDS.length - 1; i++) {
      const { next } = neighbours(at);
      expect(neighbours(next).prev).toBe(at);
      at = next;
      seen.push(at);
    }
    expect(seen).toEqual(RECORD_PAGE_IDS);
    expect(neighbours(at).next).toBe("overview");
  });
});

describe("the anchor registry", () => {
  it("holds unique, well-formed ids", () => {
    expect(new Set(RECORD_ANCHORS).size).toBe(RECORD_ANCHORS.length);
    for (const a of RECORD_ANCHORS) expect(isRecordAnchor(a), a).toBe(true);
  });

  it("names every anchor after its page, so the id alone says where it lives", () => {
    for (const a of RECORD_ANCHORS) {
      const page = pageOfAnchor(a);
      expect(page, a).not.toBeNull();
      expect(a.startsWith(`${page}-`), a).toBe(true);
    }
  });

  it("has the Account cards the Story and intake doors point at", () => {
    // Added to the shell's list by the integration: 'account#on-file' and
    // where she can train.
    expect(RECORD_ANCHORS).toContain("account-on-file");
    expect(RECORD_ANCHORS).toContain("account-train-at");
  });

  it("puts one thread on Notes, whatever its id", () => {
    expect(noteAnchor("abc123")).toBe("note-abc123");
    expect(pageOfAnchor("note-abc123")).toBe("notes");
    // A synthesised journal id is a real thread id too.
    const legacy = noteAnchor("legacy:clinicalIncidents:x9");
    expect(isRecordAnchor(legacy)).toBe(true);
    expect(pageOfAnchor(legacy)).toBe("notes");
  });

  it("refuses a thread id that does not fit, and Notes still opens (an id-less client event)", () => {
    // useClientJournal synthesises `legacy:clientEvents:{date}{title}` for an
    // event with no id: spaces, and it can run long. A door to that thread
    // must check before offering the card; if it does not, the page opens.
    const idless = noteAnchor("legacy:clientEvents:2026-03-01Knee flare after the move");
    expect(isRecordAnchor(idless)).toBe(false);
    expect(recordLocation("notes", idless)).toStrictEqual({ tab: "record", page: "notes" });
  });

  it("refuses a malformed anchor", () => {
    expect(isRecordAnchor("a b")).toBe(false);
    expect(isRecordAnchor("")).toBe(false);
    expect(isRecordAnchor("x".repeat(81))).toBe(false);
    expect(isRecordAnchor("x".repeat(80))).toBe(true);
    expect(isRecordAnchor("#ford")).toBe(false);
    expect(isRecordAnchor('ford"]')).toBe(false);
    expect(isRecordAnchor(42)).toBe(false);
  });

  it("does not guess a page for an id with no page prefix", () => {
    expect(pageOfAnchor("somewhere")).toBeNull();
    expect(pageOfAnchor("fordx")).toBeNull();
    expect(pageOfAnchor("ford")).toBeNull();
    expect(pageOfAnchor("sessions-x")).toBeNull();
    expect(pageOfAnchor("-ford")).toBeNull();
  });
});

describe("recordLocation", () => {
  it("keeps a good anchor on its own page", () => {
    expect(recordLocation("ford", "ford-occupation")).toStrictEqual({
      tab: "record",
      page: "ford",
      anchor: "ford-occupation",
    });
  });

  it("drops an anchor that is malformed or belongs to another page — the page still opens", () => {
    expect(recordLocation("ford", "a b")).toStrictEqual({ tab: "record", page: "ford" });
    expect(recordLocation("ford", "body-watchouts")).toStrictEqual({ tab: "record", page: "ford" });
    expect(recordLocation("goals", "note-abc")).toStrictEqual({ tab: "record", page: "goals" });
  });

  it("never writes an undefined key (the location is JSON in sessionStorage)", () => {
    const loc = recordLocation("notes");
    expect(Object.keys(loc)).toEqual(["tab", "page"]);
    expect(Object.keys(recordLocation("notes", undefined))).toEqual(["tab", "page"]);
    expect(Object.keys(recordLocation("notes", null))).toEqual(["tab", "page"]);
  });
});

describe("SECTION_TO_PAGE", () => {
  it("lands every dossier section on a page, most on a card", () => {
    const want: Record<DossierSection, [RecordPage, string?]> = {
      notes: ["notes"],
      general: ["account", "account-contact"],
      life: ["ford"],
      medical: ["body", "body-watchouts"],
      goals: ["goals"],
      focus: ["goals", "goals-focus"],
      reports: ["body", "body-pulse"],
      admin: ["account", "account-membership"],
    };
    for (const s of DOSSIER_SECTIONS) {
      const [page, anchor] = want[s.id];
      expect(SECTION_TO_PAGE[s.id], s.id).toEqual(anchor ? { page, anchor } : { page });
      const loc = sectionLocation(s.id);
      expect(isLocation(loc), s.id).toBe(true);
      expect(loc, s.id).toStrictEqual(
        anchor ? { tab: "record", page, anchor } : { tab: "record", page },
      );
    }
    expect(Object.keys(SECTION_TO_PAGE).sort()).toEqual(DOSSIER_SECTIONS.map((s) => s.id).sort());
  });

  it("only uses anchors that are in the registry", () => {
    for (const to of Object.values(SECTION_TO_PAGE)) {
      if (to.anchor) expect(RECORD_ANCHORS as readonly string[]).toContain(to.anchor);
    }
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

  it("opens a record page, and a card on it", () => {
    let s = profileNavReducer(start(), { type: "record", page: "ford" });
    expect(s.location).toStrictEqual({ tab: "record", page: "ford" });
    s = profileNavReducer(s, { type: "record", page: "ford", anchor: "ford-occupation" });
    expect(s.location).toStrictEqual({ tab: "record", page: "ford", anchor: "ford-occupation" });
  });

  it("re-issues the same page and card as a NEW location, so the card is scrolled to again", () => {
    // The codex shell re-runs its anchor scroll on the location's identity:
    // the Save bar's "Show" tapped twice must land twice.
    const a = profileNavReducer(start(), { type: "record", page: "body", anchor: "body-build" });
    const b = profileNavReducer(a, { type: "record", page: "body", anchor: "body-build" });
    expect(b.location).toEqual(a.location);
    expect(b.location).not.toBe(a.location);
  });

  it("drops a bad anchor from a record action and keeps the page", () => {
    const s = profileNavReducer(start(), { type: "record", page: "notes", anchor: "a b" });
    expect(s.location).toStrictEqual({ tab: "record", page: "notes" });
  });

  it("lands a dossier section on its page", () => {
    let s = profileNavReducer(start(), { type: "section", section: "life" });
    expect(s.location).toStrictEqual({ tab: "record", page: "ford" });
    s = profileNavReducer(s, { type: "section", section: "medical" });
    expect(s.location).toStrictEqual({ tab: "record", page: "body", anchor: "body-watchouts" });
  });

  it("opens Notes & Profile on the Overview every time — AJ's decision 1", () => {
    let s = profileNavReducer(start(), { type: "tab", tab: "record" });
    expect(s.location).toStrictEqual({ tab: "record", page: "overview" });

    // Visit FORD (a deep link), leave, come back: the Overview, not FORD.
    s = profileNavReducer(s, { type: "record", page: "ford", anchor: "ford-family" });
    s = profileNavReducer(s, { type: "tab", tab: "journey" });
    s = profileNavReducer(s, { type: "tab", tab: "record" });
    expect(s.location).toStrictEqual({ tab: "record", page: "overview" });
  });

  it("does not let the record touch the other tabs' memory", () => {
    let s = start();
    s = profileNavReducer(s, { type: "programming", view: "routine-b" });
    s = profileNavReducer(s, { type: "clinical", view: "trends" });
    s = profileNavReducer(s, { type: "record", page: "goals", anchor: "goals-focus" });
    s = profileNavReducer(s, { type: "section", section: "admin" });
    expect(s.lastProgramming).toBe("routine-b");
    expect(s.lastClinical).toBe("trends");
    s = profileNavReducer(s, { type: "tab", tab: "programming" });
    expect(s.location).toEqual({ tab: "programming", view: "routine-b" });
    s = profileNavReducer(s, { type: "tab", tab: "clinical" });
    expect(s.location).toEqual({ tab: "clinical", view: "trends" });
  });

  it("a stray tap on the record tab while on a page does not reset the page", () => {
    const s = profileNavReducer(start(), { type: "record", page: "story" });
    expect(profileNavReducer(s, { type: "tab", tab: "record" })).toBe(s);
  });

  it("keeps no memory of the record in its state", () => {
    const s = profileNavReducer(start(), { type: "record", page: "account" });
    expect(Object.keys(s).sort()).toEqual(["lastClinical", "lastProgramming", "location"]);
  });

  it("normalises what `go` is handed", () => {
    let s = profileNavReducer(start(), { type: "go", to: { tab: "record" } });
    expect(s.location).toStrictEqual({ tab: "record", page: "overview" });
    s = profileNavReducer(s, { type: "go", to: { tab: "record", anchor: "goals-why" } });
    expect(s.location).toStrictEqual({ tab: "record", page: "goals", anchor: "goals-why" });
    s = profileNavReducer(s, { type: "go", to: { tab: "clinical", view: "sessions" } });
    expect(s.location).toEqual({ tab: "clinical", view: "sessions" });
  });

  it("takes a legacy record id onto its page", () => {
    const s = profileNavReducer(start(), { type: "legacy", id: "focus" });
    expect(s.location).toStrictEqual({ tab: "record", page: "goals", anchor: "goals-focus" });
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
    expect(isLocation({ tab: "programming", view: "setup" })).toBe(true);
    expect(isLocation({ tab: "clinical", view: "trends" })).toBe(true);
    expect(isLocation({ tab: "record" })).toBe(true);
    expect(isLocation({ tab: "record", page: "ford" })).toBe(true);
    expect(isLocation({ tab: "record", page: "ford", anchor: "ford-occupation" })).toBe(true);
    expect(isLocation({ tab: "record", page: "notes", anchor: "note-abc123" })).toBe(true);
  });

  it("accepts a handoff written before the codex, to be normalised", () => {
    expect(isLocation({ tab: "record", section: "goals" })).toBe(true);
    expect(isLocation({ tab: "record", section: "medical" })).toBe(true);
  });

  it("rejects anything else — session storage is user-writable and outlives a deploy", () => {
    expect(isLocation(null)).toBe(false);
    expect(isLocation("journey")).toBe(false);
    expect(isLocation({ tab: "equipment" })).toBe(false);
    expect(isLocation({ tab: "programming" })).toBe(false);
    expect(isLocation({ tab: "programming", view: "routine-c" })).toBe(false);
    expect(isLocation({ tab: "clinical", view: "list" })).toBe(false);
    expect(isLocation({ tab: "record", page: "nonsense" })).toBe(false);
    expect(isLocation({ tab: "record", page: "ford", anchor: "a b" })).toBe(false);
    expect(isLocation({ tab: "record", page: "ford", anchor: "x".repeat(81) })).toBe(false);
    expect(isLocation({ tab: "record", page: 3 })).toBe(false);
    expect(isLocation({ tab: "record", section: 3 })).toBe(false);
  });
});

describe("normalizeLocation", () => {
  it("lands a pre-codex section on its page and card", () => {
    expect(normalizeLocation({ tab: "record", section: "medical" })).toStrictEqual({
      tab: "record",
      page: "body",
      anchor: "body-watchouts",
    });
    expect(normalizeLocation({ tab: "record", section: "life" })).toStrictEqual({
      tab: "record",
      page: "ford",
    });
    // The section titled Pulse, not the filed shelf.
    expect(normalizeLocation({ tab: "record", section: "reports" })).toStrictEqual({
      tab: "record",
      page: "body",
      anchor: "body-pulse",
    });
  });

  it("reads an old id that was never a section through the legacy table", () => {
    expect(normalizeLocation({ tab: "record", section: "lifestyle" })).toStrictEqual({
      tab: "record",
      page: "ford",
    });
    // Nothing the record knows, and nothing that leaves the tab: the Overview.
    expect(normalizeLocation({ tab: "record", section: "history" })).toStrictEqual({
      tab: "record",
      page: "overview",
    });
    expect(normalizeLocation({ tab: "record", section: "rubbish" })).toStrictEqual({
      tab: "record",
      page: "overview",
    });
  });

  it("opens the Overview for a bare record location, and a page for its anchor", () => {
    expect(normalizeLocation({ tab: "record" })).toStrictEqual({ tab: "record", page: "overview" });
    expect(normalizeLocation({ tab: "record", anchor: "account-found-us" })).toStrictEqual({
      tab: "record",
      page: "account",
      anchor: "account-found-us",
    });
  });

  it("lets a page win over a stale section", () => {
    const stale = { tab: "record", page: "story", section: "medical" } as const;
    expect(normalizeLocation(stale)).toStrictEqual({ tab: "record", page: "story" });
  });

  it("passes the other tabs through untouched", () => {
    const loc: ProfileLocation = { tab: "programming", view: "setup" };
    expect(normalizeLocation(loc)).toBe(loc);
    expect(normalizeLocation({ tab: "journey" })).toEqual({ tab: "journey" });
  });

  it("is idempotent", () => {
    for (const loc of [
      recordLocation("ford", "ford-dreams"),
      recordLocation("overview"),
      sectionLocation("admin"),
    ]) {
      expect(normalizeLocation(normalizeLocation(loc))).toStrictEqual(normalizeLocation(loc));
    }
  });
});

describe("the long scroll's landing (temporary, until the codex shell)", () => {
  it("turns every page back into the section that holds it today", () => {
    expect(sectionForRecord("notes")).toBe("notes");
    expect(sectionForRecord("ford")).toBe("life");
    expect(sectionForRecord("body")).toBe("medical");
    expect(sectionForRecord("goals")).toBe("goals");
    expect(sectionForRecord("account")).toBe("general");
    // No section of their own: the tab's usual landing (Notes, top of the spine).
    expect(sectionForRecord("overview")).toBeUndefined();
    expect(sectionForRecord("story")).toBeUndefined();
    expect(Object.keys(PAGE_TO_SECTION).sort()).toEqual([...RECORD_PAGE_IDS].sort());
  });

  it("uses the card where the long scroll keeps it in another section", () => {
    expect(sectionForRecord("body", "body-watchouts")).toBe("medical");
    expect(sectionForRecord("body", "body-pulse")).toBe("reports");
    expect(sectionForRecord("body", "body-training-story")).toBe("life");
    expect(sectionForRecord("goals", "goals-focus")).toBe("focus");
    expect(sectionForRecord("account", "account-membership")).toBe("admin");
    expect(sectionForRecord("account", "account-contact")).toBe("general");
  });

  it("round-trips every dossier section: section → page → the same section", () => {
    for (const s of DOSSIER_SECTIONS) {
      const to = SECTION_TO_PAGE[s.id];
      expect(sectionForRecord(to.page, to.anchor), s.id).toBe(s.id);
    }
  });

  it("only ever answers a real dossier section (ClientInfoSheet maps each to itself)", () => {
    const ids = new Set<string>(DOSSIER_SECTIONS.map((s) => s.id));
    for (const page of RECORD_PAGE_IDS) {
      for (const anchor of [undefined, ...RECORD_ANCHORS]) {
        const s = sectionForRecord(page, anchor);
        if (s !== undefined) expect(ids.has(s), `${page} ${anchor}`).toBe(true);
      }
    }
  });

  it("sends the two profile doors where they went before", () => {
    // QuickNoteDialog's "this is about her life" and the Activity Archive's
    // "edit medical" — ClientProfileView's two openRecord calls.
    expect(sectionForRecord("ford")).toBe("life");
    expect(sectionForRecord("body", "body-watchouts")).toBe("medical");
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

  it("takes a handoff once and leaves the next visit on Journey", () => {
    writeStoredLocation("judy", { tab: "programming", view: "setup" });
    expect(takeStoredLocation("judy")).toEqual({ tab: "programming", view: "setup" });
    // Consumed: the deep link landed, and Judy opens on Journey from here on.
    expect(takeStoredLocation("judy")).toBeNull();
    expect(readStoredLocation("judy")).toBeNull();
  });

  it("round-trips a record page and card", () => {
    writeStoredLocation("judy", { tab: "record", page: "goals", anchor: "goals-reached" });
    expect(readStoredLocation("judy")).toStrictEqual({
      tab: "record",
      page: "goals",
      anchor: "goals-reached",
    });
  });

  it("normalises a handoff stored by a bundle from before the codex, and clears it", () => {
    window.sessionStorage.setItem(
      "msf_profile_nav:judy",
      JSON.stringify({ tab: "record", section: "medical" }),
    );
    expect(takeStoredLocation("judy")).toStrictEqual({
      tab: "record",
      page: "body",
      anchor: "body-watchouts",
    });
    expect(takeStoredLocation("judy")).toBeNull();
  });

  it("refuses a stored record location with a page or anchor it does not know", () => {
    window.sessionStorage.setItem(
      "msf_profile_nav:a",
      JSON.stringify({ tab: "record", page: "nonsense" }),
    );
    window.sessionStorage.setItem(
      "msf_profile_nav:b",
      JSON.stringify({ tab: "record", page: "ford", anchor: "</script>" }),
    );
    expect(readStoredLocation("a")).toBeNull();
    expect(readStoredLocation("b")).toBeNull();
  });

  it("takes nothing without a client, and survives storage throwing", () => {
    expect(takeStoredLocation(null)).toBeNull();
    delete (globalThis as { window?: unknown }).window;
    expect(() => takeStoredLocation("judy")).not.toThrow();
  });

  it("openProfileAt makes a freshly mounted profile land where it was pointed", () => {
    // The Hub's History button: store the location, then switch to the profile.
    // The profile mounts fresh and resumes what is stored (useProfileNav's lazy
    // initialiser), so this read is exactly what it will open on.
    writeStoredLocation("judy", { tab: "journey" });
    openProfileAt("judy", { tab: "clinical", view: "sessions" });
    expect(readStoredLocation("judy")).toEqual({ tab: "clinical", view: "sessions" });
    expect(() => openProfileAt(null, { tab: "journey" })).not.toThrow();
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
