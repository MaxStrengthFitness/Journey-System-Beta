import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

export { mindbodyWebhook } from "./mindbody";
export {
  onSessionRollup,
  recalcTrainerWindows,
  backfillTrainerRollups,
} from "./trainerRollups";
export {
  syncMindbodyStaffImages,
  refreshMindbodyStaffImage,
} from "./mindbody/staffImage";
// Cost round (Sep 2026): mirrors trainers/{id}.role onto the auth token so
// the rules' role checks stop reading the trainer document.
export { syncTrainerClaims } from "./claims";

admin.initializeApp();
const db = getFirestore("ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa");

/*
 * calculateFacilityAnalyticsV2 was deleted by the cost plan (Sep 26 2026, D1).
 * Every night at 2am it read every client, every session and every set ever
 * logged, with no filter, to write analytics/facilitySummary - which nothing
 * in src/, server/ or functions/ reads. It grew with every session (about 16
 * million reads a night at 100 studios after a year) and would have run out
 * of memory past a handful of studios. Deploying functions from this code
 * asks to delete it from Firebase; the ship script answers yes. The stale
 * analytics/facilitySummary document can be deleted from the console.
 */

/*
 * onBookingReminderWrite and sendDailySummary were deleted by the speed round
 * (Oct 5 2026, R25). They queued booking reminders and a morning summary into
 * notificationQueue for a studio with notificationSettings.bookingRemindersEnabled
 * or .dailySummaryEnabled - flags nothing in the app sets - and the only reader
 * of that queue, server/worker.ts, is parked in render.yaml ("nothing contacts
 * clients or trainers"). The trigger still ran on EVERY new booking and read
 * the studio document each time. Removing an export does not delete a deployed
 * function: the ship script runs firebase functions:delete for both.
 */

/**
 * HTTPS Callable Cloud Function to assign roles to users as Custom Claims.
 * Restricts updates to Admins, Founders, or the configured system override IDs.
 */
export const setCustomUserClaimsV2 = onCall(
  { region: "us-central1" },
  async (request) => {
    const { data, auth } = request;

    // 1. Guard against unauthenticated requests
    if (!auth) {
      throw new HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
      );
    }

    const { uid, role } = data;

    if (!uid || !role) {
      throw new HttpsError(
        "invalid-argument",
        "Both 'uid' and 'role' fields are required.",
      );
    }

    const allowedRoles = [
      "Admin",
      "Founder",
      "Overseer",
      "FranchiseOwner",
      "Owner",
      "StudioOwner",
      "HeadTrainer",
      "StudioLeader",
      "Trainer",
      "LifeTransformer",
    ];
    if (!allowedRoles.includes(role)) {
      throw new HttpsError(
        "invalid-argument",
        `The role '${role}' is not a valid organization role.`,
      );
    }

    // 2. Authorization check: Is caller authorized to set claims?
    const callerUid = auth.uid;
    const callerToken = auth.token;

    let isAuthorized = false;

    // Caller is claims-level Admin, Founder or Overseer
    if (
      callerToken.role === "Admin" ||
      callerToken.role === "Founder" ||
      callerToken.role === "Overseer"
    ) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      // Fallback: Check caller's db-level role
      const callerSnap = await db.collection("trainers").doc(callerUid).get();
      if (callerSnap.exists) {
        const callerRole = callerSnap.data()?.role;
        if (
          callerRole === "Admin" ||
          callerRole === "Founder" ||
          callerRole === "Overseer"
        ) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      const systemConfigSnap = await db
        .collection("systemConfig")
        .doc("overrideConfig")
        .get();
      if (systemConfigSnap.exists) {
        const adminUids = systemConfigSnap.data()?.adminUids || [];
        if (adminUids.includes(callerUid)) {
          isAuthorized = true;
        }
      }
    }

    // Absolute emergency initialization: If 'trainers' collection is empty, allow initial setup
    if (!isAuthorized) {
      const trainersCountSnap = await db.collection("trainers").limit(1).get();
      if (trainersCountSnap.empty) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      throw new HttpsError(
        "permission-denied",
        "You are not authorized to assign organization claims.",
      );
    }

    // 3. Set the custom user claims
    try {
      await admin.auth().setCustomUserClaims(uid, { role });

      // 4. Synchronize role field back to the trainer's Firestore document
      const trainerRef = db.collection("trainers").doc(uid);
      const trainerSnap = await trainerRef.get();

      if (trainerSnap.exists) {
        await trainerRef.update({ role });
      } else {
        // If trainer profile doesn't exist yet, bootstrap it
        await trainerRef.set(
          {
            id: uid,
            role,
            fullName: data.fullName || "New Staff Member",
            initials: data.initials || "NS",
            primaryHomeStudioId: data.primaryHomeStudioId || "",
            pin: data.pin || "",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      return {
        success: true,
        message: `Successfully assigned role '${role}' to user UID: ${uid}`,
      };
    } catch (error: any) {
      throw new HttpsError(
        "internal",
        `Error assigning user claims: ${error.message}`,
      );
    }
  },
);
