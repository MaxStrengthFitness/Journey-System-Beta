import { describe, expect, it } from "vitest";
import { answerFor, progressReportsStatusOf } from "./client-answer";

describe("answerFor — an answer is only ever for the client it was read for", () => {
  it("hands back the answer for the same client", () => {
    expect(answerFor({ clientId: "judy", value: 49 }, "judy")).toBe(49);
    // A real zero is an answer, not a missing one.
    expect(answerFor({ clientId: "judy", value: 0 }, "judy")).toBe(0);
  });

  it("is null — not known yet — for any other client, and before any answer", () => {
    expect(answerFor({ clientId: "judy", value: 49 }, "ruth")).toBeNull();
    expect(answerFor(null, "judy")).toBeNull();
    expect(answerFor(undefined, "judy")).toBeNull();
    expect(answerFor({ clientId: "judy", value: 49 }, null)).toBeNull();
    expect(answerFor({ clientId: "", value: 49 }, "")).toBeNull();
  });
});

describe("progressReportsStatusOf", () => {
  it("is loading until the listener answers for this client", () => {
    expect(progressReportsStatusOf(null, "judy")).toBe("loading");
    // The last client's answer does not stand for this one.
    expect(progressReportsStatusOf({ clientId: "ruth", value: "ready" }, "judy")).toBe("loading");
    expect(progressReportsStatusOf({ clientId: "ruth", value: "failed" }, "judy")).toBe("loading");
  });

  it("says what the listener said for this client", () => {
    expect(progressReportsStatusOf({ clientId: "judy", value: "ready" }, "judy")).toBe("ready");
    expect(progressReportsStatusOf({ clientId: "judy", value: "failed" }, "judy")).toBe("failed");
  });

  it("is failed, not loading forever, when the app is out of quota and never read", () => {
    expect(progressReportsStatusOf(null, "judy", { quotaBlocked: true })).toBe("failed");
    expect(progressReportsStatusOf({ clientId: "ruth", value: "ready" }, "judy", { quotaBlocked: true })).toBe(
      "failed",
    );
  });

  it("keeps an answer already in for this client when the quota flag goes up later", () => {
    // The listener that answered is still open; its list is still live.
    expect(progressReportsStatusOf({ clientId: "judy", value: "ready" }, "judy", { quotaBlocked: true })).toBe(
      "ready",
    );
  });
});
