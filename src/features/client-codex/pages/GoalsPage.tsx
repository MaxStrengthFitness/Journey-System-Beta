/**
 * GOALS & FOCUS — the codex page: the Goals & Focus area's page
 * (`goals/GoalsPage`) on the tab's one load.
 *
 * A thin adapter (INTEGRATION: pages/*.tsx map the tab's one load onto each
 * area's page). The journal (her notes, the focuses and their check-ins) and
 * FORD (the why's Dreams line — never opened for a reader the FORD rule
 * refuses, whose status is then `off`) are the tab's ONE load; the page's own
 * reads — the team's shared plans and this trainer's jots — happen when it
 * is first visited, because the shell mounts a page on its first visit and
 * keeps it. Who may do what is `codexAccess`, worked out once by the shell;
 * every record field goes through the ONE form, and a door to one note opens
 * it on Notes (`note-{id}`, which Notes interprets itself).
 */
import { useCallback, useMemo } from "react";
import { isRecordAnchor, noteAnchor } from "../../client-profile/profile-nav";
import { GoalsPage as GoalsArea } from "../../goals/GoalsPage";
import { intakeGoalsLines, parseIntakeNotes } from "../../client-admin/intake";
import type { CodexPageProps } from "../codex-data";

export function GoalsPage({ data, form, go, hosts }: CodexPageProps) {
  const { client, access, authTrainer, machines, journal, notes, coverage, pronouns, today } = data;
  // The Goals lines of her Mindbody account notes, read by the intake
  // matcher's parser (phase 17) and shown under her why, read only: Account
  // is the one place a line is ever copied anywhere.
  const signUpGoals = useMemo(() => intakeGoalsLines(parseIntakeNotes(client.mindbodyNotes)), [client.mindbodyNotes]);
  const openThread = useCallback(
    (threadId: string) => {
      const at = noteAnchor(threadId);
      go("notes", isRecordAnchor(at) ? at : undefined);
    },
    [go],
  );
  return (
    <GoalsArea
      client={client}
      form={form}
      canEdit={access.canEdit}
      authTrainer={authTrainer}
      machines={machines}
      journal={journal}
      notesState={notes.state}
      ford={{ status: data.fordStatus, entries: data.ford.entries }}
      coverage={coverage}
      pronouns={pronouns}
      today={today}
      go={go}
      onOpenThread={openThread}
      onOpenPlanner={hosts.onOpenPlanner}
      signUpGoals={signUpGoals}
    />
  );
}
