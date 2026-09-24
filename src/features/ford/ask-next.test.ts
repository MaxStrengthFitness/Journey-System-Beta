import { describe, expect, it } from "vitest";
import { FORD_META, FORD_PILLARS, FORD_PROMPT_WHEN } from "./types";
import { askNext, askNextMeta, promptsFor, rotatedPrompt } from "./ask-next";
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
    expect(ask.why).toBe("pillar");
    expect(askNextMeta(ask, "family")).toBe("One of FORD’s Family questions");
    expect(askNext("occupation", { retired: false, seed: SEEDS[0] }).why).toBe("pillar");
  });
});
