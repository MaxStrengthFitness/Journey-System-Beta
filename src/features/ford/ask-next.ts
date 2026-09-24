/**
 * ASK NEXT — the one question each FORD pillar offers a trainer.
 *
 * Client codex, Sep 2026. Every pillar card on the FORD page ends with the
 * question worth asking at the next session. Until someone writes one down
 * (phase 11's "Follow up next time"), it is one of FORD's own prompts,
 * rotated by day exactly as the briefing rotates them — and now aware of
 * retirement: a retired client is never asked "How is work treating you?",
 * and a working one is never asked how retirement is going.
 *
 * The prompts are FORD_META's, verbatim. The only logic here is which to
 * skip (`FORD_PROMPT_WHEN`); the app still never coaches, it only reminds a
 * trainer what the team has been asking.
 *
 * Pure: ask-next.test.ts.
 */
import { FORD_META, FORD_PROMPT_WHEN, type FordPillar } from "./types";

export interface PromptContext {
  /**
   * True: the client is retired. False: the client is working (or nothing
   * says otherwise). Left out: nothing is known, so nothing is skipped.
   */
  retired?: boolean;
}

/**
 * The prompts worth asking this client under a pillar. With no context,
 * every prompt (today's behaviour). If skipping would leave nothing, every
 * prompt again — a pillar always has something to ask.
 */
export function promptsFor(pillar: FordPillar, ctx?: PromptContext): string[] {
  const all = FORD_META[pillar].prompts;
  if (ctx?.retired === undefined) return [...all];
  const skip: "retired" | "not-retired" = ctx.retired ? "not-retired" : "retired";
  const kept = all.filter((p) => FORD_PROMPT_WHEN[p] !== skip);
  return kept.length > 0 ? kept : [...all];
}

/**
 * One prompt, rotated by day rather than at random: a trainer who opens a
 * client twice in a morning is not handed two different opening lines, and
 * the studio's four trainers are not all asking about the dog on the same
 * Tuesday. `ui.tsx`'s `pillarPrompt` is this.
 */
export function rotatedPrompt(pillar: FordPillar, seed: Date = new Date(), ctx?: PromptContext): string {
  const prompts = promptsFor(pillar, ctx);
  const day = Math.floor(seed.getTime() / 86_400_000);
  return prompts[((day % prompts.length) + prompts.length) % prompts.length];
}

/** What a pillar's Ask next line says, and why it says it. */
export interface AskNext {
  kind: "prompt";
  /** The question, verbatim from FORD_META. */
  question: string;
  /**
   * `retired`: the Occupation card of a retired client, where the work
   * questions were skipped — worth saying, so nobody wonders where they went.
   */
  why: "pillar" | "retired";
}

export function askNext(pillar: FordPillar, opts: { retired: boolean; seed?: Date }): AskNext {
  const question = rotatedPrompt(pillar, opts.seed ?? new Date(), { retired: opts.retired });
  return { kind: "prompt", question, why: pillar === "occupation" && opts.retired ? "retired" : "pillar" };
}

/**
 * The quiet line under the question. `who` is the client's pronoun, for the
 * retired case ("because she's retired"); without one it says "marked
 * retired", which names the record rather than the person.
 */
export function askNextMeta(ask: AskNext, pillar: FordPillar, who?: { subject: string; plural: boolean } | null): string {
  if (ask.why === "retired") {
    return who
      ? `The work questions are skipped because ${who.subject} ${who.plural ? "are" : "is"} retired`
      : "The work questions are skipped: marked retired";
  }
  return `One of FORD’s ${FORD_META[pillar].label} questions`;
}
