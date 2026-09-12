/**
 * Operations → Renewals → Pipeline (proposal §4.2).
 *
 * Four numbers across the top, then lanes by how soon something is lost:
 * before the charge, talk now, coming up (by month), and the win-back list.
 * Each row: who, their package on both clocks in one line, the latest
 * leaning, one line of proof, and the next step. Tap a row for the Brief.
 *
 * Reads the nightly snapshots (one query for the studio) and the cycle
 * documents for just the clients on screen. Nothing here writes.
 */

import React, { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, ChevronRight, Users } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminStatTile,
  AdminTiles,
} from "../primitives";
import { addDays } from "../../client-history/model";
import { studioTodayKey } from "../../../lib/studio-time";
import {
  FILTER_LABELS,
  LANE_HINTS,
  LANE_TITLES,
  LAPSED_LOOKBACK_DAYS,
  byMonth,
  horizonEnd,
  laneOf,
  matchesFilter,
  nextStep,
  sortRows,
  type PipelineFilter,
  type PipelineLane,
  type PipelineRow,
} from "../../renewals/pipeline";
import { chipText, proofSentence, SITUATION_TONE } from "../../renewals/sentences";
import { latestLine } from "../../renewals/conversation";
import {
  useCyclesFor,
  useMissingDataClients,
  useMissingDataCount,
  usePipelineClients,
} from "../../renewals/usePipeline";
import type { RenewalSettings } from "../../renewals/types";
import type { Client } from "../../../types";
import "./renewals.css";

const FILTERS: PipelineFilter[] = ["all", "needs-leader", "price", "upgrade", "not-talked"];

const TONE_BADGE: Record<string, "ok" | "warn" | "alert" | "neutral"> = {
  ok: "ok",
  warn: "warn",
  alert: "alert",
  neutral: "neutral",
};

export interface RenewalsPipelineProps {
  studioId: string;
  studioName: string;
  settings: RenewalSettings;
  /** Opens the Renewal Brief for this client. */
  onOpenBrief: (client: Client) => void;
}

export function RenewalsPipeline({ studioId, studioName, settings, onOpenBrief }: RenewalsPipelineProps) {
  const today = studioTodayKey();
  const from = addDays(today, -LAPSED_LOOKBACK_DAYS);
  const to = horizonEnd(settings, today);
  const { clients, loading, error } = usePipelineClients(studioId, from, to);
  const cycles = useCyclesFor(
    studioId,
    clients.map((c) => c.renewal?.cycleKey ?? "").filter(Boolean),
  );
  const missingCount = useMissingDataCount(studioId, clients.length);
  const [showMissing, setShowMissing] = useState(false);
  const missingClients = useMissingDataClients(studioId, showMissing);
  const [filter, setFilter] = useState<PipelineFilter>("all");
  const [showQuiet, setShowQuiet] = useState<Record<string, boolean>>({});

  const clientsById = useMemo(() => new Map(clients.filter((c) => c.id).map((c) => [c.id as string, c])), [clients]);

  const rows = useMemo(() => {
    const out: PipelineRow[] = [];
    for (const c of clients) {
      const s = c.renewal;
      if (!s || !c.id) continue;
      const cycle = s.cycleKey ? cycles[s.cycleKey] ?? null : null;
      const lane = laneOf(s, cycle, settings, today);
      if (!lane) continue;
      out.push({ clientId: c.id, name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(), snapshot: s, cycle, lane });
    }
    return out;
  }, [clients, cycles, settings, today]);

  const visible = rows.filter((r) => matchesFilter(r, filter, settings));
  const inLane = (lane: PipelineLane) => sortRows(visible.filter((r) => r.lane === lane));
  const count = (lane: PipelineLane) => rows.filter((r) => r.lane === lane).length;

  const renderRow = (r: PipelineRow) => {
    const s = r.snapshot;
    const latest = latestLine(r.cycle, today);
    const proof = proofSentence(s);
    return (
      <AdminRow
        key={r.clientId}
        onClick={() => {
          const c = clientsById.get(r.clientId);
          if (c) onOpenBrief(c);
        }}
        name={
          <span className="inline-flex flex-wrap items-center gap-2">
            {r.name}
            {r.cycle?.needsLeader && <AdminBadge tone="warn">Needs a leader</AdminBadge>}
          </span>
        }
        meta={
          <span className="flex flex-col gap-0.5">
            <span>
              {s.packageLabel ? `${s.packageLabel.split(" · ")[0]} · ` : ""}
              {chipText(s, today)}
            </span>
            <span>{latest ?? "Nobody has talked to them yet"}</span>
            {proof && <span>{proof}</span>}
            <span className="font-semibold">{nextStep(s, r.cycle, settings, today)}</span>
          </span>
        }
        trailing={
          <span className="inline-flex items-center gap-2">
            <AdminBadge tone={TONE_BADGE[SITUATION_TONE[s.situation]]}>{situationWord(s.situation)}</AdminBadge>
            <ChevronRight className="w-4 h-4 opacity-50" />
          </span>
        }
      />
    );
  };

  const lanePanel = (lane: PipelineLane, quiet = false) => {
    const list = inLane(lane);
    const open = !quiet || showQuiet[lane];
    return (
      <AdminPanel
        key={lane}
        title={`${LANE_TITLES[lane]} · ${list.length}`}
        subtitle={LANE_HINTS[lane]}
        flush
        actions={
          quiet && list.length > 0 ? (
            <AdminButton variant="ghost" size="sm" onClick={() => setShowQuiet((p) => ({ ...p, [lane]: !p[lane] }))}>
              {open ? "Hide" : "Show"}
            </AdminButton>
          ) : undefined
        }
      >
        {!open ? null : list.length === 0 ? (
          <AdminEmpty title="Nobody here">{filter === "all" ? "Nothing in this lane right now." : "Nobody matches this filter."}</AdminEmpty>
        ) : lane === "coming-up" ? (
          byMonth(list).map((g) => (
            <div key={g.month}>
              <p className="adm-label px-4 pt-3">{g.label}</p>
              <AdminRows>{g.rows.map(renderRow)}</AdminRows>
            </div>
          ))
        ) : (
          <AdminRows>{list.map(renderRow)}</AdminRows>
        )}
      </AdminPanel>
    );
  };

  return (
    <div className="space-y-4">
      {error && <AdminNotice tone="warn">{error}</AdminNotice>}

      <AdminTiles>
        <AdminStatTile label="Before the charge" value={count("before-charge")} loading={loading} tone={count("before-charge") ? "attention" : undefined} foot="Banked sessions, charge inside your window" />
        <AdminStatTile label="Talk now" value={count("talk-now")} loading={loading} tone={count("talk-now") ? "attention" : undefined} foot={`${settings.conversationAtSessionsLeft} or fewer left, or ended`} />
        <AdminStatTile label="Coming up" value={count("coming-up")} loading={loading} foot={`Next ${settings.horizonMonths} month${settings.horizonMonths === 1 ? "" : "s"}`} />
        <AdminStatTile
          label="Missing Mindbody data"
          value={missingCount ?? "—"}
          loading={missingCount === null && loading}
          onClick={() => setShowMissing((v) => !v)}
          foot={showMissing ? "Tap to hide" : "Tap to see who"}
        />
      </AdminTiles>

      <div className="adm-segmented adm-segmented--wrap" role="tablist" aria-label="Filter the pipeline">
        {FILTERS.map((f) => (
          <button key={f} type="button" role="tab" className="adm-seg" aria-selected={filter === f} onClick={() => setFilter(f)}>
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {showMissing && (
        <AdminPanel
          title="Missing Mindbody data"
          subtitle="The app can't place these clients yet. Most fill in as the nightly job pulls Mindbody (a few hundred a night); a package name it doesn't recognize needs matching in Settings."
          icon={<AlertTriangle className="w-4 h-4" />}
          flush
        >
          {missingClients === null ? (
            <AdminEmpty title="Loading…" />
          ) : missingClients.length === 0 ? (
            <AdminEmpty title="Nobody is missing data" />
          ) : (
            <AdminRows>
              {missingClients.map((c) => (
                <AdminRow
                  key={c.id}
                  onClick={() => onOpenBrief(c)}
                  name={`${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()}
                  meta={c.renewal?.dataGaps?.[0] ?? "No Mindbody data yet"}
                  trailing={<ChevronRight className="w-4 h-4 opacity-50" />}
                />
              ))}
            </AdminRows>
          )}
        </AdminPanel>
      )}

      {!loading && rows.length === 0 && !error ? (
        <AdminEmpty title={`No renewals to plan at ${studioName} yet`}>
          The pipeline fills from the nightly renewals job. Until it has run — and pulled
          Mindbody for this studio's clients — there's nothing to place here.
        </AdminEmpty>
      ) : (
        <>
          {lanePanel("before-charge")}
          {lanePanel("talk-now")}
          {lanePanel("coming-up")}
          {lanePanel("lapsed", true)}
          {lanePanel("away", true)}
        </>
      )}

      <p className="adm-hint">
        <CalendarClock className="inline w-3.5 h-3.5 mr-1" />
        Worked out overnight from Mindbody and the studio's bookings. Open a client for today's numbers.
        <Users className="inline w-3.5 h-3.5 mx-1" />
        Nothing here contacts anyone.
      </p>
    </div>
  );
}

function situationWord(s: string): string {
  switch (s) {
    case "will-bank":
      return "Will bank";
    case "will-run-out":
      return "Runs out early";
    case "ended":
      return "Ended";
    case "lapsed":
      return "Lapsed";
    case "away":
      return "Away";
    case "unknown":
      return "No data";
    default:
      return "On track";
  }
}
