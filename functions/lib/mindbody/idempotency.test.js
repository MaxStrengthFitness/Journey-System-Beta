"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const idempotency_1 = require("./idempotency");
function createMockFirestore() {
    const store = new Map();
    let transactionLock = Promise.resolve();
    return {
        seed(path, data) {
            store.set(path, data);
        },
        getDoc(path) {
            return store.get(path);
        },
        collection(name) {
            return {
                doc(id) {
                    return { path: `${name}/${id}`, id };
                },
            };
        },
        runTransaction(updateFunction) {
            const run = async () => {
                const tx = {
                    get: async (ref) => {
                        const data = store.get(ref.path);
                        return { exists: data !== undefined, data: () => data };
                    },
                    set: (ref, data) => {
                        store.set(ref.path, data);
                        return tx;
                    },
                };
                return updateFunction(tx);
            };
            const p = transactionLock.then(run);
            transactionLock = p.catch(() => { });
            return p;
        },
    };
}
(0, vitest_1.describe)('tryRecordEvent', () => {
    let mockDb;
    const firestore = () => mockDb;
    (0, vitest_1.beforeEach)(() => {
        mockDb = createMockFirestore();
        vitest_1.vi.useFakeTimers();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('1. First call with new messageId returns { wasNew: true } and writes document', async () => {
        const result = await (0, idempotency_1.tryRecordEvent)(firestore(), 'msg_1', 'test.event');
        (0, vitest_1.expect)(result).toEqual({ wasNew: true });
        const doc = mockDb.getDoc('mindbodyEventLog/msg_1');
        (0, vitest_1.expect)(doc).toBeDefined();
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.messageId).toBe('msg_1');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.eventType).toBe('test.event');
    });
    (0, vitest_1.it)('2. Second call with same messageId returns { wasNew: false } and does not mutate', async () => {
        await (0, idempotency_1.tryRecordEvent)(firestore(), 'msg_2', 'test.event');
        const docBefore = Object.assign({}, mockDb.getDoc('mindbodyEventLog/msg_2'));
        const result = await (0, idempotency_1.tryRecordEvent)(firestore(), 'msg_2', 'test.event');
        (0, vitest_1.expect)(result).toEqual({ wasNew: false });
        const docAfter = Object.assign({}, mockDb.getDoc('mindbodyEventLog/msg_2'));
        (0, vitest_1.expect)(docBefore).toEqual(docAfter);
    });
    (0, vitest_1.it)('3. Two concurrent calls — exactly one returns wasNew:true', async () => {
        // Note: this mock transaction serializes calls to demonstrate atomicity intent
        const p1 = (0, idempotency_1.tryRecordEvent)(firestore(), 'msg_3', 'test.event');
        const p2 = (0, idempotency_1.tryRecordEvent)(firestore(), 'msg_3', 'test.event');
        const results = await Promise.all([p1, p2]);
        const wasNewTrueCount = results.filter((r) => r.wasNew).length;
        const wasNewFalseCount = results.filter((r) => !r.wasNew).length;
        (0, vitest_1.expect)(wasNewTrueCount).toBe(1);
        (0, vitest_1.expect)(wasNewFalseCount).toBe(1);
    });
    (0, vitest_1.it)('4. Recorded expiresAt is exactly 30 days after Date.now()', async () => {
        const now = 1672531200000; // 2023-01-01T00:00:00.000Z
        vitest_1.vi.setSystemTime(now);
        await (0, idempotency_1.tryRecordEvent)(firestore(), 'msg_4', 'test.event');
        const doc = mockDb.getDoc('mindbodyEventLog/msg_4');
        const expectedExpiresAtMillis = now + 30 * 24 * 60 * 60 * 1000;
        (0, vitest_1.expect)((doc === null || doc === void 0 ? void 0 : doc.expiresAt).toMillis()).toBe(expectedExpiresAtMillis);
    });
    (0, vitest_1.it)('5. Empty messageId throws TypeError', async () => {
        await (0, vitest_1.expect)((0, idempotency_1.tryRecordEvent)(firestore(), '', 'test.event')).rejects.toThrow(TypeError);
    });
    (0, vitest_1.it)('6. Whitespace-only messageId throws TypeError', async () => {
        await (0, vitest_1.expect)((0, idempotency_1.tryRecordEvent)(firestore(), '   ', 'test.event')).rejects.toThrow(TypeError);
    });
    (0, vitest_1.it)('7. Empty eventType throws TypeError', async () => {
        await (0, vitest_1.expect)((0, idempotency_1.tryRecordEvent)(firestore(), 'msg_7', '  ')).rejects.toThrow(TypeError);
    });
    (0, vitest_1.it)('8. Metadata hydrationLatencyMs is persisted when supplied, omitted otherwise', async () => {
        await (0, idempotency_1.tryRecordEvent)(firestore(), 'msg_8_with', 'test.event', { hydrationLatencyMs: 150 });
        const docWith = mockDb.getDoc('mindbodyEventLog/msg_8_with');
        (0, vitest_1.expect)(docWith === null || docWith === void 0 ? void 0 : docWith.hydrationLatencyMs).toBe(150);
        await (0, idempotency_1.tryRecordEvent)(firestore(), 'msg_8_without', 'test.event');
        const docWithout = mockDb.getDoc('mindbodyEventLog/msg_8_without');
        (0, vitest_1.expect)('hydrationLatencyMs' in docWithout).toBe(false);
    });
    (0, vitest_1.it)('9. Different messageIds for same eventType both return wasNew:true', async () => {
        const result1 = await (0, idempotency_1.tryRecordEvent)(firestore(), 'msg_9a', 'test.event');
        const result2 = await (0, idempotency_1.tryRecordEvent)(firestore(), 'msg_9b', 'test.event');
        (0, vitest_1.expect)(result1.wasNew).toBe(true);
        (0, vitest_1.expect)(result2.wasNew).toBe(true);
    });
});
//# sourceMappingURL=idempotency.test.js.map