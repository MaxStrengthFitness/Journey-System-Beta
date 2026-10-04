import { describe, expect, it } from "vitest";
import { BEREGOND, GLORFINDEL, IORETH, MABLUNG, TODAY, ask, job, row, template } from "./fixtures";
import { boardCards, cardsByColumn, compareCards, partCount, partNow, waitingIn, waitingWords, type CardsInput } from "./cards";
import type { Client } from "../../../types";

const NOW = new Date(`${TODAY}T13:05:00-04:00`).getTime();
const ts = (iso: string) => ({ toMillis: () => new Date(iso).getTime() });

const wipe = template("wipe", { title: "Wipe down all machines", estMinutes: 2 });
const lights = template("lights", { title: "Lights and music", kind: "facility", category: "cleaning", target: { kind: "facility" } });
const brief = template("brief", { title: "Read today's briefings", kind: "facility", category: "front-desk", target: { kind: "facility" } });
const report = template("report", {
  kind: "client",
  title: "Progress report",
  category: "clients",
  target: { kind: "client", clientId: "hugo", action: "progress-report" } as never,
});

const at = (shift: "am" | "pm" | "any") => (r: ReturnType<typeof row>) => ({ ...r, id: r.id.replace("__any", `__${shift}`), shift });

const input = (over: Partial<CardsInput> = {}): CardsInput => ({
  rows: [],
  requests: [],
  resolved: [],
  jobs: [],
  clients: [],
  studioId: "s1",
  uid: IORETH.id,
  trainerId: IORETH.id,
  todayKey: TODAY,
  phase: "mid",
  nowMs: NOW,
  ...over,
});

const one = (i: CardsInput, id: string) => {
  const c = boardCards(i).find((x) => x.id === id);
  if (!c) throw new Error(`no card ${id}: ${boardCards(i).map((x) => x.id).join(", ")}`);
  return c;
};

describe("the board's cards", () => {
  it("puts a chore in the part of the day its shift says, and machines and cleaning on the Floor", () => {
    const i = input({
      rows: [at("am")(row(lights, undefined)), row(wipe, "lp"), row(wipe, "cp"), at("pm")(row(wipe, "lp")), at("am")(row(brief, undefined))],
    });
    const cards = boardCards(i);
    expect(cards.map((c) => [c.id, c.part, c.column])).toEqual(
      expect.arrayContaining([
        ["group:studio:lights:am", "open", "floor"],
        ["group:studio:wipe:any", "day", "floor"],
        ["group:studio:wipe:pm", "close", "floor"],
        ["group:studio:brief:am", "open", "desk"],
      ]),
    );
  });

  it("says a machine chore's parts, and who did it and when once it's done", () => {
    const done = (m: string, by: { id: string; name: string }, iso: string) =>
      row(wipe, m, "done", { instance: { status: "done", completedBy: by, completedAt: ts(iso) } as never });
    const started = input({ rows: [done("lp", BEREGOND, `${TODAY}T08:00:00-04:00`), row(wipe, "cp"), row(wipe, "cr")] });
    expect(one(started, "group:studio:wipe:any")).toMatchObject({ state: "started", line: "1 of 3 done", parts: { done: 1, total: 3 }, box: "done", estMinutes: 4 });

    const finished = input({ rows: [done("lp", BEREGOND, `${TODAY}T08:00:00-04:00`), done("cp", BEREGOND, `${TODAY}T08:05:00-04:00`)] });
    expect(one(finished, "group:studio:wipe:any")).toMatchObject({ state: "done", line: "Beregond · 8:05 AM", estMinutes: null });

    const mine = input({ rows: [done("lp", IORETH, `${TODAY}T11:20:00-04:00`)] });
    expect(one(mine, "group:studio:wipe:any").line).toBe("You · 11:20 AM");
  });

  it("says who's on a chore, and keeps Close's cards 'not yet' until closing", () => {
    const claimed = row(wipe, "lp", "open", { instance: { status: "open", claimedBy: MABLUNG } as never });
    expect(one(input({ rows: [claimed] }), "group:studio:wipe:any")).toMatchObject({ state: "taken", line: "Mablung is on it" });
    const close = input({ rows: [at("pm")(row(wipe, "lp"))] });
    expect(one(close, "group:studio:wipe:pm").state).toBe("later");
    expect(one({ ...close, phase: "closing" }, "group:studio:wipe:pm").state).toBe("todo");
  });

  it("files a client task under Clients with her name, and its box finishes it", () => {
    const r = row(report, undefined, "open", { clientName: "Hugo Bracegirdle", kind: "client" });
    expect(one(input({ rows: [r] }), `row:${r.id}`)).toMatchObject({ column: "clients", title: "Progress report: Hugo Bracegirdle", box: "done", line: "Anyone" });
  });

  it("makes a teammate's cover ask amber until someone has it, and its box opens it", () => {
    const cover = ask("cover", { kind: "cover", title: "Cover Tue 6:00 PM?", createdBy: MABLUNG, createdAt: ts(`${TODAY}T11:05:00-04:00`) });
    expect(one(input({ requests: [cover] }), "ask:cover")).toMatchObject({ part: "day", column: "team", glyph: "cover", state: "waiting", line: "Mablung · waiting 2 h", box: "open" });
    const taken = { ...cover, claimedBy: BEREGOND };
    expect(one(input({ requests: [taken] }), "ask:cover")).toMatchObject({ state: "taken", line: "Beregond is on it" });
  });

  it("puts an ask for a later day under This week, and one about a client under Clients", () => {
    const later = ask("later", { title: "Order towels", dueOn: "2026-10-01" });
    const about = ask("about", { kind: "question", title: "Pullover elbows?", clientId: "hugo", createdBy: BEREGOND });
    const cards = boardCards(input({ requests: [later, about] }));
    expect(cards.find((c) => c.id === "ask:later")).toMatchObject({ part: "week", column: "team", box: "done" });
    expect(cards.find((c) => c.id === "ask:about")).toMatchObject({ part: "day", column: "clients", glyph: "question", box: "open", line: "From Beregond" });
  });

  it("says an ask handed to you is yours", () => {
    const handed = ask("h", { kind: "handoff", title: "Finish Hugo's report", createdBy: BEREGOND, forId: IORETH.id, forName: IORETH.name });
    expect(one(input({ requests: [handed] }), "ask:h")).toMatchObject({ mine: true, line: "Handed to you by Beregond" });
  });

  it("shows an ask closed today as done, and not one closed yesterday", () => {
    const today = ask("t", { status: "resolved", resolvedBy: BEREGOND, resolvedAt: ts(`${TODAY}T10:00:00-04:00`) } as never);
    const before = ask("y", { status: "resolved", resolvedBy: BEREGOND, resolvedAt: ts("2026-09-27T10:00:00-04:00") } as never);
    const cards = boardCards(input({ resolved: [today, before] }));
    expect(cards.find((c) => c.id === "ask:t")).toMatchObject({ state: "done", line: "Beregond · 10:00 AM" });
    expect(cards.find((c) => c.id === "ask:y")).toBeUndefined();
  });

  it("gives a team job a box that opens it, unless one tap can finish it", () => {
    const parts = job("p", { title: "Restock", parts: { a: { id: "a", label: "Wipes", order: 0, doneBy: MABLUNG }, b: { id: "b", label: "Towels", order: 1, doneBy: null } } as never });
    const simple = job("s", { title: "Mirrors", dueOn: TODAY });
    const noted = job("n", { title: "Check the cables", requiresNote: true, assignees: [BEREGOND], assigneeIds: [BEREGOND.id] });
    const cards = boardCards(input({ jobs: [parts, simple, noted] }));
    expect(cards.find((c) => c.id === "job:p")).toMatchObject({ part: "week", state: "started", line: "1 of 2 done", box: "open", glyph: "job" });
    expect(cards.find((c) => c.id === "job:s")).toMatchObject({ part: "day", state: "todo", box: "done" });
    expect(cards.find((c) => c.id === "job:n")).toMatchObject({ state: "taken", line: "Beregond on it", box: "open" });
  });

  it("puts an initiative under This week on the Team, with no box", () => {
    const lead = ask("i", { kind: "initiative", title: "Ask one client for a referral", createdBy: GLORFINDEL });
    expect(one(input({ requests: [lead] }), "ask:i")).toMatchObject({ part: "week", column: "team", glyph: "lead", box: "none", line: "Everyone · from Glorfindel" });
  });

  it("gives this studio's clients with a renewal talk due a card, by the renewals lane's rule", () => {
    const due = { id: "c1", firstName: "Rosie", lastName: "Cotton", homeStudioId: "s1", renewal: { situation: "on-track", conversationDue: true, sessionsLeft: 5 } } as unknown as Client;
    const elsewhere = { ...due, id: "c2", homeStudioId: "s2" } as Client;
    const notDue = { ...due, id: "c3", renewal: { situation: "on-track", conversationDue: false } } as unknown as Client;
    const cards = boardCards(input({ clients: [due, elsewhere, notDue] }));
    expect(cards.filter((c) => c.source.kind === "renewal").map((c) => [c.title, c.line, c.box])).toEqual([["Renewal talk: Rosie Cotton", "5 sessions left", "none"]]);
  });

  it("orders a cell: someone waiting, yours, the rest, not yet, then done", () => {
    const cards = boardCards(
      input({
        rows: [row(wipe, "lp", "done"), at("pm")(row(lights, undefined))],
        requests: [
          ask("w", { kind: "cover", title: "Cover", createdBy: MABLUNG }),
          ask("m", { title: "Mine", forId: IORETH.id, forName: IORETH.name, createdBy: BEREGOND }),
          ask("o", { title: "Other", createdBy: BEREGOND }),
        ],
      }),
    );
    const team = cards.filter((c) => c.column === "team").map((c) => c.id);
    expect(team).toEqual(["ask:w", "ask:m", "ask:o"]);
    expect([...cards].sort(compareCards).map((c) => c.state).at(-1)).toBe("done");
  });

  it("counts each part and finds who is waiting, for the tabs", () => {
    const cards = boardCards(
      input({ rows: [at("am")(row(lights, undefined, "done")), at("am")(row(brief, undefined))], requests: [ask("w", { kind: "cover", title: "Cover" })] }),
    );
    expect(partCount(cards, "open")).toEqual({ done: 1, total: 2 });
    expect(waitingIn(cards, "day")).toBe(1);
    expect(cardsByColumn(cards, "open").desk.map((c) => c.id)).toEqual(["group:studio:brief:am"]);
  });

  it("opens on the part of the day it is now", () => {
    expect(partNow("opening")).toBe("open");
    expect(partNow("mid")).toBe("day");
    expect(partNow("closing")).toBe("close");
    expect(partNow("closed")).toBe("close");
  });

  it("says how long an ask has waited", () => {
    expect(waitingWords(NOW - 5 * 60_000, NOW)).toBe("waiting 5 min");
    expect(waitingWords(NOW - 3 * 3_600_000, NOW)).toBe("waiting 3 h");
    expect(waitingWords(NOW - 50 * 3_600_000, NOW)).toBe("waiting 2 days");
    expect(waitingWords(null, NOW)).toBe("waiting");
  });
});
