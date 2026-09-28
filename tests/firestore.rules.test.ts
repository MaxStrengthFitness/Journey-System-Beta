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
  orderBy,
  limit,
  arrayUnion,
  arrayRemove,
  deleteField,
  FieldPath,
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

  it("accepts research notes with sources and a working log, within their limits (Planner rework)", async () => {
    await seedNotes();
    const db = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(db, "trainers", "trainerA", "notes", "r1");
    const jot = { id: "j1", at: 1, text: "pinch at the top", clientId: null };
    await assertSucceeds(
      setDoc(ref, noteData({ kind: "research", links: [{ url: "https://x.org/", title: "Review" }], log: [jot] })),
    );
    // A jot is one arrayUnion; the rest of the note is untouched and still valid.
    await assertSucceeds(
      updateDoc(ref, { log: arrayUnion({ ...jot, id: "j2", at: 2 }), updatedAt: serverTimestamp() }),
    );
    const tooMany = Array.from({ length: 101 }, (_, i) => ({ ...jot, id: `j${i}` }));
    await assertFails(setDoc(doc(db, "trainers", "trainerA", "notes", "r2"), noteData({ log: tooMany })));
    const links = Array.from({ length: 11 }, (_, i) => ({ url: `https://s${i}.org/`, title: "" }));
    await assertFails(setDoc(doc(db, "trainers", "trainerA", "notes", "r3"), noteData({ links })));
    // The shared copy may carry sources, not the log.
    const batch = writeBatch(db);
    batch.set(ref, noteData({ kind: "research", sharedWith: "notesClient" }));
    batch.set(
      doc(db, "clients", "notesClient", "sharedNotes", "r1"),
      sharedData("trainerA", { kind: "research", links: [{ url: "https://x.org/", title: "Review" }] }),
    );
    await assertSucceeds(batch.commit());
    await assertFails(
      setDoc(doc(db, "clients", "notesClient", "sharedNotes", "r1"), sharedData("trainerA", { log: [jot] })),
    );
  });

  // ── NOTES SHARED WITH COLLEAGUES (Planner rework) ──────────────────────
  const shareData = (uid: string, over: Record<string, unknown> = {}) => ({
    noteId: "t1",
    studioId: "studioA",
    authorId: uid,
    authorName: "Trainer A",
    title: "Knee plan",
    body: "Week 2: add lumbar at 50%.",
    kind: "plan",
    links: [],
    clientIds: ["notesClient"],
    clientNames: { notesClient: "Notes Client" },
    audience: "people",
    audienceIds: ["trainerA2"],
    expiresOn: "2026-09-30",
    message: "Covering my Tuesdays",
    updatedAt: serverTimestamp(),
    ...over,
  });
  const marker = { studioId: "studioA", studioName: "Studio A", audience: "people", people: [{ id: "trainerA2", name: "A2" }], expiresOn: null, message: "" };

  it("shares a note with named colleagues, readable by them and not by others", async () => {
    await seedNotes();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const batch = writeBatch(a);
    batch.set(doc(a, "trainers", "trainerA", "notes", "t1"), noteData({ teamShare: marker }));
    batch.set(doc(a, "studios", "studioA", "noteShares", "t1"), shareData("trainerA"));
    await assertSucceeds(batch.commit());

    const named = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertSucceeds(
      getDocs(query(collection(named, "studios", "studioA", "noteShares"), where("audienceIds", "array-contains", "trainerA2"))),
    );
    // A colleague who wasn't named, at the same studio, can't list or read it.
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertFails(getDoc(doc(owner, "studios", "studioA", "noteShares", "t1")));
    const teamList = await getDocs(
      query(collection(owner, "studios", "studioA", "noteShares"), where("audience", "==", "team")),
    );
    expect(teamList.docs.map((d) => d.id)).not.toContain("t1");
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(doc(elsewhere, "studios", "studioA", "noteShares", "t1")));
  });

  it("shares a note with the whole studio team, and nobody outside it", async () => {
    await seedNotes();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(
      setDoc(doc(a, "studios", "studioA", "noteShares", "t1"), shareData("trainerA", { audience: "team", audienceIds: [] })),
    );
    const colleague = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertSucceeds(
      getDocs(query(collection(colleague, "studios", "studioA", "noteShares"), where("audience", "==", "team"))),
    );
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(
      getDocs(query(collection(elsewhere, "studios", "studioA", "noteShares"), where("audience", "==", "team"))),
    );
  });

  it("won't share in someone else's name, at another studio, or with nobody", async () => {
    await seedNotes();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(a, "studios", "studioA", "noteShares", "t1");
    await assertFails(setDoc(ref, shareData("trainerA2")));
    await assertFails(setDoc(ref, shareData("trainerA", { audienceIds: [] })));
    await assertFails(setDoc(ref, shareData("trainerA", { log: [] })));
    await assertFails(setDoc(ref, shareData("trainerA", { noteId: "other" })));
    await assertFails(
      setDoc(doc(a, "studios", "studioB", "noteShares", "t1"), shareData("trainerA", { studioId: "studioB" })),
    );
  });

  it("lets only the author change a colleague copy, and the author or a leader take it down", async () => {
    await seedNotes();
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(a, "studios", "studioA", "noteShares", "t1"), shareData("trainerA")));
    const named = testEnv.authenticatedContext("trainerA2", { email: "trainera2@test.com" }).firestore();
    await assertFails(
      setDoc(doc(named, "studios", "studioA", "noteShares", "t1"), shareData("trainerA2", { title: "Mine now" })),
    );
    await assertFails(deleteDoc(doc(named, "studios", "studioA", "noteShares", "t1")));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(owner, "studios", "studioA", "noteShares", "t1")));
    // The author's later unshare still succeeds with the copy already gone.
    const unshare = writeBatch(a);
    unshare.set(doc(a, "trainers", "trainerA", "notes", "t1"), noteData({ teamShare: null }));
    unshare.delete(doc(a, "studios", "studioA", "noteShares", "t1"));
    await assertSucceeds(unshare.commit());
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

  // ── TEAM JOBS: leaders post, the studio's floor does the work ───────────
  //
  // Round: Planner rework, Sep 2026.

  const jobData = (over: Record<string, unknown> = {}) => ({
    studioId: "studioA",
    title: "Deep clean",
    detail: "",
    category: "ops",
    about: { kind: "facility" },
    assignees: [{ id: "trainerA", name: "Trainer A" }],
    assigneeIds: ["trainerA"],
    openToAll: true,
    parts: { p01: { id: "p01", label: "Mirrors", order: 0, refId: null, doneBy: null } },
    dueOn: null,
    requiresNote: false,
    notifyOnDone: true,
    status: "open",
    closingNote: null,
    completedBy: null,
    closedOn: null,
    createdBy: { id: "ownerA", name: "Owner A" },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...over,
  });

  async function seedJobs() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, "studios", "studioA", "teamJobs", "j1"), jobData());
    });
  }

  it("lets a studio's leader post a team job, and nobody else", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(owner, "studios", "studioA", "teamJobs", "new"), jobData()));
    // In someone else's name, or at a studio they don't lead.
    await assertFails(
      setDoc(doc(owner, "studios", "studioA", "teamJobs", "n2"), jobData({ createdBy: { id: "trainerA", name: "A" } })),
    );
    await assertFails(setDoc(doc(owner, "studios", "studioB", "teamJobs", "n3"), jobData({ studioId: "studioB" })));
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(
      setDoc(doc(trainer, "studios", "studioA", "teamJobs", "n4"), jobData({ createdBy: { id: "trainerA", name: "A" } })),
    );
    // Shape: a studio mismatch, or too many parts.
    const tooMany = Object.fromEntries(Array.from({ length: 61 }, (_, i) => [`p${i}`, { label: "x", order: i }]));
    await assertFails(setDoc(doc(owner, "studios", "studioA", "teamJobs", "n5"), jobData({ parts: tooMany })));
    await assertFails(setDoc(doc(owner, "studios", "studioA", "teamJobs", "n6"), jobData({ studioId: "studioB" })));
  });

  it("keeps team jobs to the studio's own people", async () => {
    await seedJobs();
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDocs(collection(trainer, "studios", "studioA", "teamJobs")));
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDocs(collection(elsewhere, "studios", "studioA", "teamJobs")));
    await assertFails(getDoc(doc(elsewhere, "studios", "studioA", "teamJobs", "j1")));
  });

  it("lets the floor tick parts, join, leave and close — but not rewrite or cancel the job", async () => {
    await seedJobs();
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(trainer, "studios", "studioA", "teamJobs", "j1");
    await assertSucceeds(
      updateDoc(ref, { "parts.p01.doneBy": { id: "trainerA", name: "Trainer A" }, updatedAt: serverTimestamp() }),
    );
    await assertSucceeds(
      updateDoc(ref, {
        status: "done",
        closedOn: "2026-09-16",
        closingNote: "All clean",
        completedBy: { id: "trainerA", name: "Trainer A" },
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(updateDoc(ref, { status: "open", closedOn: null, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { title: "Something else", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { status: "cancelled", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { createdBy: { id: "trainerA", name: "A" } }));

    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(
      updateDoc(doc(elsewhere, "studios", "studioA", "teamJobs", "j1"), {
        "parts.p01.doneBy": { id: "trainerB", name: "Trainer B" },
      }),
    );

    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA", "teamJobs", "j1"), { title: "Deep clean (Sat)" }));
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA", "teamJobs", "j1"), { status: "cancelled" }));
    // A job a leader called off stays off for the floor.
    await assertFails(updateDoc(ref, { status: "open", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA", "teamJobs", "j1"), { status: "open" }));
  });

  it("lets the poster or a leader delete a team job, not the floor", async () => {
    await seedJobs();
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(deleteDoc(doc(trainer, "studios", "studioA", "teamJobs", "j1")));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(owner, "studios", "studioA", "teamJobs", "j1")));
  });

  // ── MACHINE CARE (Relay, Sep 2026) ───────────────────────────────────────
  //
  // studios/{s}/machineCare/{machineId}: written from the Floor Map by
  // anyone who works at the studio, read by anyone signed in.

  const careData = (over: Record<string, unknown> = {}) => ({
    machineId: "m-leg-press",
    lastWipedAt: 1_758_000_000_000,
    lastWipedBy: { id: "trainerA", name: "Trainer A" },
    updatedAt: serverTimestamp(),
    ...over,
  });

  it("lets the studio's people record care, and nobody else", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(trainer, "studios", "studioA", "machineCare", "m-leg-press");
    await assertSucceeds(setDoc(ref, careData(), { merge: true }));
    await assertSucceeds(
      setDoc(ref, { machineId: "m-leg-press", lastDeepCleanAt: 1_758_000_100_000, lastDeepCleanBy: { id: "trainerA", name: "Trainer A" }, updatedAt: serverTimestamp() }, { merge: true }),
    );
    // Wrong machine in the body, a stray key, a non-numeric time.
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "machineCare", "m-row"), careData()));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "machineCare", "m-chest"), careData({ machineId: "m-chest", status: "broken" })));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "machineCare", "m-chest"), careData({ machineId: "m-chest", lastWipedAt: "yesterday" })));
    // Someone from another studio.
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(setDoc(doc(elsewhere, "studios", "studioA", "machineCare", "m-chest"), careData({ machineId: "m-chest", lastWipedBy: { id: "trainerB", name: "B" } })));
    await assertSucceeds(getDoc(doc(elsewhere, "studios", "studioA", "machineCare", "m-leg-press")));
  });

  it("signs a new flag with the caller, and lets a wipe merge over someone else's flag", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(trainer, "studios", "studioA", "machineCare", "m-leg-press");
    const flag = { note: "Pad torn", by: { id: "trainerA", name: "Trainer A" }, at: 1_758_000_200_000 };
    await assertSucceeds(setDoc(ref, { machineId: "m-leg-press", flag, updatedAt: serverTimestamp() }, { merge: true }));
    // In someone else's name, or with no note.
    await assertFails(setDoc(ref, { machineId: "m-leg-press", flag: { ...flag, by: { id: "ownerA", name: "O" } }, updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(setDoc(ref, { machineId: "m-leg-press", flag: { ...flag, note: "" }, updatedAt: serverTimestamp() }, { merge: true }));
    // The owner wipes it: the merged document still carries A's flag, untouched.
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(
      setDoc(doc(owner, "studios", "studioA", "machineCare", "m-leg-press"), { machineId: "m-leg-press", lastWipedAt: 1_758_000_300_000, lastWipedBy: { id: "ownerA", name: "Owner A" }, updatedAt: serverTimestamp() }, { merge: true }),
    );
    // Anyone at the studio may clear a flag; the floor may not delete the record.
    await assertSucceeds(setDoc(doc(owner, "studios", "studioA", "machineCare", "m-leg-press"), { machineId: "m-leg-press", flag: null, updatedAt: serverTimestamp() }, { merge: true }));
    await assertFails(deleteDoc(ref));
    await assertSucceeds(deleteDoc(doc(owner, "studios", "studioA", "machineCare", "m-leg-press")));
  });

  // ── MACHINE FIT (Sep 2026) ───────────────────────────────────────────────
  //
  // studios/{s}/machineFit/{machineId}: who at the studio is set to what, one
  // row per client. Written the way the app writes it: one row, by field path.

  const fitWrite = (clientId: string, row: unknown, over: Record<string, unknown> = {}) => ({
    data: { machineId: "m-leg-press", studioId: "studioA", rows: { [clientId]: row }, updatedAt: serverTimestamp(), ...over },
    options: { mergeFields: ["machineId", "studioId", "updatedAt", new FieldPath("rows", clientId)] },
  });
  const fitRow = (seat: string) => ({ s: { seat, gap: "0" }, t: 1_758_000_000_000 });

  it("lets the studio's people keep the machine-fit index, one row at a time", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(trainer, "studios", "studioA", "machineFit", "m-leg-press");
    const first = fitWrite("clientA", fitRow("4"));
    await assertSucceeds(setDoc(ref, first.data, first.options));
    // A second client's row leaves the first alone, and a row can be replaced and removed.
    const second = fitWrite("clientB", fitRow("6"));
    await assertSucceeds(setDoc(ref, second.data, second.options));
    const moved = fitWrite("clientA", { ...fitRow("5"), src: { seat: "suggested" } });
    await assertSucceeds(setDoc(ref, moved.data, moved.options));
    const gone = fitWrite("clientB", deleteField());
    await assertSucceeds(setDoc(ref, gone.data, gone.options));
    const snap = await getDoc(ref);
    expect(Object.keys(snap.data()?.rows ?? {})).toEqual(["clientA"]);
    expect(snap.data()?.rows.clientA.s.seat).toBe("5");

    // "Right for this client": one review copied onto her row, by nested path
    // (fit-store ackFitRow). It touches one row, so the same rule allows it —
    // and the rest of the row is left exactly as it was.
    await assertSucceeds(updateDoc(ref, new FieldPath("rows", "clientA", "a", "seat"), "5", "updatedAt", serverTimestamp()));
    const reviewed = (await getDoc(ref)).data();
    expect(reviewed?.rows.clientA.a).toEqual({ seat: "5" });
    expect(reviewed?.rows.clientA.s.seat).toBe("5");
    expect(reviewed?.rows.clientA.src).toEqual({ seat: "suggested" });
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(
      updateDoc(doc(elsewhere, "studios", "studioA", "machineFit", "m-leg-press"), new FieldPath("rows", "clientA", "a", "seat"), "1", "updatedAt", serverTimestamp()),
    );
  });

  it("lets a client's row be removed from a machine that has no index document yet", async () => {
    // Clearing every setting on a machine nobody has indexed: the app writes a
    // delete for her row, which creates the document with no `rows` at all.
    // Refusing it used to fail the Setup screen's whole index batch.
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(trainer, "studios", "studioA", "machineFit", "m-never-indexed");
    const gone = fitWrite("clientA", deleteField(), { machineId: "m-never-indexed" });
    await assertSucceeds(setDoc(ref, gone.data, gone.options));
    // …and the next real row lands on that document like on any other.
    const row = fitWrite("clientB", fitRow("4"), { machineId: "m-never-indexed" });
    await assertSucceeds(setDoc(ref, row.data, row.options));
    expect(Object.keys((await getDoc(ref)).data()?.rows ?? {})).toEqual(["clientB"]);
  });

  it("refuses a machine-fit write that touches more than one row, names the wrong place, or adds a field", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "machineFit", "m-leg-press"), {
        machineId: "m-leg-press",
        studioId: "studioA",
        rows: { clientA: fitRow("4"), clientB: fitRow("6") },
      });
    });
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(trainer, "studios", "studioA", "machineFit", "m-leg-press");
    // The whole map at once: every row would be "affected".
    await assertFails(setDoc(ref, { machineId: "m-leg-press", studioId: "studioA", rows: {}, updatedAt: serverTimestamp() }));
    await assertFails(
      setDoc(ref, { machineId: "m-leg-press", studioId: "studioA", rows: { clientA: fitRow("1"), clientB: fitRow("1") }, updatedAt: serverTimestamp() }),
    );
    // A new document arriving with a studio's worth of rows.
    await assertFails(
      setDoc(doc(trainer, "studios", "studioA", "machineFit", "m-row"), {
        machineId: "m-row",
        studioId: "studioA",
        rows: { clientA: fitRow("1"), clientB: fitRow("1") },
        updatedAt: serverTimestamp(),
      }),
    );
    // The wrong machine or studio in the body, and a stray field (body data does not belong here).
    const wrongMachine = fitWrite("clientC", fitRow("4"), { machineId: "m-row" });
    await assertFails(setDoc(ref, wrongMachine.data, wrongMachine.options));
    const wrongStudio = fitWrite("clientC", fitRow("4"), { studioId: "studioB" });
    await assertFails(setDoc(ref, wrongStudio.data, wrongStudio.options));
    await assertFails(setDoc(ref, { ...fitWrite("clientC", fitRow("4")).data, heights: { clientC: 67 } }, { merge: true }));
    // The floor cannot delete the index; it is rebuilt by script.
    await assertFails(deleteDoc(ref));
  });

  it("keeps a studio's machine-fit index to that studio's people", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "machineFit", "m-leg-press"), {
        machineId: "m-leg-press",
        studioId: "studioA",
        rows: { clientA: fitRow("4") },
      });
      await setDoc(doc(context.firestore(), "trainers", "adminFit"), { fullName: "Admin", initials: "AD", role: "Admin" });
    });
    const elsewhere = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(doc(elsewhere, "studios", "studioA", "machineFit", "m-leg-press")));
    await assertFails(getDocs(collection(elsewhere, "studios", "studioA", "machineFit")));
    const write = fitWrite("clientZ", fitRow("4"));
    await assertFails(setDoc(doc(elsewhere, "studios", "studioA", "machineFit", "m-leg-press"), write.data, write.options));

    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDocs(collection(trainer, "studios", "studioA", "machineFit")));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(owner, "studios", "studioA", "machineFit", "m-leg-press")));
    const admin = testEnv.authenticatedContext("adminFit", { email: "adminfit@test.com" }).firestore();
    await assertSucceeds(getDocs(collection(admin, "studios", "studioA", "machineFit")));
    await assertSucceeds(deleteDoc(doc(admin, "studios", "studioA", "machineFit", "m-leg-press")));
  });

  it("keeps the company Kaizen report to administrators, and nobody writes it from the app", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "kaizenReports", "m-leg-press"), { machineId: "m-leg-press", clients: 40 });
      await setDoc(doc(context.firestore(), "trainers", "adminFit"), { fullName: "Admin", initials: "AD", role: "Admin" });
    });
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertFails(getDoc(doc(owner, "kaizenReports", "m-leg-press")));
    const admin = testEnv.authenticatedContext("adminFit", { email: "adminfit@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(admin, "kaizenReports", "m-leg-press")));
    await assertSucceeds(getDocs(collection(admin, "kaizenReports")));
    await assertFails(setDoc(doc(admin, "kaizenReports", "m-leg-press"), { clients: 1 }));
  });

  // ── THE VAULT (Relay, Sep 2026) ──────────────────────────────────────────

  it("keeps the vault to the studio's leaders", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const entry = { studioId: "studioA", kind: "incident", title: "Slip by the water cooler", body: "", onDate: "2026-09-16", people: "", status: "open", createdBy: { id: "ownerA", name: "Owner A" }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(owner, "studios", "studioA", "vault", "v1"), entry));
    await assertSucceeds(getDocs(collection(owner, "studios", "studioA", "vault")));
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA", "vault", "v1"), { status: "closed", updatedAt: serverTimestamp() }));
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(getDocs(collection(trainer, "studios", "studioA", "vault")));
    await assertFails(getDoc(doc(trainer, "studios", "studioA", "vault", "v1")));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "vault", "v2"), { ...entry, createdBy: { id: "trainerA", name: "A" } }));
    // A leader of another studio is the floor here.
    await assertFails(getDocs(collection(owner, "studios", "studioB", "vault")));
    await assertSucceeds(deleteDoc(doc(owner, "studios", "studioA", "vault", "v1")));
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
    // Sharing waits for an administrator (Sep 28 2026): a trainer OFFERS a
    // note to every studio, and can't publish it there themselves.
    const note = {
      kind: "overlay",
      title: "Leg Press",
      authorId: "trainerA",
      blocks: [{ kind: "para", text: "Two notches lower here." }],
      sharedKeys: ["m-leg-press"],
      studioName: "Studio A",
    };
    await assertFails(setDoc(doc(insider, "studios", "studioA", "wiki", "machine__m-leg-press"), { ...note, shared: true }));
    await assertFails(
      setDoc(doc(insider, "studios", "studioA", "wiki", "machine__m-leg-press"), { ...note, shareStatus: "approved" }),
    );
    await assertSucceeds(
      setDoc(doc(insider, "studios", "studioA", "wiki", "machine__m-leg-press"), { ...note, shareStatus: "pending" }),
    );
  });

  it("lets a studio's leaders offer their own machine to the database, and nothing else", async () => {
    await seedMachineDb();
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    // Offered, for an administrator to decide (Sep 28 2026) ...
    await assertSucceeds(
      updateDoc(doc(owner, "studios", "studioA", "roster", "sm-studioA-sled"), {
        shareStatus: "pending",
        sharedStudioName: "Studio A",
      }),
    );
    // ... never listed by the studio itself.
    await assertFails(
      updateDoc(doc(owner, "studios", "studioA", "roster", "sm-studioA-sled"), { shared: true, sharedStudioName: "Studio A" }),
    );
    // An MSF machine is already in the database.
    await assertFails(updateDoc(doc(owner, "studios", "studioA", "roster", "m-leg-press"), { shareStatus: "pending" }));
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
        shareStatus: "pending",
      }),
    );
    // Trainers do not decide what the studio publishes.
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(updateDoc(doc(trainer, "studios", "studioA", "roster", "sm-studioA-sled"), { shareStatus: "pending" }));
    await assertFails(updateDoc(doc(trainer, "studios", "studioA", "roster", "sm-studioA-sled"), { shared: true }));
  });

  // -- SHARING WAITS FOR AN ADMINISTRATOR (AJ, Sep 28 2026) -----------------
  //
  // "it should submit to admins first for review, we can review in admin
  // dashboard". A studio offers (shareStatus "pending"); only an
  // administrator publishes (shared true) and decides the offer.

  async function seedAdmin() {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "adminX"), {
        fullName: "Admin X",
        initials: "AX",
        role: "Admin",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
    });
  }

  it("lets only an administrator publish an offer, decide it and list what waits", async () => {
    await seedMachineDb();
    await seedAdmin();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await updateDoc(doc(db, "studios", "studioA", "roster", "sm-studioA-sled"), { shareStatus: "pending" });
      await updateDoc(doc(db, "studios", "studioA", "playbook", "tipPrivate"), { shareStatus: "pending", sharedKeys: ["m-leg-press"] });
    });
    const admin = testEnv.authenticatedContext("adminX", { email: "adminx@test.com" }).firestore();
    // What waits, across every studio.
    await assertSucceeds(getDocs(query(collectionGroup(admin, "roster"), where("shareStatus", "==", "pending"))));
    await assertSucceeds(getDocs(query(collectionGroup(admin, "playbook"), where("shareStatus", "==", "pending"))));
    await assertSucceeds(getDocs(query(collectionGroup(admin, "wiki"), where("shareStatus", "==", "pending"))));
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDocs(query(collectionGroup(other, "playbook"), where("shareStatus", "==", "pending"))));
    // Deciding: an administrator publishes a machine and a tip they didn't write, or declines with a note.
    await assertSucceeds(
      updateDoc(doc(admin, "studios", "studioA", "roster", "sm-studioA-sled"), {
        shared: true,
        shareStatus: "approved",
        shareReviewedBy: "adminX",
        shareReviewedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(admin, "studios", "studioA", "playbook", "tipPrivate"), {
        shareStatus: "declined",
        shareReviewNote: "Say which seat notch, and we will share it.",
        shareReviewedBy: "adminX",
        shareReviewedAt: serverTimestamp(),
      }),
    );
    // A studio can't write the decision itself.
    const author = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(updateDoc(doc(author, "studios", "studioA", "playbook", "tipPrivate"), { shareReviewNote: "Fine by me" }));
    await assertFails(updateDoc(doc(author, "studios", "studioA", "playbook", "tipPrivate"), { shareStatus: "approved" }));
    // It may offer again after a decline, and take a shared tip back.
    await assertSucceeds(updateDoc(doc(author, "studios", "studioA", "playbook", "tipPrivate"), { shareStatus: "pending" }));
    await assertSucceeds(updateDoc(doc(author, "studios", "studioA", "playbook", "tipShared"), { shared: false, sharedKeys: [] }));
    await assertFails(updateDoc(doc(author, "studios", "studioA", "playbook", "tipShared"), { shared: true }));
  });

  it("keeps a studio's roster and machine notes with the people who work there; a shared machine reads everywhere", async () => {
    await seedMachineDb();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "machineNotes", "m-leg-press"), {
        studioId: "studioA",
        machineId: "m-leg-press",
        notes: "Left pad sticks.",
      });
    });
    const outsider = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDocs(collection(outsider, "studios", "studioA", "roster")));
    await assertFails(getDoc(doc(outsider, "studios", "studioA", "roster", "sm-studioA-sled")));
    await assertFails(getDocs(collection(outsider, "studios", "studioA", "machineNotes")));
    await assertFails(getDoc(doc(outsider, "studios", "studioA", "machineNotes", "m-leg-press")));
    const insider = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDocs(collection(insider, "studios", "studioA", "roster")));
    await assertSucceeds(getDocs(collection(insider, "studios", "studioA", "machineNotes")));
    // Once an administrator shares a studio's own machine, anyone may read that one document.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), "studios", "studioA", "roster", "sm-studioA-sled"), { shared: true });
    });
    await assertSucceeds(getDoc(doc(outsider, "studios", "studioA", "roster", "sm-studioA-sled")));
    await assertFails(getDoc(doc(outsider, "studios", "studioA", "roster", "m-leg-press")));
  });

  it("lets a studio's own people read its machine set-up, and only its leaders change it", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studioMachineSettings", "studioA_m-leg-press"), {
        studioId: "studioA",
        machineId: "m-leg-press",
        settingOptions: { seat: ["1", "2", "3"] },
      });
    });
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const outsider = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const byStudio = (db: typeof trainer, studioId: string) =>
      getDocs(query(collection(db, "studioMachineSettings"), where("studioId", "==", studioId)));
    await assertSucceeds(byStudio(trainer, "studioA"));
    await assertFails(byStudio(outsider, "studioA"));
    await assertSucceeds(byStudio(outsider, "studioB"));
    await assertFails(getDoc(doc(outsider, "studioMachineSettings", "studioA_m-leg-press")));
    // Writes: the studio's leaders, on their own studio, under the id the document names.
    const edit = { studioId: "studioA", machineId: "m-leg-press", settingOptions: { seat: ["1", "2"] } };
    await assertFails(setDoc(doc(trainer, "studioMachineSettings", "studioA_m-leg-press"), edit, { merge: true }));
    await assertFails(setDoc(doc(outsider, "studioMachineSettings", "studioA_m-leg-press"), edit, { merge: true }));
    await assertSucceeds(setDoc(doc(owner, "studioMachineSettings", "studioA_m-leg-press"), edit, { merge: true }));
    await assertFails(setDoc(doc(owner, "studioMachineSettings", "studioB_m-leg-press"), { ...edit, studioId: "studioB" }));
    await assertFails(setDoc(doc(owner, "studioMachineSettings", "studioA_m-row"), edit));
    await assertFails(updateDoc(doc(owner, "studioMachineSettings", "studioA_m-leg-press"), { studioId: "studioB" }));
    await assertFails(deleteDoc(doc(trainer, "studioMachineSettings", "studioA_m-leg-press")));
    await assertSucceeds(deleteDoc(doc(owner, "studioMachineSettings", "studioA_m-leg-press")));
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

  it("keeps unshared tips and notes with their studio, while shared ones stay readable", async () => {
    await seedMachineDb();
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDocs(collection(other, "studios", "studioA", "playbook")));
    await assertFails(getDoc(doc(other, "studios", "studioA", "playbook", "tipPrivate")));
    await assertSucceeds(getDoc(doc(other, "studios", "studioA", "playbook", "tipShared")));
    await assertFails(getDocs(collection(other, "studios", "studioA", "wiki")));

    const insider = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDocs(collection(insider, "studios", "studioA", "playbook")));
    await assertSucceeds(getDocs(collection(insider, "studios", "studioA", "wiki")));
  });

  it("keeps an adopted copy a copy, and a roster entry at its own studio", async () => {
    await seedMachineDb();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "studios", "studioA", "roster", "sm-studioA-rope"), {
        machineId: "sm-studioA-rope",
        studioId: "studioA",
        source: "custom",
        status: "active",
        definition: { name: "Rope" },
        adoptedFrom: { studioId: "studioB", machineId: "sm-studioB-rope", studioName: "Studio B" },
      });
    });
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const copy = doc(owner, "studios", "studioA", "roster", "sm-studioA-rope");
    // Dropping the lineage and listing it in one write is still listing a copy.
    await assertFails(
      setDoc(copy, {
        machineId: "sm-studioA-rope",
        studioId: "studioA",
        source: "custom",
        status: "active",
        definition: { name: "Rope" },
        shared: true,
      }),
    );
    // Switching it off and on is fine.
    await assertSucceeds(updateDoc(copy, { status: "inactive" }));
    await assertSucceeds(updateDoc(copy, { status: "active" }));
    // A roster entry names the studio its path names.
    await assertFails(updateDoc(doc(owner, "studios", "studioA", "roster", "sm-studioA-sled"), { studioId: "studioB" }));
  });

  it("checks the shape of the share fields, and lets a tip's author offer it", async () => {
    await seedMachineDb();
    const author = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ref = doc(author, "studios", "studioA", "playbook", "tipPrivate");
    await assertFails(updateDoc(ref, { shared: "yes" }));
    await assertFails(updateDoc(ref, { shareStatus: "pending", sharedKeys: "m-leg-press" }));
    await assertFails(updateDoc(ref, { shareStatus: "maybe", sharedKeys: ["m-leg-press"] }));
    // Offered for an administrator's review (Sep 28 2026); publishing it is theirs.
    await assertFails(updateDoc(ref, { shared: true, sharedKeys: ["m-leg-press"], studioName: "Studio A" }));
    await assertSucceeds(updateDoc(ref, { shareStatus: "pending", sharedKeys: ["m-leg-press"], studioName: "Studio A" }));
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

  it("posts announcements as their author, and keeps every-studio notices to the Operations tab's people", async () => {
    await seedAnnouncements();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "franchiseX"), {
        fullName: "Franchise X",
        initials: "FX",
        role: "FranchiseOwner",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA", "studioB"],
      });
    });
    const admin = testEnv.authenticatedContext("adminX", { email: "adminx@test.com" }).firestore();
    // Nobody posts under someone else's name.
    await assertFails(
      setDoc(doc(admin, "hub_announcements", "imp"), announcement({ authorId: "ownerA", authorName: "Owner A" })),
    );

    const franchise = testEnv.authenticatedContext("franchiseX", { email: "franchisex@test.com" }).firestore();
    await assertSucceeds(
      setDoc(doc(franchise, "hub_announcements", "f1"), announcement({ authorId: "franchiseX", authorName: "Franchise X" })),
    );

    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    // The Franchise hub never offers "everyone".
    await assertFails(
      setDoc(doc(owner, "hub_announcements", "o-all"), announcement({ authorId: "ownerA", authorName: "Owner A" })),
    );
    // And a studio owner changes only their own notices.
    await assertFails(updateDoc(doc(owner, "hub_announcements", "a1"), { isActive: false }));
    // The Operations tab's people can take any notice down.
    await assertSucceeds(updateDoc(doc(franchise, "hub_announcements", "a1"), { isActive: false }));
  });

  it("marks a notice read even when it was written without a readBy list", async () => {
    await seedAnnouncements();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const bare: Record<string, unknown> = announcement();
      delete bare.readBy;
      await setDoc(doc(context.firestore(), "hub_announcements", "bare"), bare);
    });
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(trainer, "hub_announcements", "bare"), { readBy: ["trainerA"] }));
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

  // Cost round (Sep 2026): machineTrends is written by the weekly job's service
  // account and holds aggregates only, so it reads like exerciseLogs.
  it("lets any signed-in trainer read machineTrends and nobody but an admin write it", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "machineTrends", "compound-row"), { machineId: "compound-row", clients: 12, sets: 40 });
    });
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(a, "machineTrends", "compound-row")));
    await assertSucceeds(getDoc(doc(a, "machineTrends", "_summary")));
    await assertFails(setDoc(doc(a, "machineTrends", "compound-row"), { machineId: "compound-row", clients: 1 }));
    const nobody = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(nobody, "machineTrends", "compound-row")));
  });

  // Cost round (Sep 2026): the self-edit hole. A trainer may still edit their
  // own document, but not the fields that decide what they may do and where.
  it("lets a trainer edit their own profile but not their own role or studios", async () => {
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(a, "trainers", "trainerA"), { bio: "Loves the leg press" }));
    await assertFails(updateDoc(doc(a, "trainers", "trainerA"), { role: "StudioLeader" }));
    await assertFails(updateDoc(doc(a, "trainers", "trainerA"), { role: "FranchiseOwner" }));
    await assertFails(updateDoc(doc(a, "trainers", "trainerA"), { accessibleStudioIds: ["studioA", "studioB"] }));
    await assertFails(updateDoc(doc(a, "trainers", "trainerA"), { ownedStudioIds: ["studioB"] }));
    await assertFails(updateDoc(doc(a, "trainers", "trainerA"), { activeGuestStudioIds: ["studioB"] }));
    await assertFails(updateDoc(doc(a, "trainers", "trainerA"), { primaryHomeStudioId: "studioB" }));
    // Their studio's leader still can.
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(owner, "trainers", "trainerA"), { accessibleStudioIds: ["studioA", "studioB"] }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "trainers", "trainerA"), { accessibleStudioIds: ["studioA"] });
    });
  });

  // Cost round (Sep 2026): a role claim on the token is read before the
  // document, so an Admin claim with no trainer document is still an admin,
  // and a LifeTransformer claim never reaches admin-only writes.
  it("reads the role from the token claim before the trainer document", async () => {
    const claimedAdmin = testEnv.authenticatedContext("claim-admin", { email: "ca@test.com", role: "Admin" }).firestore();
    await assertSucceeds(setDoc(doc(claimedAdmin, "machineTrends", "claim-test"), { machineId: "claim-test" }));
    const claimedTrainer = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com", role: "LifeTransformer" }).firestore();
    await assertFails(setDoc(doc(claimedTrainer, "machineTrends", "claim-test-2"), { machineId: "claim-test-2" }));
  });

  // ── HISTORY EDITING (Sep 17 2026) ───────────────────────────────────────
  // Taking a machine off a session that already happened deletes its set, and
  // correcting a past session logged onto the wrong client deletes the session.
  // Both were super-admin-and-owner only, so the History tab's own buttons
  // failed for every trainer who would ever press them.
  it("lets a trainer delete an exercise log — removing a machine from a past session", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "exerciseLogs", "logToDrop"), {
        sessionId: "sessionA",
        machineId: "chest-press",
        clientId: "clientA",
      });
    });
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(a, "exerciseLogs", "logToDrop")));
  });

  it("refuses an exercise log delete to a signed-in user who is not a trainer", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "exerciseLogs", "logToKeep"), {
        sessionId: "sessionA",
        machineId: "chest-press",
        clientId: "clientA",
      });
    });
    const stranger = testEnv.authenticatedContext("no-trainer-doc", { email: "nobody@test.com" }).firestore();
    await assertFails(deleteDoc(doc(stranger, "exerciseLogs", "logToKeep")));
  });

  it("lets a trainer of the session's studio delete the session, and refuses one from another studio", async () => {
    const b = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(deleteDoc(doc(b, "sessions", "sessionA")));
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(deleteDoc(doc(a, "sessions", "sessionA")));
  });

  // ── MY STUDIO (Sep 19 2026) ─────────────────────────────────────────────
  // A studio is written by its own leaders (a role there, or the grant),
  // franchise owners and administrators — never by any trainer anywhere, which
  // is the hole CLAUDE.md carried since Sep 12. The one thing every iPad still
  // writes is the schedule sync's lease.
  it("lets a studio's own leader edit the studio, and refuses a trainer and another studio's leader", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA"), { name: "Studio A — West", journeyCutoverDate: "2026-09-01" }));
    await assertFails(updateDoc(doc(owner, "studios", "studioB"), { name: "Not mine" }));
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(updateDoc(doc(trainer, "studios", "studioA"), { name: "Renamed by a trainer" }));
    await assertFails(updateDoc(doc(trainer, "studios", "studioA"), { mindbodySiteId: "999" }));
  });

  it("keeps how often a studio asks Mindbody to administrators (AJ, Sep 28 2026)", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "trainers", "adminX"), {
        fullName: "Admin X",
        initials: "AX",
        role: "Admin",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
      });
    });
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertFails(updateDoc(doc(owner, "studios", "studioA"), { autoSyncEnabled: false }));
    await assertFails(updateDoc(doc(owner, "studios", "studioA"), { syncIntervalMinutes: 15 }));
    await assertFails(updateDoc(doc(owner, "studios", "studioA"), { name: "Studio A", syncIntervalMinutes: 15 }));
    await assertSucceeds(updateDoc(doc(owner, "studios", "studioA"), { name: "Studio A (West)" }));
    const admin = testEnv.authenticatedContext("adminX", { email: "adminx@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(admin, "studios", "studioA"), { autoSyncEnabled: false, syncIntervalMinutes: 60 }));
  });

  it("still lets any trainer's iPad write the schedule sync lease, and nothing beside it", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(trainer, "studios", "studioA"), { lastScheduleSyncAt: 1, scheduleSyncFailures: 0 }));
    await assertFails(updateDoc(doc(trainer, "studios", "studioA"), { lastScheduleSyncAt: 2, name: "Sneaked in" }));
    // The lean sync (Sep 25 2026): when the last whole-month pull succeeded.
    await assertSucceeds(updateDoc(doc(trainer, "studios", "studioA"), { lastDeepScheduleSyncAt: 3 }));
    await assertFails(updateDoc(doc(trainer, "studios", "studioA"), { lastDeepScheduleSyncAt: 4, autoSyncEnabled: false }));
  });

  // The cost plan (Sep 26 2026, D3b): the lease moved to its own document so
  // a stamp is no longer sent to every iPad in the company.
  it("lets any trainer's iPad claim the sync lease document, with the three numbers and nothing else", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const lease = doc(trainer, "studios", "studioA", "sync", "lease");
    await assertSucceeds(setDoc(lease, { lastScheduleSyncAt: 1 }, { merge: true }));
    await assertSucceeds(setDoc(lease, { scheduleSyncFailures: 0, lastScheduleSyncAt: 2 }, { merge: true }));
    await assertSucceeds(setDoc(lease, { lastDeepScheduleSyncAt: 3 }, { merge: true }));
    await assertSucceeds(getDoc(lease));
    await assertFails(setDoc(lease, { lastScheduleSyncAt: 4, name: "Sneaked in" }, { merge: true }));
    await assertFails(setDoc(lease, { lastScheduleSyncAt: "yesterday" }, { merge: true }));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "sync", "other"), { lastScheduleSyncAt: 1 }));
    await assertFails(deleteDoc(lease));
  });

  it("refuses the sync lease to someone signed in who is not a trainer", async () => {
    const stranger = testEnv.authenticatedContext("stranger", { email: "stranger@test.com" }).firestore();
    await assertFails(setDoc(doc(stranger, "studios", "studioA", "sync", "lease"), { lastScheduleSyncAt: 1 }));
  });

  it("lets anyone signed in read a trainer's counters, and nobody write them from the app (the cost plan, D3c)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "trainers", "trainerA", "stats", "rollups"), { sessionsCoached: 12 });
    });
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(trainer, "trainers", "trainerA", "stats", "rollups")));
    await assertFails(setDoc(doc(trainer, "trainers", "trainerA", "stats", "rollups"), { sessionsCoached: 999 }));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertFails(setDoc(doc(owner, "trainers", "trainerA", "stats", "rollups"), { sessionsCoached: 999 }));
  });

  it("keeps a person's announcement read-marks to themselves (the cost plan, D5)", async () => {
    const a = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(setDoc(doc(a, "announcementReads", "trainerA"), { ids: { n1: true } }, { merge: true }));
    await assertSucceeds(getDoc(doc(a, "announcementReads", "trainerA")));
    await assertFails(setDoc(doc(a, "announcementReads", "trainerB"), { ids: { n1: true } }));
    await assertFails(getDoc(doc(a, "announcementReads", "trainerB")));
    await assertFails(setDoc(doc(a, "announcementReads", "trainerA"), { ids: { n1: true }, role: "Admin" }, { merge: true }));
    await assertFails(setDoc(doc(a, "announcementReads", "trainerA"), { ids: "everything" }));
  });

  it("lets anyone signed in read the webhook watch, and nobody write it (the cost plan, A7)", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(trainer, "system", "mindbodyWebhook")));
    await assertFails(setDoc(doc(trainer, "system", "mindbodyWebhook"), { active: true }));
  });

  it("refuses a studio create to anyone below a franchise owner", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertFails(setDoc(doc(owner, "studios", "studioC"), { name: "Studio C", ownerId: "ownerA", timezone: "America/New_York" }));
  });

  it("counts the grant: a trainer given managedStudioIds leads that studio in the rules", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "trainers", "trainerA"), { managedStudioIds: ["studioA"] });
    });
    const granted = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(granted, "studios", "studioA"), { name: "Studio A, run by a trainer" }));
    await assertFails(updateDoc(doc(granted, "studios", "studioB"), { name: "Not granted here" }));
    // The grant reaches the other leader-only writes too: a team job.
    await assertSucceeds(
      setDoc(doc(granted, "studios", "studioA", "teamJobs", "g1"), {
        studioId: "studioA",
        title: "Deep clean",
        createdBy: { id: "trainerA", name: "Trainer A" },
        createdAt: serverTimestamp(),
        status: "open",
        parts: { p1: { label: "Leg press", order: 1 } },
        // jobFields() always writes both (features/relay/jobs); teamJobValid
        // requires them, and `people` was never a field on a team job.
        assignees: [],
        assigneeIds: [],
      }),
    );
  });

  it("never lets a trainer grant themselves, and lets their studio's leader grant them", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(updateDoc(doc(trainer, "trainers", "trainerA"), { managedStudioIds: ["studioA"] }));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(owner, "trainers", "trainerA"), { managedStudioIds: arrayUnion("studioA") }));
    // The grant is for the leader's OWN studio: a studio they do not run may
    // neither enter nor leave the list.
    await assertFails(updateDoc(doc(owner, "trainers", "trainerA"), { managedStudioIds: arrayUnion("studioB") }));
    await assertFails(updateDoc(doc(owner, "trainers", "trainerA"), { managedStudioIds: ["studioA", "studioB"] }));
    await assertSucceeds(updateDoc(doc(owner, "trainers", "trainerA"), { managedStudioIds: arrayRemove("studioA") }));
  });

  it("caps what an approval hands out: a studio's leader mints a trainer or a leader, never an owner or an administrator", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const fresh = (role: string, extra: Record<string, unknown> = {}) => ({
      fullName: "New Hire",
      initials: "NH",
      role,
      primaryHomeStudioId: "studioA",
      accessibleStudioIds: ["studioA"],
      activeGuestStudioIds: [],
      email: "new@test.com",
      ...extra,
    });
    await assertSucceeds(setDoc(doc(owner, "trainers", "hire1"), fresh("LifeTransformer")));
    await assertSucceeds(setDoc(doc(owner, "trainers", "hire2"), fresh("StudioLeader", { managedStudioIds: ["studioA"] })));
    await assertFails(setDoc(doc(owner, "trainers", "hire3"), fresh("Owner")));
    await assertFails(setDoc(doc(owner, "trainers", "hire4"), fresh("Admin")));
    // A grant for a studio the new person is not joining.
    await assertFails(setDoc(doc(owner, "trainers", "hire5"), fresh("LifeTransformer", { managedStudioIds: ["studioB"] })));
  });

  it("caps a role change the same way", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(owner, "trainers", "trainerA"), { role: "HeadTrainer" }));
    await assertFails(updateDoc(doc(owner, "trainers", "trainerA"), { role: "FranchiseOwner" }));
    await assertFails(updateDoc(doc(owner, "trainers", "trainerA"), { role: "Admin" }));
  });

  it("lets a studio's leader mark an access request approved", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "access_requests", "req1"), {
        fullName: "New Hire",
        email: "new@test.com",
        status: "Pending",
        userId: "hire1",
      });
    });
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(updateDoc(doc(owner, "access_requests", "req1"), { status: "Approved", approvedTrainerId: "hire1" }));
    const trainer = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(updateDoc(doc(trainer, "access_requests", "req1"), { status: "Approved" }));
  });

  it("lets a studio's leader post a notice to their own studio, and nothing wider", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const notice = (extra: Record<string, unknown>) => ({
      title: "Deep clean Friday",
      shortContent: "Floor closes at 3.",
      longContent: "",
      authorId: "ownerA",
      authorName: "Owner A",
      isActive: true,
      priority: "normal",
      ...extra,
    });
    await assertSucceeds(
      addDoc(collection(owner, "hub_announcements"), notice({ targetScope: "studio", targetId: "studioA", studioId: "studioA", targetStudioIds: ["studioA"] })),
    );
    await assertFails(
      addDoc(collection(owner, "hub_announcements"), notice({ targetScope: "studio", targetId: "studioB", studioId: "studioB", targetStudioIds: ["studioB"] })),
    );
    await assertFails(addDoc(collection(owner, "hub_announcements"), notice({ targetScope: "universal", targetId: "", studioId: "all", targetStudioIds: [] })));
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(
      addDoc(collection(trainer, "hub_announcements"), notice({ authorId: "trainerA", targetScope: "studio", targetId: "studioA", studioId: "studioA", targetStudioIds: ["studioA"] })),
    );
  });

  // ── OPERATIONS (Sep 19 2026) ────────────────────────────────────────────
  it("lets the studio's people read the weekly performance watch, refuses another studio's trainer, and lets nobody write it", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studios", "studioA", "watch", "performance"), {
        version: 1,
        studioId: "studioA",
        builtAt: "2026-09-20T07:00:00.000Z",
        rows: [{ clientId: "clientA", machineId: "m-leg-press", weight: 100, reps: 4, medianReps: 10, priorSets: 5, day: "2026-09-19", drop: 0.6 }],
        clients: 1,
      });
      // Openings' usual week (Sep 27 2026), written by the same Sunday job, the Demo studio's too.
      const openings = { v: 1, builtAt: "2026-09-27T07:00:00.000Z", tz: "America/New_York", row: 30, since: null, weeks: [], who: {}, agreed: {}, cells: {} };
      await setDoc(doc(ctx.firestore(), "studios", "studioA", "watch", "openings"), openings);
      await setDoc(doc(ctx.firestore(), "studios", "demo-studio", "watch", "openings"), openings);
    });
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(trainer, "studios", "studioA", "watch", "performance")));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(owner, "studios", "studioA", "watch", "performance")));
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(doc(other, "studios", "studioA", "watch", "performance")));
    await assertFails(updateDoc(doc(owner, "studios", "studioA", "watch", "performance"), { rows: [] }));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "watch", "anything"), { rows: [] }));
    // watch/openings: the studio's people read it, another studio's trainer doesn't, the Demo studio's is everyone's, and nobody writes it.
    await assertSucceeds(getDoc(doc(trainer, "studios", "studioA", "watch", "openings")));
    await assertFails(getDoc(doc(other, "studios", "studioA", "watch", "openings")));
    await assertSucceeds(getDoc(doc(other, "studios", "demo-studio", "watch", "openings")));
    await assertFails(setDoc(doc(owner, "studios", "studioA", "watch", "openings"), { cells: {} }));
  });

  it("lets a studio's leader offer one of its machines to the catalog, as themselves, pending — and only withdraw it afterwards", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const offer = (extra: Record<string, unknown> = {}) => ({
      studioId: "studioA",
      studioName: "Studio A",
      machineId: "sm-studioA-sled",
      definition: { name: "Sled" },
      basedOn: "m-leg-press",
      submittedBy: "ownerA",
      submittedByName: "Owner A",
      note: "Everyone loves it.",
      status: "pending",
      submittedAt: serverTimestamp(),
      ...extra,
    });
    await assertSucceeds(setDoc(doc(owner, "catalogSubmissions", "sub1"), offer()));
    await assertFails(setDoc(doc(owner, "catalogSubmissions", "sub2"), offer({ status: "published" })));
    await assertFails(setDoc(doc(owner, "catalogSubmissions", "sub3"), offer({ submittedBy: "someone-else" })));
    await assertFails(setDoc(doc(owner, "catalogSubmissions", "sub4"), offer({ studioId: "studioB" })));
    await assertFails(setDoc(doc(owner, "catalogSubmissions", "sub5"), offer({ extra: "field" })));
    // Corporate decides: the studio may withdraw, never publish.
    await assertFails(updateDoc(doc(owner, "catalogSubmissions", "sub1"), { status: "published" }));
    await assertSucceeds(updateDoc(doc(owner, "catalogSubmissions", "sub1"), { status: "withdrawn" }));
    // A trainer at the studio may not offer.
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertFails(setDoc(doc(trainer, "catalogSubmissions", "sub6"), offer({ submittedBy: "trainerA" })));
    // The studio reads its own; another studio's leader does not.
    await assertSucceeds(getDoc(doc(owner, "catalogSubmissions", "sub1")));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "trainers", "ownerB"), {
        fullName: "Owner B",
        initials: "OB",
        role: "StudioOwner",
        primaryHomeStudioId: "studioB",
        accessibleStudioIds: ["studioB"],
      });
    });
    const ownerB = testEnv.authenticatedContext("ownerB", { email: "ownerb@test.com" }).firestore();
    await assertFails(getDoc(doc(ownerB, "catalogSubmissions", "sub1")));
  });

  // ── OPERATIONS OVERHAUL (Sep 19 2026) ───────────────────────────────────
  it("the watchlist: the studio's leader snoozes, dismisses and clears a client; a trainer only reads; another studio's trainer reads nothing", async () => {
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    const ref = (db: typeof owner) => doc(db, "studios", "studioA", "watchlist", "clientA");
    await assertSucceeds(
      setDoc(ref(owner), {
        clientId: "clientA",
        snoozedUntil: "2026-10-01",
        dismissedAt: null,
        dismissedBy: null,
        dismissedByName: null,
        lastVisitAtDismissal: null,
        nextBookingAtDismissal: null,
        updatedAt: serverTimestamp(),
      }),
    );
    await assertSucceeds(updateDoc(ref(owner), { snoozedUntil: null, dismissedAt: "2026-09-19", dismissedBy: "ownerA", dismissedByName: "Owner A" }));
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    await assertSucceeds(getDoc(ref(trainer)));
    await assertFails(updateDoc(ref(trainer), { snoozedUntil: "2026-12-01" }));
    await assertFails(deleteDoc(ref(trainer)));
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(ref(other)));
    await assertSucceeds(deleteDoc(ref(owner)));
  });

  it("acknowledgements: anyone who works at the studio may acknowledge, only as themselves, and nobody deletes one", async () => {
    const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
    const ack = (by: string) => ({
      sourceKind: "incident",
      clientId: "clientA",
      acknowledgedAt: serverTimestamp(),
      acknowledgedBy: by,
      acknowledgedByName: "Trainer A",
    });
    await assertSucceeds(setDoc(doc(trainer, "studios", "studioA", "acknowledgements", "incident:inc1"), ack("trainerA")));
    await assertFails(setDoc(doc(trainer, "studios", "studioA", "acknowledgements", "incident:inc2"), ack("ownerA")));
    await assertFails(deleteDoc(doc(trainer, "studios", "studioA", "acknowledgements", "incident:inc1")));
    const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
    await assertSucceeds(getDoc(doc(owner, "studios", "studioA", "acknowledgements", "incident:inc1")));
    await assertFails(deleteDoc(doc(owner, "studios", "studioA", "acknowledgements", "incident:inc1")));
    const other = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
    await assertFails(getDoc(doc(other, "studios", "studioA", "acknowledgements", "incident:inc1")));
    await assertFails(setDoc(doc(other, "studios", "studioA", "acknowledgements", "incident:inc3"), ack("trainerB")));
  });

  // ---------------------------------------------------------------------
  // Claude Experiment, Sep 20 2026 — the two rules lines that read as typos.
  //
  // Both were `if isAuthenticated()`, which in this codebase means "any
  // signed-in Google account", NOT "a trainer": a person sitting in
  // AccessRequestView with no trainers/{uid} document passes it. These two
  // tests pin the distinction, because it is the one the old rules lost.
  // ---------------------------------------------------------------------

  it("clientMachineSettings: a trainer may delete, a signed-in non-trainer may not", async () => {
    const settingId = "clientA_m-leg-press";
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "clientMachineSettings", settingId), {
        clientId: "clientA",
        machineId: "m-leg-press",
        settings: { Seat: "4" },
      });
    });

    // Someone with a Google account but no trainer profile: read is open by
    // design (a known deferral), but deleting another studio's client's
    // set-up must not be.
    const stranger = testEnv
      .authenticatedContext("nobody-uid", { email: "stranger@example.com" })
      .firestore();
    await assertFails(deleteDoc(doc(stranger, "clientMachineSettings", settingId)));

    // A real trainer still may — this is floor work, and the floor is never
    // blocked.
    const trainer = testEnv
      .authenticatedContext("trainerA", { email: "trainera@test.com" })
      .firestore();
    await assertSucceeds(deleteDoc(doc(trainer, "clientMachineSettings", settingId)));
  });

  it("settingHistory: a trainer appends, nobody rewrites or erases, a non-trainer cannot write at all", async () => {
    const history = (db: any) =>
      collection(db, "machines", "m-leg-press", "settingHistory");

    const trainer = testEnv
      .authenticatedContext("trainerA", { email: "trainera@test.com" })
      .firestore();
    await assertSucceeds(
      addDoc(history(trainer), {
        clientId: "clientA",
        changes: [{ label: "Seat", from: "3", to: "4" }],
        reason: "taller shoe",
        authorId: "trainerA",
        at: serverTimestamp(),
      }),
    );

    // Seed a row directly so the update/delete assertions are about the rule,
    // not about the row's existence.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), "machines", "m-leg-press", "settingHistory", "row1"),
        { clientId: "clientA", authorId: "trainerA", reason: "original" },
      );
    });

    const row = (db: any) =>
      doc(db, "machines", "m-leg-press", "settingHistory", "row1");

    // The trail is append-only: not even its own author may revise it.
    await assertSucceeds(getDoc(row(trainer)));
    await assertFails(updateDoc(row(trainer), { reason: "rewritten" }));
    await assertFails(deleteDoc(row(trainer)));

    const stranger = testEnv
      .authenticatedContext("nobody-uid", { email: "stranger@example.com" })
      .firestore();
    await assertFails(addDoc(history(stranger), { clientId: "clientA" }));
    await assertFails(updateDoc(row(stranger), { reason: "rewritten" }));
    await assertFails(deleteDoc(row(stranger)));
  });

  /* ================================================================== *
   * DEMO MODE (Sep 20 2026)
   *
   * `demo-studio` is a real studio full of people who do not exist, and
   * every signed-in trainer has the run of it. These assertions are the
   * other half of src/features/demo-mode/access.ts: the app must never
   * offer a button the database refuses, and — the direction that matters
   * more — widening the demo studio must not have widened anything else.
   * Every "denies" below is a test that the blast radius is one studio.
   * ================================================================== */
  describe("Note dismissals", () => {
    // "No need to remind me" is one trainer saying what they already know.
    // It is private by construction: a document per uid, and the rule is the
    // only thing standing between that and a colleague reading it.
    it("lets a trainer keep their own dismissals and nobody else's", async () => {
      const mine = testEnv
        .authenticatedContext("trainerA", { email: "trainera@test.com" })
        .firestore();
      const theirs = testEnv
        .authenticatedContext("trainerB", { email: "trainerb@test.com" })
        .firestore();

      await assertSucceeds(
        setDoc(doc(mine, "noteDismissals", "trainerA"), { threads: { thread1: serverTimestamp() } }),
      );
      await assertSucceeds(getDoc(doc(mine, "noteDismissals", "trainerA")));

      // Nobody reads anybody else's, whatever their role.
      await assertFails(getDoc(doc(theirs, "noteDismissals", "trainerA")));
      await assertFails(
        setDoc(doc(theirs, "noteDismissals", "trainerA"), { threads: {} }),
      );
    });

    it("denies a signed-out reader entirely", async () => {
      const anon = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(anon, "noteDismissals", "trainerA")));
    });
  });

  describe("Demo Mode", () => {
    const DEMO = "demo-studio";

    /** trainerB is a plain LifeTransformer whose home is studioB. */
    const plainTrainer = () =>
      testEnv
        .authenticatedContext("trainerB", { email: "trainerb@test.com" })
        .firestore();

    it("lets any signed-in trainer create the demo studio, and no other", async () => {
      const db = plainTrainer();
      await assertSucceeds(
        setDoc(doc(db, "studios", DEMO), { name: "Demo Mode", isDemo: true }),
      );
      // The id is a literal in the rule, so this grants exactly one studio.
      await assertFails(
        setDoc(doc(db, "studios", "studioC"), { name: "Somewhere Real" }),
      );
      await assertFails(
        setDoc(doc(db, "studios", "demo-studio-2"), { name: "Nearly", isDemo: true }),
      );
    });

    it("lets a plain trainer run the demo studio, and still not their neighbour's", async () => {
      const db = plainTrainer();
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), "studios", DEMO), { name: "Demo Mode", isDemo: true });
      });
      await assertSucceeds(updateDoc(doc(db, "studios", DEMO), { sessionMinutes: 30 }));
      // studioA is somebody else's studio and stays somebody else's.
      await assertFails(updateDoc(doc(db, "studios", "studioA"), { sessionMinutes: 30 }));
    });

    it("lets the seeder lay down its three trainers", async () => {
      const db = plainTrainer();
      const payload = {
        fullName: "Hob Hayward",
        initials: "HH",
        role: "StudioLeader",
        primaryHomeStudioId: DEMO,
        accessibleStudioIds: [DEMO],
        activeGuestStudioIds: [],
        pendingClaim: true,
        isDemo: true,
      };
      await assertSucceeds(setDoc(doc(db, "trainers", "demo-trainer-hob"), payload));
      // Re-seeding rewrites the same document whole.
      await assertSucceeds(setDoc(doc(db, "trainers", "demo-trainer-hob"), payload));
    });

    it("refuses a demo trainer that reaches outside the demo studio", async () => {
      const db = plainTrainer();
      const base = {
        fullName: "Not Really",
        initials: "NR",
        role: "LifeTransformer",
        primaryHomeStudioId: DEMO,
        accessibleStudioIds: [DEMO],
        isDemo: true,
      };
      // An elevated role.
      await assertFails(
        setDoc(doc(db, "trainers", "demo-trainer-x"), { ...base, role: "Admin" }),
      );
      // Access to a real studio, by any of the three doors.
      await assertFails(
        setDoc(doc(db, "trainers", "demo-trainer-x"), {
          ...base,
          accessibleStudioIds: [DEMO, "studioA"],
        }),
      );
      await assertFails(
        setDoc(doc(db, "trainers", "demo-trainer-x"), { ...base, ownedStudioIds: ["studioA"] }),
      );
      await assertFails(
        setDoc(doc(db, "trainers", "demo-trainer-x"), { ...base, managedStudioIds: ["studioA"] }),
      );
      // Unflagged, or named as if it were a real person's document.
      await assertFails(
        setDoc(doc(db, "trainers", "demo-trainer-x"), { ...base, isDemo: false }),
      );
      await assertFails(setDoc(doc(db, "trainers", "someone-else"), base));
    });

    it("never lets a real trainer document be turned into a demo one", async () => {
      const db = plainTrainer();
      // trainerA exists and is not a demo document; the id does not match
      // either, so both halves of the update clause refuse it.
      await assertFails(updateDoc(doc(db, "trainers", "trainerA"), { isDemo: true }));
    });

    it("lets a plain trainer work with demo clients and sessions", async () => {
      const db = plainTrainer();
      await assertSucceeds(
        setDoc(doc(db, "clients", "demo-client-elanor"), {
          firstName: "Elanor",
          lastName: "Gardner",
          isActive: true,
          remainingSessions: 54,
          homeStudioId: DEMO,
          isDemo: true,
        }),
      );
      await assertSucceeds(
        setDoc(doc(db, "sessions", "demo-session-elanor-001"), {
          clientId: "demo-client-elanor",
          hostedAtStudioId: DEMO,
          clientHomeStudioId: DEMO,
          date: "2026-09-01",
          sessionNumber: 1,
          trainerInitials: "HH",
          isDemo: true,
        }),
      );
      await assertSucceeds(
        setDoc(doc(db, "exerciseLogs", "demo-session-elanor-001_m-leg-press"), {
          sessionId: "demo-session-elanor-001",
          machineId: "m-leg-press",
          clientId: "demo-client-elanor",
          studioId: DEMO,
          isDemo: true,
        }),
      );
      await assertSucceeds(
        setDoc(doc(db, "clientMachineSettings", "demo-client-elanor_m-leg-press"), {
          clientId: "demo-client-elanor",
          machineId: "m-leg-press",
          settings: { Gap: "4" },
          isDemo: true,
        }),
      );
    });

    it("does not let the demo flag carry a client into a real studio", async () => {
      // The thing that would make all of this worthless: `isDemo: true`
      // must never be a key. The studio id is what decides, always.
      const db = plainTrainer();
      await assertFails(
        setDoc(doc(db, "clients", "sneaky"), {
          firstName: "Not",
          lastName: "Yours",
          isActive: true,
          remainingSessions: 1,
          homeStudioId: "studioA",
          isDemo: true,
        }),
      );
    });

    it("still refuses the renewal snapshot on a demo client", async () => {
      // Demo Mode widens who may act; it does not change what anybody may
      // write. `renewal` belongs to the nightly job, everywhere.
      const db = plainTrainer();
      await assertFails(
        setDoc(doc(db, "clients", "demo-client-rosie"), {
          firstName: "Rosie",
          lastName: "Cotton",
          isActive: true,
          remainingSessions: 3,
          homeStudioId: DEMO,
          isDemo: true,
          renewal: { version: 1, situation: "on-track" },
        }),
      );
    });

    it("gives nobody anything when they are not signed in", async () => {
      const db = testEnv.unauthenticatedContext().firestore();
      await assertFails(setDoc(doc(db, "studios", DEMO), { name: "Demo Mode" }));
      await assertFails(
        setDoc(doc(db, "trainers", "demo-trainer-hob"), {
          fullName: "Hob Hayward",
          initials: "HH",
          role: "StudioLeader",
          primaryHomeStudioId: DEMO,
          accessibleStudioIds: [DEMO],
          isDemo: true,
        }),
      );
    });

    it("gives nothing to a signed-in user with no trainer profile", async () => {
      // Every demo clause goes through isAnyAuthenticatedTrainer(), so a bare
      // Auth account is not enough — the same bar as the rest of the app.
      const db = testEnv
        .authenticatedContext("nobody-uid", { email: "stranger@example.com" })
        .firestore();
      await assertFails(setDoc(doc(db, "studios", DEMO), { name: "Demo Mode" }));
      await assertFails(
        setDoc(doc(db, "clients", "demo-client-x"), {
          firstName: "X",
          lastName: "Y",
          isActive: true,
          remainingSessions: 1,
          homeStudioId: DEMO,
          isDemo: true,
        }),
      );
    });
  });

  /* ================================================================== *
   * FORD — WHO CAN READ HER LIFE (client codex, phase 1, Sep 24 2026)
   *
   * Written against the rules AS THEY ARE: the round changes no rule. The
   * read rule tests resource.data.studioId, so a LIST is only allowed when
   * the query itself pins the studio. useClientFord listed the client's FORD
   * with no filter from Sep 15 until this round, which is why every trainer
   * below franchise owner saw an empty FORD. The app now filters on the
   * client's home studio (useClientFord.ts, `fordStudioIdOf`); these pin that
   * the filtered query works for everyone who should read it, that the
   * unfiltered one does not, and that a cross-train visitor — who CAN read
   * the client document — cannot read their FORD.
   * ================================================================== */
  describe("FORD — who can read her life (client codex)", () => {
    const as = (uid: string) =>
      testEnv.authenticatedContext(uid, { email: `${uid}@test.com` }).firestore();

    /** The app's exact query (useClientFord.ts): equality on studioId, a cap, no orderBy. */
    const appQuery = (db: ReturnType<typeof as>, clientId = "clientA", studioId = "studioA") =>
      query(collection(db, "clients", clientId, "ford"), where("studioId", "==", studioId), limit(500));

    const person = (role: string, home: string, extra: Record<string, unknown> = {}) => ({
      fullName: `${role} ${home}`,
      initials: "XX",
      role,
      primaryHomeStudioId: home,
      accessibleStudioIds: [home],
      ...extra,
    });

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "studios", "studioC"), { name: "Studio C" });
        // Carol's home is studio A; she has approved cross-training at B.
        await setDoc(doc(db, "clients", "clientA"), {
          firstName: "Carol",
          lastName: "Tester",
          isActive: true,
          remainingSessions: 10,
          homeStudioId: "studioA",
          approvedCrossTrainStudioIds: ["studioB"],
        });
        await setDoc(doc(db, "clients", "clientA", "ford", "f1"), {
          clientId: "clientA",
          studioId: "studioA",
          pillar: "family",
          body: "Wife is Karen.",
          isPinned: true,
          authorId: "trainerA",
          isArchived: false,
        });
        await setDoc(doc(db, "trainers", "trainerC"), person("LifeTransformer", "studioC"));
        // THE GRANT: helps run studio A, whatever their own home.
        await setDoc(
          doc(db, "trainers", "granted"),
          person("LifeTransformer", "studioC", { managedStudioIds: ["studioA"] }),
        );
        // A guest pass at studio A.
        await setDoc(
          doc(db, "trainers", "guest"),
          person("LifeTransformer", "studioC", { activeGuestStudioIds: ["studioA"] }),
        );
        await setDoc(doc(db, "trainers", "franchise"), person("FranchiseOwner", "studioC"));
        await setDoc(doc(db, "trainers", "admin"), person("Admin", "studioC"));
        // A Demo Mode client: every signed-in trainer has the run of it.
        await setDoc(doc(db, "clients", "demo-client-x"), {
          firstName: "Demo",
          lastName: "Client",
          isActive: true,
          remainingSessions: 10,
          homeStudioId: "demo-studio",
          isDemo: true,
        });
        await setDoc(doc(db, "clients", "demo-client-x", "ford", "d1"), {
          clientId: "demo-client-x",
          studioId: "demo-studio",
          pillar: null,
          body: "Off to Italy in May",
          authorId: "trainerA",
          isArchived: false,
        });
      });
    });

    it("lets the home studio's trainer read a detail and list with the app's filtered query", async () => {
      const db = as("trainerA");
      await assertSucceeds(getDoc(doc(db, "clients", "clientA", "ford", "f1")));
      await assertSucceeds(getDocs(appQuery(db)));
    });

    it("refuses the same trainer the list WITHOUT the studio filter — the bug this round fixed", async () => {
      // Every document in the list is readable by trainerA one by one; the
      // list is still refused, because rules are not filters: Firestore will
      // not run a query it cannot prove stays inside a studio the caller
      // trains at. This is why useClientFord must name the studio.
      const db = as("trainerA");
      await assertFails(getDocs(collection(db, "clients", "clientA", "ford")));
      await assertFails(getDocs(query(collection(db, "clients", "clientA", "ford"), limit(500))));
    });

    it("counts the grant and a guest pass at the client's studio", async () => {
      for (const uid of ["granted", "guest"]) {
        const db = as(uid);
        await assertSucceeds(getDoc(doc(db, "clients", "clientA", "ford", "f1")));
        await assertSucceeds(getDocs(appQuery(db)));
      }
    });

    it("lets a franchise owner and an administrator read it too", async () => {
      for (const uid of ["franchise", "admin"]) {
        const db = as(uid);
        await assertSucceeds(getDoc(doc(db, "clients", "clientA", "ford", "f1")));
        await assertSucceeds(getDocs(appQuery(db)));
      }
    });

    it("refuses a cross-train visitor her FORD, although they can read her client record", async () => {
      // trainerB works at studio B, which Carol approved for cross-training:
      // the client document is theirs to read (so she is trainable there),
      // her home life is not. This is why 'In one line' and every other FORD
      // text stays off the client document.
      const db = as("trainerB");
      await assertSucceeds(getDoc(doc(db, "clients", "clientA")));
      await assertFails(getDoc(doc(db, "clients", "clientA", "ford", "f1")));
      await assertFails(getDocs(appQuery(db)));
    });

    it("refuses a trainer at a studio with no tie to her at all", async () => {
      const db = as("trainerC");
      await assertFails(getDoc(doc(db, "clients", "clientA", "ford", "f1")));
      await assertFails(getDocs(appQuery(db)));
    });

    it("lets any trainer read a Demo Mode client's FORD with the same query", async () => {
      const db = as("trainerB");
      await assertSucceeds(getDocs(appQuery(db, "demo-client-x", "demo-studio")));
    });
  });

  /* ================================================================== *
   * FORD'S NEW FIELDS — IN ONE LINE AND FOLLOW UP NEXT TIME (client
   * codex, phase 11, AJ's decision 3). NO rules change: both ride on the
   * ford block as it is.
   *
   *   - In one line is a FORD document with the fixed id `one-line`
   *     (src/features/ford/one-line.ts), stamped with the client's studio
   *     and the Auth uid, stored archived with no pillar. saveFordOneLine
   *     sends the whole document the first time (setDoc) and only the words
   *     and who wrote them after (updateDoc). It keeps FORD's read scope —
   *     which is why it is not on the client document, where a cross-train
   *     studio could read it.
   *   - Follow up next time is three fields on a detail (followUp,
   *     followUpAt, followUpBy); the ford block has no allowed-keys list,
   *     so an update adding or clearing them passes the rule every edit
   *     passes.
   *   - The delete rule lets the AUTHOR delete a pillar-null document of
   *     their own — the one-line document included. No screen offers it
   *     (the sweep's discard only lists unfiled captures, and the line is
   *     archived, so it is never one); pinned here so nobody is surprised.
   * ================================================================== */
  describe("FORD — In one line and Follow up next time (client codex)", () => {
    const as = (uid: string) =>
      testEnv.authenticatedContext(uid, { email: `${uid}@test.com` }).firestore();

    const lineRef = (db: ReturnType<typeof as>) => doc(db, "clients", "clientA", "ford", "one-line");

    /** saveFordOneLine's create, exactly (ford-write.ts). */
    const firstLine = (uid: string, body = "Retired hygienist, pickleball regular") => ({
      kind: "one-line",
      clientId: "clientA",
      studioId: "studioA",
      pillar: null,
      body,
      subject: null,
      isPinned: true,
      eventDate: null,
      recurrence: "none",
      effectiveFrom: null,
      effectiveUntil: null,
      repeat: null,
      reviewedAt: null,
      opportunity: null,
      followUp: null,
      followUpAt: null,
      followUpBy: null,
      occurredAt: new Date(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      authorId: uid,
      authorName: `Name ${uid}`,
      authorInitials: "XX",
      origin: "profile",
      sessionId: null,
      isArchived: true,
    });

    /** saveFordOneLine's rewrite, exactly: the words and who wrote them. */
    const rewrite = (uid: string, body: string) => ({
      body,
      authorId: uid,
      authorName: `Name ${uid}`,
      authorInitials: "XX",
      occurredAt: new Date(),
      updatedAt: serverTimestamp(),
    });

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "clients", "clientA"), {
          firstName: "Carol",
          lastName: "Tester",
          isActive: true,
          remainingSessions: 10,
          homeStudioId: "studioA",
          approvedCrossTrainStudioIds: ["studioB"],
        });
        // A second trainer at the client's home studio: the line is the team's.
        await setDoc(doc(db, "trainers", "trainerA2"), {
          fullName: "Trainer A2",
          initials: "A2",
          role: "LifeTransformer",
          primaryHomeStudioId: "studioA",
          accessibleStudioIds: ["studioA"],
        });
        await setDoc(doc(db, "clients", "clientA", "ford", "f1"), {
          clientId: "clientA",
          studioId: "studioA",
          pillar: "recreation",
          body: "New hiking boots for the Camino",
          isPinned: false,
          authorId: "trainerA",
          isArchived: false,
        });
      });
    });

    it("lets a home trainer write the first line as themselves, and no one as someone else", async () => {
      await assertFails(setDoc(lineRef(as("trainerA")), firstLine("trainerA2")));
      await assertSucceeds(setDoc(lineRef(as("trainerA")), firstLine("trainerA")));
    });

    it("refuses a first line stamped with another studio, or with no words", async () => {
      await assertFails(setDoc(lineRef(as("trainerA")), { ...firstLine("trainerA"), studioId: "studioB" }));
      await assertFails(setDoc(lineRef(as("trainerA")), firstLine("trainerA", "")));
    });

    it("lets anyone on the home team rewrite it, and clear it — but never walk it to another studio or client", async () => {
      await assertSucceeds(setDoc(lineRef(as("trainerA")), firstLine("trainerA")));
      await assertSucceeds(updateDoc(lineRef(as("trainerA2")), rewrite("trainerA2", "Walking the Camino with Tom in May")));
      await assertSucceeds(updateDoc(lineRef(as("trainerA2")), rewrite("trainerA2", "")));
      await assertFails(updateDoc(lineRef(as("trainerA2")), { ...rewrite("trainerA2", "x"), studioId: "studioB" }));
      await assertFails(updateDoc(lineRef(as("trainerA2")), { ...rewrite("trainerA2", "x"), clientId: "clientB" }));
    });

    it("takes the create again as a rewrite over a cleared line — saveFordOneLine's fallback when none is showing", async () => {
      await assertSucceeds(setDoc(lineRef(as("trainerA")), firstLine("trainerA")));
      await assertSucceeds(updateDoc(lineRef(as("trainerA")), rewrite("trainerA", "")));
      await assertSucceeds(setDoc(lineRef(as("trainerA2")), firstLine("trainerA2", "A new line")));
    });

    it("arrives in the app's one FORD query, for the home team", async () => {
      await assertSucceeds(setDoc(lineRef(as("trainerA")), firstLine("trainerA")));
      const snap = await assertSucceeds(
        getDocs(query(collection(as("trainerA2"), "clients", "clientA", "ford"), where("studioId", "==", "studioA"), limit(500))),
      );
      expect(snap.docs.map((d) => d.id).sort()).toEqual(["f1", "one-line"]);
    });

    it("refuses a cross-train visitor the line, to read or to write — although they can read her client record", async () => {
      await assertSucceeds(setDoc(lineRef(as("trainerA")), firstLine("trainerA")));
      const visitor = as("trainerB");
      await assertSucceeds(getDoc(doc(visitor, "clients", "clientA")));
      await assertFails(getDoc(lineRef(visitor)));
      await assertFails(updateDoc(lineRef(visitor), rewrite("trainerB", "Not theirs to write")));
      await assertFails(setDoc(lineRef(visitor), firstLine("trainerB")));
    });

    it("lets its last author delete it (no screen offers that) and refuses everyone else", async () => {
      await assertSucceeds(setDoc(lineRef(as("trainerA")), firstLine("trainerA")));
      await assertFails(deleteDoc(lineRef(as("trainerA2"))));
      await assertFails(deleteDoc(lineRef(as("trainerB"))));
      await assertSucceeds(deleteDoc(lineRef(as("trainerA"))));
    });

    it("lets a home trainer add a follow-up to a detail, and clear it", async () => {
      const f1 = doc(as("trainerA2"), "clients", "clientA", "ford", "f1");
      await assertSucceeds(
        updateDoc(f1, {
          followUp: "How did the new boots do on the long walk?",
          followUpAt: new Date(),
          followUpBy: "Trainer A2",
          updatedAt: serverTimestamp(),
        }),
      );
      await assertSucceeds(updateDoc(f1, { followUp: null, followUpAt: null, followUpBy: null, updatedAt: serverTimestamp() }));
      // A cross-train visitor may not touch it.
      await assertFails(
        updateDoc(doc(as("trainerB"), "clients", "clientA", "ford", "f1"), { followUp: "Theirs?", updatedAt: serverTimestamp() }),
      );
    });

    it("lets a new detail carry its follow-up from the start", async () => {
      await assertSucceeds(
        addDoc(collection(as("trainerA"), "clients", "clientA", "ford"), {
          clientId: "clientA",
          studioId: "studioA",
          pillar: "family",
          body: "Sister visiting from Arizona in April",
          followUp: "Did her sister make it?",
          followUpAt: new Date(),
          followUpBy: "Trainer A",
          authorId: "trainerA",
          isArchived: false,
        }),
      );
    });
  });

  /* ================================================================== *
   * BODY & PULSE READS (client codex, phase 1). Existing policy, pinned:
   * the record reads a client's newest sessions from the journal's own
   * listener (useClientJournal, `recentSessions`) and her InBody scans, and
   * both are scoped by CLIENT, so an approved cross-train visitor reads them
   * where they could not read her FORD.
   * ================================================================== */
  describe("Body & Pulse reads (client codex)", () => {
    const as = (uid: string) =>
      testEnv.authenticatedContext(uid, { email: `${uid}@test.com` }).firestore();

    /** useClientJournal's sessions listener, exactly. */
    const newestSessions = (db: ReturnType<typeof as>) =>
      query(collection(db, "sessions"), where("clientId", "==", "clientA"), orderBy("date", "desc"), limit(40));

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "clients", "clientA"), {
          firstName: "Carol",
          lastName: "Tester",
          isActive: true,
          remainingSessions: 10,
          homeStudioId: "studioA",
          approvedCrossTrainStudioIds: ["studioB"],
        });
        await setDoc(doc(db, "sessions", "sA1"), {
          clientId: "clientA",
          hostedAtStudioId: "studioA",
          trainerId: "trainerA",
          date: "2026-09-01",
        });
        await setDoc(doc(db, "clients", "clientA", "inbodyScans", "scan1"), {
          clientId: "clientA",
          studioId: "studioA",
          testedAt: "2026-09-02",
        });
        await setDoc(doc(db, "trainers", "trainerC"), {
          fullName: "Trainer C",
          initials: "TC",
          role: "LifeTransformer",
          primaryHomeStudioId: "studioC",
          accessibleStudioIds: ["studioC"],
        });
      });
    });

    it("lets the home trainer and an approved cross-trainer list her 40 newest sessions, and nobody else", async () => {
      await assertSucceeds(getDocs(newestSessions(as("trainerA"))));
      await assertSucceeds(getDocs(newestSessions(as("trainerB"))));
      await assertFails(getDocs(newestSessions(as("trainerC"))));
    });

    it("lets an approved cross-trainer read her InBody scans", async () => {
      await assertSucceeds(getDocs(collection(as("trainerB"), "clients", "clientA", "inbodyScans")));
      await assertFails(getDocs(collection(as("trainerC"), "clients", "clientA", "inbodyScans")));
    });
  });

  /* ================================================================== *
   * STUDIO INBODY VARIATION (client codex, phase 2). NO rules change:
   * `studios/{id}.inbodyVariation` rides on the existing studio update rule,
   * which already lets a studio's own leaders (a leader role there, or the
   * grant), franchise owners and administrators write it — and nobody else.
   * These pin that, with the exact writes InBodyVariationPanel sends: the
   * whole map signed with the Auth uid, and deleteField() for "back to Max
   * Strength's defaults". Everyone signed in may read a studio already.
   * ================================================================== */
  describe("Studio InBody variation (client codex)", () => {
    const as = (uid: string) =>
      testEnv.authenticatedContext(uid, { email: `${uid}@test.com` }).firestore();

    /** InBodyVariationPanel's save, via features/inbody/variation.ts variationWrite. */
    const ownNumbers = (uid: string) => ({
      inbodyVariation: {
        skeletalMuscleMassLb: 2,
        bodyFatMassLb: 4,
        percentBodyFat: 2,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      },
    });

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const person = (role: string, home: string, extra: Record<string, unknown> = {}) => ({
          fullName: `${role} ${home}`,
          initials: "XX",
          role,
          primaryHomeStudioId: home,
          accessibleStudioIds: [home],
          ...extra,
        });
        await setDoc(doc(db, "trainers", "granted"), person("LifeTransformer", "studioB", { managedStudioIds: ["studioA"] }));
        await setDoc(doc(db, "trainers", "franchise"), person("FranchiseOwner", "studioB"));
        await setDoc(doc(db, "trainers", "admin"), person("Admin", "studioB"));
      });
    });

    it("lets the studio's own leader set its numbers and go back to the defaults", async () => {
      const db = as("ownerA");
      await assertSucceeds(updateDoc(doc(db, "studios", "studioA"), ownNumbers("ownerA")));
      await assertSucceeds(updateDoc(doc(db, "studios", "studioA"), { inbodyVariation: deleteField() }));
    });

    it("counts the grant, and a franchise owner and an administrator", async () => {
      for (const uid of ["granted", "franchise", "admin"]) {
        await assertSucceeds(updateDoc(doc(as(uid), "studios", "studioA"), ownNumbers(uid)));
      }
    });

    it("refuses a trainer, and a leader on another studio", async () => {
      await assertFails(updateDoc(doc(as("trainerA"), "studios", "studioA"), ownNumbers("trainerA")));
      // Removing numbers a studio HAS is refused too. (Removing a field that
      // is not there changes nothing, so the rule's sync-lease clause — "only
      // these keys changed" — lets that no-op through; that is harmless.)
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "studios", "studioA"), ownNumbers("ownerA"));
      });
      await assertFails(updateDoc(doc(as("trainerA"), "studios", "studioA"), { inbodyVariation: deleteField() }));
      await assertFails(updateDoc(doc(as("ownerA"), "studios", "studioB"), ownNumbers("ownerA")));
      // The grant is for studio A only.
      await assertFails(updateDoc(doc(as("granted"), "studios", "studioB"), ownNumbers("granted")));
    });

    it("lets any trainer read the numbers, as every studio document already is", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), "studios", "studioA"), { inbodyVariation: { skeletalMuscleMassLb: 2 } });
      });
      await assertSucceeds(getDoc(doc(as("trainerB"), "studios", "studioA")));
    });
  });
});

// ── A CROSS-TRAIN VISITOR FINISHES A SESSION (Sep 24 2026) ──────────────
//
// A trainer at studio A, whose client (home studio B) is approved to train at
// A, could open the client and log every set, but Finish was refused in full:
// the finish batch moves the client's totals, and only the home studio could
// change the client. These replay the batch as completeWorkoutSession writes
// it (src/lib/sync-utils.ts), at a real session's size, and check the visitor
// can move the session's totals and nothing else.
describe("a cross-train visitor's session", () => {
  const CLIENT = "visitorClient";
  const SESSION = "visitSession";
  const MACHINES = ["m-leg-press", "m-pulldown", "m-chest-press", "m-compound-row", "m-lumbar", "m-hip-abd", "m-hip-add", "m-neck"];

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // trainerA works at studioA; the client's home is studioB, approved for A.
      await setDoc(doc(db, "clients", CLIENT), {
        firstName: "Casey", lastName: "Visitor", isActive: true, remainingSessions: 10,
        homeStudioId: "studioB", approvedCrossTrainStudioIds: ["studioA"],
        completedSessions: 40, sessionCount: 40,
      });
      await setDoc(doc(db, "sessions", SESSION), {
        clientId: CLIENT, trainerId: "trainerA", hostedAtStudioId: "studioA",
        homeStudioId: "studioB", clientHomeStudioId: "studioB",
        status: "In Progress", sessionNumber: 41, date: "2026-09-24", trainerInitials: "TA",
      });
      for (const m of MACHINES) {
        await setDoc(doc(db, "exerciseLogs", `${SESSION}_${m}`), {
          sessionId: SESSION, machineId: m, clientId: CLIENT, weight: "180", reps: "9", studioId: "studioA",
        });
      }
      // A trainer at studio C, which the client is NOT approved for.
      await setDoc(doc(db, "trainers", "trainerC"), {
        fullName: "Trainer C", initials: "TC", role: "LifeTransformer",
        primaryHomeStudioId: "studioC", accessibleStudioIds: ["studioC"],
      });
    });
  });

  const totals = (uid: string): Record<string, unknown> => {
    const u: Record<string, unknown> = {
      completedSessions: increment(1),
      sessionCount: 41,
      lastSessionDate: "2026-09-24",
      updatedAt: serverTimestamp(),
      lifetimeReps: increment(72),
      lifetimeWeight: increment(12960),
      consultationCompleted: true,
      [`trainerTally.${uid}`]: increment(1),
      topTrainerId: uid,
      topTrainerName: "Trainer A",
      topTrainerSessions: 1,
      trainerTallyUpdatedAt: serverTimestamp(),
    };
    for (const m of MACHINES) {
      u[`currentMachineMetrics.${m}`] = { weight: "180", reps: "9", settings: {}, lastPerformedSessionNumber: 41, lastSessionId: SESSION };
      u[`machineStats.${m}.timesPerformed`] = increment(1);
      u[`machineStats.${m}.lastPerformedDate`] = "2026-09-24";
      u[`machineStats.${m}.lastWeight`] = 180;
    }
    return u;
  };

  const finishBatch = (db: ReturnType<ReturnType<typeof testEnv.authenticatedContext>["firestore"]>, uid: string) => {
    const b = writeBatch(db);
    b.update(doc(db, "sessions", SESSION), {
      status: "Completed", endTime: serverTimestamp(), trainerId: uid, trainerName: "Trainer A", trainerInitials: "TA",
      clientId: CLIENT, homeStudioId: "studioB", clientHomeStudioId: "studioB", hostedAtStudioId: "studioA",
    });
    for (const m of MACHINES) {
      b.set(doc(db, "exerciseLogs", `${SESSION}_${m}`), {
        sessionId: SESSION, machineId: m, weight: "180", reps: "9", clientId: CLIENT,
        homeStudioId: "studioB", clientHomeStudioId: "studioB", studioId: "studioA", updatedAt: serverTimestamp(),
      }, { merge: true });
      b.set(doc(db, "clientMachineSettings", `${CLIENT}_${m}`), {
        clientId: CLIENT, homeStudioId: "studioB", clientHomeStudioId: "studioB", machineId: m,
        settings: {}, updatedBy: uid, currentWeight: 180, updatedAt: serverTimestamp(),
      }, { merge: true });
    }
    return b;
  };

  it("lets the visitor finish an eight-machine session: the session, the sets, the settings, then the totals", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    // The session and its sets land first, as Finish now commits them.
    await assertSucceeds(finishBatch(db, "trainerA").commit());
    await assertSucceeds(updateDoc(doc(db, "clients", CLIENT), totals("trainerA")));
  });

  it("lets the whole finish go in one batch too, within the rules' budget", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    const b = finishBatch(db, "trainerA");
    b.update(doc(db, "clients", CLIENT), totals("trainerA"));
    await assertSucceeds(b.commit());
  });

  it("lets the visitor's Start mark Routine B and the first session", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    await assertSucceeds(updateDoc(doc(db, "clients", CLIENT), { isRoutineBActive: true }));
    await assertSucceeds(updateDoc(doc(db, "clients", CLIENT), { firstSessionDate: serverTimestamp() }));
  });

  it("lets the visitor's finished Pulse update the client's Pulse summary, and nothing with it", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    const subjectiveSnapshot = {
      reportId: "pulse1", date: "2026-09-24", overallStatus: "red", overallPercent: 42,
      proteinStatus: "amber", hydrationStatus: "green", redCategories: ["pain"], flags: ["new-pain"],
    };
    await assertSucceeds(updateDoc(doc(db, "clients", CLIENT), { subjectiveSnapshot }));
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { subjectiveSnapshot, medicalHistory: "x" }));
  });

  it("lets the visitor give the counts back when a completed session is deleted from History", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "clients", CLIENT), {
        completedSessions: increment(-1),
        sessionCount: increment(-1),
        "trainerTally.trainerA": increment(-1),
        "machineStats.m-leg-press.timesPerformed": increment(-1),
      }),
    );
  });

  it("refuses the visitor anything beyond a session's totals", async () => {
    const db = testEnv.authenticatedContext("trainerA").firestore();
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { firstName: "Renamed" }));
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { ...totals("trainerA"), homeStudioId: "studioA" }));
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { ...totals("trainerA"), approvedCrossTrainStudioIds: ["studioA", "studioC"] }));
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { completedSessions: increment(1), medicalHistory: "x" }));
    await assertFails(updateDoc(doc(db, "clients", CLIENT), { completedSessions: increment(1), renewal: { situation: "on-track" } }));
  });

  it("refuses a trainer at a studio the client is not approved for", async () => {
    const db = testEnv.authenticatedContext("trainerC").firestore();
    await assertFails(updateDoc(doc(db, "clients", CLIENT), totals("trainerC")));
  });

  it("leaves the client's own studio free to edit the client, as before", async () => {
    // The existing rule for the client's own studio is unchanged: trainerB, at
    // studio B, may edit the client as always.
    const db = testEnv.authenticatedContext("trainerB").firestore();
    await assertSucceeds(updateDoc(doc(db, "clients", CLIENT), { firstName: "Casey" }));
  });
});

// ── MY PROFILE → YOUR WEEK'S READ (Openings round, phase 11, Sep 27 2026) ─
//
// Your week reads the studio's sessions the way Operations → Insights → Hours
// does (features/admin/sessions-range.ts: hostedAtStudioId ==, a createdAt
// range, newest first, capped) and keeps the trainer's own in memory. Naming
// the studio is what lets the rules allow it (trainerWorksAt): a query on
// trainerId alone is allowed only when the sessions carry the reader's
// sign-in uid, and an older account's sessions carry its trainer document id
// instead. No rules change; these hold the read to the rules as they stand.
describe("Your week's read", () => {
  const since = new Date("2026-09-20T04:00:00Z");
  const yourWeekQuery = (db: ReturnType<ReturnType<typeof testEnv.authenticatedContext>["firestore"]>, studioId: string) =>
    query(
      collection(db, "sessions"),
      where("hostedAtStudioId", "==", studioId),
      where("createdAt", ">=", since),
      orderBy("createdAt", "desc"),
      limit(1500),
    );

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      // Signed in as authA2; the sessions this person ran carry the trainer
      // document id they had before, trainerDocA2 — the two differ.
      await setDoc(doc(db, "trainers", "authA2"), {
        fullName: "Trainer A Two",
        initials: "T2",
        role: "LifeTransformer",
        primaryHomeStudioId: "studioA",
        accessibleStudioIds: ["studioA"],
        claimedFromId: "trainerDocA2",
      });
      for (const [id, day] of [["yw1", "2026-09-22"], ["yw2", "2026-09-29"]]) {
        await setDoc(doc(db, "sessions", id), {
          hostedAtStudioId: "studioA",
          clientId: "clientYW",
          trainerId: "trainerDocA2",
          trainerInitials: "T2",
          status: "Completed",
          date: day,
          createdAt: new Date(`${day}T12:00:00Z`),
        });
      }
    });
  });

  it("lets a trainer whose sign-in id and trainer document id differ read their studio's sessions", async () => {
    const db = testEnv.authenticatedContext("authA2").firestore();
    const snap = await assertSucceeds(getDocs(yourWeekQuery(db, "studioA")));
    const ids = snap.docs.filter((d) => d.data().trainerId === "trainerDocA2").map((d) => d.id).sort();
    expect(ids).toEqual(["yw1", "yw2"]);
  });

  it("refuses that same trainer a read by trainerId alone, which is why Your week names the studio", async () => {
    const db = testEnv.authenticatedContext("authA2").firestore();
    await assertFails(
      getDocs(query(collection(db, "sessions"), where("trainerId", "==", "trainerDocA2"), orderBy("createdAt", "desc"), limit(50))),
    );
  });

  it("lets the studio's leader make the same read", async () => {
    const db = testEnv.authenticatedContext("ownerA").firestore();
    await assertSucceeds(getDocs(yourWeekQuery(db, "studioA")));
  });

  it("refuses someone from another studio", async () => {
    const db = testEnv.authenticatedContext("trainerB").firestore();
    await assertFails(getDocs(yourWeekQuery(db, "studioA")));
  });
});

// ── THE STANDING WEEK (voice-review round, Sep 27 2026) ─────────────────
//
// studios/{s}/standingWeeks/{uid}: a trainer's usual week at a studio. The
// trainer proposes it (the proposal fields only), a leader agrees it, and the
// studio's people read it. docs/rounds/2026-09-27-standing-week.md.
describe("the standing week", () => {
  const week = (over: Record<string, unknown> = {}) => ({
    hours: [{ weekday: 1, from: "07:00", to: "13:00" }],
    regulars: [{ id: "r1", weekday: 1, start: "08:00", clientId: "clientA", clientName: "Judy Smith" }],
    ...over,
  });
  const proposal = (uid: string, over: Record<string, unknown> = {}) => ({
    studioId: "studioA",
    trainerUid: uid,
    trainerId: uid,
    trainerName: "Trainer A",
    proposed: week(),
    proposedAt: serverTimestamp(),
    proposedBy: { id: uid, name: "Trainer A" },
    ...over,
  });
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();
  const weekRef = (db: ReturnType<typeof as>, studioId: string, uid: string) => doc(db, "studios", studioId, "standingWeeks", uid);
  const agreement = (by: string, over: Record<string, unknown> = {}) => ({
    final: week(),
    finalAt: serverTimestamp(),
    finalBy: { id: by, name: "Owner A" },
    ...over,
  });

  async function seedAgreed() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studios", "studioA", "standingWeeks", "trainerA"), {
        ...proposal("trainerA", { proposedAt: new Date("2026-09-20T12:00:00Z") }),
        final: week(),
        finalAt: new Date("2026-09-21T12:00:00Z"),
        finalBy: { id: "ownerA", name: "Owner A" },
      });
    });
  }

  it("lets a trainer propose their own week, and read the studio's weeks", async () => {
    const db = as("trainerA");
    await assertSucceeds(setDoc(weekRef(db, "studioA", "trainerA"), proposal("trainerA"), { merge: true }));
    await assertSucceeds(getDoc(weekRef(db, "studioA", "trainerA")));
    await assertSucceeds(getDocs(collection(db, "studios", "studioA", "standingWeeks")));
    // Proposing again, and taking the proposal back.
    await assertSucceeds(
      setDoc(weekRef(db, "studioA", "trainerA"), { proposed: week({ note: "Mornings only" }), proposedAt: serverTimestamp() }, { merge: true }),
    );
    await assertSucceeds(updateDoc(weekRef(db, "studioA", "trainerA"), { proposed: null, proposedAt: serverTimestamp() }));
  });

  it("never lets a trainer agree a week, or write someone else's", async () => {
    const db = as("trainerA");
    // Their own week, agreed by themselves.
    await assertFails(setDoc(weekRef(db, "studioA", "trainerA"), { ...proposal("trainerA"), ...agreement("trainerA") }));
    // Someone else's week, and a studio they don't work at.
    await assertFails(setDoc(weekRef(db, "studioA", "ownerA"), proposal("ownerA", { proposedBy: { id: "trainerA", name: "Trainer A" } })));
    await assertFails(setDoc(weekRef(db, "studioB", "trainerA"), proposal("trainerA", { studioId: "studioB" })));
    // Once agreed, the agreement stays the leader's; the proposal stays theirs.
    await seedAgreed();
    await assertFails(updateDoc(weekRef(db, "studioA", "trainerA"), { final: week({ regulars: [] }) }));
    await assertFails(updateDoc(weekRef(db, "studioA", "trainerA"), { finalBy: { id: "trainerA", name: "Trainer A" } }));
    await assertFails(updateDoc(weekRef(db, "studioA", "trainerA"), { final: null, finalAt: null, finalBy: null }));
    await assertSucceeds(
      updateDoc(weekRef(db, "studioA", "trainerA"), {
        proposed: week({ regulars: [] }),
        proposedAt: serverTimestamp(),
        proposedBy: { id: "trainerA", name: "Trainer A" },
      }),
    );
    await assertFails(deleteDoc(weekRef(db, "studioA", "trainerA")));
  });

  it("keeps the weeks to the studio's own people", async () => {
    await seedAgreed();
    const elsewhere = as("trainerB");
    await assertFails(getDocs(collection(elsewhere, "studios", "studioA", "standingWeeks")));
    await assertFails(getDoc(weekRef(elsewhere, "studioA", "trainerA")));
    await assertFails(getDoc(weekRef(testEnv.unauthenticatedContext().firestore(), "studioA", "trainerA")));
  });

  it("lets the studio's leader agree, change and remove a week, signed in their own name", async () => {
    const owner = as("ownerA");
    // A leader may set a week nobody proposed; they never sign a proposal in the trainer's name.
    await assertFails(setDoc(weekRef(owner, "studioA", "trainerA"), { ...proposal("trainerA"), ...agreement("ownerA") }));
    await assertSucceeds(setDoc(weekRef(owner, "studioA", "trainerA"), { ...proposal("trainerA", { proposedBy: null }), ...agreement("ownerA") }));
    // Agreed as somebody else, or backdated.
    await assertFails(updateDoc(weekRef(owner, "studioA", "trainerA"), agreement("trainerA")));
    await assertFails(updateDoc(weekRef(owner, "studioA", "trainerA"), agreement("ownerA", { finalAt: new Date("2026-01-01T12:00:00Z") })));
    // Changed and agreed again; the proposal brought into line with it.
    await assertSucceeds(
      updateDoc(weekRef(owner, "studioA", "trainerA"), { ...agreement("ownerA", { final: week({ regulars: [] }) }), proposed: week({ regulars: [] }) }),
    );
    // Not at a studio they don't run.
    await assertFails(setDoc(weekRef(owner, "studioB", "trainerB"), { ...proposal("trainerB", { studioId: "studioB" }), ...agreement("ownerA") }));
    await assertSucceeds(deleteDoc(weekRef(owner, "studioA", "trainerA")));
  });

  it("counts the grant: a trainer who runs the studio may agree a colleague's week", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "trainers", "trainerA"), { managedStudioIds: ["studioA"] });
    });
    const granted = as("trainerA");
    await assertSucceeds(
      setDoc(weekRef(granted, "studioA", "ownerA"), {
        ...proposal("ownerA", { proposedBy: null, trainerName: "Owner A" }),
        ...agreement("trainerA"),
      }),
    );
  });

  it("holds the week's shape", async () => {
    const owner = as("ownerA");
    const bad = [
      { studioId: "studioB" },
      { trainerUid: "someoneElse" },
      { trainerId: "" },
      { colour: "blue" },
      { proposed: week({ note: "x".repeat(501) }) },
      // Three blocks a day, 21 a week (Openings round): a 22nd is refused.
      { proposed: week({ hours: Array.from({ length: 22 }, () => ({ weekday: 1, from: "07:00", to: "08:00" })) }) },
      { final: week({ hours: Array.from({ length: 22 }, () => ({ weekday: 1, from: "07:00", to: "08:00" })) }) },
      { proposed: week({ regulars: Array.from({ length: 81 }, (_, i) => ({ id: `r${i}`, weekday: 1, start: "08:00", clientId: "c", clientName: "C" })) }) },
      { proposed: { hours: [], regulars: [], extra: true } },
      { proposed: "Mondays" },
    ];
    for (const over of bad) {
      await assertFails(setDoc(weekRef(owner, "studioA", "trainerA"), proposal("trainerA", { proposedBy: null, ...over })));
    }
    // A trainer's proposal, backdated.
    await assertFails(setDoc(weekRef(as("trainerA"), "studioA", "trainerA"), proposal("trainerA", { proposedAt: new Date("2026-01-01T12:00:00Z") })));
  });

  // Three blocks a day (Openings round, Sep 27 2026): 21 a week are accepted,
  // proposed by the trainer and agreed by a leader.
  it("takes three blocks a day, 21 a week", async () => {
    const blocks = Array.from({ length: 21 }, (_, i) => ({
      weekday: i % 7,
      from: ["06:00", "10:00", "15:00"][Math.floor(i / 7)],
      to: ["09:00", "13:00", "19:00"][Math.floor(i / 7)],
    }));
    await assertSucceeds(setDoc(weekRef(as("trainerA"), "studioA", "trainerA"), proposal("trainerA", { proposed: week({ hours: blocks }) })));
    await assertSucceeds(
      setDoc(weekRef(as("ownerA"), "studioA", "trainerA"), { ...agreement("ownerA", { final: week({ hours: blocks }) }), proposed: week({ hours: blocks }) }, { merge: true }),
    );
  });

  // Who agrees (voice review follow-up): every leader the docs name, and
  // nobody else. Seeded only where a test needs them.
  async function seedPeople() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const person = (id: string, role: string, home: string) =>
        setDoc(doc(db, "trainers", id), { fullName: id, initials: "XX", role, primaryHomeStudioId: home, accessibleStudioIds: [home] });
      await person("franchiseX", "FranchiseOwner", "studioB");
      await person("adminX", "Admin", "studioB");
      await person("headA", "HeadTrainer", "studioA");
      await person("leaderA", "StudioLeader", "studioA");
      await person("headB", "HeadTrainer", "studioB");
      await person("colleagueA", "LifeTransformer", "studioA");
    });
  }
  const agreeAs = (uid: string) =>
    setDoc(weekRef(as(uid), "studioA", "trainerA"), { ...agreement(uid, { finalBy: { id: uid, name: uid } }), proposed: week() }, { merge: true });

  it("lets a franchise owner, an administrator, a head trainer and a studio leader agree", async () => {
    await seedPeople();
    for (const uid of ["franchiseX", "adminX", "headA", "leaderA"]) {
      await seedAgreed();
      await assertSucceeds(agreeAs(uid));
    }
  });

  it("refuses a head trainer from another studio, and a colleague at this one", async () => {
    await seedPeople();
    await seedAgreed();
    await assertFails(agreeAs("headB"));
    await assertFails(agreeAs("colleagueA"));
    // A colleague may read the week, but never change it: not the proposal, not the days away.
    const colleague = as("colleagueA");
    await assertSucceeds(getDoc(weekRef(colleague, "studioA", "trainerA")));
    await assertFails(
      updateDoc(weekRef(colleague, "studioA", "trainerA"), { proposed: week({ regulars: [] }), proposedAt: serverTimestamp(), proposedBy: { id: "colleagueA", name: "colleagueA" } }),
    );
    await assertFails(updateDoc(weekRef(colleague, "studioA", "trainerA"), { away: [{ id: "a1", from: "2026-10-05", to: "2026-10-09" }] }));
    await assertFails(deleteDoc(weekRef(colleague, "studioA", "trainerA")));
  });

  it("never lets a trainer point their week at another trainer's bookings", async () => {
    await seedAgreed();
    const db = as("trainerA");
    await assertFails(updateDoc(weekRef(db, "studioA", "trainerA"), { trainerId: "trainerB" }));
    await assertFails(
      setDoc(weekRef(db, "studioA", "trainerA"), proposal("trainerA", { trainerId: "trainerB", proposed: week({ regulars: [] }) }), { merge: true }),
    );
    // The same write with their own trainer id is theirs to make.
    await assertSucceeds(setDoc(weekRef(db, "studioA", "trainerA"), proposal("trainerA", { proposed: week({ regulars: [] }) }), { merge: true }));
    // A leader may still set it from the roster as they agree.
    await assertSucceeds(updateDoc(weekRef(as("ownerA"), "studioA", "trainerA"), { trainerId: "trainerA2" }));
  });

  // Away (voice review follow-up): the days a trainer is away. No agreement,
  // so the trainer writes it too, with or without a proposal.
  const owned = (uid: string, over: Record<string, unknown> = {}) => ({
    studioId: "studioA",
    trainerUid: uid,
    trainerId: uid,
    trainerName: "Trainer A",
    ...over,
  });
  const range = (over: Record<string, unknown> = {}) => ({ id: "a1", from: "2026-10-05", to: "2026-10-09", note: "Vacation", ...over });

  it("lets a trainer set the days they are away, with no proposal, and change them", async () => {
    const db = as("trainerA");
    await assertSucceeds(setDoc(weekRef(db, "studioA", "trainerA"), owned("trainerA", { away: [range()] }), { merge: true }));
    await assertSucceeds(
      setDoc(weekRef(db, "studioA", "trainerA"), owned("trainerA", { away: [range(), range({ id: "a2", from: "2026-11-02", to: "2026-11-02" })] }), { merge: true }),
    );
    // Proposing after, and clearing the days away.
    await assertSucceeds(setDoc(weekRef(db, "studioA", "trainerA"), proposal("trainerA"), { merge: true }));
    await assertSucceeds(updateDoc(weekRef(db, "studioA", "trainerA"), { away: [] }));
    // On an agreed week too: the agreement stays the leader's.
    await seedAgreed();
    await assertSucceeds(updateDoc(weekRef(db, "studioA", "trainerA"), { away: [range()] }));
    // Never someone else's, nor at a studio they don't work at.
    await assertFails(setDoc(weekRef(db, "studioA", "ownerA"), owned("ownerA", { away: [range()] })));
    await assertFails(setDoc(weekRef(as("trainerB"), "studioA", "trainerB"), owned("trainerB", { away: [range()] })));
  });

  it("lets the studio's leader set a trainer's days away", async () => {
    await assertSucceeds(setDoc(weekRef(as("ownerA"), "studioA", "trainerA"), owned("trainerA", { away: [range()] }), { merge: true }));
    await seedAgreed();
    await assertSucceeds(updateDoc(weekRef(as("ownerA"), "studioA", "trainerA"), { away: [] }));
  });

  it("holds the shape of the days away", async () => {
    const db = as("trainerA");
    const bad = [
      "October",
      [range({ from: "2026-10-09", to: "2026-10-05" })],
      [range({ from: "Oct 5" })],
      [range({ to: 20261009 })],
      [range({ note: "x".repeat(201) })],
      [range({ id: "" })],
      [range({ colour: "blue" })],
      ["2026-10-05"],
      Array.from({ length: 7 }, (_, i) => range({ id: `a${i}` })),
      // The sixth place is checked as well as the first.
      [...Array.from({ length: 5 }, (_, i) => range({ id: `a${i}` })), range({ id: "a5", from: "2026-12-31", to: "2026-12-01" })],
    ];
    for (const away of bad) {
      await assertFails(setDoc(weekRef(db, "studioA", "trainerA"), owned("trainerA", { away })));
    }
    // Six, each checked, fit the rules' budget of expressions for a trainer and a leader alike.
    const six = Array.from({ length: 6 }, (_, i) => range({ id: `a${i}` }));
    await assertSucceeds(setDoc(weekRef(db, "studioA", "trainerA"), owned("trainerA", { away: six })));
    await assertSucceeds(updateDoc(weekRef(as("ownerA"), "studioA", "trainerA"), { away: [...six].reverse() }));
  });

  // The expensive writes (review of the follow-up): every write re-checks the
  // stored days away, so the fullest real writes must fit the budget too -- a
  // leader agreeing, and the trainer proposing, on a week that already holds
  // six ranges and both a proposed and an agreed week. If either fails, lower
  // MAX_AWAY in week.ts and the six in standingWeekAwayValid together.
  // The week is the fullest the app writes: 21 blocks, three a day every day
  // (Openings round, Sep 27 2026; it was 14), and 80 regulars.
  it("fits a leader's agreement and a trainer's proposal on a week holding six days away", async () => {
    const full = week({
      hours: Array.from({ length: 21 }, (_, i) => ({
        weekday: i % 7,
        from: ["06:00", "10:00", "15:00"][Math.floor(i / 7)],
        to: ["09:00", "13:00", "20:00"][Math.floor(i / 7)],
      })),
      regulars: Array.from({ length: 80 }, (_, i) => ({ id: `r${i}`, weekday: (i % 6) + 1, start: "08:00", clientId: `c${i}`, clientName: `Client ${i}` })),
      note: "Mornings, and two evenings",
    });
    const six = Array.from({ length: 6 }, (_, i) => range({ id: `a${i}`, from: `2026-1${i % 3}-0${i + 1}`, to: `2026-1${i % 3}-2${i}` }));
    const seedFull = (uid = "trainerA") =>
      testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "studios", "studioA", "standingWeeks", uid), {
          ...proposal(uid, { proposed: full, proposedAt: new Date("2026-09-20T12:00:00Z") }),
          final: full,
          finalAt: new Date("2026-09-21T12:00:00Z"),
          finalBy: { id: "ownerA", name: "Owner A" },
          away: six,
        });
      });
    // What the app writes (store.ts): whose week it is, then the agreement or the proposal.
    const owner = { studioId: "studioA", trainerUid: "trainerA", trainerId: "trainerA", trainerName: "Trainer A" };
    const changed = week({ ...full, note: "Agreed: mornings" });
    await seedFull();
    // A leader agrees a changed week: final, proposed and both stamps at once.
    await assertSucceeds(
      setDoc(weekRef(as("ownerA"), "studioA", "trainerA"), { ...owner, proposed: changed, ...agreement("ownerA", { final: changed }) }, { merge: true }),
    );
    // The trainer proposes a change: the proposal and its stamps, where they work.
    await seedFull();
    await assertSucceeds(
      setDoc(
        weekRef(as("trainerA"), "studioA", "trainerA"),
        proposal("trainerA", { proposed: week({ ...full, note: "Evenings only" }) }),
        { merge: true },
      ),
    );
    // And both again, each changing the days away in the same write.
    await seedFull();
    await assertSucceeds(
      setDoc(
        weekRef(as("ownerA"), "studioA", "trainerA"),
        { ...owner, proposed: changed, ...agreement("ownerA", { final: changed }), away: [...six].reverse() },
        { merge: true },
      ),
    );
    await seedFull();
    await assertSucceeds(
      setDoc(weekRef(as("trainerA"), "studioA", "trainerA"), { ...proposal("trainerA", { proposed: changed }), away: [...six].reverse() }, { merge: true }),
    );

    // ownerA is the cheapest leader: trainerLeads answers on its first two
    // tests. The costlier ones go further through it before it says yes
    // (measured Sep 27 2026, voice review follow-up's final review): a
    // trainer with the grant, a head trainer who runs the studio through
    // ownedStudioIds, a studio leader based elsewhere with the grant here,
    // and a leader agreeing their OWN week, where the trainer's branch runs
    // its diff first and then falls through to the leader's. Each agrees
    // the full week, with and without rewriting the days away.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "trainers", "grantA"), {
        fullName: "Grant A", initials: "GA", role: "LifeTransformer",
        primaryHomeStudioId: "studioA", accessibleStudioIds: ["studioA"], managedStudioIds: ["studioA"],
      });
      await setDoc(doc(db, "trainers", "headA"), {
        fullName: "Head A", initials: "HA", role: "HeadTrainer",
        primaryHomeStudioId: "studioB", accessibleStudioIds: ["studioB", "studioA"], ownedStudioIds: ["studioA"],
      });
      await setDoc(doc(db, "trainers", "leadB"), {
        fullName: "Lead B", initials: "LB", role: "StudioLeader",
        primaryHomeStudioId: "studioB", accessibleStudioIds: ["studioB", "studioA"], managedStudioIds: ["studioA"],
      });
    });
    for (const leader of ["grantA", "headA", "leadB"]) {
      await seedFull();
      await assertSucceeds(
        setDoc(weekRef(as(leader), "studioA", "trainerA"), { ...owner, proposed: changed, ...agreement(leader, { final: changed }) }, { merge: true }),
      );
      await seedFull();
      await assertSucceeds(
        setDoc(
          weekRef(as(leader), "studioA", "trainerA"),
          { ...owner, proposed: changed, ...agreement(leader, { final: changed }), away: [...six].reverse() },
          { merge: true },
        ),
      );
    }
    const own = { studioId: "studioA", trainerUid: "ownerA", trainerId: "ownerA", trainerName: "Owner A" };
    await seedFull("ownerA");
    await assertSucceeds(
      setDoc(weekRef(as("ownerA"), "studioA", "ownerA"), { ...own, proposed: changed, ...agreement("ownerA", { final: changed }) }, { merge: true }),
    );
    await seedFull("ownerA");
    await assertSucceeds(
      setDoc(
        weekRef(as("ownerA"), "studioA", "ownerA"),
        { ...own, proposed: changed, ...agreement("ownerA", { final: changed }), away: [...six].reverse() },
        { merge: true },
      ),
    );
  });
});

// ── THE WHOLE-READ RECORD (Sep 27 2026) ─────────────────────────────────
//
// studios/{s}/scheduleCoverage/{yyyy-mm}: the studio days a pull that
// Mindbody answered in full read, as { days: [...] }. The iPad that pulled
// adds them with an add-to-list merge (src/features/openings/coverage-record.ts);
// anyone who works at the studio may, and nobody may take a day away or
// delete a month from the app. docs/rounds/2026-09-27-coverage-record.md.
describe("the whole-read record", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();
  const monthRef = (db: ReturnType<typeof as>, studioId: string, month: string) => doc(db, "studios", studioId, "scheduleCoverage", month);
  /** The first n days of a month, as the app writes them. */
  const daysOf = (month: string, n: number) => Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const add = (db: ReturnType<typeof as>, studioId: string, month: string, days: string[]) =>
    setDoc(monthRef(db, studioId, month), { days: arrayUnion(...days) }, { merge: true });
  const seed = (studioId: string, month: string, days: string[]) =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studios", studioId, "scheduleCoverage", month), { days });
    });

  // Seeded only where a test needs them: every kind of writer the docs name,
  // and the costliest path through writesForStudio (a guest, whose studio is
  // found last, with no role claim on the token, so the role is read from
  // the trainer document).
  async function seedPeople() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const person = (id: string, role: string, home: string, over: Record<string, unknown> = {}) =>
        setDoc(doc(db, "trainers", id), { fullName: id, initials: "XX", role, primaryHomeStudioId: home, accessibleStudioIds: [home], ...over });
      await person("franchiseX", "FranchiseOwner", "studioB");
      await person("adminX", "Admin", "studioB");
      await person("guestA", "LifeTransformer", "studioB", { activeGuestStudioIds: ["studioA"] });
      await person("grantA", "LifeTransformer", "studioB", { managedStudioIds: ["studioA"] });
    });
  }

  it("lets a trainer at the studio add the days a pull read, again and again, and read them", async () => {
    const db = as("trainerA");
    await assertSucceeds(add(db, "studioA", "2026-09", ["2026-09-27", "2026-09-28"]));
    // The next day's pull: only tomorrow is new; a day already there is no change.
    await assertSucceeds(add(db, "studioA", "2026-09", ["2026-09-29"]));
    await assertSucceeds(add(db, "studioA", "2026-09", ["2026-09-28", "2026-09-29"]));
    const snap = await assertSucceeds(getDoc(monthRef(db, "studioA", "2026-09")));
    expect(snap.data()).toEqual({ days: ["2026-09-27", "2026-09-28", "2026-09-29"] });
  });

  it("writes a month's end as two documents in one batch", async () => {
    const db = as("trainerA");
    const b = writeBatch(db);
    b.set(monthRef(db, "studioA", "2026-09"), { days: arrayUnion("2026-09-30") }, { merge: true });
    b.set(monthRef(db, "studioA", "2026-10"), { days: arrayUnion("2026-10-01") }, { merge: true });
    await assertSucceeds(b.commit());
  });

  it("lets a leader, a trainer with the grant, a guest, a franchise owner and an administrator add days", async () => {
    await seedPeople();
    for (const uid of ["ownerA", "grantA", "guestA", "franchiseX", "adminX"]) {
      await assertSucceeds(add(as(uid), "studioA", "2026-08", daysOf("2026-08", 3)));
      await assertSucceeds(getDoc(monthRef(as(uid), "studioA", "2026-08")));
    }
  });

  it("refuses a trainer from another studio, reading or writing, and anyone signed out", async () => {
    await seed("studioA", "2026-09", ["2026-09-27"]);
    const elsewhere = as("trainerB");
    await assertFails(add(elsewhere, "studioA", "2026-09", ["2026-09-28"]));
    await assertFails(add(elsewhere, "studioA", "2026-10", ["2026-10-01"]));
    await assertFails(getDoc(monthRef(elsewhere, "studioA", "2026-09")));
    await assertFails(getDocs(collection(elsewhere, "studios", "studioA", "scheduleCoverage")));
    const out = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(monthRef(out, "studioA", "2026-09")));
    await assertFails(setDoc(monthRef(out, "studioA", "2026-10"), { days: ["2026-10-01"] }));
    // Their own studio is theirs.
    await assertSucceeds(add(elsewhere, "studioB", "2026-09", ["2026-09-27"]));
  });

  it("never lets a day be taken away, or a month deleted, by anyone in the app", async () => {
    await seedPeople();
    await seed("studioA", "2026-09", ["2026-09-26", "2026-09-27", "2026-09-28"]);
    for (const uid of ["trainerA", "ownerA", "adminX"]) {
      const db = as(uid);
      await assertFails(updateDoc(monthRef(db, "studioA", "2026-09"), { days: arrayRemove("2026-09-27") }));
      await assertFails(setDoc(monthRef(db, "studioA", "2026-09"), { days: ["2026-09-28", "2026-09-29"] }));
      await assertFails(updateDoc(monthRef(db, "studioA", "2026-09"), { days: [] }));
      await assertFails(deleteDoc(monthRef(db, "studioA", "2026-09")));
    }
    // Writing the whole list back with a day more is still only an add.
    await assertSucceeds(setDoc(monthRef(as("trainerA"), "studioA", "2026-09"), { days: ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"] }));
  });

  it("holds the record's shape", async () => {
    const db = as("trainerA");
    const refused: [string, Record<string, unknown>][] = [
      // Not a month.
      ["2026-13", { days: ["2026-13-01"] }],
      ["2026-9", { days: ["2026-9-01"] }],
      ["september", { days: ["september-01"] }],
      // Another month's day, or not a day.
      ["2026-09", { days: ["2026-10-01"] }],
      ["2026-09", { days: ["2026-09-27", "2026-09-32"] }],
      ["2026-09", { days: ["someday"] }],
      ["2026-09", { days: [20260927] }],
      // A day twice, no day, or not a list.
      ["2026-09", { days: ["2026-09-27", "2026-09-27"] }],
      ["2026-09", { days: [] }],
      ["2026-09", { days: "2026-09-27" }],
      ["2026-09", { days: { "2026-09-27": true } }],
      // Anything beside the days.
      ["2026-09", { days: ["2026-09-27"], by: "trainerA" }],
      ["2026-09", { days: ["2026-09-27"], at: serverTimestamp() }],
      ["2026-09", {}],
    ];
    for (const [month, data] of refused) {
      await assertFails(setDoc(monthRef(db, "studioA", month), data));
    }
    // Thirty-two can't be written: a month has 31 days, and none may come twice.
    await assertFails(setDoc(monthRef(db, "studioA", "2026-10"), { days: [...daysOf("2026-10", 31), "2026-10-01"] }));
  });

  // The 1,000-expression budget (a request that runs out comes back
  // PERMISSION_DENIED, like a refusal). The costliest writes the app can
  // make: a whole month in one write (a back-read), the 31st day added to
  // 30, and two full months in one batch, each by every kind of writer,
  // none with a role on the token, so each reads its role from its trainer
  // document. Written with writesForStudio itself, the guest's writes ran
  // out here (Sep 27 2026); the rule resolves the caller once instead
  // (coverageWriterAllowed), and the measured numbers are beside it.
  it("fits a full month, and two in one batch, inside the rules' budget for every writer", async () => {
    for (const uid of ["guestA", "grantA", "trainerA", "ownerA", "franchiseX", "adminX"]) {
      await testEnv.clearFirestore();
      await seedPeople();
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "trainers", "trainerA"), { fullName: "Trainer A", initials: "TA", role: "LifeTransformer", primaryHomeStudioId: "studioA", accessibleStudioIds: ["studioA"] });
        await setDoc(doc(db, "trainers", "ownerA"), { fullName: "Owner A", initials: "OA", role: "StudioOwner", primaryHomeStudioId: "studioA", accessibleStudioIds: ["studioA"] });
      });
      const db = as(uid);
      // A whole month, created in one write.
      await assertSucceeds(add(db, "studioA", "2026-10", daysOf("2026-10", 31)));
      // The 31st day added to 30: the update checks the new list and keeps the old.
      await seed("studioA", "2026-12", daysOf("2026-12", 30));
      await assertSucceeds(add(db, "studioA", "2026-12", ["2026-12-31"]));
      // Two full months in one batch, each adding its 31st day.
      await seed("studioA", "2027-01", daysOf("2027-01", 30));
      await seed("studioA", "2027-03", daysOf("2027-03", 30));
      const b = writeBatch(db);
      b.set(monthRef(db, "studioA", "2027-01"), { days: arrayUnion("2027-01-31") }, { merge: true });
      b.set(monthRef(db, "studioA", "2027-03"), { days: arrayUnion("2027-03-31") }, { merge: true });
      await assertSucceeds(b.commit());
      // And a back-read's first write: two whole months at once.
      const c = writeBatch(db);
      c.set(monthRef(db, "studioA", "2027-05"), { days: arrayUnion(...daysOf("2027-05", 31)) }, { merge: true });
      c.set(monthRef(db, "studioA", "2027-07"), { days: arrayUnion(...daysOf("2027-07", 31)) }, { merge: true });
      await assertSucceeds(c.commit());
    }
  });
});

// ── MARKS ON A TIME (Openings round, Sep 27 2026) ───────────────────────
//
// studios/{s}/openingsMarks/{weekday-HHMM}: a person's word on a time of the
// usual week, "full" (Always full) or "room" (Usually has room), with a short
// note. Anyone who works at the studio (and franchise owners and
// administrators) sets, changes, keeps or removes one, always as themselves
// and at the server's time. The app writes it through
// src/features/openings/ui/marks-store.ts (`markForWrite` in marks.ts).
// docs/rounds/2026-09-27-openings.md, "Marks: how a person disagrees".
describe("marks on a time", () => {
  const as = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();
  const markRef = (db: ReturnType<typeof as>, studioId: string, key: string) => doc(db, "studios", studioId, "openingsMarks", key);
  /** What the app writes: the time, the word, the note when there is one, who, and the server's time. */
  const mark = (uid: string, over: Record<string, unknown> = {}) => ({
    weekday: 1,
    time: "08:00",
    mark: "full",
    note: "The rotation's regulars",
    by: { id: uid, name: `Person ${uid}` },
    at: serverTimestamp(),
    ...over,
  });
  const without = (data: Record<string, unknown>, key: string) => {
    const out = { ...data };
    delete out[key];
    return out;
  };
  const seedMark = (studioId: string, key: string, data: Record<string, unknown>) =>
    testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "studios", studioId, "openingsMarks", key), data);
    });
  /** Owner A's mark on Monday 8:00, set two months ago: the one a colleague changes, keeps or removes. */
  const seedOld = (studioId = "studioA") =>
    seedMark(studioId, "1-0800", {
      weekday: 1,
      time: "08:00",
      mark: "full",
      note: "Always taken",
      by: { id: "ownerA", name: "Owner A" },
      at: new Date("2026-07-20T12:00:00Z"),
    });

  // Every kind of person the docs name, seeded only where a test needs them.
  // None has a role claim on the token, so each reads its role from its
  // trainer document: the costliest path through the rules.
  async function seedPeople() {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      const person = (id: string, role: string, home: string, over: Record<string, unknown> = {}) =>
        setDoc(doc(db, "trainers", id), { fullName: id, initials: "XX", role, primaryHomeStudioId: home, accessibleStudioIds: [home], ...over });
      await person("franchiseX", "FranchiseOwner", "studioB");
      await person("adminX", "Admin", "studioB");
      await person("headA", "HeadTrainer", "studioA");
      await person("leaderA", "StudioLeader", "studioA");
      await person("guestA", "LifeTransformer", "studioB", { activeGuestStudioIds: ["studioA"] });
      await person("grantA", "LifeTransformer", "studioB", { managedStudioIds: ["studioA"] });
      await person("headB", "HeadTrainer", "studioB");
    });
  }

  it("lets a trainer at the studio set a mark, read the studio's marks, change it and remove it", async () => {
    const db = as("trainerA");
    await assertSucceeds(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA")));
    const snap = await assertSucceeds(getDoc(markRef(db, "studioA", "1-0800")));
    expect(snap.data()?.mark).toBe("full");
    await assertSucceeds(getDocs(collection(db, "studios", "studioA", "openingsMarks")));
    // Changed to the other word, the note taken out: the write replaces the mark.
    await assertSucceeds(setDoc(markRef(db, "studioA", "1-0800"), without(mark("trainerA", { mark: "room" }), "note")));
    await assertSucceeds(deleteDoc(markRef(db, "studioA", "1-0800")));
  });

  it("lets anyone who works there change, keep or remove a colleague's mark, signing it as themselves", async () => {
    const db = as("trainerA");
    // Keep at the review: the same word and note, signed again by the person keeping it, today.
    await seedOld();
    await assertSucceeds(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { note: "Always taken" })));
    // Changed by a colleague.
    await seedOld();
    await assertSucceeds(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { mark: "room", note: "Two regulars moved to 7:00" })));
    // Removed by a colleague.
    await seedOld();
    await assertSucceeds(deleteDoc(markRef(db, "studioA", "1-0800")));
  });

  it("never lets a mark be written in someone else's name, or left signed by its old author", async () => {
    const db = as("trainerA");
    await assertFails(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { by: { id: "ownerA", name: "Owner A" } })));
    // A colleague's mark, changed but still carrying their name and date.
    await seedOld();
    await assertFails(updateDoc(markRef(db, "studioA", "1-0800"), { mark: "room" }));
    await assertFails(updateDoc(markRef(db, "studioA", "1-0800"), { note: "Changed under their name", at: serverTimestamp() }));
    // A change that signs it again is theirs to make.
    await assertSucceeds(updateDoc(markRef(db, "studioA", "1-0800"), { mark: "room", by: { id: "trainerA", name: "Trainer A" }, at: serverTimestamp() }));
  });

  it("never lets a mark be backdated or dated ahead", async () => {
    const db = as("trainerA");
    await assertFails(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { at: new Date("2026-01-01T12:00:00Z") })));
    await assertFails(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { at: new Date("2030-01-01T12:00:00Z") })));
    await assertFails(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { at: "today" })));
    // Kept, but backdated so it stays fresh for longer.
    await seedOld();
    await assertFails(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { at: new Date("2026-07-20T12:00:00Z") })));
  });

  it("holds the id to the time the mark is about", async () => {
    const db = as("trainerA");
    const refused: [string, Record<string, unknown>][] = [
      // The id names another time than the fields.
      ["1-0800", { weekday: 2 }],
      ["1-0830", {}],
      ["2-0800", {}],
      ["1-800", { time: "8:00" }],
      ["mon-0800", {}],
      // Not a weekday of the usual week (Sundays are left out), or not one at all.
      ["0-0800", { weekday: 0 }],
      ["7-0800", { weekday: 7 }],
      ["1-0800", { weekday: 1.5 }],
      ["1-0800", { weekday: "1" }],
      // Not a half-hour.
      ["1-0815", { time: "08:15" }],
      ["1-2400", { time: "24:00" }],
      ["1-0800", { time: 800 }],
    ];
    for (const [key, over] of refused) {
      await assertFails(setDoc(markRef(db, "studioA", key), mark("trainerA", over)));
    }
    // The last half-hour of a Saturday is a time like any other.
    await assertSucceeds(setDoc(markRef(db, "studioA", "6-2330"), mark("trainerA", { weekday: 6, time: "23:30" })));
  });

  it("holds the mark's shape", async () => {
    const db = as("trainerA");
    const refused: Record<string, unknown>[] = [
      mark("trainerA", { mark: "closed" }),
      mark("trainerA", { mark: "a regular" }),
      mark("trainerA", { note: "x".repeat(201) }),
      mark("trainerA", { note: 42 }),
      mark("trainerA", { note: null }),
      mark("trainerA", { by: "trainerA" }),
      mark("trainerA", { by: { id: "trainerA" } }),
      mark("trainerA", { by: { id: "trainerA", name: "x".repeat(121) } }),
      mark("trainerA", { by: { id: "trainerA", name: "Trainer A", role: "Admin" } }),
      // Nothing about a client, and nothing else beside the mark.
      mark("trainerA", { clientName: "Judy Smith" }),
      mark("trainerA", { expiresOn: "2026-12-01" }),
      without(mark("trainerA"), "by"),
      without(mark("trainerA"), "at"),
      without(mark("trainerA"), "mark"),
      without(mark("trainerA"), "weekday"),
      without(mark("trainerA"), "time"),
    ];
    for (const data of refused) {
      await assertFails(setDoc(markRef(db, "studioA", "1-0800"), data));
    }
    // A note of exactly 200 characters, and no note at all, are both fine.
    await assertSucceeds(setDoc(markRef(db, "studioA", "1-0800"), mark("trainerA", { note: "x".repeat(200) })));
    await assertSucceeds(setDoc(markRef(db, "studioA", "1-0800"), without(mark("trainerA"), "note")));
  });

  it("refuses a trainer or a leader from another studio, reading or writing, and anyone signed out", async () => {
    await seedPeople();
    await seedOld();
    for (const uid of ["trainerB", "headB"]) {
      const elsewhere = as(uid);
      await assertFails(getDoc(markRef(elsewhere, "studioA", "1-0800")));
      await assertFails(getDocs(collection(elsewhere, "studios", "studioA", "openingsMarks")));
      await assertFails(setDoc(markRef(elsewhere, "studioA", "1-0800"), mark(uid)));
      await assertFails(setDoc(markRef(elsewhere, "studioA", "2-0800"), mark(uid, { weekday: 2 })));
      await assertFails(deleteDoc(markRef(elsewhere, "studioA", "1-0800")));
    }
    const out = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(markRef(out, "studioA", "1-0800")));
    await assertFails(setDoc(markRef(out, "studioA", "2-0800"), mark("nobody", { weekday: 2 })));
    await assertFails(deleteDoc(markRef(out, "studioA", "1-0800")));
    // Their own studio's marks are theirs.
    await assertSucceeds(setDoc(markRef(as("trainerB"), "studioB", "1-0800"), mark("trainerB")));
  });

  // Who: a trainer, the studio's leaders (a studio owner, a head trainer, a
  // studio leader, a trainer with the grant), a guest trainer, a franchise
  // owner and an administrator, each on create, update and delete.
  it("lets everyone who works there, runs it, or is above it set, change and remove a mark", async () => {
    await seedPeople();
    for (const uid of ["trainerA", "ownerA", "headA", "leaderA", "grantA", "guestA", "franchiseX", "adminX"]) {
      const db = as(uid);
      await assertSucceeds(setDoc(markRef(db, "studioA", "3-1030"), mark(uid, { weekday: 3, time: "10:30" })));
      await assertSucceeds(setDoc(markRef(db, "studioA", "3-1030"), mark(uid, { weekday: 3, time: "10:30", mark: "room" })));
      await assertSucceeds(getDocs(collection(db, "studios", "studioA", "openingsMarks")));
      await assertSucceeds(deleteDoc(markRef(db, "studioA", "3-1030")));
    }
  });

  it("follows Demo Mode's own rule: everyone signed in has the run of the practice studio", async () => {
    const db = as("trainerB");
    await assertSucceeds(setDoc(markRef(db, "demo-studio", "1-0800"), mark("trainerB")));
    await assertSucceeds(getDocs(collection(db, "studios", "demo-studio", "openingsMarks")));
    await assertSucceeds(deleteDoc(markRef(db, "demo-studio", "1-0800")));
  });

  // The 1,000-expression budget (a request that runs out comes back
  // PERMISSION_DENIED, like a refusal). The costliest marks the app writes:
  // the longest note and name, over a colleague's mark that already holds
  // both (an update checks the new document whole), by every kind of writer,
  // none with a role on the token; a new mark; a removal; and the read of the
  // whole collection.
  it("fits the fullest mark, set, changed and removed, inside the rules' budget for every writer", async () => {
    await seedPeople();
    for (const uid of ["guestA", "grantA", "headA", "leaderA", "trainerA", "ownerA", "franchiseX", "adminX"]) {
      const db = as(uid);
      const fullest = mark(uid, { weekday: 6, time: "19:30", mark: "room", note: "y".repeat(200), by: { id: uid, name: "n".repeat(120) } });
      await seedMark("studioA", "6-1930", {
        weekday: 6,
        time: "19:30",
        mark: "full",
        note: "z".repeat(200),
        by: { id: "ownerA", name: "o".repeat(120) },
        at: new Date("2026-07-20T12:00:00Z"),
      });
      await assertSucceeds(setDoc(markRef(db, "studioA", "6-1930"), fullest));
      await assertSucceeds(setDoc(markRef(db, "studioA", "6-1930"), { ...fullest, mark: "full" }));
      await assertSucceeds(getDocs(collection(db, "studios", "studioA", "openingsMarks")));
      await assertSucceeds(deleteDoc(markRef(db, "studioA", "6-1930")));
      // A new mark on a time nobody has marked.
      await assertSucceeds(setDoc(markRef(db, "studioA", "6-0530"), mark(uid, { weekday: 6, time: "05:30", note: "q".repeat(200) })));
    }
  });

  // -- THE STUDIO SETTINGS (Sep 28 2026, AJ: "let the admins assign the
  // default within the app"): Max Strength's defaults are administrators',
  // a studio's own are its leaders', and each document holds one `values`
  // map, who saved it and when.
  describe("the studio settings", () => {
    const settingsBy = (uid: string, values: Record<string, unknown>) => ({
      values,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    });

    async function seedSettingsAdmin() {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "trainers", "adminX"), {
          fullName: "Admin X",
          initials: "AX",
          role: "Admin",
          primaryHomeStudioId: "studioA",
          accessibleStudioIds: ["studioA"],
        });
      });
    }

    it("lets only an administrator set Max Strength's defaults, and everyone signed in read them", async () => {
      await seedSettingsAdmin();
      const admin = testEnv.authenticatedContext("adminX", { email: "adminx@test.com" }).firestore();
      const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
      const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
      await assertSucceeds(setDoc(doc(admin, "system", "studioDefaults"), settingsBy("adminX", { quietFloorSessions: 3 })));
      await assertSucceeds(getDoc(doc(trainer, "system", "studioDefaults")));
      await assertFails(setDoc(doc(trainer, "system", "studioDefaults"), settingsBy("trainerA", { quietFloorSessions: 1 })));
      await assertFails(setDoc(doc(owner, "system", "studioDefaults"), settingsBy("ownerA", { quietFloorSessions: 1 })));
      // Signed as someone else, or with anything beside the three fields.
      await assertFails(setDoc(doc(admin, "system", "studioDefaults"), settingsBy("trainerA", { quietFloorSessions: 3 })));
      await assertFails(
        setDoc(doc(admin, "system", "studioDefaults"), { ...settingsBy("adminX", { quietFloorSessions: 3 }), note: "extra" }),
      );
      await assertFails(deleteDoc(doc(admin, "system", "studioDefaults")));
    });

    it("lets a studio's leaders set its own settings, and the people who work there read them", async () => {
      const owner = testEnv.authenticatedContext("ownerA", { email: "ownera@test.com" }).firestore();
      const trainer = testEnv.authenticatedContext("trainerA", { email: "trainera@test.com" }).firestore();
      const outsider = testEnv.authenticatedContext("trainerB", { email: "trainerb@test.com" }).firestore();
      const ref = (db: typeof owner, studio: string) => doc(db, "studios", studio, "config", "settings");
      await assertSucceeds(setDoc(ref(owner, "studioA"), settingsBy("ownerA", { lapsedDays: 60 })));
      await assertSucceeds(setDoc(ref(owner, "studioA"), settingsBy("ownerA", { lapsedDays: 60, quietFloorSessions: 1 }), { merge: true }));
      await assertSucceeds(getDoc(ref(trainer, "studioA")));
      await assertFails(getDoc(ref(outsider, "studioA")));
      await assertFails(setDoc(ref(trainer, "studioA"), settingsBy("trainerA", { lapsedDays: 30 })));
      await assertFails(setDoc(ref(owner, "studioB"), settingsBy("ownerA", { lapsedDays: 30 })));
      // Any other config document keeps its own rule: nothing but renewals and settings.
      await assertFails(setDoc(doc(owner, "studios", "studioA", "config", "other"), settingsBy("ownerA", {})));
    });
  });

  // -- WAVE 2 ADMINS (the Admins room's second wave, Sep 28 2026; AJ "all
  // yes" to its new data): the Activity record, a studio's setup checklist,
  // a reply on a bug report, and Home's Take it / Snooze / Dismiss.
  // docs/rounds/2026-09-28-admins-2.md.
  describe("wave 2 admins", () => {
    const ctx = (uid: string) => testEnv.authenticatedContext(uid, { email: `${uid.toLowerCase()}@test.com` }).firestore();

    // Nobody here has a role claim on the token, so every role is read from
    // the trainer document: the costliest path through the rules.
    async function seedWave2People() {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const person = (id: string, role: string, home: string, over: Record<string, unknown> = {}) =>
          setDoc(doc(db, "trainers", id), { fullName: id, initials: "XX", role, primaryHomeStudioId: home, accessibleStudioIds: [home], ...over });
        await person("adminW", "Admin", "studioA");
        await person("founderW", "Founder", "studioB");
        await person("franchiseW", "FranchiseOwner", "studioB");
        await person("leaderW", "StudioLeader", "studioA");
        await person("grantW", "LifeTransformer", "studioB", { managedStudioIds: ["studioA"] });
      });
    }

    // ---- The Activity record: activity/{id} ------------------------------
    const entry = (uid: string, over: Record<string, unknown> = {}) => ({
      at: serverTimestamp(),
      by: { uid, name: `Person ${uid}` },
      studioId: "studioA",
      kind: "assisted-change",
      what: "Changed Studio A's phone.",
      before: { Phone: null },
      after: { Phone: "440-555-0101" },
      ...over,
    });

    it("lets an administrator add a signed entry to the Activity record, and nobody else", async () => {
      await seedWave2People();
      const admin = ctx("adminW");
      await assertSucceeds(addDoc(collection(admin, "activity"), entry("adminW")));
      await assertSucceeds(addDoc(collection(ctx("founderW"), "activity"), entry("founderW", { studioId: null, kind: "admin-grant", what: "Made Owner A a System Administrator (was Studio Owner)." })));
      // A company entry with no before or after.
      await assertSucceeds(addDoc(collection(admin, "activity"), { at: serverTimestamp(), by: { uid: "adminW", name: "Admin W" }, studioId: null, kind: "setting-default", what: "Set Max Strength's default for A quiet floor to 3." }));
      // Everyone below an administrator is refused, a studio's leader included.
      for (const uid of ["trainerA", "ownerA", "leaderW", "grantW", "franchiseW"]) {
        await assertFails(addDoc(collection(ctx(uid), "activity"), entry(uid)));
      }
    });

    it("refuses an entry signed as someone else, backdated, of an unknown kind, or with fields of its own", async () => {
      await seedWave2People();
      const admin = ctx("adminW");
      await assertFails(addDoc(collection(admin, "activity"), entry("adminW", { by: { uid: "founderW", name: "Founder W" } })));
      await assertFails(addDoc(collection(admin, "activity"), entry("adminW", { at: new Date("2026-09-01T12:00:00Z") })));
      await assertFails(addDoc(collection(admin, "activity"), entry("adminW", { kind: "gossip" })));
      await assertFails(addDoc(collection(admin, "activity"), entry("adminW", { what: "" })));
      await assertFails(addDoc(collection(admin, "activity"), entry("adminW", { note: "extra" })));
      await assertFails(addDoc(collection(admin, "activity"), entry("adminW", { studioId: 42 })));
      // studioId is always said: a studio's id, or null for the company.
      const noStudio: Record<string, unknown> = { ...entry("adminW") };
      delete noStudio.studioId;
      await assertFails(addDoc(collection(admin, "activity"), noStudio));
    });

    it("keeps the Activity record append-only: no edit and no delete, for anyone", async () => {
      await seedWave2People();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), "activity", "a1"), { ...entry("adminW"), at: new Date() });
      });
      const admin = ctx("adminW");
      await assertFails(updateDoc(doc(admin, "activity", "a1"), { what: "Changed nothing." }));
      await assertFails(deleteDoc(doc(admin, "activity", "a1")));
      await assertFails(deleteDoc(doc(ctx("founderW"), "activity", "a1")));
    });

    it("lets administrators read the whole record, and a studio's leaders only their own studio's entries", async () => {
      await seedWave2People();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, "activity", "atA"), { ...entry("adminW"), at: new Date() });
        await setDoc(doc(db, "activity", "atB"), { ...entry("adminW", { studioId: "studioB", what: "Changed Studio B's phone." }), at: new Date() });
        await setDoc(doc(db, "activity", "grant"), { ...entry("adminW", { studioId: null, kind: "admin-grant", what: "Made Leader W a System Administrator (was Studio Leader)." }), at: new Date() });
      });
      const admin = ctx("adminW");
      await assertSucceeds(getDoc(doc(admin, "activity", "grant")));
      await assertSucceeds(getDocs(query(collection(admin, "activity"), where("kind", "in", ["admin-grant", "assisted-change"]), orderBy("at", "desc"), limit(100))));
      await assertSucceeds(getDocs(query(collection(admin, "activity"), where("studioId", "==", "studioB"), orderBy("at", "desc"), limit(50))));
      // Studio A's leaders: a leader role at home, a studio owner, the grant.
      for (const uid of ["leaderW", "ownerA", "grantW"]) {
        const db = ctx(uid);
        await assertSucceeds(getDoc(doc(db, "activity", "atA")));
        await assertSucceeds(getDocs(query(collection(db, "activity"), where("studioId", "==", "studioA"), orderBy("at", "desc"), limit(50))));
        await assertFails(getDoc(doc(db, "activity", "atB")));
        await assertFails(getDoc(doc(db, "activity", "grant")));
        await assertFails(getDocs(query(collection(db, "activity"), where("studioId", "==", "studioB"), orderBy("at", "desc"), limit(50))));
        await assertFails(getDocs(query(collection(db, "activity"), where("kind", "in", ["admin-grant"]), orderBy("at", "desc"), limit(100))));
      }
      // A trainer who works there, and a franchise owner, read none of it.
      await assertFails(getDoc(doc(ctx("trainerA"), "activity", "atA")));
      await assertFails(getDocs(query(collection(ctx("trainerA"), "activity"), where("studioId", "==", "studioA"), orderBy("at", "desc"), limit(50))));
      await assertFails(getDoc(doc(ctx("franchiseW"), "activity", "atB")));
    });
  });
});
