/**
 * Body composition on the progress report (finalized view and print).
 *
 * Read live from the client's scans — the latest on or before the report's
 * date, against their first — rather than copied into the report document:
 * progressReports are readable by any signed-in user, and body composition
 * is health data that stays under the stricter scan rule. Someone who can't
 * open the client simply doesn't see this section.
 *
 * Styled to sit inside the navy report card, like features/progress-report's
 * MachineProgressionCard: white ink, translucent surfaces, the orange rule.
 */

import { Scale } from "lucide-react";
import { studioDayKeyOf, studioTodayKey } from "../../lib/studio-time";
import { useInBodyScans } from "./useInBodyScans";
import { InBodyTrend } from "./InBodyTrend";
import {
  changeBetween,
  changeTone,
  formatCalledChange,
  formatMeasure,
  reportInBody,
  scanDateLabel,
  sortScans,
  trendPoints,
  type MeasureKey,
} from "./scans";
import { callChange, type InBodyVariation } from "./variation";

const ROWS: { key: MeasureKey; label: string }[] = [
  { key: "weightLb", label: "Weight" },
  { key: "skeletalMuscleMassLb", label: "Skeletal Muscle Mass" },
  { key: "bodyFatMassLb", label: "Body Fat Mass" },
  { key: "percentBodyFat", label: "Percent Body Fat" },
];

const TONE = {
  good: "text-emerald-300 print:text-emerald-700",
  watch: "text-amber-200 print:text-amber-700",
  neutral: "text-white/60 print:text-[#0A2E46]/70",
} as const;

export function InBodyReportSection({
  clientId,
  reportDate: rawDate,
  variation,
}: {
  clientId: string | null | undefined;
  /** The report's `date`: a day key, or on older reports a timestamp or ISO string. */
  reportDate: unknown;
  /**
   * The client's HOME studio's InBody variation (variation.ts). The client
   * takes this report home, so a change the scanner can't tell from itself
   * is never printed as progress.
   */
  variation: InBodyVariation;
}) {
  const { scans } = useInBodyScans(clientId ?? null);
  const reportDate = studioDayKeyOf(rawDate as any) ?? studioTodayKey();
  const view = reportInBody(scans, reportDate);
  if (!view) return null;
  const { latest, first, count } = view;
  const upToReport = sortScans(scans).filter((s) => s.testedAt <= reportDate);
  // The footnote explains a label, so it follows what the cells PRINT: a row
  // reads "within normal variation" only for a non-zero change inside the
  // number — an exact zero prints "no change" (formatCalledChange).
  const anyWithin =
    first !== null &&
    ROWS.some((r) => {
      const delta = changeBetween(first, latest, r.key);
      return delta !== null && delta !== 0 && callChange(r.key, delta, variation) === "within";
    });

  return (
    <section className="space-y-3 break-inside-avoid">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-[#F06C22]" />
        <h3 className="shrink-0 text-[11px] font-bold uppercase tracking-[0.3em] text-[#F06C22]">Body Composition</h3>
        <div className="h-px flex-1 bg-[#F06C22]/20" />
      </div>
      <div className="overflow-hidden rounded-[20px] border border-white/10 bg-white/5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-widest text-white/60">
              <th className="p-3 text-left">InBody</th>
              {first && <th className="p-3 text-right">{scanDateLabel(first.testedAt, reportDate)}</th>}
              <th className="p-3 text-right">{scanDateLabel(latest.testedAt, reportDate)}</th>
              {first && <th className="p-3 text-right">Change</th>}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => {
              const delta = changeBetween(first, latest, r.key);
              return (
                <tr key={r.key} className="border-t border-white/10">
                  <td className="p-3 font-bold text-white">{r.label}</td>
                  {first && <td className="p-3 text-right tabular-nums text-white/60">{formatMeasure(first[r.key], r.key)}</td>}
                  <td className="p-3 text-right font-black tabular-nums text-white">{formatMeasure(latest[r.key], r.key)}</td>
                  {first && (
                    <td className={`p-3 text-right font-black tabular-nums ${TONE[changeTone(r.key, delta, variation)]}`}>
                      {formatCalledChange(delta, r.key, variation)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {anyWithin && (
        <p className={`text-[12px] ${TONE.neutral}`}>
          Within normal variation: smaller than the difference an InBody scanner can show between two scans of the same
          body, so it isn't counted as a change.
        </p>
      )}
      {count >= 2 && (
        <div className="grid grid-cols-1 gap-4 rounded-[20px] border border-white/10 bg-white/5 p-4 sm:grid-cols-3">
          <InBodyTrend points={trendPoints(upToReport, "weightLb")} measure="weightLb" label="Weight" minSpan={6} today={reportDate} variant="report" />
          <InBodyTrend
            points={trendPoints(upToReport, "skeletalMuscleMassLb")}
            measure="skeletalMuscleMassLb"
            label="Skeletal muscle"
            minSpan={3}
            today={reportDate}
            variant="report"
          />
          <InBodyTrend
            points={trendPoints(upToReport, "percentBodyFat")}
            measure="percentBodyFat"
            label="Body fat %"
            minSpan={3}
            today={reportDate}
            variant="report"
          />
        </div>
      )}
    </section>
  );
}
