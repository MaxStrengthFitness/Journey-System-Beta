/**
 * OPERATIONS → CLIENTS → TRENDS — the quarter's lines, then the floor.
 *
 * The redesign's Operations room, phase 5 (Sep 28 2026). Insights moved here
 * in phase 1; phase 5 put the research's quarter lines on top (trends.ts),
 * each only where data Journey already holds supports it, each with its
 * named minimum and, below it, what it is waiting for. The Insights screen
 * (what stands out on the floor, the tiles, by trainer) follows unchanged,
 * except that "By trainer" now reads in name order with no red: recognition,
 * never ranking.
 *
 * Reads: this quarter's and last quarter's renewal outcomes (`useOutcomes`,
 * the Outcomes panel's own closedOn range, one studio), the Journey
 * (`useStudioJourneys`), and whatever Insights reads itself.
 */
import { useMemo } from "react";
import { Scale, TrendingUp } from "lucide-react";
import type { Client, Studio, Trainer } from "../../../types";
import { recentQuarters, tallyOutcomes } from "../../renewals/rates";
import { useOutcomes } from "../../renewals/useOutcomes";
import { AdminHeader, AdminScreen } from "../primitives";
import { AdminInsightsTab } from "../insights/AdminInsightsTab";
import { useStudioJourneys } from "../journey/useStudioJourneys";
import { useMinuteClock } from "../shell/useMinuteClock";
import { SIGNAL_CHECK_LINE, WIN_BACK_LINE, longerPackageLine, lostReasonsLine, renewalOutcomesLine, startGroups, startGroupsLine, studioRhythmLine, type TrendLine } from "./trends";
import "../shell/ops.css";

export interface TrendsPageProps {
  studio: Studio;
  studios: Studio[];
  clients: Client[];
  trainers: Trainer[];
  authTrainer: Trainer;
}

export function TrendsPage({ studio, studios, clients, trainers, authTrainer }: TrendsPageProps) {
  const now = useMinuteClock();
  const studioId = studio.id as string;
  const j = useStudioJourneys({ studio, studios, clients, trainers, authTrainer, now });
  const [thisQ, lastQ] = useMemo(() => recentQuarters(j.today || "2026-01-01", 2), [j.today]);
  const now_ = useOutcomes([studioId], thisQ.from, thisQ.to);
  const before = useOutcomes([studioId], lastQ.from, lastQ.to);
  const rule = (o: typeof now_) => ({ payAsYouGoCountsAs: o.paygRule[studioId] ?? ("retained" as const) });
  const thisTally = now_.loading || now_.error ? null : tallyOutcomes(now_.rows, rule(now_));
  const lastTally = before.loading || before.error ? null : tallyOutcomes(before.rows, rule(before));

  const lines: TrendLine[] = useMemo(
    () => [
      renewalOutcomesLine(thisTally, thisQ.label),
      longerPackageLine(thisTally, lastTally),
      j.ready ? startGroupsLine(startGroups(j.entries, j.today, j.tz, j.lines.lapsedDays), j.lines.lapsedDays) : { id: "starts", title: "Start groups", say: "Reading the studio's clients…", min: "", ready: false },
      j.ready ? studioRhythmLine(j.entries) : { id: "rhythm", title: "Studio rhythm", say: "Reading the studio's clients…", min: "", ready: false },
      lostReasonsLine(now_.loading || now_.error ? null : now_.rows),
      WIN_BACK_LINE,
      SIGNAL_CHECK_LINE,
    ],
    [thisTally, lastTally, thisQ.label, j.ready, j.entries, j.today, j.tz, now_.loading, now_.error, now_.rows],
  );

  return (
    <AdminScreen>
      <AdminHeader icon={<TrendingUp className="w-5 h-5" />} title="Trends" subtitle={`This quarter, ${thisQ.label}. Each line names the least it needs before it says anything.`} />
      <div className="ops-sec__card" role="list" aria-label="This quarter">
        {lines.map((l) => (
          <div key={l.id} className="ops-trend" role="listitem">
            <h3 className="ops-trend__t">{l.title}</h3>
            <p className="ops-line">{l.say}</p>
            {l.min && (
              <p className="ops-trend__min">
                <Scale className="w-3.5 h-3.5" aria-hidden />
                <span>{l.min}</span>
              </p>
            )}
          </div>
        ))}
      </div>
      <AdminInsightsTab studios={studios} trainers={trainers} activeStudioId={studioId} />
    </AdminScreen>
  );
}
