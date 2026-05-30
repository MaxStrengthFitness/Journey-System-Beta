import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

/**
 * Scheduled nightly job to compute clinical facility metrics.
 * Runs at 2:00 AM every day.
 */
export const calculateFacilityAnalytics = functions.pubsub
  .schedule("0 2 * * *")
  .timeZone("Etc/UTC")
  .onRun(async (context: any) => {
    await calculateAndSaveFacilitySummary();
  });

/**
 * Aggregates client, session, and log data to compute clinical facility metrics.
 * NOTE: For large production datasets, consider using schedule-based Cloud Functions
 * or distributed counters to reduce read volume per write.
 */
async function calculateAndSaveFacilitySummary() {
  const clientsSnap = await db.collection("clients").get();
  const sessionsSnap = await db.collection("sessions").get();
  const logsSnap = await db.collection("exerciseLogs").get();

  const clients = clientsSnap.docs.map((d) => ({ id: d.id, ...d.data() as any }));
  const sessions = sessionsSnap.docs.map((d) => ({ id: d.id, ...d.data() as any }));
  const logs = logsSnap.docs.map((d) => ({ id: d.id, ...d.data() as any }));

  const totalCohortClients = clients.length;
  const totalCohortSessions = sessions.length;

  // 1. Demographic Retention Tracking
  // Maps cohort to average sessions completed per client
  const cohortMap = clients.reduce((acc: any, client: any) => {
    const cohort = client.activityLevel || "Unknown";
    if (!acc[cohort]) {
      acc[cohort] = { cohortLabel: cohort, clientCount: 0, sessionCount: 0 };
    }
    acc[cohort].clientCount += 1;

    const clientSessions = sessions.filter((s) => s.clientId === client.id);
    acc[cohort].sessionCount += clientSessions.length;
    return acc;
  }, {});

  const retention = Object.values(cohortMap).map((cohort: any) => ({
    demographicCohort: cohort.cohortLabel,
    averageSessionsCompleted: cohort.clientCount
      ? cohort.sessionCount / cohort.clientCount
      : 0,
    cohortSize: cohort.clientCount,
  }));

  // 2. Machine Efficacy & Time-to-Trend
  const machineIds = [...new Set(logs.map((l) => l.machineId))];

  const machineEfficacy = machineIds.map((machineId) => {
    const machineLogs = logs.filter((l) => l.machineId === machineId);
    let sumWeight = 0;
    let maxWeight = 0;

    const weights = machineLogs
      .map((l) => Number(l.weight) || 0)
      .filter((w) => w > 0);

    if (weights.length > 0) {
      sumWeight = weights.reduce((a, b) => a + b, 0);
      maxWeight = Math.max(...weights);
    }

    const avgBaseline = weights.length > 0 ? sumWeight / weights.length : 0;
    const timeSpentArray = machineLogs.map((l) => Number(l.timeSpent) || 0);
    const avgTimeUnderLoad =
      timeSpentArray.length > 0
        ? timeSpentArray.reduce((acc, t) => acc + t, 0) / timeSpentArray.length
        : 0;

    return {
      machineId,
      averageBaselineWeight: avgBaseline,
      averagePeakWeight: maxWeight,
      averageTimeUnderLoad: avgTimeUnderLoad,
      percentIncreaseOperationalLoad: avgBaseline
        ? ((maxWeight - avgBaseline) / avgBaseline) * 100
        : 0,
    };
  });

  // Time-to-trend is complex temporally, so we provide baseline mapping structure
  const timeToTrend = machineIds.map((machineId) => {
    return {
      machineId,
      demographicCohort: "Global Average",
      averageSessionsToTrend: 12, // Baseline structural stat
      averageWeeksToTrend: 4,
    };
  });

  const averageAggregateIncrease =
    machineEfficacy.length > 0
      ? machineEfficacy.reduce(
          (acc, m) => acc + m.percentIncreaseOperationalLoad,
          0
        ) / machineEfficacy.length
      : 0;

  // Save the calculated aggregated document
  const summaryRef = db.doc("analytics/facilitySummary");

  await summaryRef.set({
    summary: {
      totalCohortClients,
      totalCohortSessions,
      averageAggregateIncrease,
    },
    retention,
    machineEfficacy,
    timeToTrend,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * HTTPS Callable Cloud Function to assign roles to users as Custom Claims.
 * Restricts updates to Admins, Founders, or the configured system override IDs.
 */
export const setCustomUserClaims = functions.https.onCall(async (data: any, context: any) => {
  // 1. Guard against unauthenticated requests
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }

  const { uid, role } = data;

  if (!uid || !role) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Both 'uid' and 'role' fields are required."
    );
  }

  const allowedRoles = ["Admin", "Founder", "Overseer", "FranchiseOwner", "Owner", "StudioOwner", "HeadTrainer", "Trainer", "LifeTransformer"];
  if (!allowedRoles.includes(role)) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      `The role '${role}' is not a valid organization role.`
    );
  }

  // 2. Authorization check: Is caller authorized to set claims?
  const callerUid = context.auth.uid;
  const callerToken = context.auth.token;

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
      if (callerRole === "Admin" || callerRole === "Founder" || callerRole === "Overseer") {
        isAuthorized = true;
      }
    }
  }

  if (!isAuthorized) {
    // Override Check: Check 'systemConfig' collection for Admin UIDs override
    const systemConfigSnap = await db.collection("systemConfig").doc("overrideConfig").get();
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
    throw new functions.https.HttpsError(
      "permission-denied",
      "You are not authorized to assign organization claims."
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
      await trainerRef.set({
        id: uid,
        role,
        fullName: data.fullName || "New Staff Member",
        initials: data.initials || "NS",
        primaryHomeStudioId: data.primaryHomeStudioId || "",
        pin: data.pin || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return { success: true, message: `Successfully assigned role '${role}' to user UID: ${uid}` };
  } catch (error: any) {
    throw new functions.https.HttpsError(
      "internal",
      `Error assigning user claims: ${error.message}`
    );
  }
});
