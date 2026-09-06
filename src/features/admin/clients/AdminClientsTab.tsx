/**
 * System Clients.
 *
 * Every read on this screen is bounded, and the two unbounded shapes are
 * refused rather than made slow. Why each guard exists is in clientQuery.ts,
 * which is where the policy is tested; this file is the screen.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getCountFromServer,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { Search, Users } from "lucide-react";
import { db } from "../../../firebase";
import type { Client, Studio } from "../../../types";
import { useDebounce } from "../../../hooks/useDebounce";
import { isMergedAway } from "../provisional/reconcile";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminHeader,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminScreen,
  AdminSelect,
} from "../primitives";
import {
  budgetLeft,
  matchesClient,
  newBudget,
  planClientQuery,
  spend,
  summarisePage,
  type ReadBudget,
} from "./clientQuery";

/** Long enough that a name is finished, short enough not to feel laggy. */
const SEARCH_DEBOUNCE_MS = 400;

export interface AdminClientsTabProps {
  studios: Studio[];
  activeStudioId: string | null;
  onNavigateProfile?: (clientId: string) => void;
}

export function AdminClientsTab({
  studios,
  activeStudioId,
  onNavigateProfile,
}: AdminClientsTabProps) {
  // Defaults to the studio you are in, never to the whole network. The old
  // screen defaulted to "all" and counted the entire collection on mount.
  const [studioId, setStudioId] = useState<string | null>(activeStudioId);
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebounce(rawSearch, SEARCH_DEBOUNCE_MS);

  const [rows, setRows] = useState<Client[]>([]);
  const [readCount, setReadCount] = useState(0);
  const [budget, setBudget] = useState<ReadBudget>(() => newBudget());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mayHaveMore, setMayHaveMore] = useState(false);
  const [studioTotal, setStudioTotal] = useState<number | null>(null);

  const cursor = useRef<QueryDocumentSnapshot | null>(null);
  /** Discards a reply that a newer request has already superseded. */
  const seq = useRef(0);

  const plan = useMemo(
    () => planClientQuery({ studioId, search, budget }),
    [studioId, search, budget],
  );

  const runQuery = useCallback(
    async (mode: "reset" | "more", extended = false) => {
      const active = planClientQuery({
        studioId,
        search,
        budget,
        extended,
      });
      if (active.refusal) return;

      const reqId = ++seq.current;
      setLoading(true);
      setError(null);
      try {
        const constraints: any[] = [];
        if (active.studioId) {
          constraints.push(where("homeStudioId", "==", active.studioId));
        }
        if (active.prefix) {
          constraints.push(where("lastName", ">=", active.prefix));
          // \uf8ff is the last character in Firestore's range, so this is
          // "every surname starting with the prefix". Written as an escape
          // rather than the literal, which is invisible in an editor.
          constraints.push(
            where("lastName", "<=", active.prefix + "\uf8ff"),
          );
        }
        constraints.push(orderBy("lastName"));
        if (mode === "more" && cursor.current) {
          constraints.push(startAfter(cursor.current));
        }
        constraints.push(fsLimit(active.pageSize));

        const snap = await getDocs(query(collection(db, "clients"), ...constraints));
        if (reqId !== seq.current) return;

        cursor.current = snap.docs[snap.docs.length - 1] ?? cursor.current;
        const page = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }) as Client)
          // A merged-away temporary profile is not a person any more.
          .filter((c) => !isMergedAway(c))
          .filter((c) => matchesClient(c, search));

        setRows((prev) => (mode === "reset" ? page : [...prev, ...page]));
        setReadCount((prev) => (mode === "reset" ? snap.size : prev + snap.size));
        setBudget((prev) =>
          mode === "reset"
            ? spend(newBudget(), snap.size)
            : spend(prev, snap.size),
        );
        setMayHaveMore(summarisePage(snap.size, page.length, active.pageSize).mayHaveMore);
      } catch (err: any) {
        if (reqId !== seq.current) return;
        setError(
          err?.code === "failed-precondition"
            ? "This query needs a Firestore index that is not deployed yet — clients(homeStudioId, lastName)."
            : (err?.message ?? "Could not load clients."),
        );
      } finally {
        if (reqId === seq.current) setLoading(false);
      }
    },
    [studioId, search, budget],
  );

  // One effect, keyed on the two things that actually change the answer.
  // The old screen's effect depended on the raw search box, so it fired a
  // query per keystroke.
  useEffect(() => {
    cursor.current = null;
    setRows([]);
    setReadCount(0);
    setMayHaveMore(false);
    setBudget(newBudget());
    const p = planClientQuery({ studioId, search, budget: newBudget() });
    if (!p.refusal) void runQuery("reset");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioId, search]);

  /** One count, scoped to the studio, and only when a studio is chosen. */
  useEffect(() => {
    if (!studioId) {
      setStudioTotal(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const snap = await getCountFromServer(
          query(collection(db, "clients"), where("homeStudioId", "==", studioId)),
        );
        if (!cancelled) setStudioTotal(snap.data().count);
      } catch {
        if (!cancelled) setStudioTotal(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studioId]);

  const studioName =
    studios.find((s) => s.id === studioId)?.name ?? "the whole network";

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Users className="w-5 h-5" />}
        title="Clients"
        subtitle="Everyone on the books. Scoped to one studio by default, because listing the whole network reads every client document."
        actions={
          <AdminBadge tone="neutral">
            {studioTotal === null
              ? "—"
              : `${studioTotal} at ${studios.find((s) => s.id === studioId)?.name ?? "this studio"}`}
          </AdminBadge>
        }
      />

      <AdminPanel
        title="Find someone"
        flush
        actions={
          <AdminBadge tone="neutral">
            {readCount} read · {budgetLeft(budget)} left
          </AdminBadge>
        }
      >
        <div className="p-3.5 flex flex-wrap gap-3 items-end">
          <div className="adm-field" style={{ flex: "1 1 240px" }}>
            <label className="adm-label" htmlFor="client-search">
              <Search className="w-3.5 h-3.5" />
              Name, email or Mindbody id
            </label>
            <AdminInput
              id="client-search"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Search"
            />
          </div>
          <div className="adm-field" style={{ flex: "0 1 220px" }}>
            <label className="adm-label" htmlFor="client-studio">
              Studio
            </label>
            <AdminSelect
              id="client-studio"
              value={studioId ?? ""}
              onChange={(e) => setStudioId(e.target.value || null)}
            >
              <option value="">Every studio (search required)</option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </AdminSelect>
          </div>
        </div>

        {plan.refusal && (
          <div className="px-3.5 pb-3.5">
            <AdminNotice
              tone={plan.refusal.code === "needs-filter" ? "info" : "warn"}
            >
              {plan.refusal.message}
              {plan.refusal.code === "budget-spent" && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="underline font-bold"
                    onClick={() => void runQuery("more", true)}
                  >
                    Keep going
                  </button>
                </>
              )}
            </AdminNotice>
          </div>
        )}

        {error && (
          <div className="px-3.5 pb-3.5">
            <AdminNotice tone="alert">{error}</AdminNotice>
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className="p-4 flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="adm-skeleton" style={{ height: 44 }} />
            ))}
          </div>
        ) : rows.length === 0 && !plan.refusal ? (
          <div className="p-4">
            <AdminEmpty title="Nobody found">
              {search
                ? `Nothing matching "${search}" in ${studioName}. ${readCount} record${readCount === 1 ? "" : "s"} were read.`
                : "This studio has no clients yet."}
            </AdminEmpty>
          </div>
        ) : (
          <AdminRows>
            {rows.map((c) => (
              <AdminRow
                key={c.id}
                onClick={
                  onNavigateProfile && c.id
                    ? () => onNavigateProfile(c.id!)
                    : undefined
                }
                name={`${c.firstName} ${c.lastName}`.trim()}
                meta={
                  <>
                    {studios.find((s) => s.id === c.homeStudioId)?.name ??
                      "No studio"}
                    {c.mindbodyClientId || c.mindbodyId
                      ? ` · Mindbody ${c.mindbodyClientId || c.mindbodyId}`
                      : " · not in Mindbody"}
                  </>
                }
                trailing={
                  c.provisional ? (
                    <AdminBadge tone="warn">Temporary</AdminBadge>
                  ) : c.isActive ? (
                    <AdminBadge tone="ok">Active</AdminBadge>
                  ) : (
                    <AdminBadge tone="neutral">Inactive</AdminBadge>
                  )
                }
              />
            ))}
          </AdminRows>
        )}

        {mayHaveMore && !plan.refusal && (
          <div className="p-3.5" style={{ borderTop: "1px solid var(--adm-border)" }}>
            <AdminButton
              variant="quiet"
              busy={loading}
              onClick={() => void runQuery("more")}
            >
              Load more
            </AdminButton>
            {search && readCount > rows.length && (
              <span className="adm-hint" style={{ marginLeft: 10 }}>
                Showing {rows.length} of {readCount} read — the search narrows on
                surname, so a first-name match may be further down.
              </span>
            )}
          </div>
        )}
      </AdminPanel>
    </AdminScreen>
  );
}
