import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Firestore, Timestamp } from 'firebase-admin/firestore';
import { tryRecordEvent, markEventDone, claimDecision, CLAIM_MS } from './idempotency';
import { MAX_ATTEMPTS } from './retryLedger';

type MockDocRef = { path: string; id: string };

type MockTransaction = {
  get: (ref: MockDocRef) => Promise<{ exists: boolean; data: () => unknown }>;
  set: (ref: MockDocRef, data: Record<string, unknown>, options?: { merge?: boolean }) => MockTransaction;
};

type MockFirestore = Pick<Firestore, 'collection' | 'runTransaction'> & {
  failWrites: (fail: boolean) => void;
  seed: (path: string, data: Record<string, unknown>) => void;
  getDoc: (path: string) => Record<string, unknown> | undefined;
};

function createMockFirestore(): MockFirestore {
  const store = new Map<string, Record<string, unknown>>();
  let transactionLock = Promise.resolve() as Promise<unknown>;
  let failing = false;
  const write = (path: string, data: Record<string, unknown>, options?: { merge?: boolean }) => {
    store.set(path, options?.merge ? { ...(store.get(path) ?? {}), ...data } : data);
  };

  return {
    failWrites(fail: boolean) {
      failing = fail;
    },
    seed(path: string, data: Record<string, unknown>) {
      store.set(path, data);
    },
    getDoc(path: string) {
      return store.get(path);
    },
    collection(name: string) {
      return {
        doc(id: string) {
          const path = `${name}/${id}`;
          return {
            path,
            id,
            set: async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
              if (failing) throw new Error('write refused');
              write(path, data, options);
            },
          };
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
          set: (ref: MockDocRef, data: Record<string, unknown>, options?: { merge?: boolean }) => {
            write(ref.path, data, options);
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
    expect(result).toEqual({ wasNew: true, attempt: 1 });
    
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

/* ------------------------------------------------------------------ */
/* The claim (the speed round, Oct 5 2026, R25)                        */
/* ------------------------------------------------------------------ */

describe('claimDecision', () => {
  const at = (ms: number) => Timestamp.fromMillis(ms);

  it('claims a message it has never seen', () => {
    expect(claimDecision(undefined, 1_000)).toBe('claim');
  });

  it('answers a live claim as a duplicate', () => {
    expect(claimDecision({ state: 'processing', claimExpiresAt: at(5_000) }, 4_999)).toBe('duplicate');
  });

  it('takes over a claim that has run out', () => {
    expect(claimDecision({ state: 'processing', claimExpiresAt: at(5_000) }, 5_000)).toBe('take_over');
  });

  it('takes over a processing claim with no readable expiry rather than lose the event', () => {
    expect(claimDecision({ state: 'processing' }, 1)).toBe('take_over');
  });

  it('never reprocesses a finished, dead-lettered or old-style record', () => {
    expect(claimDecision({ state: 'done', claimExpiresAt: at(0) }, 9_999_999)).toBe('duplicate');
    expect(claimDecision({ state: 'dead_lettered', claimExpiresAt: at(0) }, 9_999_999)).toBe('duplicate');
    // The old gate wrote no state, and only ever wrote once it had decided to process.
    expect(claimDecision({ messageId: 'm', eventType: 't' }, 9_999_999)).toBe('duplicate');
  });
});

describe('tryRecordEvent as a claim', () => {
  let mockDb: MockFirestore;
  const firestore = () => mockDb as unknown as Firestore;
  const now = 1_759_680_000_000;

  beforeEach(() => {
    mockDb = createMockFirestore();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes a processing claim that runs out CLAIM_MS from now', async () => {
    const result = await tryRecordEvent(firestore(), 'c1', 'appointmentBooking.created');
    expect(result).toEqual({ wasNew: true, attempt: 1 });
    const doc = mockDb.getDoc('mindbodyEventLog/c1');
    expect(doc?.state).toBe('processing');
    expect(doc?.attempts).toBe(1);
    expect((doc?.claimExpiresAt as Timestamp).toMillis()).toBe(now + CLAIM_MS);
  });

  it("runs out after the 10-second delivery timeout and before Mindbody's 15-minute resend", () => {
    expect(CLAIM_MS).toBeGreaterThan(10_000);
    expect(CLAIM_MS).toBeLessThan(15 * 60 * 1000);
  });

  it('answers a resend inside the claim as a duplicate', async () => {
    await tryRecordEvent(firestore(), 'c2', 't');
    vi.setSystemTime(now + CLAIM_MS - 1);
    expect(await tryRecordEvent(firestore(), 'c2', 't')).toEqual({ wasNew: false });
  });

  it('lets a resend after the claim ran out take it over, keeping the 30-day expiry', async () => {
    await tryRecordEvent(firestore(), 'c3', 't');
    const firstExpiry = (mockDb.getDoc('mindbodyEventLog/c3')?.expiresAt as Timestamp).toMillis();
    vi.setSystemTime(now + 15 * 60 * 1000);

    const result = await tryRecordEvent(firestore(), 'c3', 't');

    expect(result).toEqual({ wasNew: true, takenOver: true, attempt: 2 });
    const doc = mockDb.getDoc('mindbodyEventLog/c3');
    expect(doc?.state).toBe('processing');
    expect(doc?.attempts).toBe(2);
    expect((doc?.claimExpiresAt as Timestamp).toMillis()).toBe(now + 15 * 60 * 1000 + CLAIM_MS);
    expect((doc?.expiresAt as Timestamp).toMillis()).toBe(firstExpiry);
  });

  it('answers exhausted, writing nothing, once MAX_ATTEMPTS attempts have all died', async () => {
    await tryRecordEvent(firestore(), 'c5', 't');
    let t = now;
    // Attempts 2..MAX_ATTEMPTS each take over a claim the last one never finished.
    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt += 1) {
      t += 15 * 60 * 1000;
      vi.setSystemTime(t);
      expect(await tryRecordEvent(firestore(), 'c5', 't')).toEqual({
        wasNew: true,
        takenOver: true,
        attempt,
      });
    }
    const before = mockDb.getDoc('mindbodyEventLog/c5');
    t += 15 * 60 * 1000;
    vi.setSystemTime(t);

    const result = await tryRecordEvent(firestore(), 'c5', 't');

    expect(result).toEqual({ wasNew: false, exhausted: true, attempt: MAX_ATTEMPTS });
    expect(mockDb.getDoc('mindbodyEventLog/c5')).toEqual(before);
  });

  it('never takes over an event that was marked done', async () => {
    await tryRecordEvent(firestore(), 'c4', 't');
    await markEventDone(firestore(), 'c4', { studioId: 'studio-1' });
    vi.setSystemTime(now + 60 * 60 * 1000);
    expect(await tryRecordEvent(firestore(), 'c4', 't')).toEqual({ wasNew: false });
  });
});

describe('markEventDone', () => {
  let mockDb: MockFirestore;
  const firestore = () => mockDb as unknown as Firestore;

  beforeEach(() => {
    mockDb = createMockFirestore();
  });

  it('marks the claim done, with the studio and the latency, keeping what the claim wrote', async () => {
    await tryRecordEvent(firestore(), 'd1', 'appointmentBooking.created');
    const ok = await markEventDone(firestore(), 'd1', { studioId: 'studio-1', hydrationLatencyMs: 412.6 });
    expect(ok).toBe(true);
    const doc = mockDb.getDoc('mindbodyEventLog/d1');
    expect(doc).toMatchObject({
      state: 'done',
      studioId: 'studio-1',
      hydrationLatencyMs: 413,
      messageId: 'd1',
      eventType: 'appointmentBooking.created',
    });
    expect(doc?.expiresAt).toBeDefined();
  });

  it('writes no studio when the handler named none, and nothing undefined', async () => {
    await markEventDone(firestore(), 'd2', { studioId: null });
    const doc = mockDb.getDoc('mindbodyEventLog/d2') ?? {};
    expect('studioId' in doc).toBe(false);
    // Even with no claim document to merge into, the TTL can delete it.
    expect(doc.expiresAt).toBeInstanceOf(Timestamp);
    expect(Object.values(doc).some((v) => v === undefined)).toBe(false);
  });

  it('never throws: the work is already done', async () => {
    mockDb.failWrites(true);
    await expect(markEventDone(firestore(), 'd3', { studioId: 's' })).resolves.toBe(false);
  });
});
