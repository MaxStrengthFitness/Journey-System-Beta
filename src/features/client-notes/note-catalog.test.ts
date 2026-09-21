import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../../types/journal";
import {
  COMPOSER_CATEGORIES,
  EMPTY_FILTER,
  FILING_CATEGORIES,
  NOTE_CATEGORIES,
  buildCatalog,
  catalogCoaches,
  isUnfiled,
  matchesSearch,
  monthKeyOf,
  noteCardLabel,
  noteCategoryOf,
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

describe("the seven categories", () => {
  it("are the owner's seven, in the owner's order", () => {
    expect(NOTE_CATEGORIES.map((c) => c.label)).toEqual([
      "Coaching tip",
      "Equipment",
      "Incident",
      "Injury",
      "Preference",
      "FORD / Life",
      "Admin",
    ]);
  });

  it("offer everything but Admin in the composer, and FORD writes no journal entry", () => {
    expect(COMPOSER_CATEGORIES.map((c) => c.id)).toEqual([
      "coaching",
      "equipment",
      "incident",
      "injury",
      "preference",
      "ford",
    ]);
    expect(COMPOSER_CATEGORIES.find((c) => c.id === "ford")!.kind).toBeNull();
    // "general" is gone from the composer.
    expect(COMPOSER_CATEGORIES.some((c) => c.kind === "general")).toBe(false);
  });
});

describe("noteCategoryOf — every existing note maps in", () => {
  const cases: [string, Partial<JournalEntry>, string][] = [
    ["coaching", { kind: "coaching", category: "Pace" }, "coaching"],
    ["equipment", { kind: "equipment" }, "equipment"],
    ["incident", { kind: "incident" }, "incident"],
    ["legacy clinical incident", { kind: "incident", isLegacy: true, origin: "legacy" }, "incident"],
    ["injury", { kind: "injury" }, "injury"],
    ["preference", { kind: "preference" }, "preference"],
    ["old general note", { kind: "general" }, "preference"],
    ["legacy session note", { kind: "general", isLegacy: true, origin: "in_session" }, "preference"],
    ["legacy session summary", { kind: "general", isLegacy: true, origin: "post_session" }, "preference"],
    ["old personal note", { kind: "life", category: "Birthday" }, "ford"],
    ["old personal note, no category", { kind: "life", category: null }, "ford"],
    ["old surgery note", { kind: "life", category: "Surgery" }, "injury"],
    ["old injury note", { kind: "life", category: "Injury" }, "injury"],
    ["consultation", { kind: "consultation" }, "admin"],
    ["Mindbody account notes", { kind: "consultation", isLegacy: true, origin: "mindbody" }, "admin"],
    ["discovery notes", { kind: "consultation", isLegacy: true, origin: "consultation" }, "admin"],
    ["pinned priority note", { kind: "general", isLegacy: true, origin: "profile", importance: "critical" }, "admin"],
    ["profile notes", { kind: "general", isLegacy: true, origin: "profile" }, "admin"],
    ["medical history field", { kind: "injury", isLegacy: true, origin: "profile" }, "injury"],
    ["unknown kind", { kind: "mystery" as any }, "preference"],
  ];
  it.each(cases)("%s", (_label, over, expected) => {
    expect(noteCategoryOf(entry(over))).toBe(expected);
  });

  it("labels a card by its category, keeping old Notes as Note", () => {
    expect(noteCardLabel(entry({ kind: "coaching", category: "Posture" }))).toBe("Posture");
    expect(noteCardLabel(entry({ kind: "coaching", category: null }))).toBe("Coaching tip");
    expect(noteCardLabel(entry({ kind: "general" }))).toBe("Note");
    expect(noteCardLabel(entry({ kind: "general", isLegacy: true, origin: "profile" }))).toBe("Admin");
    expect(noteCardLabel(entry({ kind: "injury" }))).toBe("Injury");
    expect(noteCardLabel(entry({ kind: "life", category: "Vacation" }))).toBe("FORD / Life");
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

  it("counts all seven tiles, with the newest date", () => {
    const cat = build();
    expect(cat.tiles.map((t) => [t.id, t.count])).toEqual([
      ["coaching", 4],
      ["equipment", 0],
      ["incident", 0],
      ["injury", 1],
      ["preference", 0],
      ["ford", 0],
      ["admin", 1],
    ]);
    expect(cat.tiles[0].newest?.getDate()).toBe(12);
    expect(cat.tiles[1].newest).toBeNull();
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

  it("keeps Open and Standing whole and shows three of Resolved, with a way to the rest", () => {
    const many = assembleThreads(
      [1, 2, 3, 4, 5].map((n) => entry({ id: `r${n}`, occurredAt: sep(n), resolvedAt: sep(n + 1) })),
    );
    const cat = buildCatalog(many, EMPTY_FILTER, TODAY);
    const resolved = cat.zones[2];
    expect(resolved.total).toBe(5);
    expect(resolved.items).toHaveLength(3);
    expect(resolved.collapsed).toBe(true);

    const all = buildCatalog(many, { ...EMPTY_FILTER, zone: "resolved" }, TODAY);
    expect(all.zones[2].items).toHaveLength(5);
    expect(all.zones[2].collapsed).toBe(false);
    // Expanded, it reads month by month.
    expect(all.months.map((m) => m.key)).toEqual(["2026-09"]);
  });

  it("isolates one category and keeps the zones", () => {
    const cat = build({ category: "coaching" });
    expect(cat.matched).toBe(4);
    expect(cat.zones[1].items.map((t) => t.id)).toEqual(["p2", "p1", "p4", "p3"]);
    // Tiles still count every category, so a coach can hop across.
    expect(cat.tiles.find((t) => t.id === "injury")!.count).toBe(1);
  });

  it("puts undated notes last when a zone is opened out", () => {
    const cat = build({ category: "admin", zone: "standing" });
    expect(cat.months.map((m) => m.key)).toEqual(["undated"]);
    expect(monthKeyOf(null)).toBe("undated");
  });

  it("searches across every category, including the category name", () => {
    const knee = build({ search: "KNEE" });
    expect(knee.matched).toBe(1);
    expect(knee.zones[1].items.map((t) => t.id)).toEqual(["i1"]);
    expect(build({ search: "injur" }).matched).toBe(1);
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

  it("filters by coach — anyone with a hand in the thread, not only whoever opened it", () => {
    const sam = build({ coachId: "t2" });
    expect(sam.matched).toBe(1);
    expect(sam.tiles[0].count).toBe(1);
    expect(catalogCoaches(list).map((c) => [c.id, c.count])).toEqual([
      ["t1", 4],
      ["t2", 1],
    ]);

    const helped = assembleThreads([
      entry({ id: "h1", authorId: "t1", occurredAt: sep(1) }),
      entry({ id: "h2", threadId: "h1", authorId: "t2", occurredAt: sep(5) }),
    ]);
    expect(buildCatalog(helped, { ...EMPTY_FILTER, coachId: "t2" }, TODAY).matched).toBe(1);
  });

  it("does not reorder or mutate what it was given", () => {
    const before = threads.map((t) => t.id);
    build();
    expect(threads.map((t) => t.id)).toEqual(before);
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
    expect(FILING_CATEGORIES.map((c) => c.id)).toEqual(["coaching", "equipment", "incident", "injury", "preference"]);
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
