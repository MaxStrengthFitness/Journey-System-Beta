import { describe, expect, it } from "vitest";
import { BEREGOND, GLORFINDEL, IMRAHIL, IORETH, MABLUNG, TODAY, booking, trainerDoc } from "./fixtures";
import { namedLine, whoFaces } from "./who";

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const DAMROD = { id: "t-damrod", name: "Damrod Ranger" };
const people = [BEREGOND, DAMROD, GLORFINDEL, IMRAHIL, IORETH, MABLUNG];
const trainers = people.map((p) => trainerDoc(p));

describe("Who?", () => {
  it("orders the faces by who can help now, with the reason in words, and leaves the leader choosing out", () => {
    const schedules = [
      // Beregond: had a session, next at 2:40 — free now.
      booking("b1", BEREGOND, "Odo Proudfoot", "13:00"),
      booking("b2", BEREGOND, "Rosie Cotton", "14:40"),
      // Mablung: with a client now.
      booking("m1", MABLUNG, "Belladonna Took", "14:00"),
      // Damrod: first session later.
      booking("d1", DAMROD, "Hamfast Gamgee", "16:00"),
      // Imrahil: done for today.
      booking("i1", IMRAHIL, "Farmer Maggot", "09:00"),
    ];
    const faces = whoFaces({ people, trainers, schedules: schedules as never, todayKey: TODAY, nowMin: at("14:18"), excludeIds: [GLORFINDEL.id] });
    expect(faces.map((f) => [f.name.split(" ")[0], f.state, f.reason])).toEqual([
      ["Beregond", "free", "free until 2:40 PM"],
      ["Mablung", "busy", "with a client until 2:30 PM"],
      ["Damrod", "later", "on from 4:00 PM"],
      ["Imrahil", "done", "finished their sessions today"],
      ["Ioreth", "off", "nothing on today's list"],
    ]);
  });

  it("keeps people in name order within each group, and never counts a staff block as a session", () => {
    const schedules = [{ ...booking("u", BEREGOND, "Unavailable", "14:00"), clientName: "Unavailable" }];
    const faces = whoFaces({ people: [MABLUNG, BEREGOND], trainers, schedules: schedules as never, todayKey: TODAY, nowMin: at("14:18") });
    expect(faces.map((f) => f.name)).toEqual([BEREGOND.name, MABLUNG.name]);
    expect(faces.every((f) => f.state === "off")).toBe(true);
  });

  it("says how long a name lasts", () => {
    expect(namedLine("Beregond Guard", 1)).toBe("Beregond has it today");
    expect(namedLine("Beregond Guard", 7)).toBe("Beregond has it for this week");
    expect(namedLine("Beregond Guard", 14)).toBe("Beregond has it for two weeks");
  });
});
