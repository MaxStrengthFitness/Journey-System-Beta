import { describe, it, expect } from "vitest";
import { DEMO_STUDIO_ID, DEMO_EMAIL_DOMAIN } from "./constants";
import {
  STUDIO_SCOPE_FIELDS,
  isDemoStudioId,
  isDemoStudio,
  isDemoRecord,
  excludeDemo,
  onlyDemo,
  withDemoFlag,
} from "./is-demo";
import {
  DemoBoundaryError,
  assertSameRealm,
  isSameRealm,
  skipsForDemo,
} from "./guards";
import { DEMO_CLIENTS, DEMO_TRAINERS, totalSessionsFor } from "./roster";

describe("recognising the demo studio", () => {
  it("knows the one id and nothing else", () => {
    expect(isDemoStudioId(DEMO_STUDIO_ID)).toBe(true);
    expect(isDemoStudioId("solon")).toBe(false);
    expect(isDemoStudioId(null)).toBe(false);
    expect(isDemoStudioId(undefined)).toBe(false);
    expect(isDemoStudioId("")).toBe(false);
  });

  it("treats a second studio flagged isDemo as demo too", () => {
    // So a second demo studio, if one is ever created, is demo everywhere
    // without touching is-demo.ts.
    expect(isDemoStudio({ id: "another", isDemo: true })).toBe(true);
    expect(isDemoStudio({ id: DEMO_STUDIO_ID })).toBe(true);
    expect(isDemoStudio({ id: "solon" })).toBe(false);
    expect(isDemoStudio(null)).toBe(false);
  });
});

describe("recognising a demo record through any of the studio's four names", () => {
  // The app spells "the studio this belongs to" four different ways on
  // documents. A guard checking one of them leaks; this is why the list exists.
  it.each(STUDIO_SCOPE_FIELDS)("catches a record scoped by %s", (field) => {
    expect(isDemoRecord({ [field]: DEMO_STUDIO_ID })).toBe(true);
    expect(isDemoRecord({ [field]: "solon" })).toBe(false);
  });

  it("catches a record that carries only the flag", () => {
    // The backstop for a record copied somewhere the studio scoping was lost.
    expect(isDemoRecord({ isDemo: true })).toBe(true);
  });

  it("is false for an empty, null or undefined record", () => {
    expect(isDemoRecord({})).toBe(false);
    expect(isDemoRecord(null)).toBe(false);
    expect(isDemoRecord(undefined)).toBe(false);
  });

  it("does not mistake a non-string studio field for a match", () => {
    expect(isDemoRecord({ studioId: 42 as unknown as string })).toBe(false);
  });

  it("catches a session, which names the studio twice", () => {
    // A cross-train session: hosted at a real studio, client from demo.
    // Either half makes it demo — that is the point of checking all four.
    expect(
      isDemoRecord({ hostedAtStudioId: "solon", clientHomeStudioId: DEMO_STUDIO_ID }),
    ).toBe(true);
  });
});

describe("keeping demo out of real numbers", () => {
  const rows = [
    { id: "a", studioId: "solon" },
    { id: "b", studioId: DEMO_STUDIO_ID },
    { id: "c", isDemo: true },
    { id: "d", homeStudioId: "westlake" },
  ];

  it("excludeDemo drops every demo row", () => {
    expect(excludeDemo(rows).map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("onlyDemo is its exact inverse", () => {
    expect(onlyDemo(rows).map((r) => r.id)).toEqual(["b", "c"]);
    expect(excludeDemo(rows).length + onlyDemo(rows).length).toBe(rows.length);
  });

  it("withDemoFlag stamps at write time, and leaves real payloads alone", () => {
    expect(withDemoFlag({ name: "x" }, true)).toEqual({ name: "x", isDemo: true });
    expect(withDemoFlag({ name: "x" }, false)).toEqual({ name: "x" });
    // Never mutates its input.
    const payload = { name: "x" };
    withDemoFlag(payload, true);
    expect(payload).toEqual({ name: "x" });
  });
});

describe("the boundary throws one way and skips the other", () => {
  const realClient = { homeStudioId: "solon" };
  const demoClient = { homeStudioId: DEMO_STUDIO_ID };

  it("refuses to touch a real record from inside Demo Mode", () => {
    // The direction that destroys something. It throws.
    expect(() => assertSameRealm(DEMO_STUDIO_ID, realClient, "client")).toThrow(
      DemoBoundaryError,
    );
    expect(() => assertSameRealm(DEMO_STUDIO_ID, realClient, "client")).toThrow(
      /Leave Demo Mode/,
    );
  });

  it("refuses to touch a demo record from inside a real studio", () => {
    expect(() => assertSameRealm("solon", demoClient, "session")).toThrow(
      DemoBoundaryError,
    );
    expect(() => assertSameRealm("solon", demoClient, "session")).toThrow(
      /belongs to Demo Mode/,
    );
  });

  it("allows a write that stays in its own realm", () => {
    expect(() => assertSameRealm(DEMO_STUDIO_ID, demoClient)).not.toThrow();
    expect(() => assertSameRealm("solon", realClient)).not.toThrow();
  });

  it("isSameRealm answers the same question without throwing", () => {
    expect(isSameRealm(DEMO_STUDIO_ID, demoClient)).toBe(true);
    expect(isSameRealm(DEMO_STUDIO_ID, realClient)).toBe(false);
    expect(isSameRealm("solon", demoClient)).toBe(false);
    expect(isSameRealm("solon", realClient)).toBe(true);
  });

  it("outward-facing work SKIPS for demo rather than throwing", () => {
    // A nightly job that threw on the demo studio would take the real
    // studios queued behind it down with it.
    expect(skipsForDemo("mindbody_sync", DEMO_STUDIO_ID)).toBe(true);
    expect(skipsForDemo("data_export", DEMO_STUDIO_ID)).toBe(true);
    expect(skipsForDemo("mindbody_sync", "solon")).toBe(false);
    expect(skipsForDemo("mindbody_sync", null)).toBe(false);
  });
});

describe("the roster earns its place", () => {
  it("has six clients, each teaching something different", () => {
    expect(DEMO_CLIENTS).toHaveLength(6);
    const lessons = new Set(DEMO_CLIENTS.map((c) => c.teaches));
    expect(lessons.size).toBe(6);
  });

  it("covers the four states a trainer must be able to rehearse", () => {
    // A long clean history, rough sets, nearly out of sessions, brand new.
    expect(DEMO_CLIENTS.some((c) => c.sessions >= 40 && !c.hasRoughSets)).toBe(true);
    expect(DEMO_CLIENTS.some((c) => c.hasRoughSets)).toBe(true);
    expect(DEMO_CLIENTS.some((c) => c.remainingSessions <= 3)).toBe(true);
    expect(DEMO_CLIENTS.some((c) => c.sessions <= 2)).toBe(true);
  });

  it("has exactly one client carrying pre-Journey history, and her total is the sum", () => {
    const migrated = DEMO_CLIENTS.filter((c) => c.priorSessions > 0);
    expect(migrated).toHaveLength(1);
    const esme = migrated[0];
    expect(esme.lastName).toBe("Bolger");
    // 8 in Journey, 304 before it — the profile must read 312, not "new".
    expect(totalSessionsFor(esme)).toBe(312);
    expect(esme.sessions).toBeLessThan(10);
  });

  it("has somebody the attendance watch should find", () => {
    expect(DEMO_CLIENTS.some((c) => c.daysSinceLastSession > 28)).toBe(true);
  });

  it("has three trainers with distinct initials and one leader", () => {
    expect(DEMO_TRAINERS).toHaveLength(3);
    const initials = new Set(DEMO_TRAINERS.map((t) => t.initials));
    expect(initials.size).toBe(3);
    expect(DEMO_TRAINERS.filter((t) => t.role === "StudioLeader")).toHaveLength(1);
  });

  it("splits the coaching across the whole team", () => {
    const total = DEMO_TRAINERS.reduce((sum, t) => sum + t.share, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("uses names that read as ordinary people", () => {
    // The easter egg has to stay subtle: no Fellowship, nothing comic.
    const banned = [
      "frodo", "gandalf", "aragorn", "legolas", "gimli", "samwise",
      "boromir", "bilbo", "sauron", "gollum", "baggins", "butterbur",
    ];
    const everyone = [...DEMO_CLIENTS, ...DEMO_TRAINERS]
      .map((p) => `${p.firstName} ${p.lastName}`.toLowerCase());
    for (const name of everyone) {
      for (const bad of banned) {
        expect(name).not.toContain(bad);
      }
    }
  });

  it("keeps every demo email on a TLD that cannot route", () => {
    expect(DEMO_EMAIL_DOMAIN).toBe("demo.invalid");
  });
});
