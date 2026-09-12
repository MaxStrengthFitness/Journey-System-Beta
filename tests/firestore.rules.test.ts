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
  writeBatch,
  serverTimestamp,
  increment,
  collectionGroup,
  query,
  where,
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

  // ── RENEWALS: studio settings (Renewals round, Sep 2026) ──────────────
  //
  // studios/{s}/config/renewals: the studio's leaders write it, everyone who
  // works there reads it, nobody else sees it. config/renewalsSeen belongs to
  // the nightly job (Admin SDK) and cannot be written from the app.

  const validRenewalSettings = (uid: string) => ({
    conversationAtSessionsLeft: 12,
    breakDays: 14,
    payAsYouGoCountsAs: "retained",
    packages: [{ key: "committed", label: "Committed", sessions: 96, payments: 12 }],
    updatedBy: uid,
  });

  it("lets a studio's owner save its renewal settings", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" });
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), "studios", "studioA", "config", "renewals"), validRenewalSettings("ownerA")),
    );
  });

  it("lets a trainer read their own studio's renewal settings but not change them", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "config", "renewals"), validRenewalSettings("ownerA"));
    });
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    const ref = doc(ctx.firestore(), "studios", "studioA", "config", "renewals");
    await assertSucceeds(getDoc(ref));
    await assertFails(setDoc(ref, validRenewalSettings("trainerA")));
  });

  it("keeps one studio's renewal settings from another studio's trainers", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "config", "renewals"), validRenewalSettings("ownerA"));
    });
    const ctx = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" });
    await assertFails(getDoc(doc(ctx.firestore(), "studios", "studioA", "config", "renewals")));
  });

  it("refuses settings outside their ranges, or signed by someone else", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" });
    const ref = doc(ctx.firestore(), "studios", "studioA", "config", "renewals");
    await assertFails(setDoc(ref, { ...validRenewalSettings("ownerA"), breakDays: 3 }));
    await assertFails(setDoc(ref, validRenewalSettings("trainerA")));
    await assertFails(setDoc(ref, { ...validRenewalSettings("ownerA"), surprise: true }));
  });

  it("keeps the nightly job's names list read-only from the app", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" });
    await assertFails(
      setDoc(doc(ctx.firestore(), "studios", "studioA", "config", "renewalsSeen"), { names: {} }),
    );
  });

  // ── RENEWALS: the snapshot is the nightly job's alone ─────────────────

  const renewalClient = {
    firstName: "Renewal",
    lastName: "Client",
    isActive: true,
    remainingSessions: 0,
    homeStudioId: "studioA",
    renewal: { situation: "on-track", sessionsLeft: 9 },
  };

  it("lets a trainer edit their client without touching the renewal snapshot", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "renewalClient"), renewalClient);
    });
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    await assertSucceeds(updateDoc(doc(ctx.firestore(), "clients", "renewalClient"), { globalNotes: "Prefers mornings" }));
  });

  it("denies anyone in the app rewriting the renewal snapshot", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clients", "renewalClient"), renewalClient);
    });
    for (const uid of ["trainerA", "ownerA"]) {
      const ctx = testEnv.authenticatedContext(uid, { email: `${uid}@test.com` });
      await assertFails(
        updateDoc(doc(ctx.firestore(), "clients", "renewalClient"), { renewal: { situation: "lapsed" } }),
      );
    }
  });

  it("denies creating a client that arrives with a renewal snapshot", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    await assertFails(setDoc(doc(ctx.firestore(), "clients", "newWithRenewal"), renewalClient));
  });

  // ── RENEWALS: conversations and cycles ─────────────────────────────────
  //
  // Trainers at the studio log conversations (a touch, plus the cycle's
  // latest-of-each fields); only leaders set stage, lead and outcome.

  const touch = (uid: string) => ({
    clientId: "c1",
    authorId: uid,
    authorName: "Trainer A",
    at: serverTimestamp(),
    leaning: "unsure",
    concerns: ["price"],
    interestedIn: null,
    note: "Worried about cost",
    needsLeader: true,
  });

  const cyclePatch = (uid: string) => ({
    clientId: "c1",
    clientName: "Client One",
    cycleKey: "9001",
    packageKey: "committed",
    chargeDate: "2026-11-14",
    latestLeaning: "unsure",
    latestConcerns: ["price"],
    latestInterestedIn: null,
    needsLeader: true,
    lastTouchBy: uid,
    lastTouchByName: "Trainer A",
    lastTouchAt: serverTimestamp(),
    touchCount: increment(1),
  });

  it("lets a trainer log a renewal conversation at their studio", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    const db = ctx.firestore();
    const cycle = doc(db, "studios", "studioA", "renewals", "9001");
    const batch = writeBatch(db);
    batch.set(doc(collection(cycle, "touches")), touch("trainerA"));
    batch.set(cycle, cyclePatch("trainerA"), { merge: true });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDoc(cycle));
  });

  it("keeps another studio's trainers out of its renewals", async () => {
    const ctx = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" });
    const db = ctx.firestore();
    const cycle = doc(db, "studios", "studioA", "renewals", "9001");
    await assertFails(setDoc(cycle, cyclePatch("trainerB"), { merge: true }));
    await assertFails(getDoc(cycle));
  });

  it("denies a trainer setting the stage or the outcome", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    const cycle = doc(ctx.firestore(), "studios", "studioA", "renewals", "9001");
    await assertFails(setDoc(cycle, { ...cyclePatch("trainerA"), stage: "decided" }, { merge: true }));
    await assertFails(setDoc(cycle, { ...cyclePatch("trainerA"), outcome: "renewed" }, { merge: true }));
  });

  it("denies a backdated conversation, or a count bumped by more than one", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    const db = ctx.firestore();
    const cycle = doc(db, "studios", "studioA", "renewals", "9001");
    await assertFails(setDoc(doc(collection(cycle, "touches")), { ...touch("trainerA"), at: new Date("2026-01-01") }));
    await assertFails(setDoc(cycle, { ...cyclePatch("trainerA"), touchCount: increment(5) }, { merge: true }));
    await assertFails(setDoc(cycle, { ...cyclePatch("trainerA"), lastTouchAt: new Date("2026-01-01") }, { merge: true }));
  });

  it("denies a conversation signed with someone else's name", async () => {
    const ctx = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" });
    const cycle = doc(ctx.firestore(), "studios", "studioA", "renewals", "9001");
    await assertFails(setDoc(doc(collection(cycle, "touches")), touch("ownerA")));
    await assertFails(setDoc(cycle, cyclePatch("ownerA"), { merge: true }));
  });

  it("lets the studio's owner set stage and outcome", async () => {
    const ctx = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" });
    const cycle = doc(ctx.firestore(), "studios", "studioA", "renewals", "9001");
    await assertSucceeds(
      setDoc(
        cycle,
        { clientId: "c1", clientName: "Client One", cycleKey: "9001", stage: "decided", outcome: "upgraded", updatedBy: "ownerA" },
        { merge: true },
      ),
    );
  });

  it("lets the owner record an outcome with its closing day, even on a cycle the nightly job wrote", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      // Every field the job writes (server/renewals-job.ts).
      await setDoc(doc(context.firestore(), "studios", "studioA", "renewals", "9001"), {
        clientId: "c1",
        clientName: "Client One",
        cycleKey: "9001",
        packageKey: "committed",
        outcome: "lost",
        outcomeBy: "job",
        outcomeAt: new Date(),
        nextCycleKey: null,
        nextPackageKey: null,
        closedOn: "2026-07-20",
        primaryTrainerId: "trainerA",
      });
    });
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const cycle = doc(owner, "studios", "studioA", "renewals", "9001");
    await assertSucceeds(
      setDoc(
        cycle,
        { outcome: "pay-as-you-go", outcomeBy: "ownerA", closedOn: "2026-07-20", nextCycleKey: null, nextPackageKey: null, updatedBy: "ownerA" },
        { merge: true },
      ),
    );
    await assertFails(setDoc(cycle, { closedOn: "last July" }, { merge: true }));
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "renewals", "9001"), { closedOn: "2026-08-01" }, { merge: true }));
  });

  it("never lets a conversation be edited, and lets only a leader delete one", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "renewals", "9001", "touches", "t1"), {
        ...touch("trainerA"),
        at: new Date(),
      });
    });
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const path = ["studios", "studioA", "renewals", "9001", "touches", "t1"] as const;
    await assertFails(updateDoc(doc(trainer, ...path), { note: "rewritten" }));
    await assertFails(deleteDoc(doc(trainer, ...path)));
    await assertSucceeds(deleteDoc(doc(owner, ...path)));
  });

  // ── INBODY SCANS: health data, scoped like sessions ─────────────────────
  //
  // Every scan write is a batch with the client's inbodySummary, so each test
  // writes both halves the way the app does.

  const inbodyClient = {
    firstName: "InBody",
    lastName: "Client",
    isActive: true,
    remainingSessions: 0,
    homeStudioId: "studioA",
  };

  const scanData = (uid: string) => ({
    testedAt: "2026-09-02",
    device: "InBody 270S",
    source: "manual",
    studioId: "studioA",
    enteredBy: uid,
    enteredByName: "Trainer A",
    createdAt: serverTimestamp(),
    weightLb: 172.4,
    skeletalMuscleMassLb: 68.1,
    bodyFatMassLb: 53.8,
    percentBodyFat: 31.2,
    bmi: 27.8,
    totalBodyWaterLb: null,
    dryLeanMassLb: null,
    fatFreeMassLb: null,
    basalMetabolicRateKcal: null,
    smi: null,
    phaseAngle: null,
    segmentalLean: null,
  });

  const summary = { scanCount: 1, firstTestedAt: "2026-09-02", latestTestedAt: "2026-09-02" };

  async function seedInBody(withScan = false) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "inbodyClient"), inbodyClient);
      if (withScan) {
        await setDoc(doc(db, "clients", "inbodyClient", "inbodyScans", "s1"), {
          ...scanData("trainerA"),
          createdAt: new Date(),
        });
      }
      // A second trainer at studio A, who did not enter the scan.
      await setDoc(doc(db, "trainers", "trainerA2"), {
        fullName: "Trainer A2",
        initials: "A2",
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
    });
  }

  it("lets a trainer at the client's studio add a scan and its summary, and read them", async () => {
    await seedInBody();
    const db = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, "clients", "inbodyClient", "inbodyScans", "new1"), scanData("trainerA"));
    batch.update(doc(db, "clients", "inbodyClient"), { inbodySummary: summary, weight: "172" });
    await assertSucceeds(batch.commit());
    await assertSucceeds(getDocs(collection(db, "clients", "inbodyClient", "inbodyScans")));
  });

  it("keeps another studio's trainers from reading or adding scans", async () => {
    await seedInBody(true);
    const db = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(doc(db, "clients", "inbodyClient", "inbodyScans", "s1")));
    await assertFails(getDocs(collection(db, "clients", "inbodyClient", "inbodyScans")));
    await assertFails(setDoc(doc(db, "clients", "inbodyClient", "inbodyScans", "new1"), scanData("trainerB")));
  });

  it("denies a scan signed with someone else's name, or with impossible numbers", async () => {
    await seedInBody();
    const db = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(db, "clients", "inbodyClient", "inbodyScans", "new1");
    await assertFails(setDoc(ref, scanData("ownerA")));
    await assertFails(setDoc(ref, { ...scanData("trainerA"), skeletalMuscleMassLb: 130 }));
    await assertFails(setDoc(ref, { ...scanData("trainerA"), visceralFat: 9 }));
  });

  it("lets a correction be signed, but never changes who entered a scan", async () => {
    await seedInBody(true);
    const db = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    const ref = doc(db, "clients", "inbodyClient", "inbodyScans", "s1");
    await assertSucceeds(
      updateDoc(ref, { bodyFatMassLb: 53.6, updatedBy: "trainerA2", updatedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(ref, { enteredBy: "trainerA2", updatedBy: "trainerA2", updatedAt: serverTimestamp() }),
    );
  });

  it("lets only whoever entered a scan, or a leader, remove it", async () => {
    await seedInBody(true);
    const path = ["clients", "inbodyClient", "inbodyScans", "s1"] as const;
    const other = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    const author = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(deleteDoc(doc(other, ...path)));
    await assertSucceeds(deleteDoc(doc(author, ...path)));
  });

  it("lets the studio's owner remove a scan someone else entered", async () => {
    await seedInBody(true);
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(owner, "clients", "inbodyClient", "inbodyScans", "s1")));
  });

  // ── PLANNER NOTES: private by path; a shared copy reads like InBody ─────
  //
  // Round: Learning + Planner, Sep 2026. A share is a batch: the private
  // note (sharedWith set) and the copy on the client's record, together.

  const noteData = (over: Record<string, unknown> = {}) => ({
    title: "Knee plan",
    body: "No deep flexion on the leg press until the physio clears it.",
    kind: "injury",
    folderId: null,
    clientIds: ["notesClient"],
    clientNames: { notesClient: "Notes Client" },
    pinned: false,
    sharedWith: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...over,
  });

  const sharedData = (uid: string, over: Record<string, unknown> = {}) => ({
    clientId: "notesClient",
    title: "Knee plan",
    body: "No deep flexion on the leg press until the physio clears it.",
    kind: "injury",
    authorId: uid,
    authorName: "Trainer A",
    updatedAt: serverTimestamp(),
    ...over,
  });

  async function seedNotes() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "clients", "notesClient"), {
        firstName: "Notes",
        lastName: "Client",
        isActive: true,
        remainingSessions: 0,
        homeStudioId: "studioA",
      });
      await setDoc(doc(db, "trainers", "trainerA2"), {
        fullName: "Trainer A2",
        initials: "A2",
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
      const at = new Date();
      // n1: shared, with its copy on the record.
      await setDoc(doc(db, "trainers", "trainerA", "notes", "n1"), {
        ...noteData({ sharedWith: "notesClient" }),
        createdAt: at,
        updatedAt: at,
      });
      await setDoc(doc(db, "clients", "notesClient", "sharedNotes", "n1"), { ...sharedData("trainerA"), updatedAt: at });
      // n2: says it is shared, but a leader already took the copy off.
      await setDoc(doc(db, "trainers", "trainerA", "notes", "n2"), {
        ...noteData({ sharedWith: "notesClient" }),
        createdAt: at,
        updatedAt: at,
      });
    });
  }

  it("keeps a trainer's notes and folders to that trainer alone", async () => {
    await seedNotes();
    const mine = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(mine, "trainers", "trainerA", "notes", "new1"), noteData()));
    await assertSucceeds(
      setDoc(doc(mine, "trainers", "trainerA", "noteFolders", "f1"), {
        name: "Rehab",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(getDocs(collection(mine, "trainers", "trainerA", "notes")));

    // Not a colleague at the same studio, not its owner, not another studio.
    for (const [uid, email] of [
      ["trainerA2", "trainera2@test.com"],
      ["ownerA", "ownera@test.com"],
      ["trainerB", "trainerb@test.com"],
    ]) {
      const other = testEnv.authenticatedContext(uid, { email }).firestore();
      await assertFails(getDoc(doc(other, "trainers", "trainerA", "notes", "n1")));
      await assertFails(getDocs(collection(other, "trainers", "trainerA", "notes")));
      await assertFails(getDocs(collection(other, "trainers", "trainerA", "noteFolders")));
      await assertFails(setDoc(doc(other, "trainers", "trainerA", "notes", "planted"), noteData()));
    }
  });

  it("refuses a note the Planner could not read back", async () => {
    await seedNotes();
    const db = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(db, "trainers", "trainerA", "notes", "bad");
    await assertFails(setDoc(ref, noteData({ title: "" })));
    await assertFails(setDoc(ref, noteData({ kind: "diagnosis" })));
    await assertFails(setDoc(ref, noteData({ extra: "field" })));
    await assertFails(setDoc(ref, noteData({ clientIds: Array.from({ length: 11 }, (_, i) => `c${i}`) })));
    // Shared means about exactly that one client.
    await assertFails(setDoc(ref, noteData({ sharedWith: "notesClient", clientIds: ["notesClient", "other"] })));
    await assertFails(setDoc(ref, noteData({ sharedWith: "other" })));
  });

  it("shares a note onto the client's record in one batch, readable by the client's studio only", async () => {
    await seedNotes();
    const db = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, "trainers", "trainerA", "notes", "n3"), noteData({ sharedWith: "notesClient" }));
    batch.set(doc(db, "clients", "notesClient", "sharedNotes", "n3"), sharedData("trainerA"));
    await assertSucceeds(batch.commit());

    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertSucceeds(getDocs(collection(colleague, "clients", "notesClient", "sharedNotes")));
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDocs(collection(elsewhere, "clients", "notesClient", "sharedNotes")));
    await assertFails(getDoc(doc(elsewhere, "clients", "notesClient", "sharedNotes", "n1")));
  });

  it("won't put a note on a record in someone else's name, or from another studio", async () => {
    await seedNotes();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(setDoc(doc(a, "clients", "notesClient", "sharedNotes", "n4"), sharedData("trainerA2")));
    await assertFails(
      setDoc(doc(a, "clients", "notesClient", "sharedNotes", "n4"), sharedData("trainerA", { clientIds: ["x"] })),
    );
    const b = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(setDoc(doc(b, "clients", "notesClient", "sharedNotes", "n4"), sharedData("trainerB")));
  });

  it("lets only the author rewrite a shared note", async () => {
    await seedNotes();
    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertFails(
      setDoc(doc(colleague, "clients", "notesClient", "sharedNotes", "n1"), sharedData("trainerA2", { title: "Mine now" })),
    );
    const author = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(
      setDoc(doc(author, "clients", "notesClient", "sharedNotes", "n1"), sharedData("trainerA", { title: "Knee plan, week 3" })),
    );
  });

  it("lets the author unshare or delete even when a leader already took the copy off", async () => {
    await seedNotes();
    const db = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const batch = writeBatch(db);
    batch.delete(doc(db, "trainers", "trainerA", "notes", "n2"));
    batch.delete(doc(db, "clients", "notesClient", "sharedNotes", "n2"));
    await assertSucceeds(batch.commit());

    const unshare = writeBatch(db);
    unshare.set(doc(db, "trainers", "trainerA", "notes", "n1"), noteData({ sharedWith: null }));
    unshare.delete(doc(db, "clients", "notesClient", "sharedNotes", "n1"));
    await assertSucceeds(unshare.commit());
  });

  it("lets the studio's leaders take a shared note off the record, not other trainers", async () => {
    await seedNotes();
    const path = ["clients", "notesClient", "sharedNotes", "n1"] as const;
    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertFails(deleteDoc(doc(colleague, ...path)));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(owner, ...path)));
  });

  // ── THE MSF MACHINE DATABASE: studio content, sharing, and the lists ────
  //
  // Round: Learning + Planner, Sep 2026. Also closes the hole where any
  // signed-in trainer could write another studio's machine notes, upkeep
  // log, playbook and wiki.

  async function seedMachineDb() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "studios", "studioA", "roster", "sm-studioA-sled"), {
        machineId: "sm-studioA-sled",
        studioId: "studioA",
        source: "custom",
        status: "active",
        definition: { name: "Sled Push" },
      });
      await setDoc(doc(db, "studios", "studioA", "roster", "m-leg-press"), {
        machineId: "m-leg-press",
        studioId: "studioA",
        source: "catalog",
        basedOn: "m-leg-press",
        status: "active",
      });
      await setDoc(doc(db, "studios", "studioA", "playbook", "tipShared"), {
        studioId: "studioA",
        title: "Knees on the leg press",
        situation: "Knee pain at the bottom",
        worked: "Seat one notch back",
        machineIds: ["m-leg-press"],
        tags: [],
        authorId: "trainerA",
        authorName: "Trainer A",
        shared: true,
        sharedKeys: ["m-leg-press"],
        studioName: "Studio A",
      });
      await setDoc(doc(db, "studios", "studioA", "playbook", "tipPrivate"), {
        studioId: "studioA",
        title: "Not shared",
        situation: "",
        worked: "Stays here",
        machineIds: ["m-leg-press"],
        tags: [],
        authorId: "trainerA",
        authorName: "Trainer A",
      });
    });
  }

  it("keeps a studio's machine notes, upkeep, tips and notes to the people who work there", async () => {
    await seedMachineDb();
    const outsider = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(setDoc(doc(outsider, "studios", "studioA", "machineNotes", "m-leg-press"), { notes: "Mine now" }));
    await assertFails(setDoc(doc(outsider, "studios", "studioA", "upkeepLog", "u1"), { machineId: "m-leg-press", kind: "clean" }));
    await assertFails(
      setDoc(doc(outsider, "studios", "studioA", "playbook", "p1"), {
        title: "Planted",
        worked: "x",
        authorId: "trainerB",
      }),
    );
    await assertFails(
      setDoc(doc(outsider, "studios", "studioA", "wiki", "machine__m-leg-press"), {
        kind: "overlay",
        title: "Leg Press",
        authorId: "trainerB",
        blocks: [],
      }),
    );

    const insider = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(insider, "studios", "studioA", "machineNotes", "m-leg-press"), { notes: "Pad sticks" }));
    await assertSucceeds(setDoc(doc(insider, "studios", "studioA", "upkeepLog", "u1"), { machineId: "m-leg-press", kind: "clean" }));
    await assertSucceeds(
      setDoc(doc(insider, "studios", "studioA", "wiki", "machine__m-leg-press"), {
        kind: "overlay",
        title: "Leg Press",
        authorId: "trainerA",
        blocks: [{ kind: "para", text: "Two notches lower here." }],
        shared: true,
        sharedKeys: ["m-leg-press"],
        studioName: "Studio A",
      }),
    );
  });

  it("lets a studio's leaders list their own machine in the database, and nothing else", async () => {
    await seedMachineDb();
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(
      updateDoc(doc(owner, "studios", "studioA", "roster", "sm-studioA-sled"), { shared: true, sharedStudioName: "Studio A" }),
    );
    // An MSF machine is already in the database.
    await assertFails(updateDoc(doc(owner, "studios", "studioA", "roster", "m-leg-press"), { shared: true }));
    // A copy of another studio's machine is listed by its original.
    await assertFails(
      setDoc(doc(owner, "studios", "studioA", "roster", "sm-studioA-rope"), {
        machineId: "sm-studioA-rope",
        studioId: "studioA",
        source: "custom",
        status: "active",
        definition: { name: "Rope" },
        adoptedFrom: { studioId: "studioB", machineId: "sm-studioB-rope", studioName: "Studio B" },
        shared: true,
      }),
    );
    // Trainers do not decide what the studio publishes.
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(updateDoc(doc(trainer, "studios", "studioA", "roster", "sm-studioA-sled"), { shared: true }));
  });

  it("lists what studios shared to every trainer, and nothing they did not", async () => {
    await seedMachineDb();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "studios", "studioA", "roster", "sm-studioA-sled"), { shared: true });
    });
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertSucceeds(getDocs(query(collectionGroup(other, "roster"), where("shared", "==", true))));
    await assertFails(getDocs(collectionGroup(other, "roster")));
    await assertSucceeds(
      getDocs(
        query(
          collectionGroup(other, "playbook"),
          where("shared", "==", true),
          where("sharedKeys", "array-contains", "m-leg-press"),
        ),
      ),
    );
    await assertFails(getDocs(query(collectionGroup(other, "playbook"), where("sharedKeys", "array-contains", "m-leg-press"))));
    await assertSucceeds(getDocs(query(collectionGroup(other, "wiki"), where("shared", "==", true))));
  });

  it("checks the shape of the share fields, and lets a tip's author share it", async () => {
    await seedMachineDb();
    const author = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(author, "studios", "studioA", "playbook", "tipPrivate");
    await assertFails(updateDoc(ref, { shared: "yes" }));
    await assertFails(updateDoc(ref, { shared: true, sharedKeys: "m-leg-press" }));
    await assertSucceeds(updateDoc(ref, { shared: true, sharedKeys: ["m-leg-press"], studioName: "Studio A" }));
    // A colleague who did not write it cannot publish it.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "trainerA2"), {
        fullName: "Trainer A2",
        initials: "A2",
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
    });
    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertFails(updateDoc(doc(colleague, "studios", "studioA", "playbook", "tipShared"), { shared: false, sharedKeys: [] }));
  });

  // ── COMMENTS ON LEARNING PAGES: the studio's own, read and written there ─

  const commentData = (uid: string, over: Record<string, unknown> = {}) => ({
    studioId: "studioA",
    targetKey: "machine:m-leg-press",
    target: { kind: "machine", id: "m-leg-press", title: "Leg Press" },
    body: "Seat pin sticks again — @Trainer A2 can you look?",
    authorId: uid,
    authorName: "Trainer A",
    mentions: [{ id: "trainerA2", name: "Trainer A2" }],
    createdAt: serverTimestamp(),
    ...over,
  });

  async function seedComments() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "trainers", "trainerA2"), {
        fullName: "Trainer A2",
        initials: "A2",
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
      await setDoc(doc(db, "studios", "studioA", "comments", "c1"), { ...commentData("trainerA"), createdAt: new Date() });
    });
  }

  it("lets the people at a studio read and post its comments, and nobody else", async () => {
    await seedComments();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(a, "studios", "studioA", "comments", "c2"), commentData("trainerA")));
    await assertSucceeds(
      getDocs(query(collection(a, "studios", "studioA", "comments"), where("targetKey", "==", "machine:m-leg-press"))),
    );

    const b = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(doc(b, "studios", "studioA", "comments", "c1")));
    await assertFails(getDocs(collection(b, "studios", "studioA", "comments")));
    await assertFails(setDoc(doc(b, "studios", "studioA", "comments", "c3"), commentData("trainerB", { authorName: "B" })));
  });

  it("refuses a comment in someone else's name, with a back-dated time, or carrying a client", async () => {
    await seedComments();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(a, "studios", "studioA", "comments", "c4");
    await assertFails(setDoc(ref, commentData("trainerA2")));
    await assertFails(setDoc(ref, commentData("trainerA", { createdAt: new Date("2026-01-01") })));
    await assertFails(setDoc(ref, commentData("trainerA", { clientId: "notesClient" })));
    await assertFails(setDoc(ref, commentData("trainerA", { body: "" })));
  });

  it("lets only the author correct a comment, and only its words and tags", async () => {
    await seedComments();
    const path = ["studios", "studioA", "comments", "c1"] as const;
    const author = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(author, ...path), { body: "Fixed now.", mentions: [], editedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(author, ...path), { targetKey: "machine:m-other", editedAt: serverTimestamp() }));
    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertFails(updateDoc(doc(colleague, ...path), { body: "Not yours", editedAt: serverTimestamp() }));
  });

  it("lets the author or a studio leader take a comment down", async () => {
    await seedComments();
    const path = ["studios", "studioA", "comments", "c1"] as const;
    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertFails(deleteDoc(doc(colleague, ...path)));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(owner, ...path)));
  });

  // ── ANNOUNCEMENTS: posted by the people the app offers the composer to ──

  const announcement = (over: Record<string, unknown> = {}) => ({
    title: "New in Learning",
    shortContent: "Read the Leg Press card before Monday.",
    longContent: "",
    authorId: "adminX",
    authorName: "Admin X",
    studioId: "all",
    targetScope: "universal",
    targetId: "",
    isActive: true,
    priority: "low",
    readBy: [],
    learningLink: { kind: "academy-card", id: "card-leg-press", title: "Leg Press" },
    ...over,
  });

  async function seedAnnouncements() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "trainers", "adminX"), {
        fullName: "Admin X",
        initials: "AX",
        role: "Admin",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
      await setDoc(doc(db, "hub_announcements", "a1"), announcement());
    });
  }

  it("lets administrators post an announcement that links a Learning page, and nobody else", async () => {
    await seedAnnouncements();
    const admin = testEnv.authenticatedContext("adminX", { email: "adminx@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(admin, "hub_announcements", "a2"), announcement()));
    await assertFails(
      setDoc(doc(admin, "hub_announcements", "a3"), announcement({ learningLink: { kind: "client", id: "123" } })),
    );

    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(setDoc(doc(trainer, "hub_announcements", "a4"), announcement({ authorId: "trainerA" })));
    await assertFails(updateDoc(doc(trainer, "hub_announcements", "a1"), { title: "Rewritten" }));
  });

  it("lets a studio owner post from the Franchise hub and take the notice down", async () => {
    await seedAnnouncements();
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const mine = announcement({
      authorId: "ownerA",
      authorName: "Owner A",
      studioId: "studioA",
      targetScope: "studio",
      targetId: "studioA",
    });
    await assertSucceeds(setDoc(doc(owner, "hub_announcements", "o1"), mine));
    await assertSucceeds(updateDoc(doc(owner, "hub_announcements", "o1"), { isActive: false }));
  });

  it("lets anyone mark an announcement read for themselves, and only themselves", async () => {
    await seedAnnouncements();
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(trainer, "hub_announcements", "a1"), { readBy: ["trainerA"] }));
    await assertFails(updateDoc(doc(trainer, "hub_announcements", "a1"), { readBy: ["trainerA", "trainerB"] }));
    // Nobody adds someone else, or takes anyone off.
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(updateDoc(doc(other, "hub_announcements", "a1"), { readBy: ["trainerA", "trainerC"] }));
    await assertFails(updateDoc(doc(other, "hub_announcements", "a1"), { readBy: [] }));
    await assertSucceeds(updateDoc(doc(other, "hub_announcements", "a1"), { readBy: ["trainerA", "trainerB"] }));
  });

  it("lets a tag ring the tagged person's bell", async () => {
    await seedComments();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(
      setDoc(doc(a, "trainers", "trainerA2", "notifications", "n1"), {
        kind: "comment-mention",
        title: "Trainer A tagged you on Leg Press",
        studioId: "studioA",
        link: { view: "machine-anatomy", learning: { kind: "machine", id: "m-leg-press", title: "Leg Press" } },
        actor: { id: "trainerA", name: "Trainer A" },
        createdAt: serverTimestamp(),
        readAt: null,
      }),
    );
  });
});
