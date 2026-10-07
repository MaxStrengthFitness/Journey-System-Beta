/**
 * Operations → Renewals → Pipeline (proposal §4.2).
 *
 * Five numbers across the top, then lanes by how soon something is lost:
 * before the charge, talk now, coming up (by month), and the win-back list.
 * Since the renewals dashboard (Oct 7 2026) each row is the dashboard row
 * (features/renewals/RenewalRow.tsx): the client and their primary trainer,
 * the package and its rate, when the commitment ends, sessions left part by
 * part, what will be left when it ends, who last talked to them, the one or
 * two signals that matter, and the renewal plan as a picker anyone who works
 * here may set. Tap the name for the Brief; the working is on the row's (i).
 *
 * Running low (AJ, Oct 6 2026: "we need a way for operations to show how
 * many clients are running out of their sessions ... In total") is the
 * session clock beside the lanes: everyone at or under the studio's renewal
 * conversation number, talked to or not (running-low.ts). Tap the number
 * for the list, drawn with the same dashboard row and plan picker as the
 * lanes (AJ, Oct 7 2026: "Yes").
 *
 * The lanes and Running low both read the studio's roster the app already
 * holds (useStudioRoster: every client whose home is the studio, with last
 * night's record), through the one rule Today, Week and Month count by
 * (lanes.ts): the studio's own clients, an Inactive client out of the to-do
 * lanes, Away as it was. Until Oct 6 2026 the lanes had their own query, a
 * window of `renewal.focusDate`, and a client too slow for it (8 left at a
 * quarter a week, running out next May) never reached Talk now.
 *
 * Reads the roster (already held), the cycle documents for just the clients
 * a lane could hold and the Running low list (one chunked read), the
 * studio's inactive marks (one small listener the app shares) and the
 * missing-data count. Nothing here writes but a row's plan (useRenewalCycle
 * saveRenewalPlan). Until the roster, the marks and
 * the Inactive line have answered, no number is said; a roster that failed
 * with nothing held says "—", never a confident 0.
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
import { studioTodayKey } from "../../../lib/studio-time";
import {
  FILTER_HINTS,
  FILTER_LABELS,
  LANE_HINTS,
  LANE_TITLES,
  byMonth,
  matchesFilter,
  nextStep,
  sortRows,
  type PipelineFilter,
  type PipelineLane,
  type PipelineRow,
} from "../../renewals/pipeline";
import { proofSentence, SITUATION_TONE } from "../../renewals/sentences";
import { useInBodyVariationLookup } from "../../inbody/useInBodyVariation";
import { useInactiveMarks } from "../journey/inactive-store";
import { useStudioSettings } from "../../studio-settings/useStudioSettings";
import { lowLeftNow, notKnownLine, runningLow, runningLowFoot } from "./running-low";
import { mayHaveLane, renewalLane, type RenewalLaneContext } from "./lanes";
import type { RosterStatus } from "../../../hooks/useStudioRoster";
import { useCyclesRead, useMissingDataClients, useMissingDataCount } from "../../renewals/usePipeline";
import { RenewalRow, RenewalRowList } from "../../renewals/RenewalRow";
import { situationWord } from "../../renewals/row-facts";
import { canSetRenewalPlan } from "../../renewals/permissions";
import type { RenewalSettings } from "../../renewals/types";
import type { Client, Trainer } from "../../../types";
import "./renewals.css";

const FILTERS: PipelineFilter[] = ["all", "needs-leader", "price", "upgrade", "not-talked", "plan-undecided", "not-renewing"];
const NO_CLIENTS: Client[] = [];
const NO_TRAINERS: Trainer[] = [];

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
   * The studio's roster the app already holds (useStudioRoster): every client
   * whose home is the studio, with last night's record. The lanes and Running
   * low are both counted from it.
   */
  roster?: Client[];
  /** The roster's read: the page waits while it loads, and says nothing off a failed, empty one. */
  rosterStatus?: RosterStatus;
  /** Everyone on staff: each row's primary trainer by name. */
  trainers?: Trainer[];
  /** The signed-in person: who may set a renewal plan, and the name on it. */
  authTrainer?: Trainer | null;
  /**
   * The studio's own settings answered (not the defaults after a failed
   * read): a plan names a package from them, so it waits until they have.
   */
  planSettingsReady?: boolean;
}

export function RenewalsPipeline({
  studioId,
  studioName,
  settings,
  onOpenBrief,
  roster = NO_CLIENTS,
  rosterStatus = "ready",
  trainers = NO_TRAINERS,
  authTrainer = null,
  planSettingsReady = true,
}: RenewalsPipelineProps) {
  const today = studioTodayKey();
  const inactiveMarks = useInactiveMarks(studioId);
  const studioSettings = useStudioSettings(studioId);
  const inactiveDays = studioSettings.value("inactiveDays") ?? 90;
  const marks = inactiveMarks.marks;
  const ctx = useMemo<RenewalLaneContext>(
    () => ({ studioId, settings, today, inactiveMarks: marks, inactiveDays }),
    [studioId, settings, today, marks, inactiveDays],
  );
  // The studio's own clients: the one list the lanes and Running low read.
  const home = useMemo(() => roster.filter((c) => c.id && c.homeStudioId === studioId), [roster, studioId]);
  // Whose conversations to read, in the one chunked read: anyone a lane could
  // hold (before a conversation or the Inactive rule could take them out), and
  // everyone at or under the Running low number.
  const cycleKeys = useMemo(() => {
    const lanes = home.filter((c) => mayHaveLane(c, ctx)).map((c) => c.renewal?.cycleKey ?? "");
    const lowRows = runningLow({ clients: home, studioId, cycles: {}, settings, today, inactiveMarks: marks, inactiveDays }).rows;
    return [...lanes, ...lowRows.map((r) => r.snapshot.cycleKey ?? "")].filter(Boolean);
  }, [home, ctx, studioId, settings, today, marks, inactiveDays]);
  const { cycles, loading: cyclesLoading, failed: cyclesFailed } = useCyclesRead(studioId, cycleKeys);
  // The renewals dashboard (Oct 7 2026): each row names the primary trainer,
  // and anyone who works here may set the renewal plan.
  const trainerNames = useMemo(() => new Map(trainers.filter((t) => t.id).map((t) => [t.id as string, t.fullName ?? ""])), [trainers]);
  const canPlan = planSettingsReady && canSetRenewalPlan(authTrainer, studioId);
  const authorName = authTrainer?.fullName?.trim() || "Someone at the studio";
  const low = useMemo(
    () => runningLow({ clients: home, studioId, cycles, settings, today, inactiveMarks: marks, inactiveDays }),
    [home, studioId, cycles, settings, today, marks, inactiveDays],
  );
  // Loading until the roster, the marks and the Inactive line have answered.
  // A roster that failed with nothing held says "—", never a confident 0.
  const loading = rosterStatus === "loading" || inactiveMarks.loading || studioSettings.loading;
  const unknown = !loading && rosterStatus === "error" && home.length === 0;
  const [showLow, setShowLow] = useState(false);
  const missingCount = useMissingDataCount(studioId, home.length);
  const [showMissing, setShowMissing] = useState(false);
  const missingClients = useMissingDataClients(studioId, showMissing);
  const [filter, setFilter] = useState<PipelineFilter>("all");
  const [showQuiet, setShowQuiet] = useState<Record<string, boolean>>({});

  const clientsById = useMemo(() => new Map(home.map((c) => [c.id as string, c])), [home]);
  // Each client's InBody is read against THEIR home studio's variation
  // (variationForClient in features/inbody/variation.ts), from the studios
  // already in memory: the same answer the Brief and the renewal card give.
  const variationFor = useInBodyVariationLookup();

  const rows = useMemo(() => {
    const out: PipelineRow[] = [];
    for (const c of home) {
      const s = c.renewal;
      if (!s || !c.id) continue;
      const cycle = s.cycleKey ? cycles[s.cycleKey] ?? null : null;
      const lane = renewalLane(c, cycle, ctx);
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
  }, [home, cycles, ctx, variationFor]);

  // The plan filters match nobody, never everybody, while a plan is unknown.
  const visible = rows.filter((r) => matchesFilter(r, filter, settings, !cyclesLoading && !cyclesFailed));
  const inLane = (lane: PipelineLane) => sortRows(visible.filter((r) => r.lane === lane));
  const count = (lane: PipelineLane) => rows.filter((r) => r.lane === lane).length;

  // The renewals dashboard (Oct 7 2026): every lane's row, and Running low's,
  // is the dashboard row (features/renewals/RenewalRow.tsx), the one My
  // renewals draws too.
  const renderRow = (
    r: Pick<PipelineRow, "clientId" | "name" | "snapshot" | "cycle" | "inbodyVariation">,
    leftNow?: string | null,
    where?: string,
  ) => {
    const s = r.snapshot;
    return (
      <RenewalRow
        key={r.clientId}
        studioId={studioId}
        clientId={r.clientId}
        name={r.name}
        snapshot={s}
        cycle={r.cycle}
        cyclesFailed={cyclesFailed}
        cyclesLoading={cyclesLoading}
        settings={settings}
        today={today}
        trainerName={s.primaryTrainerId ? trainerNames.get(s.primaryTrainerId) ?? null : null}
        proof={proofSentence(s, r.inbodyVariation)}
        leftNow={leftNow}
        where={where}
        nextStep={nextStep(s, r.cycle, settings, today)}
        badges={
          <>
            <AdminBadge tone={TONE_BADGE[SITUATION_TONE[s.situation]]}>{situationWord(s.situation)}</AdminBadge>
            {r.cycle?.needsLeader && <AdminBadge tone="warn">Needs a leader</AdminBadge>}
          </>
        }
        onOpen={() => {
          const c = clientsById.get(r.clientId);
          if (c) onOpenBrief(c);
        }}
        canPlan={canPlan}
        authorName={authorName}
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
              <RenewalRowList label={`${LANE_TITLES[lane]}, ${g.label}`}>{g.rows.map((r) => renderRow(r))}</RenewalRowList>
            </div>
          ))
        ) : (
          <RenewalRowList label={LANE_TITLES[lane]}>{list.map((r) => renderRow(r))}</RenewalRowList>
        )}
      </AdminPanel>
    );
  };

  // The lanes are drawn only once every count can be stood behind: never
  // "Nothing in this lane" while the roster loads or after it failed.
  const ready = !loading && !unknown;
  // The calm round (Oct 3 2026): an empty pipeline is one short line, not four zero tiles and five filters.
  const empty = ready && rows.length === 0 && low.rows.length === 0;
  const showTiles = !empty || (missingCount ?? 0) > 0;
  const laneValue = (lane: PipelineLane) => (unknown ? "—" : count(lane));
  const laneTone = (lane: PipelineLane): "attention" | undefined => (!unknown && count(lane) > 0 ? "attention" : undefined);
  return (
    <div className="adm-pipeline space-y-4">
      {unknown && <AdminNotice tone="warn">Couldn't read the client list. It tries again by itself.</AdminNotice>}

      {showTiles && (
        <AdminTiles>
          <AdminStatTile label="Before the charge" value={laneValue("before-charge")} loading={loading} tone={laneTone("before-charge")} foot="Banked sessions, charge inside your window" />
          <AdminStatTile label="Talk now" value={laneValue("talk-now")} loading={loading} tone={laneTone("talk-now")} foot={`${settings.conversationAtSessionsLeft} or fewer left, or ended`} />
          <AdminStatTile label="Coming up" value={laneValue("coming-up")} loading={loading} foot={`Next ${settings.horizonMonths} month${settings.horizonMonths === 1 ? "" : "s"}`} />
          <AdminStatTile
            label="Running low"
            value={unknown ? "—" : low.rows.length}
            loading={loading}
            onClick={ready ? () => setShowLow((v) => !v) : undefined}
            foot={
              <>
                {runningLowFoot(settings)}
                {ready && <span className="block">{showLow ? "Tap to hide" : "Tap to see who"}</span>}
              </>
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

      {showLow && ready && (
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
            // The dashboard row, as the lanes draw it (AJ, Oct 7 2026: "Yes").
            // Fewest left first, as running-low.ts sorts them. Left now says
            // when the sessions run out, as this list always has
            // (running-low.ts lowLeftNow).
            <RenewalRowList label="Running low">
              {low.rows.map((r) => {
                const c = clientsById.get(r.clientId);
                return renderRow(
                  { ...r, inbodyVariation: variationFor(c) },
                  lowLeftNow(r.snapshot, today),
                  "Running low",
                );
              })}
            </RenewalRowList>
          )}
        </AdminPanel>
      )}

      {ready && !empty && (
        <div className="adm-segmented adm-segmented--wrap" role="tablist" aria-label="Filter the pipeline">
          {FILTERS.map((f) => (
            <button key={f} type="button" role="tab" className="adm-seg" aria-selected={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      )}
      {ready && !empty && FILTER_HINTS[filter] && <p className="adm-hint">{FILTER_HINTS[filter]}</p>}

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
      ) : !ready ? null : (
        <>
          {lanePanel("before-charge")}
          {lanePanel("talk-now")}
          {lanePanel("coming-up")}
          {lanePanel("lapsed", true)}
          {lanePanel("away", true)}
        </>
      )}

      {ready && !empty && (
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
