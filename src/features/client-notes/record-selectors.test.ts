import { describe, expect, it } from "vitest";
import type { Client } from "../../types";
import type { JournalEntry } from "../../types/journal";
import type { FordEntry } from "../ford/types";
import { assembleThreads, type NoteThread } from "./threads";
import {
  CRITICAL_LINE_MIN_CHARS,
  LIFE_CATEGORY_PILLAR,
  briefingStatusOf,
  closeWordsOf,
  criticalLineOf,
  fordDoorCount,
  hiddenCriticalThreads,
  howToCoachThreads,
  injuryThreads,
  notesOnRecord,
  notesSummary,
  notesSummarySentence,
  notesTabMeta,
  olderLifeNotesByPillar,
  shortDay,
  threadCardMeta,
  threadRowMeta,
  threadsByMachine,
  whoOf,
  type BriefingContext,
  type NotesSummary,
} from "./record-selectors";

const TZ = "America/New_York";
const TODAY = "2026-09-24";
const noon = (day: string) => new Date(`${day}T12:00:00-04:00`);
const eod = (day: string) => new Date(`${day}T23:59:59-04:00`);

const entry = (over: Partial<JournalEntry> & { id: string }): JournalEntry =>
  ({
    clientId: "c1",
    studioId: "westlake",
    kind: "injury",
    category: null,
    body: "note",
    importance: "standard",
    machineId: null,
    focusId: null,
    threadId: null,
    sessionId: null,
    origin: "manual",
    authorId: "t1",
    authorInitials: "AJ",
    authorName: "AJ Jurgens",
    occurredAt: noon("2026-09-01"),
    createdAt: noon("2026-09-01"),
    updatedAt: noon("2026-09-01"),
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as JournalEntry;

/** One thread per root id, with any updates hung off it. */
const threadsOf = (...entries: JournalEntry[]): NoteThread[] => assembleThreads(entries);
const thread = (...entries: JournalEntry[]): NoteThread => assembleThreads(entries)[0];
const ids = (list: readonly NoteThread[]) => list.map((t) => t.id);

/* ------------------------------------------------------------------ */

describe("notesOnRecord", () => {
  const fields = [
    "legacy:profile:medicalHistory",
    "legacy:profile:clinicalNotes",
    "legacy:profile:globalNotes",
    "legacy:profile:discoveryNotes",
    "legacy:profile:mindbodyNotes",
  ].map((id) => entry({ id, isLegacy: true, origin: "profile", kind: "general", authorId: "unknown" }));

  it("keeps the five profile fields the record edits elsewhere off Notes", () => {
    const out = notesOnRecord(threadsOf(...fields, entry({ id: "a" })), TODAY, { tz: TZ });
    expect(ids(out.listed)).toEqual(["a"]);
    expect(out.unfiled).toEqual([]);
  });

  it("puts an unfiled note in the tray, not in a zone; an archived one nowhere", () => {
    const out = notesOnRecord(
      threadsOf(entry({ id: "u", kind: "general" }), entry({ id: "ua", kind: "general", isArchived: true }), entry({ id: "a" })),
      TODAY,
      { tz: TZ },
    );
    expect(out.unfiled.map((e) => e.id)).toEqual(["u"]);
    expect(ids(out.listed)).toEqual(["a"]);
  });

  it("an archived thread has left every list", () => {
    const out = notesOnRecord(threadsOf(entry({ id: "x", isArchived: true })), TODAY, { tz: TZ });
    expect(out).toEqual({ listed: [], unfiled: [], lifeSettled: [] });
  });

  it("a standing life note is settled — and stays on Notes until FORD carries it", () => {
    const anniversary = entry({ id: "life", kind: "life", category: "Anniversary", body: "Anniversary Oct 12" });
    const kept = notesOnRecord(threadsOf(anniversary), TODAY, { tz: TZ });
    expect(ids(kept.lifeSettled)).toEqual(["life"]);
    expect(ids(kept.listed)).toEqual(["life"]);

    const handedOver = notesOnRecord(threadsOf(anniversary), TODAY, { tz: TZ, lifeOnFord: true });
    expect(ids(handedOver.lifeSettled)).toEqual(["life"]);
    expect(ids(handedOver.listed)).toEqual([]);
  });

  it("a resolved life note is settled too; a live (critical) one stays on Notes only", () => {
    const out = notesOnRecord(
      threadsOf(
        entry({ id: "done", kind: "life", category: "Vacation", resolvedAt: noon("2026-09-10") }),
        entry({ id: "loud", kind: "life", category: "Vacation", importance: "critical", isLegacy: true, origin: "profile" }),
      ),
      TODAY,
      { tz: TZ, lifeOnFord: true },
    );
    expect(ids(out.lifeSettled)).toEqual(["done"]);
    expect(ids(out.listed)).toEqual(["loud"]);
  });

  it("a surgery written as a life note is an injury, never settled on FORD", () => {
    const out = notesOnRecord(threadsOf(entry({ id: "s", kind: "life", category: "Surgery" })), TODAY, { tz: TZ, lifeOnFord: true });
    expect(ids(out.listed)).toEqual(["s"]);
    expect(out.lifeSettled).toEqual([]);
  });

  // An update inherits its root's kind (thread-write.ts). When the root is not
  // in the load (archived, or past the read limit), the update stands as a
  // thread of its own — and FORD does not place it, so Notes must keep it.
  it("an orphaned life update and a client.events copy stay on Notes, never settled", () => {
    const out = notesOnRecord(
      threadsOf(
        entry({ id: "u1", kind: "life", category: "Other", threadId: "archived-root" }),
        entry({ id: "legacy:clientEvents:e1", kind: "life", isLegacy: true, origin: "profile", authorId: "unknown" }),
      ),
      TODAY,
      { tz: TZ, lifeOnFord: true },
    );
    expect(ids(out.listed).sort()).toEqual(["legacy:clientEvents:e1", "u1"]);
    expect(out.lifeSettled).toEqual([]);
  });

  it("every settled life note has a place on FORD — the two selections are the same set", () => {
    const threads = threadsOf(
      entry({ id: "anniv", kind: "life", category: "Anniversary" }),
      entry({ id: "trip", kind: "life", category: "Vacation", resolvedAt: noon("2026-09-10") }),
      entry({ id: "grad", kind: "life", category: "Milestone" }),
      entry({ id: "plain", kind: "life", category: null }),
      entry({ id: "loud", kind: "life", category: "Birthday", importance: "critical" }),
      entry({ id: "u1", kind: "life", category: "Other", threadId: "archived-root" }),
      entry({ id: "legacy:clientEvents:e1", kind: "life", isLegacy: true, origin: "profile", authorId: "unknown" }),
      entry({ id: "surgery", kind: "life", category: "Surgery" }),
      entry({ id: "knee" }),
    );
    const out = notesOnRecord(threads, TODAY, { tz: TZ, lifeOnFord: true });
    const placed = Object.values(olderLifeNotesByPillar(out.lifeSettled)).flat();
    expect(ids(placed).sort()).toEqual(ids(out.lifeSettled).sort());
    expect(ids(out.lifeSettled).sort()).toEqual(["anniv", "grad", "plain", "trip"]);
    // Nothing leaves the tab: every thread is on Notes or placed on FORD.
    expect([...ids(out.listed), ...ids(placed)].sort()).toEqual(ids(threads).sort());
  });
});

/* ------------------------------------------------------------------ */

describe("counts", () => {
  const listed = threadsOf(
    entry({ id: "o1", importance: "critical" }),
    entry({ id: "o2", importance: "elevated" }),
    entry({ id: "s1" }),
    entry({ id: "s2", kind: "preference" }),
    entry({ id: "r1", resolvedAt: noon("2026-09-10") }),
  );
  const critical = [entry({ id: "o1", importance: "critical" })];

  it("notesSummary counts each zone and the tray, and critical is the briefing's own count", () => {
    expect(notesSummary({ listed, unfiled: [] }, critical, TODAY, TZ)).toEqual({ open: 2, standing: 2, resolved: 1, total: 5, critical: 1, unfiled: 0 });
    expect(notesSummary({ listed: [], unfiled: [] }, [], TODAY, TZ)).toEqual({ open: 0, standing: 0, resolved: 0, total: 0, critical: 0, unfiled: 0 });
    // Straight from notesOnRecord: a note waiting for a category is counted, not dropped.
    const record = notesOnRecord(threadsOf(entry({ id: "u", kind: "general" }), entry({ id: "a" })), TODAY, { tz: TZ });
    expect(notesSummary(record, [], TODAY, TZ)).toEqual({ open: 0, standing: 1, resolved: 0, total: 1, critical: 0, unfiled: 1 });
  });

  const sum = (over: Partial<NotesSummary>): NotesSummary => ({ open: 0, standing: 0, resolved: 0, total: 0, critical: 0, unfiled: 0, ...over });

  it("notesTabMeta: loading says nothing, a failed read says so, never 'none yet'", () => {
    expect(notesTabMeta(null, { isLoading: true, readFailed: false })).toEqual({ meta: null, flag: false });
    expect(notesTabMeta(sum({ total: 3, standing: 3 }), { isLoading: true, readFailed: false })).toEqual({ meta: null, flag: false });
    expect(notesTabMeta(sum({}), { isLoading: false, readFailed: true })).toEqual({ meta: "couldn't load", flag: false });
    expect(notesTabMeta(sum({ open: 1, total: 1, critical: 1 }), { isLoading: false, readFailed: true })).toEqual({ meta: "couldn't load", flag: true });
  });

  it("notesTabMeta: open first, critical beside it, then standing, then none yet", () => {
    const ready = { isLoading: false, readFailed: false };
    expect(notesTabMeta(sum({ open: 3, standing: 8, resolved: 5, total: 16, critical: 1 }), ready)).toEqual({ meta: "3 open · 1 critical", flag: true });
    expect(notesTabMeta(sum({ open: 2, total: 2 }), ready)).toEqual({ meta: "2 open", flag: false });
    expect(notesTabMeta(sum({ standing: 8, total: 8 }), ready)).toEqual({ meta: "8 standing", flag: false });
    expect(notesTabMeta(sum({ resolved: 2, total: 2 }), ready)).toEqual({ meta: "2 resolved", flag: false });
    // An unfiled critical note sits in the tray, not in Open — it still flags.
    expect(notesTabMeta(sum({ critical: 1, unfiled: 1 }), ready)).toEqual({ meta: "1 critical", flag: true });
    expect(notesTabMeta(sum({}), ready)).toEqual({ meta: "none yet", flag: false });
  });

  it("notesTabMeta: notes waiting in the tray are not 'none yet'", () => {
    const ready = { isLoading: false, readFailed: false };
    expect(notesTabMeta(sum({ unfiled: 2 }), ready)).toEqual({ meta: "2 to file", flag: false });
    // Listed notes still lead; the tray is the Notes page's to show.
    expect(notesTabMeta(sum({ standing: 3, total: 3, unfiled: 2 }), ready)).toEqual({ meta: "3 standing", flag: false });
  });

  it("notesSummarySentence drops the zero parts", () => {
    expect(notesSummarySentence(sum({ open: 3, standing: 8, resolved: 5, total: 16, critical: 1 }))).toBe("3 open, 1 critical · 8 standing · 5 resolved");
    expect(notesSummarySentence(sum({ standing: 2, total: 2 }))).toBe("2 standing");
    expect(notesSummarySentence(sum({ open: 1, resolved: 1, total: 2 }))).toBe("1 open · 1 resolved");
    expect(notesSummarySentence(sum({}))).toBe("No notes in Journey yet");
    // The tray is notes too: never "No notes in Journey yet" while one waits.
    expect(notesSummarySentence(sum({ unfiled: 1 }))).toBe("1 to file");
    expect(notesSummarySentence(sum({ standing: 2, total: 2, unfiled: 1 }))).toBe("2 standing · 1 to file");
  });
});

/* ------------------------------------------------------------------ */

describe("one thread, in words", () => {
  it("whoOf: a first name, initials for an unknown coach, the source for an import", () => {
    expect(whoOf(entry({ id: "a", authorName: "Jess Moreno" }))).toBe("Jess");
    expect(whoOf(entry({ id: "a", authorName: "Unknown coach", authorInitials: "JD", isLegacy: true, origin: "legacy" }))).toBe("JD");
    expect(whoOf(entry({ id: "a", authorId: "unknown", isLegacy: true, legacySource: "Mindbody account notes" }))).toBe("Mindbody account notes");
    expect(whoOf(entry({ id: "a", authorId: "", isLegacy: true, legacySource: "" }))).toBe("Imported");
    expect(whoOf(entry({ id: "a", authorName: "", authorInitials: "—" }))).toBe("Unknown");
    // A legacy note whose trainer was found reads as that trainer.
    expect(whoOf(entry({ id: "a", isLegacy: true, authorId: "t9", authorName: "Marcus Lee", legacySource: "Session note" }))).toBe("Marcus");
  });

  it("shortDay: this year without the year, another year with it, and no UTC drift", () => {
    expect(shortDay("2026-03-09", TODAY)).toBe("Mar 9");
    expect(shortDay("2025-09-20", TODAY)).toBe("Sep 20, 2025");
    expect(shortDay("2026-03-01", TODAY)).toBe("Mar 1");
    expect(shortDay("2026-02-30", TODAY)).toBe("");
    expect(shortDay("Sep 20", TODAY)).toBe("");
    expect(shortDay(null, TODAY)).toBe("");
  });

  it("threadRowMeta: who and when, then the zone's own words", () => {
    const standing = thread(
      entry({ id: "s", kind: "coaching", body: "Count her into the turnaround" }),
      entry({ id: "u1", threadId: "s", occurredAt: noon("2026-09-05"), authorName: "Jess" }),
      entry({ id: "u2", threadId: "s", occurredAt: noon("2026-09-09"), authorName: "Jess" }),
    );
    expect(threadRowMeta(standing, "standing", TODAY, TZ)).toBe("AJ · Sep 1 · 2 updates");

    const closed = thread(entry({ id: "c", resolvedAt: noon("2026-09-10") }));
    expect(threadRowMeta(closed, "resolved", TODAY, TZ)).toBe("AJ · Sep 1 · closed Sep 10");

    const ranOut = thread(entry({ id: "r", importance: "elevated", effectiveUntil: eod("2026-09-20") }));
    expect(threadRowMeta(ranOut, "resolved", TODAY, TZ)).toBe("AJ · Sep 1 · ended Sep 20");

    const open = thread(entry({ id: "o", importance: "elevated", effectiveUntil: eod("2026-10-03") }), entry({ id: "ou", threadId: "o" }));
    expect(threadRowMeta(open, "open", TODAY, TZ)).toBe("AJ · Sep 1 · matters until Oct 3 · 1 update");

    const always = thread(entry({ id: "k", importance: "critical" }));
    expect(threadRowMeta(always, "open", TODAY, TZ)).toBe("AJ · Sep 1 · matters always");

    // Only the first letter is lowered: the month keeps its capital.
    const yearly = thread(entry({ id: "y", importance: "elevated", effectiveFrom: noon("2026-11-05"), effectiveUntil: eod("2026-11-05"), repeat: "yearly" }));
    expect(threadRowMeta(yearly, "open", TODAY, TZ)).toBe("AJ · Sep 1 · only on Nov 5, every year");

    const lastYear = thread(entry({ id: "ly", occurredAt: noon("2025-11-03"), resolvedAt: noon("2025-11-07") }));
    expect(threadRowMeta(lastYear, "resolved", TODAY, TZ)).toBe("AJ · Nov 3, 2025 · closed Nov 7, 2025");
  });

  it("threadCardMeta: a card names its window only when it has one worth naming", () => {
    // A plain "always" note is simply true: no "matters always".
    const plain = thread(entry({ id: "p" }), entry({ id: "pu", threadId: "p", occurredAt: noon("2026-09-05") }));
    expect(threadCardMeta(plain, TODAY, TZ)).toBe("AJ · Sep 1 · 1 update");
    // A loud "always" note says so — it waits for someone to close it.
    expect(threadCardMeta(thread(entry({ id: "k", importance: "critical" })), TODAY, TZ)).toBe("AJ · Sep 1 · matters always");
    expect(
      threadCardMeta(thread(entry({ id: "o", importance: "elevated", effectiveUntil: eod("2026-10-03") })), TODAY, TZ),
    ).toBe("AJ · Sep 1 · matters until Oct 3");
    // A plain note pinned ahead names its start.
    expect(threadCardMeta(thread(entry({ id: "f", effectiveFrom: noon("2026-10-01") })), TODAY, TZ)).toBe(
      "AJ · Sep 1 · matters from Oct 1",
    );
    // Closed, and run out: the window gives way to how it ended.
    expect(threadCardMeta(thread(entry({ id: "c", importance: "critical", resolvedAt: noon("2026-09-10") })), TODAY, TZ)).toBe(
      "AJ · Sep 1 · closed Sep 10",
    );
    expect(
      threadCardMeta(thread(entry({ id: "r", importance: "elevated", effectiveUntil: eod("2026-09-20") })), TODAY, TZ),
    ).toBe("AJ · Sep 1 · ended Sep 20");
  });

  it("threadCardMeta: an import says it is read-only and where it lives", () => {
    const mb = thread(
      entry({ id: "mb", isLegacy: true, legacySource: "Mindbody account notes", authorId: "unknown", authorName: "Unknown coach" }),
    );
    expect(threadCardMeta(mb, TODAY, TZ)).toBe("Read-only · Mindbody account notes · Sep 1. Edit it where it lives.");
    // An old session note with its trainer's name keeps the name.
    const old = thread(entry({ id: "sn", isLegacy: true, legacySource: "Session notes", authorId: "t9", authorName: "Jess Moreno" }));
    expect(threadCardMeta(old, TODAY, TZ)).toBe("Read-only · Session notes · Jess · Sep 1. Edit it where it lives.");
    expect(threadCardMeta(thread(entry({ id: "x", isLegacy: true, authorId: "unknown", occurredAt: null })), TODAY, TZ)).toBe(
      "Read-only · Imported. Edit it where it lives.",
    );
  });

  it("closeWordsOf: a body heals; anything else closes", () => {
    expect(closeWordsOf(entry({ id: "a", kind: "injury" }))).toEqual({ close: "All healed up", reopen: "It’s back" });
    expect(closeWordsOf(entry({ id: "a", kind: "incident" })).close).toBe("All healed up");
    expect(closeWordsOf(entry({ id: "a", kind: "life", category: "Surgery" })).close).toBe("All healed up");
    expect(closeWordsOf(entry({ id: "a", kind: "equipment" }))).toEqual({ close: "Close", reopen: "Reopen" });
    expect(closeWordsOf(entry({ id: "a", kind: "preference" })).close).toBe("Close");
    expect(closeWordsOf(entry({ id: "a", kind: "coaching", category: "Pace" })).close).toBe("Close");
  });
});

/* ------------------------------------------------------------------ */

describe("briefingStatusOf", () => {
  const ctx = (over: Partial<BriefingContext> = {}): BriefingContext => ({
    criticalIds: new Set(),
    headsUpIds: new Set(),
    dismissals: {},
    today: TODAY,
    headsUpWindowDays: 21,
    tz: TZ,
    ...over,
  });

  it("on the briefing: on, or hushed by this trainer until something happens to it", () => {
    const t = thread(entry({ id: "h", importance: "elevated", occurredAt: noon("2026-09-20"), updatedAt: noon("2026-09-20") }));
    expect(briefingStatusOf(t, ctx({ headsUpIds: new Set(["h"]) }))).toEqual({ kind: "on", checked: true });
    expect(briefingStatusOf(t, ctx({ headsUpIds: new Set(["h"]), dismissals: { h: noon("2026-09-21") } }))).toEqual({ kind: "hushed" });

    // An update after the dismissal brings it back.
    const updated = thread(
      entry({ id: "h", importance: "elevated", occurredAt: noon("2026-09-20"), updatedAt: noon("2026-09-20") }),
      entry({ id: "hu", threadId: "h", occurredAt: noon("2026-09-22"), updatedAt: noon("2026-09-22") }),
    );
    expect(briefingStatusOf(updated, ctx({ headsUpIds: new Set(["h"]), dismissals: { h: noon("2026-09-21") } }))).toEqual({ kind: "on", checked: true });

    const crit = thread(entry({ id: "c", importance: "critical" }));
    expect(briefingStatusOf(crit, ctx({ criticalIds: new Set(["c"]), dismissals: { c: noon("2026-09-23") } }))).toEqual({ kind: "hushed" });
  });

  it("on, but unchecked, when this trainer's dismissals have not been read", () => {
    const t = thread(entry({ id: "c", importance: "critical" }));
    expect(briefingStatusOf(t, ctx({ criticalIds: new Set(["c"]), dismissals: null }))).toEqual({ kind: "on", checked: false });
  });

  it("from: a pushed-ahead start, a coming day, and a yearly day's next one", () => {
    const later = thread(entry({ id: "f", importance: "elevated", occurredAt: noon("2026-09-20"), effectiveFrom: noon("2026-10-01") }));
    expect(briefingStatusOf(later, ctx())).toEqual({ kind: "from", day: "2026-10-01" });

    const day = thread(entry({ id: "d", importance: "critical", effectiveFrom: noon("2026-10-15"), effectiveUntil: eod("2026-10-15") }));
    expect(briefingStatusOf(day, ctx())).toEqual({ kind: "from", day: "2026-10-15" });

    const bday = thread(entry({ id: "b", importance: "elevated", kind: "life", category: "Birthday", effectiveFrom: noon("2025-04-02"), effectiveUntil: eod("2025-04-02"), repeat: "yearly" }));
    expect(briefingStatusOf(bday, ctx())).toEqual({ kind: "from", day: "2027-04-02" });
  });

  it("aged-off: an always Heads up goes quiet after three weeks", () => {
    // Written Sep 2: read out until Sep 23, quiet from then.
    const old = thread(entry({ id: "o", importance: "elevated", occurredAt: noon("2026-09-02") }));
    expect(briefingStatusOf(old, ctx())).toEqual({ kind: "aged-off", since: "2026-09-23" });
    // Not yet three weeks old and not in the hook's list: nothing to say.
    const fresh = thread(entry({ id: "n", importance: "elevated", occurredAt: noon("2026-09-10") }));
    expect(briefingStatusOf(fresh, ctx())).toBeNull();
  });

  it("null for a plain note, a closed one and one whose window ran out", () => {
    expect(briefingStatusOf(thread(entry({ id: "p" })), ctx({ headsUpIds: new Set(["p"]) }))).toBeNull();
    expect(briefingStatusOf(thread(entry({ id: "r", importance: "critical", resolvedAt: noon("2026-09-10") })), ctx({ criticalIds: new Set(["r"]) }))).toBeNull();
    expect(briefingStatusOf(thread(entry({ id: "e", importance: "elevated", effectiveUntil: eod("2026-09-20") })), ctx())).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe("criticalLineOf", () => {
  const machines = [
    { id: "leg", name: "Leg Press" },
    { id: "row", name: "Compound Row with a Very Long Name That Is Never Clipped" },
  ];
  const LONG =
    "Right knee: stop at 90° at the bottom turn. She felt a pinch on Mar 4 with the seat one notch closer. Back to seat 7 and it was fine.";

  it("nothing to say with no critical note", () => {
    expect(criticalLineOf([], [], machines)).toBeNull();
  });

  it("names the machine in full, and shows whole sentences — never cut, never '…'", () => {
    const e = entry({ id: "k", importance: "critical", machineId: "leg", body: LONG });
    const line = criticalLineOf([e], threadsOf(e), machines)!;
    expect(line.machineName).toBe("Leg Press");
    expect(line.text).toBe("Right knee: stop at 90° at the bottom turn. She felt a pinch on Mar 4 with the seat one notch closer.");
    expect(line.text.length).toBeGreaterThanOrEqual(CRITICAL_LINE_MIN_CHARS);
    expect(line.text.endsWith("…")).toBe(false);
    expect(line.more).toBe(0);
  });

  it("a long first sentence is shown whole, however long", () => {
    const body = `Never load the left shoulder past neutral on any pressing movement because the rotator cuff repair from ${"the spring ".repeat(5)}is still healing`;
    const e = entry({ id: "k", importance: "critical", machineId: "row", body });
    const line = criticalLineOf([e], null, machines)!;
    expect(body.length).toBeGreaterThan(140);
    expect(line.text).toBe(body);
    expect(line.machineName).toBe("Compound Row with a Very Long Name That Is Never Clipped");
  });

  it("counts the others, and takes the first in the hook's order", () => {
    const a = entry({ id: "a", importance: "critical", body: "Newest." });
    const b = entry({ id: "b", importance: "critical", body: "Older." });
    const c = entry({ id: "c", importance: "critical", body: "Oldest." });
    const line = criticalLineOf([a, b, c], threadsOf(a, b, c), machines)!;
    expect(line.thread.id).toBe("a");
    expect(line.text).toBe("Newest.");
    expect(line.more).toBe(2);
  });

  it("pairs the note with its thread, or makes a thread of one when none is in hand", () => {
    const root = entry({ id: "k", importance: "critical", body: "Stop at 90°." });
    const withUpdate = threadsOf(root, entry({ id: "u", threadId: "k", body: "Seat 7 now." }));
    expect(criticalLineOf([root], withUpdate, machines)!.thread.updates.map((e) => e.id)).toEqual(["u"]);
    const alone = criticalLineOf([root], undefined, machines)!;
    expect(alone.thread.id).toBe("k");
    expect(alone.thread.updates).toEqual([]);
  });

  it("a machine this studio's list does not name is left out, not printed as an id", () => {
    const e = entry({ id: "k", importance: "critical", machineId: "gone", body: "Stop at 90°." });
    expect(criticalLineOf([e], null, machines)!.machineName).toBeNull();
  });

  it("a note written as lines reads as one line, never run together", () => {
    const e = entry({ id: "k", importance: "critical", body: "Right knee\nNo lunges\nStop at 90°." });
    expect(criticalLineOf([e], null, machines)!.text).toBe("Right knee · No lunges · Stop at 90°.");
    const f = entry({ id: "f", importance: "critical", body: "Right knee:\nno lunges." });
    expect(criticalLineOf([f], null, machines)!.text).toBe("Right knee: no lunges.");
  });

  it("hiddenCriticalThreads: critical, listed, and not kept by the filter", () => {
    const listed = threadsOf(entry({ id: "k", importance: "critical" }), entry({ id: "p" }), entry({ id: "k2", importance: "critical" }));
    expect(ids(hiddenCriticalThreads(listed, new Set(["p", "k2"]), new Set(["k", "k2"])))).toEqual(["k"]);
    expect(hiddenCriticalThreads(listed, new Set(["k", "p", "k2"]), new Set(["k", "k2"]))).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

describe("fordDoorCount", () => {
  const details = (n: number, archived = 0): Pick<FordEntry, "isArchived">[] => [
    ...Array.from({ length: n }, () => ({ isArchived: false })),
    ...Array.from({ length: archived }, () => ({ isArchived: true })),
  ];
  const withSummary = {
    id: "c1",
    fordSummary: {
      counts: { family: 2, occupation: 1, recreation: 0, dreams: 0 },
      untagged: 1,
      pinned: { family: ["Married to Tom"] },
    },
  } as unknown as Client;

  it("prefers FORD itself once read: live details plus the older notes it shows", () => {
    expect(fordDoorCount({ readable: true, ford: { status: "ready", entries: details(3, 1) }, client: withSummary })).toBe(3);
    expect(fordDoorCount({ readable: true, ford: { status: "ready", entries: details(3, 1) }, olderLifeCount: 2 })).toBe(5);
    expect(fordDoorCount({ readable: true, ford: { status: "ready", entries: [] } })).toBe(0);
  });

  it("falls back to the client document's counts while FORD loads or when it failed", () => {
    expect(fordDoorCount({ readable: true, ford: { status: "loading", entries: [] }, client: withSummary })).toBe(4);
    expect(fordDoorCount({ readable: true, ford: { status: "failed", entries: [] }, client: withSummary, olderLifeCount: 1 })).toBe(5);
    expect(fordDoorCount({ readable: true, ford: null, client: withSummary })).toBe(4);
  });

  it("counts the client.events FORD adds while it loads, so the number does not jump when FORD arrives", () => {
    const withEvents = {
      ...withSummary,
      events: [
        { id: "e1", date: "2026-10-12", title: "Anniversary", type: "Birthday/Anniversary", priority: "Low" },
        { id: "e2", date: "2026-11-02", endDate: "2026-11-09", title: "Florida", type: "Vacation", priority: "Medium" },
        // Not personal detail: FORD leaves these out, so the door does too.
        { id: "e3", date: "2026-09-01", title: "Knee scope", type: "Medical", priority: "High" },
        { id: "e4", date: "2026-09-15", title: "Rescan", type: "InBody Scan", priority: "Low" },
      ],
    } as unknown as Client;
    const loading = fordDoorCount({ readable: true, ford: { status: "loading", entries: [] }, client: withEvents });
    expect(loading).toBe(6);
    // Once read: FORD's four details plus the same two events (useClientFord merges them).
    expect(fordDoorCount({ readable: true, ford: { status: "ready", entries: details(6) }, client: withEvents })).toBe(loading);
    expect(fordDoorCount({ readable: true, ford: { status: "failed", entries: [] }, client: withEvents })).toBe(6);
    // Events alone, with no summary, would be a confident undercount: unknown.
    const eventsOnly = { id: "c1", events: withEvents.events } as unknown as Client;
    expect(fordDoorCount({ readable: true, ford: { status: "loading", entries: [] }, client: eventsOnly })).toBeNull();
  });

  it("is unknown — null, never 0 — when nothing says, and for a reader FORD refuses", () => {
    expect(fordDoorCount({ readable: true, ford: { status: "loading", entries: [] }, client: { id: "c1" } as Client })).toBeNull();
    expect(fordDoorCount({ readable: true })).toBeNull();
    expect(fordDoorCount({ readable: false, ford: { status: "ready", entries: details(3) }, client: withSummary })).toBeNull();
    expect(fordDoorCount({ readable: true, ford: { status: "denied", entries: [] }, client: withSummary })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */

describe("what the other pages read", () => {
  it("howToCoachThreads: live Preference and Coaching-tip notes, by kind, loudest first", () => {
    const out = howToCoachThreads(
      threadsOf(
        entry({ id: "pref", kind: "preference", occurredAt: noon("2026-09-10") }),
        entry({ id: "tip", kind: "coaching", category: "Pace", importance: "elevated", occurredAt: noon("2026-09-01") }),
        entry({ id: "focus", kind: "coaching", category: "Posture", focusId: "f1" }),
        entry({ id: "legacy:sessions:s1", kind: "general", isLegacy: true, origin: "legacy", legacySource: "Session summary" }),
        entry({ id: "unfiled", kind: "general" }),
        entry({ id: "closed", kind: "preference", resolvedAt: noon("2026-09-05") }),
        entry({ id: "equip", kind: "equipment" }),
        entry({ id: "legacy:profile:discoveryNotes", kind: "consultation", isLegacy: true, origin: "consultation" }),
      ),
      TODAY,
      TZ,
    );
    expect(ids(out)).toEqual(["tip", "pref"]);
  });

  it("injuryThreads: open and standing apart, the medical FIELDS left out, resolved counted", () => {
    const threads = threadsOf(
      entry({ id: "knee", importance: "critical" }),
      entry({ id: "shoulder" }),
      entry({ id: "surgery", kind: "life", category: "Surgery" }),
      entry({ id: "healed", resolvedAt: noon("2026-09-10") }),
      entry({ id: "legacy:profile:medicalHistory", importance: "elevated", isLegacy: true, origin: "profile", authorId: "unknown" }),
      entry({ id: "legacy:profile:clinicalNotes", importance: "elevated", isLegacy: true, origin: "profile", authorId: "unknown" }),
      entry({ id: "fell", kind: "incident", importance: "elevated" }),
      entry({ id: "tip", kind: "coaching" }),
    );
    const plain = injuryThreads(threads, TODAY, { tz: TZ });
    expect(ids(plain.open)).toEqual(["knee"]);
    expect(ids(plain.standing).sort()).toEqual(["shoulder", "surgery"]);
    expect(plain.resolved).toBe(1);

    const withIncidents = injuryThreads(threads, TODAY, { tz: TZ, includeIncidents: true });
    expect(ids(withIncidents.open)).toEqual(["knee", "fell"]);
  });

  it("threadsByMachine: every live note on a machine, loudest first; no check-ins, nothing closed", () => {
    const map = threadsByMachine(
      threadsOf(
        entry({ id: "setup", kind: "equipment", machineId: "leg", occurredAt: noon("2026-09-20") }),
        entry({ id: "knee", machineId: "leg", importance: "critical", occurredAt: noon("2026-09-01") }),
        entry({ id: "old", kind: "equipment", machineId: "leg", resolvedAt: noon("2026-09-02") }),
        entry({ id: "checkin", kind: "coaching", machineId: "leg", focusId: "f1" }),
        entry({ id: "caught", kind: "general", machineId: "row", importance: "elevated" }),
        entry({ id: "none", kind: "equipment" }),
      ),
      TODAY,
      TZ,
    );
    expect([...map.keys()].sort()).toEqual(["leg", "row"]);
    expect(ids(map.get("leg")!)).toEqual(["knee", "setup"]);
    expect(ids(map.get("row")!)).toEqual(["caught"]);
  });

  it("LIFE_CATEGORY_PILLAR places the dated life notes, and leaves the rest unplaced", () => {
    expect(LIFE_CATEGORY_PILLAR).toEqual({ Birthday: "family", Anniversary: "family", Vacation: "recreation", Milestone: null, Other: null });
  });

  it("olderLifeNotesByPillar: by pillar, newest first, no events FORD already draws, no injuries", () => {
    const out = olderLifeNotesByPillar(
      threadsOf(
        entry({ id: "bday", kind: "life", category: "Birthday", occurredAt: noon("2025-04-02") }),
        entry({ id: "anniv", kind: "life", category: "Anniversary", occurredAt: noon("2026-06-12") }),
        entry({ id: "trip", kind: "life", category: "Vacation" }),
        entry({ id: "grad", kind: "life", category: "Milestone" }),
        entry({ id: "legacy:clientEvents:e1", kind: "life", category: "Birthday", isLegacy: true, origin: "profile" }),
        entry({ id: "surgery", kind: "life", category: "Surgery" }),
        // An update whose root is gone is part of a thread, not an older note —
        // notesOnRecord keeps it on Notes (see "every settled life note has a place").
        entry({ id: "orphan", kind: "life", category: "Other", threadId: "missing-root" }),
        entry({ id: "tip", kind: "coaching" }),
      ),
    );
    expect(ids(out.family)).toEqual(["anniv", "bday"]);
    expect(ids(out.recreation)).toEqual(["trip"]);
    expect(ids(out.unplaced)).toEqual(["grad"]);
    expect(out.occupation).toEqual([]);
    expect(out.dreams).toEqual([]);
  });
});
