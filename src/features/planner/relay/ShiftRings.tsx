import { useEffect, useMemo } from "react";
import { cn } from "../../../lib/utils";
import type { TaskRow } from "../../studio-tasks/types";
import { useRelayMaybe } from "./RelayContext";
import { RING_LABEL, publishClosedRings, shiftRings, type Ring } from "./rings";

/**
 * THE SHIFT RINGS — Opening, Mid, Closing, each a ring that fills.
 *
 * Round: Relay, Sep 2026. The studio's recurring work for each part of the
 * day, as three rings rather than "0 of 20 done". A ring closes with a short
 * sweep and stays on the Now Bar as a dot for the rest of the day. The
 * current phase's ring is drawn larger. Tapping a ring scrolls to the shift
 * strip below, which is still where the ticking happens.
 */
const R = 22;
const C = 2 * Math.PI * R;

export function ShiftRings({ rows, onOpen }: { rows: TaskRow[]; onOpen?: () => void }) {
  const relay = useRelayMaybe();
  const rings = useMemo(() => shiftRings(rows), [rows]);
  const closed = rings.filter((r) => r.closed).length;
  useEffect(() => {
    if (relay?.studioId) publishClosedRings(relay.studioId, closed);
  }, [relay?.studioId, closed]);
  const phase = relay?.now.phase ?? "mid";
  return (
    <div className="sr" role="group" aria-label="The shift">
      {rings.map((ring) => (
        <button
          key={ring.phase}
          type="button"
          className={cn("sr__ring", ring.closed && "sr__ring--closed", ring.phase === phase && "sr__ring--now")}
          onClick={onOpen}
          aria-label={`${RING_LABEL[ring.phase]}: ${ring.done} of ${ring.total} done`}
        >
          <RingSvg ring={ring} />
          <span className="sr__label">{RING_LABEL[ring.phase]}</span>
          <span className="sr__count">{ring.total ? `${ring.done}/${ring.total}` : "—"}</span>
        </button>
      ))}
    </div>
  );
}

function RingSvg({ ring }: { ring: Ring }) {
  const dash = C * (1 - ring.fraction);
  return (
    <svg className="sr__svg" viewBox="0 0 56 56" width="56" height="56" aria-hidden>
      <circle className="sr__track" cx="28" cy="28" r={R} fill="none" strokeWidth="6" />
      <circle
        className="sr__fill"
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
