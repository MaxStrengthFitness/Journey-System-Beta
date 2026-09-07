import { describe, expect, it } from "vitest";
import type { Trainer } from "../../../types";
import {
  buildStaffRoster,
  summariseRoster,
  type AccessRequest,
  type MindbodyStaff,
} from "./roster";

const trainer = (over: Partial<Trainer> & { id: string }): Trainer => ({
  fullName: "Marina Vella",
  initials: "MV",
  role: "LifeTransformer",
  primaryHomeStudioId: "solon",
  accessibleStudioIds: ["solon"],
  activeGuestStudioIds: [],
  ...over,
});

const staff = (over: Partial<MindbodyStaff> & { id: string }): MindbodyStaff => ({
  fullName: "Marina Vella",
  firstName: "Marina",
  lastName: "Vella",
  ...over,
});

const request = (over: Partial<AccessRequest> & { id: string }): AccessRequest => ({
  fullName: "Jeff Tomaszewski",
  email: "jeff@example.com",
  status: "Pending",
  ...over,
});

const build = (i: Partial<Parameters<typeof buildStaffRoster>[0]> = {}) =>
  buildStaffRoster({ trainers: [], mindbodyStaff: [], requests: [], ...i });

describe("Mindbody is the roster", () => {
  it("lists a Mindbody staff member with no app account", () => {
    // They are already on the schedule — ScheduleEntry carries their name
    // whether or not this app has ever heard of them. Hiding them here is
    // what made an admin feel they had to create a trainer document.
    const rows = build({ mindbodyStaff: [staff({ id: "100062" })] });
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("mindbody-only");
    expect(rows[0].trainer).toBeUndefined();
  });

  it("does not list the same person twice when they have an account", () => {
    const rows = build({
      mindbodyStaff: [staff({ id: "100062" })],
      trainers: [trainer({ id: "t1", mindbodyStaffId: "100062" })],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("linked");
    expect(rows[0].matchedBy).toBe("staffId");
  });
});

describe("matching", () => {
  it("prefers the staff id", () => {
    const rows = build({
      mindbodyStaff: [staff({ id: "100062", email: "other@example.com" })],
      trainers: [
        trainer({ id: "t1", mindbodyStaffId: "100062", email: "marina@example.com" }),
      ],
    });
    expect(rows[0].matchedBy).toBe("staffId");
    expect(rows[0].trainer?.id).toBe("t1");
  });

  it("falls back to email when no staff id is stored", () => {
    const rows = build({
      mindbodyStaff: [staff({ id: "100062", email: "Marina@Example.com" })],
      trainers: [trainer({ id: "t1", email: "marina@example.com" })],
    });
    expect(rows[0].matchedBy).toBe("email");
    expect(rows[0].state).toBe("linked");
  });

  it("falls back to the name when there is no email either", () => {
    const rows = build({
      mindbodyStaff: [staff({ id: "100062" })],
      trainers: [trainer({ id: "t1" })],
    });
    expect(rows[0].matchedBy).toBe("name");
  });

  it("surfaces two accounts matching one Mindbody person rather than picking one", () => {
    // Almost always the random-trainer-id duplicate: one document from the
    // old admin path, one created at sign-in. Choosing silently is how the
    // wrong document keeps winning.
    const rows = build({
      mindbodyStaff: [staff({ id: "100062", email: "marina@example.com" })],
      trainers: [
        trainer({ id: "random-abc", email: "marina@example.com" }),
        trainer({ id: "uid-xyz", email: "marina@example.com" }),
      ],
    });
    expect(rows[0].duplicateTrainerIds).toEqual(["random-abc", "uid-xyz"]);
  });
});

describe("accounts with no Mindbody match", () => {
  it("still lists them, marked", () => {
    const rows = build({ trainers: [trainer({ id: "t1" })] });
    expect(rows[0].state).toBe("app-only");
  });

  it("marks an unclaimed admin-created document as a placeholder", () => {
    const rows = build({
      trainers: [trainer({ id: "t1", pendingClaim: true })],
    });
    expect(rows[0].state).toBe("placeholder");
  });

  it("marks a temporary profile as temporary, not as a placeholder", () => {
    const rows = build({
      trainers: [trainer({ id: "t1", provisional: true, pendingClaim: true })],
    });
    expect(rows[0].state).toBe("temporary");
  });

  it("hides a trainer that was merged away", () => {
    const rows = build({
      trainers: [trainer({ id: "t1", supersededByUid: "uid-1" })],
    });
    expect(rows).toEqual([]);
  });
});

describe("access requests", () => {
  it("lists someone waiting for approval", () => {
    const rows = build({ requests: [request({ id: "r1" })] });
    expect(rows[0].state).toBe("awaiting-approval");
  });

  it("drops a request whose account already exists", () => {
    // Showing it would invite a second approval, and the approval path
    // writes trainers/{uid} — a second one would overwrite the first.
    const rows = build({
      trainers: [trainer({ id: "t1", email: "jeff@example.com" })],
      requests: [request({ id: "r1", email: "jeff@example.com" })],
    });
    expect(rows.filter((r) => r.state === "awaiting-approval")).toEqual([]);
  });

  it("drops a request matched on the signed-in uid rather than the email", () => {
    const rows = build({
      trainers: [trainer({ id: "uid-1", email: "different@example.com" })],
      requests: [request({ id: "r1", userId: "uid-1" })],
    });
    expect(rows.filter((r) => r.state === "awaiting-approval")).toEqual([]);
  });

  it("keeps a pending request that predates the sign-in flow attaching a userId", () => {
    // Regression: an unguarded `t.authUid === req.userId` matches every
    // trainer document with no authUid when the request has no userId — which
    // is most of them — and silently hid every pending request.
    const rows = build({
      trainers: [trainer({ id: "t1", email: "someone@else.com" })],
      requests: [request({ id: "r1", userId: undefined })],
    });
    expect(rows.filter((r) => r.state === "awaiting-approval")).toHaveLength(1);
  });

  it("ignores requests that are not pending", () => {
    const rows = build({ requests: [request({ id: "r1", status: "Approved" })] });
    expect(rows).toEqual([]);
  });
});

describe("scoping to a studio", () => {
  it("keeps trainers whose home studio, access or ownership includes it", () => {
    const rows = build({
      studioId: "westlake",
      trainers: [
        trainer({ id: "home", primaryHomeStudioId: "westlake" }),
        trainer({ id: "access", accessibleStudioIds: ["solon", "westlake"] }),
        trainer({ id: "owner", ownedStudioIds: ["westlake"] }),
        trainer({ id: "elsewhere", accessibleStudioIds: ["solon"] }),
      ],
    });
    expect(rows.map((r) => r.trainer?.id).sort()).toEqual([
      "access",
      "home",
      "owner",
    ]);
  });
});

describe("ordering", () => {
  it("puts the people needing an action first", () => {
    const rows = build({
      mindbodyStaff: [staff({ id: "mb1", fullName: "Zed Zephyr", firstName: "Zed", lastName: "Zephyr" })],
      trainers: [
        trainer({ id: "t-ok", fullName: "Aaron Able", mindbodyStaffId: "none" }),
        trainer({ id: "t-ph", fullName: "Bea Blue", pendingClaim: true }),
      ],
      requests: [request({ id: "r1", fullName: "Cara Crimson", email: "c@x.com" })],
    });
    expect(rows.map((r) => r.state)).toEqual([
      "awaiting-approval",
      "placeholder",
      "mindbody-only",
      "app-only",
    ]);
  });
});

describe("summariseRoster", () => {
  it("counts each state", () => {
    const rows = build({
      mindbodyStaff: [staff({ id: "mb1", fullName: "No Account", firstName: "No", lastName: "Account" })],
      trainers: [
        trainer({ id: "t1", fullName: "App Only" }),
        trainer({ id: "t2", fullName: "Temp One", provisional: true }),
      ],
      requests: [request({ id: "r1", email: "waiting@x.com" })],
    });
    const s = summariseRoster(rows);
    expect(s.awaitingApproval).toBe(1);
    expect(s.noAccount).toBe(1);
    expect(s.unmatched).toBe(1);
    expect(s.temporary).toBe(1);
    expect(s.total).toBe(4);
  });
});
