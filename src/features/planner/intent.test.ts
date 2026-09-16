import { describe, expect, it } from "vitest";
import { clearPlannerIntent, peekPlannerIntent, plannerIntentFromLink, requestPlanner } from "./intent";

describe("plannerIntentFromLink", () => {
  it("reads the Planner's notification links", () => {
    expect(plannerIntentFromLink("job:abc")).toEqual({ kind: "open-job", jobId: "abc" });
    expect(plannerIntentFromLink("share:n1")).toEqual({ kind: "open-share", noteId: "n1" });
    expect(plannerIntentFromLink("mine")).toEqual({ kind: "open-tab", tab: "mine" });
  });

  it("ignores older links and empty ids", () => {
    expect(plannerIntentFromLink(undefined)).toBeNull();
    expect(plannerIntentFromLink("req_123")).toBeNull();
    expect(plannerIntentFromLink("job:")).toBeNull();
  });
});

describe("the pending request", () => {
  it("is cleared only by the Planner that read it", () => {
    const first = { kind: "open-job", jobId: "a" } as const;
    requestPlanner(first);
    const second = { kind: "open-job", jobId: "b" } as const;
    requestPlanner(second);
    clearPlannerIntent(first);
    expect(peekPlannerIntent()).toBe(second);
    clearPlannerIntent(second);
    expect(peekPlannerIntent()).toBeNull();
  });
});
