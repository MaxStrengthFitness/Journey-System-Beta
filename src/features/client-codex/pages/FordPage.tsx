/**
 * FORD — the codex page: the FORD area's page (`ford/page/FordPage`) on the
 * tab's one load.
 *
 * A thin adapter (INTEGRATION: pages/*.tsx map the tab's one load onto each
 * area's page). FORD is the tab's ONE stream — never opened for a reader the
 * FORD rule refuses (a cross-train studio), whose page then says whose FORD
 * it is. The older life notes are the journal load's settled life notes
 * (`notes.record.lifeSettled`, which leave Notes for this page), the Pulse
 * lines the history the profile already streams, and the Work and
 * Recreation bands edit the record through the ONE form, saved by the ONE
 * Save bar. Who may do what is `codexAccess`, worked out once by the shell:
 * `canEdit` changes the record and what FORD holds, `fordWritable` (the FORD
 * create rule) adds to it. `writeLine` is the shell's request from a door to
 * In one line (the Overview's "Write one").
 */
import { FordPage as FordArea } from "../../ford/page/FordPage";
import type { CodexPageProps } from "../codex-data";

export function FordPage({ data, form, go, writeLine = null }: CodexPageProps & { writeLine?: unknown }) {
  const { client, access, author, pronouns, today, ford, fordStatus, notes, pulse } = data;
  return (
    <FordArea
      client={client}
      ford={ford}
      status={fordStatus}
      older={{ state: notes.state, settled: notes.record.lifeSettled }}
      pulse={pulse}
      form={form}
      canEdit={access.canEdit}
      canAdd={access.fordWritable}
      writeLine={writeLine}
      homeStudioName={access.homeStudioName}
      author={author}
      pronouns={pronouns}
      today={today}
      go={go}
    />
  );
}
