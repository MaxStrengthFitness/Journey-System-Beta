import { memo, useState } from "react";
import { toneClass } from "./trainer-tone";
import type { TrainerRef } from "./types";
import "./calendar.css";

/**
 * A trainer's initials in their own colour, with their photo on top when
 * there is one.
 *
 * `tone` comes from a hash of the trainer id, so this is the same colour in
 * the Week's trainer load and a client's History — which is what makes the
 * colour worth anything. Since the rooms round (Oct 10 2026) the month cells
 * draw no avatars: who carries the week is the Week's folded charts.
 *
 * INITIALS ARE THE PRIMARY RENDERER, not a fallback. Most Max Strength staff
 * have no Mindbody photo, so the coloured initials are always drawn and the
 * image is layered over them only if one exists and loads. A photo that 404s,
 * a CDN URL that has rotated, or a slow network therefore shows the normal
 * avatar rather than a broken-image icon or an empty circle.
 *
 * Memo-wrapped: a leaf drawn many times in a list, and nothing about it
 * changes when the surrounding view re-renders. (Under this project's React
 * 19 setup a plain function component also cannot take a `key` in a list;
 * memo components can.)
 */

export interface TrainerAvatarProps {
  trainer: TrainerRef;
  size?: "sm" | "md";
}

export const TrainerAvatar = memo(function TrainerAvatar({
  trainer,
  size = "md",
}: TrainerAvatarProps) {
  const [failed, setFailed] = useState(false);
  const photo = !failed && trainer.photoUrl ? trainer.photoUrl : null;

  return (
    <span
      className={`cal-avatar ${size === "sm" ? "cal-avatar--sm" : ""} ${toneClass(trainer.tone)}`}
      title={trainer.name}
      aria-hidden
    >
      {trainer.initials}
      {photo && (
        <img
          className="cal-avatar__img"
          src={photo}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
});
