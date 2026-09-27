/**
 * [ Schedule | Opportunities ] — the Hub's two layers (Sep 27 2026).
 *
 * Research-hub §6.3: a two-segment control at the start of the Hub's strip.
 * The strip itself (the day's numbers and the seven days) never moves; only
 * the body below it changes, so switching feels like walking into the next
 * room rather than a new screen. The Hub always opens on Schedule, the
 * screen trainers expect sixty times a day. Small and eager on purpose: the
 * Opportunities layer itself is fetched only when it is first opened.
 */
import "./layer-switch.css";

export type HubLayer = "schedule" | "opportunities";

export function LayerSwitch({ value, onChange }: { value: HubLayer; onChange: (next: HubLayer) => void }) {
  return (
    <div className="hl-switch" role="group" aria-label="Hub layer">
      <button type="button" className="hl-btn" aria-pressed={value === "schedule"} onClick={() => onChange("schedule")}>
        Schedule
      </button>
      <button type="button" className="hl-btn" aria-pressed={value === "opportunities"} onClick={() => onChange("opportunities")}>
        Opportunities
      </button>
    </div>
  );
}
