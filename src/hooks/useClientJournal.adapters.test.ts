/**
 * The journal's read-time adapters for profile fields and `client.events`,
 * checked against the notes catalog they feed (notes catalog round, Sep 2026).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../firebase", () => ({ db: { __fake: true }, auth: {} }));

import { adaptEventsToJournal, adaptProfileFields, sessionsWithoutJournalCopy } from "./useClientJournal";
import { noteCategoryOf } from "../features/client-notes/note-catalog";
import { sectionForEntry, type JournalEntry } from "../types/journal";
import type { Client, ClientEvent, WorkoutSession } from "../types";

const event = (over: Partial<ClientEvent>): ClientEvent => ({
  id: "ev",
  date: "2026-09-20",
  title: "Something",
  type: "Other",
  priority: "Low",
  ...over,
});

const client = (over: Partial<Client>): Client =>
  ({ id: "c1", homeStudioId: "s1", firstName: "Judy", lastName: "C", ...over }) as Client;

describe("client.events in the journal", () => {
  it("leaves the personal events to FORD, so they are not shown twice", () => {
    const out = adaptEventsToJournal(
      client({
        events: [
          event({ id: "b", type: "Birthday/Anniversary", title: "Birthday" }),
          event({ id: "v", type: "Vacation", title: "Florida" }),
          event({ id: "s", type: "Snowbird", title: "Arizona" }),
        ],
      }),
    );
    expect(out).toEqual([]);
  });

  it("keeps a CURRENT high-priority personal event for the briefing, filed under FORD / Life", () => {
    const day = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const out = adaptEventsToJournal(
      client({
        events: [
          event({ id: "v", type: "Vacation", title: "Away until Oct 3", priority: "High", date: day(-3), endDate: day(10) }),
          event({ id: "old", type: "Vacation", title: "Last spring", priority: "High", date: day(-200), endDate: day(-190) }),
        ],
      }),
    );
    expect(out.map((e) => [e.id, noteCategoryOf(e), e.importance])).toEqual([
      ["legacy:clientEvents:v", "ford", "critical"],
    ]);
  });

  it("keeps what FORD drops: medical as Injury, the rest under Admin", () => {
    const out = adaptEventsToJournal(
      client({
        events: [
          event({ id: "m", type: "Medical", title: "Knee scope", priority: "High" }),
          event({ id: "a", type: "Alert", title: "Ask about BP meds", priority: "Medium" }),
          event({ id: "i", type: "InBody Scan", title: "Scan due" }),
        ],
      }),
    );
    expect(out.map((e) => [e.id, noteCategoryOf(e), e.importance])).toEqual([
      ["legacy:clientEvents:m", "injury", "critical"],
      ["legacy:clientEvents:a", "admin", "elevated"],
      ["legacy:clientEvents:i", "admin", "standard"],
    ]);
    // A medical event is a load constraint: it belongs to the Body section.
    expect(sectionForEntry(out[0])).toBe("medical");
    expect(out.every((e) => e.isLegacy)).toBe(true);
  });

  it("judges an event with no id on its own", () => {
    const out = adaptEventsToJournal(
      client({
        events: [
          event({ id: undefined as any, type: "Birthday/Anniversary", title: "Birthday" }),
          event({ id: undefined as any, type: "Medical", title: "Hip replacement" }),
        ],
      }),
    );
    expect(out.map((e) => e.body)).toEqual(["Hip replacement"]);
  });

  it("drops an event with nothing to say", () => {
    expect(adaptEventsToJournal(client({ events: [event({ title: "", type: "Alert" })] }))).toEqual([]);
    expect(adaptEventsToJournal(client({}))).toEqual([]);
  });
});

describe("profile fields in the journal", () => {
  const out = adaptProfileFields(
    client({
      mindbodyNotes: "Prefers 7am",
      discoveryNotes: "Came in after a fall",
      priorityNote: "Check BP first",
      medicalHistory: "Rotator cuff repair 2024",
      clinicalNotes: "No overhead pressing",
      globalNotes: "Garden again",
      notes: "Old profile note",
    }),
  );
  const byId = Object.fromEntries(out.map((e) => [e.id.replace("legacy:profile:", ""), e]));

  it("files medical history and clinical notes as Injury, in the medical section", () => {
    for (const key of ["medicalHistory", "clinicalNotes"]) {
      expect(noteCategoryOf(byId[key])).toBe("injury");
      expect(sectionForEntry(byId[key])).toBe("medical");
    }
  });

  it("files the imports and the other profile fields under Admin", () => {
    for (const key of ["mindbodyNotes", "discoveryNotes", "priorityNote", "globalNotes", "notes"]) {
      expect(noteCategoryOf(byId[key])).toBe("admin");
    }
    // The pinned note is still critical, so it heads the catalog.
    expect(byId.priorityNote.importance).toBe("critical");
  });
});

/*
 * One copy of the Note for the next trainer on Notes (voice-review follow-up,
 * Sep 27 2026). Finish writes it to the session AND to the journal; the
 * read-only "Session summary" is left out when the journal holds the same
 * words for the same session.
 */
describe("sessionsWithoutJournalCopy", () => {
  const words = "Knee sore after the move. Go light on leg press.";
  const session = (over: Partial<WorkoutSession> = {}) =>
    ({ id: "s-new", clientId: "c1", date: "2026-09-26", notes: words, ...over }) as WorkoutSession;
  const native = (over: Partial<JournalEntry> = {}) =>
    ({ sessionId: "s-new", origin: "post_session", body: words, isArchived: false, ...over }) as JournalEntry;

  it("leaves out a session whose note the journal already holds", () => {
    expect(sessionsWithoutJournalCopy([session()], [native()])).toEqual([]);
  });

  it("keeps a session from before Sep 18, which has no journal copy", () => {
    const old = session({ id: "s-old", date: "2026-09-10", notes: "Great session, loads up." });
    expect(sessionsWithoutJournalCopy([old, session()], [native()]).map((s) => s.id)).toEqual(["s-old"]);
    expect(sessionsWithoutJournalCopy([old], []).map((s) => s.id)).toEqual(["s-old"]);
  });

  it("compares the words as the journal keeps them: trimmed, and cut at 5,000", () => {
    expect(sessionsWithoutJournalCopy([session({ notes: `  ${words}\n` })], [native()])).toEqual([]);
    const long = `${"a".repeat(4990)} ${"b".repeat(200)}`;
    // The journal copy was cut at 5,000; the session kept the whole text.
    expect(
      sessionsWithoutJournalCopy([session({ notes: long })], [native({ body: long.slice(0, 5000) })]),
    ).toEqual([]);
  });

  it("keeps the session's copy when the words differ (edited later in History)", () => {
    const edited = session({ notes: `${words} Better by Friday.` });
    expect(sessionsWithoutJournalCopy([edited], [native()]).map((s) => s.id)).toEqual(["s-new"]);
  });

  it("only a post-session journal entry for the SAME session counts", () => {
    expect(sessionsWithoutJournalCopy([session()], [native({ sessionId: "s-other" })])).toHaveLength(1);
    expect(sessionsWithoutJournalCopy([session()], [native({ origin: "in_session" })])).toHaveLength(1);
    expect(sessionsWithoutJournalCopy([session()], [native({ sessionId: null })])).toHaveLength(1);
  });

  it("still leaves it out once the journal copy is archived: a discarded note does not come back read-only", () => {
    expect(sessionsWithoutJournalCopy([session()], [native({ isArchived: true })])).toEqual([]);
  });
});
