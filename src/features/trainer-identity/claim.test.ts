import { describe, it, expect } from "vitest";
import { decideClaim, claimedProfile, tombstone, isStranded } from "./claim";

const UID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 28 chars, like a real auth uid
const RANDOM = "k3Jd82nAqPz01LmXbQ7f"; // 20 chars, like a Firestore auto-id
const EMAIL = "sam.okafor@example.com";

describe("deciding whether to claim", () => {
  it("claims a placeholder whose email matches the signed-in user", () => {
    expect(
      decideClaim({ id: RANDOM, email: EMAIL, pendingClaim: true }, UID, EMAIL),
    ).toEqual({ kind: "claim", fromId: RANDOM });
  });

  it("matches the email case- and whitespace-insensitively", () => {
    expect(
      decideClaim(
        { id: RANDOM, email: "  Sam.Okafor@Example.com ", pendingClaim: true },
        UID,
        EMAIL,
      ).kind,
    ).toBe("claim");
  });

  it("does nothing when the document is already keyed on the uid", () => {
    expect(
      decideClaim({ id: UID, email: EMAIL, pendingClaim: true }, UID, EMAIL),
    ).toEqual({ kind: "skip", reason: "already keyed on the uid" });
  });

  it("does nothing to a placeholder that was already claimed", () => {
    // Makes a re-run a no-op, which is what lets a half-finished claim simply
    // be attempted again on the next sign-in.
    expect(
      decideClaim(
        {
          id: RANDOM,
          email: EMAIL,
          pendingClaim: true,
          supersededByUid: "someone",
        },
        UID,
        EMAIL,
      ),
    ).toEqual({ kind: "skip", reason: "already claimed" });
  });

  it("REFUSES a profile that was not created as a placeholder", () => {
    // The line between this and the migration. An older mismatched profile is
    // referenced by sessions, schedules and rosters; moving it is a data
    // migration with a backup, not a sign-in side effect.
    expect(decideClaim({ id: RANDOM, email: EMAIL }, UID, EMAIL)).toEqual({
      kind: "skip",
      reason: "not a placeholder — needs the migration",
    });
    expect(
      decideClaim({ id: RANDOM, email: EMAIL, pendingClaim: false }, UID, EMAIL)
        .kind,
    ).toBe("skip");
  });

  it("REFUSES to claim a profile belonging to a different email", () => {
    // The dangerous case: claiming the wrong document would hand one person
    // another person's profile.
    expect(
      decideClaim(
        { id: RANDOM, email: "someone.else@example.com", pendingClaim: true },
        UID,
        EMAIL,
      ),
    ).toEqual({
      kind: "skip",
      reason: "email does not match the signed-in user",
    });
  });

  it("refuses when either side has no email", () => {
    const noEmail = { kind: "skip", reason: "no email to match on" };
    expect(decideClaim({ id: RANDOM, pendingClaim: true }, UID, EMAIL)).toEqual(
      noEmail,
    );
    expect(
      decideClaim({ id: RANDOM, email: EMAIL, pendingClaim: true }, UID, null),
    ).toEqual(noEmail);
    expect(
      decideClaim({ id: RANDOM, email: "   ", pendingClaim: true }, UID, EMAIL),
    ).toEqual(noEmail);
  });

  it("refuses without a uid or a placeholder", () => {
    expect(decideClaim(null, UID, EMAIL).kind).toBe("skip");
    expect(
      decideClaim({ id: RANDOM, email: EMAIL, pendingClaim: true }, null, EMAIL)
        .kind,
    ).toBe("skip");
  });
});

describe("the claimed profile", () => {
  const placeholder = {
    id: RANDOM,
    fullName: "Sam Okafor",
    initials: "SO",
    email: EMAIL,
    role: "LifeTransformer",
    primaryHomeStudioId: "solon",
    pendingClaim: true,
  };

  it("carries the profile across intact", () => {
    const next = claimedProfile(placeholder, UID, "2026-09-06T18:00:00.000Z");
    expect(next.fullName).toBe("Sam Okafor");
    expect(next.initials).toBe("SO");
    expect(next.role).toBe("LifeTransformer");
    expect(next.primaryHomeStudioId).toBe("solon");
    expect(next.email).toBe(EMAIL);
  });

  it("drops the placeholder marker rather than setting it false", () => {
    // A lingering `pendingClaim: false` would still read as a placeholder to
    // anything checking for the key.
    const next = claimedProfile(placeholder, UID, "2026-09-06T18:00:00.000Z");
    expect("pendingClaim" in next).toBe(false);
    expect("id" in next).toBe(false);
  });

  it("records where it came from, so the migration can find the pair", () => {
    const next = claimedProfile(placeholder, UID, "2026-09-06T18:00:00.000Z");
    expect(next.claimedFromId).toBe(RANDOM);
    expect(next.authUid).toBe(UID);
    expect(next.claimedAt).toBe("2026-09-06T18:00:00.000Z");
  });

  it("does not mutate what it was given", () => {
    const before = JSON.stringify(placeholder);
    claimedProfile(placeholder, UID, "2026-09-06T18:00:00.000Z");
    expect(JSON.stringify(placeholder)).toBe(before);
  });
});

describe("the tombstone", () => {
  it("points at the document that replaced it", () => {
    expect(tombstone(UID, "2026-09-06T18:00:00.000Z")).toEqual({
      supersededByUid: UID,
      supersededAt: "2026-09-06T18:00:00.000Z",
      systemStatus: "superseded",
    });
  });
});

describe("who still needs the migration", () => {
  const uids = new Set([UID]);

  it("counts an old mismatched profile", () => {
    expect(isStranded({ id: RANDOM }, uids)).toBe(true);
  });

  it("does not count a profile already keyed on a real uid", () => {
    expect(isStranded({ id: UID }, uids)).toBe(false);
  });

  it("does not count a placeholder — the claim handles those", () => {
    expect(isStranded({ id: RANDOM, pendingClaim: true }, uids)).toBe(false);
  });

  it("does not count a tombstone", () => {
    expect(isStranded({ id: RANDOM, supersededByUid: UID }, uids)).toBe(false);
  });
});
