/**
 * Operations → Renewals → Pipeline (proposal §4.2).
 *
 * Five numbers across the top, then lanes by how soon something is lost:
 * before the charge, talk now, coming up (by month), and the win-back list.
 * Each row: who, their package on both clocks in one line, the latest
 * leaning, one line of proof, and the next step. Tap a row for the Brief.
 *
 * Running low (AJ, Oct 6 2026: "we need a way for operations to show how
 * many clients are running out of their sessions ... In total") is the
 * session clock beside the lanes: everyone at or under the studio's renewal
 * conversation number, talked to or not, counted from the roster the app
 * already holds (running-low.ts), so a client too slow for the date window
 * below is still found. Tap the number for the list.
 *
 * Reads the nightly snapshots (one query for the studio), the cycle
 * documents for just the clients on screen and on the Running low list, and
 * the studio's inactive marks (one small listener the app shares). Nothing
 * here writes.
 */

import { useMemo, useState } from "react";
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
import { useInBodyVariationLookup } from "../../inbody/useInBodyVariation";
import { useInactiveMarks } from "../journey/inactive-store";
import { useStudioSettings } from "../../studio-settings/useStudioSettings";
import { leftLine, notKnownLine, runningLow, runningLowFoot } from "./running-low";
import type { RosterStatus } from "../../../hooks/useStudioRoster";
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
const NO_CLIENTS: Client[] = [];

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
  /**
   * The studio's roster the app already holds (useStudioRoster), for Running
   * low: every client whose home is the studio, with last night's record.
   */
  roster?: Client[];
  /** The roster's read: Running low waits while it loads, and says nothing off a failed, empty one. */
  rosterStatus?: RosterStatus;
}

export function RenewalsPipeline({ studioId, studioName, settings, onOpenBrief, roster = NO_CLIENTS, rosterStatus = "ready" }: RenewalsPipelineProps) {
  const today = studioTodayKey();
  const from = addDays(today, -LAPSED_LOOKBACK_DAYS);
  const to = horizonEnd(settings, today);
  const { clients, loading, error } = usePipelineClients(studioId, from, to);
  const inactiveMarks = useInactiveMarks(studioId);
  const studioSettings = useStudioSettings(studioId);
  const inactiveDays = studioSettings.value("inactiveDays") ?? 90;
  const marks = inactiveMarks.marks;
  // Who is at or under the number before the conversations are read: only
  // their cycle keys join the pipeline's, in the one chunked read.
  const lowKeys = useMemo(
    () =>
      runningLow({ clients: roster, studioId, cycles: {}, settings, today, inactiveMarks: marks, inactiveDays }).rows.map(
        (r) => r.snapshot.cycleKey ?? "",
      ),
    [roster, studioId, settings, today, marks, inactiveDays],
  );
  const cycles = useCyclesFor(studioId, [...clients.map((c) => c.renewal?.cycleKey ?? ""), ...lowKeys].filter(Boolean));
  const low = useMemo(
    () => runningLow({ clients: roster, studioId, cycles, settings, today, inactiveMarks: marks, inactiveDays }),
    [roster, studioId, cycles, settings, today, marks, inactiveDays],
  );
  // Loading until the roster, the marks and the Inactive line have answered.
  // A roster that failed with nothing held says "—", never a confident 0.
  const lowLoading = rosterStatus === "loading" || inactiveMarks.loading || studioSettings.loading;
  const lowUnknown = !lowLoading && rosterStatus === "error" && !roster.some((c) => c.homeStudioId === studioId);
  const [showLow, setShowLow] = useState(false);
  const missingCount = useMissingDataCount(studioId, clients.length);
  const [showMissing, setShowMissing] = useState(false);
  const missingClients = useMissingDataClients(studioId, showMissing);
  const [filter, setFilter] = useState<PipelineFilter>("all");
  const [showQuiet, setShowQuiet] = useState<Record<string, boolean>>({});

  const clientsById = useMemo(() => new Map(clients.filter((c) => c.id).map((c) => [c.id as string, c])), [clients]);
  // Each client's InBody is read against THEIR home studio's variation
  // (variationForClient in features/inbody/variation.ts), from the studios
  // already in memory: the same answer the Brief and the renewal card give.
  const variationFor = useInBodyVariationLookup();

  const rows = useMemo(() => {
    const out: PipelineRow[] = [];
    for (const c of clients) {
      const s = c.renewal;
      if (!s || !c.id) continue;
      const cycle = s.cycleKey ? cycles[s.cycleKey] ?? null : null;
      const lane = laneOf(s, cycle, settings, today);
      if (!lane) continue;
      out.push({
        clientId: c.id,
        name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
        snapshot: s,
        cycle,
        lane,
        inbodyVariation: variationFor(c),
      });
    }
    return out;
  }, [clients, cycles, settings, today, variationFor]);

  const visible = rows.filter((r) => matchesFilter(r, filter, settings));
  const inLane = (lane: PipelineLane) => sortRows(visible.filter((r) => r.lane === lane));
  const count = (lane: PipelineLane) => rows.filter((r) => r.lane === lane).length;

  const renderRow = (r: PipelineRow) => {
    const s = r.snapshot;
    const latest = latestLine(r.cycle, today);
    const proof = proofSentence(s, r.inbodyVariation);
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

  // The calm round (Oct 3 2026): an empty pipeline is one short line, not four zero tiles and five filters.
  const empty = !loading && rows.length === 0 && !error && low.rows.length === 0;
  const showTiles = !empty || (missingCount ?? 0) > 0;
  return (
    <div className="adm-pipeline space-y-4">
      {error && <AdminNotice tone="warn">{error}</AdminNotice>}

      {showTiles && (
        <AdminTiles>
          <AdminStatTile label="Before the charge" value={count("before-charge")} loading={loading} tone={count("before-charge") ? "attention" : undefined} foot="Banked sessions, charge inside your window" />
          <AdminStatTile label="Talk now" value={count("talk-now")} loading={loading} tone={count("talk-now") ? "attention" : undefined} foot={`${settings.conversationAtSessionsLeft} or fewer left, or ended`} />
          <AdminStatTile label="Coming up" value={count("coming-up")} loading={loading} foot={`Next ${settings.horizonMonths} month${settings.horizonMonths === 1 ? "" : "s"}`} />
          <AdminStatTile
            label="Running low"
            value={lowUnknown ? "—" : low.rows.length}
            loading={lowLoading}
            onClick={lowLoading || lowUnknown ? undefined : () => setShowLow((v) => !v)}
            foot={
              lowUnknown ? (
                "Couldn't read the client list"
              ) : (
                <>
                  {runningLowFoot(settings)}
                  <span className="block">{showLow ? "Tap to hide" : "Tap to see who"}</span>
                </>
              )
            }
          />
          <AdminStatTile
            label="Missing Mindbody data"
            value={missingCount ?? "—"}
            loading={missingCount === null && loading}
            onClick={() => setShowMissing((v) => !v)}
            foot={showMissing ? "Tap to hide" : "Tap to see who"}
          />
        </AdminTiles>
      )}

      {showLow && !lowLoading && !lowUnknown && (
        <AdminPanel
          title={`Running low · ${low.rows.length}`}
          flush
          actions={
            <AdminButton variant="ghost" size="sm" onClick={() => setShowLow(false)}>
              Hide
            </AdminButton>
          }
          footer={low.notKnown > 0 ? <p className="adm-hint px-4 pb-3">{notKnownLine(low.notKnown)}</p> : undefined}
        >
          {low.rows.length === 0 ? (
            <AdminEmpty title="Nobody is running low">{`Nobody at ${studioName} has ${settings.conversationAtSessionsLeft} or fewer sessions left.`}</AdminEmpty>
          ) : (
            <AdminRows>
              {low.rows.map((r) => (
                <AdminRow
                  key={r.clientId}
                  onClick={() => {
                    const c = roster.find((x) => x.id === r.clientId);
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
                      <span>{leftLine(r.snapshot, today)}</span>
                      <span className="font-semibold">{nextStep(r.snapshot, r.cycle, settings, today)}</span>
                    </span>
                  }
                  trailing={
                    <span className="inline-flex items-center gap-2">
                      {r.snapshot.situation === "away" && <AdminBadge tone="neutral">Away</AdminBadge>}
                      <ChevronRight className="w-4 h-4 opacity-50" />
                    </span>
                  }
                />
              ))}
            </AdminRows>
          )}
        </AdminPanel>
      )}

      {!empty && (
        <div className="adm-segmented adm-segmented--wrap" role="tablist" aria-label="Filter the pipeline">
          {FILTERS.map((f) => (
            <button key={f} type="button" role="tab" className="adm-seg" aria-selected={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      )}

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

      {empty ? (
        <AdminEmpty title={`No renewals to plan at ${studioName} yet`}>It fills from the nightly run, once that has pulled this studio's clients from Mindbody.</AdminEmpty>
      ) : (
        <>
          {lanePanel("before-charge")}
          {lanePanel("talk-now")}
          {lanePanel("coming-up")}
          {lanePanel("lapsed", true)}
          {lanePanel("away", true)}
        </>
      )}

      {!empty && (
        <p className="adm-hint">
          <CalendarClock className="inline w-3.5 h-3.5 mr-1" />
          Worked out overnight from Mindbody. Open a client for today's numbers.
          <Users className="inline w-3.5 h-3.5 mx-1" />
          Nothing here contacts anyone.
        </p>
      )}
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
