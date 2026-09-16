import { describe, expect, it } from "vitest";
import type { JournalEntry } from "../../types/journal";
import {
  COMPOSER_CATEGORIES,
  EMPTY_FILTER,
  NOTE_CATEGORIES,
  buildCatalog,
  catalogCoaches,
  matchesSearch,
  monthKeyOf,
  noteCardLabel,
  noteCategoryOf,
} from "./note-catalog";

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
  const list = [
    entry({ id: "p1", kind: "coaching", category: "Pace", body: "Own the bottom", occurredAt: sep(10) }),
    entry({ id: "p2", kind: "coaching", category: "Path", occurredAt: sep(12) }),
    entry({ id: "p3", kind: "coaching", category: "Posture", occurredAt: aug(2) }),
    entry({ id: "p4", kind: "coaching", category: "Purpose", occurredAt: aug(20), authorId: "t2", authorName: "Sam Kim", authorInitials: "SK" }),
    entry({ id: "i1", kind: "injury", body: "Left knee — no deep flexion", occurredAt: aug(5) }),
    // Adapter-produced imports carry no real author.
    entry({ id: "a1", kind: "consultation", isLegacy: true, origin: "mindbody", occurredAt: null, body: "Prefers mornings", authorId: "unknown", authorInitials: "SYS", authorName: "Client profile" }),
  ];

  it("counts all seven tiles, with the newest date", () => {
    const cat = buildCatalog(list, EMPTY_FILTER);
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

  it("shelves the newest three of each non-empty category, in order", () => {
    const cat = buildCatalog(list, EMPTY_FILTER);
    expect(cat.shelves.map((s) => s.id)).toEqual(["coaching", "injury", "admin"]);
    expect(cat.shelves[0].total).toBe(4);
    expect(cat.shelves[0].items.map((e) => e.id)).toEqual(["p2", "p1", "p4"]);
    expect(cat.months).toEqual([]);
  });

  it("isolates one category, month by month", () => {
    const cat = buildCatalog(list, { ...EMPTY_FILTER, category: "coaching" });
    expect(cat.shelves).toEqual([]);
    expect(cat.months.map((m) => [m.key, m.items.map((e) => e.id)])).toEqual([
      ["2026-09", ["p2", "p1"]],
      ["2026-08", ["p4", "p3"]],
    ]);
    expect(cat.months[0].label).toContain("2026");
    expect(cat.matched).toBe(4);
    // Tiles still count every category, so a coach can hop across.
    expect(cat.tiles.find((t) => t.id === "injury")!.count).toBe(1);
  });

  it("puts undated notes last", () => {
    const cat = buildCatalog(list, { ...EMPTY_FILTER, category: "admin" });
    expect(cat.months).toEqual([{ key: "undated", label: "Undated", items: [list[5]] }]);
    expect(monthKeyOf(null)).toBe("undated");
  });

  it("searches across every category, including the category name", () => {
    const knee = buildCatalog(list, { ...EMPTY_FILTER, search: "KNEE" });
    expect(knee.matched).toBe(1);
    expect(knee.shelves.map((s) => s.id)).toEqual(["injury"]);
    const byName = buildCatalog(list, { ...EMPTY_FILTER, search: "injur" });
    expect(byName.matched).toBe(1);
    expect(matchesSearch(list[0], "pace")).toBe(true);
    expect(matchesSearch(list[5], "mornings")).toBe(true);
  });

  it("filters by coach", () => {
    const sam = buildCatalog(list, { ...EMPTY_FILTER, coachId: "t2" });
    expect(sam.matched).toBe(1);
    expect(sam.tiles[0].count).toBe(1);
    expect(catalogCoaches(list).map((c) => [c.id, c.count])).toEqual([
      ["t1", 4],
      ["t2", 1],
    ]);
  });

  it("does not reorder or mutate what it was given", () => {
    const before = list.map((e) => e.id);
    buildCatalog(list, EMPTY_FILTER);
    expect(list.map((e) => e.id)).toEqual(before);
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
