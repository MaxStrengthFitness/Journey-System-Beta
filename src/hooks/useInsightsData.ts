import { useState, useEffect } from 'react';
import { InsightsService } from '../services/InsightsService';
import { DashboardAggregatedData, InsightsFilterState } from '../data/insights-logic';
import { ActivityLevel } from '../data/occupational-matrix';

/**
 * Custom hook to safely fetch and filter clinical insight data, protecting
 * Firestore quotas via the InsightsService caching layer.
 * 
 * @param filters - The active UI filters to apply against the global dataset.
 */
export function useInsightsData(filters: InsightsFilterState) {
  const [globalData, setGlobalData] = useState<DashboardAggregatedData | null>(null);
  const [filteredData, setFilteredData] = useState<DashboardAggregatedData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // 1. Fetch Global Data (Cached)
  useEffect(() => {
    let isMounted = true;
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await InsightsService.fetchGlobalInsights();
        if (isMounted) {
          setGlobalData(data);
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

  // 2. Client-Side Filtering
  useEffect(() => {
    if (!globalData) {
      setFilteredData(null);
      return;
    }

    // In a true clinical setting, the aggregation doc would contain a massive matrix.
    // For this dashboard, we filter the pre-aggregated arrays based on the selected stress profiles.
    
    // Example filtering logic: 
    // If 'all' or empty, we show everything. Otherwise, we filter the metrics by demographicCohort / occupationCategory
    const hasStressFilters = filters.activityLevels && filters.activityLevels.length > 0;
    
    // Filter Time to Trend by Stress Profile
    const filteredTimeToTrend = globalData.timeToTrend.filter(item => {
      if (!hasStressFilters) return true;
      // Assuming demographicCohort aligns with ActivityLevel values in the data dictionary
      return filters.activityLevels.some(activityLevel => activityLevel === item.demographicCohort as any);
    });

    // Filter Demographic Retention
    // If we only want specific stress profiles, we might filter retention by those mappings.
    // Since retention has occupationCategory, we would map Category -> Stress Profile, but for simplicity, 
    // we assume the data structure holds the exact matching label or ID.
    const filteredRetention = globalData.retention.filter(item => {
      // ... actual complex mapping goes here based on Phase 1 ...
      return true; // Simplified for skeleton
    });

    // Filter Machine Efficacy
    // Assuming Machine Efficacy is either global or has nested demographic properties
    const filteredMachineEfficacy = globalData.machineEfficacy.filter(item => {
      return true; // Simplified for skeleton
    });

    setFilteredData({
      ...globalData,
      timeToTrend: filteredTimeToTrend,
      retention: filteredRetention,
      machineEfficacy: filteredMachineEfficacy,
      strengthGainsByDemographic: globalData.strengthGainsByDemographic,
      strengthGainsByMuscleGroup: globalData.strengthGainsByMuscleGroup,
    });

  }, [globalData, filters]);

  // Expose a manual refresh function
  const refetch = async () => {
    InsightsService.invalidateCache();
    setLoading(true);
    try {
      const data = await InsightsService.fetchGlobalInsights();
      setGlobalData(data);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  };

  return {
    data: filteredData,
    globalData, // Optional, if UI needs to show comparing against global
    loading,
    error,
    refetch
  };
}
