/**
 * FORD — the codex page (shell phase: an adapter).
 *
 * Hosts the long scroll's Life section as it was: the work and recreation
 * baselines (client-document fields, saved by the one Save bar) and the FORD
 * hub on the tab's ONE FORD stream. The FORD area rebuilds it in its own
 * phase (Coming up, the four pillars, "In one line").
 *
 * A reader the FORD rule refuses (a cross-train studio) gets no FORD
 * listener at all — the tab never opens one for them — and a sentence
 * saying whose it is, rather than a list that would only fail.
 * Experience moved to Body & Pulse → Training story (AJ's decision 6).
 */
import { WorkBaseline, ActivityExperienceBaseline } from "../../client-life/LifeBaseline";
import { FordSection } from "../../ford/FordSection";
import { FORD_READ_NOTICE } from "../../ford/read-status";
import { JournalRail } from "../../../components/client-dossier/JournalRail";
import { Card, Page } from "../kit";
import type { CodexPageProps } from "../codex-data";
import { RecordLock } from "./RecordLock";

export function FordPage({ data, form, go }: CodexPageProps) {
  const { client, access, authTrainer, author, machines, journal } = data;
  const locked = !access.canEdit;
  return (
    <Page
      id="ford"
      title="FORD"
      lede="Family, occupation, recreation, dreams: catch it once, and anyone on the team can pick up the conversation."
      go={go}
    >
      <Card eyebrow="Occupation" id="ford-occupation">
        <RecordLock locked={locked}>
          <WorkBaseline
            client={client}
            formData={form.formData}
            updateField={form.updateField}
            authorName={authTrainer?.fullName}
          />
        </RecordLock>
      </Card>
      <Card eyebrow="Recreation" id="ford-recreation">
        <RecordLock locked={locked}>
          <ActivityExperienceBaseline
            part="activity"
            client={client}
            formData={form.formData}
            updateField={form.updateField}
            authorName={authTrainer?.fullName}
          />
        </RecordLock>
      </Card>

      {access.fordReadable ? (
        <Card host>
          <FordSection client={client} author={author} machines={machines} ford={data.ford} />
        </Card>
      ) : (
        <Card eyebrow="Family, occupation, recreation, dreams">
          <p>
            {access.homeStudioName
              ? `FORD is kept by ${access.homeStudioName}, and only its team can read it or add to it.`
              : FORD_READ_NOTICE.denied}
          </p>
        </Card>
      )}

      {/* Personal notes written before FORD existed: read only, and quiet. */}
      <JournalRail section="life" entries={journal.entries} machines={machines} emptyHint="" />
    </Page>
  );
}
