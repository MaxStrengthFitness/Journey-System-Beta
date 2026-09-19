/**
 * ALL MY STUDIOS — the Overview under the wide scope.
 *
 * Operations round, Sep 2026. This is the Franchise dashboard folded into
 * Operations: its question — "is anything wrong at any of my studios" — was
 * the right one, but it was a second screen with a second team editor and
 * a second announcement composer (the Sep 18 audit, §17). The tiles and the
 * locations list are kept, word for word where they were right; the team
 * editor is Staff & Roles under the same scope; announcements have their
 * tab. The network picker went with the screen: the scope is the reader's
 * studios (scope.ts), and a company-tier reader looking at one franchise
 * switches the app to one of its studios.
 *
 * The counts at the top are people, not volume: what only this reader can
 * clear this morning. Session volume is Insights; hours are Hours.
 */
import { useMemo } from "react";
import { Building2, Users } from "lucide-react";
import type { Studio, Trainer } from "../../../types";
import { AdminBadge, AdminEmpty, AdminPanel, AdminStatTile, AdminTiles } from "../primitives";
import { auditStudios, type StudioDiagnosis } from "../mindbody/diagnostics";
import { attentionCounts, staffCountByStudio, trainerIsIn } from "../franchise/scope";
import { useOperationsScope } from "../scope-context";

const LINK_WORD: Record<StudioDiagnosis["link"], string> = {
  linked: "Mindbody on",
  offline: "Offline by choice",
  misconfigured: "No Site ID",
};

const LINK_TONE = {
  linked: "ok",
  offline: "neutral",
  misconfigured: "alert",
} as const;

const SYNC_TONE = {
  current: "ok",
  lagging: "warn",
  stalled: "alert",
  manual: "neutral",
  "n/a": "neutral",
} as const;

export function NetworkOverview({ studios, trainers, now }: { studios: Studio[]; trainers: Trainer[]; now: number }) {
  const { pickStudio, switchable } = useOperationsScope();
  const studioIds = useMemo(() => studios.map((s) => s.id), [studios]);
  const staff = useMemo(
    () => trainers.filter((t) => trainerIsIn(t, studioIds)).sort((a, b) => (a.fullName ?? "").localeCompare(b.fullName ?? "")),
    [trainers, studioIds],
  );
  const counts = useMemo(() => attentionCounts(staff), [staff]);
  const perStudio = useMemo(() => staffCountByStudio(staff, studioIds), [staff, studioIds]);
  const audit = useMemo(() => auditStudios(studios, staff, now), [studios, staff, now]);
  const troubled = audit.filter((a) => a.problem !== null).length;
  const canSwitchTo = new Set(switchable.map((s) => s.id));

  return (
    <>
      <AdminTiles>
        <AdminStatTile
          label="Waiting to be let in"
          value={counts.awaitingApproval}
          tone={counts.awaitingApproval > 0 ? "attention" : undefined}
          foot="Signed in, no role assigned — Staff & Roles"
        />
        <AdminStatTile
          label="Studios needing attention"
          value={troubled}
          tone={troubled > 0 ? "alert" : undefined}
          foot="Mindbody not connected, or not syncing"
        />
        <AdminStatTile
          label="Temporary profiles"
          value={counts.provisional}
          tone={counts.provisional > 0 ? "attention" : undefined}
          foot="Waiting to be matched to Mindbody"
        />
        <AdminStatTile label="Unclaimed profiles" value={counts.unclaimed} foot="Created for someone who has not signed in" />
        <AdminStatTile label="Staff not linked to Mindbody" value={counts.unlinkedStaff} foot="Their sessions will not be attributed" />
      </AdminTiles>

      <AdminPanel
        title="Your locations"
        subtitle={troubled === 0 ? "All connected and syncing. Tap one to look at it." : `${troubled} of ${audit.length} need a look. Tap one to look at it.`}
        icon={<Building2 className="w-4 h-4" />}
        flush
      >
        {audit.length === 0 ? (
          <AdminEmpty title="No locations yet">Nothing is registered to your account. If that is wrong, an administrator can add you as an owner.</AdminEmpty>
        ) : (
          <ul className="adm-fr-list">
            {audit.map((row) => {
              const body = (
                <>
                  <span className="adm-fr-row__head">
                    <span className="adm-fr-row__name">{row.name}</span>
                    <AdminBadge tone={LINK_TONE[row.link]}>{LINK_WORD[row.link]}</AdminBadge>
                    {row.link === "linked" && row.sync !== "current" && (
                      <AdminBadge tone={SYNC_TONE[row.sync]}>{row.sync === "manual" ? "Manual sync" : "Not syncing"}</AdminBadge>
                    )}
                    <AdminBadge icon={<Users className="w-3 h-3" />}>{perStudio[row.studioId] ?? 0}</AdminBadge>
                  </span>
                  {row.problem && <span className="adm-fr-row__why">{row.problem}</span>}
                </>
              );
              return canSwitchTo.has(row.studioId) ? (
                <li key={row.studioId} className="adm-fr-row adm-fr-row--tappable">
                  <button type="button" className="adm-fr-row__btn" onClick={() => pickStudio(row.studioId)}>
                    {body}
                  </button>
                </li>
              ) : (
                <li key={row.studioId} className="adm-fr-row">
                  {body}
                </li>
              );
            })}
          </ul>
        )}
      </AdminPanel>
    </>
  );
}
