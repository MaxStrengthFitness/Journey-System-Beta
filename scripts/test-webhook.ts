import * as crypto from 'crypto';
import { randomUUID } from 'crypto';

// Configuration
const PROJECT_ID = 'my-project-id'; // Replace with your actual Firebase project ID
const FUNCTION_URL = `http://127.0.0.1:5001/${PROJECT_ID}/us-central1/mindbodyWebhook`;
const DUMMY_SECRET = 'local_test_secret_123';

// 1. Construct a realistic Mindbody JSON payload 
const payload = {
  messageId: randomUUID(),
  eventId: "Client.Updated",
  eventInstanceOriginationDateTime: new Date().toISOString(),
  siteId: 12345,
  clientId: "MB-88543",
  membershipStatus: "Active",
  tierName: "Silver 18",
  activeMembership: true,
  lastVisited: new Date().toISOString(),
  remainingSessions: 14,
  firstName: "Jane",
  lastName: "Doe"
};

const payloadString = JSON.stringify(payload);

// 2. Cryptographic Signing (HMAC SHA-256 encoded in Base64)
const signature = crypto
  .createHmac('sha256', DUMMY_SECRET)
  .update(payloadString)
  .digest('base64');

console.log(`[Test Script] Target URL: ${FUNCTION_URL}`);
console.log(`[Test Script] Generated Signature (Base64): ${signature}`);
console.log(`[Test Script] Event ID: ${payload.messageId}`);

async function executeTest() {
  try {
    // 3. Construct Headers & 4. Execution
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mindbody-signature': signature,
        'x-mindbody-event-id': payload.messageId,
        'x-mindbody-site-id': payload.siteId.toString(),
      },
      body: payloadString,
    });

    // 5. Logging results
    const text = await response.text();
    console.log(`\n[Test Script] Response Status Code: ${response.status}`);
    console.log(`[Test Script] Response Body: ${text || '(Empty Body)'}`);
    
    if (response.status === 200) {
      console.log(`✅ Success! The webhook was processed (or acknowledged idempotently).`);
    } else if (response.status === 401) {
      console.log(`❌ Unauthorized! Signature mismatch. Ensure the emulator secret is set.`);
    } else {
      console.log(`⚠️ Unexpected status code.`);
    }
  } catch (error) {
    console.error('\n❌ HTTP Request Failed. Is the emulator running?', error);
  }
}

executeTest();
