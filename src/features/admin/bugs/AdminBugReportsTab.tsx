/**
 * Bug reports, with the diagnostics attached.
 *
 * Round: Admin Overhaul, Round 2 Phase 3 (Section 13).
 *
 * Replaces AdminBugReports (88 lines), which showed a description, an email
 * and a timestamp, and read `report.browser` / `report.platform` from the top
 * level of the document - fields the current writer has never written. The
 * whole badge row sat behind `if (report.browser || report.os)`, so it was
 * dead code, and every diagnostic features/feedback carefully collects was
 * discarded on the way to the only person who could act on it. See
 * bugs/reportView.ts.
 *
 * WHAT CHANGED BEYOND SHOWING THE DATA
 * ------------------------------------
 * · A status. `FeedbackReport.status` has always been typed open /
 *   investigating / fixed / wont-fix, and no screen ever set it, so every
 *   report was open forever and the list only grew. Triage needs a verb.
 * · A limit. The old fetch was `getDocs(orderBy('createdAt','desc'))` with no
 *   limit, reading the entire collection every time the tab opened. Beta
 *   feedback is exactly the collection that grows without bound.
 * · Copy as text. The useful half of a report is a dozen label/value pairs and
 *   a stack trace; retyping those into an issue is the friction that stops
 *   anyone filing it properly.
 *
 * THE ADMINS ROOM (Sep 28 2026)
 * -----------------------------
 * · The statuses have plain names — New · Looking into it · Fixed · Won't
 *   fix — as the design named them (reportView.ts). The stored values are
 *   unchanged. A new report is blue, not crimson: crimson is for what is
 *   critical or destructive, and a report nobody has read yet is neither.
 * · The count tiles became a sentence and a row of status chips with their
 *   counts, which are also the status filter; each report's status is set
 *   with four buttons instead of a select.
 * · A read that failed says so and offers Try again. It used to leave every
 *   tile at zero and say "No reports yet", which is the unknown that must
 *   never look like none.
 *
 * THE SECOND WAVE (Sep 28 2026, AJ "all yes")
 * -------------------------------------------
 * · A reply the reporter reads in the app: an opened report has Reply
 *   (BugReplyBox.tsx, bug-reply.ts), one field on the report, signed and
 *   dated; the reporter reads it on Settings → Your reports. Nothing is
 *   emailed.
 *
 * WHY THE LIST IS NOT SORTED BY DATE
 * ----------------------------------
 * It is sorted by status first. A list where this morning's fixed report
 * outranks yesterday's open one is a list nobody can work from.
 */

import React, { useEffect, useMemo, useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { Bug, Copy, RefreshCw, TriangleAlert } from "lucide-react";
import { db } from "../../../firebase";
import type { Studio } from "../../../types";
import type { FeedbackKind } from "../../feedback/types";
import { useToast } from "../../../contexts/ToastContext";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminGrid,
  AdminHeader,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminScreen,
  AdminSelect,
} from "../primitives";
import {
  EMPTY_FILTER,
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_ORDER,
  countReports,
  filterReports,
  orderReports,
  reportAsText,
  type ReportFilter,
  type ReportStatus,
  type ReportView,
} from "./reportView";
import { REPORTS_PAGE as PAGE, fetchRecentReports } from "./fetch-reports";
import { BugReplyBox } from "./BugReplyBox";
import "../../admins/admins.css";

const STATUS_TONE: Record<ReportStatus, "live" | "warn" | "ok" | "neutral"> = {
  open: "live",
  investigating: "warn",
  fixed: "ok",
  "wont-fix": "neutral",
};

interface Props {
  studios: Studio[];
  /** A status changed — the dashboard recounts what is new. */
  onChanged?: () => void;
  /** The signed-in administrator's name, signed on a reply. */
  replierName?: string;
}

export function AdminBugReportsTab({ studios, onChanged, replierName = "An administrator" }: Props) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [raw, setRaw] = useState<ReportView[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<ReportFilter>(EMPTY_FILTER);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      setRaw(await fetchRecentReports());
    } catch (err) {
      // Said on the screen, in words, with Try again — not in a technical
      // toast over it.
      console.error("Couldn't load bug reports", err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Loaded once on mount rather than streamed: a report is read minutes or
    // days after it is written, and a live listener on a collection that only
    // grows would cost a read per report per admin session for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => countReports(raw), [raw]);
  const shown = useMemo(
    () => orderReports(filterReports(raw, filter)),
    [raw, filter],
  );
  const open = shown.find((r) => r.id === openId) ?? null;
  const byStatus = (s: ReportStatus) => raw.filter((r) => r.status === s).length;

  const setStatus = async (report: ReportView, status: ReportStatus) => {
    if (report.status === status) return;
    setSaving(report.id);
    try {
      await updateDoc(doc(db, "bug_reports", report.id), { status });
      setRaw((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status } : r)),
      );
      onChanged?.();
    } catch (e: unknown) {
      toastError(
        `Could not update: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setSaving(null);
    }
  };

  const copy = (report: ReportView) => {
    const text = reportAsText(report, (ms) => new Date(ms).toLocaleString());
    navigator.clipboard.writeText(text).then(
      () => toastSuccess("Report copied, diagnostics and all."),
      () => toastError("Could not copy to the clipboard."),
    );
  };

  const sentence = loading
    ? "Reading the reports…"
    : failed
      ? null
      : counts.total === 0
        ? "No reports yet. Anything sent from the feedback button lands here."
        : `${counts.open === 0 ? "No new reports" : `${counts.open} new ${counts.open === 1 ? "report" : "reports"}`}, ${counts.investigating} being looked into. ${counts.withErrors} of ${counts.total} carry a stack trace, usually the actual answer. ${counts.total >= PAGE ? `The newest ${PAGE} are loaded.` : "All of them are loaded."}`;

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Bug className="w-5 h-5" />}
        title="Bug reports"
        subtitle="What people told us, and what the app knew at the time. Nothing is emailed to anyone; a status is for the people here."
        actions={
          <AdminButton onClick={() => void load()} busy={loading}>
            <RefreshCw className="w-3.5 h-3.5" />
            Reload
          </AdminButton>
        }
      />

      {failed ? (
        <AdminNotice tone="warn">
          <span className="flex flex-wrap items-center gap-3">
            <span>Couldn&apos;t load the bug reports just now, so there may be new ones.</span>
            <AdminButton size="sm" onClick={() => void load()}>
              Try again
            </AdminButton>
          </span>
        </AdminNotice>
      ) : (
        <p className="hq-standing" role="status">
          {sentence}
        </p>
      )}

      {!failed && !loading && counts.total > 0 && (
        <div className="hq-chips" role="group" aria-label="Show reports by status">
          {(["all", ...STATUS_ORDER] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={`hq-chip${filter.status === s ? " hq-chip--on" : ""}`}
              aria-pressed={filter.status === s}
              onClick={() => setFilter((f) => ({ ...f, status: s }))}
            >
              {s === "all" ? "All" : STATUS_LABEL[s]}
              <span className="hq-chip__count">{s === "all" ? raw.length : byStatus(s)}</span>
            </button>
          ))}
        </div>
      )}

      <AdminPanel title="Narrow the list">
        <AdminGrid>
          <AdminField label="Kind" htmlFor="bug-kind">
            <AdminSelect
              id="bug-kind"
              value={filter.kind}
              onChange={(e) =>
                setFilter((f) => ({
                  ...f,
                  kind: e.target.value as ReportFilter["kind"],
                }))
              }
            >
              <option value="all">Any</option>
              {(Object.keys(KIND_LABEL) as FeedbackKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label="Studio" htmlFor="bug-studio">
            <AdminSelect
              id="bug-studio"
              value={filter.studioId}
              onChange={(e) =>
                setFilter((f) => ({ ...f, studioId: e.target.value }))
              }
            >
              <option value="all">Any</option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label="Search" htmlFor="bug-search">
            <AdminInput
              id="bug-search"
              value={filter.search}
              onChange={(e) =>
                setFilter((f) => ({ ...f, search: e.target.value }))
              }
              placeholder="Words in the report, or who sent it"
            />
          </AdminField>
        </AdminGrid>
      </AdminPanel>

      <AdminPanel
        title={
          shown.length === raw.length
            ? "Reports"
            : `${shown.length} of ${raw.length} reports`
        }
        subtitle="New work first, newest within each."
        flush
      >
        {loading ? (
          <AdminEmpty title="Loading…" />
        ) : failed ? (
          <AdminEmpty title="Couldn't load the reports">Try again above.</AdminEmpty>
        ) : shown.length === 0 ? (
          <AdminEmpty title={raw.length === 0 ? "No reports yet" : "Nothing matches"}>
            {raw.length === 0
              ? "Anything sent from the feedback button lands here."
              : "Widen the filters above."}
          </AdminEmpty>
        ) : (
          <ul className="adm-bug-list">
            {shown.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={`adm-bug-row${r.id === openId ? " adm-bug-row--on" : ""}`}
                  onClick={() => setOpenId(r.id === openId ? null : r.id)}
                  aria-expanded={r.id === openId}
                >
                  <span className="adm-bug-row__head">
                    <AdminBadge tone={STATUS_TONE[r.status]}>
                      {STATUS_LABEL[r.status]}
                    </AdminBadge>
                    <AdminBadge>{r.kindLabel}</AdminBadge>
                    {r.errors.length > 0 && (
                      <AdminBadge tone="alert" icon={<TriangleAlert className="w-3 h-3" />}>
                        {r.errors.length} error
                        {r.errors.length === 1 ? "" : "s"}
                      </AdminBadge>
                    )}
                    <span className="adm-bug-row__when">
                      {r.createdAt
                        ? new Date(r.createdAt).toLocaleString()
                        : "Unrecorded time"}
                    </span>
                  </span>
                  <span className="adm-bug-row__desc">{r.description}</span>
                  <span className="adm-bug-row__who">
                    {r.reporter}
                    {r.studioName ? ` · ${r.studioName}` : ""}
                    {r.reply ? " · replied" : ""}
                  </span>
                </button>

                {r.id === openId && open && (
                  <div className="adm-bug-detail">
                    <p className="hq-standing">{open.description}</p>

                    {!open.hasDiagnostics && (
                      <AdminNotice tone="info">
                        This report carries no diagnostics. It was sent before
                        the feedback drawer started attaching them, or from a
                        browser that blocked every read.
                      </AdminNotice>
                    )}

                    {open.diagnostics.length > 0 && (
                      <dl className="adm-diag">
                        {open.diagnostics.map((d) => (
                          <React.Fragment key={d.label}>
                            <dt>{d.label}</dt>
                            <dd className={d.mono ? "adm-diag__mono" : undefined}>
                              {d.value}
                            </dd>
                          </React.Fragment>
                        ))}
                      </dl>
                    )}

                    {open.errors.length > 0 && (
                      <div className="adm-bug-errors">
                        <div className="adm-bug-errors__title">
                          Runtime errors, newest first
                        </div>
                        <ul>
                          {open.errors.map((e, i) => (
                            <li key={`${e.at}-${i}`}>
                              <span className="adm-bug-errors__type">
                                {e.type}
                              </span>
                              <span className="adm-bug-errors__msg">
                                {e.message}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="adm-bug-detail__actions">
                      <div className="hq-chips" role="group" aria-label="Status">
                        {STATUS_ORDER.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={`hq-chip${open.status === s ? " hq-chip--on" : ""}`}
                            aria-pressed={open.status === s}
                            disabled={saving === open.id}
                            onClick={() => void setStatus(open, s)}
                          >
                            {STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                      <AdminButton onClick={() => copy(open)}>
                        <Copy className="w-3.5 h-3.5" />
                        Copy as text
                      </AdminButton>
                    </div>

                    <BugReplyBox
                      key={open.id}
                      report={open}
                      replierName={replierName}
                      onSaved={(reply) => setRaw((prev) => prev.map((r) => (r.id === open.id ? { ...r, reply } : r)))}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
    </AdminScreen>
  );
}
