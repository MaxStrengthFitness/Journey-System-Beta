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
});
