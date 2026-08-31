import { describe, it, expect, vi, beforeEach } from "vitest";
import { Firestore } from "firebase-admin/firestore";
import { recordAttemptFailure, MAX_ATTEMPTS } from "./retryLedger";
import { recordDeadLetter } from "./dlq";

vi.mock("./dlq", () => ({ recordDeadLetter: vi.fn() }));

describe("recordAttemptFailure", () => {
  let priorAttempts: number | undefined;
  let ledgerWrite: ReturnType<typeof vi.fn>;
  let eventLogDelete: ReturnType<typeof vi.fn>;
  let firestore: Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
    priorAttempts = undefined;
    ledgerWrite = vi.fn();
    eventLogDelete = vi.fn().mockResolvedValue(undefined);

    const collection = vi.fn((name: string) => ({
      doc: vi.fn(() => ({
        delete: name === "mindbodyEventLog" ? eventLogDelete : vi.fn(),
        __name: name,
      })),
    }));

    firestore = {
      collection,
      runTransaction: vi.fn(async (cb: any) =>
        cb({
          get: vi.fn().mockResolvedValue({
            exists: priorAttempts !== undefined,
            data: () => ({ attempts: priorAttempts }),
          }),
          set: ledgerWrite,
        }),
      ),
    } as unknown as Firestore;
  });

  const run = (payload: Record<string, unknown> = { a: 1 }) =>
    recordAttemptFailure(firestore, {
      messageId: "msg-1",
      eventType: "client.updated",
      payload,
      error: new Error("boom"),
    });

  it("releases the idempotency record on the first failure so the retry is reprocessed", async () => {
    const outcome = await run();

    expect(outcome).toEqual({ willRetry: true, attempts: 1 });
    expect(eventLogDelete).toHaveBeenCalledTimes(1);
    expect(recordDeadLetter).not.toHaveBeenCalled();
  });

  it("counts attempts across retries", async () => {
    priorAttempts = 2;
    const outcome = await run();

    expect(outcome.attempts).toBe(3);
    expect(outcome.willRetry).toBe(true);
    expect(ledgerWrite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ attempts: 3, lastError: "boom" }),
    );
  });

  it("dead-letters and stops retrying once the budget is spent", async () => {
    priorAttempts = MAX_ATTEMPTS - 1;
    const outcome = await run({ eventData: { clientId: 5 } });

    expect(outcome).toEqual({ willRetry: false, attempts: MAX_ATTEMPTS });
    // The gate is deliberately NOT released — that is what stops the retry storm.
    expect(eventLogDelete).not.toHaveBeenCalled();
    expect(recordDeadLetter).toHaveBeenCalledWith(
      firestore,
      expect.objectContaining({
        messageId: "msg-1",
        eventType: "client.updated",
        retryCount: MAX_ATTEMPTS,
        originalPayload: { eventData: { clientId: 5 } },
      }),
    );
  });

  it("still reports a retry when the release delete fails", async () => {
    eventLogDelete.mockRejectedValueOnce(new Error("offline"));
    const outcome = await run();
    expect(outcome.willRetry).toBe(true);
  });

  it("truncates very long error messages", async () => {
    await recordAttemptFailure(firestore, {
      messageId: "msg-1",
      eventType: "client.updated",
      payload: {},
      error: new Error("x".repeat(5000)),
    });
    const written = ledgerWrite.mock.calls[0][1] as { lastError: string };
    expect(written.lastError.length).toBe(1000);
  });
});
