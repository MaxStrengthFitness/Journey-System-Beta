import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { tryRecordEvent } from './idempotency';

type MockDocRef = { path: string; id: string };

type MockTransaction = {
  get: (ref: MockDocRef) => Promise<{ exists: boolean; data: () => unknown }>;
  set: (ref: MockDocRef, data: Record<string, unknown>) => MockTransaction;
};

type MockFirestore = Pick<Firestore, 'collection' | 'runTransaction'> & {
  seed: (path: string, data: Record<string, unknown>) => void;
  getDoc: (path: string) => Record<string, unknown> | undefined;
};

function createMockFirestore(): MockFirestore {
  const store = new Map<string, Record<string, unknown>>();
  let transactionLock = Promise.resolve() as Promise<unknown>;

  return {
    seed(path: string, data: Record<string, unknown>) {
      store.set(path, data);
    },
    getDoc(path: string) {
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
            store.set(ref.path, data);
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

describe('tryRecordEvent', () => {
  let mockDb: MockFirestore;
  const firestore = () => mockDb as unknown as Firestore;

  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('1. First call with new messageId returns { wasNew: true } and writes document', async () => {
    const result = await tryRecordEvent(firestore(), 'msg_1', 'test.event');
    expect(result).toEqual({ wasNew: true });
    
    const doc = mockDb.getDoc('mindbodyEventLog/msg_1');
    expect(doc).toBeDefined();
    expect(doc?.messageId).toBe('msg_1');
    expect(doc?.eventType).toBe('test.event');
  });

  it('2. Second call with same messageId returns { wasNew: false } and does not mutate', async () => {
    await tryRecordEvent(firestore(), 'msg_2', 'test.event');
    const docBefore = { ...mockDb.getDoc('mindbodyEventLog/msg_2') };
    
    const result = await tryRecordEvent(firestore(), 'msg_2', 'test.event');
    expect(result).toEqual({ wasNew: false });
    
    const docAfter = { ...mockDb.getDoc('mindbodyEventLog/msg_2') };
    expect(docBefore).toEqual(docAfter);
  });

  it('3. Two concurrent calls — exactly one returns wasNew:true', async () => {
    // Note: this mock transaction serializes calls to demonstrate atomicity intent
    const p1 = tryRecordEvent(firestore(), 'msg_3', 'test.event');
    const p2 = tryRecordEvent(firestore(), 'msg_3', 'test.event');
    
    const results = await Promise.all([p1, p2]);
    const wasNewTrueCount = results.filter((r) => r.wasNew).length;
    const wasNewFalseCount = results.filter((r) => !r.wasNew).length;
    
    expect(wasNewTrueCount).toBe(1);
    expect(wasNewFalseCount).toBe(1);
  });

  it('4. Recorded expiresAt is exactly 30 days after Date.now()', async () => {
    const now = 1672531200000; // 2023-01-01T00:00:00.000Z
    vi.setSystemTime(now);
    
    await tryRecordEvent(firestore(), 'msg_4', 'test.event');
    const doc = mockDb.getDoc('mindbodyEventLog/msg_4');
    
    const expectedExpiresAtMillis = now + 30 * 24 * 60 * 60 * 1000;
    expect((doc?.expiresAt as Timestamp).toMillis()).toBe(expectedExpiresAtMillis);
  });

  it('5. Empty messageId throws TypeError', async () => {
    await expect(tryRecordEvent(firestore(), '', 'test.event')).rejects.toThrow(TypeError);
  });

  it('6. Whitespace-only messageId throws TypeError', async () => {
    await expect(tryRecordEvent(firestore(), '   ', 'test.event')).rejects.toThrow(TypeError);
  });

  it('7. Empty eventType throws TypeError', async () => {
    await expect(tryRecordEvent(firestore(), 'msg_7', '  ')).rejects.toThrow(TypeError);
  });

  it('8. Metadata hydrationLatencyMs is persisted when supplied, omitted otherwise', async () => {
    await tryRecordEvent(firestore(), 'msg_8_with', 'test.event', { hydrationLatencyMs: 150 });
    const docWith = mockDb.getDoc('mindbodyEventLog/msg_8_with');
    expect(docWith?.hydrationLatencyMs).toBe(150);

    await tryRecordEvent(firestore(), 'msg_8_without', 'test.event');
    const docWithout = mockDb.getDoc('mindbodyEventLog/msg_8_without');
    expect('hydrationLatencyMs' in (docWithout as Record<string, unknown>)).toBe(false);
  });

  it('9. Different messageIds for same eventType both return wasNew:true', async () => {
    const result1 = await tryRecordEvent(firestore(), 'msg_9a', 'test.event');
    const result2 = await tryRecordEvent(firestore(), 'msg_9b', 'test.event');
    
    expect(result1.wasNew).toBe(true);
    expect(result2.wasNew).toBe(true);
  });
});
