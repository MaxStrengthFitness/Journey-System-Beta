"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const firestore_1 = require("firebase-admin/firestore");
const healthState_1 = require("./healthState");
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
(0, vitest_1.describe)('recordHealthEvent', () => {
    let mockDb;
    const firestore = () => mockDb;
    (0, vitest_1.beforeEach)(() => {
        mockDb = createMockFirestore();
        vitest_1.vi.useFakeTimers();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.useRealTimers();
    });
    (0, vitest_1.it)('1. webhook_success on a fresh DB creates the document with all 8 fields and status=healthy', async () => {
        vitest_1.vi.setSystemTime(1000000000);
        await (0, healthState_1.recordHealthEvent)(firestore(), { type: 'webhook_success', hydrationLatencyMs: 120 });
        const doc = mockDb.snapshot('system/health');
        (0, vitest_1.expect)(doc).toBeDefined();
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.status).toBe('healthy');
        (0, vitest_1.expect)((doc === null || doc === void 0 ? void 0 : doc.lastSuccessfulEventAt).toMillis()).toBe(1000000000);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.lastFailureAt).toBeNull();
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.dlqDepth).toBe(0);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.signatureFailures24h).toBe(0);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.webhookSubscriptionActive).toBe(true);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.hydrationP95LatencyMs).toBe(120);
        (0, vitest_1.expect)((doc === null || doc === void 0 ? void 0 : doc.updatedAt).toMillis()).toBe(1000000000);
    });
    (0, vitest_1.it)('2. webhook_success on existing doc updates success/latency; preserves rest; recomputes status', async () => {
        mockDb.seed('system/health', {
            status: 'error',
            lastSuccessfulEventAt: null,
            lastFailureAt: firestore_1.Timestamp.fromMillis(900000000),
            dlqDepth: 0,
            signatureFailures24h: 0,
            webhookSubscriptionActive: true,
            hydrationP95LatencyMs: 0
        });
        vitest_1.vi.setSystemTime(1000000000);
        await (0, healthState_1.recordHealthEvent)(firestore(), { type: 'webhook_success', hydrationLatencyMs: 150 });
        const doc = mockDb.snapshot('system/health');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.status).toBe('healthy');
        (0, vitest_1.expect)((doc === null || doc === void 0 ? void 0 : doc.lastSuccessfulEventAt).toMillis()).toBe(1000000000);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.hydrationP95LatencyMs).toBe(150);
        (0, vitest_1.expect)((doc === null || doc === void 0 ? void 0 : doc.lastFailureAt).toMillis()).toBe(900000000);
    });
    (0, vitest_1.it)('3. webhook_failure updates lastFailureAt; lastSuccessfulEventAt unchanged', async () => {
        mockDb.seed('system/health', {
            status: 'healthy',
            lastSuccessfulEventAt: firestore_1.Timestamp.fromMillis(900000000),
            lastFailureAt: null,
            dlqDepth: 0,
            signatureFailures24h: 0,
            webhookSubscriptionActive: true,
            hydrationP95LatencyMs: 120
        });
        vitest_1.vi.setSystemTime(1000000000);
        await (0, healthState_1.recordHealthEvent)(firestore(), { type: 'webhook_failure' });
        const doc = mockDb.snapshot('system/health');
        (0, vitest_1.expect)((doc === null || doc === void 0 ? void 0 : doc.lastFailureAt).toMillis()).toBe(1000000000);
        (0, vitest_1.expect)((doc === null || doc === void 0 ? void 0 : doc.lastSuccessfulEventAt).toMillis()).toBe(900000000);
    });
    (0, vitest_1.it)('4. signature_failure on fresh DB increments signatureFailures24h to 1 and sets status=error', async () => {
        vitest_1.vi.setSystemTime(1000000000);
        await (0, healthState_1.recordHealthEvent)(firestore(), { type: 'signature_failure' });
        const doc = mockDb.snapshot('system/health');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.signatureFailures24h).toBe(1);
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.status).toBe('error');
    });
    (0, vitest_1.it)('5. signature_failure on existing doc with count=3 sets count to 4', async () => {
        mockDb.seed('system/health', {
            status: 'error',
            lastSuccessfulEventAt: firestore_1.Timestamp.fromMillis(900000000),
            lastFailureAt: null,
            dlqDepth: 0,
            signatureFailures24h: 3,
            webhookSubscriptionActive: true,
            hydrationP95LatencyMs: 120
        });
        await (0, healthState_1.recordHealthEvent)(firestore(), { type: 'signature_failure' });
        const doc = mockDb.snapshot('system/health');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.signatureFailures24h).toBe(4);
    });
    (0, vitest_1.it)('6. subscription_status(false) sets status=offline even when all others healthy', async () => {
        mockDb.seed('system/health', {
            status: 'healthy',
            lastSuccessfulEventAt: firestore_1.Timestamp.fromMillis(1000000000), // recent
            lastFailureAt: null,
            dlqDepth: 0,
            signatureFailures24h: 0,
            webhookSubscriptionActive: true,
            hydrationP95LatencyMs: 120
        });
        vitest_1.vi.setSystemTime(1000010000); // 10s later
        await (0, healthState_1.recordHealthEvent)(firestore(), { type: 'subscription_status', active: false });
        const doc = mockDb.snapshot('system/health');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.status).toBe('offline');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.webhookSubscriptionActive).toBe(false);
    });
    (0, vitest_1.it)('7. subscription_status(true) on an offline doc recomputes status (to healthy)', async () => {
        mockDb.seed('system/health', {
            status: 'offline',
            lastSuccessfulEventAt: firestore_1.Timestamp.fromMillis(1000000000),
            lastFailureAt: null,
            dlqDepth: 0,
            signatureFailures24h: 0,
            webhookSubscriptionActive: false,
            hydrationP95LatencyMs: 120
        });
        vitest_1.vi.setSystemTime(1000010000); // 10s later
        await (0, healthState_1.recordHealthEvent)(firestore(), { type: 'subscription_status', active: true });
        const doc = mockDb.snapshot('system/health');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.status).toBe('healthy');
    });
    (0, vitest_1.it)('8. dlq_depth_changed(1) sets status=degraded', async () => {
        mockDb.seed('system/health', {
            status: 'healthy',
            lastSuccessfulEventAt: firestore_1.Timestamp.fromMillis(1000000000),
            lastFailureAt: null,
            dlqDepth: 0,
            signatureFailures24h: 0,
            webhookSubscriptionActive: true,
            hydrationP95LatencyMs: 120
        });
        vitest_1.vi.setSystemTime(1000010000); // 10s later
        await (0, healthState_1.recordHealthEvent)(firestore(), { type: 'dlq_depth_changed', depth: 1 });
        const doc = mockDb.snapshot('system/health');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.status).toBe('degraded');
    });
    (0, vitest_1.it)('9. dlq_depth_changed(11) sets status=error', async () => {
        mockDb.seed('system/health', {
            status: 'healthy',
            lastSuccessfulEventAt: firestore_1.Timestamp.fromMillis(1000000000),
            lastFailureAt: null,
            dlqDepth: 0,
            signatureFailures24h: 0,
            webhookSubscriptionActive: true,
            hydrationP95LatencyMs: 120
        });
        vitest_1.vi.setSystemTime(1000010000); // 10s later
        await (0, healthState_1.recordHealthEvent)(firestore(), { type: 'dlq_depth_changed', depth: 11 });
        const doc = mockDb.snapshot('system/health');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.status).toBe('error');
    });
    (0, vitest_1.it)('10. dlq_depth_changed(0) on previously degraded doc recomputes to healthy', async () => {
        mockDb.seed('system/health', {
            status: 'degraded',
            lastSuccessfulEventAt: firestore_1.Timestamp.fromMillis(1000000000),
            lastFailureAt: null,
            dlqDepth: 5,
            signatureFailures24h: 0,
            webhookSubscriptionActive: true,
            hydrationP95LatencyMs: 120
        });
        vitest_1.vi.setSystemTime(1000010000); // 10s later
        await (0, healthState_1.recordHealthEvent)(firestore(), { type: 'dlq_depth_changed', depth: 0 });
        const doc = mockDb.snapshot('system/health');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.status).toBe('healthy');
    });
    (0, vitest_1.it)('11. Status time-based: lastSuccessfulEventAt 90s ago + dlq=0 + sig=0 -> degraded', async () => {
        mockDb.seed('system/health', {
            status: 'healthy',
            lastSuccessfulEventAt: firestore_1.Timestamp.fromMillis(1000000000),
            lastFailureAt: null,
            dlqDepth: 0,
            signatureFailures24h: 0,
            webhookSubscriptionActive: true,
            hydrationP95LatencyMs: 120
        });
        vitest_1.vi.setSystemTime(1000090000); // 90s later
        // no-op-ish event (e.g. webhook_failure which doesnt set last success)
        await (0, healthState_1.recordHealthEvent)(firestore(), { type: 'webhook_failure' });
        const doc = mockDb.snapshot('system/health');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.status).toBe('degraded');
    });
    (0, vitest_1.it)('12. Status time-based: lastSuccessfulEventAt 6 minutes ago + dlq=0 + sig=0 -> error', async () => {
        mockDb.seed('system/health', {
            status: 'healthy',
            lastSuccessfulEventAt: firestore_1.Timestamp.fromMillis(1000000000),
            lastFailureAt: null,
            dlqDepth: 0,
            signatureFailures24h: 0,
            webhookSubscriptionActive: true,
            hydrationP95LatencyMs: 120
        });
        vitest_1.vi.setSystemTime(1000360000); // 6m later (360s)
        await (0, healthState_1.recordHealthEvent)(firestore(), { type: 'webhook_failure' });
        const doc = mockDb.snapshot('system/health');
        (0, vitest_1.expect)(doc === null || doc === void 0 ? void 0 : doc.status).toBe('error');
    });
    (0, vitest_1.it)('13. dlq_depth_changed with depth=-1 throws RangeError', async () => {
        await (0, vitest_1.expect)((0, healthState_1.recordHealthEvent)(firestore(), { type: 'dlq_depth_changed', depth: -1 }))
            .rejects.toThrow(RangeError);
    });
    (0, vitest_1.it)('14. dlq_depth_changed with depth=1.5 throws RangeError', async () => {
        await (0, vitest_1.expect)((0, healthState_1.recordHealthEvent)(firestore(), { type: 'dlq_depth_changed', depth: 1.5 }))
            .rejects.toThrow(RangeError);
    });
    (0, vitest_1.it)('15. webhook_success with hydrationLatencyMs=-1 throws RangeError', async () => {
        await (0, vitest_1.expect)((0, healthState_1.recordHealthEvent)(firestore(), { type: 'webhook_success', hydrationLatencyMs: -1 }))
            .rejects.toThrow(RangeError);
    });
});
//# sourceMappingURL=healthState.test.js.map