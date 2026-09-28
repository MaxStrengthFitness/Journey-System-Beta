import { beforeEach, describe, expect, it } from "vitest";
import { BEREGOND, GLORFINDEL, IORETH, MABLUNG, TODAY, ask, job, row, template } from "./fixtures";
import { DEFAULT_SHIFT_HOURS, nowContext, type NowSession } from "./now-context";
import { buildTracker, type TrackerInput } from "../tracker";
import { forgetPersonalMemory } from "../../sign-out/memory";
import {
  OPENING_LEAD_MINUTES,
  closeoutAt,
  closeoutItems,
  dayDraft,
  foldShiftCard,
  foldedAt,
  openingLines,
  resetShiftCards,
  shiftCardNow,
  unfoldShiftCard,
} from "./shift-cards";

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const session = (id: string, clientName: string, start: string, minutes = 30): NowSession => ({
  id,
  clientId: id,
  clientName,
  startMin: at(start),
  endMin: at(start) + minutes,
  status: "Scheduled",
});
const day = [session("a", "Odo Proudfoot", "10:00"), session("b", "Belladonna Took", "13:00"), session("c", "Adelard Took", "15:30")];
const me = new Set([IORETH.id]);

const personal = (id: string, extra: Parameters<typeof template>[1] = {}) =>
  template(id, { scope: "personal", ownerId: IORETH.id, kind: "facility", target: { kind: "facility" }, category: "ops", title: id, ...extra });

const trackerOf = (over: Partial<TrackerInput>) =>
  buildTracker({
    rows: [],
    templates: [],
    requests: [],
    resolved: [],
    jobs: [],
    followUps: [],
    uid: IORETH.id,
    trainerId: IORETH.id,
    todayKey: TODAY,
    closingMin: DEFAULT_SHIFT_HOURS.closing,
    ...over,
  });

describe("which card, when", () => {
  it("opens the day from ninety minutes before the first session until it starts", () => {
    expect(shiftCardNow(nowContext(day, at("10:00") - OPENING_LEAD_MINUTES - 1, TODAY, { ...DEFAULT_SHIFT_HOURS, open: at("06:00"), mid: at("07:00") }))).toBeNull();
    expect(shiftCardNow(nowContext(day, at("08:30"), TODAY))).toBe("opening");
    expect(shiftCardNow(nowContext(day, at("10:05"), TODAY))).toBeNull();
  });

  it("opens the day through the studio's opening shift for anyone, booked later or not at all", () => {
    const hours = { ...DEFAULT_SHIFT_HOURS, open: at("06:00"), mid: at("10:00") };
    expect(shiftCardNow(nowContext([session("x", "Odo Proudfoot", "13:00")], at("06:30"), TODAY, hours))).toBe("opening");
    expect(shiftCardNow(nowContext([], at("06:30"), TODAY, hours))).toBe("opening");
  });

  it("closes out once the last session has ended, or in the closing shift for someone with nothing booked", () => {
    expect(shiftCardNow(nowContext(day, at("16:00"), TODAY))).toBe("closeout");
    expect(shiftCardNow(nowContext(day, at("15:45"), TODAY))).toBeNull();
    const hours = { ...DEFAULT_SHIFT_HOURS, closing: at("16:00"), close: at("20:00") };
    expect(shiftCardNow(nowContext([], at("16:30"), TODAY, hours))).toBe("closeout");
    expect(shiftCardNow(nowContext([], at("12:00"), TODAY, hours))).toBeNull();
  });

  it("says when Close out opens: the end of the last session, or Closing", () => {
    expect(closeoutAt(nowContext(day, at("12:00"), TODAY))).toBe(at("16:00"));
    expect(closeoutAt(nowContext([], at("12:00"), TODAY, { ...DEFAULT_SHIFT_HOURS, closing: at("17:00") }))).toBe(at("17:00"));
  });
});

describe("Opening", () => {
  it("names what is waiting, each line with its door, and only what is there", () => {
    const opener = template("open-lights", { title: "Lights and music", recurrence: { type: "daily", shifts: ["am"] } });
    const rows = [
      { ...row(opener, "a"), shift: "am" as const },
      { ...row(opener, "b", "done"), shift: "am" as const },
      // A trainer's own to-do is never one of the studio's chores.
      { ...row(personal("my-own", { recurrence: { type: "daily", shifts: ["am"] } }), undefined), shift: "am" as const },
    ];
    const lines = openingLines({
      now: nowContext(day, at("08:45"), TODAY),
      rows,
      requests: [ask("cover", { kind: "cover", title: "Cover for Farmer Maggot at 4:20", createdBy: MABLUNG })],
      me,
      handed: 2,
    });
    expect(lines.map((l) => [l.text, l.go])).toEqual([
      ["Opening chores: 1 of 2 done.", "floor"],
      ["2 things are handed to you.", "tracker"],
      ["Mablung needs cover: Cover for Farmer Maggot at 4:20.", "help"],
      ["3 sessions today. The first is at 10:00 AM with Odo Proudfoot.", null],
    ]);
  });

  it("says nothing it can't stand behind: no chores, nothing handed, no covers, no sessions, no lines", () => {
    expect(openingLines({ now: nowContext([], at("07:00"), TODAY), rows: [], requests: [], me, handed: 0 })).toEqual([]);
  });

  it("leaves out your own cover ask and one a teammate has taken", () => {
    const lines = openingLines({
      now: nowContext([], at("07:00"), TODAY),
      rows: [],
      requests: [ask("mine", { kind: "cover", createdBy: IORETH }), ask("taken", { kind: "cover", createdBy: MABLUNG, claimedBy: BEREGOND })],
      me,
      handed: 0,
    });
    expect(lines).toEqual([]);
  });
});

describe("Close out", () => {
  it("lists what is still open on today's list, each with the way to hand it on", () => {
    const chore = template("closing-wipe", { title: "Lumbar Extension wipe" });
    const t = trackerOf({
      rows: [
        row(personal("sign-card", { title: "Sign the birthday card", recurrence: { type: "once", onDate: TODAY } }), undefined),
        row(personal("water", { title: "Water the plants" }), undefined),
        row(chore, "lu", "open", { machineName: "Lumbar Extension", instance: { assignedTo: IORETH, assignedBy: GLORFINDEL } as never }),
      ],
      requests: [
        ask("report", { title: "Finish Hugo's report", createdBy: BEREGOND, forId: IORETH.id }),
        ask("friday", { title: "Order grip covers", createdBy: BEREGOND, forId: IORETH.id, dueOn: "2026-10-02" }),
        ask("pin", { title: "Spare seat pin", claimedBy: IORETH }),
      ],
      jobs: [
        job("cards", { title: "Birthday cards", assignees: [IORETH], assigneeIds: [IORETH.id], createdBy: GLORFINDEL, dueOn: TODAY }),
        job("mirrors", { title: "Mirrors", assignees: [IORETH], assigneeIds: [IORETH.id], createdBy: IORETH }),
      ],
    });
    expect(closeoutItems(t, TODAY).map((i) => [i.kind, i.title, i.kind === "todo" ? i.once : undefined])).toEqual([
      ["handed-ask", "Finish Hugo's report", undefined],
      ["chore", "Lumbar Extension wipe: Lumbar Extension", undefined],
      ["job", "Birthday cards", undefined],
      ["taken-ask", "Spare seat pin", undefined],
      ["todo", "Sign the birthday card", true],
      ["todo", "Water the plants", false],
    ]);
  });

  it("drafts the day in facts, oldest first, three named", () => {
    const ms = (hhmm: string) => new Date(`${TODAY}T${hhmm}:00-04:00`).getTime();
    const draft = dayDraft({
      now: nowContext(day, at("16:10"), TODAY),
      done: [
        { key: "a", at: ms("14:09"), what: "Pullover seat height", where: "Asks" },
        { key: "b", at: ms("12:52"), what: "Filed Belladonna's note", where: "Your list" },
        { key: "c", at: ms("13:30"), what: "Wipe-down round: Leg Press", where: "Floor" },
        { key: "d", at: ms("15:00"), what: "Towels", where: "Team jobs" },
      ],
    });
    expect(draft).toEqual([
      "Monday, September 28.",
      "3 sessions on your schedule today, the last ending at 4:00 PM.",
      "You finished 4 things in Journey: Filed Belladonna's note at 12:52 PM, Wipe-down round: Leg Press at 1:30 PM, Pullover seat height at 2:09 PM and 1 more.",
    ]);
  });

  it("leaves a fact out rather than saying none", () => {
    expect(dayDraft({ now: nowContext([], at("16:10"), TODAY), done: [] })).toEqual(["Monday, September 28."]);
  });
});

describe("Got it", () => {
  beforeEach(() => resetShiftCards());

  it("folds a card for the day on this iPad, and a sign-out forgets it", () => {
    foldShiftCard("s1", TODAY, "opening", at("09:12"));
    expect(foldedAt("s1", TODAY, "opening")).toBe(at("09:12"));
    expect(foldedAt("s1", TODAY, "closeout")).toBeNull();
    expect(foldedAt("s1", "2026-09-29", "opening")).toBeNull();
    unfoldShiftCard("s1", TODAY, "opening");
    expect(foldedAt("s1", TODAY, "opening")).toBeNull();
    foldShiftCard("s1", TODAY, "closeout", at("16:05"));
    forgetPersonalMemory();
    expect(foldedAt("s1", TODAY, "closeout")).toBeNull();
  });
});
