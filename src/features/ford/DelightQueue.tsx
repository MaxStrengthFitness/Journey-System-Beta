/**
 * THE DELIGHT QUEUE — what is coming up across the whole studio.
 *
 * Everything the team has promised itself it would do something about, for
 * every client at one studio, in date order. This is the screen that turns
 * FORD from a nicely organised filing cabinet into the anniversary dinner
 * somebody actually paid for.
 *
 * It answers a leader's question, not a trainer's: "whose gesture is due this
 * week, and does anyone own it?" — which sits alongside the other three
 * Monday-morning questions (renewals, attendance anomalies, pain reports).
 *
 * HOW IT READS THE DATA
 * ---------------------
 * A collection group query over every `clients/{id}/ford` subcollection,
 * scoped to one studio. The rules require that studio filter, so the query is
 * refused rather than quietly returning a franchise's worth of other people's
 * families. That is the whole reason FORD is a subcollection: the data stays
 * under the client, inheriting the tightest privacy boundary in the app, and
 * is still sweepable across the floor in one read.
 *
 * Undated ideas are deliberately kept. "Wishes they had help with the garden"
 * has no date and is one of the best gestures on the list.
 *
 * ROW ACTIONS (Operations round, Sep 2026). The audit's one finding about
 * this screen was that it was the only Operations tab with nothing to do
 * on it — the owner and the status were set on the client's Life section,
 * so "Needs an owner" had no way to give it one. Now a row offers: Take it
 * (make it mine, planned), hand it to someone at the studio, Done (with
 * what actually happened — the part worth reading a year later), Pass.
 * Every write goes through setGestureStatus, the same writer the client's
 * record uses, so the rollup on the client document follows. The "Passed"
 * bucket — a dated gesture the team missed — shows at the top, and the
 * finished ones can be shown with a switch.
 */

import { useMemo, useState } from "react";
import { Gift, TriangleAlert, CheckCheck, Check, Hand, X } from "lucide-react";
import type { Client, Trainer } from "../../types";
import { worksAt } from "../renewals/permissions";
import { GESTURE_STATUS_LABEL, type FordOpportunity, type FordUrgency } from "./types";
import { setGestureStatus } from "./ford-write";
import { useDelightQueue, type DelightRow } from "./useClientFord";
import { FordMark, WhenChip } from "./ui";
import "./ford.css";

export interface DelightQueueProps {
  studioId: string | null;
  /** Streamed by the caller already — used to put a name to each row. */
  clients: Client[];
  onOpenClient?: (clientId: string) => void;
  includeDone?: boolean;
  /** The signed-in person — "Take it" makes them the owner. Sign with the Auth uid. */
  me?: { id: string; name: string } | null;
  /** Everyone; the hand-off list is those who work at the studio. */
  trainers?: Trainer[];
}

/** Days -> the bucket a row is filed under. */
function bucketOf(daysAway: number | null): FordUrgency {
  if (daysAway === null) return "none";
  if (daysAway < 0) return "past";
  if (daysAway <= 7) return "now";
  if (daysAway <= 30) return "soon";
  return "later";
}

const GROUP_LABEL: Record<FordUrgency, string> = {
  past: "Passed — still open",
  now: "This week",
  soon: "This month",
  later: "Later",
  none: "No date — whenever the moment is right",
};

const GROUP_ORDER: FordUrgency[] = ["past", "now", "soon", "later", "none"];

export function DelightQueue({
  studioId,
  clients,
  onOpenClient,
  includeDone = false,
  me = null,
  trainers = [],
}: DelightQueueProps) {
  const [showDone, setShowDone] = useState(includeDone);
  const { rows, isLoading, needsIndex } = useDelightQueue({
    studioId,
    includeDone: showDone,
  });
  const staff = useMemo(
    () =>
      trainers
        .filter((t) => t.id && !t.supersededByUid && worksAt(t, studioId))
        .map((t) => ({ id: t.authUid ?? t.id, name: t.fullName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [trainers, studioId],
  );

  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of clients) {
      map.set(c.id, [c.firstName, c.lastName].filter(Boolean).join(" ") || "Client");
    }
    return map;
  }, [clients]);

  const groups = useMemo(() => {
    const out = new Map<FordUrgency, DelightRow[]>();
    for (const row of rows) {
      const key = bucketOf(row.daysAway);
      const list = out.get(key) ?? [];
      list.push(row);
      out.set(key, list);
    }
    return out;
  }, [rows]);

  if (needsIndex) {
    return (
      <div className="ford-tray" role="status">
        <TriangleAlert size={16} className="text-[var(--ford-unfiled)] shrink-0" />
        <div>
          <strong>The queue needs its index.</strong> Run{" "}
          <code>firebase deploy --only firestore:indexes</code> — this view
          reads across every client at the studio at once, which Firestore
          needs a collection group index for.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <p className="ford-empty">Reading the studio’s list…</p>;
  }

  const toolbar = (
    <div className="ford-queue__toolbar">
      <label className="ford-queue__toggle">
        <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
        Show what is done
      </label>
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="ford-queue">
        {toolbar}
        <p className="ford-empty">
          Nothing on the list yet. A detail becomes a gesture on a client’s
          <strong> FORD</strong> page: Add an idea under Going above and beyond,
          or open a detail and choose Do something about it.
        </p>
      </div>
    );
  }

  return (
    <div className="ford-queue">
      {toolbar}
      {GROUP_ORDER.map((key) => {
        const list = groups.get(key);
        if (!list?.length) return null;
        return (
          <div key={key}>
            <div className="ford-queue__group-label">
              {GROUP_LABEL[key]} · {list.length}
            </div>
            <div className="flex flex-col gap-1.5">
              {list.map(({ entry, daysAway }) => {
                const opp = entry.opportunity;
                const unowned = opp && !opp.ownerTrainerId;
                return (
                  <article key={entry.id} className="ford-queue__row">
                    <FordMark pillar={entry.pillar} size={34} />
                    <div className="ford-queue__main">
                      <button
                        type="button"
                        className="ford-queue__client text-left"
                        onClick={() => onOpenClient?.(entry.clientId)}
                      >
                        {nameOf.get(entry.clientId) ?? "Client"}
                      </button>
                      <div className="ford-queue__idea">
                        {opp?.idea || entry.body}
                      </div>
                      {opp?.idea ? (
                        <div className="ford-queue__detail">“{entry.body}”</div>
                      ) : null}
                      {opp?.status === "done" && opp.outcome ? (
                        <div className="ford-queue__detail ford-queue__outcome">
                          <CheckCheck size={12} />
                          <span>{opp.outcome}</span>
                        </div>
                      ) : null}
                    </div>
                    <div className="ford-queue__side">
                      <WhenChip
                        date={entry.eventDate}
                        recurrence={entry.recurrence}
                      />
                      <span
                        className={`ford-gesture ford-gesture--${opp?.status ?? "idea"}`}
                      >
                        <Gift size={11} />
                        {opp ? GESTURE_STATUS_LABEL[opp.status] : "Idea"}
                      </span>
                      {unowned ? (
                        <span className="ford-queue__owner ford-queue__owner--none">
                          Needs an owner
                        </span>
                      ) : opp?.ownerName ? (
                        <span className="ford-queue__owner">{opp.ownerName}</span>
                      ) : null}
                    </div>
                    {opp && opp.status !== "done" && opp.status !== "declined" && (
                      <RowActions entry={{ id: entry.id, clientId: entry.clientId }} opp={opp} me={me} staff={staff} />
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Row actions
 * ------------------------------------------------------------------ */

function RowActions({
  entry,
  opp,
  me,
  staff,
}: {
  entry: { id: string; clientId: string };
  opp: FordOpportunity;
  me: { id: string; name: string } | null;
  staff: Array<{ id: string; name: string }>;
}) {
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState("");
  const mine = Boolean(me && opp.ownerTrainerId === me.id);

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ford-queue__actions">
      {closing ? (
        <div className="ford-queue__close">
          <input
            className="ford-capture__field"
            style={{ minHeight: 40 }}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="What actually happened? Worth a sentence."
            autoFocus
          />
          <div className="ford-queue__buttons">
            <button
              type="button"
              className="ford-btn ford-btn--primary"
              disabled={busy}
              onClick={() => void run(() => setGestureStatus(entry.clientId, entry.id, opp, "done", { outcome, owner: opp.ownerTrainerId ? undefined : me }))}
            >
              <Check size={14} /> Done
            </button>
            <button type="button" className="ford-btn ford-btn--ghost" disabled={busy} onClick={() => setClosing(false)}>
              Not yet
            </button>
          </div>
        </div>
      ) : (
        <div className="ford-queue__buttons">
          {me && !mine && (
            <button
              type="button"
              className="ford-btn"
              disabled={busy}
              onClick={() => void run(() => setGestureStatus(entry.clientId, entry.id, opp, opp.status === "idea" ? "planned" : opp.status, { owner: me }))}
            >
              <Hand size={14} /> Take it
            </button>
          )}
          {staff.length > 0 && (
            <select
              className="ford-queue__owner-select"
              aria-label="Hand it to"
              value=""
              disabled={busy}
              onChange={(e) => {
                const who = staff.find((t) => t.id === e.target.value);
                if (who) void run(() => setGestureStatus(entry.clientId, entry.id, opp, opp.status === "idea" ? "planned" : opp.status, { owner: who }));
              }}
            >
              <option value="">Hand it to…</option>
              {staff.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="ford-btn" disabled={busy} onClick={() => setClosing(true)}>
            <Check size={14} /> Done
          </button>
          <button
            type="button"
            className="ford-btn ford-btn--ghost"
            disabled={busy}
            onClick={() => void run(() => setGestureStatus(entry.clientId, entry.id, opp, "declined"))}
          >
            <X size={14} /> Pass
          </button>
        </div>
      )}
    </div>
  );
}
