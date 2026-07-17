import { collection, query, where, getDocs, doc, writeBatch, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { WorkoutSession, ExerciseLog, CurrentMachineMetric, Client } from '../types';

/**
 * Robust one-time execution script to retroactively fix all legacy data.
 * Iterates through all sessions for a client chronologically and updates
 * the single source of truth map: `currentMachineMetrics`.
 */
export async function migrateClientMachineMetrics(clientId: string) {
  try {
    const batch = writeBatch(db);
    
    // Fetch all sessions for this client
    const sessionsQ = query(
      collection(db, 'sessions'),
      where('clientId', '==', clientId),
      orderBy('date', 'asc') // Oldest to newest
    );
    
    const sessionsSnap = await getDocs(sessionsQ);
    const sessions = sessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkoutSession));
    
    // Fetch all exercise logs for this client
    const logsQ = query(
      collection(db, 'exerciseLogs'),
      where('clientId', '==', clientId),
      orderBy('createdAt', 'asc') // Oldest to newest
    );
    
    const logsSnap = await getDocs(logsQ);
    const logs = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExerciseLog));
    
    const currentMachineMetrics: Record<string, CurrentMachineMetric> = {};

    // Group logs by session ID
    const logsBySessionId: Record<string, ExerciseLog[]> = {};
    for (const log of logs) {
      if (!logsBySessionId[log.sessionId]) {
        logsBySessionId[log.sessionId] = [];
      }
      logsBySessionId[log.sessionId].push(log);
    }
    
    for (const session of sessions) {
      const sessionLogs = logsBySessionId[session.id!] || [];
      const sessionDate = session.startTime?.toDate?.() || (session.date ? new Date(session.date) : new Date());
      
      for (const log of sessionLogs) {
        if (!log.weight && !log.reps && !log.seconds) continue;
        
        currentMachineMetrics[log.machineId] = {
          weight: log.weight || '0',
          reps: log.reps,
          seconds: log.seconds,
          isStaticHold: log.isStaticHold,
          isTSC: log.isTSC,
          totalTimeUnderLoad: log.totalTimeUnderLoad,
          averageTimePerRep: log.averageTimePerRep,
          settings: log.machineSettings || {},
          lastPerformedDate: sessionDate,
          lastPerformedSessionNumber: session.sessionNumber,
          lastSessionId: session.id
        };
      }
    }
    
    const clientRef = doc(db, 'clients', clientId);
    batch.update(clientRef, { currentMachineMetrics });
    
    await batch.commit();
    console.log(`Successfully migrated machine metrics for client ${clientId}`);
    return true;
  } catch (error) {
    console.error(`Failed to migrate machine metrics for client ${clientId}`, error);
    return false;
  }
}
