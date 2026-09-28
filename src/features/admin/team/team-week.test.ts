import { afterEach, describe, expect, it } from "vitest";
import type { ScheduleEntry } from "../../../types";
import { forgetPersonalMemory } from "../../sign-out/memory";
import type { JourneyEntry } from "../journey/journey-list";
import type { TrainerWeek } from "../week/review";
import { huddleAgenda } from "./huddle-agenda";
import { huddleLines, resetHuddleMemory, toggleHuddleLine } from "./huddle-memory";
import { clientsLine, didLine, offToday, onToday, recognitionLine, usualClients } from "./team-week";

const TZ = "America/New_York";
const eastern = (day: string, hm: string) => new Date(`${day}T${hm}:00-04:00`);
const booking = (id: string, trainerId: string | null, hm: string, extra: Record<string, unknown> = {}) =>
  ({ id, clientId: id, clientName: id, trainerId, studioId: "westlake", startTime: eastern("2026-09-28", hm), endTime: new Date(eastern("2026-09-28", hm).getTime() + 30 * 60_000), status: "Scheduled", ...extra }) as unknown as ScheduleEntry;

const TRAINERS = [
  { id: "t1", fullName: "Imrahil Prince" },
  { id: "t2", fullName: "Beregond Guard" },
  { id: "t3", fullName: "Ioreth Healer" },
  { id: "t4", fullName: "Bergil Guard" },
];

describe("who is on today", () => {
  it("runs in the order their day starts, then by name, with their hours", () => {
    const on = onToday(
      [
        booking("a", "t2", "10:00"),
        booking("b", "t2", "13:00"),
        booking("c", "t1", "07:00"),
        booking("d", "t3", "07:00"),
        booking("e", "t4", "09:00", { status: "Cancelled" }),
        booking("f", "t4", "09:30", { clientName: "Unavailable" }),
        booking("g", null, "08:00", { trainerName: "Westlake Rotation" }),
        booking("h", "t1", "09:00", { startTime: eastern("2026-09-29", "09:00") }),
      ],
      "2026-09-28",
      TRAINERS,
      TZ,
    );
    expect(on.map((o) => [o.name, o.shift, o.booked])).toEqual([
      ["Imrahil Prince", "7:00 AM – 7:30 AM", 1],
      ["Ioreth Healer", "7:00 AM – 7:30 AM", 1],
      ["Beregond Guard", "10:00 AM – 1:30 PM", 2],
    ]);
    expect(offToday(TRAINERS, on).map((t) => t.fullName)).toEqual(["Bergil Guard"]);
  });
});

describe("a trainer's card", () => {
  const week = (over: Partial<TrainerWeek>): TrainerWeek => ({ key: "t2", trainerId: "t2", name: "Beregond Guard", booked: 0, notLogged: 0, missing: [], ...over });

  it("says last week's logging by name, and never guesses an unread week", () => {
    expect(didLine(week({ booked: 12, notLogged: 0 }), "ready", TZ)).toBe("Every one of last week's 12 sessions is logged.");
    expect(
      didLine(week({ booked: 12, notLogged: 1, missing: [{ clientId: "hugo", clientName: "Hugo Bracegirdle", day: "2026-09-26", startMs: eastern("2026-09-26", "10:30").getTime() }] }), "ready", TZ),
    ).toBe("One session last week isn't logged yet: Hugo Bracegirdle, Sat 10:30 AM.");
    expect(didLine(week({ booked: 3, notLogged: null }), "ready", TZ)).toBe("3 booked last week; what was logged couldn't be read.");
    expect(didLine(undefined, "ready", TZ)).toBe("Nothing was booked with them last week.");
    expect(didLine(undefined, "failed", TZ)).toBe("Last week's bookings couldn't be read just now.");
  });

  const entry = (name: string, usual: string, state: string) =>
    ({ id: name, usual: { id: usual, name: "x" }, journey: { state }, row: { name: { display: name } } }) as unknown as JourneyEntry;
  const journeys = [entry("Adelard Took", "t2", "drifting"), entry("Estella Bolger", "t2", "at-risk"), entry("Rosie Cotton", "t2", "back"), entry("Nienor", "t1", "back"), entry("Lotho", "t2", "steady")];

  it("names their usual clients who are slipping, and says nothing either way while that can't be told", () => {
    const theirs = usualClients(journeys, "t2");
    expect(theirs).toHaveLength(4);
    expect(clientsLine(theirs, true)).toBe("Adelard Took is drifting and Estella Bolger is at risk. They may know why.");
    expect(clientsLine(usualClients(journeys, "t1"), true)).toBe("None of their usual clients is drifting or at risk.");
    expect(clientsLine(theirs, false)).toBe("Whether their clients are slipping can't be told yet.");
    expect(usualClients(journeys, null)).toEqual([]);
  });

  it("recognises who is back and the team's kudos, or has nothing to say", () => {
    expect(recognitionLine(usualClients(journeys, "t2"), 3)).toBe("Rosie Cotton is booked again after a gap. 3 kudos from the team in the last seven days.");
    expect(recognitionLine(usualClients(journeys, "t3"), null)).toBeNull();
    expect(recognitionLine(usualClients(journeys, "t3"), 0)).toBeNull();
  });
});

describe("the huddle", () => {
  afterEach(() => resetHuddleMemory());

  it("has five items, and says so when a part is empty or unread", () => {
    const items = huddleAgenda({ concern: null, win: undefined, catchLines: null, floor: [], recognition: [], announcements: [] });
    expect(items.map((i) => i.title)).toEqual(["A concern and a win", "Today", "The floor", "Recognition", "Announcements"]);
    expect(items[0].lines.map((l) => `${l.tag}: ${l.text}`)).toEqual(["Concern: Nothing is waiting to be acknowledged.", "Win: Still reading…"]);
    expect(items[1].lines[0].text).toBe("Today's bookings couldn't be read, so who to catch is unknown.");
    expect(items[4].lines[0].text).toBe("None showing in the bell.");
    const told = huddleAgenda({ concern: "Lobelia: knee pain on the leg press.", win: "Rosie Cotton is back.", catchLines: [{ tag: "9:40 AM", text: "Rosie Cotton, with Ioreth." }], floor: ["x"], recognition: ["y"], announcements: ["z"] });
    expect(told[1].lines).toEqual([{ tag: "9:40 AM", text: "Rosie Cotton, with Ioreth." }]);
  });

  it("keeps what Team recognised for the studio's day, and forgets it at sign-out", () => {
    expect(toggleHuddleLine("westlake", "2026-09-28", "Beregond Guard: Rosie is back.")).toBe(true);
    expect(huddleLines("westlake", "2026-09-28")).toEqual(["Beregond Guard: Rosie is back."]);
    expect(huddleLines("westlake", "2026-09-29")).toEqual([]);
    expect(huddleLines("solon", "2026-09-28")).toEqual([]);
    expect(toggleHuddleLine("westlake", "2026-09-28", "Beregond Guard: Rosie is back.")).toBe(false);
    expect(huddleLines("westlake", "2026-09-28")).toEqual([]);
    toggleHuddleLine("westlake", "2026-09-28", "Ioreth Healer: 2 kudos.");
    forgetPersonalMemory();
    expect(huddleLines("westlake", "2026-09-28")).toEqual([]);
  });
});
