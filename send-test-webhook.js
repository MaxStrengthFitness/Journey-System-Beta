import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple .env reader -- same helper the other webhook scripts use.
function getEnv(key) {
  try {
    const dotenvPath = path.join(__dirname, ".env");
    if (!fs.existsSync(dotenvPath)) return null;
    const content = fs.readFileSync(dotenvPath, "utf8");
    const matches = content.match(
      new RegExp(`^${key}\\s*=\\s*["']?([^"'\r\n]+)["']?`, "m"),
    );
    return matches ? matches[1] : null;
  } catch (e) {
    return null;
  }
}

// NEVER hardcode these. This script signs payloads that the live webhook will
// accept as genuine, so the signing secret belongs in .env (gitignored) only.
const webhookSecret = getEnv("MINDBODY_WEBHOOK_SECRET");
const webhookUrl = getEnv("MINDBODY_WEBHOOK_URL");

if (!webhookSecret || !webhookUrl) {
  console.error(
    "Missing MINDBODY_WEBHOOK_SECRET and/or MINDBODY_WEBHOOK_URL in .env -- add them before running this script.",
  );
  process.exit(1);
}

async function main() {
  console.log("Preparing test client update payload...");

  const payload = {
    messageId: "test-msg-" + Math.random().toString(36).substring(7),
    eventId: "client.updated",
    eventSchemaVersion: 1,
    eventInstanceOriginationDateTime: new Date().toISOString(),
    eventData: {
      siteId: 5746957,
      clientId: "test-client-999",
      firstName: "Test",
      lastName: "Client-" + Math.floor(Math.random() * 1000),
      membershipStatus: "Active",
      tierName: "Super-Pack",
      lastVisited: new Date().toISOString(),
    },
  };

  const rawBody = JSON.stringify(payload);

  let key = webhookSecret;
  if (webhookSecret.length === 44 && webhookSecret.endsWith("=")) {
    key = Buffer.from(webhookSecret, "base64");
  }
  const signature = crypto
    .createHmac("sha256", key)
    .update(rawBody, "utf8")
    .digest("base64");

  console.log(`Sending signed request to: ${webhookUrl}`);
  console.log(`x-mindbody-signature: ${signature}`);
  console.log("--------------------------------------------------");

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-mindbody-signature": signature,
      },
      body: rawBody,
    });

    console.log(`Response Status: ${res.status}`);
    console.log(`Response Text: ${await res.text()}`);
    console.log("--------------------------------------------------");

    if (res.status === 200) {
      console.log("SUCCESS! The live function accepted the payload.");
      console.log(
        'Check your Firestore clients collection for a document with ID: "test-client-999".',
      );
    } else {
      console.error("FAILED. The live function rejected the payload.");
    }
  } catch (error) {
    console.error("Network error sending webhook:", error);
  }
}

main();
