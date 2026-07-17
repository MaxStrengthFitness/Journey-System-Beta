import crypto from 'crypto';

const webhookSecret = 'jkbIX7a91zKWxNeL27afFr1EmqdesE2ccBJYpaL+JEA=';
const webhookUrl = 'https://us-central1-gen-lang-client-0731527386.cloudfunctions.net/mindbodyWebhook';

async function main() {
  console.log('Preparing test client update payload...');

  const payload = {
    messageId: 'test-msg-' + Math.random().toString(36).substring(7),
    eventId: 'client.updated',
    eventSchemaVersion: 1,
    eventInstanceOriginationDateTime: new Date().toISOString(),
    eventData: {
      siteId: 5746957,
      clientId: 'test-client-999',
      firstName: 'Test',
      lastName: 'Client-' + Math.floor(Math.random() * 1000),
      membershipStatus: 'Active',
      tierName: 'Super-Pack',
      lastVisited: new Date().toISOString()
    }
  };

  const rawBody = JSON.stringify(payload);
  
  let key = webhookSecret;
  if (webhookSecret.length === 44 && webhookSecret.endsWith('=')) {
    key = Buffer.from(webhookSecret, 'base64');
  }
  const signature = crypto.createHmac('sha256', key).update(rawBody, 'utf8').digest('base64');

  console.log(`Sending signed request to: ${webhookUrl}`);
  console.log(`x-mindbody-signature: ${signature}`);
  console.log('--------------------------------------------------');

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mindbody-signature': signature
      },
      body: rawBody
    });

    console.log(`Response Status: ${res.status}`);
    console.log(`Response Text: ${await res.text()}`);
    console.log('--------------------------------------------------');

    if (res.status === 200) {
      console.log('SUCCESS! The live function accepted the payload.');
      console.log('Check your Firestore clients collection for a document with ID: "test-client-999".');
    } else {
      console.error('FAILED. The live function rejected the payload.');
    }
  } catch (error) {
    console.error('Network error sending webhook:', error);
  }
}

main();
