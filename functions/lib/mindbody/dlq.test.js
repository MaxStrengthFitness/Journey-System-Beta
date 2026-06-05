"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const firestore_1 = require("firebase-admin/firestore");
const dlq_1 = require("./dlq");
function createMockFirestore() {
    const store = new Map();
    let transactionLock = Promise.resolve();
    const sentinel = firestore_1.FieldValue.serverTimestamp();
    return {
        seed(path, data) {
            store.set(path, data);
        },
        snapshot(path) {
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
                        const parsedData = Object.assign({}, data);
                        for (const key of Object.keys(parsedData)) {
                            const val = parsedData[key];
                            if (val && typeof val.isEqual === 'function' && val.isEqual(sentinel)) {
                                parsedData[key] = firestore_1.Timestamp.fromMillis(Date.now());
                            }
                        }
                        store.set(ref.path, parsedData);
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
(0, vitest_1.describe)('recordDeadLetter', () => {
    let mockDb;
    const firestore = () => mockDb;
    (0, vitest_1.beforeEach)(() => {
        mockDb = createMockFirestore();
        vitest_1.vi.useFakeTimers();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
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
    (0, vitest_1.it)('1. First write persists all fields, firstSeenAt set, resolvedAt absent', async () => {
        vitest_1.vi.setSystemTime(1000000000);
        await (0, dlq_1.recordDeadLetter)(firestore(), validParams);
        const doc = mockDb.snapshot('mindbodyDLQ/msg_1');
        (0, vitest_1.expect)(doc).toBeDefined();
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.messageId).toBe('msg_1');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.eventType).toBe('appointmentBooking.cancelled');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.originalPayload).toEqual(validParams.originalPayload);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.retryCount).toBe(3);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.lastError).toBe('Mindbody API rate limited (429)');
        (0, vitest_1.expect)((doc === null || doc === void 0 ? void 0 : doc.firstSeenAt).toMillis()).toBe(1000000000);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.resolvedAt).toBeUndefined();
    });
    (0, vitest_1.it)('2. Second write updates only retryCount & lastError, preserves rest', async () => {
        vitest_1.vi.setSystemTime(1000000000);
        await (0, dlq_1.recordDeadLetter)(firestore(), validParams);
        vitest_1.vi.setSystemTime(2000000000);
        await (0, dlq_1.recordDeadLetter)(firestore(), Object.assign(Object.assign({}, validParams), { eventType: 'should.be.ignored', originalPayload: { different: true }, retryCount: 4, lastError: 'Firestore write failed: PERMISSION_DENIED' }));
        const doc = mockDb.snapshot('mindbodyDLQ/msg_1');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.retryCount).toBe(4);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.lastError).toBe('Firestore write failed: PERMISSION_DENIED');
        // Unchanged
        (0, vitest_1.expect)((doc === null || doc === void 0 ? void 0 : doc.firstSeenAt).toMillis()).toBe(1000000000);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.eventType).toBe('appointmentBooking.cancelled');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.originalPayload).toEqual(validParams.originalPayload);
    });
    (0, vitest_1.it)('3. Empty messageId throws TypeError', async () => {
        await (0, vitest_1.expect)((0, dlq_1.recordDeadLetter)(firestore(), Object.assign(Object.assign({}, validParams), { messageId: '' })))
            .rejects.toThrow(TypeError);
    });
    (0, vitest_1.it)('4. Whitespace-only eventType throws TypeError', async () => {
        await (0, vitest_1.expect)((0, dlq_1.recordDeadLetter)(firestore(), Object.assign(Object.assign({}, validParams), { eventType: '   ' })))
            .rejects.toThrow(TypeError);
    });
    (0, vitest_1.it)('5. Empty lastError throws TypeError', async () => {
        await (0, vitest_1.expect)((0, dlq_1.recordDeadLetter)(firestore(), Object.assign(Object.assign({}, validParams), { lastError: '' })))
            .rejects.toThrow(TypeError);
    });
    (0, vitest_1.it)('6. retryCount of -1 throws RangeError', async () => {
        await (0, vitest_1.expect)((0, dlq_1.recordDeadLetter)(firestore(), Object.assign(Object.assign({}, validParams), { retryCount: -1 })))
            .rejects.toThrow(RangeError);
    });
    (0, vitest_1.it)('7. retryCount of 1.5 throws RangeError', async () => {
        await (0, vitest_1.expect)((0, dlq_1.recordDeadLetter)(firestore(), Object.assign(Object.assign({}, validParams), { retryCount: 1.5 })))
            .rejects.toThrow(RangeError);
    });
    (0, vitest_1.it)('8. originalPayload of null throws TypeError', async () => {
        await (0, vitest_1.expect)((0, dlq_1.recordDeadLetter)(firestore(), Object.assign(Object.assign({}, validParams), { originalPayload: null })))
            .rejects.toThrow(TypeError);
    });
    (0, vitest_1.it)('9. originalPayload of [] throws TypeError', async () => {
        await (0, vitest_1.expect)((0, dlq_1.recordDeadLetter)(firestore(), Object.assign(Object.assign({}, validParams), { originalPayload: [] })))
            .rejects.toThrow(TypeError);
    });
    (0, vitest_1.it)('10. originalPayload of "string" throws TypeError', async () => {
        await (0, vitest_1.expect)((0, dlq_1.recordDeadLetter)(firestore(), Object.assign(Object.assign({}, validParams), { originalPayload: "string" })))
            .rejects.toThrow(TypeError);
    });
    (0, vitest_1.it)('11. originalPayload of {} is accepted', async () => {
        await (0, dlq_1.recordDeadLetter)(firestore(), Object.assign(Object.assign({}, validParams), { messageId: 'msg_11', originalPayload: {} }));
        const doc = mockDb.snapshot('mindbodyDLQ/msg_11');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.originalPayload).toEqual({});
    });
    (0, vitest_1.it)('12. Nested originalPayload round trips correctly', async () => {
        const complexPayload = {
            level1: { num: 42, str: "hi", arr: [1, 2, { n: true }], level2: { level3: "deep" } }
        };
        await (0, dlq_1.recordDeadLetter)(firestore(), Object.assign(Object.assign({}, validParams), { messageId: 'msg_12', originalPayload: complexPayload }));
        const doc = mockDb.snapshot('mindbodyDLQ/msg_12');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.originalPayload).toEqual(complexPayload);
    });
    (0, vitest_1.it)('13. Concurrent writes for SAME messageId resolve safely', async () => {
        vitest_1.vi.setSystemTime(1000000000);
        const p1 = (0, dlq_1.recordDeadLetter)(firestore(), validParams);
        const p2 = (0, dlq_1.recordDeadLetter)(firestore(), Object.assign(Object.assign({}, validParams), { retryCount: 4, lastError: 'Hydration GET timeout after 8000ms' }));
        await Promise.all([p1, p2]);
        const doc = mockDb.snapshot('mindbodyDLQ/msg_1');
        // First writer defines the timestamp
        (0, vitest_1.expect)((doc === null || doc === void 0 ? void 0 : doc.firstSeenAt).toMillis()).toBe(1000000000);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.retryCount).toBe(4);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.lastError).toBe('Hydration GET timeout after 8000ms');
    });
});
//# sourceMappingURL=dlq.test.js.map