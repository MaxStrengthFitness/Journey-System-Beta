/**
 * The InBody card: a client's body composition, kept for good.
 *
 * Lives in the profile's Details tab, in the Medical section beside height
 * and weight. The printout's "Body Composition History" block keeps eight
 * tests; this keeps all of them, on the iPad, during a session.
 *
 *   - the latest scan's four headline numbers, each with its change since
 *     the first scan (muscle up and fat down in green)
 *   - weight, muscle and body-fat trend lines once there are two scans
 *   - every scan, newest first; tap one to correct or remove it
 *
 * Reading follows the client (whoever can open the profile). Recording and
 * removing follow features/inbody/access.ts, which mirrors firestore.rules.
 */

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { auth } from "../../firebase";
import { studioTodayKey } from "../../lib/studio-time";
import type { Client, Trainer } from "../../types";
import { useInBodyScans } from "./useInBodyScans";
import { InBodyScanDialog } from "./InBodyScanDialog";
import { InBodyTrend } from "./InBodyTrend";
import { canRecordInBody, canRemoveInBodyScan } from "./access";
import {
  changeBetween,
  changeTone,
  formatChange,
  formatMeasure,
  scanDateLabel,
  sortScans,
  summarizeScans,
  summarySentence,
  trendPoints,
  type ChangeTone,
  type MeasureKey,
} from "./scans";
import type { InBodyScan } from "./types";

const HEADLINE: { key: MeasureKey; label: string }[] = [
  { key: "weightLb", label: "Weight" },
  { key: "skeletalMuscleMassLb", label: "Skeletal muscle" },
  { key: "bodyFatMassLb", label: "Body fat mass" },
  { key: "percentBodyFat", label: "Body fat" },
];

/** The trend lines the printout draws, with the smallest span each shows. */
const TRENDS: { key: MeasureKey; label: string; minSpan: number }[] = [
  { key: "weightLb", label: "Weight", minSpan: 6 },
  { key: "skeletalMuscleMassLb", label: "Skeletal muscle", minSpan: 3 },
  { key: "percentBodyFat", label: "Body fat %", minSpan: 3 },
];

const TONE: Record<ChangeTone, string> = {
  good: "text-emerald-700 dark:text-emerald-400",
  watch: "text-amber-700 dark:text-amber-400",
  neutral: "text-muted-foreground",
};

const SUB = "font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground";

export interface InBodyCardProps {
  client: Client;
  authTrainer: Trainer | null;
}

export function InBodyCard({ client, authTrainer }: InBodyCardProps) {
  const today = studioTodayKey();
  const { scans, loading, error } = useInBodyScans(client.id ?? null);
  const ordered = useMemo(() => sortScans(scans), [scans]);
  const [editing, setEditing] = useState<InBodyScan | "new" | null>(null);
  const [showAll, setShowAll] = useState(false);

  const studioId = client.homeStudioId ?? null;
  const canRecord = canRecordInBody(authTrainer, studioId);
  const uid = auth.currentUser?.uid ?? null;

  const latest = ordered[ordered.length - 1] ?? null;
  const first = ordered.length >= 2 ? ordered[0] : null;
  const summary = useMemo(() => summarizeScans(ordered), [ordered]);
  const editingScan = editing && editing !== "new" ? editing : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={SUB}>Body composition · InBody</span>
        {canRecord && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 text-[11px] font-black uppercase tracking-widest text-sky-700 hover:bg-sky-500/15 dark:text-sky-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Add scan
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">Loading scans…</p>
        ) : !latest ? (
          <div className="flex items-start gap-3">
            <Scale className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No InBody scans yet.{" "}
              {canRecord
                ? "Add one from the printout — the trend lines, the Renewal Brief and progress reports pick it up from here."
                : "Trainers at this client's studio can add them from the printout."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-[12px] text-muted-foreground">
              Latest: <span className="font-bold text-slate-700 dark:text-slate-200">{scanDateLabel(latest.testedAt, today)}</span>
              {latest.device ? ` · ${latest.device}` : ""}
              {first ? ` · compared with the first scan, ${scanDateLabel(first.testedAt, today)}` : ""}
            </p>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {HEADLINE.map((h) => {
                const delta = changeBetween(first, latest, h.key);
                return (
                  <div key={h.key} className="min-w-0 rounded-xl bg-card p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
                      {h.label}
                    </p>
                    <p className="mt-1 text-xl font-black tabular-nums text-foreground">
                      {formatMeasure(latest[h.key], h.key)}
                    </p>
                    {delta !== null && (
                      <p className={cn("text-[12px] font-bold tabular-nums", TONE[changeTone(h.key, delta)])}>
                        {formatChange(delta, h.key)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {summary && summary.scanCount >= 2 && (
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{summarySentence(summary, today)}</p>
            )}

            {ordered.length >= 2 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {TRENDS.map((t) => (
                  <InBodyTrend
                    key={t.key}
                    points={trendPoints(ordered, t.key)}
                    measure={t.key}
                    label={t.label}
                    minSpan={t.minSpan}
                    today={today}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">Trend lines appear after the second scan.</p>
            )}

            <div>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="inline-flex min-h-10 items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-slate-800 dark:hover:text-slate-200"
              >
                {showAll ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Every scan ({ordered.length})
              </button>
              {showAll && (
                <ul className="mt-1 divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-card dark:divide-slate-800 dark:border-slate-800">
                  {[...ordered].reverse().map((s) => {
                    const row = (
                      <>
                        <span className="w-28 shrink-0 font-bold text-slate-800 dark:text-slate-100">
                          {scanDateLabel(s.testedAt, today)}
                        </span>
                        <span className="min-w-0 flex-1 truncate tabular-nums text-slate-600 dark:text-slate-300">
                          {formatMeasure(s.weightLb, "weightLb")} · muscle {formatMeasure(s.skeletalMuscleMassLb, "skeletalMuscleMassLb")} · fat{" "}
                          {formatMeasure(s.percentBodyFat, "percentBodyFat")}
                        </span>
                        <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                          {s.enteredByName || ""}
                        </span>
                      </>
                    );
                    return (
                      <li key={s.id}>
                        {canRecord ? (
                          <button
                            type="button"
                            onClick={() => setEditing(s)}
                            className="flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
                            aria-label={`Correct or remove the ${scanDateLabel(s.testedAt, today)} scan`}
                          >
                            {row}
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                          </button>
                        ) : (
                          <div className="flex min-h-11 items-center gap-3 px-3 text-sm">{row}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {canRecord && (
        <InBodyScanDialog
          open={editing !== null}
          onClose={() => setEditing(null)}
          client={client}
          scan={editingScan}
          scans={ordered}
          authTrainer={authTrainer}
          canRemove={editingScan ? canRemoveInBodyScan(authTrainer, uid, editingScan, studioId) : false}
        />
      )}
    </div>
  );
}
