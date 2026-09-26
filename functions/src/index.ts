import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";

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

/**
 * Triggers booking reminder notification queuing when a new schedule entry is added.
 */
export const onBookingReminderWrite = onDocumentCreated(
  {
    document: "schedules/{scheduleId}",
    region: "us-central1",
    database: "ai-studio-32cbbdcc-6e08-4770-9665-867c68878efa",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const schedule = snap.data();
    const studioId = schedule.studioId;
    if (!studioId) return;

    // Check if the studio has booking reminders enabled
    const studioRef = db.collection("studios").doc(studioId);
    const studioSnap = await studioRef.get();
    if (!studioSnap.exists) return;

    const studioData = studioSnap.data();
    const notificationsEnabled =
      studioData?.notificationSettings?.bookingRemindersEnabled === true;
    if (!notificationsEnabled) return;

    // Add task to notificationQueue
    await db.collection("notificationQueue").add({
      type: "booking_reminder",
      scheduleId: event.params.scheduleId,
      clientName: schedule.clientName || "Unknown Client",
      trainerName: schedule.trainerName || "Unknown Trainer",
      startTime: schedule.startTime,
      status: "queued",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  },
);

export const sendDailySummary = onSchedule(
  {
    schedule: "0 6 * * *",
    timeZone: "America/New_York",
    region: "us-central1",
  },
  async (event) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const rangeStart = admin.firestore.Timestamp.fromDate(today);
    const rangeEnd = admin.firestore.Timestamp.fromDate(tomorrow);

    // Fetch all active studios
    const studiosSnap = await db.collection("studios").get();
    for (const studioDoc of studiosSnap.docs) {
      const studio = studioDoc.data();
      const studioId = studioDoc.id;

      if (studio?.notificationSettings?.dailySummaryEnabled === true) {
        // Fetch all schedules for this studio today
        const schedulesSnap = await db
          .collection("schedules")
          .where("studioId", "==", studioId)
          .where("startTime", ">=", rangeStart)
          .where("startTime", "<", rangeEnd)
          .get();

        if (!schedulesSnap.empty) {
          const count = schedulesSnap.size;
          await db.collection("notificationQueue").add({
            type: "daily_summary",
            studioId,
            studioName: studio.name || "Unknown Studio",
            totalBookingsCount: count,
            summaryDate: today.toISOString().split("T")[0],
            status: "queued",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    }
  },
);
