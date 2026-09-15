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
 */

import { useMemo } from "react";
import { Gift, TriangleAlert, CheckCheck } from "lucide-react";
import type { Client } from "../../types";
import { GESTURE_STATUS_LABEL, type FordUrgency } from "./types";
import { useDelightQueue, type DelightRow } from "./useClientFord";
import { FordMark, WhenChip } from "./ui";
import "./ford.css";

export interface DelightQueueProps {
  studioId: string | null;
  /** Streamed by the caller already — used to put a name to each row. */
  clients: Client[];
  onOpenClient?: (clientId: string) => void;
  includeDone?: boolean;
}

/** Days -> the bucket a row is filed under. */
function bucketOf(daysAway: number | null): FordUrgency {
  if (daysAway === null) return "none";
  if (daysAway <= 7) return "now";
  if (daysAway <= 30) return "soon";
  return "later";
}

const GROUP_LABEL: Record<FordUrgency, string> = {
  now: "This week",
  soon: "This month",
  later: "Later",
  none: "No date — whenever the moment is right",
  past: "Passed",
};

const GROUP_ORDER: FordUrgency[] = ["now", "soon", "later", "none"];

export function DelightQueue({
  studioId,
  clients,
  onOpenClient,
  includeDone = false,
}: DelightQueueProps) {
  const { rows, isLoading, needsIndex } = useDelightQueue({
    studioId,
    includeDone,
  });

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

  if (rows.length === 0) {
    return (
      <p className="ford-empty">
        Nothing on the list yet. A detail becomes a gesture from a client’s
        <strong> Life</strong> section — tap the gift on any detail and say what
        you would do about it.
      </p>
    );
  }

  return (
    <div className="ford-queue">
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
