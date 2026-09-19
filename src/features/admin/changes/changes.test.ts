import { describe, expect, it } from "vitest";
import type { ScheduleEntry } from "../../../types";
import { changeCounts, changesForDay, describeChange, weekEndOf, weekStartOf } from "./changes";

const TZ = "America/New_York";

// Eastern wall clock → instant. September is EDT (UTC−4).
const at = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);

function row(over: Partial<ScheduleEntry> & { id: string }): ScheduleEntry {
  return {
    clientId: "c1",
    clientName: "Jane Smith",
    trainerId: "t1",
    trainerName: "Tom",
    studioId: "s1",
    startTime: at("2026-09-18", "09:00"),
    endTime: at("2026-09-18", "09:30"),
    status: "Scheduled",
    serviceName: "Training Session",
    source: "MindBody",
    createdAt: null,
    ...over,
  };
}

describe("weeks run Monday to Sunday", () => {
  it("finds the Monday and the Sunday of a Friday", () => {
    expect(weekStartOf("2026-09-18")).toBe("2026-09-14");
    expect(weekEndOf("2026-09-18")).toBe("2026-09-20");
  });
  it("a Sunday belongs to the week that started the Monday before", () => {
    expect(weekStartOf("2026-09-20")).toBe("2026-09-14");
  });
  it("a Monday is its own week's start", () => {
    expect(weekStartOf("2026-09-14")).toBe("2026-09-14");
  });
});

describe("changesForDay — day-bucketing", () => {
  it("holds a cancellation against the day the session was FOR", () => {
    // Cancelled on Wednesday the 16th; the session was Friday the 18th.
    const entries = [row({ id: "a", status: "Cancelled", cancelledAt: at("2026-09-16", "07:12"), cancelSource: "sweep" })];
    expect(changesForDay(entries, "2026-09-16", TZ)).toHaveLength(0);
    const friday = changesForDay(entries, "2026-09-18", TZ);
    expect(friday).toHaveLength(1);
    expect(friday[0].kind).toBe("cancelled");
    expect(friday[0].forDay).toBe("2026-09-18");
  });

  it("buckets by the studio's day, not UTC's — an 8 PM Eastern booking is not tomorrow", () => {
    const entries = [row({ id: "late", status: "Cancelled", startTime: at("2026-09-18", "20:30") })];
    expect(changesForDay(entries, "2026-09-18", TZ)).toHaveLength(1);
    expect(changesForDay(entries, "2026-09-19", TZ)).toHaveLength(0);
  });

  it("a moved booking belongs to the day it LEFT, and says where it went", () => {
    const entries = [
      row({
        id: "m",
        startTime: at("2026-09-17", "14:00"),
        movedFromDay: "2026-09-15",
        movedFromStart: at("2026-09-15", "10:00"),
        movedAt: at("2026-09-14", "18:00"),
        trainerName: "Sara",
      }),
    ];
    const tuesday = changesForDay(entries, "2026-09-15", TZ);
    expect(tuesday).toHaveLength(1);
    expect(tuesday[0].kind).toBe("moved");
    expect(tuesday[0].reading).toBe("reschedule");
    expect(tuesday[0].movedTo?.sameBooking).toBe(true);
    expect(tuesday[0].movedTo?.start).toEqual(at("2026-09-17", "14:00"));
    // The day it landed on carries nothing: it is simply booked there.
    expect(changesForDay(entries, "2026-09-17", TZ)).toHaveLength(0);
  });

  it("a live booking is not a change", () => {
    expect(changesForDay([row({ id: "live" })], "2026-09-18", TZ)).toHaveLength(0);
  });
});

describe("changesForDay — cancellation vs reschedule", () => {
  it("reads a cancellation as a reschedule when the client holds another booking that week", () => {
    const entries = [
      row({ id: "gone", status: "Cancelled" }),
      // Same client, same week (Sat the 19th), a different booking.
      row({ id: "kept", startTime: at("2026-09-19", "11:00"), trainerName: "Sara" }),
    ];
    const [change] = changesForDay(entries, "2026-09-18", TZ);
    expect(change.reading).toBe("reschedule");
    expect(change.movedTo?.sameBooking).toBe(false);
    expect(change.movedTo?.trainerName).toBe("Sara");
    expect(change.movedTo?.start).toEqual(at("2026-09-19", "11:00"));
  });

  it("a booking NEXT week does not make it a reschedule", () => {
    const entries = [row({ id: "gone", status: "Cancelled" }), row({ id: "next", startTime: at("2026-09-22", "09:00") })];
    const [change] = changesForDay(entries, "2026-09-18", TZ);
    expect(change.reading).toBe("cancellation");
    expect(change.movedTo).toBeNull();
  });

  it("another client's booking is not this client's reschedule", () => {
    const entries = [row({ id: "gone", status: "Cancelled" }), row({ id: "other", clientId: "c2", clientName: "Mark Lee", startTime: at("2026-09-19", "11:00") })];
    expect(changesForDay(entries, "2026-09-18", TZ)[0].reading).toBe("cancellation");
  });

  it("matches by name when the sync never linked a client id", () => {
    const entries = [
      row({ id: "gone", status: "Cancelled", clientId: undefined }),
      row({ id: "kept", clientId: undefined, clientName: "jane smith", startTime: at("2026-09-19", "11:00") }),
    ];
    expect(changesForDay(entries, "2026-09-18", TZ)[0].reading).toBe("reschedule");
  });

  it("prefers the booking after the cancelled one over one earlier in the week", () => {
    const entries = [
      row({ id: "gone", status: "Cancelled" }),
      row({ id: "before", startTime: at("2026-09-15", "09:00"), trainerName: "Early" }),
      row({ id: "after", startTime: at("2026-09-19", "09:00"), trainerName: "Later" }),
    ];
    expect(changesForDay(entries, "2026-09-18", TZ)[0].movedTo?.trainerName).toBe("Later");
  });

  it("orders the day by original start", () => {
    const entries = [
      row({ id: "b", status: "Cancelled", startTime: at("2026-09-18", "15:00"), clientName: "Zed" }),
      row({ id: "a", status: "Cancelled", startTime: at("2026-09-18", "08:00"), clientId: "c2", clientName: "Amy" }),
    ];
    expect(changesForDay(entries, "2026-09-18", TZ).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("changeCounts", () => {
  it("counts each day of a strip", () => {
    const entries = [
      row({ id: "a", status: "Cancelled" }),
      row({ id: "b", status: "Cancelled", clientId: "c2", startTime: at("2026-09-19", "09:00") }),
      row({ id: "m", startTime: at("2026-09-20", "09:00"), movedFromDay: "2026-09-19", movedFromStart: at("2026-09-19", "12:00") }),
    ];
    expect(changeCounts(entries, ["2026-09-18", "2026-09-19", "2026-09-20"], TZ)).toEqual({
      "2026-09-18": 1,
      "2026-09-19": 2,
      "2026-09-20": 0,
    });
  });
});

describe("describeChange", () => {
  it("a plain cancellation says so and that nothing else is booked", () => {
    const [change] = changesForDay([row({ id: "gone", status: "Cancelled", cancelledAt: at("2026-09-18", "07:12"), cancelSource: "sweep" })], "2026-09-18", TZ);
    const text = describeChange(change, TZ);
    expect(text.sentence).toBe("Cancelled — 9:00 AM with Tom.");
    expect(text.proof).toBe("Nothing else booked this week. Gone from Mindbody by 7:12 AM.");
  });

  it("a reschedule names where it went, with the weekday when it is another day", () => {
    const [change] = changesForDay(
      [row({ id: "gone", status: "Cancelled", cancelledAt: at("2026-09-16", "07:12"), cancelSource: "mindbody" }), row({ id: "kept", startTime: at("2026-09-19", "11:00"), trainerName: "Sara" })],
      "2026-09-18",
      TZ,
    );
    const text = describeChange(change, TZ);
    expect(text.sentence).toBe("Cancelled 9:00 AM with Tom — but booked Sat 11:00 AM with Sara, so read it as a reschedule.");
    expect(text.proof).toBe("Mindbody reported it at 7:12 AM on Wed, Sep 16.");
  });

  it("a move Mindbody made reads as a move", () => {
    const [change] = changesForDay(
      [row({ id: "m", startTime: at("2026-09-18", "14:00"), movedFromDay: "2026-09-18", movedFromStart: at("2026-09-18", "10:00"), movedAt: at("2026-09-17", "18:00") })],
      "2026-09-18",
      TZ,
    );
    expect(describeChange(change, TZ).sentence).toBe("Moved — was 10:00 AM with Tom, now 2:00 PM with Tom.");
  });

  it("says when the change was not stamped", () => {
    const [change] = changesForDay([row({ id: "gone", status: "Cancelled" })], "2026-09-18", TZ);
    expect(describeChange(change, TZ).proof).toContain("When it changed was not recorded.");
  });
});
