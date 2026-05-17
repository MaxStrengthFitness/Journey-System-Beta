import { initializeApp as initializeClientApp } from 'firebase/app';
import { 
  getFirestore as getClientFirestore, 
} from 'firebase/firestore';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import ical from 'node-ical';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Load config for database ID and project ID
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Admin SDK for backend privileges
if (admin.apps.length === 0) {
  try {
    // Attempt explicit initialization with project ID and application default credentials
    admin.initializeApp({
      projectId: config.projectId,
      credential: admin.credential.applicationDefault()
    });
    console.log(`[Admin-Init] Successfully initialized project ${config.projectId} with default credentials.`);
  } catch (err: any) {
    console.warn('[Admin-Init] Application default credentials not found, falling back to basic init. Details:', err.message);
    admin.initializeApp({
      projectId: config.projectId,
    });
  }
}

// Named Database Support (Firestore Enterprise)
// IMPORTANT: We must pass the databaseId specifically to the firestore() call.
const adminDb = getFirestore(admin.app(), config.firestoreDatabaseId);

/**
 * Diagnostic check to verify backend connectivity and permissions.
 */
export async function diagnosticCheck() {
  const syncId = 'DIAG-' + Math.random().toString(36).substring(7);
  const results: any = {
    syncId,
    timestamp: new Date().toISOString(),
    config: {
      projectId: config.projectId,
      databaseId: config.firestoreDatabaseId
    },
    env: {
      NODE_ENV: process.env.NODE_ENV,
      SERVICE_ACCOUNT: !!process.env.GOOGLE_APPLICATION_CREDENTIALS
    },
    steps: []
  };

  try {
    results.steps.push({ name: 'Admin SDK initialized', status: 'OK' });
    
    // Step 1: List collections (Verifies basic DB connection and Project/DB Ids)
    try {
      const collections = await adminDb.listCollections();
      results.steps.push({ 
        name: 'List Collections', 
        status: 'OK', 
        count: collections.length,
        names: collections.map(c => c.id)
      });
    } catch (e: any) {
      results.steps.push({ 
        name: 'List Collections', 
        status: 'FAIL', 
        error: e.message,
        code: e.code,
        details: e.details
      });
    }

    // Step 2: Test Read on trainers
    try {
      const trainers = await adminDb.collection('trainers').limit(1).get();
      results.steps.push({ 
        name: 'Test Read (trainers)', 
        status: 'OK', 
        empty: trainers.empty,
        permissionVerified: true
      });
    } catch (e: any) {
      results.steps.push({ name: 'Test Read (trainers)', status: 'FAIL', error: e.message, code: e.code });
    }

    // Step 3: Test Write on a diagnostic doc
    try {
      const testRef = adminDb.collection('systemDiagnostics').doc('server-test');
      await testRef.set({
        lastTestAt: admin.firestore.FieldValue.serverTimestamp(),
        context: 'AI Studio Manual Diagnostic',
        status: 'OK'
      });
      results.steps.push({ name: 'Test Write (systemDiagnostics)', status: 'OK' });
    } catch (e: any) {
      results.steps.push({ name: 'Test Write (systemDiagnostics)', status: 'FAIL', error: e.message, code: e.code });
    }

    return results;
  } catch (globalError: any) {
    results.globalError = globalError.message;
    return results;
  }
}

// Sync Token for identification
const SYNC_SECRET = 'STABLE_MASTER_SYNC_TOKEN_2026';

const normalizeName = (name: string): string => {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
};

const extractClientName = (summary: string, description: string) => {
  const patterns = [
    /Client:\s*([^(\r\n]+)/i,
    /\(([^)]+)\)/,
    /^([^(:|\n]+)[:|-]/,
    /for\s+([^(\r\n]+)/i,
  ];
  const fullText = `${summary}\n${description}`;
  for (const pattern of patterns) {
    const match = fullText.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 2 && !name.toLowerCase().includes('training') && !name.toLowerCase().includes('workout')) {
        return name;
      }
    }
  }
  return summary.replace(/Personal Training|Workout|Session/gi, '').trim();
};

export async function masterSync(targetTrainerId?: string, hardReset: boolean = false) {
  const syncId = Math.random().toString(36).substring(7);
  console.log(`[Sync-${syncId}] Starting Master Schedule Sync using Admin SDK (Elevated)...`);

  try {
    console.log(`[Sync-${syncId}] Fetching trainers...`);
    const trainersSnap = await adminDb.collection('trainers').get();
    let trainers = trainersSnap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .filter(t => t.mindbody_ical_url);

    if (targetTrainerId) {
      trainers = trainers.filter(t => t.id === targetTrainerId);
    }

    if (trainers.length === 0) {
      console.log(`[Sync-${syncId}] No trainers found with iCal URLs.`);
      return;
    }

    if (hardReset) {
      console.log(`[Sync-${syncId}] Performing hard reset (purging all scheduled entries)...`);
      const allScheduled = await adminDb.collection('schedules').where('status', '==', 'Scheduled').get();
      const batch = adminDb.batch();
      allScheduled.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`[Sync-${syncId}] Purged ${allScheduled.size} records.`);
    }

    console.log(`[Sync-${syncId}] Found ${trainers.length} trainers with MindBody feeds.`);

    console.log(`[Sync-${syncId}] Loading client mapping...`);
    const clientsSnap = await adminDb.collection('clients').limit(1000).get();
    const clientMap: Record<string, string> = {};
    clientsSnap.forEach(d => {
      const data = d.data();
      const fullName = normalizeName(`${data.firstName} ${data.lastName}`);
      clientMap[fullName] = d.id;
      if (data.mindbody_name) {
        clientMap[normalizeName(data.mindbody_name)] = d.id;
      }
    });

    const studiosSnap = await adminDb.collection('studios').get();
    const studioMap: Record<string, string> = {};
    studiosSnap.forEach(d => {
      const data = d.data();
      if (data.mindbodySiteId) {
        studioMap[String(data.mindbodySiteId)] = d.id;
      }
    });

    const resolveStudioId = (mbLocationId?: string | number): string | null => {
      if (!mbLocationId) return null;
      return studioMap[String(mbLocationId)] || null;
    };

    const now = new Date();
    const thirtyDaysAgo = admin.firestore.Timestamp.fromDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const thirtyDaysAhead = admin.firestore.Timestamp.fromDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));

    for (const trainer of trainers) {
      console.log(`[Sync-${syncId}] Syncing trainer: ${trainer.fullName}`);
      try {
        const response = await axios.get(trainer.mindbody_ical_url);
        const icalData = ical.parseICS(response.data);
        
        const sessionUidsInFetch = new Set<string>();
        const vevents = Object.values(icalData).filter(ev => ev.type === 'VEVENT');

        console.log(`[Sync-${syncId}] Fetching existing records for ${trainer.fullName}...`);
        const windowSnap = await adminDb.collection('schedules')
          .where('trainerId', '==', trainer.id)
          .where('startTime', '>=', thirtyDaysAgo)
          .where('startTime', '<=', thirtyDaysAhead)
          .get();
        
        const existingSchedulesMap: Record<string, { id: string, data: any }> = {};
        windowSnap.forEach(d => {
          const data = d.data();
          if (data.ical_uid) {
            existingSchedulesMap[data.ical_uid] = { id: d.id, data };
          }
        });

        for (const ev of vevents as any[]) {
          const uid = ev.uid;
          if (!uid || !ev.start || !ev.end) continue;
          sessionUidsInFetch.add(uid);

          const summary = typeof ev.summary === 'object' ? (ev.summary as any).val : (ev.summary || '');
          const description = typeof ev.description === 'object' ? (ev.description as any).val : (ev.description || '');
          const clientName = extractClientName(summary, description);
          const clientId = clientMap[normalizeName(clientName)] || null;
          
          const isCancelled = 
            (ev.status && typeof ev.status === 'string' && ev.status.toUpperCase() === 'CANCELLED') ||
            summary.toLowerCase().includes('cancel') ||
            summary.toLowerCase().includes('cancelled') ||
            description.toLowerCase().includes('cancel');

          const startTime = admin.firestore.Timestamp.fromDate(new Date(ev.start));
          const endTime = admin.firestore.Timestamp.fromDate(new Date(ev.end));
          const serviceName = summary.includes('(') ? summary.split('(')[0].trim() : (summary || 'Training Session');

          const payload = {
            ical_uid: uid,
            clientName,
            clientId,
            trainerId: trainer.id,
            trainerName: trainer.fullName,
            startTime,
            endTime,
            studioId: resolveStudioId(ev.location) || trainer.homeStudioId || null,
            serviceName,
            status: isCancelled ? 'Cancelled' : 'Scheduled',
            source: 'Subscription',
            lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
            sync_secret: SYNC_SECRET
          };

          const existing = existingSchedulesMap[uid];
          
          if (!existing) {
            console.log(`[Sync-${syncId}] Creating ${uid} for ${clientName}`);
            await adminDb.collection('schedules').add({
              ...payload,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
          } else {
            const current = existing.data;
            const hasChanged = 
              current.status !== payload.status ||
              current.clientName !== payload.clientName ||
              current.clientId !== payload.clientId ||
              current.serviceName !== payload.serviceName ||
              current.startTime?.toDate()?.getTime() !== startTime.toDate().getTime() ||
              current.endTime?.toDate()?.getTime() !== endTime.toDate().getTime();

            if (hasChanged) {
              console.log(`[Sync-${syncId}] Updating ${uid} for ${clientName}`);
              await adminDb.collection('schedules').doc(existing.id).update(payload);
            }
          }
        }

        // Cleanup orphaned records (Scheduled sessions that vanished from feed)
        for (const uid in existingSchedulesMap) {
          if (!sessionUidsInFetch.has(uid) && existingSchedulesMap[uid].data.status === 'Scheduled') {
            const staleId = existingSchedulesMap[uid].id;
            console.log(`[Sync-${syncId}] Marking orphaned record as cancelled: ${uid} (ID: ${staleId})`);
            await adminDb.collection('schedules').doc(staleId).update({
              status: 'Cancelled',
              cancellationReason: 'Session removed from MindBody feed',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              sync_secret: SYNC_SECRET
            });
          }
        }

      } catch (err: any) {
        console.error(`[Sync-${syncId}] Error syncing trainer ${trainer.fullName}:`, err.message);
      }
    }

    console.log(`[Sync-${syncId}] Master Sync Completed.`);
  } catch (error: any) {
    console.error(`[Sync-${syncId}] Sync operation FAILED:`, error.message);
    throw error;
  }
}
