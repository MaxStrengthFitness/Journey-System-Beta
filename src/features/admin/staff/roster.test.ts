import { describe, expect, it } from "vitest";
import type { Trainer } from "../../../types";
import {
  NAME_NOT_GIVEN,
  buildStaffRoster,
  requestStudioId,
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

/**
 * The studio picker's Request Access, as it was written until Sep 24 2026:
 * trainerId, trainerName, studioId — and no fullName or email. Two of these
 * waiting at once made the sort call localeCompare on undefined and took
 * down My Studio → Team and Operations → Staff & Roles.
 */
const legacyStudioAccess = (over: Partial<AccessRequest> & { id: string }): AccessRequest => ({
  type: "studio_access",
  trainerId: "uid-nobody",
  studioId: "westlake",
  studioName: "Westlake",
  status: "Pending",
  ...over,
});

describe("a request with no name", () => {
  it("survives two nameless studio-access requests waiting at once", () => {
    const requests = [legacyStudioAccess({ id: "r1" }), legacyStudioAccess({ id: "r2", trainerId: "uid-other" })];
    for (const studioId of ["westlake", null]) {
      const rows = build({ studioId, requests });
      expect(rows.map((r) => r.name)).toEqual([NAME_NOT_GIVEN, NAME_NOT_GIVEN]);
      // Deterministic, whatever order Firestore handed them over in.
      expect(rows.map((r) => r.key)).toEqual(["req:r1", "req:r2"]);
      expect(build({ studioId, requests: [...requests].reverse() }).map((r) => r.key)).toEqual(["req:r1", "req:r2"]);
    }
  });

  it("survives two nameless sign-ups, and lists the named ahead of them", () => {
    const rows = build({
      requests: [
        request({ id: "r1", fullName: undefined, email: undefined }),
        request({ id: "r2", fullName: "   ", email: undefined }),
        request({ id: "r3", fullName: "Cara Crimson", email: "c@x.com" }),
      ],
    });
    expect(rows.map((r) => r.name)).toEqual(["Cara Crimson", NAME_NOT_GIVEN, NAME_NOT_GIVEN]);
  });

  it("survives a trainer document or a Mindbody record with no name", () => {
    // Firestore is not typed. A document missing its name is a bad record,
    // not a reason for the staff screens to go blank.
    const rows = build({
      trainers: [
        trainer({ id: "t1", fullName: undefined as unknown as string }),
        trainer({ id: "t2", fullName: undefined as unknown as string, email: "t2@x.com" }),
      ],
      mindbodyStaff: [
        staff({ id: "mb1", fullName: undefined as unknown as string, firstName: "", lastName: "" }),
        staff({ id: "mb2", fullName: undefined as unknown as string, firstName: "", lastName: "" }),
      ],
    });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.name === NAME_NOT_GIVEN)).toBe(true);
  });
});

describe("studio-access requests (the studio picker)", () => {
  const requester = trainer({
    id: "doc-17",
    authUid: "uid-17",
    fullName: "Dana Doyle",
    email: "dana@example.com",
    primaryHomeStudioId: "solon",
    accessibleStudioIds: ["solon"],
  });
  const asked = (over: Partial<AccessRequest> = {}) =>
    ({
      id: "r1",
      type: "studio_access",
      trainerId: "uid-17",
      fullName: "Dana Doyle",
      email: "dana@example.com",
      studioId: "westlake",
      status: "Pending",
      ...over,
    }) as AccessRequest;
  const waiting = (rows: ReturnType<typeof build>) => rows.filter((r) => r.state === "awaiting-approval");

  it("shows only at the studio it was made for", () => {
    expect(waiting(build({ studioId: "westlake", trainers: [requester], requests: [asked()] }))).toHaveLength(1);
    expect(waiting(build({ studioId: "strongsville", trainers: [requester], requests: [asked()] }))).toEqual([]);
  });

  it("is not mistaken for an approved sign-up because the person has an account", () => {
    // Having an account is the premise of this request. In the all-studios
    // view the requester's email matches their own document, and the sign-up
    // rule ("an account exists, so it was approved") would hide it.
    const rows = waiting(build({ studioId: null, trainers: [requester], requests: [asked()] }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Dana Doyle", email: "dana@example.com", homeStudioId: "solon" });
    expect(rows[0].trainer).toBeUndefined();
  });

  it("drops once the person can already get into that studio", () => {
    for (const into of [
      { accessibleStudioIds: ["solon", "westlake"] },
      { activeGuestStudioIds: ["westlake"] },
      { ownedStudioIds: ["westlake"] },
    ]) {
      const rows = build({ studioId: null, trainers: [{ ...requester, ...into }], requests: [asked()] });
      expect(waiting(rows)).toEqual([]);
    }
  });

  it("names an older request from its trainerName, then from the account", () => {
    const fromTrainerName = build({
      studioId: "westlake",
      trainers: [requester],
      requests: [asked({ fullName: undefined, email: undefined, trainerName: "Dana D." })],
    });
    expect(waiting(fromTrainerName)[0]).toMatchObject({ name: "Dana D.", email: "dana@example.com" });

    const fromAccount = build({
      studioId: "westlake",
      trainers: [requester],
      requests: [asked({ fullName: undefined, email: undefined })],
    });
    expect(waiting(fromAccount)[0]).toMatchObject({ name: "Dana Doyle", email: "dana@example.com" });
  });

  it("finds the account by document id as well as by Auth uid", () => {
    const rows = build({
      studioId: "westlake",
      trainers: [requester],
      requests: [asked({ trainerId: "doc-17", fullName: undefined })],
    });
    expect(waiting(rows)[0].name).toBe("Dana Doyle");
  });

  it("does not hide anything for a request with no trainerId", () => {
    // The same trap as userId: an unguarded `t.authUid === req.trainerId`
    // would match every document with no authUid.
    const rows = build({
      studioId: "westlake",
      trainers: [trainer({ id: "t9", primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"] })],
      requests: [asked({ trainerId: undefined })],
    });
    expect(waiting(rows)).toHaveLength(1);
  });
});

describe("a sign-up request's studio", () => {
  it("shows at the studio it names, and in the all-studios view", () => {
    const requests = [request({ id: "r1", requestedStudioId: "solon" })];
    expect(build({ studioId: "solon", requests })).toHaveLength(1);
    expect(build({ studioId: null, requests })).toHaveLength(1);
  });

  it("is not shown at another studio", () => {
    const requests = [request({ id: "r1", requestedStudioId: "solon" })];
    expect(build({ studioId: "westlake", requests })).toEqual([]);
  });

  it("shows everywhere when it names no studio — an older request is anyone's", () => {
    for (const requestedStudioId of [undefined, null, ""]) {
      expect(build({ studioId: "westlake", requests: [request({ id: "r1", requestedStudioId })] })).toHaveLength(1);
    }
  });

  it("keeps the waiting count to this studio's own requests", () => {
    const rows = build({
      studioId: "westlake",
      requests: [
        request({ id: "r1", requestedStudioId: "westlake" }),
        request({ id: "r2", requestedStudioId: "solon", email: "s@x.com" }),
        legacyStudioAccess({ id: "r3", studioId: "solon" }),
      ],
    });
    expect(summariseRoster(rows).awaitingApproval).toBe(1);
  });
});

describe("requestStudioId", () => {
  it("reads each kind of request's own field", () => {
    expect(requestStudioId({ id: "a", requestedStudioId: "solon" })).toBe("solon");
    expect(requestStudioId({ id: "b", type: "studio_access", studioId: "westlake" })).toBe("westlake");
    expect(requestStudioId({ id: "c" })).toBeNull();
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
