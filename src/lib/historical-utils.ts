import { ExerciseLog } from '../types';
import { isPerformedLog } from './set-outcome';
import { parseSessionDate, getMillis } from './utils';

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
  // that has a PERFORMED set on this machine — the load from a practice set
  // must never become the next prescription (set-outcome.ts).
  for (const session of clientSessions) {
    const logsForSession = historyLogs.filter(l => 
      l.sessionId === session.id &&
      l.machineId === machineId &&
      l.clientId === clientId &&
      isPerformedLog(l)
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
