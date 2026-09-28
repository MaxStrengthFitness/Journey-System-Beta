import { describe, expect, it } from "vitest";
import { BEREGOND, GLORFINDEL, IORETH, MABLUNG, TODAY, ask, job, row, template } from "./board/fixtures";
import { buildTracker, isClosingRow, type TrackerInput } from "./tracker";

const personal = (id: string, extra: Parameters<typeof template>[1] = {}) =>
  template(id, { scope: "personal", ownerId: IORETH.id, kind: "facility", target: { kind: "facility" }, category: "ops", title: id, ...extra });

const ts = (iso: string) => ({ toMillis: () => new Date(iso).getTime() });

const input = (over: Partial<TrackerInput> = {}): TrackerInput => ({
  rows: [],
  templates: [],
  requests: [],
  resolved: [],
  jobs: [],
  followUps: [],
  uid: IORETH.id,
  trainerId: IORETH.id,
  todayKey: TODAY,
  closingMin: 16 * 60,
  ...over,
});

describe("the Tracker, by when", () => {
  it("puts work someone else named you on under Handed to you: an ask, a leader's chore, a team job", () => {
    const chore = template("closing-wipe", { title: "Lumbar Extension wipe" });
    const assigned = row(chore, "lu", "open", { instance: { assignedTo: IORETH, assignedBy: GLORFINDEL } as never });
    const t = buildTracker(
      input({
        requests: [
          ask("hugo", { kind: "handoff", title: "Finish Hugo's report", createdBy: BEREGOND, forId: IORETH.id, forName: IORETH.name }),
          ask("other", { forId: MABLUNG.id, forName: MABLUNG.name }),
        ],
        rows: [assigned],
        jobs: [job("cards", { title: "Birthday cards", assignees: [IORETH], assigneeIds: [IORETH.id], createdBy: GLORFINDEL })],
      }),
    );
    expect(t.handed.map((h) => [h.kind, h.key, h.from])).toEqual([
      ["ask", "ask:hugo", BEREGOND.name],
      ["row", `row:${assigned.id}`, GLORFINDEL.name],
      ["job", "job:cards", GLORFINDEL.name],
    ]);
  });

  it("finds your name by the older id as well as the Auth uid", () => {
    const t = buildTracker(input({ uid: "auth-uid", requests: [ask("a", { forId: IORETH.id })] }));
    expect(t.handed).toHaveLength(1);
  });

  it("splits your own to-dos into Now and Closing, and keeps Growth out of Today", () => {
    const morning = row(personal("call-physio", { title: "Call Hugo's physio", timeOfDay: "09:30" }), undefined);
    const untimed = row(personal("towel-order", { title: "Check the towel order" }), undefined);
    const evening = row(personal("sign-card", { title: "Sign the birthday card", timeOfDay: "17:00" }), undefined);
    const pm = { ...row(personal("lock-up", { title: "Lock the side door" }), undefined), shift: "pm" as const };
    const growth = row(personal("neck-module", { title: "Finish the Neck module", category: "growth" }), undefined);
    const done = row(personal("filed", { title: "Filed Belladonna's note" }), undefined, "done");
    const t = buildTracker(input({ rows: [evening, untimed, morning, pm, growth, done] }));
    expect(t.now.map((r) => r.title)).toEqual(["Call Hugo's physio", "Check the towel order"]);
    expect(t.closing.map((r) => r.title)).toEqual(["Sign the birthday card", "Lock the side door"]);
    expect(t.someday.map((r) => r.title)).toEqual(["Finish the Neck module"]);
    expect(t.done.map((d) => [d.what, d.where])).toEqual([["Filed Belladonna's note", "Your list"]]);
  });

  it("sorts what you took on the Board by its day: due today in Now, later in Coming up, no day in Anytime", () => {
    const t = buildTracker(
      input({
        requests: [
          ask("cover", { title: "Cover at 4:20", claimedBy: IORETH, dueOn: TODAY }),
          ask("seat", { title: "Spare seat pin", claimedBy: IORETH }),
          ask("theirs", { title: "Someone else's", claimedBy: MABLUNG }),
        ],
        jobs: [job("mirrors", { title: "Mirrors", assignees: [IORETH], assigneeIds: [IORETH.id], createdBy: IORETH, dueOn: "2026-10-01" })],
      }),
    );
    expect(t.nowTaken.map((x) => x.key)).toEqual(["ask:cover"]);
    expect(t.anytime.map((x) => x.key)).toEqual(["ask:seat"]);
    expect(t.comingTaken.map((x) => x.key)).toEqual(["job:mirrors"]);
    // A job you posted and are on is yours, not handed to you.
    expect(t.handed).toEqual([]);
  });

  it("lists what you finished today, newest first, across your list, the floor, asks and team jobs", () => {
    const wipe = template("wipe", { title: "Wipe-down round" });
    const t = buildTracker(
      input({
        rows: [
          row(wipe, "lp", "done", { machineName: "Leg Press", instance: { status: "done", completedBy: IORETH, completedAt: ts(`${TODAY}T13:52:00-04:00`) } as never }),
          row(wipe, "cp", "done", { machineName: "Chest Press", instance: { status: "done", completedBy: MABLUNG, completedAt: ts(`${TODAY}T13:00:00-04:00`) } as never }),
        ],
        resolved: [
          ask("pin", { title: "Pullover seat height", status: "resolved", resolvedBy: IORETH, resolvedAt: ts(`${TODAY}T14:09:00-04:00`) }),
          ask("old", { title: "Yesterday's", status: "resolved", resolvedBy: IORETH, resolvedAt: ts("2026-09-27T14:09:00-04:00") }),
        ],
        jobs: [job("j", { title: "Towels", status: "done", completedBy: IORETH, closedOn: TODAY, completedAt: ts(`${TODAY}T12:00:00-04:00`) })],
      }),
    );
    expect(t.done.map((d) => [d.what, d.where])).toEqual([
      ["Pullover seat height", "Asks"],
      ["Wipe-down round: Leg Press", "Floor"],
      ["Towels", "Team jobs"],
    ]);
  });

  it("counts each list, Today being everything in its four parts", () => {
    const t = buildTracker(
      input({
        rows: [row(personal("a"), undefined)],
        requests: [ask("h", { forId: IORETH.id })],
        followUps: [{ key: "bday:x", clientId: "x", clientName: "Belladonna Took", kind: "birthday", label: "Birthday in 2 days", daysAway: 2, date: "2026-09-30" }],
      }),
    );
    expect(t.counts).toEqual({ today: 3, coming: 0, anytime: 0, someday: 0, done: 0 });
  });

  it("calls a to-do a closing one by the closing shift or a time from Closing on", () => {
    const r = row(personal("x", { timeOfDay: "15:59" }), undefined);
    expect(isClosingRow(r, 16 * 60)).toBe(false);
    expect(isClosingRow({ ...r, template: { ...r.template, timeOfDay: "16:00" } }, 16 * 60)).toBe(true);
    expect(isClosingRow({ ...r, shift: "pm" }, 16 * 60)).toBe(true);
  });
});
