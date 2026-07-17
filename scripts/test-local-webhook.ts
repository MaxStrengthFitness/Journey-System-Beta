import axios from "axios";
import * as crypto from "crypto";
import { initializeApp } from "firebase/app";
import { initializeFirestore, doc, getDoc, connectFirestoreEmulator } from "firebase/firestore";
import * as fs from "fs";
import * as path from "path";

// 1. Load configuration
const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

// Initialize Firestore client
const app = initializeApp(config);
const db = initializeFirestore(app, {}, config.firestoreDatabaseId || "(default)");

if (process.env.FIRESTORE_EMULATOR_HOST) {
  const parts = process.env.FIRESTORE_EMULATOR_HOST.split(":");
  const host = parts[0] || "127.0.0.1";
  const port = parseInt(parts[1] || "8080", 10);
  connectFirestoreEmulator(db, host, port);
  console.log(`Connected Firestore client to emulator at ${host}:${port}`);
}

const LOCAL_WEBHOOK_URL = "http://127.0.0.1:5001/journey-system-test/us-central1/mindbodyWebhook";
const LOCAL_SECRET = "dummy_webhook_secret_key";

// John Demo's ID from firestore_backup.json
const TARGET_CLIENT_ID = "Xd09fdT91SwGQiCND0vj";

function signPayload(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");
}

async function runTest() {
  console.log("Checking current state of John Demo in Firestore...");
  const clientRef = doc(db, "clients", TARGET_CLIENT_ID);
  const beforeSnap = await getDoc(clientRef);

  if (!beforeSnap.exists()) {
    console.error(`Error: Client "${TARGET_CLIENT_ID}" not found in database. Make sure you ran the seed script!`);
    process.exit(1);
  }
  console.log("Current packageTier:", beforeSnap.data()?.packageTier);
  console.log("Current membershipStatus:", beforeSnap.data()?.membershipStatus);

  // 2. Prepare payload to change John Demo's package tier
  const eventId = `test-event-${Date.now()}`;
  const payload = JSON.stringify({
    messageId: eventId,
    eventId: "evt-client-updated",
    eventSchemaVersion: 1,
    eventData: {
      siteId: 99999,
      clientId: TARGET_CLIENT_ID,
      membershipStatus: "Active",
      tierName: "Vip Gold Tier",
      lastVisited: new Date().toISOString(),
    }
  });

  const signature = signPayload(payload, LOCAL_SECRET);

  console.log(`\nSending POST request to local webhook: ${LOCAL_WEBHOOK_URL}...`);
  try {
    const res = await axios.post(LOCAL_WEBHOOK_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "x-mindbody-signature": signature
      }
    });

    console.log(`Response Status: ${res.status}`);

    if (res.status === 200) {
      console.log("Webhook accepted successfully! Waiting 3 seconds for database write to complete...");
      await new Promise((resolve) => setTimeout(resolve, 3000));

      console.log("\nVerifying updates in Firestore...");
      const afterSnap = await getDoc(clientRef);
      console.log("Updated packageTier:", afterSnap.data()?.packageTier);
      console.log("Updated membershipStatus:", afterSnap.data()?.membershipStatus);

      if (afterSnap.data()?.packageTier === "Vip Gold Tier" && afterSnap.data()?.membershipStatus === "Active") {
        console.log("\n✅ Webhook Test PASSED! Client data successfully synchronized.");
      } else {
        console.error("\n❌ Webhook Test FAILED: Client data was not updated.");
      }
    } else {
      console.error(`\n❌ Webhook Test FAILED with response status ${res.status}`);
    }
  } catch (err: any) {
    console.error("\n❌ Webhook request failed:", err.message);
    if (err.response) {
      console.error("Error response status:", err.response.status);
      console.error("Error response body:", err.response.data);
    }
  }

  process.exit(0);
}

runTest().catch(console.error);
