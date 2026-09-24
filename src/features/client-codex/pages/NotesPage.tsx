/**
 * NOTES — the codex page (shell phase: an adapter).
 *
 * Hosts the long scroll's Notes section as it was — the composer and the
 * threads (`ClientJournalTab`'s notes area) — on the tab's ONE journal load,
 * so it opens no listener of its own. The Notes area rebuilds this page in
 * its own phase (open cards, standing rows, resolved folded) and takes over
 * the `note-{id}` and `notes-compose` anchors, which the shell leaves to it.
 */
import { ClientJournalTab } from "../../../components/journal/ClientJournalTab";
import { Card, Page } from "../kit";
import type { CodexPageProps } from "../codex-data";

export function NotesPage({ data, go, hosts }: CodexPageProps) {
  const { client, journal, machines, trainers, authTrainer, progressReports } = data;
  return (
    <Page
      id="notes"
      title="Notes"
      lede="Every note is a thread. Open means it matters now, loudest first. Standing context is simply true. Resolved notes wait at the bottom with a way back."
      go={go}
    >
      <Card host>
        <ClientJournalTab
          areas={["notes"]}
          journal={journal}
          onOpenFord={() => go("ford")}
          clientId={client.id || null}
          client={client}
          machines={machines}
          trainers={trainers}
          authTrainer={authTrainer}
          progressReports={progressReports}
          onSelectReport={hosts.onSelectReport}
          onDeleteReport={hosts.onDeleteReport}
          onNewReport={hosts.onNewReport}
        />
      </Card>
    </Page>
  );
}
