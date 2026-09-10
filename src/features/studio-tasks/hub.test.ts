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
  mineRows,
  shiftGroupCredit,
  shiftGroups,
  shiftTotals,
  topicCounts,
  topicOf,
} from "./board";
import {
  initiativeProgress,
  myShare,
  studioRoster,
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
import type { PlannedInstance, TaskRow, TaskTemplate } from "./types";
import { addDays, repeatPlanForward } from "./recurrence";
import { outcomeMessage } from "./resolve-outcome";

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

/* ------------------------------------------------------------------ */

describe("outcomeMessage", () => {
  it("names which half failed rather than saying something went wrong", () => {
    // A trainer told only "that failed" resolves the same request twice.
    const msg = outcomeMessage({ kind: "resolved-playbook-failed", error: new Error("x") });
    expect(msg.tone).toBe("warning");
    expect(msg.text.includes("Resolved")).toBe(true);
    expect(msg.text.includes("playbook entry did not save")).toBe(true);
  });

  it("is quiet about the playbook when nothing was kept", () => {
    expect(outcomeMessage({ kind: "resolved" })).toEqual({
      tone: "success",
      text: "Resolved.",
    });
  });

  it("confirms both halves when both landed", () => {
    const msg = outcomeMessage({ kind: "resolved-and-kept", entryId: "p1" });
    expect(msg.tone).toBe("success");
    expect(msg.text.includes("playbook")).toBe(true);
  });
});

/* ------------------------------------------------------------------ */

describe("studioRoster", () => {
  const trainers = [
    { id: "t1", fullName: "Dana Reyes", primaryHomeStudioId: "s1" },
    { id: "t2", fullName: "Marcus Hall", primaryHomeStudioId: "s1" },
    // Covers shifts here but belongs to s2.
    {
      id: "t3",
      fullName: "Guest Trainer",
      primaryHomeStudioId: "s2",
      accessibleStudioIds: ["s1", "s2"],
    },
  ];

  it("counts only the studio's own team, not everyone with access", () => {
    // The whole point: a guest in the denominator makes a finished studio
    // read as failing.
    const roster = studioRoster(trainers, "s1");
    expect(roster.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("sorts by name so the roll-up does not reshuffle between renders", () => {
    expect(studioRoster(trainers, "s1").map((t) => t.name)).toEqual([
      "Dana Reyes",
      "Marcus Hall",
    ]);
  });

  it("drops deactivated and superseded profiles", () => {
    // A placeholder nobody has claimed can never submit, so counting it
    // guarantees the initiative never reads as complete.
    const roster = studioRoster(
      [
        ...trainers,
        { id: "t4", fullName: "Left In June", primaryHomeStudioId: "s1", isActive: false },
        {
          id: "t5",
          fullName: "Old Doc",
          primaryHomeStudioId: "s1",
          supersededByUid: "t1",
        },
      ],
      "s1",
    );
    expect(roster.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it("is empty with no active studio rather than counting everybody", () => {
    expect(studioRoster(trainers, null)).toEqual([]);
  });

  it("names an unnamed trainer rather than rendering a blank row", () => {
    expect(
      studioRoster([{ id: "t9", fullName: "  ", primaryHomeStudioId: "s1" }], "s1"),
    ).toEqual([{ id: "t9", name: "A trainer" }]);
  });
});

describe("the roll-up's denominator", () => {
  const roster = [
    { id: "t1", name: "Dana" },
    { id: "t2", name: "Marcus" },
  ];
  const target = { perTrainer: 5 };

  it("counts trainers who MET the target, not entries logged", () => {
    // Nine trainers doing one each is not most of the way there.
    const p = initiativeProgress(
      [
        { trainerId: "t1", trainerName: "Dana", count: 1, entries: [] },
        { trainerId: "t2", trainerName: "Marcus", count: 1, entries: [] },
      ],
      roster,
      target,
    );
    expect(p.met).toBe(0);
    expect(p.totalEntries).toBe(2);
    expect(p.ratio).toBe(0);
  });

  it("keeps a guest's work in the total but not in the denominator", () => {
    const p = initiativeProgress(
      [
        {
          trainerId: "guest",
          trainerName: "Visiting Trainer",
          count: 5,
          entries: [],
        },
      ],
      roster,
      target,
    );
    // Three rows: both roster trainers plus the guest who actually did it.
    expect(p.perTrainer).toHaveLength(3);
    expect(p.totalEntries).toBe(5);
    expect(p.met).toBe(1);
  });

  it("never divides by zero when the roster has not loaded", () => {
    const p = initiativeProgress([], [], target);
    expect(p.ratio).toBe(0);
    expect(p.expected).toBe(0);
  });
});


/* ------------------------------------------------------------------ *
 * WHO — attribution on the shift strip (Sep 2026)
 *
 * The studio's shared list gave no attribution at all: completedBy was
 * written on every tick and rendered only in the manager's panel, and
 * toggleClaim was implemented with zero call sites. These lock the rules
 * down, because "who did this" is the part people will argue about.
 * ------------------------------------------------------------------ */

const ME = { id: "me", name: "Me" };
const SARAH = { id: "t2", name: "Sarah" };
const PRIYA = { id: "t3", name: "Priya" };

function machineRow(
  n: number,
  over: {
    status?: "open" | "done" | "skipped";
    claimedBy?: { id: string; name: string } | null;
    completedBy?: { id: string; name: string } | null;
    assignedTo?: { id: string; name: string } | null;
    scope?: "studio" | "personal";
    templateId?: string;
  } = {},
): TaskRow {
  const {
    status = "open",
    claimedBy,
    completedBy,
    assignedTo,
    scope,
    templateId,
  } = over;
  return row({
    id: `i${n}`,
    templateId: templateId ?? "tpl1",
    machineId: `m${n}`,
    status,
    template: (scope ? { scope, ownerId: "me" } : {}) as never,
    instance: {
      id: `i${n}`,
      status,
      claimedBy: claimedBy ?? null,
      completedBy: completedBy ?? null,
      assignedTo: assignedTo ?? null,
    } as never,
  });
}

describe("shift attribution", () => {
  it("names the one person on a group", () => {
    const [g] = shiftGroups([
      machineRow(1, { claimedBy: SARAH }),
      machineRow(2, { claimedBy: SARAH }),
      machineRow(3),
    ]);
    expect(g.claimedBy).toEqual(SARAH);
    expect(g.claimedCount).toBe(2);
    expect(shiftGroupCredit(g)).toBe("Sarah is on it");
  });

  /* Two names will not fit a 52px row without truncating one of them, and
     truncating a person's name is worse than counting them. */
  it("counts rather than names when several people have claimed", () => {
    const [g] = shiftGroups([
      machineRow(1, { claimedBy: SARAH }),
      machineRow(2, { claimedBy: PRIYA }),
    ]);
    expect(g.claimedBy).toBeNull();
    expect(shiftGroupCredit(g)).toBe("2 claimed");
  });

  /* A claim has done its job once the row is closed. "Sarah's on it" beside a
     finished group is noise that outlives its own meaning. */
  it("stops counting a claim once the row is done", () => {
    const [g] = shiftGroups([
      machineRow(1, { status: "done", claimedBy: SARAH, completedBy: SARAH }),
    ]);
    expect(g.claimedCount).toBe(0);
    expect(g.claimedBy).toBeNull();
    expect(shiftGroupCredit(g)).toBe("Sarah closed it");
  });

  it("credits the several people who shared a group", () => {
    const [g] = shiftGroups([
      machineRow(1, { status: "done", completedBy: SARAH }),
      machineRow(2, { status: "done", completedBy: PRIYA }),
    ]);
    expect(g.completedBy).toBeNull();
    expect(g.finishers).toHaveLength(2);
    expect(shiftGroupCredit(g)).toBe("2 people closed it");
  });

  it("says nothing when there is nothing to say", () => {
    const [g] = shiftGroups([machineRow(1), machineRow(2)]);
    expect(shiftGroupCredit(g)).toBeNull();
  });

  it("ignores an actor with no id", () => {
    const [g] = shiftGroups([
      machineRow(1, { claimedBy: { id: "", name: "Ghost" } }),
    ]);
    expect(g.claimedBy).toBeNull();
    expect(g.claimedCount).toBe(0);
  });
});

describe("shift tiers", () => {
  /* The worst possible bug in this file: a trainer ticking what they think is
     a private note and telling eight colleagues they cleaned the floor. */
  it("never merges a personal group into a studio one", () => {
    const groups = shiftGroups([
      machineRow(1, { templateId: "same", scope: "studio" }),
      machineRow(2, { templateId: "same", scope: "personal" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.scope).sort()).toEqual(["personal", "studio"]);
  });

  it("marks a studio group as studio by default", () => {
    const [g] = shiftGroups([machineRow(1)]);
    expect(g.scope).toBe("studio");
  });
});

describe("mine", () => {
  it("is false with nobody signed in", () => {
    const [g] = shiftGroups([machineRow(1, { claimedBy: ME })]);
    expect(g.mine).toBe(false);
  });

  it("is true when you claimed something in it", () => {
    const [g] = shiftGroups([machineRow(1, { claimedBy: ME })], undefined, {
      trainerId: "me",
    });
    expect(g.mine).toBe(true);
  });

  it("is true when you closed something in it", () => {
    const [g] = shiftGroups(
      [machineRow(1, { status: "done", completedBy: ME })],
      undefined,
      { trainerId: "me" },
    );
    expect(g.mine).toBe(true);
  });

  it("is false when it is only Sarah's", () => {
    const [g] = shiftGroups([machineRow(1, { claimedBy: SARAH })], undefined, {
      trainerId: "me",
    });
    expect(g.mine).toBe(false);
  });

  it("is always true for a personal task", () => {
    const [g] = shiftGroups([machineRow(1, { scope: "personal" })], undefined, {
      trainerId: "me",
    });
    expect(g.mine).toBe(true);
  });
});

describe("mineRows", () => {
  const rows = [
    machineRow(1, { claimedBy: ME }),
    machineRow(2, { status: "done", completedBy: ME }),
    machineRow(3, { claimedBy: SARAH }),
    machineRow(4),
    machineRow(5, { scope: "personal" }),
  ];

  /* Filtered per ROW, not per group: on a nineteen-machine wipe-down where
     you claimed three, Mine shows three of three. The denominator changing is
     the point -- it is a different question. */
  it("keeps only the rows you have a stake in", () => {
    expect(mineRows(rows, "me").map((r) => r.id)).toEqual([
      "i1",
      "i2",
      "i5",
    ]);
  });

  it("returns nothing rather than everything when nobody is signed in", () => {
    expect(mineRows(rows, null)).toEqual([]);
  });

  /* A row Sarah closed is hers, not yours, even though you can see it. */
  it("does not claim someone else's finished work", () => {
    const theirs = [machineRow(9, { status: "done", completedBy: SARAH })];
    expect(mineRows(theirs, "me")).toEqual([]);
  });

  it("still reports honest totals for the slice it returns", () => {
    const groups = shiftGroups(mineRows(rows, "me"), undefined, {
      trainerId: "me",
    });
    expect(shiftTotals(groups)).toEqual({ done: 1, total: 3, outstanding: 2 });
  });
});


/* ------------------------------------------------------------------ *
 * ASSIGNMENT (Sep 2026)
 *
 * Head trainers can put a name on work. It is NOT a lock and it lives on the
 * instance so it expires with the day — the template's old assigneeTrainerId
 * was deleted rather than wired, precisely because a permanent name goes
 * stale silently.
 * ------------------------------------------------------------------ */

describe("shift assignment", () => {
  it("names the person a head trainer put on it", () => {
    const [g] = shiftGroups([
      machineRow(1, { assignedTo: SARAH }),
      machineRow(2, { assignedTo: SARAH }),
    ]);
    expect(g.assignedTo).toEqual(SARAH);
    expect(shiftGroupCredit(g)).toBe("Sarah's");
  });

  /* Assigning part of a group is possible; picking one of two names to show
     would be worse than showing none. */
  it("reports nobody when a group is assigned to two people", () => {
    const [g] = shiftGroups([
      machineRow(1, { assignedTo: SARAH }),
      machineRow(2, { assignedTo: PRIYA }),
    ]);
    expect(g.assignedTo).toBeNull();
  });

  it("ignores an assignment on a row that is already done", () => {
    const [g] = shiftGroups([
      machineRow(1, { status: "done", assignedTo: SARAH, completedBy: SARAH }),
    ]);
    expect(g.assignedTo).toBeNull();
  });

  /* Marcus was asked, Sarah picked it up. Both are true and both are useful,
     so both are said. */
  it("says the assignee AND the claimer when they differ", () => {
    const [g] = shiftGroups([
      machineRow(1, { assignedTo: SARAH, claimedBy: PRIYA }),
    ]);
    expect(shiftGroupCredit(g)).toBe("Sarah's — Priya is on it");
  });

  it("does not repeat one person as two facts", () => {
    const [g] = shiftGroups([
      machineRow(1, { assignedTo: SARAH, claimedBy: SARAH }),
    ]);
    expect(shiftGroupCredit(g)).toBe("Sarah's");
  });

  it("outranks a bare claim", () => {
    const [g] = shiftGroups([
      machineRow(1, { assignedTo: SARAH }),
      machineRow(2, { claimedBy: PRIYA }),
    ]);
    // Not every open row agrees on an assignee, so the group names nobody --
    // and falls back to the claim rather than inventing one.
    expect(g.assignedTo).toBeNull();
    expect(shiftGroupCredit(g)).toBe("Priya is on it");
  });

  it("counts as yours, and as Mine", () => {
    const [g] = shiftGroups([machineRow(1, { assignedTo: ME })], undefined, {
      trainerId: "me",
    });
    expect(g.mine).toBe(true);
    expect(mineRows([machineRow(1, { assignedTo: ME })], "me")).toHaveLength(1);
  });

  it("stops being yours once it is closed", () => {
    const done = [
      machineRow(1, { status: "done", assignedTo: ME, completedBy: SARAH }),
    ];
    expect(mineRows(done, "me")).toEqual([]);
  });
});

describe("addDays", () => {
  it("rolls a month end", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("rolls a year end", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("pads single digits", () => {
    expect(addDays("2026-09-08", 1)).toBe("2026-09-09");
  });

  it("goes backwards too", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });
});

describe("repeatPlanForward", () => {
  const planned: PlannedInstance[] = [
    {
      id: "tpl1__2026-09-09__pm__m1",
      templateId: "tpl1",
      localDate: "2026-09-09",
      shift: "pm",
      machineId: "m1",
      title: "Closing",
      category: "cleaning",
      kind: "machine",
    },
  ];
  const daily = {
    id: "tpl1",
    active: true,
    recurrence: { type: "daily" },
  } as unknown as TaskTemplate;
  // 2026-09-09 is a Wednesday; 3 = Wednesday under Date#getDay.
  const weekly = {
    id: "tpl1",
    active: true,
    recurrence: { type: "weekly", daysOfWeek: [3] },
  } as unknown as TaskTemplate;

  it("returns today only for one day", () => {
    const out = repeatPlanForward(planned, daily, "2026-09-09", 1);
    expect(out).toHaveLength(1);
    expect(out[0].localDate).toBe("2026-09-09");
  });

  it("re-derives the id for each new date", () => {
    const out = repeatPlanForward(planned, daily, "2026-09-09", 2);
    expect(out.map((p) => p.id)).toEqual([
      "tpl1__2026-09-09__pm__m1",
      "tpl1__2026-09-10__pm__m1",
    ]);
  });

  /* Days count calendar days, not occurrences -- "this week" on a Wednesdays
     template is the Wednesdays inside it. */
  it("skips days the template is not due", () => {
    const out = repeatPlanForward(planned, weekly, "2026-09-09", 7);
    expect(out.map((p) => p.localDate)).toEqual(["2026-09-09"]);
  });

  it("covers two occurrences over a fortnight", () => {
    const out = repeatPlanForward(planned, weekly, "2026-09-09", 14);
    expect(out.map((p) => p.localDate)).toEqual(["2026-09-09", "2026-09-16"]);
  });

  it("returns nothing for no rows", () => {
    expect(repeatPlanForward([], daily, "2026-09-09", 7)).toEqual([]);
  });

  it("never returns fewer than one day's worth for a due template", () => {
    expect(repeatPlanForward(planned, daily, "2026-09-09", 0)).toHaveLength(1);
  });

  /* An inactive template is due on no day at all, so a head trainer cannot
     assign work that will never be generated. */
  it("returns nothing for a retired template", () => {
    const retired = { ...daily, active: false } as TaskTemplate;
    expect(repeatPlanForward(planned, retired, "2026-09-09", 7)).toEqual([]);
  });
});
