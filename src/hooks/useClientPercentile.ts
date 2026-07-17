import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { LeaderboardDocument } from '../types';

export function useClientPercentile(clientId: string | undefined, machineId: string, scope: 'global' | string = 'global') {
  const [data, setData] = useState<{
    weight: number;
    rank: number;
    percentile: number;
    totalClients: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!clientId) {
      setLoading(false);
      return;
    }

    async function fetchPercentile() {
      setLoading(true);
      try {
        const docId = scope === 'global' ? 'global' : `studio_${scope}`;
        const docRef = doc(db, 'leaderboards', docId);
        const snap = await getDoc(docRef);

        if (snap.exists()) {
          const lb = snap.data() as LeaderboardDocument;
          const machineData = lb.machineData[machineId];
          
          if (machineData && machineData.clientPlacements && machineData.clientPlacements[clientId]) {
            const placement = machineData.clientPlacements[clientId];
            setData({
              weight: placement.weight,
              rank: placement.rank,
              percentile: placement.percentile,
              totalClients: machineData.stats.count
            });
          } else {
            setData(null);
          }
        } else {
          setData(null);
        }
      } catch (err) {
        console.error("Error in useClientPercentile:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchPercentile();
  }, [clientId, machineId, scope]);

  return { data, loading };
}
