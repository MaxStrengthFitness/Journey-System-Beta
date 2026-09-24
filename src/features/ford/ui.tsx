/**
 * The small shared pieces of FORD.
 *
 * Kept in one file on purpose: the letter mark and the date chip appear on the
 * floor sheet, in the briefing, in the teardown tray and in the Delight queue,
 * and the last time a pattern like this was copied per-surface the four copies
 * drifted within a fortnight. (The profile's FORD page draws its own from the
 * codex kit since the client codex; the gesture chip the old FORD hub drew
 * went with the hub — the Delight queue draws its own.)
 *
 * The marks draw with ford.css, so this file imports it: a stylesheet arrives
 * with the chunk that imports it (ford-css.test.ts).
 */

import {
  Users,
  Briefcase,
  Mountain,
  Sparkles,
  Inbox,
  type LucideIcon,
} from "lucide-react";
import {
  FORD_META,
  toDate,
  urgencyOf,
  whenLabel,
  type FordEntry,
  type FordPillar,
  type FordRecurrence,
} from "./types";
import { rotatedPrompt, type PromptContext } from "./ask-next";
import "./ford.css";

export const PILLAR_ICONS: Record<FordPillar, LucideIcon> = {
  family: Users,
  occupation: Briefcase,
  recreation: Mountain,
  dreams: Sparkles,
};

/* ------------------------------------------------------------------ */

/**
 * The letter mark. F, O, R or D in its tint — or an inbox glyph when the
 * detail has not been filed yet.
 *
 * The letter carries the whole mnemonic, so it is the letter that is drawn
 * large and the icon that is dropped. A trainer being taught FORD for the
 * first time learns it from this screen.
 */
export function FordMark({
  pillar,
  size,
  title,
}: {
  pillar: FordPillar | null;
  size?: number;
  title?: string;
}) {
  const style = size ? { width: size, height: size, fontSize: size * 0.42 } : undefined;

  if (!pillar) {
    return (
      <span
        className="ford-mark ford-mark--unfiled"
        style={style}
        title={title ?? "Not filed yet"}
        aria-hidden="true"
      >
        <Inbox size={size ? size * 0.5 : 18} strokeWidth={2.5} />
      </span>
    );
  }

  const meta = FORD_META[pillar];
  return (
    <span
      className={`ford-mark ford-mark--${pillar}`}
      style={style}
      title={title ?? meta.label}
      aria-hidden="true"
    >
      {meta.letter}
    </span>
  );
}

/* ------------------------------------------------------------------ */

/**
 * When it is, said the way a trainer would say it.
 *
 * Colour comes from how much time a gesture still has, never from the pillar —
 * see the note at the top of ford.tokens.css.
 */
export function WhenChip({
  date,
  recurrence = "none",
  className = "",
}: {
  date: any;
  recurrence?: FordRecurrence;
  className?: string;
}) {
  const parsed = toDate(date);
  const label = whenLabel(parsed, recurrence);
  if (!label) return null;

  const urgency = urgencyOf(parsed, recurrence);
  const tone = urgency === "none" ? "later" : urgency;

  return (
    <span className={`ford-when ford-when--${tone} ${className}`.trim()}>
      {recurrence === "annual" ? "Every year · " : ""}
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Something to actually say out loud.
 *
 * Rotated by day rather than at random, so a trainer who opens a client twice
 * in a morning is not handed two different opening lines — and so the studio's
 * four trainers are not all asking about the dog on the same Tuesday.
 *
 * `ctx.retired` (client codex, Sep 2026) skips the work questions for a
 * retired client and the retirement question for a working one
 * (`FORD_PROMPT_WHEN`). Without it, every prompt is in the rotation, as before.
 */
export function pillarPrompt(pillar: FordPillar, seed = new Date(), ctx?: PromptContext): string {
  return rotatedPrompt(pillar, seed, ctx);
}

/* ------------------------------------------------------------------ */

/**
 * "Alex Kerr, 12 Sept" — who caught the detail and when.
 *
 * Legacy entries adapted from the old profile events have no author, so they
 * say where they came from instead of pretending someone typed them.
 */
export function attribution(entry: FordEntry): string {
  const when = toDate(entry.occurredAt);
  const date = when
    ? when.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";
  if (entry.isLegacy) return [entry.legacySource, date].filter(Boolean).join(" · ");
  return [entry.authorInitials || entry.authorName, date].filter(Boolean).join(" · ");
}
