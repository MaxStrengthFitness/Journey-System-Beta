import { describe, expect, it } from "vitest";
import {
  FORD_ONE_LINE_ID,
  ONE_LINE_MAX,
  isOneLineDoc,
  normaliseOneLine,
  oneLineMeta,
  oneLineView,
  splitOneLine,
} from "./one-line";
import { groupByPillar, summariseFord, upcomingFord } from "./ford-rollup";
import type { FordEntry } from "./types";

/**
 * IN ONE LINE (client codex, phase 11). The line is a FORD document with the
 * fixed id `one-line`, stored archived with no pillar — and the load-bearing
 * claim is that NO reader of details ever sees it: not the tray, not the
 * rollup on the client document, not Coming up. These hold that, over a
 * document shaped exactly as `saveFordOneLine` writes it.
 */

const NOW = new Date(2027, 2, 16, 12);

const detail = (patch: Partial<FordEntry> & { id: string }): FordEntry =>
  ({
    clientId: "c1",
    studioId: "s1",
    pillar: "family",
    body: "Married to Tom",
    subject: null,
    isPinned: true,
    eventDate: null,
    recurrence: "none",
    opportunity: null,
    occurredAt: new Date(2027, 0, 1, 12),
    createdAt: null,
    updatedAt: null,
    authorId: "uid-jess",
    authorName: "Jess Moreno",
    authorInitials: "JM",
    origin: "profile",
    sessionId: null,
    isArchived: false,
    ...patch,
  }) as FordEntry;

/** Exactly the fields saveFordOneLine's create writes (ford-write.ts). */
const lineDoc = (body: string, patch: Partial<FordEntry> = {}): FordEntry =>
  ({
    id: FORD_ONE_LINE_ID,
    kind: "one-line",
    clientId: "c1",
    studioId: "s1",
    pillar: null,
    body,
    subject: null,
    isPinned: true,
    // A date on it would be the worst case for Coming up — it must still be skipped.
    eventDate: new Date(2027, 2, 20),
    recurrence: "annual",
    effectiveFrom: null,
    effectiveUntil: null,
    repeat: null,
    reviewedAt: null,
    opportunity: null,
    followUp: null,
    followUpAt: null,
    followUpBy: null,
    occurredAt: new Date(2027, 2, 15, 9),
    createdAt: null,
    updatedAt: null,
    authorId: "uid-jess",
    authorName: "Jess Moreno",
    authorInitials: "JM",
    origin: "profile",
    sessionId: null,
    isArchived: true,
    ...patch,
  }) as FordEntry;

describe("normaliseOneLine", () => {
  it("trims, keeps one line, and collapses runs of spaces", () => {
    expect(normaliseOneLine("  Retired hygienist,\npickleball   regular \r\n")).toBe("Retired hygienist, pickleball regular");
  });

  it("caps at 120 characters, with no ellipsis", () => {
    const long = "a".repeat(300);
    expect(normaliseOneLine(long)).toBe("a".repeat(ONE_LINE_MAX));
    expect(ONE_LINE_MAX).toBe(120);
    expect(normaliseOneLine(long)).not.toContain("…");
  });

  it("is '' when nothing is left — saving '' clears the line", () => {
    expect(normaliseOneLine("   \n ")).toBe("");
    expect(normaliseOneLine(null)).toBe("");
    expect(normaliseOneLine(undefined)).toBe("");
  });
});

describe("splitOneLine", () => {
  it("takes the one-line document out and leaves the details in order", () => {
    const a = detail({ id: "a" });
    const b = detail({ id: "b" });
    const { oneLine, details } = splitOneLine([a, lineDoc("Retired hygienist"), b]);
    expect(oneLine?.id).toBe("one-line");
    expect(details.map((d) => d.id)).toEqual(["a", "b"]);
    expect(isOneLineDoc({ id: "one-line" })).toBe(true);
    expect(isOneLineDoc({ id: "f1" })).toBe(false);
  });

  it("gives no line for a cleared one, and still keeps it out of the details", () => {
    const { oneLine, details } = splitOneLine([lineDoc("  "), detail({ id: "a" })]);
    expect(oneLine).toBeNull();
    expect(details.map((d) => d.id)).toEqual(["a"]);
  });

  it("gives no line when there is none", () => {
    expect(splitOneLine([detail({ id: "a" })]).oneLine).toBeNull();
    expect(splitOneLine([]).oneLine).toBeNull();
  });

  it("never draws a copy marked kind 'one-line' under another id as a detail — and it is not the line", () => {
    const stray = { ...lineDoc("An old copy"), id: "restored-7" };
    expect(isOneLineDoc(stray)).toBe(true);
    const { oneLine, details } = splitOneLine([stray, detail({ id: "a" }), lineDoc("The line")]);
    expect(details.map((d) => d.id)).toEqual(["a"]);
    expect(oneLine?.body).toBe("The line");
    expect(splitOneLine([stray]).oneLine).toBeNull();
  });
});

describe("the line never reaches a reader of details — even an old one that never split it out", () => {
  const all = [lineDoc("Retired hygienist, pickleball regular"), detail({ id: "a" })];

  it("is not in the To file tray (it has no pillar, but it is archived)", () => {
    const { untagged, buckets } = groupByPillar(all);
    expect(untagged).toEqual([]);
    expect(buckets.flatMap((b) => [...b.pinned, ...b.moments]).map((e) => e.id)).toEqual(["a"]);
  });

  it("is not in the rollup on the client document — no count, no unfiled, no pinned line, no date", () => {
    const summary = summariseFord(all);
    expect(summary.untagged).toBe(0);
    expect(summary.counts).toEqual({ family: 1, occupation: 0, recreation: 0, dreams: 0 });
    expect(JSON.stringify(summary.pinned)).not.toContain("hygienist");
    expect(summary.nextDate).toBeNull();
  });

  it("is not in Coming up", () => {
    expect(upcomingFord(all, { now: NOW })).toEqual([]);
  });
});

describe("oneLineView and its meta", () => {
  it("says the line, who wrote it last and when", () => {
    const view = oneLineView(lineDoc("Retired hygienist, pickleball regular"))!;
    expect(view).toEqual({ text: "Retired hygienist, pickleball regular", byName: "Jess Moreno", at: new Date(2027, 2, 15, 9) });
    expect(oneLineMeta(view, NOW)).toBe("Written by the team · last by Jess Moreno, Mar 15");
  });

  it("adds the year when it is not this year's, and says only what it knows", () => {
    const old = oneLineView(lineDoc("Line", { occurredAt: new Date(2026, 10, 2, 12) }))!;
    expect(oneLineMeta(old, NOW)).toBe("Written by the team · last by Jess Moreno, Nov 2, 2026");
    const nameless = oneLineView(lineDoc("Line", { authorName: "  " }))!;
    expect(oneLineMeta(nameless, NOW)).toBe("Written by the team · last written Mar 15");
    expect(oneLineMeta({ text: "Line", byName: null, at: null }, NOW)).toBe("Written by the team");
  });

  it("is null for no line or a cleared one", () => {
    expect(oneLineView(null)).toBeNull();
    expect(oneLineView(lineDoc(""))).toBeNull();
  });
});
