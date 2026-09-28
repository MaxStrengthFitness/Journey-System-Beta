import { describe, expect, it } from "vitest";
import type { Studio } from "../../../types";
import type { ReportView } from "../../admin/bugs/reportView";
import {
  hashText,
  isMarkable,
  itemKey,
  kindOfKey,
  markWords,
  snoozeUntil,
  sortNeeds,
  staleMarkKeys,
  toHomeMark,
  type HomeMark,
} from "./home-marks";
import { needItems, type NeedInputs, type NeedItem } from "./needs";

const need = (id: string, condition: string, say = `${id} needs you.`): NeedItem => ({
  id,
  kind: id,
  tone: "live",
  say,
  proof: "Proof.",
  door: { label: "Open", page: "home" },
  clears: "Clears itself.",
  condition,
});
const mark = (key: string, over: Partial<HomeMark> = {}): HomeMark => ({
  key,
  state: "taken",
  byUid: "u",
  byName: "Faramir",
  until: null,
  reason: null,
  at: 1,
  ...over,
});

describe("a mark's key is the condition", () => {
  it("keeps the same key while the same thing needs doing, and a new one when it changes", () => {
    expect(itemKey(need("bugs", "b1,b2"))).toBe(itemKey(need("bugs", "b1,b2")));
    expect(itemKey(need("bugs", "b1,b2"))).not.toBe(itemKey(need("bugs", "b1,b2,b3")));
    expect(itemKey(need("sync-failing", "strongsville"))).toMatch(/^sync-failing--[0-9a-z]+$/);
    expect(kindOfKey(itemKey(need("sync-failing", "x")))).toBe("sync-failing");
    expect(hashText("")).toBe(hashText(""));
  });

  it("gives each Home item its condition, so a new bug report is a new condition", () => {
    const report = (id: string): ReportView => ({ id, status: "open", createdAt: 1, description: "x", reporter: "Ioreth" }) as ReportView;
    const input = (reports: ReportView[]): NeedInputs => ({
      studios: [] as Studio[],
      networks: [],
      sync: [],
      limbo: { state: "ok", entries: [] },
      bugs: { state: "ok", reports },
      offers: { state: "ok", pending: [] },
      now: 0,
    });
    const before = needItems(input([report("b2"), report("b1")])).items[0];
    const after = needItems(input([report("b1"), report("b2"), report("b3")])).items[0];
    expect(before.condition).toBe("b1,b2");
    expect(itemKey(before)).not.toBe(itemKey(after));
  });

  it("never marks Couldn't check", () => {
    expect(isMarkable(need("unknown", "Limbo"))).toBe(false);
    expect(isMarkable(need("limbo", "l1"))).toBe(true);
  });
});

describe("what Home shows, and what is set aside", () => {
  const items = [need("sync-failing", "strongsville"), need("limbo", "l1,l2"), need("bugs", "b1"), need("unknown", "Limbo")];
  const key = (i: number) => itemKey(items[i]);

  it("keeps a taken item on Home with who took it, and sets aside the snoozed and the dismissed", () => {
    const marks = {
      [key(0)]: mark(key(0), { state: "taken", byName: "Faramir" }),
      [key(1)]: mark(key(1), { state: "snoozed", until: "2026-09-29" }),
      [key(2)]: mark(key(2), { state: "dismissed", reason: "Already handled" }),
    };
    const { shown, setAside } = sortNeeds(items, marks, "2026-09-28");
    expect(shown.map((n) => [n.item.id, n.mark?.state ?? null])).toEqual([
      ["sync-failing", "taken"],
      ["unknown", null],
    ]);
    expect(setAside.map((n) => n.item.id)).toEqual(["limbo", "bugs"]);
  });

  it("brings a snoozed item back when its day comes", () => {
    const marks = { [key(1)]: mark(key(1), { state: "snoozed", until: "2026-09-29" }) };
    expect(sortNeeds(items, marks, "2026-09-29").shown.map((n) => n.item.id)).toContain("limbo");
    expect(sortNeeds(items, marks, "2026-09-29").shown.find((n) => n.item.id === "limbo")!.mark).toBeNull();
  });

  it("brings an item back when its condition changes: the mark was for the old one", () => {
    const marks = { [key(2)]: mark(key(2), { state: "dismissed", reason: "Not a problem" }) };
    const changed = [need("bugs", "b1,b4")];
    expect(sortNeeds(changed, marks, "2026-09-28").shown.map((n) => n.item.id)).toEqual(["bugs"]);
  });
});

describe("marks whose condition has ended", () => {
  it("are removed once every read behind that kind has answered, and never before", () => {
    const live = need("bugs", "b1");
    const marks = {
      [itemKey(live)]: mark(itemKey(live)),
      "bugs--old": mark("bugs--old", { state: "dismissed", reason: "Already handled" }),
      "limbo--gone": mark("limbo--gone"),
      [itemKey(need("offers", "o1"))]: mark(itemKey(need("offers", "o1")), { state: "snoozed", until: "2026-09-28" }),
    };
    const settled = new Set(["bugs", "offers"]);
    // Limbo couldn't be read: its mark stays.
    expect(staleMarkKeys(marks, [live, need("offers", "o1")], settled, "2026-09-28").sort()).toEqual(["bugs--old", itemKey(need("offers", "o1"))].sort());
  });
});

describe("a mark as stored and as said", () => {
  it("reads a stored mark, and turns down a snooze with no day", () => {
    expect(toHomeMark("bugs--a", { state: "snoozed", by: { uid: "u", name: "Faramir" }, until: "2026-10-05", at: { toMillis: () => 5 } })).toEqual({
      key: "bugs--a",
      state: "snoozed",
      byUid: "u",
      byName: "Faramir",
      until: "2026-10-05",
      reason: null,
      at: 5,
    });
    expect(toHomeMark("bugs--a", { state: "snoozed", by: { uid: "u", name: "Faramir" } })).toBeNull();
    expect(toHomeMark("bugs--a", { state: "forgotten" })).toBeNull();
  });

  it("says it in words, and snoozes to tomorrow or a week", () => {
    expect(markWords(mark("k", { state: "taken", byName: "Faramir" }))).toBe("Taken by Faramir");
    expect(markWords(mark("k", { state: "snoozed", until: "2026-10-05" }))).toBe("Snoozed until Mon, Oct 5, 2026 by Faramir");
    expect(markWords(mark("k", { state: "dismissed", reason: "Someone else has it" }))).toBe("Dismissed by Faramir: Someone else has it");
    expect(snoozeUntil("2026-09-28", "tomorrow")).toBe("2026-09-29");
    expect(snoozeUntil("2026-09-28", "week")).toBe("2026-10-05");
  });
});
