import { useState, useEffect } from 'react';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { WorkoutSession } from '../types';
import { isSessionValid } from '../lib/utils';

export function useActiveSessionCheck(clientId: string | null) {
  const [activeInProgressSession, setActiveInProgressSession] = useState<WorkoutSession | null>(null);
  const [isCheckingActiveSession, setIsCheckingActiveSession] = useState(false);

  useEffect(() => {
    if (!clientId) {
      setActiveInProgressSession(null);
      return;
    }

    setIsCheckingActiveSession(true);
    const q = query(
      collection(db, "sessions"),
      where("clientId", "==", clientId),
      where("status", "==", "In-Progress"),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const session = { id: snap.docs[0].id, ...snap.docs[0].data() } as WorkoutSession;
        
        // Lazy Cleanup check: If last heartbeat was > 60 mins ago, treat as abandoned
        if (isSessionValid(session)) {
          setActiveInProgressSession(session);
        } else {
          setActiveInProgressSession(null);
        }
      } else {
        setActiveInProgressSession(null);
      }
      setIsCheckingActiveSession(false);
    }, (err) => {
      console.error("Error checking active session", err);
      setIsCheckingActiveSession(false);
    });

    return () => unsubscribe();
  }, [clientId]);

  return { activeInProgressSession, isCheckingActiveSession };
}
