import { describe, expect, it } from "vitest";
import { FORD_META, FORD_PILLARS, FORD_PROMPT_WHEN, type FordEntry } from "./types";
import {
  FOLLOW_UP_MAX,
  askNext,
  askNextMeta,
  followUpPatch,
  hasOpenFollowUp,
  normaliseFollowUp,
  openFollowUps,
  promptsFor,
  rotatedPrompt,
} from "./ask-next";
import { pillarPrompt } from "./ui";

const DAY = 86_400_000;
/** 60 consecutive days, so every rotation position is visited many times over. */
const SEEDS = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 8, 1, 12) + i * DAY));

const WORK_PROMPTS = ["How is work treating you?", "Still on the road as much?", "Busy season coming up?"];

describe("FORD_PROMPT_WHEN", () => {
  it("names only prompts FORD_META actually has, verbatim (a drift guard)", () => {
    const all = new Set(FORD_PILLARS.flatMap((p) => FORD_META[p].prompts));
    for (const key of Object.keys(FORD_PROMPT_WHEN)) expect(all.has(key), key).toBe(true);
  });
});

describe("promptsFor", () => {
  it("filters nothing when nothing is known", () => {
    for (const p of FORD_PILLARS) expect(promptsFor(p)).toEqual(FORD_META[p].prompts);
  });

  it("gives a retired client only the retirement question under Occupation", () => {
    expect(promptsFor("occupation", { retired: true })).toEqual(["How is retirement going?"]);
    expect(promptsFor("dreams", { retired: true })).not.toContain("What is on the list for when you retire?");
  });

  it("never asks a working client how retirement is going", () => {
    expect(promptsFor("occupation", { retired: false })).toEqual(WORK_PROMPTS);
    expect(promptsFor("dreams", { retired: false })).toContain("What is on the list for when you retire?");
  });

  it("leaves Family and Recreation alone either way", () => {
    for (const retired of [true, false]) {
      expect(promptsFor("family", { retired })).toEqual(FORD_META.family.prompts);
      expect(promptsFor("recreation", { retired })).toEqual(FORD_META.recreation.prompts);
    }
  });
});

describe("the rotation", () => {
  it("over 60 days, never asks a retired client about work", () => {
    for (const seed of SEEDS) {
      const q = rotatedPrompt("occupation", seed, { retired: true });
      expect(WORK_PROMPTS).not.toContain(q);
      expect(q).toBe("How is retirement going?");
      expect(rotatedPrompt("dreams", seed, { retired: true })).not.toBe("What is on the list for when you retire?");
    }
  });

  it("over 60 days, never asks a working client about retirement", () => {
    for (const seed of SEEDS) {
      expect(rotatedPrompt("occupation", seed, { retired: false })).not.toBe("How is retirement going?");
    }
  });

  it("with no context, is exactly the old day rotation", () => {
    for (const seed of SEEDS) {
      for (const p of FORD_PILLARS) {
        const prompts = FORD_META[p].prompts;
        const day = Math.floor(seed.getTime() / DAY);
        expect(pillarPrompt(p, seed)).toBe(prompts[day % prompts.length]);
      }
    }
  });

  it("pillarPrompt takes the same context", () => {
    expect(pillarPrompt("occupation", SEEDS[0], { retired: true })).toBe("How is retirement going?");
  });
});

describe("askNext", () => {
  it("says why when the work questions were skipped", () => {
    const ask = askNext("occupation", { retired: true, seed: SEEDS[3] });
    expect(ask).toEqual({ kind: "prompt", question: "How is retirement going?", why: "retired" });
    expect(askNextMeta(ask, "occupation")).toBe("The work questions are skipped: marked retired");
    expect(askNextMeta(ask, "occupation", { subject: "she", plural: false })).toBe(
      "The work questions are skipped because she is retired",
    );
    expect(askNextMeta(ask, "occupation", { subject: "they", plural: true })).toBe(
      "The work questions are skipped because they are retired",
    );
  });

  it("is one of the pillar's questions otherwise", () => {
    const ask = askNext("family", { retired: false, seed: SEEDS[0] });
    expect(FORD_META.family.prompts).toContain(ask.question);
    expect(ask).toMatchObject({ kind: "prompt", why: "pillar" });
    expect(askNextMeta(ask, "family")).toBe("One of FORD’s Family questions");
    expect(askNext("occupation", { retired: false, seed: SEEDS[0] })).toMatchObject({ kind: "prompt", why: "pillar" });
  });
});

/* ------------------------------------------------------------------ */
/* Follow up next time (phase 11)                                      */
/* ------------------------------------------------------------------ */

const NOW = new Date(2027, 2, 16, 12);

const entry = (patch: Partial<FordEntry> & { id: string }): FordEntry =>
  ({
    clientId: "c1",
    studioId: "s1",
    pillar: "family",
    body: "A detail",
    subject: null,
    isPinned: false,
    eventDate: null,
    recurrence: "none",
    opportunity: null,
    occurredAt: new Date(2027, 0, 1, 12),
    createdAt: null,
    updatedAt: null,
    authorId: "uid-jess",
    authorName: "Jess Moreno",
    authorInitials: "JM",
    origin: "profile",
    sessionId: null,
    isArchived: false,
    ...patch,
  }) as FordEntry;

describe("askNext with follow-ups", () => {
  const boots = entry({
    id: "boots",
    pillar: "recreation",
    body: "New hiking boots for the Camino",
    followUp: "How did the new boots do on the long walk?",
    followUpAt: new Date(2027, 2, 15, 9),
    followUpBy: "Jess Moreno",
  });

  it("puts the newest open follow-up ahead of FORD's prompts", () => {
    const ask = askNext("recreation", { retired: false, seed: SEEDS[0], entries: [boots] });
    expect(ask).toMatchObject({ kind: "follow-up", question: "How did the new boots do on the long walk?", byName: "Jess Moreno" });
    expect(ask.kind === "follow-up" && ask.entry.id).toBe("boots");
    expect(askNextMeta(ask, "recreation", null, NOW)).toBe("Follow up from Jess Moreno, Mar 15");
  });

  it("beats the retirement prompt too — a written question is always asked first", () => {
    const work = entry({ id: "w", pillar: "occupation", followUp: "Did the volunteering start?", followUpBy: "AJ" });
    expect(askNext("occupation", { retired: true, entries: [work] })).toMatchObject({ kind: "follow-up", question: "Did the volunteering start?" });
  });

  it("only asks under the detail's own pillar", () => {
    expect(askNext("family", { retired: false, seed: SEEDS[0], entries: [boots] }).kind).toBe("prompt");
  });

  it("ignores archived, resolved and legacy details, and a blank question", () => {
    const ignored = [
      { ...boots, id: "a", isArchived: true },
      { ...boots, id: "r", resolvedAt: new Date(2027, 2, 1) },
      { ...boots, id: "l", isLegacy: true },
      { ...boots, id: "b", followUp: "   " },
      { ...boots, id: "n", followUp: null },
    ];
    expect(askNext("recreation", { retired: false, seed: SEEDS[0], entries: ignored }).kind).toBe("prompt");
    expect(openFollowUps("recreation", ignored)).toEqual([]);
    for (const e of ignored) expect(hasOpenFollowUp(e), e.id).toBe(false);
    expect(hasOpenFollowUp(boots)).toBe(true);
  });

  it("orders by when the question was set, then by the detail's last change", () => {
    const older = { ...boots, id: "older", followUp: "Older?", followUpAt: new Date(2027, 1, 1) };
    const newer = { ...boots, id: "newer", followUp: "Newer?", followUpAt: new Date(2027, 2, 1) };
    const noStampRecent = { ...boots, id: "u2", followUp: "Edited later?", followUpAt: null, updatedAt: new Date(2027, 2, 10) };
    const noStampOld = { ...boots, id: "u1", followUp: "Edited earlier?", followUpAt: null, updatedAt: new Date(2027, 0, 10) };
    expect(openFollowUps("recreation", [older, noStampOld, newer, noStampRecent]).map((e) => e.id)).toEqual([
      "newer",
      "older",
      "u2",
      "u1",
    ]);
    expect(askNext("recreation", { retired: false, entries: [older, newer] }).question).toBe("Newer?");
  });

  it("says who and when as far as it knows", () => {
    const noName = askNext("recreation", { retired: false, entries: [{ ...boots, followUpBy: null }] });
    expect(askNextMeta(noName, "recreation", null, NOW)).toBe("A follow up saved Mar 15");
    const lastYear = askNext("recreation", { retired: false, entries: [{ ...boots, followUpAt: new Date(2026, 10, 2) }] });
    expect(askNextMeta(lastYear, "recreation", null, NOW)).toBe("Follow up from Jess Moreno, Nov 2, 2026");
    const nothing = askNext("recreation", { retired: false, entries: [{ ...boots, followUpBy: null, followUpAt: null }] });
    expect(askNextMeta(nothing, "recreation", null, NOW)).toBe("A follow up saved on a detail");
  });
});

describe("followUpPatch — stamped only when the question changes", () => {
  const prev = { followUp: "How were the boots?" };

  it("writes nothing when the question did not change, whitespace aside", () => {
    expect(followUpPatch(prev, "How were the boots?", "Ann Trainer", NOW)).toEqual({});
    expect(followUpPatch(prev, "  How were   the boots?  ", "Ann Trainer", NOW)).toEqual({});
    expect(followUpPatch(null, null, "Ann Trainer", NOW)).toEqual({});
    expect(followUpPatch({ followUp: null }, "   ", "Ann Trainer", NOW)).toEqual({});
  });

  it("stamps who and when for a new or reworded question", () => {
    expect(followUpPatch(null, "How was the trip?", "Ann Trainer", NOW)).toEqual({
      followUp: "How was the trip?",
      followUpAt: NOW,
      followUpBy: "Ann Trainer",
    });
    expect(followUpPatch(prev, "How were the boots on the long walk?", "Ann Trainer", NOW)).toMatchObject({
      followUp: "How were the boots on the long walk?",
      followUpBy: "Ann Trainer",
    });
  });

  it("nulls all three when the question is cleared", () => {
    expect(followUpPatch(prev, "", "Ann Trainer", NOW)).toEqual({ followUp: null, followUpAt: null, followUpBy: null });
    expect(followUpPatch(prev, null, "Ann Trainer", NOW)).toEqual({ followUp: null, followUpAt: null, followUpBy: null });
  });

  it("trims, keeps one line, and caps at 140", () => {
    const long = "x".repeat(200);
    expect(followUpPatch(null, long, "Ann", NOW).followUp).toHaveLength(FOLLOW_UP_MAX);
    expect(FOLLOW_UP_MAX).toBe(140);
    expect(normaliseFollowUp("  How was\nthe  trip? ")).toBe("How was the trip?");
    expect(normaliseFollowUp(undefined)).toBe("");
  });

  it("takes off one pair of quotes around the whole question — Ask next adds its own", () => {
    // The dialog's example is shown in quotes, so trainers type them too.
    expect(normaliseFollowUp('"How were the boots?"')).toBe("How were the boots?");
    expect(normaliseFollowUp("  “How were the boots?”  ")).toBe("How were the boots?");
    expect(normaliseFollowUp('" How were the boots? "')).toBe("How were the boots?");
    // Quotes that are part of the question stay.
    expect(normaliseFollowUp('Did "the big hike" happen?')).toBe('Did "the big hike" happen?');
    expect(normaliseFollowUp('"Boots" or "shoes"')).toBe('"Boots" or "shoes"');
    expect(normaliseFollowUp('"Boots" or "shoes"?')).toBe('"Boots" or "shoes"?');
    // Only quotes: nothing is left, which is no question.
    expect(normaliseFollowUp('""')).toBe("");
    // An unchanged question typed with quotes this time is not a new one.
    expect(followUpPatch({ followUp: "How were the boots?" }, '"How were the boots?"', "Ann", NOW)).toEqual({});
  });
});
