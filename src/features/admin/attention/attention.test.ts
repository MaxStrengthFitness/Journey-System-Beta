import { describe, expect, it } from "vitest";
import type { Client } from "../../../types";
import type { RenewalSnapshot } from "../../renewals/types";
import { ackKey, backAgain, dismissal, isAcknowledged, keysToAcknowledge, kindOfKey, pendingAcks, snooze, splitWatched, watchState, type WatchlistEntry } from "./attention";

const TODAY = "2026-09-19";

const entry = (over: Partial<WatchlistEntry>): WatchlistEntry => ({
  clientId: "c1",
  snoozedUntil: null,
  dismissedAt: null,
  dismissedBy: null,
  dismissedByName: null,
  lastVisitAtDismissal: null,
  nextBookingAtDismissal: null,
  ...over,
});

const snapshot = (over: Partial<RenewalSnapshot>): RenewalSnapshot =>
  ({
    version: 1,
    cycleKey: null,
    renewalOnBooks: null,
    clientContractId: null,
    packageKey: null,
    packageLabel: null,
    paymentMode: null,
    billingStart: null,
    chargeDate: null,
    chargeDateSource: null,
    autoRenews: null,
    sessionsLeft: null,
    sessionsLeftSource: null,
    sessionsOnHand: null,
    paymentsLeft: null,
    pacePerWeek: null,
    runOutDate: null,
    bankedAtCharge: null,
    situation: "on-track",
    conversationDue: false,
    chargeWarning: false,
    focusDate: null,
    flags: [],
    proof: { weeksAttended: null, weeksObserved: null, machinesImproved: null, machinesTracked: null, bestGain: null, inbody: null },
    awayUntil: null,
    awayReason: null,
    lastVisitDate: null,
    nextBookingDate: null,
    coachIds: [],
    primaryTrainerId: null,
    dataGaps: [],
    ...over,
  }) as RenewalSnapshot;

const client = (id: string, name: string, s: Partial<RenewalSnapshot>): Client =>
  ({ id, firstName: name, lastName: "Test", renewal: snapshot(s) }) as unknown as Client;

describe("watchState", () => {
  it("nothing on file means watching", () => {
    expect(watchState(undefined, TODAY)).toBe("watching");
  });
  it("a snooze holds until its day, then lapses", () => {
    expect(watchState(entry({ snoozedUntil: "2026-09-25" }), TODAY)).toBe("snoozed");
    expect(watchState(entry({ snoozedUntil: "2026-09-19" }), TODAY)).toBe("watching");
    expect(watchState(entry({ snoozedUntil: "2026-09-10" }), TODAY)).toBe("watching");
  });
  it("a dismissal holds until it is cleared", () => {
    expect(watchState(entry({ dismissedAt: "2026-09-02" }), TODAY)).toBe("dismissed");
  });
  it("a live snooze outranks an old dismissal on the same document", () => {
    expect(watchState(entry({ dismissedAt: "2026-09-02", snoozedUntil: "2026-09-30" }), TODAY)).toBe("snoozed");
  });
});

describe("splitWatched", () => {
  it("takes answered rows out of the list and counts them", () => {
    const rows = [{ clientId: "a" }, { clientId: "b" }, { clientId: "c" }, { clientId: "d" }];
    const watchlist = new Map<string, WatchlistEntry>([
      ["b", entry({ clientId: "b", snoozedUntil: "2026-10-01" })],
      ["c", entry({ clientId: "c", dismissedAt: "2026-09-01" })],
      ["d", entry({ clientId: "d", snoozedUntil: "2026-09-01" })], // lapsed
    ]);
    const split = splitWatched(rows, watchlist, TODAY);
    expect(split.shown.map((r) => r.clientId)).toEqual(["a", "d"]);
    expect(split.snoozed.map((r) => r.clientId)).toEqual(["b"]);
    expect(split.dismissed.map((r) => r.clientId)).toEqual(["c"]);
  });
});

describe("backAgain — the loop closes", () => {
  it("a dismissed client who booked again is back", () => {
    const watchlist = new Map([["c1", entry({ dismissedAt: "2026-09-02", dismissedByName: "Owner A" })]]);
    const rows = backAgain(watchlist, [client("c1", "Al", { nextBookingDate: "2026-09-22" })], TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0].sentence).toBe("Back — booked again for Sep 22.");
    expect(rows[0].proof).toBe("Taken off the list Sep 2 by Owner A.");
  });

  it("a visit after the dismissal is back, and mentions the booking too", () => {
    const watchlist = new Map([["c1", entry({ dismissedAt: "2026-09-02" })]]);
    const rows = backAgain(watchlist, [client("c1", "Al", { lastVisitDate: "2026-09-15", nextBookingDate: "2026-09-22" })], TODAY);
    expect(rows[0].sentence).toBe("Back — visited Sep 15, and booked again Sep 22.");
  });

  it("a booking that was already on the books at dismissal is not news", () => {
    const watchlist = new Map([["c1", entry({ dismissedAt: "2026-09-02", nextBookingAtDismissal: "2026-09-22" })]]);
    expect(backAgain(watchlist, [client("c1", "Al", { nextBookingDate: "2026-09-22" })], TODAY)).toHaveLength(0);
  });

  it("a visit before the dismissal is not news, and a past booking is not a booking", () => {
    const watchlist = new Map([["c1", entry({ dismissedAt: "2026-09-10" })]]);
    expect(backAgain(watchlist, [client("c1", "Al", { lastVisitDate: "2026-09-01", nextBookingDate: "2026-09-05" })], TODAY)).toHaveLength(0);
  });

  it("snoozed clients and clients with no snapshot are left alone", () => {
    const watchlist = new Map([
      ["c1", entry({ clientId: "c1", snoozedUntil: "2026-10-01" })],
      ["c2", entry({ clientId: "c2", dismissedAt: "2026-09-02" })],
    ]);
    const noSnapshot = { id: "c2", firstName: "Bo", lastName: "Test" } as unknown as Client;
    expect(backAgain(watchlist, [client("c1", "Al", { nextBookingDate: "2026-09-22" }), noSnapshot], TODAY)).toHaveLength(0);
  });
});

describe("the dispositions written", () => {
  it("a dismissal remembers what the snapshot said that day", () => {
    const d = dismissal("c1", client("c1", "Al", { lastVisitDate: "2026-08-20", nextBookingDate: null }), { id: "u1", name: "Owner A" }, TODAY);
    expect(d).toEqual({
      clientId: "c1",
      snoozedUntil: null,
      dismissedAt: TODAY,
      dismissedBy: "u1",
      dismissedByName: "Owner A",
      lastVisitAtDismissal: "2026-08-20",
      nextBookingAtDismissal: null,
    });
  });
  it("a snooze carries only its date", () => {
    expect(snooze("c1", "2026-09-26").snoozedUntil).toBe("2026-09-26");
    expect(snooze("c1", "2026-09-26").dismissedAt).toBeNull();
  });
});

describe("acknowledgements", () => {
  const acks = new Set([ackKey("incident", "i1"), ackKey("note", "n1")]);
  it("a row is acknowledged only when every one of its keys is", () => {
    expect(isAcknowledged({ ackKeys: ["incident:i1"] }, acks)).toBe(true);
    expect(isAcknowledged({ ackKeys: ["incident:i1", "note:n1"] }, acks)).toBe(true);
    expect(isAcknowledged({ ackKeys: ["incident:i1", "pain:c1:2026-09-18"] }, acks)).toBe(false);
    expect(isAcknowledged({ ackKeys: [] }, acks)).toBe(false);
  });
  it("splits pending from done", () => {
    const rows = [{ ackKeys: ["incident:i1"] }, { ackKeys: ["pain:c1:2026-09-18"] }];
    const { pending, acknowledged } = pendingAcks(rows, acks);
    expect(pending).toHaveLength(1);
    expect(acknowledged).toBe(1);
  });
  it("acknowledge-all writes only what is still open, once", () => {
    const rows = [{ ackKeys: ["incident:i1", "pain:c1:2026-09-18"] }, { ackKeys: ["pain:c1:2026-09-18", "note:n2"] }];
    expect(keysToAcknowledge(rows, acks)).toEqual(["pain:c1:2026-09-18", "note:n2"]);
  });
  it("reads the kind back out of a key", () => {
    expect(kindOfKey("pain:c1:2026-09-18")).toBe("pain");
    expect(kindOfKey("incident:i1")).toBe("incident");
    expect(kindOfKey("mystery:x")).toBe("note");
  });
});
