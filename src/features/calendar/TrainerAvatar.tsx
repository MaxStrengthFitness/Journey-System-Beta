import { toneClass } from "./trainer-tone";
import type { TrainerRef } from "./types";

/**
 * A trainer's initials in their own colour.
 *
 * `tone` comes from a hash of the trainer id, so this is the same colour in
 * the month grid, the week leaderboard and the day lanes — which is what makes
 * the colour worth anything.
 */
export function TrainerAvatar({
  trainer,
  size = "md",
}: {
  trainer: TrainerRef;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`cal-avatar ${size === "sm" ? "cal-avatar--sm" : ""} ${toneClass(trainer.tone)}`}
      title={trainer.name}
      aria-hidden
    >
      {trainer.initials}
    </span>
  );
}

/** Avatar with a session-count badge. The month grid's whole vocabulary. */
export function TrainerCountChip({
  trainer,
  count,
  size = "md",
}: {
  trainer: TrainerRef;
  count: number;
  size?: "sm" | "md";
}) {
  return (
    <span className="cal-who" title={`${trainer.name} — ${count} session${count === 1 ? "" : "s"}`}>
      <TrainerAvatar trainer={trainer} size={size} />
      <span className="cal-who__badge">{count}</span>
      <span className="sr-only">
        {trainer.name}, {count} sessions
      </span>
    </span>
  );
}
