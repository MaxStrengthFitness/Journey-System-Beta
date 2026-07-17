import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, setDoc, collection, getDocs, updateDoc } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId || "(default)");

async function seed() {
  console.log("Seeding default studios...");

  // 1. Create default studios
  await setDoc(doc(db, "studios", "solon"), { name: "Solon" });
  await setDoc(doc(db, "studios", "westlake"), { name: "Westlake" });
  console.log("Created studios: 'solon' and 'westlake'.");

  // 2. Link all trainers to the default studios
  console.log("Updating trainer studio access...");
  const trainersSnap = await getDocs(collection(db, "trainers"));

  for (const trainerDoc of trainersSnap.docs) {
    const trainerRef = doc(db, "trainers", trainerDoc.id);
    await updateDoc(trainerRef, {
      primaryHomeStudioId: "solon",
      accessibleStudioIds: ["solon", "westlake"]
    });
    console.log(`Updated trainer "${trainerDoc.data().fullName || trainerDoc.id}" to Solon / Westlake.`);
  }

  console.log("\nSetup complete! You can now reload your application.");
  process.exit(0);
}

seed().catch(console.error);
