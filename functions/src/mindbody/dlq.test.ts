import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { recordDeadLetter } from './dlq';

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

describe('recordDeadLetter', () => {
  let mockDb: MockFirestore;
  const firestore = () => mockDb as unknown as Firestore;
  
  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const validParams = {
    messageId: 'msg_1',
    eventType: 'appointmentBooking.cancelled',
    originalPayload: {
      messageId: 'msg_1',
      eventId: 'evt_abc123',
      eventSchemaVersion: 1,
      eventInstanceOriginationDateTime: '2023-01-01T12:00:00Z',
      eventData: { siteId: 9999 }
    },
    retryCount: 3,
    lastError: 'Mindbody API rate limited (429)'
  };

  it('1. First write persists all fields, firstSeenAt set, resolvedAt absent', async () => {
    vi.setSystemTime(1000000000);
    await recordDeadLetter(firestore(), validParams);
    
    const doc = mockDb.snapshot('mindbodyDLQ/msg_1');
    expect(doc).toBeDefined();
    expect(doc?.messageId).toBe('msg_1');
    expect(doc?.eventType).toBe('appointmentBooking.cancelled');
    expect(doc?.originalPayload).toEqual(validParams.originalPayload);
    expect(doc?.retryCount).toBe(3);
    expect(doc?.lastError).toBe('Mindbody API rate limited (429)');
    expect((doc?.firstSeenAt as Timestamp).toMillis()).toBe(1000000000);
    expect(doc?.resolvedAt).toBeUndefined();
  });

  it('2. Second write updates only retryCount & lastError, preserves rest', async () => {
    vi.setSystemTime(1000000000);
    await recordDeadLetter(firestore(), validParams);
    
    vi.setSystemTime(2000000000);
    await recordDeadLetter(firestore(), {
      ...validParams,
      eventType: 'should.be.ignored', // Should be ignored by logic
      originalPayload: { different: true }, // Should be ignored
      retryCount: 4,
      lastError: 'Firestore write failed: PERMISSION_DENIED'
    });
    
    const doc = mockDb.snapshot('mindbodyDLQ/msg_1');
    expect(doc?.retryCount).toBe(4);
    expect(doc?.lastError).toBe('Firestore write failed: PERMISSION_DENIED');
    
    // Unchanged
    expect((doc?.firstSeenAt as Timestamp).toMillis()).toBe(1000000000);
    expect(doc?.eventType).toBe('appointmentBooking.cancelled');
    expect(doc?.originalPayload).toEqual(validParams.originalPayload);
  });

  it('3. Empty messageId throws TypeError', async () => {
    await expect(recordDeadLetter(firestore(), { ...validParams, messageId: '' }))
      .rejects.toThrow(TypeError);
  });

  it('4. Whitespace-only eventType throws TypeError', async () => {
    await expect(recordDeadLetter(firestore(), { ...validParams, eventType: '   ' }))
      .rejects.toThrow(TypeError);
  });

  it('5. Empty lastError throws TypeError', async () => {
    await expect(recordDeadLetter(firestore(), { ...validParams, lastError: '' }))
      .rejects.toThrow(TypeError);
  });

  it('6. retryCount of -1 throws RangeError', async () => {
    await expect(recordDeadLetter(firestore(), { ...validParams, retryCount: -1 }))
      .rejects.toThrow(RangeError);
  });

  it('7. retryCount of 1.5 throws RangeError', async () => {
    await expect(recordDeadLetter(firestore(), { ...validParams, retryCount: 1.5 }))
      .rejects.toThrow(RangeError);
  });

  it('8. originalPayload of null throws TypeError', async () => {
    await expect(recordDeadLetter(firestore(), { ...validParams, originalPayload: null as any }))
      .rejects.toThrow(TypeError);
  });

  it('9. originalPayload of [] throws TypeError', async () => {
    await expect(recordDeadLetter(firestore(), { ...validParams, originalPayload: [] as any }))
      .rejects.toThrow(TypeError);
  });

  it('10. originalPayload of "string" throws TypeError', async () => {
    await expect(recordDeadLetter(firestore(), { ...validParams, originalPayload: "string" as any }))
      .rejects.toThrow(TypeError);
  });

  it('11. originalPayload of {} is accepted', async () => {
    await recordDeadLetter(firestore(), { ...validParams, messageId: 'msg_11', originalPayload: {} });
    const doc = mockDb.snapshot('mindbodyDLQ/msg_11');
    expect(doc?.originalPayload).toEqual({});
  });

  it('12. Nested originalPayload round trips correctly', async () => {
    const complexPayload = {
      level1: { num: 42, str: "hi", arr: [1, 2, { n: true }], level2: { level3: "deep" } }
    };
    await recordDeadLetter(firestore(), { ...validParams, messageId: 'msg_12', originalPayload: complexPayload });
    const doc = mockDb.snapshot('mindbodyDLQ/msg_12');
    expect(doc?.originalPayload).toEqual(complexPayload);
  });

  it('13. Concurrent writes for SAME messageId resolve safely', async () => {
    vi.setSystemTime(1000000000);
    const p1 = recordDeadLetter(firestore(), validParams);
    
    const p2 = recordDeadLetter(firestore(), { 
      ...validParams, 
      retryCount: 4, 
      lastError: 'Hydration GET timeout after 8000ms' 
    });
    
    await Promise.all([p1, p2]);
    const doc = mockDb.snapshot('mindbodyDLQ/msg_1');
    // First writer defines the timestamp
    expect((doc?.firstSeenAt as Timestamp).toMillis()).toBe(1000000000);
    expect(doc?.retryCount).toBe(4);
    expect(doc?.lastError).toBe('Hydration GET timeout after 8000ms');
  });
});
