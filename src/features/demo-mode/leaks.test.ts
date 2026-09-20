/**
 * THE LEAKS THAT WOULD NOT LOOK LIKE LEAKS.
 *
 * Every other guard in Demo Mode is about a trainer reaching real data. These
 * are the other direction — practice sets quietly becoming part of what Max
 * Strength believes about itself — and they are the more dangerous half,
 * because nothing breaks. The numbers keep rendering; they just stop being
 * true, and no screen can tell you which ones.
 *
 * Both jobs below read ACROSS THE WHOLE COMPANY on purpose: "how this machine
 * is used" and "what set-up suits this body" are company-wide answers. That
 * is exactly what makes them the two places a studio-scoped guard would never
 * have caught.
 */
import { describe, it, expect } from "vitest";
import { buildMachineTrends } from "../machine-trends/trends";
import { buildCompany } from "../machine-fit/company";
import { DEMO_STUDIO_ID } from "./constants";

const performedSet = (over: Record<string, unknown> = {}) => ({
  clientId: "c1",
  machineId: "m-leg-press",
  sessionId: "s1",
  weight: "120",
  reps: "10",
  outcome: "performed" as const,
  ...over,
});

describe("the weekly machine-trends job", () => {
  const clients = new Map([
    ["c1", { id: "c1", height: "5' 8\"", homeStudioId: "solon", isActive: true }],
    ["d1", { id: "d1", height: "5' 8\"", homeStudioId: DEMO_STUDIO_ID, isActive: true }],
  ]);

  it("counts a real studio's sets", () => {
    const out = buildMachineTrends([performedSet({ studioId: "solon" })], clients);
    expect(out.machines["m-leg-press"]).toBeDefined();
  });

  it("counts none of Demo Mode's, by any of the studio's names", () => {
    for (const field of ["studioId", "homeStudioId", "clientHomeStudioId"]) {
      const out = buildMachineTrends(
        [performedSet({ clientId: "d1", sessionId: "s2", [field]: DEMO_STUDIO_ID })],
        clients,
      );
      expect(Object.keys(out.machines)).toEqual([]);
    }
  });

  it("counts none of them on the flag alone either", () => {
    const out = buildMachineTrends(
      [performedSet({ clientId: "d1", sessionId: "s2", isDemo: true })],
      clients,
    );
    expect(Object.keys(out.machines)).toEqual([]);
  });

  it("does not count a demo set as a dropped one — it was never a candidate", () => {
    const out = buildMachineTrends(
      [performedSet({ studioId: DEMO_STUDIO_ID }), performedSet({ studioId: "solon" })],
      clients,
    );
    expect(out.droppedSets).toBe(0);
    expect(out.machines["m-leg-press"].sets).toBe(1);
  });
});

describe("machine fit's company tier", () => {
  const fitDoc = (studioId: string) => ({
    studioId,
    docs: [
      {
        machineId: "m-leg-press",
        rows: {
          r1: { clientId: "c1", fields: { seat: "4" }, at: "2026-09-01T12:00:00.000Z" },
        } as never,
      },
    ],
  });
  const clients = [
    { id: "c1", height: "5' 8\"", homeStudioId: "solon" } as never,
    { id: "c1", height: "5' 8\"", homeStudioId: DEMO_STUDIO_ID } as never,
  ];

  it("skips the demo studio whole, so no demo row can reach a sample", () => {
    // The cells are k-anonymous at five clients. Six demo clients at one
    // height would be enough to form one, and the guidance a real trainer
    // then reads would be partly about people who do not exist.
    const withDemo = buildCompany([fitDoc(DEMO_STUDIO_ID)], clients, new Date("2026-09-20"));
    const withNothing = buildCompany([], clients, new Date("2026-09-20"));
    expect(Object.keys(withDemo.blocks)).toEqual(Object.keys(withNothing.blocks));
    expect(withDemo.rowsSkipped).toBe(withNothing.rowsSkipped);
  });

  it("still reads a real studio's index", () => {
    const real = buildCompany([fitDoc("solon")], clients, new Date("2026-09-20"));
    const none = buildCompany([], clients, new Date("2026-09-20"));
    // Something happened for the real studio that did not for an empty list.
    expect(JSON.stringify(real)).not.toEqual(JSON.stringify(none));
  });
});
