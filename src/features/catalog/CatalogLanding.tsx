/**
 * The catalog landing.
 *
 * Round: Admin Overhaul, Round 2 Phase 5-7 (Section 18).
 *
 * WHY THERE IS A LANDING AT ALL
 * -----------------------------
 * The Catalog opened straight onto a machine - the first one on the roster -
 * because the alternative at the time was an "Awaiting Selection" placeholder
 * occupying the widest pane on the screen and saying nothing. That was the
 * right call against that alternative. It is the wrong call against a screen
 * that answers a question.
 *
 * Two questions, and neither was answerable before:
 *
 *   "Where is the machine I want?"  Twenty-two names in a rail is a list to
 *                                   read. Five body groups is a glance, and
 *                                   they are the five a trainer already thinks
 *                                   in when planning a session.
 *
 *   "What needs doing?"             The upkeep state existed per machine, in
 *                                   the detail pane, one machine at a time. So
 *                                   finding the overdue one meant tapping
 *                                   twenty-two machines.
 *
 * WHAT IS NOT ON IT
 * -----------------
 * Session counts, popularity, "most used this week". That is Insights, which
 * is deferred, and putting a number here that nobody can act on would make the
 * two that ARE actionable harder to see.
 *
 * The missing-category line is the one piece of analysis: the Academy's five
 * categories are what a complete routine draws from, so a studio with nothing
 * in Trunk cannot build a compliant programme. No screen said so before.
 */

import { useMemo } from "react";
import type { UpkeepEvent } from "../admin/upkeep/upkeepLog";
import { catalogOverview, dayKey, landingTiles } from "./grouping";
import type { CatalogMachine } from "./types";

export interface CatalogLandingProps {
  machines: CatalogMachine[];
  events: UpkeepEvent[];
  flaggedIds?: Set<string>;
  /** Open the picker filtered to this group's machines. */
  onOpenGroup: (machineIds: string[]) => void;
  /** Skip the landing and go straight to the list. */
  onBrowseAll: () => void;
  /** Open MSF Topics — the Academy curriculum, cards and glossary. */
  onOpenAcademy?: () => void;
  studioName?: string | null;
}

const UPKEEP_WORD = {
  overdue: "overdue",
  due: "due",
  never: "never logged",
  ok: "",
} as const;

export function CatalogLanding({
  machines,
  events,
  flaggedIds,
  onOpenGroup,
  onBrowseAll,
  onOpenAcademy,
  studioName,
}: CatalogLandingProps) {
  const todayKey = dayKey();
  const input = { machines, events, todayKey, flaggedIds };
  const tiles = useMemo(() => landingTiles(input), [machines, events, todayKey, flaggedIds]);
  const overview = useMemo(() => catalogOverview(input), [machines, events, todayKey, flaggedIds]);

  if (machines.length === 0) {
    return (
      <div className="cat__landing">
        <p className="cat__empty">
          {studioName
            ? `${studioName} has no machines on its roster yet.`
            : "No machines on this studio's roster yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="cat__landing">
      <header className="cat__landing-head">
        <h2 className="cat__landing-title">Catalog</h2>
        <p className="cat__landing-sub">
          {overview.total} machine{overview.total === 1 ? "" : "s"}
          {studioName ? ` at ${studioName}` : ""}. Pick a body group, or{" "}
          <button type="button" className="cat__link" onClick={onBrowseAll}>
            browse them all
          </button>
          .
        </p>
      </header>

      <div className="cat__landing-stats">
        <Stat label="On the roster" value={overview.total} />
        <Stat
          label="Needs cleaning or service"
          value={overview.needsUpkeep}
          tone={overview.needsUpkeep > 0 ? "warn" : undefined}
        />
        <Stat
          label="Flagged by a trainer"
          value={overview.flagged}
          tone={overview.flagged > 0 ? "alert" : undefined}
        />
        <Stat label="Out of service" value={overview.outOfService} />
        <Stat
          label="Added by this studio"
          value={overview.studioCustom}
        />
      </div>

      {overview.missingCategories.length > 0 && (
        <p className="cat__landing-gap">
          Nothing on this roster covers{" "}
          <strong>{overview.missingCategories.join(", ")}</strong>. A routine
          built here cannot draw from{" "}
          {overview.missingCategories.length === 1 ? "that group" : "those groups"}.
        </p>
      )}

      {onOpenAcademy && (
        /*
         * MSF Topics sits ABOVE the body groups, not in a tab or a menu.
         *
         * The Academy corpus has been in the repo since it was committed and
         * its own README said nothing read it at runtime — 283,000 words of
         * the studio's method that no trainer could reach. A link nobody finds
         * is the same as no link, so it goes where the eye already is.
         */
        <button type="button" className="cat__academy" onClick={onOpenAcademy}>
          <span className="cat__academy-main">
            <span className="cat__academy-title">MSF Topics</span>
            <span className="cat__academy-sub">
              The Academy curriculum, a quick reference card for every machine,
              and the glossary.
            </span>
          </span>
          <span className="cat__academy-go" aria-hidden>
            &rarr;
          </span>
        </button>
      )}

      <div className="cat__landing-grid">
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            className="cat__tile"
            onClick={() => onOpenGroup(t.machineIds)}
          >
            <span className="cat__tile-label">{t.label}</span>
            <span className="cat__tile-count">
              {t.count} machine{t.count === 1 ? "" : "s"}
            </span>
            <span className="cat__tile-flags">
              {t.needsUpkeep > 0 && (
                <span className="cat__badge cat__badge--upkeep">
                  {t.needsUpkeep} {UPKEEP_WORD[t.upkeep] || "due"}
                </span>
              )}
              {t.flagged > 0 && (
                <span className="cat__badge cat__badge--maintenance">
                  {t.flagged} flagged
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | "alert";
}) {
  return (
    <div className={`cat__stat${tone ? ` cat__stat--${tone}` : ""}`}>
      <span className="cat__stat-value">{value}</span>
      <span className="cat__stat-label">{label}</span>
    </div>
  );
}
