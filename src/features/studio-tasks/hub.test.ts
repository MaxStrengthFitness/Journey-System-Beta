/**
 * The Studio Hub's judgement calls, as tests.
 *
 * Everything here is a decision someone could reasonably disagree with — which
 * is exactly why it is pinned. The rendering is not tested; the RULES are.
 */
import { describe, it, expect } from "vitest";
import {
  buildBoard,
  daysUntil,
  heatOf,
  shiftGroups,
  shiftTotals,
  topicCounts,
  topicOf,
} from "./board";
import {
  initiativeProgress,
  myShare,
  withEntry,
  withoutEntry,
} from "./initiatives";
import {
  draftFromRequest,
  needsReview,
  searchPlaybook,
  staleness,
  withConfirmation,
  type PlaybookEntry,
} from "./playbook";
import type { TaskRequest } from "./requests";
import type { TaskRow } from "./types";

const TODAY = "2026-09-09";

function req(over: Partial<TaskRequest> = {}): TaskRequest {
  return {
    id: "r1",
    studioId: "s1",
    kind: "question",
    title: "A question",
    status: "open",
    priority: "normal",
    replyCount: 0,
    createdBy: { id: "t1", name: "Trainer One" },
    createdAt: 1,
    ...over,
  } as TaskRequest;
}

function row(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "i1",
    templateId: "tpl1",
    localDate: TODAY,
    shift: "any",
    title: "Wipe down every machine",
    category: "cleaning",
    kind: "machine",
    template: {} as never,
    instance: null,
    status: "open",
    ...over,
  } as TaskRow;
}

/* ------------------------------------------------------------------ */

describe("board topics", () => {
  it("files a request naming a client under clients even when it also names a machine", () => {
    // The person is why it was posted; the machine is a detail of it.
    const r = req({ clientId: "c1", machineId: "m1" });
    expect(topicOf(r)).toBe("clients");
  });

  it("files a machine-only request under equipment", () => {
    expect(topicOf(req({ machineId: "m1" }))).toBe("equipment");
  });

  it("files an initiative under initiatives regardless of what it links", () => {
    expect(topicOf(req({ kind: "initiative" as never, clientId: "c1" }))).toBe(
      "initiatives",
    );
  });

  it("treats a bare question as someone asking for help", () => {
    expect(topicOf(req({ kind: "question" }))).toBe("help");
  });
});

describe("board heat", () => {
  it("lets time beat claimed priority", () => {
    // Normal priority expiring today outranks urgent with a week to run:
    // one is about to become impossible, the other is not.
    const expiringToday = heatOf(req({ priority: "normal" }), 0);
    const urgentLater = heatOf(req({ priority: "urgent" }), 7);
    expect(expiringToday).toBe("critical");
    expect(urgentLater).toBe("critical"); // urgent is still loud
    expect(heatOf(req({ priority: "normal" }), 7)).toBe("warm");
  });

  it("always treats cover as critical", () => {
    // A client is arriving and nobody is booked to meet them.
    expect(heatOf(req({ kind: "cover", priority: "low" }), 30)).toBe("critical");
  });

  it("cools a claimed request", () => {
    expect(heatOf(req({ claimedBy: { id: "t2", name: "Two" } }), null)).toBe("calm");
  });

  it("settles anything not open", () => {
    expect(heatOf(req({ status: "resolved", kind: "cover" }), 0)).toBe("settled");
  });
});

describe("daysUntil", () => {
  it("counts calendar days without touching the device clock", () => {
    expect(daysUntil("2026-09-09", TODAY)).toBe(0);
    expect(daysUntil("2026-09-10", TODAY)).toBe(1);
    expect(daysUntil("2026-09-08", TODAY)).toBe(-1);
    expect(daysUntil("2026-10-09", TODAY)).toBe(30);
  });

  it("returns null when a request never expires", () => {
    expect(daysUntil(undefined, TODAY)).toBeNull();
  });
});

describe("buildBoard", () => {
  it("puts unclaimed asks above claimed ones at the same heat", () => {
    const claimed = req({ id: "claimed", kind: "help", claimedBy: { id: "t2", name: "Two" } });
    const open = req({ id: "open", kind: "help" });
    const cards = buildBoard([claimed, open], { todayKey: TODAY });
    expect(cards[0].request.id).toBe("open");
  });

  it("hides settled cards by default but can keep them", () => {
    const done = req({ id: "done", status: "resolved" });
    expect(buildBoard([done], { todayKey: TODAY })).toHaveLength(0);
    expect(
      buildBoard([done], { todayKey: TODAY, includeSettled: true }),
    ).toHaveLength(1);
  });

  it("counts a request I claimed as mine, not just one I wrote", () => {
    const mineByClaim = req({
      id: "x",
      createdBy: { id: "other", name: "Other" },
      claimedBy: { id: "me", name: "Me" },
    });
    const cards = buildBoard([mineByClaim], {
      todayKey: TODAY,
      trainerId: "me",
      mineOnly: true,
    });
    expect(cards).toHaveLength(1);
    expect(cards[0].mine).toBe(true);
  });

  it("ranks cover above everything else on the board", () => {
    const cards = buildBoard(
      [req({ id: "q", kind: "question" }), req({ id: "c", kind: "cover" })],
      { todayKey: TODAY },
    );
    expect(cards[0].request.id).toBe("c");
  });
});

describe("topicCounts", () => {
  it("counts only open requests, and totals independently of the buckets", () => {
    const counts = topicCounts([
      req({ id: "a", clientId: "c1" }),
      req({ id: "b", machineId: "m1" }),
      req({ id: "c", status: "resolved", clientId: "c2" }),
    ]);
    expect(counts.all).toBe(2);
    expect(counts.clients).toBe(1);
    expect(counts.equipment).toBe(1);
  });
});

/* ------------------------------------------------------------------ */

describe("shiftGroups", () => {
  it("collapses a 19-machine chore into one group", () => {
    const rows = Array.from({ length: 19 }, (_, i) =>
      row({ id: `i${i}`, machineId: `m${i}` }),
    );
    const groups = shiftGroups(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(19);
    expect(groups[0].expandable).toBe(true);
  });

  it("keeps am and pm as separate obligations against one template", () => {
    // Opening is not satisfied by having closed.
    const groups = shiftGroups([
      row({ id: "a", shift: "am", title: "Walk-through" }),
      row({ id: "b", shift: "pm", title: "Walk-through" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].shift).toBe("am");
  });

  it("counts a skipped row as neither done nor outstanding", () => {
    const groups = shiftGroups([
      row({ id: "a", status: "done" }),
      row({ id: "b", status: "skipped" }),
    ]);
    // A studio that skips the broken leg press should not sit at 1/2 forever.
    expect(groups[0].complete).toBe(true);
    expect(groups[0].done).toBe(1);
  });

  it("sorts incomplete groups ahead of finished ones within a shift", () => {
    const groups = shiftGroups([
      row({ id: "a", templateId: "done-tpl", title: "AAA", status: "done" }),
      row({ id: "b", templateId: "open-tpl", title: "ZZZ", status: "open" }),
    ]);
    expect(groups[0].title).toBe("ZZZ");
  });

  it("totals rows rather than groups", () => {
    const rows = [
      row({ id: "a", machineId: "m1", status: "done" }),
      row({ id: "b", machineId: "m2" }),
      row({ id: "c", templateId: "other", title: "Lobby" }),
    ];
    expect(shiftTotals(shiftGroups(rows))).toEqual({
      done: 1,
      total: 3,
      outstanding: 2,
    });
  });
});

/* ------------------------------------------------------------------ */

describe("initiativeProgress", () => {
  const roster = [
    { id: "t1", name: "One" },
    { id: "t2", name: "Two" },
    { id: "t3", name: "Three" },
  ];

  it("measures trainers who met the target, not entries logged", () => {
    // One trainer doing 15 is not the same studio as three doing 5 each.
    const p = initiativeProgress(
      [
        {
          trainerId: "t1",
          trainerName: "One",
          count: 15,
          entries: [],
        },
      ],
      roster,
      { perTrainer: 5 },
    );
    expect(p.totalEntries).toBe(15);
    expect(p.met).toBe(1);
    expect(p.ratio).toBeCloseTo(1 / 3);
  });

  it("keeps trainers who have not submitted visible", () => {
    // They are the entire question a manager is asking this screen.
    const p = initiativeProgress([], roster, { perTrainer: 5 });
    expect(p.perTrainer).toHaveLength(3);
    expect(p.started).toBe(0);
  });

  it("treats one entry as met when there is no per-trainer number", () => {
    const p = initiativeProgress(
      [{ trainerId: "t1", trainerName: "One", count: 1, entries: [] }],
      roster,
      {},
    );
    expect(p.perTrainer.find((t) => t.trainerId === "t1")?.met).toBe(true);
  });

  it("still counts work by someone who has left the roster", () => {
    const p = initiativeProgress(
      [{ trainerId: "gone", trainerName: "Departed", count: 5, entries: [] }],
      roster,
      { perTrainer: 5 },
    );
    expect(p.totalEntries).toBe(5);
    expect(p.perTrainer).toHaveLength(4);
  });

  it("sorts the people who are behind to the top", () => {
    const p = initiativeProgress(
      [{ trainerId: "t1", trainerName: "One", count: 5, entries: [] }],
      roster,
      { perTrainer: 5 },
    );
    expect(p.perTrainer[0].met).toBe(false);
  });

  it("reports what I still owe", () => {
    const p = initiativeProgress(
      [{ trainerId: "t2", trainerName: "Two", count: 2, entries: [] }],
      roster,
      { perTrainer: 5 },
    );
    expect(myShare(p, "t2")).toEqual({
      count: 2,
      target: 5,
      remaining: 3,
      met: false,
    });
  });
});

describe("submission entries", () => {
  it("ignores a duplicate client so a double tap is not two reports", () => {
    const one = [{ clientId: "c1", clientName: "A" }];
    expect(withEntry(one, { clientId: "c1", clientName: "A" })).toBe(one);
  });

  it("adds and removes", () => {
    const added = withEntry([], { clientId: "c1", clientName: "A" });
    expect(added).toHaveLength(1);
    expect(withoutEntry(added, "c1")).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ */

function entry(over: Partial<PlaybookEntry> = {}): PlaybookEntry {
  return {
    id: "p1",
    studioId: "s1",
    title: "Shoulder pain on compound row",
    situation: "Client reports pinching at the top of the pull.",
    worked: "Narrowed the grip and cut range at the top.",
    machineIds: ["compound-row"],
    tags: ["shoulder"],
    authorId: "t1",
    authorName: "One",
    lastConfirmedOn: TODAY,
    ...over,
  };
}

describe("draftFromRequest", () => {
  it("promotes a resolved request into a draft", () => {
    const d = draftFromRequest({
      id: "r1",
      title: "Shoulder pain on compound row",
      detail: "Pinching at the top",
      resolution: "Narrowed the grip and cut the range at the top.",
      machineId: "compound-row",
    });
    expect(d?.sourceRequestId).toBe("r1");
    expect(d?.machineIds).toEqual(["compound-row"]);
  });

  it("refuses a resolution that taught nothing", () => {
    // Prompting to save "yep" trains people to dismiss the prompt.
    expect(
      draftFromRequest({ id: "r1", title: "t", resolution: "yep" }),
    ).toBeNull();
    expect(draftFromRequest({ id: "r1", title: "t" })).toBeNull();
  });

  it("carries no client reference at all", () => {
    const d = draftFromRequest({
      id: "r1",
      title: "t",
      resolution: "A long enough resolution to keep.",
    });
    expect(Object.keys(d ?? {})).not.toContain("clientId");
  });
});

describe("searchPlaybook", () => {
  const entries = [
    entry({ id: "a", title: "Shoulder pain on compound row" }),
    entry({
      id: "b",
      title: "Knee tracking on the leg press",
      tags: ["knee"],
      machineIds: ["leg-press"],
      situation: "Valgus under load.",
      worked: "Cued the knees out.",
    }),
  ];

  it("requires every word to land somewhere", () => {
    // Otherwise "shoulder press" returns everything that merely says shoulder.
    expect(searchPlaybook(entries, "shoulder compound")).toHaveLength(1);
    expect(searchPlaybook(entries, "shoulder banana")).toHaveLength(0);
  });

  it("weights a title match above a body match", () => {
    const hits = searchPlaybook(entries, "knee");
    expect(hits[0].entry.id).toBe("b");
  });

  it("filters to a machine, for the Catalog's detail pane", () => {
    const hits = searchPlaybook(entries, "", { machineId: "leg-press" });
    expect(hits).toHaveLength(1);
    expect(hits[0].entry.id).toBe("b");
  });

  it("returns everything for an empty term", () => {
    expect(searchPlaybook(entries, "  ")).toHaveLength(2);
  });

  it("hides retired entries unless asked", () => {
    const retired = [entry({ id: "r", retiredAt: 1 })];
    expect(searchPlaybook(retired, "")).toHaveLength(0);
    expect(searchPlaybook(retired, "", { includeRetired: true })).toHaveLength(1);
  });

  it("breaks a tie toward the entry more trainers confirmed", () => {
    const hits = searchPlaybook(
      [
        entry({ id: "solo", title: "Grip" }),
        entry({
          id: "backed",
          title: "Grip",
          confirmations: { t2: { name: "Two", on: TODAY }, t3: { name: "Three", on: TODAY } },
        }),
      ],
      "grip",
    );
    expect(hits[0].entry.id).toBe("backed");
  });
});

describe("staleness", () => {
  it("goes stale after a year without confirmation", () => {
    expect(staleness(entry({ lastConfirmedOn: "2025-01-01" }), TODAY).state).toBe(
      "stale",
    );
    expect(staleness(entry({ lastConfirmedOn: "2026-01-01" }), TODAY).state).toBe(
      "aging",
    );
    expect(staleness(entry(), TODAY).state).toBe("fresh");
  });

  it("confirming is idempotent for the same trainer", () => {
    const first = withConfirmation(entry(), { id: "t2", name: "Two" }, TODAY);
    const second = withConfirmation(
      { ...entry(), ...first },
      { id: "t2", name: "Two" },
      "2026-09-10",
    );
    expect(Object.keys(second.confirmations ?? {})).toEqual(["t2"]);
    expect(second.lastConfirmedOn).toBe("2026-09-10");
  });

  it("nudges only stale, un-retired entries, oldest first", () => {
    const list = [
      entry({ id: "new" }),
      entry({ id: "old", lastConfirmedOn: "2024-01-01" }),
      entry({ id: "older", lastConfirmedOn: "2023-01-01" }),
      entry({ id: "gone", lastConfirmedOn: "2023-01-01", retiredAt: 1 }),
    ];
    expect(needsReview(list, TODAY).map((e) => e.id)).toEqual(["older", "old"]);
  });
});
