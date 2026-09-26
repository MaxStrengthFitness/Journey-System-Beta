import { describe, it, expect } from "vitest";
import { subscriptionRows, watchFrom, watchLine, WATCH_STALE_MS } from "./webhook-watch";

const PATH = "/mindbodyWebhook";
const NOW = Date.parse("2026-11-02T12:00:00Z");
const CHECKED = "2026-11-02T07:30:00Z";

const ours = (status: string, extra: Record<string, unknown> = {}) => ({
  subscriptionId: "sub-1",
  status,
  eventIds: ["client.updated", "appointmentBooking.created"],
  webhookUrl: "https://us-central1-x.cloudfunctions.net/mindbodyWebhook",
  messageSignatureKey: "SECRET",
  ...extra,
});

describe("reading Mindbody's subscription list (the cost plan, A7)", () => {
  it("reads the list in any envelope Mindbody sends it", () => {
    expect(subscriptionRows([{ a: 1 }])).toHaveLength(1);
    expect(subscriptionRows({ items: [{ a: 1 }, { b: 2 }] })).toHaveLength(2);
    expect(subscriptionRows({ Subscriptions: [{ a: 1 }] })).toHaveLength(1);
    expect(subscriptionRows(null)).toEqual([]);
  });

  it("is active only when a subscription pointing at Journey is Active", () => {
    expect(watchFrom([[ours("Active")]], PATH, CHECKED).active).toBe(true);
    expect(watchFrom([[ours("PendingActivation")]], PATH, CHECKED).active).toBe(false);
    expect(watchFrom([[{ ...ours("Active"), webhookUrl: "https://elsewhere.example/hook" }]], PATH, CHECKED).active).toBe(false);
  });

  it("never keeps the signing key, and lists a subscription once across sites", () => {
    const watch = watchFrom([[ours("Active")], { items: [ours("Active")] }], PATH, CHECKED);
    expect(watch.subscriptions).toHaveLength(1);
    expect(JSON.stringify(watch)).not.toContain("SECRET");
    expect(watch.subscriptions[0]).toMatchObject({ id: "sub-1", ours: true, eventIds: ["client.updated", "appointmentBooking.created"] });
  });
});

describe("watchLine", () => {
  it("says the webhook is on, and that the pull is the safety net", () => {
    const line = watchLine(watchFrom([[ours("Active")]], PATH, CHECKED), NOW);
    expect(line.tone).toBe("ok");
    expect(line.text).toMatch(/active \(checked 4 hours ago, 2 kinds of event\)/);
  });

  it("says when it is off, and Mindbody's own reason", () => {
    const watch = watchFrom(
      [[ours("DeactivatedTooManyFailedMessageDeliveryAttempts", { statusChangeMessage: "Too many failed deliveries" })]],
      PATH,
      CHECKED,
    );
    const line = watchLine(watch, NOW);
    expect(line.tone).toBe("alert");
    expect(line.text).toContain("DeactivatedTooManyFailedMessageDeliveryAttempts");
    expect(line.text).toContain("Too many failed deliveries");
    expect(line.text).toContain("30-minute pull");
  });

  it("says when Mindbody lists nothing pointing at Journey", () => {
    expect(watchLine(watchFrom([[]], PATH, CHECKED), NOW).text).toContain("lists none pointing at Journey");
  });

  it("never shows green without a check, or on a stale one", () => {
    expect(watchLine(null, NOW).tone).toBe("info");
    const stale = { ...watchFrom([[ours("Active")]], PATH, CHECKED), checkedAt: new Date(NOW - WATCH_STALE_MS - 1).toISOString() };
    expect(watchLine(stale, NOW).tone).toBe("warn");
    const failed = { ...watchFrom([], PATH, CHECKED), error: "HTTP 401" };
    expect(watchLine(failed, NOW).tone).toBe("warn");
  });
});
