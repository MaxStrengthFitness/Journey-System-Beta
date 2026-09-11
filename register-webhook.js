import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { confirmProduction } from './production-guard.js';

confirmProduction({
  script: 'register-webhook.js',
  target: 'Mindbody webhook subscription -> production cloud function',
  action: 'creates a live subscription; Mindbody will start POSTing real events',
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple .env parser
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

/**
 * Every event this deployment handles.
 *
 * Keep in step with the branches in functions/src/mindbody/index.ts. Anything
 * subscribed here but unhandled there lands in the `mindbodyLimbo` queue
 * rather than being processed -- the safe direction, but still noise.
 *
 * staff.* added Sep 2026 (Trainer Dossier round). Do NOT subscribe to these
 * until the staff branch is DEPLOYED: before it existed, `isClientEvent` was a
 * catch-all and a staff event would have been written into the `clients`
 * collection.
 *
 * clientContract.* and clientMembershipAssignment.* added Sep 2026 (Renewals
 * round). Their handlers were written Aug 29 (the isCommercialEvent branch);
 * they only work once `firebase deploy --only functions` has shipped that
 * code, so deploy the functions BEFORE running this with the new list.
 */
const EVENT_IDS = [
  'client.created',
  'client.updated',
  'appointmentBooking.created',
  'appointmentBooking.updated',
  'appointmentBooking.cancelled',
  'staff.created',
  'staff.updated',
  'staff.deactivated',
  'clientContract.created',
  'clientContract.updated',
  'clientContract.cancelled',
  'clientMembershipAssignment.created',
  'clientMembershipAssignment.cancelled',
];

/*
 * Options (Renewals round, Sep 2026):
 *   --site <id>     the SiteId header to send. Default 5746957 (Solon).
 *                   29068 is westlake / Strongsville / Willoughby. Run
 *                   scripts/check-mindbody-client-collisions.ts FIRST: until
 *                   it comes back clean, events from 29068 could land on the
 *                   wrong person's record.
 *   --list          look only: print the subscriptions Mindbody reports for
 *                   that site header and change nothing. Run this for 29068
 *                   before anything else -- if it shows the SAME subscription
 *                   id as Solon, one subscription already covers both sites.
 *   --show-secret   print the signing secret in full. Off by default so it
 *                   can't end up in a screenshot.
 */
const args = process.argv.slice(2);
const argValue = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const LIST_ONLY = args.includes('--list');
const SHOW_SECRET = args.includes('--show-secret');
const SITE_ID = String(argValue('site') || '5746957').trim();

function maskSecret(secret) {
  if (!secret) return '(none returned)';
  const s = String(secret);
  return s.length <= 8 ? '********' : `${s.slice(0, 4)}...${s.slice(-4)} (run with --show-secret to see it)`;
}

async function main() {
  // No hardcoded fallback: this key was previously committed in plain text.
  const apiKey = getEnv('MINDBODY_API_KEY');
  if (!apiKey) {
    console.error('Missing MINDBODY_API_KEY in .env -- add it before running this script.');
    process.exit(1);
  }
  const siteId = SITE_ID;
  if (!/^-?\d+$/.test(siteId)) {
    console.error(`--site must be a Mindbody site number, got "${siteId}".`);
    process.exit(1);
  }
  const webhookUrl = 'https://us-central1-gen-lang-client-0731527386.cloudfunctions.net/mindbodyWebhook';

  console.log(`Starting Webhook Sync for Site ID: ${siteId}...`);
  console.log(`Events: ${EVENT_IDS.join(', ')}`);
  console.log(`Webhook URL: ${webhookUrl}`);
  console.log('--------------------------------------------------');

  try {
    // 1. Fetch All Subscriptions
    console.log('Checking existing webhook subscriptions...');
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
    const subList = Array.isArray(responseData) 
      ? responseData 
      : (Array.isArray(responseData.items)
        ? responseData.items
        : (Array.isArray(responseData.Subscriptions) 
          ? responseData.Subscriptions 
          : (Array.isArray(responseData.subscriptions) 
            ? responseData.subscriptions 
            : [])));
    if (LIST_ONLY) {
      console.log(`Subscriptions Mindbody reports for SiteId ${siteId}: ${subList.length}`);
      for (const s of subList) {
        const events = s.EventIds || s.eventIds || [];
        console.log(`  ${s.SubscriptionId || s.subscriptionId || s.id}  ${s.Status || s.status}  ${s.WebhookUrl || s.webhookUrl}`);
        console.log(`    events: ${events.join(', ')}`);
      }
      console.log('Look-only (--list): nothing was changed.');
      return;
    }

    let subscription = subList.find(s => s.WebhookUrl === webhookUrl || s.webhookUrl === webhookUrl);

    let subscriptionId;
    let signingSecret;

    if (subscription) {
      subscriptionId = subscription.SubscriptionId || subscription.id;
      signingSecret = subscription.MessageSignatureKey || subscription.messageSignatureKey;
      console.log(`Found existing subscription: ${subscriptionId} (Status: ${subscription.Status})`);
    } else {
      console.log('No existing subscription found for this URL. Creating a new one...');
      const payload = {
        webhookUrl: webhookUrl,
        eventSchemaVersion: 1,
        eventIds: EVENT_IDS
      };

      const createRes = await fetch('https://mb-api.mindbodyonline.com/push/api/v1/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Key': apiKey,
          'SiteId': String(siteId)
        },
        body: JSON.stringify(payload)
      });

      const createData = await createRes.json();

      if (!createRes.ok) {
        console.error('Error creating subscription:', createData);
        process.exit(1);
      }

      subscriptionId = createData.SubscriptionId || createData.id;
      signingSecret = createData.MessageSignatureKey || createData.messageSignatureKey;
      console.log('Successfully created Webhook Subscription!');
    }

    console.log('--------------------------------------------------');
    console.log(`Subscription ID: ${subscriptionId}`);
    console.log(`Signing Secret (HMAC Key): ${SHOW_SECRET ? signingSecret : maskSecret(signingSecret)}`);
    console.log('--------------------------------------------------');

    // 2. Activate Subscription
    console.log('Activating subscription...');
    const patchRes = await fetch(`https://mb-api.mindbodyonline.com/push/api/v1/subscriptions/${subscriptionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': apiKey,
        'SiteId': String(siteId)
      },
      // eventIds is sent on every run, not just at creation. Previously this
      // PATCH only set `status: Active`, so adding an event type to the list
      // above had no effect on a subscription that already existed -- the
      // script reported success and changed nothing.
      body: JSON.stringify({
        status: 'Active',
        eventIds: EVENT_IDS
      })
    });

    const patchData = await patchRes.json();

    if (!patchRes.ok) {
      console.error('Error activating subscription:', patchData);
      process.exit(1);
    }

    console.log('Subscription is now ACTIVE!');
    console.log('If this created a NEW subscription, its signing secret must be set as MINDBODY_WEBHOOK_SECRET');
    console.log('(Firebase / Google Cloud Secret Manager). An existing subscription keeps its old secret.');

  } catch (error) {
    console.error('Network or Execution error:', error);
  }
}

main();
