import { describe, expect, it } from "vitest";
import { daysUntilBirthday, hubMarkers, isDefaultService, visibleMarkers } from "./hub-markers";

const today = new Date(2026, 8, 13); // Sep 13 2026

describe("hubMarkers", () => {
  const complete = "complete" as const;

  it("names the first session, a consultation, and a milestone", () => {
    expect(hubMarkers({ client: {} as any, sessionNumber: 1, coverage: complete, today })).toEqual([{ kind: "first", label: "First session" }]);
    expect(hubMarkers({ client: {} as any, sessionNumber: 3, serviceName: "Consultation", today })[0]).toEqual({ kind: "consult", label: "Consultation" });
    expect(hubMarkers({ client: { requiresConsultation: true, consultationCompleted: false } as any, sessionNumber: 1, today })[0].kind).toBe("consult");
    expect(hubMarkers({ client: {} as any, sessionNumber: 100, coverage: complete, today })).toEqual([{ kind: "milestone", label: "Session 100" }]);
    expect(hubMarkers({ client: {} as any, sessionNumber: 52, coverage: complete, today })).toEqual([]);
  });

  /*
   * The migration client. Journey has seen nothing of her, so her count is 1
   * and her real total is in FileMaker. Calling her card "#1 - First session"
   * in front of the trainer who has known her for eight years is the bug
   * this gate exists to stop, and it is silent: nobody notices a wrong word.
   */
  describe("a client who was training here before Journey", () => {
    it("says New to Journey instead of First session", () => {
      expect(hubMarkers({ client: {} as any, sessionNumber: 1, coverage: "partial", today })).toEqual([
        { kind: "new-to-journey", label: "New to Journey" },
      ]);
      expect(hubMarkers({ client: {} as any, sessionNumber: 1, coverage: "unknown", today })).toEqual([
        { kind: "new-to-journey", label: "New to Journey" },
      ]);
    });

    it("claims no milestone off a count that is only part of the story", () => {
      expect(hubMarkers({ client: {} as any, sessionNumber: 25, coverage: "partial", today })).toEqual([]);
      expect(hubMarkers({ client: {} as any, sessionNumber: 100, coverage: "unknown", today })).toEqual([]);
    });

    it("trusts the count again once somebody records what came before", () => {
      // priorHistory present means a person stated the total, and the
      // reconciler folds it into sessionCount - so the number is hers again.
      const recorded = { priorHistory: { sessions: 312, through: "2026-08-31", source: "filemaker" } } as any;
      expect(hubMarkers({ client: recorded, sessionNumber: 325, coverage: "partial", today })).toEqual([
        { kind: "milestone", label: "Session 325" },
      ]);
    });

    it("defaults to the cautious answer when a caller forgets to pass coverage", () => {
      // The whole point of the default: a screen nobody threaded this
      // through says too little, never something wrong.
      expect(hubMarkers({ client: {} as any, sessionNumber: 1, today })).toEqual([
        { kind: "new-to-journey", label: "New to Journey" },
      ]);
    });

    it("still lets a consultation win, and still says she is back", () => {
      expect(hubMarkers({ client: {} as any, sessionNumber: 1, serviceName: "Consultation", coverage: "unknown", today })[0].kind).toBe("consult");
      expect(hubMarkers({ client: { lastSessionDate: "2026-08-16" } as any, sessionNumber: 40, coverage: "unknown", today })).toEqual([
        { kind: "back", label: "Back after 4 wk" },
      ]);
    });
  });

  it("sees a birthday within the week", () => {
    expect(daysUntilBirthday("1961-09-13", today)).toBe(0);
    expect(daysUntilBirthday("1961-09-20", today)).toBe(7);
    expect(daysUntilBirthday("1961-09-21", today)).toBe(8);
    expect(daysUntilBirthday("1961-01-05", today)).toBe(114);
    expect(hubMarkers({ client: { dateOfBirth: "1961-09-14" } as any, sessionNumber: 40, today })).toEqual([{ kind: "birthday", label: "Birthday tomorrow" }]);
  });

  it("notices someone back after three weeks, but not a brand-new client", () => {
    expect(hubMarkers({ client: { lastSessionDate: "2026-08-16" } as any, sessionNumber: 40, today })).toEqual([{ kind: "back", label: "Back after 4 wk" }]);
    expect(hubMarkers({ client: { lastSessionDate: "2026-09-10" } as any, sessionNumber: 40, today })).toEqual([]);
  });

  it("reads upcoming and ongoing breaks, and upcoming medical events, from the client's events", () => {
    const client = {
      events: [
        { id: "1", type: "Vacation", title: "Florida", priority: "Low", date: "2026-09-20", endDate: "2026-10-04" },
        { id: "2", type: "Medical", title: "Knee surgery", priority: "High", date: "2026-09-25" },
        { id: "3", type: "Progress Report", title: "PR", priority: "Low", date: "2026-09-14" },
      ],
    } as any;
    expect(hubMarkers({ client, sessionNumber: 40, today }).map((m) => m.label)).toEqual(["Away from Sep 20", "Knee surgery Sep 25"]);
    const ongoing = { events: [{ id: "1", type: "Snowbird", title: "", priority: "Low", date: "2026-09-01", endDate: "2026-09-15" }] } as any;
    expect(hubMarkers({ client: ongoing, sessionNumber: 40, today })).toEqual([{ kind: "away", label: "Away until Sep 15" }]);
  });

  it("flags a renewal that is due", () => {
    const client = { renewal: { situation: "active", conversationDue: true, renewalOnBooks: null } } as any;
    expect(hubMarkers({ client, sessionNumber: 40, today })).toEqual([{ kind: "renewal", label: "Renewal due" }]);
  });
});

describe("isDefaultService", () => {
  it("hides the redundant training label and keeps anything else", () => {
    expect(isDefaultService("Training Session")).toBe(true);
    expect(isDefaultService("Session")).toBe(true);
    expect(isDefaultService("")).toBe(true);
    expect(isDefaultService("Consultation")).toBe(false);
    expect(isDefaultService("InBody Scan")).toBe(false);
  });
});

describe("visibleMarkers", () => {
  const m = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: `k${i}`, label: `M${i}` }));

  it("shows everything when the card has room", () => {
    expect(visibleMarkers(m(0), 2)).toEqual({ shown: [], more: 0 });
    expect(visibleMarkers(m(2), 2)).toEqual({ shown: m(2), more: 0 });
  });

  it("keeps the most important and folds the rest into a count", () => {
    expect(visibleMarkers(m(3), 2)).toEqual({ shown: m(1), more: 2 });
    expect(visibleMarkers(m(5), 2)).toEqual({ shown: m(1), more: 4 });
    expect(visibleMarkers(m(4), 3)).toEqual({ shown: m(2), more: 2 });
  });

  it("never folds a single chip into a +1 that would take the same room", () => {
    expect(visibleMarkers(m(2), 1)).toEqual({ shown: m(1), more: 1 });
    expect(visibleMarkers(m(1), 1)).toEqual({ shown: m(1), more: 0 });
  });
});
