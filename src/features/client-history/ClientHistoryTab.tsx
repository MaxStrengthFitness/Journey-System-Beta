import { useCallback, useMemo, useState } from "react";
import type { Client, ExerciseLog, Machine, Routine, Trainer } from "../../types";
import { HistoryView } from "./HistoryView";
import { LogPastSessionDialog } from "./LogPastSessionDialog";
import { SessionDetailDialog } from "./SessionDetailDialog";
import { trainerLookup } from "./trainers";
import { routineNamer } from "./model";
import { useSessionHistory, useSessionLogs } from "./useSessionHistory";
import type { HistorySession } from "./model";

/**
 * The client profile's History tab: every read and write lives here, every
 * pixel lives in HistoryView.
 *
 * Replaces components/ClientHistoryCalendar.tsx (1,775 lines — one month at a
 * time, a hard 30-session limit, and a "Load More Sessions" button beneath it
 * in ClientProfileView that set a state variable nothing ever read).
 */
export interface ClientHistoryTabProps {
  clientId: string;
  client?: Client | null;
  machines: Machine[];
  trainers: Trainer[];
  /** The client's routines: sessions store a routineId, and this names it. */
  routines?: Routine[];
  /** Sets the profile already loaded for the Journey grid — reused, not re-read. */
  seedLogs?: ExerciseLog[];
  /** The client's home studio timezone, when it has one. */
  timeZone?: string;
  /** True while the profile is backing off after a quota error. */
  disabled?: boolean;
}

export function ClientHistoryTab({
  clientId,
  client,
  machines,
  trainers,
  routines,
  seedLogs,
  timeZone,
  disabled = false,
}: ClientHistoryTabProps) {
  const history = useSessionHistory(clientId, !disabled);
  const { logsBySession, request, replace } = useSessionLogs(seedLogs);
  const [opened, setOpened] = useState<{ key: number; sessions: HistorySession[] } | null>(null);
  const [logPastOpen, setLogPastOpen] = useState(false);
  const trainerFor = useMemo(() => trainerLookup(trainers), [trainers]);
  const routineNameFor = useMemo(() => routineNamer(routines), [routines]);

  const openSessions = useCallback((sessions: HistorySession[]) => {
    if (sessions.length > 0) setOpened({ key: Date.now(), sessions });
  }, []);

  return (
    <>
      <HistoryView
        sessions={history.sessions}
        status={history.status}
        hasMore={history.hasMore}
        isFull={history.isFull}
        onLoadAll={history.loadAll}
        clientSessionCount={client?.sessionCount ?? client?.completedSessions}
        events={client?.events}
        trainers={trainers}
        routines={routines}
        logsBySession={logsBySession}
        onNeedLogs={request}
        onOpenSessions={openSessions}
        onLogPast={() => setLogPastOpen(true)}
        timeZone={timeZone}
      />

      {opened && (
        <SessionDetailDialog
          key={opened.key}
          initialSessions={opened.sessions}
          onClose={() => setOpened(null)}
          clientId={clientId}
          machines={machines}
          trainerFor={trainerFor}
          routineNameFor={routineNameFor}
          timeZone={timeZone}
          onLogsChanged={replace}
        />
      )}

      <LogPastSessionDialog
        open={logPastOpen}
        onOpenChange={setLogPastOpen}
        clientId={clientId}
        clientHomeStudioId={client?.homeStudioId}
        machines={machines}
        trainers={trainers}
        timeZone={timeZone}
      />
    </>
  );
}
