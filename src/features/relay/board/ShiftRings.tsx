import { useMemo } from "react";
import { cn } from "../../../lib/utils";
import type { TaskRow } from "../../studio-tasks/types";
import { useRelayMaybe } from "./RelayContext";
import { RING_LABEL, shiftRings, type Ring } from "./rings";

/**
 * THE SHIFT RINGS — Opening, Mid, Closing, each a ring that fills.
 *
 * Round: Relay, Sep 2026. The studio's recurring work for each part of the
 * day, as three rings rather than "0 of 20 done". The current phase's ring
 * is drawn larger. Tapping a ring scrolls to the shift strip below, which is
 * still where the ticking happens. Behind the Board's Floor work door since
 * the Relay room (Sep 28 2026); the closed-ring dots it published for the
 * Now Bar went with the Now Bar.
 */
const R = 22;
const C = 2 * Math.PI * R;

export function ShiftRings({ rows, onOpen }: { rows: TaskRow[]; onOpen?: () => void }) {
  const relay = useRelayMaybe();
  const rings = useMemo(() => shiftRings(rows), [rows]);
  const phase = relay?.now.phase ?? "mid";
  return (
    <div className="shr" role="group" aria-label="The shift">
      {rings.map((ring) => (
        <button
          key={ring.phase}
          type="button"
          className={cn("shr__ring", ring.closed && "shr__ring--closed", ring.phase === phase && "shr__ring--now")}
          onClick={onOpen}
          aria-label={`${RING_LABEL[ring.phase]}: ${ring.done} of ${ring.total} done`}
        >
          <RingSvg ring={ring} />
          <span className="shr__label">{RING_LABEL[ring.phase]}</span>
          <span className="shr__count">{ring.total ? `${ring.done}/${ring.total}` : "—"}</span>
        </button>
      ))}
    </div>
  );
}

function RingSvg({ ring }: { ring: Ring }) {
  const dash = C * (1 - ring.fraction);
  return (
    <svg className="shr__svg" viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <circle className="shr__track" cx="28" cy="28" r={R} fill="none" strokeWidth="6" />
      <circle
        className="shr__fill"
        cx="28"
        cy="28"
        r={R}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={C}
        strokeDashoffset={dash}
        transform="rotate(-90 28 28)"
      />
    </svg>
  );
}
