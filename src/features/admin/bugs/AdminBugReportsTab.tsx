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
 * WHY THE LIST IS NOT SORTED BY DATE
 * ----------------------------------
 * It is sorted by status first. A list where this morning's fixed report
 * outranks yesterday's open one is a list nobody can work from.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { Bug, Copy, RefreshCw, TriangleAlert } from "lucide-react";
import { db } from "../../../firebase";
import type { Studio } from "../../../types";
import type { FeedbackKind } from "../../feedback/types";
import { useToast } from "../../../contexts/ToastContext";
import {
  OperationType,
  handleFirestoreError,
} from "../../../lib/firestore-errors";
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
  AdminStatTile,
  AdminTiles,
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
  toReportView,
  type RawReport,
  type ReportFilter,
  type ReportStatus,
  type ReportView,
} from "./reportView";

/**
 * Enough to triage from without reading the whole collection. A beta feedback
 * inbox grows forever and nobody works a backlog past the first hundred; if
 * one is ever needed, the fix is a cursor, not a bigger number.
 */
const PAGE = 100;

const STATUS_TONE: Record<ReportStatus, "alert" | "warn" | "ok" | "neutral"> = {
  open: "alert",
  investigating: "warn",
  fixed: "ok",
  "wont-fix": "neutral",
};

interface Props {
  studios: Studio[];
}

export function AdminBugReportsTab({ studios }: Props) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [raw, setRaw] = useState<ReportView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReportFilter>(EMPTY_FILTER);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "bug_reports"),
          orderBy("createdAt", "desc"),
          limit(PAGE),
        ),
      );
      setRaw(
        snap.docs.map((d, i) =>
          toReportView({ id: d.id, ...(d.data() as RawReport) }, i),
        ),
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, "bug_reports");
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

  const setStatus = async (report: ReportView, status: ReportStatus) => {
    setSaving(report.id);
    try {
      await updateDoc(doc(db, "bug_reports", report.id), { status });
      setRaw((prev) =>
        prev.map((r) => (r.id === report.id ? { ...r, status } : r)),
      );
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

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Bug className="w-5 h-5" />}
        title="Bug reports"
        subtitle="What people told us, and what the app knew at the time."
        actions={
          <AdminButton onClick={() => void load()} busy={loading}>
            <RefreshCw className="w-3.5 h-3.5" />
            Reload
          </AdminButton>
        }
      />

      <AdminTiles>
        <AdminStatTile
          label="Open"
          value={counts.open}
          tone={counts.open > 0 ? "attention" : undefined}
          loading={loading}
        />
        <AdminStatTile
          label="Being looked at"
          value={counts.investigating}
          loading={loading}
        />
        <AdminStatTile
          label="With a stack trace"
          value={counts.withErrors}
          foot="Usually the actual answer"
          loading={loading}
        />
        <AdminStatTile
          label="Loaded"
          value={counts.total}
          foot={counts.total >= PAGE ? `Newest ${PAGE}` : "All of them"}
          loading={loading}
        />
      </AdminTiles>

      <AdminPanel title="Filter">
        <AdminGrid>
          <AdminField label="Status" htmlFor="bug-status">
            <AdminSelect
              id="bug-status"
              value={filter.status}
              onChange={(e) =>
                setFilter((f) => ({
                  ...f,
                  status: e.target.value as ReportFilter["status"],
                }))
              }
            >
              <option value="all">Any</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
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
        subtitle="Open work first, newest within each."
        flush
      >
        {loading ? (
          <AdminEmpty title="Loading…" />
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
                  </span>
                </button>

                {r.id === openId && open && (
                  <div className="adm-bug-detail">
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
                      <AdminField label="Status" htmlFor={`st-${open.id}`}>
                        <AdminSelect
                          id={`st-${open.id}`}
                          value={open.status}
                          disabled={saving === open.id}
                          onChange={(e) =>
                            void setStatus(open, e.target.value as ReportStatus)
                          }
                        >
                          {STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </AdminSelect>
                      </AdminField>
                      <AdminButton onClick={() => copy(open)}>
                        <Copy className="w-3.5 h-3.5" />
                        Copy as text
                      </AdminButton>
                    </div>
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
