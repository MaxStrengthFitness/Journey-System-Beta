import { describe, expect, it } from "vitest";
import { hasKudosFrom, kudosCount, kudosReceived } from "./kudos";
import type { TaskInstance } from "../../studio-tasks/types";
import type { TeamJob } from "../jobs/types";
import type { TaskRequest } from "../../studio-tasks/requests";

describe("kudos", () => {
  it("counts a map and knows who thanked", () => {
    expect(kudosCount(undefined)).toBe(0);
    expect(kudosCount({ a: true, b: true })).toBe(2);
    expect(hasKudosFrom({ a: true }, "a")).toBe(true);
    expect(hasKudosFrom({ a: true }, "b")).toBe(false);
    expect(hasKudosFrom({ a: true }, null)).toBe(false);
  });
  it("rolls up what each person received across instances, jobs and asks", () => {
    const m = kudosReceived({
      instances: [
        { completedBy: { id: "m", name: "M" }, kudos: { a: true, b: true } },
        { completedBy: { id: "m", name: "M" } },
        { completedBy: null, kudos: { a: true } },
      ] as unknown as TaskInstance[],
      jobs: [{ completedBy: { id: "a", name: "A" }, kudos: { m: true } }] as unknown as TeamJob[],
      requests: [{ resolvedBy: { id: "m", name: "M" }, kudos: { a: true } }] as unknown as TaskRequest[],
    });
    expect(m.get("m")).toBe(3);
    expect(m.get("a")).toBe(1);
  });

  it("credits an answered ask to whoever answered it; an open one has nobody to credit (voice review follow-up)", () => {
    const answered = { status: "done", resolvedBy: { id: "m", name: "M" }, resolvedAt: new Date("2026-09-15T12:00:00-04:00"), kudos: { a: true, b: true } };
    const open = { status: "open", resolvedBy: null, kudos: { a: true } };
    const m = kudosReceived({ instances: [], jobs: [], requests: [answered, open] as unknown as TaskRequest[], since: "2026-09-10" });
    expect(m.get("m")).toBe(2);
    expect([...m.keys()]).toEqual(["m"]);
  });

  it("counts only work closed inside the window when given one", () => {
    const m = kudosReceived({
      since: "2026-09-10",
      instances: [
        { localDate: "2026-09-12", completedBy: { id: "m", name: "M" }, kudos: { a: true } },
        { localDate: "2026-09-01", completedBy: { id: "m", name: "M" }, kudos: { b: true } },
      ] as unknown as TaskInstance[],
      jobs: [
        { closedOn: "2026-09-11", completedBy: { id: "m", name: "M" }, kudos: { a: true } },
        { closedOn: "2026-09-03", completedBy: { id: "m", name: "M" }, kudos: { b: true } },
      ] as unknown as TeamJob[],
      requests: [
        { resolvedBy: { id: "m", name: "M" }, resolvedAt: new Date("2026-09-02T12:00:00-04:00"), kudos: { a: true } },
        // Answered, but with no day to go by: left out, not guessed in.
        { resolvedBy: { id: "m", name: "M" }, kudos: { c: true } },
      ] as unknown as TaskRequest[],
    });
    expect(m.get("m")).toBe(2);
  });
});
