import { useState, useEffect } from 'react';
import { InsightsService } from '../services/InsightsService';
import { DashboardAggregatedData, InsightsFilterState, InsightsAggregator } from '../data/insights-logic';
import { Client, WorkoutSession, ExerciseLog } from '../types';

/**
 * Custom hook to safely fetch and filter clinical insight data, protecting
 * Firestore quotas via the InsightsService caching layer.
 * 
 * @param filters - The active UI filters to apply against the global dataset.
 */
export function useInsightsData(filters: InsightsFilterState) {
  const [rawData, setRawData] = useState<{ clients: Client[]; sessions: WorkoutSession[]; logs: ExerciseLog[] } | null>(null);
  const [filteredData, setFilteredData] = useState<DashboardAggregatedData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // 1. Fetch Raw Data (Cached)
  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await InsightsService.fetchRawData();
        if (isMounted && data) {
          setRawData(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Client-Side Aggregation & Filtering
  useEffect(() => {
    if (!rawData) {
      setFilteredData(null);
      return;
    }

    try {
      const computed = InsightsAggregator.generateDashboardMetrics(
        rawData.clients,
        rawData.sessions,
        rawData.logs,
        filters
      );
      setFilteredData(computed);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }

  }, [rawData, filters]);

  // Expose a manual refresh function
  const refetch = async () => {
    InsightsService.invalidateCache();
    setLoading(true);
    try {
      const data = await InsightsService.fetchRawData();
      if (data) {
        setRawData(data);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  return {
    data: filteredData,
    globalData: filteredData, // Keep for backward compatibility with view components
    loading,
    error,
    refetch
  };
}

