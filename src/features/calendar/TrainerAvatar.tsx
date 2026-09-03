import { memo } from "react";
import { toneClass } from "./trainer-tone";
import type { TrainerRef } from "./types";

/**
 * A trainer's initials in their own colour.
 *
 * `tone` comes from a hash of the trainer id, so this is the same colour in
 * the month grid, the week leaderboard and the day lanes — which is what makes
 * the colour worth anything.
 *
 * Both are memo-wrapped: they are leaves rendered ~40 times in a month grid and
 * nothing about them changes when the surrounding view re-renders. (Under this
 * project's React 19 setup a plain function component also cannot take a `key`
 * in a list; memo components can.)
 */

export interface TrainerAvatarProps {
  trainer: TrainerRef;
  size?: "sm" | "md";
}

export const TrainerAvatar = memo(function TrainerAvatar({
  trainer,
  size = "md",
}: TrainerAvatarProps) {
  return (
    <span
      className={`cal-avatar ${size === "sm" ? "cal-avatar--sm" : ""} ${toneClass(trainer.tone)}`}
      title={trainer.name}
      aria-hidden
    >
      {trainer.initials}
    </span>
  );
});

export interface TrainerCountChipProps extends TrainerAvatarProps {
  count: number;
}

/** Avatar with a session-count badge. The month grid's whole vocabulary. */
export const TrainerCountChip = memo(function TrainerCountChip({
  trainer,
  count,
  size = "md",
}: TrainerCountChipProps) {
  return (
    <span
      className="cal-who"
      title={`${trainer.name} — ${count} session${count === 1 ? "" : "s"}`}
    >
      <TrainerAvatar trainer={trainer} size={size} />
      <span className="cal-who__badge">{count}</span>
      <span className="sr-only">
        {trainer.name}, {count} sessions
      </span>
    </span>
  );
});
