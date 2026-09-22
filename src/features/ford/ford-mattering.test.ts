import { describe, it, expect } from "vitest";
import { mattersOn, shapeOf, type MatteringFields } from "../client-notes/mattering";
import type { FordEntry } from "./types";

/**
 * A FORD detail can now say WHEN IT MATTERS (AJ, Sep 22 2026).
 *
 * The point of this file is not that three fields were added. It is that
 * `mattering.ts` answers about a FORD detail **without being changed at all**:
 * `MatteringFields` is a structural type, so anything carrying those fields is
 * a valid question. One answer to "does this matter today", for notes and for
 * details alike — rather than the fourth separate date mechanism the app was
 * one step away from growing.
 *
 * The case that drove it, in AJ's words: a detail could say "Nov 5, every
 * year", and nothing else. It could not say "her mother is in hospice through
 * October" — which is the single most important thing to know before walking
 * in, and which stops mattering on its own.
 */

const TZ = "America/New_York";
const day = (s: string) => new Date(`${s}T12:00:00`);

/** A detail, shaped as it is stored. Only the mattering fields vary. */
const detail = (over: Partial<FordEntry>): FordEntry =>
  ({
    id: "f1",
    clientId: "c1",
    studioId: "westlake",
    pillar: "family",
    body: "Her mother is in hospice.",
    subject: "her mother",
    isPinned: false,
    eventDate: null,
    recurrence: "none",
    opportunity: null,
    occurredAt: day("2026-09-20"),
    createdAt: day("2026-09-20"),
    updatedAt: day("2026-09-20"),
    authorId: "t1",
    authorName: "Sam",
    authorInitials: "S",
    origin: "profile",
    sessionId: null,
    isArchived: false,
    ...over,
  }) as FordEntry;

/* The detail is handed over as the structural question mattering.ts asks for.
   If this line ever needs a cast with a field list, the shapes have drifted. */
const asks = (e: FordEntry): MatteringFields => e as MatteringFields;

describe("a FORD detail and the one mattering answer", () => {
  it("answers a from–until range, which it could not express at all before", () => {
    const hospice = detail({
      effectiveFrom: day("2026-09-20"),
      effectiveUntil: day("2026-10-31"),
    });
    expect(shapeOf(asks(hospice), TZ)).toBe("range");
    expect(mattersOn(asks(hospice), "2026-09-20", TZ)).toBe(true);
    expect(mattersOn(asks(hospice), "2026-10-31", TZ)).toBe(true);
    expect(mattersOn(asks(hospice), "2026-11-01", TZ)).toBe(false);
    // ...and before it starts. A detail filed in advance stays quiet.
    expect(mattersOn(asks(hospice), "2026-09-19", TZ)).toBe(false);
  });

  it("treats a detail with no window as a standing fact", () => {
    const standing = detail({ body: "Two grandchildren, Ethan and Cooper." });
    expect(shapeOf(asks(standing), TZ)).toBe("always");
    expect(mattersOn(asks(standing), "2027-04-01", TZ)).toBe(true);
  });

  it("does an anniversary the same way a note does", () => {
    const born = detail({
      body: "Ethan's birthday.",
      effectiveFrom: day("2026-11-05"),
      effectiveUntil: day("2026-11-05"),
      repeat: "yearly",
    });
    expect(shapeOf(asks(born), TZ)).toBe("day");
    expect(mattersOn(asks(born), "2026-11-05", TZ)).toBe(true);
    expect(mattersOn(asks(born), "2027-11-05", TZ)).toBe(true);
    expect(mattersOn(asks(born), "2026-11-06", TZ)).toBe(false);
  });

  it("stops the moment somebody resolves it", () => {
    // She is back. The detail stays in the record; it stops surfacing.
    const over = detail({
      effectiveFrom: day("2026-09-20"),
      effectiveUntil: day("2026-10-31"),
      resolvedAt: day("2026-09-28"),
    });
    expect(mattersOn(asks(over), "2026-09-29", TZ)).toBe(false);
  });

  it("stays quiet once archived, like everything else", () => {
    const gone = detail({ isArchived: true });
    expect(mattersOn(asks(gone), "2026-09-21", TZ)).toBe(false);
  });

  it("leaves the old eventDate mechanism alone", () => {
    // Anniversaries already in the database use eventDate + recurrence and
    // keep working untouched. A detail uses one or the other, never both, and
    // rewriting them all would be a migration for no gain.
    const legacy = detail({ eventDate: day("2026-11-05"), recurrence: "annual" });
    expect(legacy.eventDate).toBeTruthy();
    expect(shapeOf(asks(legacy), TZ)).toBe("always"); // no window = standing
  });
});
