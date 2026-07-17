import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, writeBatch, Timestamp, connectFirestoreEmulator } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

// 1. Load Firebase configuration
const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
if (!fs.existsSync(configPath)) {
  console.error("Error: firebase-applet-config.json not found in the root directory!");
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// 2. Load Firestore backup file
const backupPath = path.resolve(process.cwd(), "firestore_backup.json");
if (!fs.existsSync(backupPath)) {
  console.error("Error: firestore_backup.json not found in the root directory!");
  process.exit(1);
}
console.log("Reading firestore_backup.json...");
const backupData = JSON.parse(fs.readFileSync(backupPath, "utf-8"));

// 3. Initialize Firebase app
const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId || "(default)");

if (process.env.FIRESTORE_EMULATOR_HOST) {
  const parts = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const host = parts[0] || "127.0.0.1";
  const port = parseInt(parts[1] || "8080", 10);
  connectFirestoreEmulator(db, host, port);
  console.log(`Connected Firestore client to emulator at ${host}:${port}`);
}

// 4. Helper function to recursively convert timestamp objects to Firestore Timestamp instances
function convertTimestamps(data: any): any {
  if (data === null || data === undefined) return data;
  if (typeof data === "object") {
    if (typeof data._seconds === "number" && typeof data._nanoseconds === "number") {
      return Timestamp.fromMillis(data._seconds * 1000 + Math.floor(data._nanoseconds / 1000000));
    }
    if (Array.isArray(data)) {
      return data.map(convertTimestamps);
    }
    const result: any = {};
    for (const key of Object.keys(data)) {
      result[key] = convertTimestamps(data[key]);
    }
    return result;
  }
  return data;
}

// 5. Upload data in batches
async function importBackup() {
  console.log("Starting restore operation...");
  const collections = Object.keys(backupData);

  for (const collectionName of collections) {
    const documents = backupData[collectionName];
    const docIds = Object.keys(documents);
    console.log(`\nCollection: "${collectionName}" - Found ${docIds.length} documents.`);

    let batch = writeBatch(db);
    let count = 0;
    let totalUploaded = 0;

    for (const docId of docIds) {
      const docObj = documents[docId];
      if (!docObj || !docObj.__data__) continue;

      const docData = convertTimestamps(docObj.__data__);
      const docRef = doc(db, collectionName, docId);

      batch.set(docRef, docData);
      count++;
      totalUploaded++;

      // Firebase limits batch operations to 500. We write in chunks of 400.
      if (count >= 400) {
        console.log(`Writing batch of ${count} documents for "${collectionName}"...`);
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }

    // Commit any remaining writes in the final batch
    if (count > 0) {
      console.log(`Writing final batch of ${count} documents for "${collectionName}"...`);
      await batch.commit();
    }
    console.log(`Successfully imported ${totalUploaded} documents into "${collectionName}".`);
  }

  console.log("\nRestore complete! All collections imported successfully.");
  process.exit(0);
}

importBackup().catch((error) => {
  console.error("Restore failed:", error);
  process.exit(1);
});
