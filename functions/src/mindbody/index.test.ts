import { describe, it, expect, vi, beforeEach } from "vitest";
import * as crypto from "node:crypto";
import { handleMindbodyWebhook, WebhookRequest, WebhookDeps } from "./index";
import { recordHealthEvent } from "./healthState";
import { tryRecordEvent } from "./idempotency";
import { Firestore } from "firebase-admin/firestore";

vi.mock("./healthState", () => ({
  recordHealthEvent: vi.fn(),
}));

vi.mock("./idempotency", () => ({
  tryRecordEvent: vi.fn(),
}));

function signForTest(body: string, secret: string) {
  return crypto
    .createHmac("sha256", secret)
    .update(body, "utf8")
    .digest("base64");
}

const mockSecret = "test_secret_123";

function createValidEnvelope(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    messageId: "msg-f47ac10b-58cc-4372-a567-0e02b2c3d479",
    eventId: "evt-client-updated",
    eventSchemaVersion: 1,
    eventInstanceOriginationDateTime: "2024-01-01T12:00:00Z",
    eventData: {
      siteId: 99999,
      clientId: 12345,
      membershipStatus: "Active",
      tierName: "12-Pack",
      lastVisited: "2024-01-13T10:00:00Z",
    },
    ...overrides,
  });
}

describe("handleMindbodyWebhook (Inline Upsert)", () => {
  let deps: WebhookDeps;
  let mockSet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSet = vi.fn().mockResolvedValue(undefined);
    const mockDoc = vi.fn().mockReturnValue({
      set: mockSet,
      get: vi.fn().mockResolvedValue({
        exists: false,
        data: () => undefined,
      }),
    });
    const mockCollection = vi.fn((path: string) => {
      if (path === "studios") {
        return {
          get: vi.fn().mockResolvedValue({
            forEach: (cb: any) =>
              cb({ id: "studio-123", data: () => ({ mindbodySiteId: 99999 }) }),
          }),
        };
      }
      if (path === "trainers") {
        return {
          get: vi.fn().mockResolvedValue({
            forEach: (cb: any) =>
              cb({ id: "trainer-abc", data: () => ({ fullName: "Marina" }) }),
          }),
        };
      }
      return { doc: mockDoc };
    });

    deps = {
      firestore: { collection: mockCollection } as unknown as Firestore,
      webhookSecret: mockSecret,
    };

    vi.mocked(tryRecordEvent).mockResolvedValue({ wasNew: true });
  });

  it("1. Valid signature + new event + clientId in eventData -> returns 200, writes to Firestore", async () => {
    const rawBody = createValidEnvelope();
    const signatureHeader = signForTest(rawBody, mockSecret);
    const req: WebhookRequest = { rawBody, signatureHeader };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(200);
    expect(tryRecordEvent).toHaveBeenCalledWith(
      deps.firestore,
      "msg-f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "evt-client-updated",
    );

    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(
      {
        membershipStatus: "Active",
        packageTier: "12-Pack",
        lastSessionDate: "2024-01-13T10:00:00Z",
        homeStudioId: "studio-123",
      },
      { merge: true },
    );
  });

  it("2. Valid signature + duplicate event (wasNew: false) -> returns 200, no write", async () => {
    vi.mocked(tryRecordEvent).mockResolvedValue({ wasNew: false });

    const rawBody = createValidEnvelope();
    const req: WebhookRequest = {
      rawBody,
      signatureHeader: signForTest(rawBody, mockSecret),
    };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(200);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("3. Invalid signature -> returns 401, records signature_failure", async () => {
    const rawBody = createValidEnvelope();
    const req: WebhookRequest = { rawBody, signatureHeader: "bad_sig" };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(401);
    expect(recordHealthEvent).toHaveBeenCalledWith(deps.firestore, {
      type: "signature_failure",
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("4. Missing signature header -> returns 401, records signature_failure", async () => {
    const rawBody = createValidEnvelope();
    const req: WebhookRequest = { rawBody, signatureHeader: undefined };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(401);
    expect(recordHealthEvent).toHaveBeenCalledWith(deps.firestore, {
      type: "signature_failure",
    });
  });

  it("5. Malformed JSON body -> returns 400, no health event", async () => {
    const rawBody = "{ bad json";
    const signatureHeader = signForTest(rawBody, mockSecret);
    const req: WebhookRequest = { rawBody, signatureHeader };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(400);
    expect(recordHealthEvent).not.toHaveBeenCalled();
  });

  it("6. Valid signature but missing BOTH messageId and eventId -> returns 400", async () => {
    const rawBody = createValidEnvelope({
      messageId: undefined,
      eventId: undefined,
    });
    const signatureHeader = signForTest(rawBody, mockSecret);
    const req: WebhookRequest = { rawBody, signatureHeader };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(400);
  });

  it("7. Valid signature + event without clientId anywhere -> returns 200, no write", async () => {
    const rawBody = createValidEnvelope({ eventData: { siteId: 99999 } }); // No clientId
    const signatureHeader = signForTest(rawBody, mockSecret);
    const req: WebhookRequest = { rawBody, signatureHeader };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(200);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("8. Valid signature + Firestore set throws -> returns 500, records webhook_failure", async () => {
    mockSet.mockRejectedValue(new Error("Firestore error"));
    const rawBody = createValidEnvelope();
    const req: WebhookRequest = {
      rawBody,
      signatureHeader: signForTest(rawBody, mockSecret),
    };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(500);
    expect(recordHealthEvent).toHaveBeenCalledWith(deps.firestore, {
      type: "webhook_failure",
    });
  });

  it("9. Valid signature + tryRecordEvent throws -> returns 500", async () => {
    vi.mocked(tryRecordEvent).mockRejectedValue(new Error("Idempotency error"));

    const rawBody = createValidEnvelope();
    const req: WebhookRequest = {
      rawBody,
      signatureHeader: signForTest(rawBody, mockSecret),
    };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(500);
  });

  it("10. Extracts fields properly when placed at top level (partial payload)", async () => {
    const rawBodyObj = {
      messageId: "msg-custom-001",
      clientId: 999,
      firstName: "Alice",
      upcomingBookings: ["booking-1"],
    };
    const rawBody = JSON.stringify(rawBodyObj);
    const req: WebhookRequest = {
      rawBody,
      signatureHeader: signForTest(rawBody, mockSecret),
    };

    await handleMindbodyWebhook(deps, req);

    expect(mockSet).toHaveBeenCalledWith(
      {
        mindbody_name: "Alice",
        upcomingBookings: ["booking-1"],
      },
      { merge: true },
    );
  });

  it("11. Booking created event maps and writes to schedules collection", async () => {
    const rawBodyObj = {
      messageId: "booking-msg-001",
      eventId: "appointmentBooking.created",
      eventData: {
        siteId: 99999,
        clientId: "client-123",
        id: "booking-abc",
        clientName: "Alice Smith",
        staffName: "Marina",
        startDateTime: "2024-01-13T10:00:00Z",
        endDateTime: "2024-01-13T11:00:00Z",
        serviceName: "Semi-Private Training",
      },
    };
    const rawBody = JSON.stringify(rawBodyObj);
    const req: WebhookRequest = {
      rawBody,
      signatureHeader: signForTest(rawBody, mockSecret),
    };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        clientName: "Alice Smith",
        trainerName: "Marina",
        trainerId: "trainer-abc",
        studioId: "studio-123",
        status: "Scheduled",
        serviceName: "Semi-Private Training",
        source: "MindBody",
        clientId: "client-123",
      }),
      { merge: true },
    );
  });

  it("12. Booking cancelled event maps and updates status to Cancelled", async () => {
    const rawBodyObj = {
      messageId: "booking-msg-002",
      eventId: "appointmentBooking.cancelled",
      eventData: {
        siteId: 99999,
        clientId: "client-123",
        id: "booking-abc",
        clientName: "Alice Smith",
        staffName: "Marina",
        startDateTime: "2024-01-13T10:00:00Z",
        endDateTime: "2024-01-13T11:00:00Z",
        serviceName: "Semi-Private Training",
      },
    };
    const rawBody = JSON.stringify(rawBodyObj);
    const req: WebhookRequest = {
      rawBody,
      signatureHeader: signForTest(rawBody, mockSecret),
    };

    const response = await handleMindbodyWebhook(deps, req);

    expect(response.statusCode).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "Cancelled",
      }),
      { merge: true },
    );
  });
});
