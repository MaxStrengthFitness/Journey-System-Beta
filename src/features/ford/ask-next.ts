/**
 * ASK NEXT — the one question each FORD pillar offers a trainer.
 *
 * Client codex, Sep 2026. Every pillar card on the FORD page ends with the
 * question worth asking at the next session:
 *
 *   1. the newest open FOLLOW UP NEXT TIME a trainer wrote on one of this
 *      pillar's details (AJ's decision 3b) — "How did the new boots do on the
 *      long walk?" — so the next trainer asks about the boots, not only "how
 *      is the family?";
 *   2. otherwise one of FORD's own prompts, rotated by day exactly as the
 *      briefing rotates them — and aware of retirement: a retired client is
 *      never asked "How is work treating you?", and a working one is never
 *      asked how retirement is going.
 *
 * The prompts are FORD_META's, verbatim, and a follow-up is the trainer's
 * own words, verbatim. The only logic here is which to show; the app still
 * never coaches, it only reminds a trainer what the team has been asking.
 *
 * Pure: ask-next.test.ts.
 */
import { FORD_META, FORD_PROMPT_WHEN, shortDate, toDate, type FordEntry, type FordPillar } from "./types";

/** The longest follow-up question, in characters. */
export const FOLLOW_UP_MAX = 140;

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
export type AskNext =
  | {
      kind: "prompt";
      /** The question, verbatim from FORD_META. */
      question: string;
      /**
       * `retired`: the Occupation card of a retired client, where the work
       * questions were skipped — worth saying, so nobody wonders where they went.
       */
      why: "pillar" | "retired";
    }
  | {
      kind: "follow-up";
      /** The question a trainer wrote on `entry`, verbatim. */
      question: string;
      /** The detail it was written on — "Asked it" clears it there. */
      entry: FordEntry;
      /** Who set it, in full; null when the detail does not say. */
      byName: string | null;
      /** When it was set (else the detail's last change); null when unknown. */
      at: Date | null;
    };

/** Ask next when it is a trainer's Follow up next time: what "Asked it" acts on. */
export type FollowUpAsk = Extract<AskNext, { kind: "follow-up" }>;

/**
 * One pair of double quotes (straight or curly) around the WHOLE question,
 * with none inside it. The dialog's example is shown in quotes, so a trainer
 * types them too, and Ask next adds its own: “"How were the boots?"”.
 */
const WRAPPED_IN_QUOTES = /^["\u201C\u201D]([^"\u201C\u201D]*)["\u201C\u201D]$/;

/**
 * A follow-up as saved: one line, runs of spaces collapsed, trimmed, one
 * pair of quotes around the whole of it taken off, at most 140. "" when blank.
 */
export function normaliseFollowUp(text: string | null | undefined): string {
  if (typeof text !== "string") return "";
  const one = text.replace(/\s+/g, " ").trim();
  const bare = WRAPPED_IN_QUOTES.exec(one)?.[1].trim() ?? one;
  return bare.slice(0, FOLLOW_UP_MAX).trim();
}

const timeOf = (v: unknown): number => toDate(v)?.getTime() ?? 0;

/**
 * The follow-ups still waiting to be asked under a pillar, newest first (by
 * when the question was set, then the detail's last change, then when it was
 * caught). An archived, resolved or legacy detail has none, and nor does a
 * blank question.
 */
export function openFollowUps(pillar: FordPillar, entries: readonly FordEntry[]): FordEntry[] {
  return entries
    .filter(
      (e) =>
        e.pillar === pillar &&
        !e.isArchived &&
        !e.resolvedAt &&
        !e.isLegacy &&
        normaliseFollowUp(e.followUp) !== "",
    )
    .sort(
      (a, b) =>
        timeOf(b.followUpAt) - timeOf(a.followUpAt) ||
        timeOf(b.updatedAt) - timeOf(a.updatedAt) ||
        timeOf(b.occurredAt) - timeOf(a.occurredAt),
    );
}

/** Whether a detail carries a follow-up that is still waiting to be asked. */
export function hasOpenFollowUp(entry: FordEntry): boolean {
  return !entry.isArchived && !entry.resolvedAt && !entry.isLegacy && normaliseFollowUp(entry.followUp) !== "";
}

export function askNext(
  pillar: FordPillar,
  opts: { retired: boolean; seed?: Date; entries?: readonly FordEntry[] },
): AskNext {
  const open = opts.entries ? openFollowUps(pillar, opts.entries) : [];
  const newest = open[0];
  if (newest) {
    return {
      kind: "follow-up",
      question: normaliseFollowUp(newest.followUp),
      entry: newest,
      byName: newest.followUpBy?.trim() || null,
      at: toDate(newest.followUpAt) ?? toDate(newest.updatedAt),
    };
  }
  const question = rotatedPrompt(pillar, opts.seed ?? new Date(), { retired: opts.retired });
  return { kind: "prompt", question, why: pillar === "occupation" && opts.retired ? "retired" : "pillar" };
}

/**
 * What to write when a detail is saved from the dialog: the three follow-up
 * fields ONLY when the question changed. Unchanged (after trimming) gives
 * `{}`, so editing the sentence never re-dates the question; a new or
 * reworded one is stamped with who and when; a cleared one nulls all three.
 * `byName` is the full name of whoever is saving.
 */
export function followUpPatch(
  prev: Pick<FordEntry, "followUp"> | null,
  next: string | null | undefined,
  byName: string,
  now: Date,
): { followUp?: string | null; followUpAt?: Date | null; followUpBy?: string | null } {
  const before = normaliseFollowUp(prev?.followUp);
  const after = normaliseFollowUp(next);
  if (after === before) return {};
  if (after === "") return { followUp: null, followUpAt: null, followUpBy: null };
  return { followUp: after, followUpAt: now, followUpBy: byName.trim() || null };
}

/**
 * The quiet line under the question. For a follow-up, who set it and when:
 * "Follow up from Jess Moreno, Mar 15". For a prompt, whose question it is;
 * `who` is the client's pronoun, for the retired case ("because she's
 * retired"); without one it says "marked retired", which names the record
 * rather than the person.
 */
export function askNextMeta(
  ask: AskNext,
  pillar: FordPillar,
  who?: { subject: string; plural: boolean } | null,
  now: Date = new Date(),
): string {
  if (ask.kind === "follow-up") {
    const when = shortDate(ask.at, now);
    if (ask.byName) return when ? `Follow up from ${ask.byName}, ${when}` : `Follow up from ${ask.byName}`;
    return when ? `A follow up saved ${when}` : "A follow up saved on a detail";
  }
  if (ask.why === "retired") {
    return who
      ? `The work questions are skipped because ${who.subject} ${who.plural ? "are" : "is"} retired`
      : "The work questions are skipped: marked retired";
  }
  return `One of FORD’s ${FORD_META[pillar].label} questions`;
}
