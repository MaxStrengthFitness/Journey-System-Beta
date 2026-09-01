import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, getDocs } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId || "(default)");

async function listInfo() {
  console.log("--- STUDIOS ---");
  const studiosSnap = await getDocs(collection(db, "studios"));
  if (studiosSnap.empty) {
    console.log("No studios found.");
  } else {
    studiosSnap.docs.forEach(doc => {
      console.log(`ID: ${doc.id} =>`, doc.data());
    });
  }

  console.log("\n--- TRAINERS ---");
  const trainersSnap = await getDocs(collection(db, "trainers"));
  if (trainersSnap.empty) {
    console.log("No trainers found.");
  } else {
    trainersSnap.docs.forEach(doc => {
      console.log(`ID: ${doc.id} =>`, doc.data());
    });
  }
}

listInfo().catch(console.error);
