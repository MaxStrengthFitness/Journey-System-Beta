/**
 * THE MACHINE MENU — everything the card reads, in one place.
 *
 * The card is the same in both doors; what it is HANDED differs, and this
 * hook turns what a door hands it into what the blocks draw (machine menu
 * design §B "What differs between the doors", §G "Data"):
 *
 *   - The sessions and sets: the door's own. On the profile, the pages the
 *     profile has read (the Journey grid's own reads, 50 sessions a page);
 *     in a session, the tracker's window of sets (`readIds` says which
 *     sessions' sets it holds). Columns come only from sessions whose sets
 *     were read, so a column is never drawn without its set.
 *   - Load older: on the profile, the host's own next page
 *     (`handleLoadMoreHistory`); in a session, the next 30 sessions' sets by
 *     `sessionId` (older-read.ts — the tracker's window query run again for
 *     older ids, no new index), kept for the rest of the session in a
 *     per-client memory forgotten at sign-out. Only ever on a tap.
 *   - The journal: the host's ONE listener, passed down — never a second.
 *   - The setting changes: ONE `getDocs` when the card opens
 *     (useSettingHistory), shared by the chart, "Last changed", Setting
 *     changes and the settings-copy filter. It replaces a live listener.
 *   - The floor's notes on the unit: ONE read when the card opens
 *     (equipment/FloorNoteCard's `useFloorNote`), shared by the safety strip
 *     and the header's pill.
 *   - Machine fit: `useFitData` with the studio's roster (cached and shared),
 *     for the dials' rule 3 and the rare fit line.
 *
 * A read that failed is "failed", never empty; a read that hasn't answered
 * is "loading", never "nothing" (so the header never says "First time" while
 * the first page is still out). No Mindbody call, no new listener.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { clientDisplayName, clientFirstName } from "../../lib/client-name";
import { canQuoteSessionNumber } from "../../lib/client-coverage";
import { machineWatchOuts, type WatchOut } from "../../lib/clinical-watchouts";
import { NO_WINDOW, type OwnedWindow } from "../../lib/history-claims";
import type { HistoryCoverage } from "../../lib/prior-history";
import { sessionTotalOf, type SessionTotal } from "../../lib/session-total";
import { studioTodayKey } from "../../lib/studio-time";
import type { Client, ClientMachineSetting, ExerciseLog, Machine, WorkoutSession } from "../../types";
import type { MachineCatalogEntry } from "../../types/machines";
import type { JournalEntry } from "../../types/journal";
import { sessionNoteStudioId } from "../client-notes/note-studio";
import type { SessionNoteDraft } from "../client-notes/session-draft";
import { toEquipmentMachines, slug } from "../equipment/adapters";
import { useFloorNote, type FloorRead } from "../equipment/FloorNoteCard";
import type { JournalContext, MutationAuthor } from "../equipment/mutations";
import type { EquipmentMachine } from "../equipment/types";
import { factorsOf } from "../machine-fit/factors";
import { useFitData, type FitData } from "../machine-fit/fit-store";
import type { FitFactors } from "../machine-fit/types";
import { useSendState } from "../session-record/useSendState";
import { useStudioSettings } from "../studio-settings/useStudioSettings";
import type { TileField } from "./DialTiles";
import type { Door } from "./doors";
import { knownElsewhere as totalsKnowIt, lastTimeLine, type HeaderLine } from "./header-words";
import type { OlderLoad } from "./MachineTimeline";
import { hasOlderToRead, olderSetsFor, readOlderSets, rememberOlderSets } from "./older-read";
import { progressFromModel, type ProgressFigure } from "./progress-figure";
import { criticalLinesOf, safetySummary, type CriticalRead, type SafetySummary } from "./safety";
import type { SettingRow } from "./setting-history";
import { DEFAULT_DRIFT, buildTimelineModel, type TimelineLogInput, type TimelineModel, type TimelineReadState } from "./timeline-model";
import type { WordsContext } from "./timeline-words";
import { useSettingHistory, type SettingHistoryRead } from "./useSettingHistory";

/** How far the door's read of the client's sessions has got. */
export type HistoryReadState = TimelineReadState;

/**
 * What a door hands the card. Built once per door (the tracker, the profile,
 * Programming → All Machines) and passed to MachineMenu / MachineMenuBody.
 */
export interface MachineMenuHost {
  door: Door;
  clientId: string;
  client: Client | null;
  /** The machines this door can open: the floor's own version first, then every other machine by id. */
  machines: readonly Machine[];
  /** The client's settings documents, keyed by machine (the host's live listener). */
  clientSettings: Readonly<Record<string, ClientMachineSetting>>;
  /** Who writes: `id` is the Auth uid. Null writes nothing. */
  author: MutationAuthor | null;
  /** The studio on this iPad: machine fit's cohort, the studio's settings, a note's studio on the profile. */
  activeStudioId: string | null;
  /** Where "The machine itself" is filed and whose notes on the unit are read: the session's studio, or the active one. */
  floorStudio: { id: string | null; name: string | null };
  /** The studio's clients the host already holds: machine fit's roster. */
  roster: readonly Client[];
  /** The client's coverage, judged by the HOME studio's cutover. */
  coverage: HistoryCoverage;
  /** The part of the timeline Journey owns (`ownedWindow`): which gaps may be called a break. */
  window?: OwnedWindow;
  /** The sessions the door holds, any order. */
  sessions: readonly WorkoutSession[];
  /** Their sets the door has read, any machine. */
  logs: readonly ExerciseLog[];
  /** The sessions whose sets were read; absent, every session in `sessions` was. */
  readIds?: ReadonlySet<string> | null;
  historyState: HistoryReadState;
  /** The profile: more pages on the server (`hasMoreSessions`). A session works it out from `readIds`. */
  moreOnServer?: boolean;
  /** Read the first page again after a failed read. */
  onRetryHistory?: () => void;
  /** The profile: the grid's own next page; resolves false when it failed. */
  loadOlder?: () => Promise<boolean | void> | void;
  loadingOlder?: boolean;
  /** The profile: ask for the first page when Journey hasn't been opened yet. */
  ensureHistory?: () => void;
  /** The host's one journal listener: the client's entries that name a machine. */
  journal: readonly JournalEntry[] | null;
  journalState: "loading" | "ready" | "failed";
  /** In a session: the running session (or the watched one). */
  session?: { id: string | null; number: number | null; day: string | null } | null;
  /** In a session: the tracker's one note draft, and where every change to it goes. */
  noteDraft?: SessionNoteDraft | null;
  onNoteDraftChange?: (draft: SessionNoteDraft) => void;
  /** Watching another trainer's session: that trainer's name. The whole card reads only. */
  watching?: string | null;
  /** The profile: open the session a note was written in. */
  onOpenSession?: (sessionId: string) => void;
}

export interface MachineMenuData {
  machine: Machine | null;
  equipment: EquipmentMachine | null;
  fields: TileField[];
  /** Every name a settings copy may carry: the floor's name first, then the catalog's. */
  machineNames: string[];
  model: TimelineModel | null;
  header: HeaderLine;
  ctx: WordsContext;
  clientName: string;
  clientFirst: string;
  progress: ProgressFigure | null;
  knownElsewhere: boolean;
  sessionTotal: SessionTotal;
  older: OlderLoad | null;
  history: SettingHistoryRead;
  /** The rows the chart and the notes may use: null when unread or failed (then nothing is hidden). */
  historyRows: SettingRow[] | null;
  fit: FitData;
  fitTarget: FitFactors;
  critical: CriticalRead;
  watchOuts: WatchOut[];
  floor: FloorRead;
  safety: SafetySummary;
  /** The settings snapshot on each of this client's sets on this machine. */
  snapshots: (Record<string, string> | null | undefined)[];
  /** Nothing recorded in what was read and no settings saved: the guide's set-up part opens above the tiles. */
  firstTime: boolean;
  today: string;
  journalContext: JournalContext;
  readOnly: boolean;
  online: boolean;
}

const NO_LOGS: TimelineLogInput[] = [];

/** The Firestore half of older-read.ts: the tracker's window query, run again for older ids. */
async function fetchSetsOf(ids: string[]): Promise<ExerciseLog[]> {
  const snap = await getDocs(query(collection(db, "exerciseLogs"), where("sessionId", "in", ids)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ExerciseLog);
}

export function useMachineMenuData(
  host: MachineMenuHost,
  machineId: string | null,
  catalogById: Readonly<Record<string, MachineCatalogEntry>>,
): MachineMenuData {
  const { activeStudio, studios } = useActiveStudio();
  const { online } = useSendState();
  const today = studioTodayKey();
  const { client, clientId, door } = host;

  const machine = useMemo(() => (machineId ? (host.machines.find((m) => m.id === machineId) ?? null) : null), [host.machines, machineId]);

  const equipment = useMemo(() => {
    if (!machine?.id) return null;
    return (
      toEquipmentMachines({
        machines: [machine],
        clientSettings: host.clientSettings as Record<string, ClientMachineSetting>,
        allLogs: [],
        catalogById: catalogById as Record<string, MachineCatalogEntry>,
        studioMachineSettings: activeStudio?.machineSettings,
        machineStats: client?.machineStats ?? null,
      })[0] ?? null
    );
  }, [machine, host.clientSettings, catalogById, activeStudio, client?.machineStats]);

  // The codex's dial letters, from the catalog's own fields.
  const fields = useMemo<TileField[]>(() => {
    if (!equipment) return [];
    const catalogFields = (catalogById[equipment.id] as { settingFields?: { key?: string; label?: string; letter?: string }[] } | undefined)?.settingFields ?? [];
    return equipment.fields.map((f) => {
      const hit = catalogFields.find((c) => c.key === f.key || (c.label && slug(c.label) === slug(f.label)));
      const letter = typeof hit?.letter === "string" ? hit.letter.trim() : "";
      return letter ? { ...f, letter } : f;
    });
  }, [equipment, catalogById]);

  const machineNames = useMemo(() => {
    const names = [equipment?.name ?? "", catalogById[machineId ?? ""]?.name ?? "", machine?.name ?? ""].map((n) => (n ?? "").trim()).filter(Boolean);
    return [...new Set(names)];
  }, [equipment?.name, catalogById, machineId, machine?.name]);

  /* ---------------- the sessions and sets read ---------------- */

  const [olderRound, setOlderRound] = useState(0);
  const [olderState, setOlderState] = useState<"idle" | "loading" | "failed">("idle");
  // What Load older has read in this session, for this client (older-read.ts).
  const remembered = useMemo(
    () => (door === "session" ? olderSetsFor(clientId) : { ids: new Set<string>() as ReadonlySet<string>, logs: NO_LOGS }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [door, clientId, olderRound],
  );

  const readIds = useMemo<ReadonlySet<string>>(() => {
    const ids = new Set<string>();
    if (host.readIds) for (const id of host.readIds) ids.add(id);
    else for (const s of host.sessions) if (s.id) ids.add(s.id);
    for (const id of remembered.ids) ids.add(id);
    return ids;
  }, [host.readIds, host.sessions, remembered]);

  const readSessions = useMemo(() => host.sessions.filter((s) => !!s.id && readIds.has(s.id)), [host.sessions, readIds]);
  const readLogs = useMemo<TimelineLogInput[]>(() => {
    if (remembered.logs.length === 0) return host.logs as TimelineLogInput[];
    const byKey = new Map<string, TimelineLogInput>();
    const key = (l: TimelineLogInput) => l.id ?? `${l.sessionId}_${l.machineId}${l.side ? `_${l.side}` : ""}`;
    for (const l of remembered.logs) byKey.set(key(l), l);
    for (const l of host.logs as TimelineLogInput[]) byKey.set(key(l), l);
    return [...byKey.values()];
  }, [host.logs, remembered]);

  const reading = host.historyState === "loading";
  const moreToLoad =
    host.historyState === "failed" ? false : door === "session" ? hasOlderToRead(host.sessions, readIds) : !!host.moreOnServer;
  const everythingRead = !reading && host.historyState !== "failed" && !moreToLoad;

  /* ---------------- the card's own reads ---------------- */

  const history = useSettingHistory(machine?.id ?? null, clientId, !!machine?.id);
  const historyRows = history.state === "ready" || history.state === "cache-only" ? history.rows : null;
  const floor = useFloorNote(host.floorStudio.id, machine?.id ?? null);
  const fit = useFitData(host.activeStudioId, machine?.id ? [machine.id] : [], host.roster, !!machine?.id && !host.watching);
  const fitTarget = useMemo(() => factorsOf(client ?? null), [client]);
  const settingsStudio = client?.homeStudioId || host.activeStudioId;
  const studioSettings = useStudioSettings(settingsStudio ?? null);
  const driftMultiple = Number(studioSettings.value("driftMultiple"));
  const driftMinDays = Number(studioSettings.value("driftMinDays"));

  // The profile opened before Journey was visited: ask for the first page.
  const ensure = host.ensureHistory;
  useEffect(() => {
    if (machine?.id && reading) ensure?.();
  }, [machine?.id, reading, ensure]);

  /* ---------------- the model ---------------- */

  const model = useMemo<TimelineModel | null>(() => {
    if (!equipment) return null;
    return buildTimelineModel({
      machineId: equipment.id,
      machineName: machineNames.length ? machineNames : equipment.name,
      fields: equipment.fields.map((f) => ({ key: f.key, label: f.label })),
      sessions: readSessions,
      logs: readLogs,
      today,
      runningSessionId: door === "session" ? (host.session?.id ?? null) : null,
      unitStudioId: host.floorStudio.id,
      everythingRead,
      moreToLoad,
      history: historyRows,
      journal: host.journalState === "ready" ? host.journal : null,
      legacyNotes: equipment.notes,
      drift: {
        multiple: Number.isFinite(driftMultiple) && driftMultiple > 0 ? driftMultiple : DEFAULT_DRIFT.multiple,
        minDays: Number.isFinite(driftMinDays) && driftMinDays > 0 ? driftMinDays : DEFAULT_DRIFT.minDays,
      },
      window: host.window ?? NO_WINDOW,
      readState: host.historyState,
    });
  }, [
    equipment,
    machineNames,
    readSessions,
    readLogs,
    today,
    door,
    host.session?.id,
    host.floorStudio.id,
    everythingRead,
    moreToLoad,
    historyRows,
    host.journalState,
    host.journal,
    driftMultiple,
    driftMinDays,
    host.window,
    host.historyState,
  ]);

  const metric = machine?.id ? (client?.currentMachineMetrics?.[machine.id] ?? null) : null;
  const stat = machine?.id ? (client?.machineStats?.[machine.id] ?? null) : null;
  const knownElsewhere = totalsKnowIt({ metric, stat }, today);

  const studioNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of studios ?? []) if (s.id && s.name) out[s.id] = s.name;
    return out;
  }, [studios]);

  const clientName = client ? clientDisplayName(client, "") : "";
  const clientFirst = client ? clientFirstName(client, "the client") : "the client";
  // The chart's sentences say the name the client goes by ("How Avery has
  // done here"); the header says the display name.
  const ctxName = (client ? clientFirstName(client, "") : "") || "This client";
  const ctx = useMemo<WordsContext>(
    () => ({
      name: ctxName,
      today,
      coverage: host.coverage,
      quotableNumbers: canQuoteSessionNumber(client, host.coverage),
      studioNames,
    }),
    [ctxName, today, host.coverage, client, studioNames],
  );

  const header = useMemo(
    () =>
      lastTimeLine({
        model: model ?? { columns: [], readState: host.historyState, everythingRead },
        today,
        coverage: host.coverage,
        metric,
        stat,
        studioNames,
        watching: host.watching ?? null,
      }),
    [model, host.historyState, everythingRead, today, host.coverage, metric, stat, studioNames, host.watching],
  );

  const progress = useMemo(
    () => (model ? progressFromModel(model, equipment?.startingWeight ?? null, host.coverage) : null),
    [model, equipment?.startingWeight, host.coverage],
  );
  const sessionTotal = useMemo(() => sessionTotalOf(client, host.coverage), [client, host.coverage]);

  /* ---------------- Load older, the door's way ---------------- */

  const sessions = host.sessions;
  const loadOlderHost = host.loadOlder;
  const loadOlder = useCallback(async () => {
    if (door === "session") {
      setOlderState("loading");
      try {
        const read = await readOlderSets(fetchSetsOf, sessions, readIds);
        rememberOlderSets(clientId, read);
        setOlderRound((r) => r + 1);
        setOlderState("idle");
      } catch (err) {
        console.warn("[machine menu] older sessions not read", err);
        setOlderState("failed");
      }
      return;
    }
    if (!loadOlderHost) return;
    setOlderState("loading");
    try {
      const ok = await loadOlderHost();
      setOlderState(ok === false ? "failed" : "idle");
    } catch {
      setOlderState("failed");
    }
  }, [door, sessions, readIds, clientId, loadOlderHost]);

  const canLoadOlder = moreToLoad && (door === "session" || !!loadOlderHost);
  const olderBusy = olderState === "loading" || (door === "profile" && !!host.loadingOlder);
  const older = useMemo<OlderLoad | null>(() => {
    if (!canLoadOlder) return null;
    const state: OlderLoad["state"] = olderBusy ? "loading" : !online ? "offline" : olderState === "failed" ? "failed" : "idle";
    return { state, onLoad: () => void loadOlder() };
  }, [canLoadOlder, olderBusy, online, olderState, loadOlder]);

  /* ---------------- safety ---------------- */

  const critical = useMemo(
    () =>
      machine?.id && equipment
        ? criticalLinesOf({
            machineId: machine.id,
            machineName: equipment.name,
            machineNames,
            journal: host.journal,
            journalState: host.journalState,
            legacy: equipment.notes,
            history: historyRows,
            today,
          })
        : ({ state: "loading" } as CriticalRead),
    [machine?.id, equipment, machineNames, host.journal, host.journalState, historyRows, today],
  );
  const watchOuts = useMemo(() => (equipment ? machineWatchOuts(client?.clinicalFlags, equipment) : []), [client?.clinicalFlags, equipment]);
  const safety = useMemo(() => safetySummary({ critical, watchOuts: watchOuts.length, floor }), [critical, watchOuts.length, floor]);

  /* ---------------- the rest ---------------- */

  const snapshots = useMemo(
    () => (machine?.id ? readLogs.filter((l) => l.machineId === machine.id).map((l) => l.machineSettings ?? null) : []),
    [readLogs, machine?.id],
  );

  const recorded = model ? model.columns.some((c) => !c.isToday) : false;
  const settled = host.historyState === "ready" || host.historyState === "cache-only";
  const firstTime = !!equipment && settled && !recorded && !equipment.isConfigured && !knownElsewhere;

  const sessionId = host.session?.id ?? null;
  const journalContext = useMemo<JournalContext>(() => {
    if (door === "session") {
      return {
        studioId: sessionNoteStudioId(client, host.activeStudioId),
        origin: "in_session",
        sessionId,
        sessionNumber: sessionId ? (host.session?.number ?? null) : null,
        sessionDay: sessionId ? (host.session?.day ?? null) : null,
      };
    }
    return { studioId: host.activeStudioId || "", origin: "profile" };
  }, [door, client, host.activeStudioId, sessionId, host.session?.number, host.session?.day]);

  return {
    machine,
    equipment,
    fields,
    machineNames,
    model,
    header,
    ctx,
    clientName,
    clientFirst,
    progress,
    knownElsewhere,
    sessionTotal,
    older,
    history,
    historyRows,
    fit,
    fitTarget,
    critical,
    watchOuts,
    floor,
    safety,
    snapshots,
    firstTime,
    today,
    journalContext,
    readOnly: !!host.watching,
    online,
  };
}
