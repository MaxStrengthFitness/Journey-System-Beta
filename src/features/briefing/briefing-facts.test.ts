import { describe, expect, it } from "vitest";
import type { Routine, WorkoutSession } from "../../types";
import {
  carriedRegions,
  dayKeyDiff,
  lastRunLabel,
  lastRunOfRoutine,
  sessionMatchesLetter,
  untilLabel,
} from "./briefing-facts";

const TODAY = "2026-09-16"; // a Wednesday

describe("carriedRegions — body regions that still matter today", () => {
  const session = (bodyStates: any[]): Pick<WorkoutSession, "preSessionCheckIn"> => ({
    preSessionCheckIn: { bodyStates },
  });

  it("keeps a region whose until day is today or later, and drops the rest", () => {
    const out = carriedRegions(
      session([
        { region: "Lower Back", state: "stiff", dial: -1, until: "2026-09-18" },
        { region: "Knees", state: "stiff", dial: -2, until: "2026-09-16" },
        { region: "Neck", state: "stiff", dial: -1, until: "2026-09-15" },
        { region: "Hips", state: "prime", dial: 1 },
      ]),
      TODAY,
    );
    expect(out.map((r) => r.region)).toEqual(["Knees", "Lower Back"]);
  });

  it("says the Dial's word and the until day in a trainer's words", () => {
    const [back] = carriedRegions(session([{ region: "Lower Back", state: "stiff", dial: -1, until: "2026-09-18" }]), TODAY);
    expect(back.word).toBe("Stiff");
    expect(back.untilLabel).toBe("until Fri");
    expect(back.tone).toBe("warn");
  });

  it("colours by urgency: Pain is alert, Stiff is warn, Better is live", () => {
    const out = carriedRegions(
      session([
        { region: "Knees", state: "stiff", dial: -2, until: "2026-09-20" },
        { region: "Neck", state: "stiff", dial: -1, until: "2026-09-20" },
        { region: "Hips", state: "prime", dial: 1, until: "2026-09-20" },
      ]),
      TODAY,
    );
    expect(out.map((r) => [r.region, r.tone])).toEqual([
      ["Knees", "alert"],
      ["Neck", "warn"],
      ["Hips", "ok"],
    ]);
  });

  it("reads a legacy two-state tag through the Dial when it has an until day", () => {
    const [neck] = carriedRegions(session([{ region: "Neck", state: "stiff", until: "2026-09-17" }]), TODAY);
    expect(neck.dial).toBe(-1);
    expect(neck.word).toBe("Stiff");
    expect(neck.untilLabel).toBe("until tomorrow");
  });

  it("ignores a tag with no until day, a malformed one, and no last session", () => {
    expect(carriedRegions(session([{ region: "Neck", state: "stiff", dial: -1 }]), TODAY)).toEqual([]);
    expect(carriedRegions(session([{ region: "Neck", state: "stiff", dial: -1, until: "Thursday" }]), TODAY)).toEqual([]);
    expect(carriedRegions(null, TODAY)).toEqual([]);
    expect(carriedRegions({ preSessionCheckIn: {} }, TODAY)).toEqual([]);
  });
});

describe("untilLabel / dayKeyDiff", () => {
  it("counts whole days between two studio days", () => {
    expect(dayKeyDiff("2026-09-16", "2026-09-18")).toBe(2);
    expect(dayKeyDiff("2026-09-16", "2026-09-16")).toBe(0);
    expect(dayKeyDiff("2026-09-16", "2026-10-01")).toBe(15);
    expect(dayKeyDiff("nope", "2026-10-01")).toBeNull();
  });

  it("says today, tomorrow, a weekday inside the week, a date beyond it", () => {
    expect(untilLabel("2026-09-16", TODAY)).toBe("until today");
    expect(untilLabel("2026-09-17", TODAY)).toBe("until tomorrow");
    expect(untilLabel("2026-09-21", TODAY)).toBe("until Mon");
    expect(untilLabel("2026-09-25", TODAY)).toBe("until Sep 25");
  });
});

describe("lastRunOfRoutine — when THIS routine last ran", () => {
  const routines: Routine[] = [
    { id: "rA", clientId: "c1", name: "Routine A", machineIds: ["m1", "m2"] } as Routine,
    { id: "rB", clientId: "c1", name: "Routine B", machineIds: ["m3"] } as Routine,
  ];
  const s = (over: Partial<WorkoutSession>): WorkoutSession =>
    ({ status: "Completed", hostedAtStudioId: "s1", clientHomeStudioId: "s1", isCrossTrain: false, sessionNumber: 1, trainerInitials: "AJ", sessionType: "Standard", date: "2026-09-01", ...over }) as WorkoutSession;

  it("finds the newest completed session by routineId, in any order", () => {
    const sessions = [
      s({ id: "1", routineId: "rA", date: "2026-09-02" }),
      s({ id: "2", routineId: "rB", date: "2026-09-14" }),
      s({ id: "3", routineId: "rA", date: "2026-09-12" }),
      s({ id: "4", routineId: "rA", date: "2026-09-15", status: "In-Progress" }),
    ];
    expect(lastRunOfRoutine(sessions, routines, "A")?.session.id).toBe("3");
    expect(lastRunOfRoutine(sessions, routines, "B")?.session.id).toBe("2");
  });

  it("matches by the routine name a session recorded, and by a letter in sessionType", () => {
    expect(sessionMatchesLetter(s({ routineName: "Routine B" }), routines, "B")).toBe(true);
    expect(sessionMatchesLetter(s({ sessionType: "A" as any }), routines, "A")).toBe(true);
    expect(sessionMatchesLetter(s({ sessionType: "Standard" }), routines, "A")).toBe(false);
    // A routineId that names the OTHER routine wins over a stale name.
    expect(sessionMatchesLetter(s({ routineId: "rB", routineName: "Routine A" }), routines, "A")).toBe(false);
  });

  it("returns null when the routine has never run", () => {
    expect(lastRunOfRoutine([s({ routineId: "rA" })], routines, "B")).toBeNull();
    expect(lastRunOfRoutine([], routines, "A")).toBeNull();
    expect(lastRunOfRoutine(undefined, routines, "A")).toBeNull();
  });

  it("labels the run as a sentence, never a raw date string", () => {
    expect(lastRunLabel(null)).toBe("Never run");
    const today = new Date();
    expect(lastRunLabel({ session: s({}), date: today })).toBe("Last run today");
    const yesterday = new Date(Date.now() - 86_400_000);
    expect(lastRunLabel({ session: s({}), date: yesterday })).toBe("Last run yesterday");
    expect(lastRunLabel({ session: s({}), date: new Date(2026, 8, 12, 12) })).toBe("Last run Sep 12");
    expect(lastRunLabel({ session: s({}), date: null })).toBe("Last run · date unknown");
  });
});
