import admin from "firebase-admin";

// Initialize Firebase Admin (assuming default application credential exists/is set)
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const COLLECTIONS_TO_UPDATE = [
  "exerciseLogs",
  "sessionNotes",
  "focusRecords",
  "trainerFocuses",
  "progressReports",
  "clientMachineSettings",
  "routines",
  "routineAdjustments",
  "machineSettingChanges",
  "schedules",
];

async function run() {
  console.log("Starting backfill of studioId...");
  let totalUpdated = 0;
  let totalMissingClient = 0;

  for (const coll of COLLECTIONS_TO_UPDATE) {
    console.log(`Processing collection: ${coll}`);
    let collUpdated = 0;
    
    const snapshot = await db.collection(coll).get();
    
    // Batch updates to optimize
    let batch = db.batch();
    let batchCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!data.studioId) {
        let clientId = data.clientId;
        // ScheduleEntry has clientId, but sometimes it might be missing?
        // if schedule doesn't have clientId, maybe we can't update it easily
        if (!clientId) {
          totalMissingClient++;
          console.warn(`Doc ${doc.id} in ${coll} missing studioId and clientId.`);
          continue;
        }

        const clientDoc = await db.collection("clients").doc(clientId).get();
        if (clientDoc.exists) {
          const clientData = clientDoc.data();
          const studioId = clientData?.homeStudioId || clientData?.studioId;
          if (studioId) {
            batch.update(doc.ref, { studioId });
            batchCount++;
            collUpdated++;
            totalUpdated++;
          } else {
             console.warn(`Doc ${doc.id} in ${coll} points to Client ${clientId} who has no homeStudioId.`);
          }
        } else {
           console.warn(`Doc ${doc.id} in ${coll} points to non-existent Client ${clientId}.`);
        }

        if (batchCount === 400) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }
    
    console.log(`Finished ${coll}: updated ${collUpdated} docs.`);
  }

  console.log(`\nMigration complete. Total updated: ${totalUpdated}. Missing client reference: ${totalMissingClient}`);
}

run().catch(console.error);
