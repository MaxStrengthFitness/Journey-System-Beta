import { describe, expect, it } from "vitest";
import { canRemoveSharedNote, canShareOnto, clientStudioId } from "./access";

const trainer = (over: Record<string, unknown> = {}) =>
  ({
    role: "LifeTransformer",
    primaryHomeStudioId: "westlake",
    accessibleStudioIds: [],
    activeGuestStudioIds: [],
    ownedStudioIds: [],
    ...over,
  }) as any;

describe("canShareOnto", () => {
  it("lets a trainer share onto their own studio's clients only", () => {
    expect(canShareOnto(trainer(), { homeStudioId: "westlake" })).toBe(true);
    expect(canShareOnto(trainer(), { homeStudioId: "solon" })).toBe(false);
    expect(canShareOnto(trainer({ accessibleStudioIds: ["solon"] }), { homeStudioId: "solon" })).toBe(true);
  });

  it("lets administrators share anywhere, and nobody share onto a client the screen cannot see", () => {
    expect(canShareOnto(trainer({ role: "Admin" }), { homeStudioId: "solon" })).toBe(true);
    expect(canShareOnto(trainer({ role: "Admin" }), null)).toBe(false);
    expect(canShareOnto(null, { homeStudioId: "westlake" })).toBe(false);
  });

  it("reads a legacy client's studioId like the rules do", () => {
    expect(clientStudioId({ studioId: "solon" } as any)).toBe("solon");
    expect(clientStudioId({ homeStudioId: "westlake", studioId: "solon" } as any)).toBe("westlake");
    expect(clientStudioId(null)).toBeNull();
  });
});

describe("canRemoveSharedNote", () => {
  it("lets the author always take their note back", () => {
    expect(canRemoveSharedNote(trainer({ primaryHomeStudioId: "solon" }), "u1", { authorId: "u1" }, "westlake")).toBe(true);
  });

  it("lets the client's studio leaders and administrators remove it, not other trainers", () => {
    expect(canRemoveSharedNote(trainer(), "u2", { authorId: "u1" }, "westlake")).toBe(false);
    expect(canRemoveSharedNote(trainer({ role: "HeadTrainer" }), "u2", { authorId: "u1" }, "westlake")).toBe(true);
    expect(canRemoveSharedNote(trainer({ role: "HeadTrainer" }), "u2", { authorId: "u1" }, "solon")).toBe(false);
    expect(canRemoveSharedNote(trainer({ role: "Founder" }), "u2", { authorId: "u1" }, "solon")).toBe(true);
  });
});
