import { describe, expect, it } from "vitest";
import {
  NOTE_TEMPLATES,
  canGoOnStudioShelf,
  cleanFields,
  cleanHunch,
  composedBody,
  evidenceEntry,
  fieldsFromDoc,
  hunchFromDoc,
  hunchLine,
  hunchState,
  onThisDayKeys,
  onThisDayLabel,
  openHunches,
  shelfOf,
  slotsFree,
  studioShelfDraft,
  templateAnswers,
  typedProblems,
  typedTitle,
} from "./journal";
import { NOTE_TYPES, type Hunch } from "./types";

const hunch = (over: Partial<Hunch> = {}): Hunch => ({
  claim: "Clients over 80 move more smoothly on the Pullover with the range two notches shorter.",
  how: "8 clients over 80, each with 4 sessions set up both ways.",
  need: 8,
  unit: "clients",
  evidence: [],
  retiredAt: null,
  ...over,
});
const ev = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, at: i, text: `Seen ${i}`, clientId: null }));

describe("the six types", () => {
  it("are AJ's, each with three short lines and a shelf", () => {
    expect(NOTE_TYPES.map((t) => NOTE_TEMPLATES[t].label)).toEqual(["Client", "Machine", "Protocol", "Research", "Trend", "Personal"]);
    expect(NOTE_TEMPLATES.client.fields.map((f) => f.label)).toEqual(["Who", "What I noticed", "What I'll do next time"]);
    expect(NOTE_TEMPLATES.machine.fields.map((f) => f.label)).toEqual(["Machine", "What I noticed", "Setting or cue"]);
    expect(NOTE_TEMPLATES.protocol.fields.map((f) => f.label)).toEqual(["When", "Steps", "Why"]);
    expect(NOTE_TEMPLATES.research.fields.map((f) => f.label)).toEqual(["Source", "The claim", "What I'll try"]);
    expect(NOTE_TEMPLATES.trend.fields.map((f) => f.label)).toEqual(["What I think", "How I'll know", "Evidence so far"]);
    expect(NOTE_TEMPLATES.personal.fields.map((f) => f.label)).toEqual(["What?", "So what?", "Now what?"]);
  });

  it("say where each may go (q8's default): personal never, machine and protocol to the Studio shelf, client onto the record", () => {
    expect(NOTE_TEMPLATES.personal.shares).toEqual({ record: false, colleagues: false, studioShelf: false });
    expect(NOTE_TEMPLATES.trend.shares).toEqual({ record: false, colleagues: false, studioShelf: false });
    expect(NOTE_TEMPLATES.machine.shares.studioShelf).toBe(true);
    expect(NOTE_TEMPLATES.protocol.shares.studioShelf).toBe(true);
    expect(NOTE_TEMPLATES.client.shares.record).toBe(true);
    expect(NOTE_TEMPLATES.client.shares.studioShelf).toBe(false);
  });
});

describe("the shelves", () => {
  it("put a typed note on its type's shelf", () => {
    expect(shelfOf({ noteType: "machine", kind: "note", clientIds: [] })).toBe("machines");
    expect(shelfOf({ noteType: "trend", kind: "note", clientIds: ["c1"] })).toBe("trends");
  });

  it("put a note written before the Journal where its kind or client points, or nowhere", () => {
    expect(shelfOf({ noteType: null, kind: "research", clientIds: [] })).toBe("research");
    expect(shelfOf({ noteType: null, kind: "injury", clientIds: ["c1"] })).toBe("clients");
    expect(shelfOf({ noteType: undefined, kind: "note", clientIds: [] })).toBeNull();
  });
});

describe("a typed note's words", () => {
  it("reads its answers in the template's order, and titles it by the first", () => {
    const n = { noteType: "machine" as const, fields: { setting: "Seat pin 4", machine: "Pullover", noticed: "Shorter arms reach better." } };
    expect(templateAnswers(n).map((a) => a.label)).toEqual(["Machine", "What I noticed", "Setting or cue"]);
    expect(typedTitle(n)).toBe("Pullover");
    expect(typedTitle({ noteType: "trend", hunch: { claim: "The Leg Curl stalls when the seat is set from memory.", how: "" } })).toBe(
      "The Leg Curl stalls when the seat is set from memory.",
    );
  });

  it("travels as its answers under their labels, then its body; a plain note's body is unchanged", () => {
    const body = composedBody({ noteType: "client", fields: { who: "Barliman Butterbur", next: "Leg Press first." }, body: "Ask about the knee." });
    expect(body).toBe("**Who**\nBarliman Butterbur\n\n**What I'll do next time**\nLeg Press first.\n\nAsk about the knee.");
    expect(composedBody({ noteType: null, body: "Just a note." })).toBe("Just a note.");
  });

  it("keeps only its own type's keys, within the limit", () => {
    expect(cleanFields("client", { who: "Barliman", machine: "not a client key", next: "  " })).toEqual({ who: "Barliman" });
    expect(cleanFields("trend", { think: "x" })).toEqual({});
    expect(fieldsFromDoc({ who: "Barliman", evil: "x", noticed: 3 }, "client")).toEqual({ who: "Barliman" });
    expect(fieldsFromDoc(undefined, null)).toBeNull();
  });

  it("asks for a line, or for a hunch's claim and sample, before it saves", () => {
    expect(typedProblems({ noteType: "client", fields: {}, hunch: null, body: "", title: "" })).toEqual(["Write at least one of the three lines."]);
    expect(typedProblems({ noteType: "client", fields: { who: "Barliman" }, hunch: null, body: "", title: "" })).toEqual([]);
    expect(typedProblems({ noteType: "trend", fields: {}, hunch: { claim: "", how: "", need: 8, unit: "clients" }, body: "", title: "" })).toEqual([
      "Say what you think you're seeing.",
    ]);
    expect(typedProblems({ noteType: null, fields: {}, hunch: null, body: "", title: "" })).toEqual([]);
  });
});

describe("hunches", () => {
  it("say how far the evidence has got, and when it is ready to say", () => {
    expect(hunchLine(hunchState(hunch({ evidence: ev(3) })))).toBe("3 of 8 clients so far · not enough data yet");
    expect(hunchLine(hunchState(hunch({ need: 6, unit: "sessions", evidence: ev(6) })))).toBe("6 of 6 sessions · ready to say");
    expect(hunchLine(hunchState(hunch({ evidence: ev(2), retiredAt: 5 })))).toBe("Retired · 2 of 8 clients when it was");
  });

  it("holds one of three slots until its sample is met or it is retired", () => {
    const notes = [
      { noteType: "trend" as const, hunch: hunch({ evidence: ev(1) }) },
      { noteType: "trend" as const, hunch: hunch({ evidence: ev(8) }) },
      { noteType: "trend" as const, hunch: hunch({ retiredAt: 1 }) },
      { noteType: "trend" as const, hunch: hunch() },
      { noteType: "machine" as const, hunch: null },
    ];
    expect(openHunches(notes)).toBe(2);
    expect(slotsFree(notes)).toBe(1);
    expect(slotsFree([...notes, { noteType: "trend" as const, hunch: hunch() }])).toBe(0);
  });

  it("reads back defensively: odd evidence dropped, the sample within 1 to 50", () => {
    const h = hunchFromDoc({ claim: "x", how: "y", need: 999, unit: "weeks", evidence: [{ id: "a", at: 2, text: "ok" }, { nope: true }, { id: "b", at: 1, text: "first" }] });
    expect(h).toMatchObject({ need: 50, unit: "clients", retiredAt: null });
    expect(h?.evidence.map((e) => e.id)).toEqual(["b", "a"]);
    expect(hunchFromDoc(null)).toBeNull();
    expect(cleanHunch({ claim: "  x  ", how: "", need: 0, unit: "sessions" })).toEqual({ claim: "x", how: "", need: 1, unit: "sessions" });
  });

  it("makes a piece of evidence, or nothing from blank words", () => {
    expect(evidenceEntry("  Belladonna, smoother today  ", "c1", 1000)).toMatchObject({ at: 1000, text: "Belladonna, smoother today", clientId: "c1" });
    expect(evidenceEntry("   ", null)).toBeNull();
  });
});

describe("the Studio shelf", () => {
  it("takes machine, protocol and research notes, and a hunch only once its sample is met", () => {
    expect(canGoOnStudioShelf({ noteType: "machine", hunch: null })).toBe(true);
    expect(canGoOnStudioShelf({ noteType: "client", hunch: null })).toBe(false);
    expect(canGoOnStudioShelf({ noteType: "personal", hunch: null })).toBe(false);
    expect(canGoOnStudioShelf({ noteType: "trend", hunch: hunch({ evidence: ev(3) }) })).toBe(false);
    expect(canGoOnStudioShelf({ noteType: "trend", hunch: hunch({ evidence: ev(8) }) })).toBe(true);
    expect(canGoOnStudioShelf({ noteType: null, hunch: null })).toBe(false);
  });

  it("drafts a Playbook entry from the trainer's words: the situation and what worked", () => {
    const draft = studioShelfDraft({ noteType: "machine", fields: { machine: "Pullover", noticed: "Shorter arms reach better.", setting: "Seat pin 4." }, hunch: null, title: "", body: "" });
    expect(draft).toEqual({ title: "Pullover", situation: "Shorter arms reach better.", worked: "Seat pin 4.", machineIds: [], tags: ["machine"] });
    const trend = studioShelfDraft({ noteType: "trend", fields: {}, hunch: hunch({ need: 2, evidence: ev(2) }), title: "", body: "" });
    expect(trend?.situation).toContain("Seen in 2 of 2 clients.");
    expect(studioShelfDraft({ noteType: "personal", fields: { what: "x" }, hunch: null, title: "", body: "" })).toBeNull();
  });
});

describe("On this day", () => {
  it("looks back a month and a year, landing a 31st on the month's last day", () => {
    expect(onThisDayKeys("2026-09-28")).toEqual({ monthAgo: "2026-08-28", yearAgo: "2025-09-28" });
    expect(onThisDayKeys("2026-03-31")).toEqual({ monthAgo: "2026-02-28", yearAgo: "2025-03-31" });
    expect(onThisDayKeys("2026-01-15")).toEqual({ monthAgo: "2025-12-15", yearAgo: "2025-01-15" });
    expect(onThisDayLabel("2026-08-28", "2026-09-28")).toBe("A month ago");
    expect(onThisDayLabel("2025-09-28", "2026-09-28")).toBe("A year ago");
    expect(onThisDayLabel("2026-09-27", "2026-09-28")).toBeNull();
  });
});
