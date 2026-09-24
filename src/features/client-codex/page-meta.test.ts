import { describe, expect, it } from "vitest";
import type { Client } from "../../types";
import type { NotesSummary } from "../client-notes/record-selectors";
import { RECORD_PAGE_IDS } from "../client-profile/profile-nav";
import { subnavItems, type PageMetaInput } from "./page-meta";
import { comingUp } from "../ford/coming-up";

const summary = (over: Partial<NotesSummary> = {}): NotesSummary => ({
  open: 0,
  standing: 0,
  resolved: 0,
  total: 0,
  critical: 0,
  unfiled: 0,
  ...over,
});

const input = (over: Partial<PageMetaInput> = {}): PageMetaInput => ({
  client: {} as Client,
  notes: { state: "ready", summary: summary() },
  focuses: { state: "ready", running: 0 },
  ford: { status: "ready", count: 0 },
  ...over,
});

const item = (items: ReturnType<typeof subnavItems>, id: string) => items.find((i) => i.id === id)!;

describe("subnavItems", () => {
  it("is the seven pages, in AJ's order, with their labels", () => {
    const items = subnavItems(input());
    expect(items.map((i) => i.id)).toEqual([...RECORD_PAGE_IDS]);
    expect(items.map((i) => i.label)).toEqual([
      "Overview",
      "Notes",
      "FORD",
      "Body & Pulse",
      "Goals & Focus",
      "Story",
      "Account",
    ]);
    expect(item(items, "overview").meta).toBe("everything");
  });

  describe("Notes", () => {
    it("counts open and critical, and the dot is crimson only for a critical that matters today", () => {
      const withCrit = item(subnavItems(input({ notes: { state: "ready", summary: summary({ open: 3, critical: 1, total: 3 }) } })), "notes");
      expect(withCrit).toMatchObject({ meta: "3 open · 1 critical", flag: true, flagTone: "alert" });
      const plain = item(subnavItems(input({ notes: { state: "ready", summary: summary({ open: 2, total: 2 }) } })), "notes");
      expect(plain).toMatchObject({ meta: "2 open", flag: false });
    });

    it("says standing, none yet, loading and couldn't load in their own words", () => {
      expect(item(subnavItems(input({ notes: { state: "ready", summary: summary({ standing: 8, total: 8 }) } })), "notes").meta).toBe("8 standing");
      expect(item(subnavItems(input()), "notes").meta).toBe("none yet");
      expect(item(subnavItems(input({ notes: { state: "loading", summary: null } })), "notes").meta).toBe("loading");
      expect(item(subnavItems(input({ notes: { state: "failed", summary: null } })), "notes").meta).toBe("couldn't load");
    });
  });

  describe("FORD", () => {
    it("says 'home studio only' to a reader the FORD rule refuses, with no count", () => {
      expect(item(subnavItems(input({ ford: { status: "off", count: null } })), "ford").meta).toBe("home studio only");
      expect(item(subnavItems(input({ ford: { status: "denied", count: 12 } })), "ford").meta).toBe("home studio only");
    });

    it("counts details, including the client document's counts while FORD loads", () => {
      expect(item(subnavItems(input({ ford: { status: "ready", count: 12 } })), "ford").meta).toBe("12 details");
      expect(item(subnavItems(input({ ford: { status: "ready", count: 1 } })), "ford").meta).toBe("1 detail");
      expect(item(subnavItems(input({ ford: { status: "loading", count: 4 } })), "ford").meta).toBe("4 details");
    });

    it("never says 'nothing on file yet' before FORD has answered", () => {
      expect(item(subnavItems(input({ ford: { status: "ready", count: 0 } })), "ford").meta).toBe("nothing on file yet");
      // Answered, but the older life notes it also shows are still loading.
      expect(item(subnavItems(input({ ford: { status: "ready", count: null } })), "ford").meta).toBe("loading");
      expect(item(subnavItems(input({ ford: { status: "loading", count: 0 } })), "ford").meta).toBe("loading");
      expect(item(subnavItems(input({ ford: { status: "loading", count: null } })), "ford").meta).toBe("loading");
      expect(item(subnavItems(input({ ford: { status: "failed", count: 3 } })), "ford").meta).toBe("couldn't load");
    });

    it("says couldn't load, never 'nothing on file yet', when the journal's notes failed", () => {
      const failed = { state: "failed" as const, summary: null };
      // fordCountOf is null when FORD is empty and the older notes are unknown.
      expect(item(subnavItems(input({ notes: failed, ford: { status: "ready", count: null } })), "ford").meta).toBe("couldn't load");
      // FORD's own details are still true, and still counted.
      expect(item(subnavItems(input({ notes: failed, ford: { status: "ready", count: 3 } })), "ford").meta).toBe("3 details");
    });

    it("names a birthday within a month, then what waits to be filed (FORD's own line)", () => {
      const soon = comingUp({ dateOfBirth: "1958-04-02", entries: [], todayKey: "2027-03-16" });
      expect(item(subnavItems(input({ ford: { status: "ready", count: 6, comingUp: soon, untagged: 1 } })), "ford").meta).toBe(
        "birthday in 17 days",
      );
      expect(item(subnavItems(input({ ford: { status: "ready", count: 6, comingUp: [], untagged: 2 } })), "ford").meta).toBe("2 to file");
      // Not while it loads: the birthday is known, but what else is coming up is not.
      expect(item(subnavItems(input({ ford: { status: "loading", count: 6, comingUp: soon } })), "ford").meta).toBe("6 details");
    });

    it("never draws a dot, so it can never be coloured by a pillar", () => {
      expect(item(subnavItems(input({ ford: { status: "ready", count: 5 } })), "ford").flag).toBeFalsy();
    });
  });

  describe("Body & Pulse", () => {
    it("counts watch-outs with a plum dot, crimson only for an absolute contraindication", () => {
      const caution = item(subnavItems(input({ client: { clinicalFlags: ["gen-blood-pressure"] } as Client })), "body");
      expect(caution.meta).toBe("1 watch-out");
      expect(caution.flag).toBe(true);
      expect(caution.flagTone).toBe("warn");
      const two = item(subnavItems(input({ client: { clinicalFlags: ["gen-blood-pressure", "joint-tka"] } as Client })), "body");
      expect(two).toMatchObject({ meta: "2 watch-outs", flag: true, flagTone: "warn" });
      const absolute = item(subnavItems(input({ client: { clinicalFlags: ["joint-tka", "cv-hypertension"] } as Client })), "body");
      expect(absolute).toMatchObject({ meta: "2 watch-outs", flag: true, flagTone: "alert" });
    });

    it("says when the Pulse was last saved when no watch-out is on file, else what the page holds (phase 12)", () => {
      expect(item(subnavItems(input()), "body")).toMatchObject({ meta: "Build and Pulse", flag: false });
      const now = new Date(2027, 2, 24, 12);
      expect(item(subnavItems({ ...input(), pulse: { day: "2027-03-10" }, now }), "body")).toMatchObject({
        meta: "Pulse Mar 10",
        flag: false,
      });
      // Watch-outs come first, whatever the Pulse says.
      const flagged = input({ client: { clinicalFlags: ["gen-knee"] } as Client });
      expect(item(subnavItems({ ...flagged, pulse: { day: "2027-03-10" }, now }), "body").meta).toBe("1 watch-out");
    });
  });

  describe("Goals & Focus", () => {
    it("counts running focuses, else says whether a goal is set", () => {
      expect(item(subnavItems(input({ focuses: { state: "ready", running: 2 } })), "goals").meta).toBe("2 focuses running");
      expect(item(subnavItems(input({ focuses: { state: "ready", running: 1 } })), "goals").meta).toBe("1 focus running");
      expect(item(subnavItems(input({ client: { smartGoal: "Walk the Camino" } as Client })), "goals").meta).toBe("a goal set");
      expect(item(subnavItems(input()), "goals").meta).toBe("no focus running");
    });

    it("says loading and couldn't load rather than 'no focus running'", () => {
      expect(item(subnavItems(input({ focuses: { state: "loading", running: null } })), "goals").meta).toBe("loading");
      expect(item(subnavItems(input({ focuses: { state: "failed", running: null } })), "goals").meta).toBe("couldn't load");
    });
  });

  describe("Story and Account", () => {
    it("says the Story's own line, and nothing when it has none", () => {
      expect(item(subnavItems(input()), "story").meta).toBeNull();
      expect(item(subnavItems(input({ story: { hint: null } })), "story").meta).toBeNull();
      expect(item(subnavItems(input({ story: { hint: "since 2019" } })), "story").meta).toBe("since 2019");
    });

    it("prints Mindbody's sessions left, never an estimate — the Account area's own line", () => {
      const renewal = (over: Record<string, unknown>) => ({ client: { renewal: { situation: "on-track", ...over } } as unknown as Client });
      expect(item(subnavItems(input(renewal({ sessionsLeft: 95, sessionsLeftSource: "mindbody" }))), "account").meta).toBe("95 sessions left");
      expect(item(subnavItems(input(renewal({ sessionsLeft: 95, sessionsLeftSource: "estimate" }))), "account").meta).toBeNull();
      expect(item(subnavItems(input(renewal({ situation: "lapsed", sessionsLeft: 0, sessionsLeftSource: "mindbody" }))), "account").meta).toBe(
        "package ended",
      );
      expect(item(subnavItems(input()), "account").meta).toBeNull();
      // With an estimate, what she holds right now — never called "left" —
      // counted off Mindbody's pricing options, as the Account page counts it.
      const estimated = {
        client: {
          renewal: { situation: "on-track", sessionsLeft: 95, sessionsLeftSource: "estimate", sessionsOnHand: 5 },
          mindbodyServices: {
            a: { serviceId: "a", name: "96 Sessions · 12 Mo", remaining: 5 },
            b: { serviceId: "b", name: "Drop-in 3 pack", remaining: 3 },
          },
        } as unknown as Client,
      };
      expect(item(subnavItems(input(estimated)), "account").meta).toBe("8 on hand");
    });
  });

  it("never prints a score, a percentage or a traffic light", () => {
    const busy = subnavItems(
      input({
        client: { clinicalFlags: ["gen-blood-pressure", "joint-tka"], smartGoal: "x" } as Client,
        notes: { state: "ready", summary: summary({ open: 3, critical: 1, standing: 2, total: 5 }) },
        focuses: { state: "ready", running: 2 },
        ford: { status: "ready", count: 9 },
      }),
    );
    for (const i of busy) {
      const meta = i.meta ?? "";
      expect(meta, i.id).not.toMatch(/%|\/10|\b(red|yellow|green|amber)\b/i);
    }
  });
});
