"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const crypto = require("node:crypto");
const index_1 = require("./index");
const healthState_1 = require("./healthState");
const idempotency_1 = require("./idempotency");
vitest_1.vi.mock('./healthState', () => ({
    recordHealthEvent: vitest_1.vi.fn(),
}));
vitest_1.vi.mock('./idempotency', () => ({
    tryRecordEvent: vitest_1.vi.fn(),
}));
function signForTest(body, secret) {
    return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('base64');
}
const mockSecret = 'test_secret_123';
function createValidEnvelope(overrides = {}) {
    return JSON.stringify(Object.assign({ messageId: 'msg-f47ac10b-58cc-4372-a567-0e02b2c3d479', eventId: 'evt-client-updated', eventSchemaVersion: 1, eventInstanceOriginationDateTime: '2024-01-01T12:00:00Z', eventData: {
            siteId: 99999,
            clientId: 12345,
            membershipStatus: 'Active',
            tierName: '12-Pack',
            lastVisited: '2024-01-13T10:00:00Z',
        } }, overrides));
}
(0, vitest_1.describe)('handleMindbodyWebhook (Inline Upsert)', () => {
    let deps;
    let mockSet;
    (0, vitest_1.beforeEach)(() => {
        vitest_1.vi.clearAllMocks();
        mockSet = vitest_1.vi.fn().mockResolvedValue(undefined);
        const mockDoc = vitest_1.vi.fn().mockReturnValue({ set: mockSet });
        const mockCollection = vitest_1.vi.fn((path) => {
            if (path === 'studios') {
                return {
                    get: vitest_1.vi.fn().mockResolvedValue({
                        forEach: vitest_1.vi.fn()
                    })
                };
            }
            return { doc: mockDoc };
        });
        deps = {
            firestore: { collection: mockCollection },
            webhookSecret: mockSecret,
        };
        vitest_1.vi.mocked(idempotency_1.tryRecordEvent).mockResolvedValue({ wasNew: true });
    });
    (0, vitest_1.it)('1. Valid signature + new event + clientId in eventData -> returns 200, writes to Firestore', async () => {
        const rawBody = createValidEnvelope();
        const signatureHeader = signForTest(rawBody, mockSecret);
        const req = { rawBody, signatureHeader };
        const response = await (0, index_1.handleMindbodyWebhook)(deps, req);
        (0, vitest_1.expect)(response.statusCode).toBe(200);
        (0, vitest_1.expect)(idempotency_1.tryRecordEvent).toHaveBeenCalledWith(deps.firestore, 'msg-f47ac10b-58cc-4372-a567-0e02b2c3d479', 'evt-client-updated');
        (0, vitest_1.expect)(mockSet).toHaveBeenCalledTimes(1);
        (0, vitest_1.expect)(mockSet).toHaveBeenCalledWith({
            membershipStatus: 'Active',
            packageTier: '12-Pack',
            lastSessionDate: '2024-01-13T10:00:00Z'
        }, { merge: true });
    });
    (0, vitest_1.it)('2. Valid signature + duplicate event (wasNew: false) -> returns 200, no write', async () => {
        vitest_1.vi.mocked(idempotency_1.tryRecordEvent).mockResolvedValue({ wasNew: false });
        const rawBody = createValidEnvelope();
        const req = { rawBody, signatureHeader: signForTest(rawBody, mockSecret) };
        const response = await (0, index_1.handleMindbodyWebhook)(deps, req);
        (0, vitest_1.expect)(response.statusCode).toBe(200);
        (0, vitest_1.expect)(mockSet).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('3. Invalid signature -> returns 401, records signature_failure', async () => {
        const rawBody = createValidEnvelope();
        const req = { rawBody, signatureHeader: 'bad_sig' };
        const response = await (0, index_1.handleMindbodyWebhook)(deps, req);
        (0, vitest_1.expect)(response.statusCode).toBe(401);
        (0, vitest_1.expect)(healthState_1.recordHealthEvent).toHaveBeenCalledWith(deps.firestore, { type: 'signature_failure' });
        (0, vitest_1.expect)(mockSet).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('4. Missing signature header -> returns 401, records signature_failure', async () => {
        const rawBody = createValidEnvelope();
        const req = { rawBody, signatureHeader: undefined };
        const response = await (0, index_1.handleMindbodyWebhook)(deps, req);
        (0, vitest_1.expect)(response.statusCode).toBe(401);
        (0, vitest_1.expect)(healthState_1.recordHealthEvent).toHaveBeenCalledWith(deps.firestore, { type: 'signature_failure' });
    });
    (0, vitest_1.it)('5. Malformed JSON body -> returns 400, no health event', async () => {
        const rawBody = '{ bad json';
        const signatureHeader = signForTest(rawBody, mockSecret);
        const req = { rawBody, signatureHeader };
        const response = await (0, index_1.handleMindbodyWebhook)(deps, req);
        (0, vitest_1.expect)(response.statusCode).toBe(400);
        (0, vitest_1.expect)(healthState_1.recordHealthEvent).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('6. Valid signature but missing BOTH messageId and eventId -> returns 400', async () => {
        const rawBody = createValidEnvelope({ messageId: undefined, eventId: undefined });
        const signatureHeader = signForTest(rawBody, mockSecret);
        const req = { rawBody, signatureHeader };
        const response = await (0, index_1.handleMindbodyWebhook)(deps, req);
        (0, vitest_1.expect)(response.statusCode).toBe(400);
    });
    (0, vitest_1.it)('7. Valid signature + event without clientId anywhere -> returns 200, no write', async () => {
        const rawBody = createValidEnvelope({ eventData: { siteId: 99999 } }); // No clientId
        const signatureHeader = signForTest(rawBody, mockSecret);
        const req = { rawBody, signatureHeader };
        const response = await (0, index_1.handleMindbodyWebhook)(deps, req);
        (0, vitest_1.expect)(response.statusCode).toBe(200);
        (0, vitest_1.expect)(mockSet).not.toHaveBeenCalled();
    });
    (0, vitest_1.it)('8. Valid signature + Firestore set throws -> returns 500, records webhook_failure', async () => {
        mockSet.mockRejectedValue(new Error('Firestore error'));
        const rawBody = createValidEnvelope();
        const req = { rawBody, signatureHeader: signForTest(rawBody, mockSecret) };
        const response = await (0, index_1.handleMindbodyWebhook)(deps, req);
        (0, vitest_1.expect)(response.statusCode).toBe(500);
        (0, vitest_1.expect)(healthState_1.recordHealthEvent).toHaveBeenCalledWith(deps.firestore, { type: 'webhook_failure' });
    });
    (0, vitest_1.it)('9. Valid signature + tryRecordEvent throws -> returns 500', async () => {
        vitest_1.vi.mocked(idempotency_1.tryRecordEvent).mockRejectedValue(new Error('Idempotency error'));
        const rawBody = createValidEnvelope();
        const req = { rawBody, signatureHeader: signForTest(rawBody, mockSecret) };
        const response = await (0, index_1.handleMindbodyWebhook)(deps, req);
        (0, vitest_1.expect)(response.statusCode).toBe(500);
    });
    (0, vitest_1.it)('10. Extracts fields properly when placed at top level (partial payload)', async () => {
        const rawBodyObj = {
            messageId: 'msg-custom-001',
            clientId: 999,
            firstName: 'Alice',
            upcomingBookings: ['booking-1']
        };
        const rawBody = JSON.stringify(rawBodyObj);
        const req = { rawBody, signatureHeader: signForTest(rawBody, mockSecret) };
        await (0, index_1.handleMindbodyWebhook)(deps, req);
        (0, vitest_1.expect)(mockSet).toHaveBeenCalledWith({
            mindbody_name: 'Alice',
            upcomingBookings: ['booking-1']
        }, { merge: true });
    });
});
//# sourceMappingURL=index.test.js.map