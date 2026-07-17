import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getEnv(key) {
  try {
    const dotenvPath = path.join(__dirname, ".env");
    if (!fs.existsSync(dotenvPath)) return null;
    const content = fs.readFileSync(dotenvPath, "utf8");
    const matches = content.match(
      new RegExp(`^${key}\\s*=\\s*["']?([^"'\r\n]+)["']?`, "m")
    );
    return matches ? matches[1] : null;
  } catch (e) {
    return null;
  }
}

async function main() {
  const apiKey = getEnv('MINDBODY_API_KEY') || '46130dab676a454e89e84aa50d7f5dc8';
  const siteId = '5746957';
  const webhookUrl = 'https://us-central1-gen-lang-client-0731527386.cloudfunctions.net/mindbodyWebhook';

  console.log(`Deactivating Webhook Subscription for Site ID: ${siteId}...`);
  console.log('--------------------------------------------------');

  try {
    // 1. Fetch Subscriptions to find the ID
    const listRes = await fetch('https://mb-api.mindbodyonline.com/push/api/v1/subscriptions', {
      method: 'GET',
      headers: {
        'Api-Key': apiKey,
        'SiteId': String(siteId)
      }
    });

    if (!listRes.ok) {
      console.error('Error listing subscriptions:', await listRes.text());
      process.exit(1);
    }

    const responseData = await listRes.json();
    console.log('Subscriptions raw API response:', JSON.stringify(responseData, null, 2));
    const subList = Array.isArray(responseData) 
      ? responseData 
      : (Array.isArray(responseData.items)
        ? responseData.items
        : (Array.isArray(responseData.Subscriptions) 
          ? responseData.Subscriptions 
          : (Array.isArray(responseData.subscriptions) 
            ? responseData.subscriptions 
            : [])));
    
    const targetSubscriptions = subList.filter(s => s.WebhookUrl === webhookUrl || s.webhookUrl === webhookUrl);

    if (targetSubscriptions.length === 0) {
      console.log('No subscription found matching our webhook URL.');
      return;
    }

    console.log(`Found ${targetSubscriptions.length} subscriptions matching our URL.`);

    for (const sub of targetSubscriptions) {
      const subscriptionId = sub.SubscriptionId || sub.subscriptionId || sub.id;
      const currentStatus = sub.Status || sub.status;
      console.log(`\nDeactivating subscription: ${subscriptionId} (Current Status: ${currentStatus})...`);

      const patchRes = await fetch(`https://mb-api.mindbodyonline.com/push/api/v1/subscriptions/${subscriptionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': apiKey,
          'SiteId': String(siteId)
        },
        body: JSON.stringify({
          status: 'Deactivated'
        })
      });

      if (!patchRes.ok) {
        // Try 'Inactive' if 'Deactivated' fails
        console.log(`Failed with status 'Deactivated' for ${subscriptionId}, trying 'Inactive'...`);
        const retryRes = await fetch(`https://mb-api.mindbodyonline.com/push/api/v1/subscriptions/${subscriptionId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Api-Key': apiKey,
            'SiteId': String(siteId)
          },
          body: JSON.stringify({
            status: 'Inactive'
          })
        });
        
        if (!retryRes.ok) {
          console.error(`Error disabling subscription ${subscriptionId}:`, await retryRes.text());
        } else {
          console.log(`Subscription ${subscriptionId} successfully set to Inactive.`);
        }
      } else {
        console.log(`Subscription ${subscriptionId} successfully set to Deactivated.`);
      }
    }

    console.log('\nAll matching subscriptions have been successfully deactivated/stopped!');
  } catch (error) {
    console.error('Error running script:', error);
  }
}

main();
