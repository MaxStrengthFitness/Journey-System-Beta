import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  setDoc,
  getDoc,
  doc,
  collection,
  getDocs,
  addDoc,
  updateDoc,
} from "firebase/firestore";
import { describe, it, beforeAll, afterAll, beforeEach, expect } from "vitest";
import * as fs from "fs";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  // Initialize testing environment
  const rules = fs.readFileSync("firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: "demo-ai-studio",
    firestore: {
      rules,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  // Setup standard base data
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "studios", "studioA"), { name: "Studio A" });
    await setDoc(doc(db, "studios", "studioB"), { name: "Studio B" });

    // Trainer A (Studio A)
    await setDoc(doc(db, "trainers", "trainerA"), {
      fullName: "Trainer A",
      initials: "TA",
      role: "LifeTransformer",
      primaryHomeStudioId: "studioA",
      accessibleStudioIds: ["studioA"],
    });

    // Trainer A's Secret
    await setDoc(doc(db, "trainers", "trainerA", "secrets", "account"), {
      pinHash: "xyz",
    });

    // Trainer B (Studio B)
    await setDoc(doc(db, "trainers", "trainerB"), {
      fullName: "Trainer B",
      initials: "TB",
      role: "LifeTransformer",
      primaryHomeStudioId: "studioB",
      accessibleStudioIds: ["studioB"],
    });

    // StudioOwner A (Studio A)
    await setDoc(doc(db, "trainers", "ownerA"), {
      fullName: "Owner A",
      initials: "OA",
      role: "StudioOwner",
      primaryHomeStudioId: "studioA",
      accessibleStudioIds: ["studioA"],
    });

    // Session in Studio A
    await setDoc(doc(db, "sessions", "sessionA"), {
      hostedAtStudioId: "studioA",
      clientId: "clientA",
    });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Firestore Security Rules", () => {
  // (a) regular Trainer getDocs(collection('trainers')) SUCCEEDS
  it("allows regular Trainer to read trainers collection", async () => {
    const trainerContext = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = trainerContext.firestore();
    const query = getDocs(collection(db, "trainers"));
    await assertSucceeds(query);
  });

  // (b) cross-studio session read FAILS
  it("denies cross-studio session read", async () => {
    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, "sessions", "sessionA"));
    await assertFails(p);
  });

  // (c) cross-studio session create FAILS
  it("denies cross-studio session create", async () => {
    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = setDoc(doc(db, "sessions", "sessionA_new"), {
      hostedAtStudioId: "studioA",
      clientId: "clientA",
    });
    await assertFails(p);
  });

  // (d) same-studio session read SUCCEEDS
  it("allows same-studio session read", async () => {
    const trainerContext = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, "sessions", "sessionA"));
    await assertSucceeds(p);
  });

  // (e) trainer-B reading trainers/trainer-A/secrets/account FAILS
  it("denies trainer reading another trainers secret account", async () => {
    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, "trainers", "trainerA", "secrets", "account"));
    await assertFails(p);
  });

  // (f) unauthenticated access_requests create SUCCEEDS with {fullName,email,status:'Pending'} and FAILS when email is missing
  it("allows unauthenticated access_requests create with valid fields", async () => {
    const unauthContext = testEnv.unauthenticatedContext();
    const db = unauthContext.firestore();
    const p = addDoc(collection(db, "access_requests"), {
      fullName: "Test User",
      email: "test@example.com",
      status: "Pending",
    });
    await assertSucceeds(p);
  });

  it("denies unauthenticated access_requests create when email is missing", async () => {
    const unauthContext = testEnv.unauthenticatedContext();
    const db = unauthContext.firestore();
    const p = addDoc(collection(db, "access_requests"), {
      fullName: "Test User",
      status: "Pending",
    });
    await assertFails(p);
  });

  it("allows a StudioOwner of studioA to read trainers/trainerA/secrets/account", async () => {
    const ownerContext = testEnv.authenticatedContext("ownerA", {
      email: "ownera@test.com",
    });
    const db = ownerContext.firestore();
    const p = getDoc(doc(db, "trainers", "trainerA", "secrets", "account"));
    await assertSucceeds(p);
  });

  it("denies trainerB from updating trainerA with privilege escalation", async () => {
    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = updateDoc(doc(db, "trainers", "trainerA"), {
      pinHash: "",
      role: "Founder",
    });
    await assertFails(p);
  });

  it("denies trainer creation with a non-empty pinHash on the main doc", async () => {
    const ownerContext = testEnv.authenticatedContext("ownerA", {
      email: "ownera@test.com",
    });
    const db = ownerContext.firestore();
    const p = setDoc(doc(db, "trainers", "trainerC"), {
      fullName: "Trainer C",
      initials: "TC",
      primaryHomeStudioId: "studioA",
      role: "Trainer",
      pinHash: "some-hash",
    });
    await assertFails(p);
  });

  // Cross-studio client tests
  it("denies trainerB from reading clientA if no cross-studio approval exists", async () => {
    // Client A is in studioA
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "clientA"), {
        firstName: "Client",
        lastName: "A",
        isActive: true,
        remainingSessions: 10,
        homeStudioId: "studioA",
      });
    });

    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, "clients", "clientA"));
    await assertFails(p);
  });

  it("allows trainerB from reading clientA if trainerB's primary studio is in clientA's approved list", async () => {
    // Client A has studioB in approved list
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "clientA"), {
        firstName: "Client",
        lastName: "A",
        isActive: true,
        remainingSessions: 10,
        homeStudioId: "studioA",
        approvedCrossTrainStudioIds: ["studioB"],
      });
    });

    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = getDoc(doc(db, "clients", "clientA"));
    await assertSucceeds(p);
  });

  it("denies trainerB from updating clientA even if trainerB's primary studio is in clientA's approved list", async () => {
    // Client A has studioB in approved list
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "clientA"), {
        firstName: "Client",
        lastName: "A",
        isActive: true,
        remainingSessions: 10,
        homeStudioId: "studioA",
        approvedCrossTrainStudioIds: ["studioB"],
      });
    });

    const trainerContext = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    const db = trainerContext.firestore();
    const p = updateDoc(doc(db, "clients", "clientA"), {
      firstName: "Updated Name",
    });
    await assertFails(p);
  });
  // ── STUDIO MACHINE NOTES (Catalog Redesign, Sep 2026) ─────────────────
  //
  // These exist because the Catalog wrote its "Studio Notes" box to
  // machines/{machineId} — the GLOBAL catalog document every studio reads —
  // with no studioId in the write at all. The tests that matter are that a
  // trainer CAN write their own studio's notes (or the feature is useless)
  // and that the global catalog stays closed to them (or the leak is back).

  it("allows a trainer to write their own studio's machine notes", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = ctx.firestore();
    await assertSucceeds(
      setDoc(doc(db, "studios", "studioA", "machineNotes", "m-hip-abd"), {
        studioId: "studioA",
        machineId: "m-hip-abd",
        notes: "Left thigh pad sticks — pull it apart before the client sits.",
      }),
    );
  });

  it("keeps one studio's machine notes out of the global catalog doc", async () => {
    // The exact write the old handleSaveTip made.
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = ctx.firestore();
    await assertFails(
      setDoc(doc(db, "machines", "m-hip-abd"), {
        trainerTips: "Left thigh pad sticks",
      }),
    );
  });

  it("denies a trainer overriding the roster, which carries safety content", async () => {
    // Why machine notes are a sibling collection rather than a field on the
    // roster entry: a roster entry's `overrides` can rewrite clinicalWarnings.
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = ctx.firestore();
    await assertFails(
      setDoc(doc(db, "studios", "studioA", "roster", "m-hip-abd"), {
        source: "catalog",
        basedOn: "m-hip-abd",
        overrides: { clinicalWarnings: [] },
      }),
    );
  });

  // ── STUDIO TASKS (Studio To-Do, Sep 2026) ────────────────────────────
  //
  // The split that matters: authoring the checklist is a management act,
  // completing an item is the trainer's job. If either half is wrong the
  // feature is either useless or unsafe.

  it("allows a trainer to complete a task instance", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = ctx.firestore();
    await assertSucceeds(
      setDoc(
        doc(db, "studios", "studioA", "taskInstances", "wipe__2026-09-04__am__m-ext"),
        {
          studioId: "studioA",
          templateId: "wipe",
          localDate: "2026-09-04",
          shift: "am",
          machineId: "m-ext",
          status: "done",
          title: "Wipe down",
          category: "cleaning",
          kind: "machine",
        },
      ),
    );
  });

  it("denies a trainer authoring a task template", async () => {
    // Templates set the standard the floor is held to.
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = ctx.firestore();
    await assertFails(
      setDoc(doc(db, "studios", "studioA", "taskTemplates", "wipe"), {
        studioId: "studioA",
        title: "Wipe down",
        kind: "machine",
        category: "cleaning",
        target: { kind: "machine", machineIds: "all" },
        recurrence: { type: "daily" },
        active: true,
      }),
    );
  });

  it("allows a studio owner to author a task template", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", {
      email: "ownera@test.com",
    });
    const db = ctx.firestore();
    await assertSucceeds(
      setDoc(doc(db, "studios", "studioA", "taskTemplates", "wipe"), {
        studioId: "studioA",
        title: "Wipe down",
        kind: "machine",
        category: "cleaning",
        target: { kind: "machine", machineIds: "all" },
        recurrence: { type: "daily" },
        active: true,
      }),
    );
  });

  it("denies a trainer deleting task history", async () => {
    // A wrong tick is re-opened, not erased — the audit trail survives.
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    const db = ctx.firestore();
    await assertFails(
      deleteDoc(
        doc(db, "studios", "studioA", "taskInstances", "wipe__2026-09-04__am"),
      ),
    );
  });

  // ── SELF-CREATED TRAINER DOCUMENTS (Admin Overhaul, Sep 2026) ─────────
  //
  // `allow create` has a bootstrap clause letting a signed-in person own
  // trainers/{their uid} — the claim at first sign-in depends on it. But
  // isValidTrainer placed no constraint on `role`, so any authenticated
  // Google account could create a trainer document for ITSELF with role
  // "Admin" and become a system administrator. The UPDATE rule has always
  // refused that escalation; create never did.
  //
  // These four are the whole contract: the escalation is closed, and the two
  // legitimate paths through that same clause still work.

  it("denies a signed-in account making itself an Admin", async () => {
    const ctx = testEnv.authenticatedContext("newguy", {
      email: "newguy@test.com",
    });
    const db = ctx.firestore();
    await assertFails(
      setDoc(doc(db, "trainers", "newguy"), {
        fullName: "New Guy",
        initials: "NG",
        role: "Admin",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      }),
    );
  });

  it("denies a signed-in account making itself a Founder or Overseer", async () => {
    const db = testEnv
      .authenticatedContext("newguy", { email: "newguy@test.com" })
      .firestore();
    const base = {
      fullName: "New Guy",
      initials: "NG",
      primaryHomeStudioId: "studioA",
      accessibleStudioIds: ["studioA"],
    };
    await assertFails(
      setDoc(doc(db, "trainers", "newguy"), { ...base, role: "Founder" }),
    );
    await assertFails(
      setDoc(doc(db, "trainers", "newguy"), { ...base, role: "Overseer" }),
    );
  });

  it("still allows a signed-in account to create its own ordinary profile", async () => {
    // This is the claim-at-first-sign-in path. Break it and an admin-created
    // placeholder can never become a real account.
    const ctx = testEnv.authenticatedContext("newguy", {
      email: "newguy@test.com",
    });
    const db = ctx.firestore();
    await assertSucceeds(
      setDoc(doc(db, "trainers", "newguy"), {
        fullName: "New Guy",
        initials: "NG",
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      }),
    );
  });

  it("still allows the owner's own bootstrap to mint an Admin profile", async () => {
    // Exempted by email, mirroring the hard-coded bootstrap in
    // useAuthInitialization.ts. Not new surface — the same surface, written
    // down in the one place that can actually enforce it.
    const ctx = testEnv.authenticatedContext("ownerBootstrap", {
      email: "jurgensaj@gmail.com",
    });
    const db = ctx.firestore();
    await assertSucceeds(
      setDoc(doc(db, "trainers", "ownerBootstrap"), {
        fullName: "System Admin",
        initials: "SA",
        role: "Admin",
        primaryHomeStudioId: "system",
        accessibleStudioIds: ["system"],
      }),
    );
  });

  // ── EQUIPMENT UPKEEP LOG (Admin Overhaul, Sep 2026) ───────────────────
  //
  // Any trainer may log work — the person who cleans the machine is the
  // person on the floor. Nobody may rewrite an entry afterwards: an
  // accountability log that can be edited is not one.

  it("allows a trainer to log equipment upkeep", async () => {
    const db = testEnv
      .authenticatedContext("trainerA", { email: "trainera@test.com" })
      .firestore();
    await assertSucceeds(
      setDoc(doc(db, "studios", "studioA", "upkeepLog", "u1"), {
        machineId: "m-ext",
        kind: "deep-clean",
        at: "2026-09-06T14:00:00.000Z",
        byId: "trainerA",
        byName: "Trainer A",
      }),
    );
  });

  it("denies rewriting an upkeep entry after the fact", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "studios", "studioA", "upkeepLog", "u1"),
        { machineId: "m-ext", kind: "clean", at: "2026-09-06T14:00:00.000Z" },
      );
    });
    const db = testEnv
      .authenticatedContext("trainerA", { email: "trainera@test.com" })
      .firestore();
    await assertFails(
      updateDoc(doc(db, "studios", "studioA", "upkeepLog", "u1"), {
        kind: "deep-clean",
      }),
    );
  });

  it("denies a trainer deleting an upkeep entry, but allows a studio owner", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "studios", "studioA", "upkeepLog", "u1"),
        { machineId: "m-ext", kind: "clean", at: "2026-09-06T14:00:00.000Z" },
      );
    });
    const trainerDb = testEnv
      .authenticatedContext("trainerA", { email: "trainera@test.com" })
      .firestore();
    await assertFails(
      deleteDoc(doc(trainerDb, "studios", "studioA", "upkeepLog", "u1")),
    );

    const ownerDb = testEnv
      .authenticatedContext("ownerA", { email: "ownera@test.com" })
      .firestore();
    await assertSucceeds(
      deleteDoc(doc(ownerDb, "studios", "studioA", "upkeepLog", "u1")),
    );
  });

  // ── BUG REPORTS (Admin Overhaul R2 Phase 3) ──────────────────────
  //
  // useMyFeedback queries bug_reports filtered to the signed-in user so a
  // trainer can see what became of their reports. The read rule was
  // superadmin-only, so that listener was denied for everyone but the owner.
  it("lets a trainer read their own bug report", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "bug_reports", "mine"), {
        userId: "trainerA",
        description: "Timer froze",
        status: "open",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    await assertSucceeds(getDoc(doc(ctx.firestore(), "bug_reports", "mine")));
  });

  it("denies a trainer reading somebody else's bug report", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "bug_reports", "theirs"), {
        userId: "someone-else",
        description: "Timer froze",
        status: "open",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    await assertFails(getDoc(doc(ctx.firestore(), "bug_reports", "theirs")));
  });

  it("denies a trainer changing the status on their own report", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "bug_reports", "mine"), {
        userId: "trainerA",
        description: "Timer froze",
        status: "open",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    await assertFails(
      updateDoc(doc(ctx.firestore(), "bug_reports", "mine"), {
        status: "fixed",
      }),
    );
  });

  // ── CROSS-STUDIO TENANCY (Sep 2026) ──────────────────────────────────
  //
  // clients and sessions were both `allow read: if isAuthenticated()`. These
  // cover the policy that replaced it: your own studios, plus a client who
  // has approved cross-training at one of them; and a session you may read
  // if you may read its client, whatever studio it was hosted at.

  it("lets a trainer read a client at their own studio", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "mine"), {
        firstName: "Home",
        lastName: "Client",
        isActive: true,
        remainingSessions: 5,
        homeStudioId: "studioA",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerA", {
      email: "trainera@test.com",
    });
    await assertSucceeds(getDoc(doc(ctx.firestore(), "clients", "mine")));
  });

  it("denies a trainer editing a client at another studio", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "theirs"), {
        firstName: "Their",
        lastName: "Client",
        isActive: true,
        remainingSessions: 5,
        homeStudioId: "studioA",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    await assertFails(
      updateDoc(doc(ctx.firestore(), "clients", "theirs"), {
        firstName: "Edited",
        lastName: "Client",
        isActive: true,
        remainingSessions: 5,
        homeStudioId: "studioA",
      }),
    );
  });

  it("lets a trainer read a session whose client they can read, at another studio", async () => {
    // The point of scoping sessions by CLIENT rather than by studio: a
    // cross-train client's history has to stay whole.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "crossClient"), {
        firstName: "Cross",
        lastName: "Client",
        isActive: true,
        remainingSessions: 5,
        homeStudioId: "studioA",
        approvedCrossTrainStudioIds: ["studioB"],
      });
      await setDoc(doc(db, "sessions", "sessionAtA"), {
        hostedAtStudioId: "studioA",
        clientId: "crossClient",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    await assertSucceeds(getDoc(doc(ctx.firestore(), "sessions", "sessionAtA")));
  });

  it("denies a session whose client they cannot read", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "privateClient"), {
        firstName: "Private",
        lastName: "Client",
        isActive: true,
        remainingSessions: 5,
        homeStudioId: "studioA",
      });
      await setDoc(doc(db, "sessions", "privateSession"), {
        hostedAtStudioId: "studioA",
        clientId: "privateClient",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    await assertFails(
      getDoc(doc(ctx.firestore(), "sessions", "privateSession")),
    );
  });

  it("lets a trainer read their own session after moving studios", async () => {
    // trainerB coached this at studioA and no longer works there.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "sessions", "myOldSession"), {
        hostedAtStudioId: "studioA",
        clientId: "someoneElse",
        trainerId: "trainerB",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    await assertSucceeds(getDoc(doc(ctx.firestore(), "sessions", "myOldSession")));
  });

  it("does not fall over on a legacy session with no studio and no client", async () => {
    // Imports wrote sessions with hostedAtStudioId "" and no clientId. The
    // rule must DENY these rather than erroring on a malformed document path.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "sessions", "legacySession"), {
        hostedAtStudioId: "",
        clientId: "",
      });
    });
    const ctx = testEnv.authenticatedContext("trainerB", {
      email: "trainerb@test.com",
    });
    await assertFails(getDoc(doc(ctx.firestore(), "sessions", "legacySession")));
  });

  it("lets an owner read across their studio", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", {
      email: "ownera@test.com",
    });
    await assertSucceeds(getDoc(doc(ctx.firestore(), "sessions", "sessionA")));
  });
});
