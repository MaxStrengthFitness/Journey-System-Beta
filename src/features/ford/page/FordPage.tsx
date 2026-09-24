/**
 * FORD — the page of Notes & Profile where a client's life is kept.
 *
 * Client codex, Sep 2026. It replaces the long scroll's Life section (the work
 * and activity baselines, the FORD hub, and a rail of old life notes that
 * nothing linked to anything). Top to bottom, as the approved mockup has it:
 *
 *   head          the lede, and "Remember something" (a new detail, no pillar)
 *   Coming up     the Mindbody birthday and FORD's dated details, soonest first
 *   To file       what was caught on the floor and not filed yet
 *   four pillars  Family · Occupation · Recreation · Dreams, each built the
 *                 same way (PillarCard): band, facts, moments and older life
 *                 notes, the Pulse beside it, a gap line, and Ask next
 *   older notes   life notes from before FORD that belong to no pillar
 *   above and beyond   the gestures, Idea → Planned → Done
 *
 * ONE LOAD. The page opens no listener of its own: FORD is the tab's one
 * stream (`useCodexData` — never opened for a reader the FORD rule refuses),
 * the older life notes are the tab's one journal load (Notes' `lifeSettled`,
 * which leave Notes now that this page carries them), and the Pulse lines are
 * the history the profile already streams. Everything is worked out in
 * useMemo from those props.
 *
 * WHO MAY DO WHAT. The bands are record fields: a reader who may change the
 * record (`canEdit`) gets Edit on Occupation and Recreation, and the one Save
 * bar saves them. A FORD detail is written the moment it is added, and only
 * by a reader the FORD create rule accepts — the same `canEdit`, a signed-in
 * author (the Auth uid), and a client with a studio (`fordCanAdd`). A failed
 * READ still lets a trainer add (never block a save); a refused one does not.
 *
 * A FAILED READ IS UNKNOWN, NEVER EMPTY. While FORD loads the pillars say
 * "Loading…"; if it failed or is the home studio's to read, a notice says so
 * and no pillar says "Nothing on file yet". The older notes, the bands and
 * the Pulse lines are not FORD's, so they show whatever FORD's state.
 */
import { useMemo, useState } from "react";
import { Info, Plus } from "lucide-react";
import type { Client } from "../../../types";
import type { JournalLoad } from "../../../hooks/useClientJournal";
import { mindbodyIdOf } from "../../../lib/mindbody-id";
import { clientFirstName } from "../../../lib/client-name";
import { useToast } from "../../../contexts/ToastContext";
import { Btn, Card, Page, useReadEdit, type CodexGo, type Pronouns } from "../../client-codex/kit";
import type { RecordForm } from "../../client-codex/useRecordForm";
import type { AssessmentHistory } from "../../subjective-report/assessment-history";
import type { ProgressReportsStatus } from "../../client-profile/client-answer";
import { olderLifeNotesByPillar } from "../../client-notes/record-selectors";
import type { NoteThread } from "../../client-notes/threads";
import { isRetiredClient } from "../../client-life/life";
import { FordDetailDialog, type FordDetailValues } from "../FordDetailDialog";
import {
  archiveFordEntry,
  createFordEntry,
  fordStudioIdOf,
  tagFordEntry,
  updateFordEntry,
  type FordAuthor,
} from "../ford-write";
import { FORD_READ_NOTICE, fordCanAdd, fordReadNotice } from "../read-status";
import type { UseClientFordResult } from "../useClientFord";
import { FORD_PILLARS, type FordEntry, type FordPillar } from "../types";
import { askNext, askNextMeta } from "../ask-next";
import { comingUp, studioNoon, type ComingUpRow } from "../coming-up";
import { fordPulseLinks } from "../pulse-links";
import { gesturesForClient, pillarItems, type FordPageStatus } from "../page-model";
import { ComingUp } from "./ComingUp";
import { UnfiledTray } from "./UnfiledTray";
import { PillarCard, OlderNoteItem, type PillarFordState } from "./PillarCard";
import { AskNextLine } from "./AskNextLine";
import { AboveAndBeyond } from "./AboveAndBeyond";
import { DreamsBand, FamilyBand, OccupationBand, RecreationBand } from "./bands";
import "./ford-page.css";

export const FORD_PAGE_LEDE =
  "Family, occupation, recreation, dreams: the four things worth knowing about a person. Catch it once, and anyone on the team can pick up the conversation, or go above and beyond.";

/** How many unplaced older notes show before "Show all". */
const OLDER_SHOWN = 3;

/** One empty list, so an unread FORD does not re-work every memo on every render. */
const NO_ENTRIES: FordEntry[] = [];

export interface FordPageProps {
  client: Client;
  /** The tab's one FORD stream. For a reader the rule refuses it was never opened (`status` is "off"). */
  ford: UseClientFordResult;
  status: FordPageStatus;
  /** The life notes Notes settled for this page (`notesOnRecord().lifeSettled`), and whether the journal answered. */
  older: { state: JournalLoad; settled: readonly NoteThread[] };
  /** The Pulse history the profile already streams. */
  pulse: { status: ProgressReportsStatus; history: AssessmentHistory | null };
  form: Pick<RecordForm, "formData" | "updateField" | "isDirty" | "revision">;
  /** May change the client record (codexAccess().canEdit) — and so write FORD. */
  canEdit: boolean;
  homeStudioName: string | null;
  /** Who writes: the Auth uid as `id` ("" when nobody is signed in). */
  author: FordAuthor;
  pronouns: Pronouns;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
  go: CodexGo;
}

type NewDetail = { pillar: FordPillar | null; initial?: Partial<FordDetailValues>; openGesture?: boolean };
type DialogState = { kind: "edit"; entry: FordEntry } | ({ kind: "new" } & NewDetail);

export function FordPage({
  client,
  ford,
  status,
  older,
  pulse,
  form,
  canEdit,
  homeStudioName,
  author,
  pronouns,
  today,
  go,
}: FordPageProps) {
  const { success: toastSuccess } = useToast();
  const clientId = client.id ?? "";
  const studioId = fordStudioIdOf(client);
  const now = useMemo(() => studioNoon(today), [today]);

  // What the page may say about FORD itself.
  const readable = status === "ready" || status === "failed";
  const fordState: PillarFordState = status === "ready" ? "ready" : status === "loading" ? "loading" : "unread";
  const notice =
    status === "off" || status === "denied"
      ? homeStudioName
        ? `FORD is kept by ${homeStudioName}, and only its team can read it or add to it.`
        : FORD_READ_NOTICE.denied
      : fordReadNotice(status, studioId);

  // Who may write FORD here: the create rule wants a trainer of the client's
  // studio (canEdit is that answer), a signed-in author, and a studio to stamp.
  const canWrite = canEdit && !!author.id && !!clientId && fordCanAdd(status === "off" ? "denied" : status, studioId);

  const entries = readable ? ford.entries : NO_ENTRIES;
  const rows = useMemo(
    () => comingUp({ dateOfBirth: client.dateOfBirth, entries, todayKey: today }),
    [client.dateOfBirth, entries, today],
  );
  const untagged = readable ? ford.untagged : NO_ENTRIES;
  const olderByPillar = useMemo(
    () => (older.state === "ready" ? olderLifeNotesByPillar(older.settled) : null),
    [older.state, older.settled],
  );
  const pulseLinks = useMemo(
    () => (pulse.status === "ready" && pulse.history ? fordPulseLinks(pulse.history.reports, now) : null),
    [pulse.status, pulse.history, now],
  );
  const gestures = useMemo(() => gesturesForClient(entries, now), [entries, now]);

  // Retired, as the form holds it now: toggling Retired changes Ask next at once.
  const retired = isRetiredClient({
    isRetired: form.formData.isRetired ?? client.isRetired,
    occupation: form.formData.occupation ?? client.occupation,
  });

  const work = useReadEdit({ canEdit, revision: form.revision });
  const recreation = useReadEdit({ canEdit, revision: form.revision });

  const [dialog, setDialog] = useState<DialogState | null>(null);
  const openEntry = canWrite ? (entry: FordEntry) => setDialog({ kind: "edit", entry }) : null;
  const addUnder = (pillar: FordPillar | null, extra: Omit<NewDetail, "pillar"> = {}) =>
    setDialog({ kind: "new", pillar, ...extra });
  const fresh = dialog?.kind === "new" ? dialog : null;

  const openComingUp = canWrite
    ? (row: ComingUpRow) => {
        if (row.kind === "detail") {
          setDialog({ kind: "edit", entry: row.entry });
        } else if (row.linked) {
          setDialog({ kind: "edit", entry: row.linked });
        } else {
          // The birthday nobody has planned for yet: a Family detail already
          // filled in, every year, with the gesture open.
          addUnder("family", {
            initial: { pillar: "family", body: "Birthday", subject: "Birthday", eventDate: row.when, recurrence: "annual" },
            openGesture: true,
          });
        }
      }
    : null;

  // Planning a birthday nobody has planned is offered only once FORD has
  // answered. While it loads, or when the read failed, the client's own
  // "Birthday" detail may exist unseen, and planning it would make a second;
  // until then that card is read only (a linked one still opens).
  const canOpenComingUp = (row: ComingUpRow) => row.kind === "detail" || row.linked !== null || status === "ready";

  const save = async (values: FordDetailValues): Promise<boolean> => {
    if (!canWrite || !dialog) return false;
    const ok =
      dialog.kind === "edit"
        ? await updateFordEntry(clientId, dialog.entry.id, values)
        : (await createFordEntry(clientId, studioId, author, { ...values, origin: "profile" })) !== null;
    if (ok) toastSuccess("Saved to FORD.");
    return ok;
  };

  const bandProps = {
    client,
    formData: form.formData,
    updateField: form.updateField,
    pronouns,
  };

  const unplaced = olderByPillar?.unplaced ?? [];
  const [allOlder, setAllOlder] = useState(false);
  const shownPulse = pulseLinks !== null && FORD_PILLARS.some((p) => pulseLinks[p].length > 0);

  return (
    <Page
      id="ford"
      title="FORD"
      lede={FORD_PAGE_LEDE}
      go={go}
      actions={
        canEdit ? (
          <Btn variant="solid" icon={Plus} disabled={!canWrite} onClick={() => addUnder(null)}>
            Remember something
          </Btn>
        ) : null
      }
    >
      {notice ? (
        <p className="fordpg-notice" role="status" data-testid="ford-read-notice">
          <Info size={16} aria-hidden="true" className="fordpg-notice__icon" />
          <span>{notice}</span>
        </p>
      ) : null}
      {older.state === "failed" ? (
        <p className="fordpg-notice" role="status">
          <Info size={16} aria-hidden="true" className="fordpg-notice__icon" />
          <span>Older life notes couldn't be loaded, so some may be missing here.</span>
        </p>
      ) : null}

      <ComingUp
        rows={rows}
        pronouns={pronouns}
        birthdaySource={mindbodyIdOf(client) && !client.provisional ? "from Mindbody" : "from the record"}
        onOpen={openComingUp}
        canOpen={canOpenComingUp}
      />

      <UnfiledTray
        untagged={untagged}
        now={now}
        onOpen={openEntry}
        onFile={canWrite ? (entry, pillar) => tagFordEntry(clientId, entry.id, pillar) : null}
      />

      <div className="fordpg-pillars">
        {FORD_PILLARS.map((pillar) => {
          const bucket = readable ? ford.buckets.find((b) => b.pillar === pillar) ?? null : null;
          const list = pillarItems(bucket, olderByPillar?.[pillar] ?? []);
          const ask = askNext(pillar, { retired, seed: now });
          let band;
          let edit: { open: boolean; onToggle: () => void } | null = null;
          if (pillar === "family") band = <FamilyBand client={client} pronouns={pronouns} />;
          else if (pillar === "occupation") {
            band = (
              <OccupationBand
                {...bandProps}
                dirty={form.isDirty("occupation", "workProfile", "isRetired")}
                editing={work.open}
              />
            );
            if (canEdit) edit = { open: work.open, onToggle: work.toggle };
          } else if (pillar === "recreation") {
            band = (
              <RecreationBand
                {...bandProps}
                dirty={form.isDirty("activityLevel", "recreationActivities")}
                editing={recreation.open}
              />
            );
            if (canEdit) edit = { open: recreation.open, onToggle: recreation.toggle };
          } else {
            band = (
              <DreamsBand
                why={(form.formData.globalNotes as string | undefined) ?? client.globalNotes}
                pronouns={pronouns}
                onOpenGoals={() => go("goals", "goals-why")}
              />
            );
          }
          return (
            <PillarCard
              key={pillar}
              pillar={pillar}
              band={band}
              edit={edit}
              list={list}
              fordState={fordState}
              olderKnown={olderByPillar !== null}
              pulseLinks={pulseLinks?.[pillar] ?? []}
              askLine={<AskNextLine ask={ask} meta={askNextMeta(ask, pillar, pronouns.known ? pronouns : null)} />}
              now={now}
              onOpen={openEntry}
              onAdd={canWrite ? () => addUnder(pillar) : null}
            />
          );
        })}
      </div>

      {shownPulse ? (
        <p className="fordpg-footnote">
          Pulse lines are read from the Pulse rounds and shown side by side. Nothing is copied between FORD and the Pulse.
        </p>
      ) : null}

      {unplaced.length > 0 ? (
        <Card eyebrow="Older life notes" meta="From before FORD, and filed under no pillar">
          <div className="fordpg-older">
            {(allOlder ? unplaced : unplaced.slice(0, OLDER_SHOWN)).map((t) => (
              <OlderNoteItem key={t.id} thread={t} now={now} />
            ))}
          </div>
          {unplaced.length > OLDER_SHOWN ? (
            <div>
              <Btn variant="quiet" aria-expanded={allOlder} onClick={() => setAllOlder((v) => !v)}>
                {allOlder ? "Show fewer" : `Show all ${unplaced.length}`}
              </Btn>
            </div>
          ) : null}
        </Card>
      ) : null}

      {readable ? (
        <AboveAndBeyond
          gestures={gestures}
          now={now}
          clientId={clientId}
          known={status === "ready"}
          me={canWrite ? { id: author.id, name: author.fullName } : null}
          onAddIdea={canWrite ? () => addUnder(null, { openGesture: true }) : null}
          onOpen={openEntry}
        />
      ) : null}

      <FordDetailDialog
        open={dialog !== null}
        entry={dialog?.kind === "edit" ? dialog.entry : null}
        defaultPillar={fresh?.pillar ?? null}
        initial={fresh?.initial}
        openGesture={fresh?.openGesture ?? false}
        bodyPlaceholder={fresh?.openGesture && !fresh.initial ? `e.g. "Grandson graduates from Ohio State in May"` : undefined}
        clientFirstName={clientFirstName(client) || "them"}
        author={author}
        onClose={() => setDialog(null)}
        onSave={save}
        onArchive={async (entry) => {
          await archiveFordEntry(clientId, entry.id);
        }}
      />
    </Page>
  );
}
