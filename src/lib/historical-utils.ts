import { collection, query, where, orderBy, limit, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { ExerciseLog, Client, Machine } from '../types';
import { calculateStartingWeight } from './consultation-utils';
import { parseSessionDate, getMillis } from './utils';

export interface HistoricalMachinePerformance {
  lastLog: ExerciseLog | null; // Kept for backwards compatibility / simple displays
  allLogsFromSession: ExerciseLog[]; // To handle sided machines (Left/Right)
  lastSessionId: string | null;
  lastSessionDate: Date | null;
  lastSessionNumber: number | null;
  defaultStartingWeight: number | null;
}

/**
 * Iterates backward through a strictly chronological history array to find the 
 * exact weight the client used the last time they performed a specific machine.
 */
export function getLatestTargetWeight(
  clientId: string,
  machineId: string,
  historySessions: import('../types').WorkoutSession[],
  historyLogs: ExerciseLog[],
  side?: string
): string {
  // Filter sessions for this client and sort strictly chronologically by true Date objects
  const clientSessions = historySessions
    .filter(s => s.clientId === clientId)
    .sort((a, b) => {
      const dateA = a.startTime ? getMillis(a.startTime) : parseSessionDate(a.date);
      const dateB = b.startTime ? getMillis(b.startTime) : parseSessionDate(b.date);
      return dateB - dateA; // Descending (newest first)
    });

  // Iterate backward (newest to oldest) mapping to find the most recent session
  for (const session of clientSessions) {
    const logsForSession = historyLogs.filter(l => 
      l.sessionId === session.id &&
      l.machineId === machineId &&
      l.clientId === clientId
    );
    
    if (logsForSession.length > 0) {
      if (side) {
        const sideLog = logsForSession.find(l => l.side === side);
        if (sideLog && sideLog.weight) {
          return sideLog.weight;
        }
      }
      
      // Fallback if no specific side requested or side not found
      const firstValidWeight = logsForSession.find(l => l.weight)?.weight;
      if (firstValidWeight) {
        return firstValidWeight;
      }
    }
  }

  return '0';
}

/**
 * Fetches the most recent historically accurate performance data for a client on a specific machine.
 * This looks back through their entire session history until it finds an instance where they actually
 * performed the machine.
 * 
 * If the machine has NEVER been performed, it falls back to a demographic-calculated starting weight.
 */
export async function getLatestMachinePerformance(
  clientId: string,
  machineId: string,
  client: Client,
  machineName: string
): Promise<HistoricalMachinePerformance> {
  try {
    // Query to find the absolute most recent log for this exact client and machine
    const logsRef = collection(db, 'exerciseLogs');
    const q = query(
      logsRef,
      where('clientId', '==', clientId),
      where('machineId', '==', machineId),
      orderBy('createdAt', 'desc'),
      limit(1) // Just find the ID of the most recent execution
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const lastLogDoc = snapshot.docs[0];
      const lastLog = { id: lastLogDoc.id, ...lastLogDoc.data() } as ExerciseLog;
      
      // Fetch the associated session to get its date
      let lastSessionDate = lastLog.createdAt?.toDate?.() || new Date(); // Fallback to log timestamp
      let lastSessionNumber = null;
      let sessionDocRef = null;
      let allLogsFromSession: ExerciseLog[] = [lastLog];
      
      if (lastLog.sessionId) {
        try {
          // Fetch the session date
          sessionDocRef = doc(db, 'sessions', lastLog.sessionId);
          const sessionSnap = await getDoc(sessionDocRef);
          if (sessionSnap.exists()) {
             const sData = sessionSnap.data() as import('../types').WorkoutSession;
             if (sData.date) {
                lastSessionDate = new Date(sData.date);
             } else if (sData.startTime) {
                lastSessionDate = sData.startTime.toDate();
             }
             if (sData.sessionNumber) {
               lastSessionNumber = sData.sessionNumber;
             }
          }

          // Fetch all logs for this machine from that exact session (to catch Left/Right splits)
          const sessionLogsQ = query(
            logsRef,
            where('clientId', '==', clientId),
            where('machineId', '==', machineId),
            where('sessionId', '==', lastLog.sessionId)
          );
          const sessionLogsSnap = await getDocs(sessionLogsQ);
          if (!sessionLogsSnap.empty) {
             allLogsFromSession = sessionLogsSnap.docs.map(d => ({ id: d.id, ...d.data() } as ExerciseLog));
          }
        } catch (e) {
          console.error("Failed to fetch extended historical session data", e);
        }
      }

      return {
        lastLog,
        allLogsFromSession,
        lastSessionId: lastLog.sessionId,
        lastSessionDate,
        lastSessionNumber,
        defaultStartingWeight: null
      };
    }

    // FALLBACK: Client has never performed this machine
    const gender = (client.gender === 'Female' ? 'Female' : 'Male'); // Fallback gender
    // Defaulting age to 45 if missing, Defaulting skill to Novice
    const calculatedWeight = calculateStartingWeight(machineName, gender, client.age || 45, 'Novice');

    return {
      lastLog: null,
      allLogsFromSession: [],
      lastSessionId: null,
      lastSessionDate: null,
      lastSessionNumber: null,
      defaultStartingWeight: calculatedWeight > 0 ? calculatedWeight : null
    };
  } catch (error) {
    console.error("Error fetching historical machine performance:", error);
    return {
      lastLog: null,
      allLogsFromSession: [],
      lastSessionId: null,
      lastSessionDate: null,
      lastSessionNumber: null,
      defaultStartingWeight: null
    };
  }
}
