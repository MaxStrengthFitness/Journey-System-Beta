import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import ical from 'node-ical';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Load config for database ID and project ID
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Firebase Client SDK for backend (no IAM needed)
const app = initializeApp(config);
const clientDb = getFirestore(app, config.firestoreDatabaseId);

export async function diagnosticCheck() {
  const syncId = 'DIAG-' + Math.random().toString(36).substring(7);
  const results: any = {
    syncId,
    timestamp: new Date().toISOString(),
    steps: []
  };

  try {
    results.steps.push({ name: 'Client SDK initialized', status: 'OK' });
    
    // Step 1: Test Read on trainers (should pass if rules allow)
    try {
      const trainersSnap = await getDocs(query(collection(clientDb, 'trainers')));
      results.steps.push({ 
        name: 'Test Read (trainers)', 
        status: trainersSnap.empty ? 'EMPTY' : 'OK',
        count: trainersSnap.size,
        permissionVerified: true
      });
    } catch (e: any) {
      results.steps.push({ name: 'Test Read (trainers)', status: 'FAIL', error: e.message, code: e.code });
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
  console.log(`[Sync-${syncId}] Starting Master Schedule Sync using Client SDK...`);

  try {
    console.log(`[Sync-${syncId}] Fetching trainers...`);
    const trainersSnap = await getDocs(collection(clientDb, 'trainers'));
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
      const allScheduled = await getDocs(query(collection(clientDb, 'schedules'), where('status', '==', 'Scheduled')));
      const batch = writeBatch(clientDb);
      allScheduled.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.log(`[Sync-${syncId}] Purged ${allScheduled.size} records.`);
    }

    console.log(`[Sync-${syncId}] Found ${trainers.length} trainers with MindBody feeds.`);

    console.log(`[Sync-${syncId}] Loading client mapping...`);
    const clientsSnap = await getDocs(collection(clientDb, 'clients'));
    const clientMap: Record<string, string> = {};
    clientsSnap.forEach(d => {
      const data = d.data();
      const fullName = normalizeName(`${data.firstName} ${data.lastName}`);
      clientMap[fullName] = d.id;
      if (data.mindbody_name) {
        clientMap[normalizeName(data.mindbody_name)] = d.id;
      }
    });

    const studiosSnap = await getDocs(collection(clientDb, 'studios'));
    const studiosWithNames: any[] = [];
    studiosSnap.forEach(d => {
      const data = d.data();
      studiosWithNames.push({ id: d.id, name: data.name, ...data });
    });

    const resolveStudioId = (mbLocationStr?: string | number): string | null => {
      if (!mbLocationStr) return null;
      const t = String(mbLocationStr).toLowerCase();
      for (const s of studiosWithNames) {
        if (s.name && t.includes(s.name.toLowerCase())) {
          return s.id;
        }
        if (s.mindbodySiteId && t.includes(String(s.mindbodySiteId).toLowerCase())) {
          return s.id;
        }
      }
      return null;
    };

    const now = new Date();
    const thirtyDaysAgo = Timestamp.fromDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const thirtyDaysAhead = Timestamp.fromDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));

    for (const trainer of trainers) {
      console.log(`[Sync-${syncId}] Syncing trainer: ${trainer.fullName}`);
      try {
        const response = await axios.get(trainer.mindbody_ical_url);
        const icalData = ical.parseICS(response.data);
        
        const sessionUidsInFetch = new Set<string>();
        const vevents = Object.values(icalData).filter((ev: any) => ev.type === 'VEVENT');

        console.log(`[Sync-${syncId}] Fetching existing records for ${trainer.fullName}...`);
        
        // Use multiple where clauses to mimic the admin query
        const windowSnap = await getDocs(query(collection(clientDb, 'schedules'), 
          where('trainerId', '==', trainer.id)
        ));
        
        const existingSchedulesMap: Record<string, { id: string, data: any }> = {};
        windowSnap.forEach(d => {
          const data = d.data();
          if (data.startTime) {
            const time = data.startTime.toDate().getTime();
            if (time >= thirtyDaysAgo.toDate().getTime() && time <= thirtyDaysAhead.toDate().getTime()) {
              if (data.ical_uid) {
                existingSchedulesMap[data.ical_uid] = { id: d.id, data };
              }
            }
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

          const startTime = Timestamp.fromDate(new Date(ev.start));
          const endTime = Timestamp.fromDate(new Date(ev.end));
          const serviceName = summary.includes('(') ? summary.split('(')[0].trim() : (summary || 'Training Session');

          const payload = {
            ical_uid: uid,
            clientName,
            clientId,
            trainerId: trainer.id,
            trainerName: trainer.fullName,
            startTime,
            endTime,
            studioId: resolveStudioId(ev.location) || trainer.primaryHomeStudioId || null,
            serviceName,
            status: isCancelled ? 'Cancelled' : 'Scheduled',
            source: 'Subscription',
            lastSyncAt: serverTimestamp(),
            sync_secret: SYNC_SECRET
          };

          const existing = existingSchedulesMap[uid];
          
          if (!existing) {
            console.log(`[Sync-${syncId}] Creating ${uid} for ${clientName}`);
            await addDoc(collection(clientDb, 'schedules'), {
              ...payload,
              createdAt: serverTimestamp()
            });
          } else {
            const current = existing.data;
            const hasChanged = 
              current.status !== payload.status ||
              current.clientName !== payload.clientName ||
              current.clientId !== payload.clientId ||
              current.serviceName !== payload.serviceName ||
              current.studioId !== payload.studioId ||
              current.startTime?.toDate()?.getTime() !== startTime.toDate().getTime() ||
              current.endTime?.toDate()?.getTime() !== endTime.toDate().getTime();

            if (hasChanged) {
              console.log(`[Sync-${syncId}] Updating ${uid} for ${clientName}`);
              await updateDoc(doc(clientDb, 'schedules', existing.id), payload);
            }
          }
        }

        // Cleanup orphaned records
        for (const uid in existingSchedulesMap) {
          if (!sessionUidsInFetch.has(uid) && existingSchedulesMap[uid].data.status === 'Scheduled') {
            const staleId = existingSchedulesMap[uid].id;
            console.log(`[Sync-${syncId}] Marking orphaned record as cancelled: ${uid}`);
            await updateDoc(doc(clientDb, 'schedules', staleId), {
              status: 'Cancelled',
              cancellationReason: 'Session removed from MindBody feed',
              updatedAt: serverTimestamp(),
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

