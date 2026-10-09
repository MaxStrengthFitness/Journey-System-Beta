/**
 * ONE CALM LINE when today's order trips one of the Academy's sequencing
 * rules (the design round, Oct 8 2026, §4.6; AJ: "progressing in one machine
 * may help increase the performance on another but performing one machine
 * could hurt the clients performance if that session has that machine in
 * it").
 *
 * "Lumbar directly into Leg Press · the Academy says avoid", under the
 * session's grid. A tap opens the Academy's why and its source in place:
 * never a block, never a dialog, and the order stays the trainer's ("you
 * shouldn't really be blocked"). The first effect only, the Academy's
 * "avoid" before its caution (`orderEffects`): one line, never a list.
 */
import type { OrderEffect } from "../order-effects";
import { OrderNote } from "./parts";
import "./routine-plan.css";

export function SessionOrderLine({ effects }: { effects: readonly OrderEffect[] }) {
  const effect = effects[0];
  if (!effect) return null;
  return (
    <ul className="rpl-list rpl-list--flush rpl-list--session" aria-label="Today's order">
      <OrderNote effect={effect} />
    </ul>
  );
}
