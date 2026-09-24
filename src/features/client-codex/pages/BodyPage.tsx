/**
 * BODY & PULSE — the codex page: the Body & Pulse area's page
 * (`body/BodyPulsePage`) on the tab's one load.
 *
 * A thin adapter (INTEGRATION: pages/*.tsx map the tab's one load onto each
 * area's page). The journal, the Pulse history and the InBody scans are the
 * tab's ONE load; the page's own reads — the client's one Pulse draft, the
 * machine catalog and machine fit — happen when it is first visited, because
 * the shell mounts a page on its first visit. What Programming holds (her
 * settings, her routines, the roster, the studio) comes from the profile
 * through `data.programming`. Who may do what is `codexAccess`, worked out
 * once by the shell; every record field goes through the ONE form.
 */
import { useCallback } from "react";
import { isRecordAnchor, noteAnchor } from "../../client-profile/profile-nav";
import { BodyPulsePage } from "../body/BodyPulsePage";
import type { CodexPageProps } from "../codex-data";

export function BodyPage({ data, form, go, hosts }: CodexPageProps) {
  const { client, access, authTrainer, machines, journal, notes, pulse, inbody, programming, pronouns, today } = data;
  const openNote = useCallback(
    (threadId: string) => {
      const at = noteAnchor(threadId);
      go("notes", isRecordAnchor(at) ? at : undefined);
    },
    [go],
  );
  return (
    <BodyPulsePage
      client={client}
      form={form}
      canEdit={access.canEdit}
      fordReadable={access.fordReadable}
      authTrainer={authTrainer}
      machines={machines}
      journal={journal}
      notesState={notes.state}
      pulse={pulse}
      filedReports={pulse.status === "ready" ? data.progressReports.length : null}
      inbody={inbody}
      programming={programming}
      pronouns={pronouns}
      today={today}
      go={go}
      onOpenNote={openNote}
      onOpenMachine={hosts.onOpenMachine}
      onOpenSetup={hosts.onOpenSetup}
      onOpenReports={hosts.onOpenReports}
    />
  );
}
