/**
 * BODY & PULSE — the codex page (shell phase: an adapter).
 *
 * Hosts the long scroll's Body section and its Pulse as they were: the
 * build (height, wingspan, weight), the training story (Experience, moved
 * here from Life — AJ's decision 6), the watch-outs, the InBody card on the
 * tab's ONE scans stream, and the Pulse panel. The "Recovery between
 * sessions" select is gone from every screen (decision 7); the field stays on
 * the record. The Body & Pulse area rebuilds the page in its own phases.
 *
 * The Pulse panel keeps its own draft, as it always has; it mounts only when
 * this page is first visited, so its read costs nothing until then.
 */
import { ExperienceEditor } from "../../client-life/LifeBaseline";
import { InBodyCard } from "../../inbody/InBodyCard";
import { ClientJournalTab } from "../../../components/journal/ClientJournalTab";
import { JournalRail } from "../../../components/client-dossier/JournalRail";
import { Card, Page, agree } from "../kit";
import type { CodexPageProps } from "../codex-data";
import { RecordLock } from "./RecordLock";
import { BuildBlock, ReportsLinkBlock, WatchOutsBlock } from "./legacy-blocks";

/**
 * What the watch-outs rail says when it lists no note. "None logged" only
 * once the notes are read: while they load it says nothing, and when they
 * failed it says some may be missing — a failed read is unknown, never empty.
 */
function watchOutsRailHint(state: CodexPageProps["data"]["notes"]["state"]): string | undefined {
  if (state === "ready") {
    return "No injury or incident notes logged. Injury notes, clinical incidents, and anything flagged critical anywhere surface here automatically.";
  }
  if (state === "failed") return "Injury and incident notes couldn't be loaded, so some may be missing.";
  return undefined;
}

export function BodyPage({ data, form, go, hosts }: CodexPageProps) {
  const { client, access, authTrainer, machines, trainers, journal, pronouns: p, progressReports } = data;
  const locked = !access.canEdit;
  const lede =
    `How ${p.subject} ${agree(p, "is", "are")} built as the machines see ${p.object}, what the load has to work around, ` +
    `and how ${p.subject} ${agree(p, "says", "say")} ${p.subject} ${agree(p, "feels", "feel")}. The app describes; the trainer decides.`;

  return (
    <Page id="body" title="Body & Pulse" lede={lede} go={go}>
      <Card eyebrow="Build" id="body-build">
        <RecordLock locked={locked}>
          <BuildBlock formData={form.formData} updateField={form.updateField} />
        </RecordLock>
      </Card>

      <Card eyebrow="Training story" id="body-training-story">
        <RecordLock locked={locked}>
          <ExperienceEditor
            client={client}
            formData={form.formData}
            updateField={form.updateField}
            authorName={authTrainer?.fullName}
          />
        </RecordLock>
      </Card>

      <Card eyebrow="Watch-outs" id="body-watchouts">
        <RecordLock locked={locked}>
          <WatchOutsBlock
            client={client}
            formData={form.formData}
            updateField={form.updateField}
            machines={machines}
          />
        </RecordLock>
        {/* What happened in the room: injury and incident notes, anything critical. */}
        <JournalRail
          section="medical"
          entries={journal.entries}
          machines={machines}
          emptyHint={watchOutsRailHint(data.notes.state)}
        />
      </Card>

      {/* InBody scans save on their own, not through the Save bar. */}
      <Card host id="body-inbody">
        <InBodyCard client={client} authTrainer={authTrainer} inbody={data.inbody} />
      </Card>

      <Card eyebrow="Pulse" id="body-pulse">
        <ClientJournalTab
          areas={["check-in"]}
          journal={journal}
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
        <ReportsLinkBlock
          count={data.pulse.status === "ready" ? progressReports.length : null}
          onOpenReports={hosts.onOpenReports}
        />
      </Card>
    </Page>
  );
}
