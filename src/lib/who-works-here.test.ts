import { describe, expect, it } from "vitest";
import { whoWorksHere, worksHere, type TeamMemberLike } from "./who-works-here";

/** "Everyone who works there" (AJ, voice review follow-up, Sep 27 2026). */

const person = (id: string, over: Partial<TeamMemberLike> = {}): TeamMemberLike => ({
  id,
  primaryHomeStudioId: "solon",
  accessibleStudioIds: ["solon"],
  activeGuestStudioIds: [],
  ...over,
});

describe("worksHere", () => {
  it("counts the home studio, a studio they also work at, and a guest studio", () => {
    expect(worksHere(person("home"), "solon")).toBe(true);
    // A floater: home elsewhere, works here too.
    expect(worksHere(person("floater", { primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake", "solon"] }), "solon")).toBe(true);
    // A guest here this week.
    expect(worksHere(person("guest", { primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"], activeGuestStudioIds: ["solon"] }), "solon")).toBe(true);
    // Someone at another studio entirely.
    expect(worksHere(person("far", { primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"] }), "solon")).toBe(false);
  });

  it("leaves out a placeholder nobody has claimed, a replaced account and an inactive one", () => {
    expect(worksHere(person("placeholder", { pendingClaim: true }), "solon")).toBe(false);
    expect(worksHere(person("replaced", { supersededByUid: "uid-2" }), "solon")).toBe(false);
    expect(worksHere(person("off", { isActive: false }), "solon")).toBe(false);
  });

  it("needs an id and a studio", () => {
    expect(worksHere(person(""), "solon")).toBe(false);
    expect(worksHere(person("home"), null)).toBe(false);
    expect(worksHere(null, "solon")).toBe(false);
  });

  it("lists Demo Mode's own trainers at the demo studio, placeholders though they are, and nobody else", () => {
    const aragorn = person("demo-aragorn", { primaryHomeStudioId: "demo-studio", accessibleStudioIds: ["demo-studio"], pendingClaim: true, isDemo: true });
    const real = person("real");
    expect(worksHere(aragorn, "demo-studio")).toBe(true);
    // The realm rule: the whole company is not Demo Mode's team...
    expect(worksHere(real, "demo-studio")).toBe(false);
    // ...even someone whose record happens to name the demo studio...
    expect(worksHere(person("wanderer", { accessibleStudioIds: ["solon", "demo-studio"] }), "demo-studio")).toBe(false);
    // ...and a demo trainer is never on a real studio's team.
    expect(worksHere({ ...aragorn, accessibleStudioIds: ["demo-studio", "solon"] }, "solon")).toBe(false);
  });
});

describe("whoWorksHere", () => {
  it("keeps the order it was given and is empty with no studio", () => {
    const list = [person("b"), person("a"), person("x", { primaryHomeStudioId: "westlake", accessibleStudioIds: [] })];
    expect(whoWorksHere(list, "solon").map((t) => t.id)).toEqual(["b", "a"]);
    expect(whoWorksHere(list, null)).toEqual([]);
  });
});
