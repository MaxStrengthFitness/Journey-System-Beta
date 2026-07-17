import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export type MindbodyHealthStatus = 'healthy' | 'degraded' | 'error' | 'offline';

export type MindbodyHealth = {
  status: MindbodyHealthStatus;
  lastSuccessfulEventAt: Date | null;
  lastFailureAt: Date | null;
  dlqDepth: number;
  signatureFailures24h: number;
  webhookSubscriptionActive: boolean;
  hydrationP95LatencyMs: number;
  updatedAt: Date | null;
  // UI lifecycle
  isLoading: boolean;
  hasData: boolean;
  subscriptionError: Error | null;
};

const MindbodyHealthContext = createContext<MindbodyHealth | null>(null);

function parseDate(val: any): Date | null {
  if (!val) return null;
  if (typeof val.toDate === 'function') return val.toDate();
  if (val instanceof Date) return val;
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Provider that subcribes to the canonical system/health Firestore document 
 * and broadcasts it to the application.
 */
export const MindbodyHealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<MindbodyHealth>({
    status: 'offline',
    lastSuccessfulEventAt: null,
    lastFailureAt: null,
    dlqDepth: 0,
    signatureFailures24h: 0,
    webhookSubscriptionActive: false,
    hydrationP95LatencyMs: 0,
    updatedAt: null,
    isLoading: true,
    hasData: false,
    subscriptionError: null
  });

  useEffect(() => {
    const healthDocRef = doc(db, 'system', 'health');
    const unsubscribe = onSnapshot(
      healthDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setState((prev) => ({
            ...prev,
            status: 'offline',
            isLoading: false,
            hasData: false,
            subscriptionError: null
          }));
          return;
        }

        const data = snapshot.data();
        const rawStatus = data?.status;
        const status: MindbodyHealthStatus = 
          (rawStatus === 'healthy' || rawStatus === 'degraded' || rawStatus === 'error' || rawStatus === 'offline')
            ? rawStatus
            : 'offline';

        setState((prev) => ({
          ...prev,
          status,
          lastSuccessfulEventAt: parseDate(data?.lastSuccessfulEventAt),
          lastFailureAt: parseDate(data?.lastFailureAt),
          dlqDepth: typeof data?.dlqDepth === 'number' ? data.dlqDepth : 0,
          signatureFailures24h: typeof data?.signatureFailures24h === 'number' ? data.signatureFailures24h : 0,
          webhookSubscriptionActive: typeof data?.webhookSubscriptionActive === 'boolean' ? data.webhookSubscriptionActive : false,
          hydrationP95LatencyMs: typeof data?.hydrationP95LatencyMs === 'number' ? data.hydrationP95LatencyMs : 0,
          updatedAt: parseDate(data?.updatedAt),
          isLoading: false,
          hasData: true,
          subscriptionError: null
        }));
      },
      (error) => {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          subscriptionError: error
        }));
      }
    );

    return () => unsubscribe();
  }, []);

  const value = useMemo(() => state, [state]);

  return (
    <MindbodyHealthContext.Provider value={value}>
      {children}
    </MindbodyHealthContext.Provider>
  );
};

/**
 * Access the real-time health metrics of the Mindbody integration.
 * Throws if called outside of MindbodyHealthProvider.
 */
export function useMindbodyHealth(): MindbodyHealth {
  const ctx = useContext(MindbodyHealthContext);
  if (!ctx) {
    throw new Error('useMindbodyHealth must be used within a MindbodyHealthProvider');
  }
  return ctx;
}
