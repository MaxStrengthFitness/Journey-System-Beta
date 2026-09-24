import { describe, expect, it } from "vitest";
import type { Trainer } from "../../../types";
import { NAME_NOT_GIVEN, buildStaffRoster, type AccessRequest } from "./roster";
import { studioAccessRequest } from "./studio-access-request";

const westlake = { id: "westlake", name: "Westlake" };

describe("studioAccessRequest — what the studio picker writes", () => {
  it("carries the person's name and email, keyed on the Auth uid", () => {
    const fields = studioAccessRequest({
      uid: "uid-17",
      authUser: { displayName: "D Doyle", email: "  Dana@Example.com " },
      trainer: { fullName: " Dana Doyle ", email: "old@example.com" },
      studio: westlake,
    });
    expect(fields).toEqual({
      type: "studio_access",
      // The rules pin trainerId to request.auth.uid; the trainer document id
      // differs from it on older accounts, so it is never used here.
      trainerId: "uid-17",
      fullName: "Dana Doyle",
      email: "dana@example.com",
      studioId: "westlake",
      studioName: "Westlake",
      status: "Pending",
    });
  });

  it("falls back to the Auth name, and to the account's email", () => {
    const fields = studioAccessRequest({
      uid: "uid-17",
      authUser: { displayName: "Dana Doyle", email: null },
      trainer: { fullName: "", email: "Dana@Example.com" },
      studio: westlake,
    });
    expect(fields).toMatchObject({ fullName: "Dana Doyle", email: "dana@example.com" });
  });

  it("leaves off what it does not know rather than writing undefined", () => {
    // Firestore refuses undefined (KNOWN-TRAPS, "Always on").
    const fields = studioAccessRequest({ uid: "uid-17", authUser: null, trainer: null, studio: { id: "westlake" } });
    expect(fields).toEqual({ type: "studio_access", trainerId: "uid-17", studioId: "westlake", status: "Pending" });
    expect(Object.values(fields)).not.toContain(undefined);
  });
});

describe("what the picker writes, the staff screens can list", () => {
  const dana = {
    id: "doc-17",
    authUid: "uid-17",
    fullName: "Dana Doyle",
    initials: "DD",
    email: "dana@example.com",
    role: "LifeTransformer",
    primaryHomeStudioId: "solon",
    accessibleStudioIds: ["solon"],
    activeGuestStudioIds: [],
  } as Trainer;

  const written = (uid: string, trainer: Pick<Trainer, "fullName" | "email"> | null, id: string): AccessRequest => ({
    id,
    ...studioAccessRequest({ uid, authUser: null, trainer, studio: westlake }),
  });

  it("lists the request by name at the studio asked for, and nowhere else", () => {
    const requests = [written("uid-17", dana, "r1")];
    const here = buildStaffRoster({ trainers: [dana], mindbodyStaff: [], requests, studioId: "westlake" });
    expect(here).toHaveLength(1);
    expect(here[0]).toMatchObject({ name: "Dana Doyle", email: "dana@example.com", state: "awaiting-approval" });
    const elsewhere = buildStaffRoster({ trainers: [dana], mindbodyStaff: [], requests, studioId: "strongsville" });
    expect(elsewhere.filter((r) => r.state === "awaiting-approval")).toEqual([]);
  });

  it("still lists two requests from people with no name anywhere", () => {
    const requests = [written("uid-a", null, "r1"), written("uid-b", null, "r2")];
    const rows = buildStaffRoster({ trainers: [], mindbodyStaff: [], requests, studioId: "westlake" });
    expect(rows.map((r) => r.name)).toEqual([NAME_NOT_GIVEN, NAME_NOT_GIVEN]);
  });
});
