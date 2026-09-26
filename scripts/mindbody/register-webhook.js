import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { confirmProduction } from './production-guard.js';

// --list only reads, so it does not need the production confirmation; every
// other run changes a live subscription and does.
if (!process.argv.includes('--list')) {
  confirmProduction({
    script: 'register-webhook.js',
    target: 'Mindbody webhook subscription -> production cloud function',
    action: 'creates a live subscription; Mindbody will start POSTing real events',
  });
}

/**
 * A short, one-way fingerprint of a signing secret: enough to tell whether two
 * secrets are the SAME (compare with the one Firebase holds) without ever
 * printing the secret. Sep 24 2026: the webhook's last success was Aug 20 and
 * its health record shows a signature failure on Sep 12 -- a secret mismatch
 * is the first suspect, and this is how to check it safely.
 */
export function fingerprint(secret) {
  if (!secret) return '(none)';
  return crypto.createHash('sha256').update(String(secret).trim(), 'utf8').digest('hex').slice(0, 10);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple .env parser
function getEnv(key) {
  try {
    const dotenvPath = path.join(__dirname, "..", "..", ".env");
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
/*
 * Sep 24 2026: checked against Mindbody's event list (WebhooksDocumentation).
 * No clientContract.* event is documented; asking for an unknown event id
 * fails the whole request, which is the likeliest reason the last
 * subscription never left PendingActivation. The documented ids come first;
 * the contract ids are only TRIED (--fresh drops them if Mindbody refuses,
 * then staff.* likewise).
 *
 * Sep 25 2026 (lean sync): `appointmentBooking.updated` IS documented -- read
 * again on WebhooksDocumentation, "sent when a change is made to any of the
 * properties in the appointmentBooking.created event object", same object.
 * The Sep 24 note that it did not exist was wrong. It is how a new time or a
 * new trainer reaches the Hub in seconds instead of at the next pull.
 */
const EVENT_IDS = [
  'client.created',
  'client.updated',
  'appointmentBooking.created',
  'appointmentBooking.updated',
  'appointmentBooking.cancelled',
  'clientMembershipAssignment.created',
  'clientMembershipAssignment.cancelled',
  'staff.created',
  'staff.updated',
  'staff.deactivated',
];
const MAYBE_EVENT_IDS = ['clientContract.created', 'clientContract.updated', 'clientContract.cancelled'];
/*
 * Sep 26 2026 (the cost plan, Part C): a sale is how Journey learns a
 * client's packages changed, so the nightly job pulls them first instead of
 * polling everyone. Tried on its own rung of the ladder below, so a refusal of
 * the sale id cannot also drop the contract ids (or the other way round).
 */
const SALE_EVENT_IDS = ['clientSale.created'];

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
/*
 * Starting fresh (Sep 24 2026). Mindbody returns a subscription's signing
 * secret ONCE, when it is created, and nobody kept the ones for the three
 * subscriptions that exist (two deactivated for failed deliveries, one never
 * activated). So the way back is a new subscription, in three steps the ship
 * script runs in order with the Firebase secret and a redeploy in between:
 *
 *   --fresh --secret-file <path>   create one; its secret goes ONLY to that
 *                                  file (never the screen), and the line
 *                                  NEW_SUBSCRIPTION_ID=<id> is printed.
 *   --activate <id>                PATCH it Active (after Firebase has the secret).
 *   --delete-except <id>           DELETE every other subscription for this URL.
 */
const FRESH = args.includes('--fresh');
const SECRET_FILE = argValue('secret-file');
const ACTIVATE_ID = argValue('activate');
const DELETE_EXCEPT = argValue('delete-except');
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

  const API = 'https://mb-api.mindbodyonline.com/push/api/v1/subscriptions';
  const headers = { 'Content-Type': 'application/json', 'Api-Key': apiKey, 'SiteId': String(siteId) };
  const idOf = (s) => s.SubscriptionId || s.subscriptionId || s.id;
  const listAll = async () => {
    const r = await fetch(API, { headers });
    if (!r.ok) throw new Error(`listing subscriptions: HTTP ${r.status} ${await r.text()}`);
    const d = await r.json();
    return Array.isArray(d) ? d : d.items || d.Subscriptions || d.subscriptions || [];
  };

  if (FRESH) {
    if (!SECRET_FILE) { console.error('--fresh needs --secret-file <path>.'); process.exit(1); }
    // Documented events first; the undocumented contract ids, then staff, are
    // dropped if Mindbody refuses the request because of them.
    const attempts = [
      [...EVENT_IDS, ...MAYBE_EVENT_IDS, ...SALE_EVENT_IDS],
      [...EVENT_IDS, ...MAYBE_EVENT_IDS],
      [...EVENT_IDS, ...SALE_EVENT_IDS],
      EVENT_IDS,
      EVENT_IDS.filter((e) => !e.startsWith('staff.')),
    ];
    for (const eventIds of attempts) {
      const r = await fetch(API, {
        method: 'POST',
        headers,
        body: JSON.stringify({ webhookUrl, eventSchemaVersion: 1, eventIds, referenceId: 'journey-2026-09-24' }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error(`Mindbody refused ${eventIds.length} events (HTTP ${r.status}): ${JSON.stringify(body).slice(0, 300)}`);
        continue;
      }
      const key = body.MessageSignatureKey || body.messageSignatureKey;
      const id = idOf(body);
      if (!key || !id) { console.error('Created, but Mindbody returned no id or secret:', Object.keys(body)); process.exit(1); }
      fs.writeFileSync(SECRET_FILE, String(key).trim(), { encoding: 'utf8', mode: 0o600 });
      console.log(`Created subscription with ${eventIds.length} events: ${eventIds.join(', ')}`);
      console.log(`Status: ${body.Status || body.status}   secret fingerprint: ${fingerprint(key)} (written to the file, not shown)`);
      console.log(`NEW_SUBSCRIPTION_ID=${id}`);
      return;
    }
    console.error('Mindbody refused every attempt; nothing was created.');
    process.exit(1);
  }

  if (ACTIVATE_ID) {
    const r = await fetch(`${API}/${encodeURIComponent(ACTIVATE_ID)}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'Active' }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { console.error(`Activation refused (HTTP ${r.status}):`, JSON.stringify(body).slice(0, 300)); process.exit(1); }
    console.log(`Subscription ${ACTIVATE_ID} is now ${body.Status || body.status || 'Active'}.`);
    return;
  }

  if (DELETE_EXCEPT) {
    const others = (await listAll()).filter(
      (s) => (s.WebhookUrl || s.webhookUrl) === webhookUrl && idOf(s) !== DELETE_EXCEPT,
    );
    for (const s of others) {
      const r = await fetch(`${API}/${encodeURIComponent(idOf(s))}`, { method: 'DELETE', headers });
      console.log(`${r.ok ? 'Deleted' : `Could not delete (HTTP ${r.status})`} ${idOf(s)}  (${s.Status || s.status})`);
      // The ship script stops on this: an old subscription left active keeps
      // posting with its old secret, and every delivery fails its signature.
      if (!r.ok) process.exitCode = 1;
    }
    if (!others.length) console.log('No other subscriptions for this URL.');
    return;
  }

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
        console.log(`    signing secret fingerprint: ${fingerprint(s.MessageSignatureKey || s.messageSignatureKey)}`);
        const deact = s.DeactivationDateTime || s.deactivationDateTime;
        if (deact) console.log(`    deactivated: ${deact}${s.DeactivationReason || s.deactivationReason ? ` (${s.DeactivationReason || s.deactivationReason})` : ''}`);
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
    console.log(`Signing secret fingerprint: ${fingerprint(signingSecret)} (must match Firebase's MINDBODY_WEBHOOK_SECRET)`);
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
