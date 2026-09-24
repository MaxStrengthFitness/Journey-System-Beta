/**
 * GOALS & FOCUS — the codex page (shell phase: an adapter).
 *
 * Hosts the long scroll's Goals and Focus sections as they were: the coach
 * strategy, the why and the goal (GoalsPanel — every edit through the one
 * Save bar), each coach's focus on the tab's ONE journal load, the team's
 * shared plans and this trainer's own jots, and Mindbody's indexes. The
 * Goals & Focus area rebuilds the page in its own phase.
 *
 * The shared plans and the jots each read for themselves, as they always
 * have — but only once this page is first visited, not when the tab opens.
 */
import { GoalsPanel } from "../../goals/GoalsPanel";
import { SharedNotesCard } from "../../relay/notes/SharedNotesCard";
import { ClientJotStrip } from "../../relay/notes/ClientJotStrip";
import { ClientJournalTab } from "../../../components/journal/ClientJournalTab";
import { Card, Page, agree } from "../kit";
import type { CodexPageProps } from "../codex-data";
import { RecordLock } from "./RecordLock";
import { CoachStrategyBlock, MindbodyIndexesBlock } from "./legacy-blocks";

export function GoalsPage({ data, form, go, hosts }: CodexPageProps) {
  const { client, access, authTrainer, machines, trainers, journal, pronouns: p, progressReports } = data;
  const locked = !access.canEdit;
  const lede =
    `How to coach ${p.object}, ${p.possessive} why, what ${p.subject} ${agree(p, "is", "are")} working toward now, ` +
    "and what each coach is working on.";
  const hasIndexes = Object.keys(client.mindbodyIndexes || {}).length > 0;

  return (
    <Page id="goals" title="Goals & Focus" lede={lede} go={go}>
      <Card eyebrow={`How to coach ${p.object}`} id="goals-coach">
        <RecordLock locked={locked}>
          <CoachStrategyBlock formData={form.formData} updateField={form.updateField} />
        </RecordLock>
      </Card>

      <Card host>
        <RecordLock locked={locked}>
          <GoalsPanel
            client={client}
            formData={form.formData}
            updateField={form.updateField}
            authTrainer={authTrainer}
            anchors={{ why: "goals-why", now: "goals-now" }}
          />
        </RecordLock>
      </Card>

      <Card eyebrow="Coach focuses" id="goals-focus">
        <ClientJournalTab
          areas={["focus"]}
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
      </Card>

      <Card host id="goals-plans">
        <SharedNotesCard client={client} authTrainer={authTrainer} onOpenPlanner={hosts.onOpenPlanner} />
        <ClientJotStrip client={client} onOpenPlanner={hosts.onOpenPlanner} />
      </Card>

      {hasIndexes ? (
        <Card eyebrow="From Mindbody">
          <MindbodyIndexesBlock client={client} />
        </Card>
      ) : null}
    </Page>
  );
}
