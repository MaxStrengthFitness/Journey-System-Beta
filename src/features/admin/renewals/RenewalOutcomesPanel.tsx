/**
 * Operations → Renewals → Outcomes (proposal §4.2). Leaders only: the whole
 * Renewals tab is, and per-trainer renewal rates are for studio leaders only
 * (AJ, Sep 10 2026).
 *
 * Packages that closed in a quarter, and what happened: renewed, upgraded,
 * downgraded, pay-as-you-go or lost — by package, by trainer, and (for
 * someone who runs several) by studio. A trainer's line needs at least five
 * outcomes before it shows, and it is context, not a verdict.
 *
 * Outcomes come from the nightly job (a newer package in Mindbody, or the
 * studio's lost rule) and from leaders in the Renewal Brief. Nothing here
 * writes.
 */

import React, { useMemo, useState } from "react";
import { BarChart3, Info } from "lucide-react";
import {
  AdminField,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminSelect,
  AdminStatTile,
  AdminTiles,
} from "../primitives";
import { studioTodayKey } from "../../../lib/studio-time";
import type { Studio, Trainer } from "../../../types";
import {
  MIN_TRAINER_OUTCOMES,
  enoughToShow,
  groupTallies,
  rateText,
  recentQuarters,
  tallyOutcomes,
  type OutcomeRow,
  type OutcomeTally,
  type PaygRule,
} from "../../renewals/rates";
import { useOutcomes } from "../../renewals/useOutcomes";
import type { RenewalSettings } from "../../renewals/types";

export interface RenewalOutcomesPanelProps {
  studioId: string;
  settings: RenewalSettings;
  /** Every studio this leader runs, for the by-studio comparison. */
  studios: Studio[];
  trainers: Trainer[];
}

/** "8 renewed · 2 upgraded · 1 pay-as-you-go · 2 lost" — the parts that aren't zero. */
function breakdown(t: OutcomeTally): string {
  return [
    [t.renewed, "renewed"],
    [t.upgraded, "upgraded"],
    [t.downgraded, "downgraded"],
    [t.payAsYouGo, "pay-as-you-go"],
    [t.lost, "lost"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, w]) => `${n} ${w}`)
    .join(" · ");
}

function keptLine(t: OutcomeTally): string {
  return `${t.kept} of ${t.total} kept · ${rateText(t)}`;
}

export function RenewalOutcomesPanel({ studioId, settings, studios, trainers }: RenewalOutcomesPanelProps) {
  const today = studioTodayKey();
  const quarters = useMemo(() => recentQuarters(today, 4), [today]);
  const [quarterKey, setQuarterKey] = useState(quarters[0].key);
  const quarter = quarters.find((q) => q.key === quarterKey) ?? quarters[0];

  const compare = studios.length > 1;
  const ids = useMemo(
    () => (compare ? studios.map((s) => s.id).filter(Boolean) : [studioId]) as string[],
    [compare, studios, studioId],
  );
  const { rows: allRows, paygRule, loading, error } = useOutcomes(ids, quarter.from, quarter.to);

  const here = useMemo(() => allRows.filter((r) => r.studioId === studioId), [allRows, studioId]);
  const studioTally = tallyOutcomes(here, settings);
  const byPackage = groupTallies(here, (r) => r.packageKey, settings);
  const byTrainer = groupTallies(here, (r) => r.primaryTrainerId, settings);
  const shownTrainers = byTrainer.filter((g) => g.key !== null && enoughToShow(g.tally));
  const hiddenTrainers = byTrainer.filter((g) => g.key !== null && !enoughToShow(g.tally)).length;
  const unattributed = byTrainer.find((g) => g.key === null) ?? null;

  const eachStudio: PaygRule = (r: OutcomeRow) => paygRule[r.studioId ?? ""] ?? "retained";
  const byStudio = compare ? groupTallies(allRows, (r) => r.studioId, eachStudio) : [];

  const packageLabel = (key: string | null) =>
    settings.packages.find((p) => p.key === key)?.label ?? "Package not recognized";
  const trainerName = (id: string | null) => trainers.find((t) => t.id === id)?.fullName ?? "A former trainer";
  const studioName = (id: string | null) => studios.find((s) => s.id === id)?.name ?? "A studio";

  return (
    <div className="space-y-4">
      <div className="adm-subnav">
        <p className="adm-hint">
          Packages that closed in {quarter.label}, and what happened. Pay-as-you-go counts as{" "}
          {settings.payAsYouGoCountsAs === "retained" ? "kept" : "lost"} here (Settings).
        </p>
        <AdminField label="Quarter" htmlFor="outcomes-quarter">
          <AdminSelect id="outcomes-quarter" value={quarter.key} onChange={(e) => setQuarterKey(e.target.value)}>
            {quarters.map((q) => (
              <option key={q.key} value={q.key}>
                {q.label}
              </option>
            ))}
          </AdminSelect>
        </AdminField>
      </div>

      {error && <AdminNotice tone="warn">{error}</AdminNotice>}

      <AdminTiles>
        <AdminStatTile
          label="Kept"
          value={rateText(studioTally)}
          loading={loading}
          foot={studioTally.total ? `${studioTally.kept} of ${studioTally.total} closed packages` : "Nothing closed yet"}
        />
        <AdminStatTile label="Renewed" value={studioTally.renewed} loading={loading} foot="Same length again" />
        <AdminStatTile
          label="Upgraded"
          value={studioTally.upgraded}
          loading={loading}
          foot={studioTally.downgraded ? `${studioTally.downgraded} downgraded` : "To a longer package"}
        />
        <AdminStatTile
          label="Lost"
          value={studioTally.lost}
          loading={loading}
          tone={studioTally.lost ? "attention" : undefined}
          foot={studioTally.payAsYouGo ? `${studioTally.payAsYouGo} pay-as-you-go` : "No new package"}
        />
      </AdminTiles>

      <AdminPanel title="By package" subtitle="The package that closed." flush>
        {byPackage.length === 0 ? (
          <p className="adm-hint px-4 py-3">{loading ? "Loading…" : "No outcomes recorded for this quarter yet."}</p>
        ) : (
          <AdminRows>
            {byPackage.map((g) => (
              <AdminRow key={g.key ?? "none"} name={packageLabel(g.key)} meta={breakdown(g.tally)} trailing={keptLine(g.tally)} />
            ))}
          </AdminRows>
        )}
      </AdminPanel>

      <AdminPanel
        title="By trainer"
        subtitle={`Attributed to whoever coached the most visits in the package's last 90 days. Shown from ${MIN_TRAINER_OUTCOMES} outcomes.`}
        icon={<BarChart3 className="w-4 h-4" />}
        flush
      >
        <AdminNotice tone="info">
          <Info className="inline w-3.5 h-3.5 mr-1" />
          Context, not a verdict. A trainer's numbers depend on who they were given, how long those clients have
          trained, and what happened in their lives. Use them to ask better questions, not to rank people.
        </AdminNotice>
        {shownTrainers.length === 0 ? (
          <p className="adm-hint px-4 py-3">
            {loading ? "Loading…" : `No trainer has ${MIN_TRAINER_OUTCOMES} or more outcomes this quarter yet.`}
          </p>
        ) : (
          <AdminRows>
            {shownTrainers.map((g) => (
              <AdminRow key={g.key} name={trainerName(g.key)} meta={breakdown(g.tally)} trailing={keptLine(g.tally)} />
            ))}
          </AdminRows>
        )}
        {(hiddenTrainers > 0 || unattributed) && (
          <p className="adm-hint px-4 py-3">
            {hiddenTrainers > 0 &&
              `${hiddenTrainers} trainer${hiddenTrainers === 1 ? " has" : "s have"} fewer than ${MIN_TRAINER_OUTCOMES} outcomes and ${hiddenTrainers === 1 ? "isn't" : "aren't"} shown. `}
            {unattributed &&
              `${unattributed.tally.total} outcome${unattributed.tally.total === 1 ? " has" : "s have"} no trainer on record.`}
          </p>
        )}
      </AdminPanel>

      {compare && (
        <AdminPanel title="By studio" subtitle="Each studio counts pay-as-you-go by its own setting." flush>
          {byStudio.length === 0 ? (
            <p className="adm-hint px-4 py-3">{loading ? "Loading…" : "No outcomes recorded for this quarter yet."}</p>
          ) : (
            <AdminRows>
              {byStudio.map((g) => (
                <AdminRow key={g.key ?? "none"} name={studioName(g.key)} meta={breakdown(g.tally)} trailing={keptLine(g.tally)} />
              ))}
            </AdminRows>
          )}
        </AdminPanel>
      )}

      <p className="adm-hint">
        Recorded overnight when Mindbody shows a newer package, or when the studio's lost rule fires. Leaders can
        record or correct any outcome — including pay-as-you-go — in a client's Renewal Brief.
      </p>
    </div>
  );
}
