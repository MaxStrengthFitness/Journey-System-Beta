/**
 * THE TAB'S ONE LOAD — everything the codex's pages read, opened once.
 *
 * Client codex, Sep 2026. Notes & Profile is seven pages, and five of them
 * talk about the same notes, three about FORD, two about the InBody scans.
 * Each page opening its own listener would have multiplied the tab's cost by
 * the pages a trainer walks through. So the shell calls this ONCE, and every
 * page reads what it returns:
 *
 *   journal     useClientJournal × 1 — notes, focuses, the critical notes and
 *               the 40 newest sessions it already streams (the arrive/leave
 *               track needs no sessions query of its own).
 *   FORD        useClientFord × 1 — and × 0 for a reader the FORD rule
 *               refuses (a cross-train visit): the listener would only fail.
 *   InBody      useInBodyScans × 1, always: the Overview's Story line and
 *               Body's Build both need it.
 *   dismissals  useNoteDismissalsState × 1 — this trainer's "no need to
 *               remind me", one document keyed by the Auth uid.
 *   Pulse       no read: derived from the progress-reports listener the
 *               profile already runs on this tab (`pulseFromReports`).
 *   Story       no read: built once from all of the above (`buildStory`,
 *               client-story/story.ts) and shared by the Story page and the
 *               Overview's Story slot, so the two can never disagree.
 *
 * Page-local reads (Goals' shared notes and jots, Body's Pulse draft and
 * machine fit) are NOT here: they belong to a page, and a page mounts only
 * when first visited, so they cost nothing until then.
 *
 * The render test counts the listeners: exactly one each, whatever pages are
 * visited, and none on FORD for a cross-train reader.
 */
import { useMemo } from "react";
import { auth } from "../../firebase";
import type { Client, Machine, ProgressReport, Trainer } from "../../types";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { useClientJournal } from "../../hooks/useClientJournal";
import { useClientFord } from "../ford/useClientFord";
import { useInBodyScans } from "../inbody/useInBodyScans";
import { useNoteDismissalsState } from "../client-notes/dismissal-store";
import { studioTodayKey } from "../../lib/studio-time";
import type { HistoryCoverage } from "../../lib/prior-history";
import type { ProgressReportsStatus } from "../client-profile/client-answer";
import { buildStory } from "../client-story/story";
import { pronounsOf } from "./kit/pronouns";
import { codexAccess } from "./access";
import {
  codexFordStatus,
  notesOfJournal,
  pulseFromReports,
  runningFocuses,
  storySourcesOf,
  NO_PROGRAMMING,
  type CodexData,
  type CodexProgramming,
  type SessionTotals,
} from "./codex-data";

export interface UseCodexDataArgs {
  client: Client;
  authTrainer: Trainer | null;
  /** The signed-in trainer as the trainers stream has them now (sees the grant live). */
  liveTrainer: Trainer | null;
  machines: Machine[];
  trainers: Trainer[];
  progressReports: ProgressReport[];
  progressReportsStatus: ProgressReportsStatus;
  sessionTotals: SessionTotals;
  coverage: HistoryCoverage;
  /** What the profile holds about her programming (Body & Pulse's floor). */
  programming?: CodexProgramming;
}

export function useCodexData({
  client,
  authTrainer,
  liveTrainer,
  machines,
  trainers,
  progressReports,
  progressReportsStatus,
  sessionTotals,
  coverage,
  programming = NO_PROGRAMMING,
}: UseCodexDataArgs): CodexData {
  const { studios, availableStudios } = useActiveStudio();
  const reader = liveTrainer ?? authTrainer;
  const clientId = client.id ?? null;

  const access = useMemo(
    () => codexAccess(reader, client, studios?.length ? studios : availableStudios),
    [reader, client, studios, availableStudios],
  );

  // The four listeners. Each is opened here and nowhere else on the tab.
  const liveJournal = useClientJournal({ clientId, client, trainers });
  // The hook hands back a new object every render; its parts are stable
  // until they change. Held by its parts, so the pages re-render when the
  // journal changes and not whenever the profile around them does.
  const journal = useMemo(
    () => liveJournal,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      liveJournal.entries,
      liveJournal.threads,
      liveJournal.focuses,
      liveJournal.criticalEntries,
      liveJournal.headsUpEntries,
      liveJournal.isLoading,
      liveJournal.needsIndex,
      liveJournal.capped,
      liveJournal.loadState,
      liveJournal.recentSessions,
    ],
  );
  const ford = useClientFord({ clientId, client, enabled: access.fordReadable });
  const inbody = useInBodyScans(clientId);
  // The Auth uid: the dismissals document is keyed by it, never authTrainer.id.
  const uid = auth.currentUser?.uid ?? null;
  const dismissals = useNoteDismissalsState(uid);

  const today = studioTodayKey();

  // The Auth uid, not authTrainer.id: the FORD and journal rules pin the
  // author to it, and the two differ on older accounts.
  const author = useMemo(
    () => ({
      id: uid || authTrainer?.id || "",
      initials: (authTrainer?.initials || "TR").toUpperCase(),
      fullName: authTrainer?.fullName || "Coach",
    }),
    [uid, authTrainer],
  );

  const notes = useMemo(() => notesOfJournal(journal, today), [journal, today]);
  const focusesRunning = useMemo(() => runningFocuses(journal), [journal]);
  const mine = useMemo(
    () => (clientId ? progressReports.filter((r) => r.clientId === clientId) : []),
    [progressReports, clientId],
  );
  const pulse = useMemo(
    () => pulseFromReports(progressReports, clientId, progressReportsStatus),
    [progressReports, clientId, progressReportsStatus],
  );
  const pronouns = useMemo(() => pronounsOf(client), [client]);
  const fordStatus = codexFordStatus(access.fordReadable, ford.status);
  // Her story, built once from what the tab already holds (no read): the
  // Story page and the Overview's Story slot read the same one.
  const story = useMemo(
    () =>
      buildStory({
        today,
        client,
        coverage,
        totals: sessionTotals,
        pronouns,
        ...storySourcesOf({ journal, fordStatus, fordEntries: ford.entries, inbody, pulse }),
      }),
    [today, client, coverage, sessionTotals, pronouns, journal, fordStatus, ford.entries, inbody, pulse],
  );

  return useMemo<CodexData>(
    () => ({
      client,
      today,
      access,
      pronouns,
      authTrainer,
      author,
      machines,
      trainers,
      availableStudios,
      journal,
      notes,
      focusesRunning,
      ford,
      fordStatus,
      inbody,
      progressReports: mine,
      pulse,
      dismissals,
      sessionTotals,
      coverage,
      programming,
      story,
    }),
    [
      client,
      today,
      access,
      pronouns,
      authTrainer,
      author,
      machines,
      trainers,
      availableStudios,
      journal,
      notes,
      focusesRunning,
      ford,
      fordStatus,
      inbody,
      mine,
      pulse,
      dismissals,
      sessionTotals,
      coverage,
      programming,
      story,
    ],
  );
}
