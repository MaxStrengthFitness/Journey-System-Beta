import { describe, expect, it } from "vitest";
import { daysUntilBirthday, hubMarkers, isDefaultService } from "./hub-markers";

const today = new Date(2026, 8, 13); // Sep 13 2026

describe("hubMarkers", () => {
  it("names the first session, a consultation, and a milestone", () => {
    expect(hubMarkers({ client: {} as any, sessionNumber: 1, today })).toEqual([{ kind: "first", label: "First session" }]);
    expect(hubMarkers({ client: {} as any, sessionNumber: 3, serviceName: "Consultation", today })[0]).toEqual({ kind: "consult", label: "Consultation" });
    expect(hubMarkers({ client: { requiresConsultation: true, consultationCompleted: false } as any, sessionNumber: 1, today })[0].kind).toBe("consult");
    expect(hubMarkers({ client: {} as any, sessionNumber: 100, today })).toEqual([{ kind: "milestone", label: "Session 100" }]);
    expect(hubMarkers({ client: {} as any, sessionNumber: 52, today })).toEqual([]);
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
