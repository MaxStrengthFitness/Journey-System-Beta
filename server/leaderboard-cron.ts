import * as admin from 'firebase-admin';
import { 
  Client, 
  ExerciseLog, 
  ClientMachineSetting, 
  LeaderboardDocument, 
  LeaderboardRank, 
  LeaderboardMachineData 
} from '../src/types';

/**
 * Materialized Leaderboard Cron Job
 * 
 * Objectives:
 * 1. Reduce Firestore read costs by pre-calculating rankings.
 * 2. Generate 'global_latest' for the entire network.
 * 3. Generate 'studio_{id}_latest' for localized comparisons.
 */

export async function runLeaderboardSync() {
  const db = admin.firestore();
  console.log('--- Starting Daily Leaderboard Sync ---');

  // 1. Fetch Core Data
  const clientsSnap = await db.collection('clients').get();
  const logsSnap = await db.collection('exerciseLogs').get();
  const settingsSnap = await db.collection('clientMachineSettings').get();

  const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
  const allLogs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ExerciseLog));
  const allSettings = settingsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ClientMachineSetting));

  // 2. Map Data for Efficiency
  const settingsMap: Record<string, ClientMachineSetting> = {};
  allSettings.forEach(s => { settingsMap[`${s.clientId}_${s.machineId}`] = s; });

  const clientMap: Record<string, Client> = {};
  clients.forEach(c => { clientMap[c.id!] = c; });

  // 3. Process All Machine Data
  const machineIds = Array.from(new Set(allLogs.map(l => l.machineId).filter(Boolean)));
  
  // Aggregate structures
  const globalMachineData: Record<string, LeaderboardMachineData> = {};
  const studioMachineData: Record<string, Record<string, LeaderboardMachineData>> = {};

  // Initialize studio containers
  const studiosSnap = await db.collection('studios').get();
  const studioIds = studiosSnap.docs.map(d => d.id);
  studioIds.forEach(sid => {
    studioMachineData[sid] = {};
  });

  for (const mId of machineIds) {
    const logsForMachine = allLogs.filter(l => l.machineId === mId);
    
    // Find absolute max per client for this machine
    const clientStats = new Map<string, { 
      maxWeight: number, 
      initialWeight: number, 
      reps: number, 
      date: string,
      gap: number
    }>();

    // Sort logs oldest to newest to find initial weight
    const sortedLogs = [...logsForMachine].sort((a, b) => {
      const tA = a.createdAt?.toMillis?.() || 0;
      const tB = b.createdAt?.toMillis?.() || 0;
      return tA - tB;
    });

    sortedLogs.forEach(log => {
      if (!log.clientId) return;
      const weight = parseInt(log.weight || '0', 10) || 0;
      if (weight <= 0) return;

      const existing = clientStats.get(log.clientId);
      if (!existing) {
        clientStats.set(log.clientId, {
          maxWeight: weight,
          initialWeight: weight,
          reps: parseInt(log.reps || '0', 10) || 0,
          date: log.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
          gap: 0 // placeholder
        });
      } else {
        if (weight >= existing.maxWeight) {
          existing.maxWeight = weight;
          existing.reps = parseInt(log.reps || '0', 10) || 0;
          existing.date = log.createdAt?.toDate?.()?.toISOString() || new Date().toISOString();
        }
      }
    });

    // Hydrate with settings (gaps)
    const processedRanks: LeaderboardRank[] = [];
    clientStats.forEach((stat, cId) => {
      const client = clientMap[cId];
      if (!client) return;
      
      const setting = settingsMap[`${cId}_${mId}`];
      let gapValue = 0;
      if (setting?.settings?.['Gap']) {
        gapValue = parseInt(setting.settings['Gap'], 10) || 0;
      }

      processedRanks.push({
        clientId: cId,
        clientName: `${client.firstName} ${client.lastName.charAt(0)}.`,
        maxWeight: stat.maxWeight,
        initialWeight: stat.initialWeight,
        strengthGainPercent: stat.maxWeight > stat.initialWeight ? Math.round(((stat.maxWeight - stat.initialWeight) / stat.initialWeight) * 100) : 0,
        reps: stat.reps,
        gap: gapValue,
        rank: 0, // will set after sorting
        date: stat.date
      });
    });

    // --- GLOBAL ---
    const sortedGlobal = [...processedRanks].sort((a, b) => b.maxWeight - a.maxWeight || b.reps! - a.reps!);
    sortedGlobal.forEach((r, i) => r.rank = i + 1);

    globalMachineData[mId] = {
      machineId: mId,
      topRankings: sortedGlobal.slice(0, 100),
      percentileThresholds: calculateThresholds(sortedGlobal.map(r => r.maxWeight))
    };

    // --- STUDIO LOCALIZED ---
    studioIds.forEach(sid => {
      const studioRanks = processedRanks.filter(r => clientMap[r.clientId]?.homeStudioId === sid);
      const sortedStudio = [...studioRanks].sort((a, b) => b.maxWeight - a.maxWeight || b.reps! - a.reps!);
      sortedStudio.forEach((r, i) => r.rank = i + 1);

      studioMachineData[sid][mId] = {
        machineId: mId,
        topRankings: sortedStudio.slice(0, 100),
        percentileThresholds: calculateThresholds(sortedStudio.map(r => r.maxWeight))
      };
    });
  }

  // 4. Batch Write Results
  const batch = db.batch();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  // Global Doc
  const globalRef = db.collection('leaderboards').doc('global_latest');
  batch.set(globalRef, {
    lastUpdated: timestamp,
    scope: 'global',
    machineData: globalMachineData
  });

  // Studio Docs
  for (const sid of studioIds) {
    const studioRef = db.collection('leaderboards').doc(`studio_${sid}_latest`);
    batch.set(studioRef, {
      lastUpdated: timestamp,
      scope: sid,
      machineData: studioMachineData[sid]
    });
  }

  await batch.commit();
  console.log(`--- Sync Complete: Processed ${machineIds.length} machines for ${studioIds.length} studios ---`);
}

function calculateThresholds(weights: number[]) {
  if (weights.length === 0) return { p90: 0, p75: 0, p50: 0, p25: 0, p10: 0 };
  const sorted = [...weights].sort((a, b) => a - b);
  
  const getP = (p: number) => {
    const idx = Math.floor(sorted.length * (p / 100));
    return sorted[idx] || 0;
  };

  return {
    p90: getP(90),
    p75: getP(75),
    p50: getP(50),
    p25: getP(25),
    p10: getP(10)
  };
}
