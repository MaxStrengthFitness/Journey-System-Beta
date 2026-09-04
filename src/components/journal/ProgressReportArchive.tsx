/**
 * Progress report archive.
 *
 * Demoted to a sidebar card: it is a reference shelf, not a daily read, and it
 * was previously competing for vertical space with the timeline.
 */
import React from "react";
import { FileText, HeartPulse, Plus, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import type { ProgressReport } from "../../types";

export interface ProgressReportArchiveProps {
  reports: ProgressReport[];
  onSelect: (id: string) => void;
  onDelete: (report: ProgressReport) => void;
  onNew: () => void;
}

export function ProgressReportArchive({
  reports,
  onSelect,
  onDelete,
  onNew,
}: ProgressReportArchiveProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Progress reports
          </h3>
          <p className="text-[11px] text-slate-400">
            {reports.length} on file
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-3 text-[10px] font-black uppercase tracking-wider text-sky-600 transition-colors hover:bg-sky-500/20 dark:text-sky-300"
        >
          <Plus className="h-3 w-3" /> New
        </button>
      </div>

      {reports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-[11px] text-slate-400 dark:border-slate-800">
          No evaluations yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {reports.map((r) => {
            const summary = r.subjective?.summary;
            const overall = summary?.overall.status ?? null;
            const redFlags = summary?.flags.filter((f) => f.severity === "red").length ?? 0;
            const dot =
              overall === "green"
                ? "bg-emerald-500"
                : overall === "yellow"
                  ? "bg-amber-500"
                  : overall === "red"
                    ? "bg-rose-500"
                    : null;
            return (
            <li
              key={r.id}
              className="group flex items-center gap-2.5 rounded-xl border border-slate-200 p-2.5 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-800/50"
            >
              <button
                type="button"
                onClick={() => r.id && onSelect(r.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-slate-700 dark:text-slate-200">
                    {r.isCheckInOnly
                      ? `Check-in${r.checkInOrigin === "pre_session" ? " · pre-session" : r.checkInOrigin === "post_session" ? " · post-session" : ""}`
                      : `Session #${r.sessionNumber || "—"}`}
                    <span
                      className={cn(
                        "ml-1.5 rounded px-1 py-0.5 text-[9px] font-black uppercase tracking-wider",
                        r.status === "Draft"
                          ? "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
                      )}
                    >
                      {r.status || "Finalized"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    {r.date} · {r.trainerInitials || r.trainerName || "Team"}
                    {/* 90-day check-in: overall colour + red-flag count, from the cached summary. */}
                    {summary && (
                      <span
                        className="inline-flex items-center gap-1 rounded px-1 py-0.5 bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        title={`Check-in ${summary.overall.legacyScore ?? "—"} / 96${redFlags ? ` · ${redFlags} red flag${redFlags > 1 ? "s" : ""}` : ""}`}
                      >
                        <HeartPulse className="h-2.5 w-2.5" />
                        {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />}
                        {summary.overall.legacyScore ?? "—"}
                        {redFlags > 0 && <span className="font-black text-rose-500">!{redFlags}</span>}
                      </span>
                    )}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(r)}
                aria-label="Delete report"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 opacity-0 transition-all hover:bg-rose-500/10 hover:text-rose-500 group-hover:opacity-100 dark:text-slate-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
