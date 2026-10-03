import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../../types/journal";
import {
  COMPOSER_CATEGORIES,
  EMPTY_FILTER,
  FILING_CATEGORIES,
  NOTE_CATEGORIES,
  NOTES_PAGE_CATEGORIES,
  JOURNAL_BODY_LIMIT,
  buildCatalog,
  isNextTrainerNote,
  isNextTrainerNoteOfSessions,
  isUnfiled,
  journalBodyOf,
  machinesWithNotes,
  matchesSearch,
  monthKeyOf,
  noteCardLabel,
  noteCategoryOf,
  currentCategoryOf,
  flavourLabel,
  flavourOf,
  flavoursOf,
  isForLeaders,
  storedKindOf,
  storedNoteOf,
  splitUnfiled,
  threadMatchesSearch,
} from "./note-catalog";
import { assembleThreads } from "./threads";

let seq = 0;
function entry(over: Partial<JournalEntry>): JournalEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    clientId: "c1",
    studioId: "s1",
    kind: "coaching",
    category: null,
    body: `note ${seq}`,
    importance: "standard",
    machineId: null,
    focusId: null,
    sessionId: null,
    origin: "manual",
    authorId: "t1",
    authorInitials: "JC",
    authorName: "Jane Coach",
    occurredAt: new Date(2026, 8, 1, 12),
    createdAt: null,
    updatedAt: null,
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  };
}

describe("the categories (notes round, Oct 3 2026)", () => {
  it("are the owner's, in the owner's order", () => {
    expect(NOTE_CATEGORIES.map((c) => c.label)).toEqual([
      "Coaching & equipment",
      "Health",
      "Incident",
      "Retention",
      "FORD / Life",
      "Preference",
      "Admin",
    ]);
  });

  it("send Health, Incident and Retention to the studio's leaders, and nothing else", () => {
    expect(NOTE_CATEGORIES.filter((c) => c.forLeaders).map((c) => c.id)).toEqual(["health", "incident", "retention"]);
    expect(isForLeaders("health")).toBe(true);
    expect(isForLeaders("coaching")).toBe(false);
  });

  it("offer everything but Admin in the composer, and FORD writes no journal entry", () => {
    expect(COMPOSER_CATEGORIES.map((c) => c.id)).toEqual([
      "coaching",
      "health",
      "incident",
      "retention",
      "ford",
      "preference",
    ]);
    expect(COMPOSER_CATEGORIES.find((c) => c.id === "ford")!.kind).toBeNull();
    // "general" is gone from the composer.
    expect(COMPOSER_CATEGORIES.some((c) => c.kind === "general")).toBe(false);
  });

  it("filter the Notes page with every category but FORD, which is a door there, in the same order", () => {
    expect(NOTES_PAGE_CATEGORIES.map((c) => c.label)).toEqual([
      "Coaching & equipment",
      "Health",
      "Incident",
      "Retention",
      "Preference",
      "Admin",
    ]);
  });
});

describe("flavours — the optional second tap", () => {
  it("Coaching & equipment offers the 4 P's and Set-up; Health its five; the rest none", () => {
    expect(flavoursOf("coaching").map((f) => f.id)).toEqual(["Posture", "Path", "Pace", "Purpose", "Setup"]);
    expect(flavoursOf("health").map((f) => f.label)).toEqual([
      "Injury or pain",
      "Surgery",
      "Medication",
      "Diagnosis",
      "Care outside the studio",
    ]);
    expect(flavoursOf("incident")).toEqual([]);
    expect(flavoursOf(null)).toEqual([]);
  });

  it("stores each choice as the kind it always was, so nothing old changes meaning", () => {
    expect(storedKindOf("coaching")).toEqual({ kind: "coaching", category: null });
    expect(storedKindOf("coaching", "Pace")).toEqual({ kind: "coaching", category: "Pace" });
    expect(storedKindOf("coaching", "Setup")).toEqual({ kind: "equipment", category: null });
    expect(storedKindOf("health")).toEqual({ kind: "injury", category: null });
    expect(storedKindOf("health", "Medication")).toEqual({ kind: "injury", category: "Medication" });
    expect(storedKindOf("health", "OutsideCare")).toEqual({ kind: "injury", category: "OutsideCare" });
    expect(storedKindOf("incident")).toEqual({ kind: "incident", category: null });
    expect(storedKindOf("retention")).toEqual({ kind: "retention", category: null });
    expect(storedKindOf("preference")).toEqual({ kind: "preference", category: null });
    // A flavour from another category is dropped, never stored.
    expect(storedKindOf("health", "Pace")).toEqual({ kind: "injury", category: null });
    expect(storedKindOf("coaching", "Surgery")).toEqual({ kind: "coaching", category: null });
  });

  it("keeps body parts only for Health and Incident, in the map's order, and none is null", () => {
    const knee = { part: "knee" as const, side: "left" as const };
    const neck = { part: "neck" as const, side: null };
    expect(storedNoteOf("health", "Injury", [knee, neck])).toEqual({
      kind: "injury",
      category: "Injury",
      bodyParts: [neck, knee],
    });
    expect(storedNoteOf("incident", null, [knee]).bodyParts).toEqual([knee]);
    expect(storedNoteOf("coaching", null, [knee]).bodyParts).toBeNull();
    expect(storedNoteOf("health", null, []).bodyParts).toBeNull();
    expect(storedNoteOf(null, null, [knee])).toEqual({ kind: "general", category: null, bodyParts: null });
    expect(storedNoteOf("ford", null, null).kind).toBe("general");
  });

  it("reads a stored note's flavour back", () => {
    expect(flavourOf(entry({ kind: "equipment" }))).toBe("Setup");
    expect(flavourOf(entry({ kind: "coaching", category: "Path" }))).toBe("Path");
    expect(flavourOf(entry({ kind: "injury", category: "Diagnosis" }))).toBe("Diagnosis");
    expect(flavourOf(entry({ kind: "life", category: "Surgery" }))).toBe("Surgery");
    expect(flavourOf(entry({ kind: "injury" }))).toBeNull();
    expect(flavourLabel("OutsideCare")).toBe("Care outside the studio");
  });

  it("reads an old draft's category ids as today's", () => {
    expect(currentCategoryOf("equipment")).toEqual({ category: "coaching", flavour: "Setup" });
    expect(currentCategoryOf("injury")).toEqual({ category: "health", flavour: null });
    expect(currentCategoryOf("retention")).toEqual({ category: "retention", flavour: null });
    expect(currentCategoryOf("nonsense")).toEqual({ category: null, flavour: null });
    expect(currentCategoryOf(null)).toEqual({ category: null, flavour: null });
  });
});

describe("noteCategoryOf — every existing note maps in", () => {
  const cases: [string, Partial<JournalEntry>, string][] = [
    ["coaching", { kind: "coaching", category: "Pace" }, "coaching"],
    ["equipment", { kind: "equipment" }, "coaching"],
    ["retention", { kind: "retention" }, "retention"],
    ["health, with a flavour", { kind: "injury", category: "Medication" }, "health"],
    ["incident", { kind: "incident" }, "incident"],
    ["legacy clinical incident", { kind: "incident", isLegacy: true, origin: "legacy" }, "incident"],
    ["injury", { kind: "injury" }, "health"],
    ["preference", { kind: "preference" }, "preference"],
    ["old general note", { kind: "general" }, "preference"],
    ["legacy session note", { kind: "general", isLegacy: true, origin: "in_session" }, "preference"],
    ["legacy session summary", { kind: "general", isLegacy: true, origin: "post_session" }, "preference"],
    ["old personal note", { kind: "life", category: "Birthday" }, "ford"],
    ["old personal note, no category", { kind: "life", category: null }, "ford"],
    ["old surgery note", { kind: "life", category: "Surgery" }, "health"],
    ["old injury note", { kind: "life", category: "Injury" }, "health"],
    ["consultation", { kind: "consultation" }, "admin"],
    ["Mindbody account notes", { kind: "consultation", isLegacy: true, origin: "mindbody" }, "admin"],
    ["discovery notes", { kind: "consultation", isLegacy: true, origin: "consultation" }, "admin"],
    ["pinned priority note", { kind: "general", isLegacy: true, origin: "profile", importance: "critical" }, "admin"],
    ["profile notes", { kind: "general", isLegacy: true, origin: "profile" }, "admin"],
    ["medical history field", { kind: "injury", isLegacy: true, origin: "profile" }, "health"],
    ["unknown kind", { kind: "mystery" as any }, "preference"],
  ];
  it.each(cases)("%s", (_label, over, expected) => {
    expect(noteCategoryOf(entry(over))).toBe(expected);
  });

  it("labels a card by its category, keeping old Notes as Note", () => {
    expect(noteCardLabel(entry({ kind: "coaching", category: "Posture" }))).toBe("Posture");
    expect(noteCardLabel(entry({ kind: "coaching", category: null }))).toBe("Coaching");
    expect(noteCardLabel(entry({ kind: "equipment" }))).toBe("Equipment");
    expect(noteCardLabel(entry({ kind: "injury", category: "Surgery" }))).toBe("Health · Surgery");
    expect(noteCardLabel(entry({ kind: "injury", category: "OutsideCare" }))).toBe("Health · Care outside the studio");
    expect(noteCardLabel(entry({ kind: "life", category: "Surgery" }))).toBe("Health · Surgery");
    expect(noteCardLabel(entry({ kind: "retention" }))).toBe("Retention");
    expect(noteCardLabel(entry({ kind: "general" }))).toBe("Note");
    expect(noteCardLabel(entry({ kind: "general", isLegacy: true, origin: "profile" }))).toBe("Admin");
    expect(noteCardLabel(entry({ kind: "injury" }))).toBe("Health");
    expect(noteCardLabel(entry({ kind: "life", category: "Vacation" }))).toBe("FORD / Life");
  });

  it("names an open question from Relay for what it is, filed with the coaching tips, never Preference and never unfiled (Sep 28 2026)", () => {
    const open = entry({ kind: "question", importance: "elevated", authorName: "Ioreth Healer" });
    expect(noteCategoryOf(open)).toBe("coaching");
    expect(noteCardLabel(open)).toBe("Open question from Ioreth");
    expect(noteCardLabel({ ...open, resolvedAt: new Date() })).toBe("Question, answered");
    expect(noteCardLabel({ ...open, authorName: "" })).toBe("Open question");
    expect(isUnfiled(open)).toBe(false);
    expect(splitUnfiled([open]).unfiled).toEqual([]);
    expect(matchesSearch(open, "open question")).toBe(true);
    expect(matchesSearch(open, "coaching")).toBe(true);
  });
});

describe("buildCatalog", () => {
  const sep = (d: number) => new Date(2026, 8, d, 12);
  const aug = (d: number) => new Date(2026, 7, d, 12);
  const TODAY = "2026-09-20";
  const list = [
    entry({ id: "p1", kind: "coaching", category: "Pace", body: "Own the bottom", occurredAt: sep(10) }),
    entry({ id: "p2", kind: "coaching", category: "Path", occurredAt: sep(12) }),
    entry({ id: "p3", kind: "coaching", category: "Posture", occurredAt: aug(2) }),
    entry({ id: "p4", kind: "coaching", category: "Purpose", occurredAt: aug(20), authorId: "t2", authorName: "Sam Kim", authorInitials: "SK" }),
    entry({ id: "i1", kind: "injury", body: "Left knee — no deep flexion", occurredAt: aug(5) }),
    // Adapter-produced imports carry no real author.
    entry({ id: "a1", kind: "consultation", isLegacy: true, origin: "mindbody", occurredAt: null, body: "Prefers mornings", authorId: "unknown", authorInitials: "SYS", authorName: "Client profile" }),
  ];
  const threads = assembleThreads(list);
  const build = (over: Partial<typeof EMPTY_FILTER> = {}) =>
    buildCatalog(threads, { ...EMPTY_FILTER, ...over }, TODAY);

  it("counts all seven tiles, with the newest date (Oct 3 2026: the new seven)", () => {
    const cat = build();
    expect(cat.tiles.map((t) => [t.id, t.count])).toEqual([
      ["coaching", 4],
      ["health", 1],
      ["incident", 0],
      ["retention", 0],
      ["ford", 0],
      ["preference", 0],
      ["admin", 1],
    ]);
    expect(cat.tiles[0].newest?.getDate()).toBe(12);
    expect(cat.tiles[2].newest).toBeNull();
    expect(cat.total).toBe(6);
    expect(cat.matched).toBe(6);
  });

  it("sorts into the three zones, always in the same order", () => {
    const cat = build();
    expect(cat.zones.map((z) => z.id)).toEqual(["open", "standing", "resolved"]);
    // Every one of these is a plain "always" note, so they are all standing
    // context — known, not news.
    expect(cat.zones[1].total).toBe(6);
    expect(cat.zones[0].total).toBe(0);
    expect(cat.months).toEqual([]);
  });

  it("a note that shouts, or carries a live window, is open instead", () => {
    const loud = assembleThreads([
      entry({ id: "loud", importance: "critical", occurredAt: sep(1) }),
      entry({ id: "quiet", importance: "standard", occurredAt: sep(1) }),
      entry({ id: "dated", importance: "standard", occurredAt: sep(1), effectiveUntil: new Date(2026, 8, 25, 23) }),
    ]);
    const cat = buildCatalog(loud, EMPTY_FILTER, TODAY);
    expect(cat.zones[0].items.map((t) => t.id)).toEqual(["loud", "dated"]);
    expect(cat.zones[1].items.map((t) => t.id)).toEqual(["quiet"]);
  });

  it("holds every thread in every zone — the page folds Resolved, the catalog never cuts it", () => {
    const many = assembleThreads(
      [1, 2, 3, 4, 5].map((n) => entry({ id: `r${n}`, occurredAt: sep(n), resolvedAt: sep(n + 1) })),
    );
    const cat = buildCatalog(many, EMPTY_FILTER, TODAY);
    const resolved = cat.zones[2];
    expect(resolved.total).toBe(5);
    expect(resolved.items).toHaveLength(5);
    // Unfolding it changes nothing that is counted or listed.
    const shown = buildCatalog(many, { ...EMPTY_FILTER, showResolved: true }, TODAY);
    expect(shown.zones[2].items.map((t) => t.id)).toEqual(resolved.items.map((t) => t.id));
    expect(shown.tiles).toEqual(cat.tiles);
    // Resolved reads month by month, whether or not it is unfolded.
    expect(cat.months.map((m) => m.key)).toEqual(["2026-09"]);
    expect(cat.months[0].items.map((t) => t.id)).toEqual(["r5", "r4", "r3", "r2", "r1"]);
  });

  it("groups Resolved by month, newest first, with undated last", () => {
    const mixed = assembleThreads([
      entry({ id: "aug", occurredAt: aug(10), resolvedAt: aug(12) }),
      entry({ id: "none", occurredAt: null, resolvedAt: sep(2) }),
      entry({ id: "sep", occurredAt: sep(3), resolvedAt: sep(4) }),
      entry({ id: "open", occurredAt: sep(3) }),
    ]);
    const cat = buildCatalog(mixed, EMPTY_FILTER, TODAY);
    expect(cat.months.map((m) => m.key)).toEqual(["2026-09", "2026-08", "undated"]);
    expect(cat.months.map((m) => m.label)[2]).toBe("Undated");
    // A standing note is never in a month group: months are Resolved's only.
    expect(cat.months.flatMap((m) => m.items.map((t) => t.id))).not.toContain("open");
  });

  it("counts resolved threads on the category chips, so a chip says what it holds", () => {
    const withClosed = assembleThreads([
      ...list,
      entry({ id: "old-inj", kind: "injury", occurredAt: aug(1), resolvedAt: aug(9) }),
    ]);
    const cat = buildCatalog(withClosed, EMPTY_FILTER, TODAY);
    expect(cat.tiles.find((t) => t.id === "health")!.count).toBe(2);
    expect(cat.zones[2].items.map((t) => t.id)).toEqual(["old-inj"]);
  });

  it("isolates one category and keeps the zones", () => {
    const cat = build({ category: "coaching" });
    expect(cat.matched).toBe(4);
    expect(cat.zones[1].items.map((t) => t.id)).toEqual(["p2", "p1", "p4", "p3"]);
    // Tiles still count every category, so a coach can hop across.
    expect(cat.tiles.find((t) => t.id === "health")!.count).toBe(1);
  });

  it("keys a note with no date as undated", () => {
    expect(monthKeyOf(null)).toBe("undated");
    // A standing admin note with no date is in no month: months are Resolved's.
    expect(build({ category: "admin" }).months).toEqual([]);
  });

  it("searches across every category, including the category name", () => {
    const knee = build({ search: "KNEE" });
    expect(knee.matched).toBe(1);
    expect(knee.zones[1].items.map((t) => t.id)).toEqual(["i1"]);
    // An old Injury note is still found by the word a trainer knows, and by its new name.
    expect(build({ search: "injur" }).matched).toBe(1);
    expect(build({ search: "health" }).matched).toBe(1);
    expect(matchesSearch(list[0], "pace")).toBe(true);
    expect(matchesSearch(list[5], "mornings")).toBe(true);
  });

  it("finds a thread by what one of its UPDATES says, not only the note", () => {
    const shoulder = assembleThreads([
      entry({ id: "s1", kind: "injury", body: "No overhead", occurredAt: sep(1) }),
      entry({ id: "s2", threadId: "s1", body: "MRI on the 31st", occurredAt: sep(8) }),
    ]);
    expect(threadMatchesSearch(shoulder[0], "MRI")).toBe(true);
    expect(buildCatalog(shoulder, { ...EMPTY_FILTER, search: "MRI" }, TODAY).matched).toBe(1);
  });

  it("finds a coach's notes by name — anyone with a hand in the thread, not only whoever opened it", () => {
    // The coach chip row is gone (the Notes page); search reads every entry's author.
    const sam = build({ search: "Sam" });
    expect(sam.matched).toBe(1);
    expect(sam.tiles[0].count).toBe(1);
    expect(build({ search: "SK" }).matched).toBe(1);

    const helped = assembleThreads([
      entry({ id: "h1", authorId: "t1", occurredAt: sep(1) }),
      entry({ id: "h2", threadId: "h1", authorId: "t2", authorName: "Sam Kim", authorInitials: "SK", occurredAt: sep(5) }),
    ]);
    expect(buildCatalog(helped, { ...EMPTY_FILTER, search: "sam" }, TODAY).matched).toBe(1);
  });

  it("does not reorder or mutate what it was given", () => {
    const before = threads.map((t) => t.id);
    build();
    expect(threads.map((t) => t.id)).toEqual(before);
  });
});

describe("one machine's notes (FileMaker parity, Oct 1 2026)", () => {
  const TODAY = "2026-09-20";
  const legRoot = entry({ kind: "equipment", machineId: "m-leg", body: "Seat 7." });
  const chestRoot = entry({ kind: "coaching", body: "Count her in." });
  // An update about the leg press puts its thread on the leg press too.
  const chestUpd = entry({ threadId: chestRoot.id, machineId: "m-leg", body: "On the leg press today she was fine." });
  const plain = entry({ kind: "preference", body: "Fan on." });
  const threads = assembleThreads([legRoot, chestRoot, chestUpd, plain]);

  it("keeps the threads with any note about the machine, and counts the chips under it", () => {
    const c = buildCatalog(threads, { ...EMPTY_FILTER, machineId: "m-leg" }, TODAY);
    expect(c.matched).toBe(2);
    expect(c.tiles.find((t) => t.id === "preference")?.count).toBe(0);
    expect(buildCatalog(threads, EMPTY_FILTER, TODAY).matched).toBe(3);
  });

  it("offers the machines she has notes about, named by the floor, each once", () => {
    expect(machinesWithNotes(threads, [{ id: "m-leg", name: "Leg Press" }])).toEqual([{ id: "m-leg", name: "Leg Press" }]);
    expect(machinesWithNotes(threads, [])).toEqual([{ id: "m-leg", name: "A machine no longer on the floor" }]);
  });
});

describe("withoutRecordFields", () => {
  it("leaves out profile fields the record edits in its own sections, and keeps the rest", async () => {
    const { withoutRecordFields } = await import("./note-catalog");
    const ids = [
      "legacy:profile:medicalHistory",
      "legacy:profile:clinicalNotes",
      "legacy:profile:globalNotes",
      "legacy:profile:discoveryNotes",
      "legacy:profile:mindbodyNotes",
      "legacy:profile:priorityNote",
      "legacy:profile:notes",
      "native-1",
    ].map((id) => ({ id }));
    expect(withoutRecordFields(ids).map((e) => e.id)).toEqual([
      "legacy:profile:priorityNote",
      "legacy:profile:notes",
      "native-1",
    ]);
  });
});

describe("capture now, tag at teardown", () => {
  it("offers exactly the five filing categories, in the composer's order", () => {
    expect(FILING_CATEGORIES.map((c) => c.id)).toEqual(["coaching", "health", "incident", "retention", "preference"]);
    expect(FILING_CATEGORIES.every((c) => c.kind !== null)).toBe(true);
  });

  it("isUnfiled is a general note this app wrote — never an import or an old Note", () => {
    expect(isUnfiled(entry({ kind: "general", origin: "in_session" }))).toBe(true);
    expect(isUnfiled(entry({ kind: "general", origin: "manual" }))).toBe(true);
    expect(isUnfiled(entry({ kind: "general", origin: "manual", isLegacy: true }))).toBe(false);
    expect(isUnfiled(entry({ kind: "general", origin: "profile", isLegacy: true }))).toBe(false);
    expect(isUnfiled(entry({ kind: "coaching", origin: "in_session" }))).toBe(false);
    expect(isUnfiled(entry({ kind: "preference" }))).toBe(false);
  });

  it("splitUnfiled keeps order and loses nothing", () => {
    const a = entry({ kind: "general", origin: "in_session" });
    const b = entry({ kind: "coaching" });
    const c = entry({ kind: "general", origin: "manual" });
    const d = entry({ kind: "general", isLegacy: true, origin: "legacy" });
    const { unfiled, filed } = splitUnfiled([a, b, c, d]);
    expect(unfiled.map((e) => e.id)).toEqual([a.id, c.id]);
    expect(filed.map((e) => e.id)).toEqual([b.id, d.id]);
  });

  it("an unfiled note still has a shelf if it is ever listed, and its card says Note", () => {
    const raw = entry({ kind: "general", origin: "in_session" });
    expect(noteCategoryOf(raw)).toBe("preference");
    expect(noteCardLabel(raw)).toBe("Note");
  });
});

/*
 * The Note for the next trainer (voice-review follow-up, Sep 27 2026). The
 * Wrap-up's To-file tray keeps it (it can be filed to the profile) but labels
 * it and offers no Discard, so it has to know which card it is.
 */
describe("isNextTrainerNote", () => {
  const words = "Right knee sore after the move. Go light on leg press.";
  const written = () =>
    entry({
      id: "j-next",
      kind: "general",
      body: words,
      importance: "elevated",
      sessionId: "sess1",
      origin: "post_session",
    });
  const mark = { sessionId: "sess1", id: null, body: words };

  it("finds it by its id once the journal write has answered", () => {
    expect(isNextTrainerNote(written(), { ...mark, id: "j-next", body: "" })).toBe(true);
    expect(isNextTrainerNote(entry({ id: "someone-else", kind: "general" }), { ...mark, id: "j-next" })).toBe(false);
  });

  it("finds it before then by what Finish wrote: this session, post-session, a Heads up, the same words", () => {
    expect(isNextTrainerNote(written(), mark)).toBe(true);
    // The body the journal holds is trimmed.
    expect(isNextTrainerNote({ ...written(), body: `  ${words}\n` }, mark)).toBe(true);
  });

  it("does not take another note from the same session for it", () => {
    // A note saved mid-session, same words or not.
    expect(isNextTrainerNote({ ...written(), origin: "in_session" }, mark)).toBe(false);
    // Another session's.
    expect(isNextTrainerNote({ ...written(), sessionId: "sess2" }, mark)).toBe(false);
    // A Profile note at Note loudness.
    expect(isNextTrainerNote({ ...written(), importance: "standard" }, mark)).toBe(false);
    // Different words.
    expect(isNextTrainerNote({ ...written(), body: "Something else" }, mark)).toBe(false);
  });

  it("finds nothing without a mark, or with an empty one", () => {
    expect(isNextTrainerNote(written(), null)).toBe(false);
    expect(isNextTrainerNote(written(), undefined)).toBe(false);
    expect(isNextTrainerNote(written(), { sessionId: "sess1", id: null, body: "" })).toBe(false);
    expect(isNextTrainerNote(written(), { sessionId: null, id: null, body: words })).toBe(false);
  });

  it("journalBodyOf is the body the journal keeps: trimmed and cut at 5000", () => {
    expect(JOURNAL_BODY_LIMIT).toBe(5000);
    expect(journalBodyOf("  hello \n")).toBe("hello");
    expect(journalBodyOf(null)).toBe("");
    // Cut at 5000, then trimmed: the space the cut lands after goes too.
    expect(journalBodyOf(`${"a".repeat(4999)} ${"b".repeat(100)}`)).toBe("a".repeat(4999));
    expect(journalBodyOf("x".repeat(6000))).toHaveLength(5000);
  });
});

/*
 * The same question for a tray with no mark of its own (the client's Notes
 * page): the session's own copy of the note is the mark.
 */
describe("isNextTrainerNoteOfSessions", () => {
  const words = "Right knee sore after the move. Go light on leg press.";
  const written = () =>
    entry({
      id: "j-next",
      kind: "general",
      body: words,
      importance: "elevated",
      sessionId: "sess1",
      origin: "post_session",
    });
  const sessions = [
    { id: "sess0", notes: "Something from last week." },
    // The session keeps the whole text, untrimmed.
    { id: "sess1", notes: `  ${words}\n` },
  ];

  it("finds it by its session's own copy of the words", () => {
    expect(isNextTrainerNoteOfSessions(written(), sessions)).toBe(true);
  });

  it("compares a long note as the journal keeps it: cut at 5000", () => {
    const long = `${"a".repeat(4999)} ${"b".repeat(100)}`;
    const note = { ...written(), body: journalBodyOf(long) };
    expect(isNextTrainerNoteOfSessions(note, [{ id: "sess1", notes: long }])).toBe(true);
  });

  it("does not take another note of the same session for it", () => {
    expect(isNextTrainerNoteOfSessions({ ...written(), origin: "in_session" }, sessions)).toBe(false);
    expect(isNextTrainerNoteOfSessions({ ...written(), importance: "standard" }, sessions)).toBe(false);
    expect(isNextTrainerNoteOfSessions({ ...written(), body: "Something else" }, sessions)).toBe(false);
  });

  it("finds nothing when the session is not in the list, has no note, or was edited since", () => {
    expect(isNextTrainerNoteOfSessions(written(), [])).toBe(false);
    expect(isNextTrainerNoteOfSessions(written(), [{ id: "sess1" }])).toBe(false);
    expect(isNextTrainerNoteOfSessions(written(), [{ id: "sess1", notes: `${words} Edited in History.` }])).toBe(false);
    expect(isNextTrainerNoteOfSessions({ ...written(), sessionId: null }, sessions)).toBe(false);
  });
});
