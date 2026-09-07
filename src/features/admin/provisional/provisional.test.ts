import { describe, expect, it } from "vitest";
import {
  isProvisional,
  isSuperseded,
  mintProvisionalClient,
  mintProvisionalTrainer,
  nameKey,
  provisionalAgeDays,
  provisionalCount,
  validateMint,
  withoutSuperseded,
} from "./provisional";

const author = { id: "t-aj", name: "Austin Jurgens" };
const NOW = new Date("2026-09-08T14:00:00Z");

const base = {
  firstName: "Laura",
  lastName: "Adelman",
  studioId: "solon",
  reason: "Mindbody is down",
  author,
  now: NOW,
};

describe("nameKey", () => {
  it("ignores case, spacing and punctuation", () => {
    expect(nameKey("Laura", "Adelman")).toBe(nameKey("  laura ", "ADELMAN"));
    expect(nameKey("Mary-Jane", "O'Brien")).toBe(nameKey("mary jane", "obrien"));
  });
});

describe("validateMint", () => {
  it("needs both names", () => {
    expect(validateMint({ firstName: "Laura", lastName: " ", studioId: "s" }, []))
      .toMatchObject({ code: "no-name" });
  });

  it("needs a studio", () => {
    expect(
      validateMint({ firstName: "Laura", lastName: "Adelman", studioId: "" }, []),
    ).toMatchObject({ code: "no-studio" });
  });

  it("refuses a second record for the same person at the same studio", () => {
    // The realistic case: Mindbody is down, the manager cannot see that the
    // client already exists, and mints a duplicate. Two records for one
    // person is the mess reconciliation then has to unpick.
    const problem = validateMint(
      { firstName: "laura", lastName: "adelman", studioId: "solon" },
      [{ id: "c1", firstName: "Laura", lastName: "Adelman", homeStudioId: "solon" }],
    );
    expect(problem).toMatchObject({ code: "duplicate", existingId: "c1" });
  });

  it("allows the same name at a different studio", () => {
    expect(
      validateMint(
        { firstName: "Laura", lastName: "Adelman", studioId: "westlake" },
        [{ id: "c1", firstName: "Laura", lastName: "Adelman", homeStudioId: "solon" }],
      ),
    ).toBeNull();
  });

  it("passes a genuinely new person", () => {
    expect(
      validateMint({ firstName: "Ed", lastName: "Ellis", studioId: "solon" }, [
        { id: "c1", firstName: "Laura", lastName: "Adelman", homeStudioId: "solon" },
      ]),
    ).toBeNull();
  });
});

describe("mintProvisionalClient", () => {
  it("marks the record, with who and why", () => {
    const c = mintProvisionalClient(base);
    expect(c.provisional).toBe(true);
    expect(c.provisionalBy).toBe("t-aj");
    expect(c.provisionalReason).toBe("Mindbody is down");
    expect(c.provisionalSince).toBe(NOW.toISOString());
  });

  it("files the person at the studio and leaves them active", () => {
    const c = mintProvisionalClient(base);
    expect(c.homeStudioId).toBe("solon");
    expect(c.isActive).toBe(true);
  });

  it("invents nothing", () => {
    // Placeholder contract data is how a temporary record starts looking
    // real. Sessions remaining is 0 because it is unknown, not because the
    // client has none.
    const c = mintProvisionalClient(base);
    expect(c.remainingSessions).toBe(0);
    expect(c.mindbodyId).toBeUndefined();
    expect(c.mindbodyClientId).toBeUndefined();
    expect("medicalHistory" in c).toBe(false);
  });

  it("omits contact fields rather than writing empty strings", () => {
    const c = mintProvisionalClient(base);
    expect("email" in c).toBe(false);
    const withEmail = mintProvisionalClient({ ...base, email: " a@b.com " });
    expect(withEmail.email).toBe("a@b.com");
  });

  it("records a reason even when none was given", () => {
    expect(mintProvisionalClient({ ...base, reason: "  " }).provisionalReason).toBe(
      "Not given",
    );
  });
});

describe("mintProvisionalTrainer", () => {
  it("carries pendingClaim so the person can claim it at first sign-in", () => {
    // Without this they sign in and get a document they cannot write —
    // exactly the Kaizen Roster failure the trainer-identity round fixed.
    const t = mintProvisionalTrainer(base);
    expect(t.pendingClaim).toBe(true);
    expect(t.provisional).toBe(true);
  });

  it("derives initials when none are given", () => {
    expect(mintProvisionalTrainer(base).initials).toBe("LA");
    expect(mintProvisionalTrainer({ ...base, initials: "lj" }).initials).toBe("lj");
  });

  it("defaults to the ordinary trainer role, not something privileged", () => {
    expect(mintProvisionalTrainer(base).role).toBe("LifeTransformer");
  });

  it("starts unlinked from Mindbody", () => {
    const t = mintProvisionalTrainer(base);
    expect(t.mindbodyLinked).toBe(false);
    expect(t.mindbodyStaffId).toBeUndefined();
  });

  it("gives access to the studio it was created at", () => {
    const t = mintProvisionalTrainer(base);
    expect(t.primaryHomeStudioId).toBe("solon");
    expect(t.accessibleStudioIds).toEqual(["solon"]);
  });
});

describe("recognising them", () => {
  it("a merged record stops being provisional", () => {
    const merged = { provisional: true, supersededById: "real-1" };
    expect(isProvisional(merged)).toBe(false);
    expect(isSuperseded(merged)).toBe(true);
  });

  it("reads the trainer tombstone too, not just the client one", () => {
    // Trainers were already tombstoned as supersededByUid by the
    // trainer-identity round; a claimed placeholder and a merged temporary
    // profile are the same event, so both keys mean "no longer the person".
    const trainer = { provisional: true, supersededByUid: "uid-1" };
    expect(isSuperseded(trainer)).toBe(true);
    expect(isProvisional(trainer)).toBe(false);
  });

  it("a plain record is neither", () => {
    expect(isProvisional({})).toBe(false);
    expect(isSuperseded({})).toBe(false);
  });

  it("filters merged records out of a list", () => {
    const list = [
      { id: "a", provisional: true },
      { id: "b", provisional: true, supersededById: "real" },
      { id: "c" },
    ] as any[];
    expect(withoutSuperseded(list).map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("counts only the ones still waiting", () => {
    expect(
      provisionalCount([
        { provisional: true },
        { provisional: true, supersededById: "x" },
        {},
      ]),
    ).toBe(1);
  });
});

describe("provisionalAgeDays", () => {
  it("counts whole days since it was minted", () => {
    // The failure mode is drift, not a crash: a studio mints forty temporary
    // clients, gets its Mindbody account a week later, and nobody remembers.
    expect(
      provisionalAgeDays(
        { provisionalSince: "2026-09-01T14:00:00Z" },
        new Date("2026-09-08T14:00:00Z"),
      ),
    ).toBe(7);
  });

  it("is 0 on the day it was made, never negative", () => {
    expect(
      provisionalAgeDays(
        { provisionalSince: "2026-09-08T20:00:00Z" },
        new Date("2026-09-08T14:00:00Z"),
      ),
    ).toBe(0);
  });

  it("is null when the record has no timestamp", () => {
    expect(provisionalAgeDays({})).toBeNull();
    expect(provisionalAgeDays({ provisionalSince: "not a date" })).toBeNull();
  });
});
