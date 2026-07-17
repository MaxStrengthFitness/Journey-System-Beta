import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Client, WorkoutSession, ExerciseLog } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

const RAW_INSIGHTS_CACHE_KEY = 'msf_raw_insights_cache';
const CACHE_EXPIRATION_MS = 12 * 60 * 60 * 1000; // 12 hours

interface CachedRawData {
  timestamp: number;
  clients: Client[];
  sessions: WorkoutSession[];
  logs: ExerciseLog[];
}

export class InsightsService {
  /**
   * Fetches the raw clinical dataset from Firestore.
   * Utilizes sessionStorage to cache the raw lists, protecting against
   * excessive Firestore read costs.
   */
  static async fetchRawData(): Promise<{ clients: Client[]; sessions: WorkoutSession[]; logs: ExerciseLog[] } | null> {
    try {
      // 1. Check Cache
      const cachedString = sessionStorage.getItem(RAW_INSIGHTS_CACHE_KEY);
      if (cachedString) {
        const cached: CachedRawData = JSON.parse(cachedString);
        const isExpired = Date.now() - cached.timestamp > CACHE_EXPIRATION_MS;
        
        if (!isExpired && cached.clients && cached.sessions && cached.logs) {
          console.debug('[InsightsService] Serving raw insights data from cache.');
          return {
            clients: cached.clients,
            sessions: cached.sessions,
            logs: cached.logs
          };
        } else {
          console.debug('[InsightsService] Raw insights cache expired, fetching fresh data.');
          sessionStorage.removeItem(RAW_INSIGHTS_CACHE_KEY);
        }
      }

      // 2. Fetch raw data from Firestore
      console.debug('[InsightsService] Fetching fresh raw insights data from Firestore.');
      
      const [clientsSnap, sessionsSnap, logsSnap] = await Promise.all([
        getDocs(query(collection(db, 'clients'), limit(500))),
        getDocs(query(collection(db, 'sessions'), orderBy('createdAt', 'desc'), limit(1000))),
        getDocs(query(collection(db, 'exerciseLogs'), orderBy('createdAt', 'desc'), limit(1000)))
      ]);

      const clients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      const sessions = sessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkoutSession));
      const logs = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExerciseLog));

      // 3. Cache the valid result
      const cachePayload: CachedRawData = {
        timestamp: Date.now(),
        clients,
        sessions,
        logs
      };
      sessionStorage.setItem(RAW_INSIGHTS_CACHE_KEY, JSON.stringify(cachePayload));
      
      return { clients, sessions, logs };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'aggregations/raw_insights');
      return null;
    }
  }

  /**
   * Manually invalidate the cache.
   */
  static invalidateCache(): void {
    sessionStorage.removeItem(RAW_INSIGHTS_CACHE_KEY);
    console.debug('[InsightsService] Raw data cache manually invalidated.');
  }
}
