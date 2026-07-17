import * as admin from 'firebase-admin';
import * as path from 'path';

// Load service account from firebase-applet-config.json if it exists, otherwise rely on default
let serviceAccount;
try {
  serviceAccount = require('../firebase-applet-config.json');
} catch (e) {
  console.warn("No firebase-applet-config.json found, using default credentials");
}

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: serviceAccount ? admin.credential.cert(serviceAccount) : admin.credential.applicationDefault()
  });
}

const db = admin.firestore();

async function migratePins() {
  const trainersSnap = await db.collection('trainers').get();
  console.log(`Found ${trainersSnap.size} trainers for PIN migration.`);

  for (const doc of trainersSnap.docs) {
    const data = doc.data();
    const pin = data.pin;
    const pinHash = data.pinHash;

    if (pin !== undefined || pinHash !== undefined) {
      console.log(`Migrating PIN for trainer ${doc.id}`);
      
      const batch = db.batch();
      
      const secretRef = db.collection('trainers').doc(doc.id).collection('secrets').doc('account');
      batch.set(secretRef, {
        pin: pin || "",
        pinHash: pinHash || ""
      }, { merge: true });

      const updates: any = {};
      
      updates.pin = admin.firestore.FieldValue.delete();
      updates.pinHash = admin.firestore.FieldValue.delete();

      batch.update(doc.ref, updates);
      await batch.commit();
    }
  }
}

async function backfillClients() {
  const clientsSnap = await db.collection('clients').get();
  console.log(`Found ${clientsSnap.size} clients for backfill.`);
  
  const batches = [];
  let currentBatch = db.batch();
  let opCount = 0;
  let orphansCount = 0;

  for (const doc of clientsSnap.docs) {
    const data = doc.data();
    if (!data.homeStudioId) {
      orphansCount++;
      // (b) assign a configurable DEFAULT_STUDIO_ID
      const DEFAULT_STUDIO_ID = process.env.DEFAULT_STUDIO_ID || 'backfill_default';
      currentBatch.update(doc.ref, { homeStudioId: DEFAULT_STUDIO_ID });
      
      // write them to a backfill_review list for manual confirmation
      const reviewRef = db.collection('backfill_review').doc(doc.id);
      currentBatch.set(reviewRef, {
        clientId: doc.id,
        originalData: data,
        assignedStudioId: DEFAULT_STUDIO_ID,
        reviewed: false,
        migratedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      opCount += 2;
      
      if (opCount >= 400) {
        batches.push(currentBatch);
        currentBatch = db.batch();
        opCount = 0;
      }
    }
  }
  
  if (opCount > 0) {
    batches.push(currentBatch);
  }
  
  console.log(`Committing ${batches.length} batches for ${orphansCount} orphans...`);
  for (const batch of batches) {
    await batch.commit();
  }
}

async function main() {
  try {
    await migratePins();
    await backfillClients();
    console.log("Migration complete.");
  } catch (err) {
    console.error("Migration failed:", err);
  }
  process.exit(0);
}

main();
