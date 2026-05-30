import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { recordHealthEvent } from './healthState';

type MockDocRef = { path: string; id: string };

type MockTransaction = {
  get: (ref: MockDocRef) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
  set: (ref: MockDocRef, data: Record<string, unknown>) => MockTransaction;
};

type MockFirestore = Pick<Firestore, 'collection' | 'runTransaction'> & {
  seed: (path: string, data: Record<string, unknown>) => void;
  snapshot: (path: string) => Record<string, unknown> | undefined;
};

function createMockFirestore(): MockFirestore {
  const store = new Map<string, Record<string, unknown>>();
  let transactionLock = Promise.resolve() as Promise<unknown>;
  const sentinel = FieldValue.serverTimestamp();

  return {
    seed(path: string, data: Record<string, unknown>) {
      store.set(path, data);
    },
    snapshot(path: string) {
      return store.get(path);
    },
    collection(name: string) {
      return {
        doc(id: string) {
          return { path: `${name}/${id}`, id };
        },
      } as unknown as ReturnType<Firestore['collection']>;
    },
    runTransaction<T>(updateFunction: (t: MockTransaction) => Promise<T>): Promise<T> {
      const run = async () => {
        const tx: MockTransaction = {
          get: async (ref: MockDocRef) => {
            const data = store.get(ref.path);
            return { exists: data !== undefined, data: () => data };
          },
          set: (ref: MockDocRef, data: Record<string, unknown>) => {
            const parsedData = { ...data };
            for (const key of Object.keys(parsedData)) {
              const val = parsedData[key] as any;
              if (val && typeof val.isEqual === 'function' && val.isEqual(sentinel)) {
                parsedData[key] = Timestamp.fromMillis(Date.now());
              }
            }
            store.set(ref.path, parsedData);
            return tx;
          },
        };
        return updateFunction(tx);
      };
      
      const p = transactionLock.then(run);
      transactionLock = p.catch(() => {});
      return p as Promise<T>;
    },
  } as unknown as MockFirestore;
}

describe('recordHealthEvent', () => {
  let mockDb: MockFirestore;
  const firestore = () => mockDb as unknown as Firestore;
  
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. webhook_success on a fresh DB creates the document with all 8 fields and status=healthy', async () => {
    vi.setSystemTime(1000000000);
    await recordHealthEvent(firestore(), { type: 'webhook_success', hydrationLatencyMs: 120 });
    
    const doc = mockDb.snapshot('system/health');
    expect(doc).toBeDefined();
    expect(doc?.status).toBe('healthy');
    expect((doc?.lastSuccessfulEventAt as Timestamp).toMillis()).toBe(1000000000);
    expect(doc?.lastFailureAt).toBeNull();
    expect(doc?.dlqDepth).toBe(0);
    expect(doc?.signatureFailures24h).toBe(0);
    expect(doc?.webhookSubscriptionActive).toBe(true);
    expect(doc?.hydrationP95LatencyMs).toBe(120);
    expect((doc?.updatedAt as Timestamp).toMillis()).toBe(1000000000);
  });

  it('2. webhook_success on existing doc updates success/latency; preserves rest; recomputes status', async () => {
    mockDb.seed('system/health', {
      status: 'error',
      lastSuccessfulEventAt: null,
      lastFailureAt: Timestamp.fromMillis(900000000),
      dlqDepth: 0,
      signatureFailures24h: 0,
      webhookSubscriptionActive: true,
      hydrationP95LatencyMs: 0
    });
    vi.setSystemTime(1000000000);
    await recordHealthEvent(firestore(), { type: 'webhook_success', hydrationLatencyMs: 150 });
    const doc = mockDb.snapshot('system/health');
    expect(doc?.status).toBe('healthy');
    expect((doc?.lastSuccessfulEventAt as Timestamp).toMillis()).toBe(1000000000);
    expect(doc?.hydrationP95LatencyMs).toBe(150);
    expect((doc?.lastFailureAt as Timestamp).toMillis()).toBe(900000000);
  });

  it('3. webhook_failure updates lastFailureAt; lastSuccessfulEventAt unchanged', async () => {
    mockDb.seed('system/health', {
      status: 'healthy',
      lastSuccessfulEventAt: Timestamp.fromMillis(900000000),
      lastFailureAt: null,
      dlqDepth: 0,
      signatureFailures24h: 0,
      webhookSubscriptionActive: true,
      hydrationP95LatencyMs: 120
    });
    vi.setSystemTime(1000000000);
    await recordHealthEvent(firestore(), { type: 'webhook_failure' });
    const doc = mockDb.snapshot('system/health');
    expect((doc?.lastFailureAt as Timestamp).toMillis()).toBe(1000000000);
    expect((doc?.lastSuccessfulEventAt as Timestamp).toMillis()).toBe(900000000);
  });

  it('4. signature_failure on fresh DB increments signatureFailures24h to 1 and sets status=error', async () => {
    vi.setSystemTime(1000000000);
    await recordHealthEvent(firestore(), { type: 'signature_failure' });
    const doc = mockDb.snapshot('system/health');
    expect(doc?.signatureFailures24h).toBe(1);
    expect(doc?.status).toBe('error');
  });

  it('5. signature_failure on existing doc with count=3 sets count to 4', async () => {
    mockDb.seed('system/health', {
      status: 'error',
      lastSuccessfulEventAt: Timestamp.fromMillis(900000000),
      lastFailureAt: null,
      dlqDepth: 0,
      signatureFailures24h: 3,
      webhookSubscriptionActive: true,
      hydrationP95LatencyMs: 120
    });
    await recordHealthEvent(firestore(), { type: 'signature_failure' });
    const doc = mockDb.snapshot('system/health');
    expect(doc?.signatureFailures24h).toBe(4);
  });

  it('6. subscription_status(false) sets status=offline even when all others healthy', async () => {
    mockDb.seed('system/health', {
      status: 'healthy',
      lastSuccessfulEventAt: Timestamp.fromMillis(1000000000), // recent
      lastFailureAt: null,
      dlqDepth: 0,
      signatureFailures24h: 0,
      webhookSubscriptionActive: true,
      hydrationP95LatencyMs: 120
    });
    vi.setSystemTime(1000010000); // 10s later
    await recordHealthEvent(firestore(), { type: 'subscription_status', active: false });
    const doc = mockDb.snapshot('system/health');
    expect(doc?.status).toBe('offline');
    expect(doc?.webhookSubscriptionActive).toBe(false);
  });

  it('7. subscription_status(true) on an offline doc recomputes status (to healthy)', async () => {
    mockDb.seed('system/health', {
      status: 'offline',
      lastSuccessfulEventAt: Timestamp.fromMillis(1000000000),
      lastFailureAt: null,
      dlqDepth: 0,
      signatureFailures24h: 0,
      webhookSubscriptionActive: false,
      hydrationP95LatencyMs: 120
    });
    vi.setSystemTime(1000010000); // 10s later
    await recordHealthEvent(firestore(), { type: 'subscription_status', active: true });
    const doc = mockDb.snapshot('system/health');
    expect(doc?.status).toBe('healthy');
  });

  it('8. dlq_depth_changed(1) sets status=degraded', async () => {
    mockDb.seed('system/health', {
      status: 'healthy',
      lastSuccessfulEventAt: Timestamp.fromMillis(1000000000),
      lastFailureAt: null,
      dlqDepth: 0,
      signatureFailures24h: 0,
      webhookSubscriptionActive: true,
      hydrationP95LatencyMs: 120
    });
    vi.setSystemTime(1000010000); // 10s later
    await recordHealthEvent(firestore(), { type: 'dlq_depth_changed', depth: 1 });
    const doc = mockDb.snapshot('system/health');
    expect(doc?.status).toBe('degraded');
  });

  it('9. dlq_depth_changed(11) sets status=error', async () => {
    mockDb.seed('system/health', {
      status: 'healthy',
      lastSuccessfulEventAt: Timestamp.fromMillis(1000000000),
      lastFailureAt: null,
      dlqDepth: 0,
      signatureFailures24h: 0,
      webhookSubscriptionActive: true,
      hydrationP95LatencyMs: 120
    });
    vi.setSystemTime(1000010000); // 10s later
    await recordHealthEvent(firestore(), { type: 'dlq_depth_changed', depth: 11 });
    const doc = mockDb.snapshot('system/health');
    expect(doc?.status).toBe('error');
  });

  it('10. dlq_depth_changed(0) on previously degraded doc recomputes to healthy', async () => {
    mockDb.seed('system/health', {
      status: 'degraded',
      lastSuccessfulEventAt: Timestamp.fromMillis(1000000000),
      lastFailureAt: null,
      dlqDepth: 5,
      signatureFailures24h: 0,
      webhookSubscriptionActive: true,
      hydrationP95LatencyMs: 120
    });
    vi.setSystemTime(1000010000); // 10s later
    await recordHealthEvent(firestore(), { type: 'dlq_depth_changed', depth: 0 });
    const doc = mockDb.snapshot('system/health');
    expect(doc?.status).toBe('healthy');
  });

  it('11. Status time-based: lastSuccessfulEventAt 90s ago + dlq=0 + sig=0 -> degraded', async () => {
    mockDb.seed('system/health', {
      status: 'healthy',
      lastSuccessfulEventAt: Timestamp.fromMillis(1000000000),
      lastFailureAt: null,
      dlqDepth: 0,
      signatureFailures24h: 0,
      webhookSubscriptionActive: true,
      hydrationP95LatencyMs: 120
    });
    vi.setSystemTime(1000090000); // 90s later
    // no-op-ish event (e.g. webhook_failure which doesnt set last success)
    await recordHealthEvent(firestore(), { type: 'webhook_failure' });
    const doc = mockDb.snapshot('system/health');
    expect(doc?.status).toBe('degraded');
  });

  it('12. Status time-based: lastSuccessfulEventAt 6 minutes ago + dlq=0 + sig=0 -> error', async () => {
    mockDb.seed('system/health', {
      status: 'healthy',
      lastSuccessfulEventAt: Timestamp.fromMillis(1000000000),
      lastFailureAt: null,
      dlqDepth: 0,
      signatureFailures24h: 0,
      webhookSubscriptionActive: true,
      hydrationP95LatencyMs: 120
    });
    vi.setSystemTime(1000360000); // 6m later (360s)
    await recordHealthEvent(firestore(), { type: 'webhook_failure' });
    const doc = mockDb.snapshot('system/health');
    expect(doc?.status).toBe('error');
  });

  it('13. dlq_depth_changed with depth=-1 throws RangeError', async () => {
    await expect(recordHealthEvent(firestore(), { type: 'dlq_depth_changed', depth: -1 }))
      .rejects.toThrow(RangeError);
  });

  it('14. dlq_depth_changed with depth=1.5 throws RangeError', async () => {
    await expect(recordHealthEvent(firestore(), { type: 'dlq_depth_changed', depth: 1.5 }))
      .rejects.toThrow(RangeError);
  });

  it('15. webhook_success with hydrationLatencyMs=-1 throws RangeError', async () => {
    await expect(recordHealthEvent(firestore(), { type: 'webhook_success', hydrationLatencyMs: -1 }))
      .rejects.toThrow(RangeError);
  });
});
