import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { DashboardAggregatedData, InsightsAggregator } from '../data/insights-logic';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Client, WorkoutSession, ExerciseLog } from '../types';

const GLOBAL_INSIGHTS_CACHE_KEY = 'msf_global_insights_cache';
const CACHE_EXPIRATION_MS = 12 * 60 * 60 * 1000; // 12 hours

interface CachedInsights {
  timestamp: number;
  data: DashboardAggregatedData;
}

export class InsightsService {
  /**
   * Fetches the nightly aggregated insights document from Firestore.
   * Utilizes sessionStorage to aggressively cache the result for 12 hours,
   * protecting against excessive Firestore read costs.
   */
  static async fetchGlobalInsights(): Promise<DashboardAggregatedData | null> {
    try {
      // 1. Check Cache
      const cachedString = sessionStorage.getItem(GLOBAL_INSIGHTS_CACHE_KEY);
      if (cachedString) {
        const cached: CachedInsights = JSON.parse(cachedString);
        const isExpired = Date.now() - cached.timestamp > CACHE_EXPIRATION_MS;
        
        if (!isExpired && cached.data) {
          console.debug('[InsightsService] Serving global insights from cache.');
          return cached.data;
        } else {
          console.debug('[InsightsService] Cache expired, fetching fresh data.');
          sessionStorage.removeItem(GLOBAL_INSIGHTS_CACHE_KEY);
        }
      }

      // 2. Fetch raw data from Firestore to calculate insights on the fly for beta testing
      console.debug('[InsightsService] Fetching raw data to calculate global insights.');
      
      const [clientsSnap, sessionsSnap, logsSnap] = await Promise.all([
        getDocs(query(collection(db, 'clients'), limit(100))),
        getDocs(query(collection(db, 'sessions'), orderBy('createdAt', 'desc'), limit(50))),
        getDocs(query(collection(db, 'exerciseLogs'), orderBy('createdAt', 'desc'), limit(50)))
      ]);

      const clients = clientsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client));
      const sessions = sessionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as WorkoutSession));
      const logs = logsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExerciseLog));

      const data = InsightsAggregator.generateDashboardMetrics(clients, sessions, logs, {
        startDate: null, endDate: null, ageBrackets: [], genders: [], activityLevels: []
      });

      // 3. Cache the valid result
      const cachePayload: CachedInsights = {
        timestamp: Date.now(),
        data
      };
      sessionStorage.setItem(GLOBAL_INSIGHTS_CACHE_KEY, JSON.stringify(cachePayload));
      
      return data;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'aggregations/global_insights');
      return null;
    }
  }

  /**
   * Manually invalidate the cache (e.g., if a force-refresh is requested).
   */
  static invalidateCache(): void {
    sessionStorage.removeItem(GLOBAL_INSIGHTS_CACHE_KEY);
    console.debug('[InsightsService] Cache manually invalidated.');
  }
}
