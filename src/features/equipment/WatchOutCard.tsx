import { memo } from "react";
import { ShieldAlert } from "lucide-react";
import type { WatchOut } from "../../lib/clinical-watchouts";

/**
 * Clinical watch-outs for ONE machine — the client's flags that the studio's
 * clinical matrix says matter here, quoted, with the setup change when the
 * matrix names one. Drawn at the top of the machine window and the in-session
 * machine sheet, above the numbers, because it changes what the numbers
 * should be. Renders nothing when there is nothing to watch.
 */

const SEVERITY_LABEL: Record<WatchOut["tone"], string> = {
  alert: "Contraindicated",
  caution: "High risk",
  modify: "Modify",
};

export const WatchOutCard = memo(function WatchOutCard({
  watchOuts,
  compact = false,
}: {
  watchOuts: WatchOut[];
  /** One line per flag (the in-session sheet). */
  compact?: boolean;
}) {
  if (watchOuts.length === 0) return null;
  const worst = watchOuts[0].tone;
  return (
    <section className="eq-card eq-watch" data-tone={worst} aria-label="Clinical watch-outs">
      <header className="eq-card__head">
        <h3 className="eq-card__title eq-watch__title">
          <ShieldAlert size={15} strokeWidth={2.4} aria-hidden />
          Clinical watch-out{watchOuts.length === 1 ? "" : "s"} on this machine
        </h3>
      </header>
      <ul className="eq-watch__list">
        {watchOuts.map((w) => (
          <li key={`${w.flagId}-${w.instruction.slice(0, 16)}`} className="eq-watch__item" data-tone={w.tone}>
            <div className="eq-watch__line">
              <b title={w.conditionFull}>{w.condition}</b>
              <span className="eq-watch__sev">{SEVERITY_LABEL[w.tone]}</span>
            </div>
            {w.setup && (
              <p className="eq-watch__setup">
                <span>Setup</span> {w.setup}
              </p>
            )}
            {!compact && <p className="eq-watch__text">{w.instruction}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
});
