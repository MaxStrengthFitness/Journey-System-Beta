/**
 * MINDBODY ACCOUNT NOTES — the Account page's card, and the intake matcher's
 * one place (client codex, phase 17; AJ's decision 4).
 *
 * The studio types a new client's sign-up answers into Mindbody's account
 * notes ("OCC: … / MED: … / ACTIVITY: … / GOALS: …"), and until now they
 * stayed there: the real client AJ looked at had all four in Mindbody and
 * none of them in Journey. The card shows the notes one line at a time,
 * verbatim, and for a line it recognises says where in Journey it belongs,
 * what Journey already has there, and offers ONE tap to put it there:
 *
 *   OCC       Retired dental hygienist.                    → Occupation
 *             No job title on her record yet.
 *             [Add to Occupation]  [Open Occupation ›]
 *
 * THE TAPS (`intake.ts` decides which is on offer; this card only carries
 * them out, and only for a reader who may change the record):
 *   - Occ, Goals, Med are RECORD fields — the job title, her why, her medical
 *     history — so the tap stages them on the tab's ONE form, like any edit,
 *     and the Save bar saves ("FORD · Occupation", "Goals & Focus · The why",
 *     "Body & Pulse · Watch-outs"). The row then says the line is there and
 *     that nothing is saved until Save. The medical line is ADDED to the
 *     history, never put in place of it.
 *   - Activity is a FORD detail, which saves the moment it is added (FORD's
 *     own save model): a pinned Recreation detail with the words verbatim,
 *     stamped with the studio FORD is read by (`fordStudioIdOf`), the Auth uid
 *     and `origin: "mindbody_intake"`, so the FORD page says the words came
 *     from these notes. The button is disabled while it saves, and a second
 *     tap before the first answers does nothing: one tap, one detail. It is
 *     offered only to a reader the FORD create rule accepts (trains at or
 *     leads her home studio); an administrator who works elsewhere is told
 *     so instead of meeting a refusal.
 *
 * It never decides whether her medical notes are covered by what Body holds;
 * when Body has anything on file the row says to read both side by side.
 * Nothing is copied on its own. Lines it does not recognise are shown as
 * written, with nothing offered. The doors ("Open Occupation") take any
 * reader to where the line belongs.
 */
import { useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronRight, StickyNote } from "lucide-react";
import type { Client } from "../../types";
import type { FordEntry } from "../ford/types";
import { createFordEntry, fordStudioIdOf, type FordAuthor } from "../ford/ford-write";
import type { CodexFordStatus } from "../client-codex/codex-data";
import type { RecordForm } from "../client-codex/useRecordForm";
import { Btn, Card, Chip, EmptyLine, type CodexGo, type Pronouns } from "../client-codex/kit";
import { useToast } from "../../contexts/ToastContext";
import {
  matchIntake,
  nextFieldValue,
  parseIntakeNotes,
  type IntakeAction,
  type IntakeField,
  type IntakeMatch,
  type IntakeTarget,
  type IntakeView,
} from "./intake";

export interface IntakeNotesCardProps {
  client: Client;
  form: Pick<RecordForm, "formData" | "updateField" | "isDirty">;
  /** May change the client record (codexAccess().canEdit): every tap needs it. */
  canEdit: boolean;
  /**
   * The tab's one FORD stream, what it could read for this reader, and
   * whether the FORD create rule would take a detail from them
   * (`codexAccess().fordWritable`).
   */
  ford: { status: CodexFordStatus; entries: readonly FordEntry[]; canAdd: boolean };
  /** Who adds a FORD detail: the Auth uid (the FORD rule pins authorId to it). Null when nobody is signed in. */
  fordAuthor: FordAuthor | null;
  pronouns: Pronouns;
  go: CodexGo;
}

/** The record field each staged target lands in. */
const FIELD_OF: Readonly<Partial<Record<IntakeTarget, IntakeField>>> = {
  occupation: "occupation",
  "her-why": "globalNotes",
  body: "medicalHistory",
};

/** The fields the matcher compares a line with, as the editors hold them. */
const VIEW_KEYS = [
  "occupation",
  "workProfile",
  "isRetired",
  "activityLevel",
  "recreationActivities",
  "clinicalFlags",
  "medicalHistory",
  "clinicalNotes",
  "globalNotes",
] as const;

/** What a staged line's row says until the Save bar saves it. */
function stagedSentence(field: IntakeField, p: Pronouns): string {
  const where =
    field === "occupation"
      ? `Now ${p.possessive} job title.`
      : field === "globalNotes"
        ? `Now ${p.possessive} why.`
        : `Added to ${p.possessive} medical history.`;
  return `${where} Nothing is saved until you tap Save changes on the bar at the bottom.`;
}

export function IntakeNotesCard({ client, form, canEdit, ford, fordAuthor, pronouns: p, go }: IntakeNotesCardProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const { formData, updateField, isDirty } = form;
  const notes = typeof client.mindbodyNotes === "string" ? client.mindbodyNotes.trim() : "";
  const parsed = useMemo(() => parseIntakeNotes(client.mindbodyNotes), [client.mindbodyNotes]);
  const studioId = fordStudioIdOf(client);

  // The record as the editors hold it: a line staged a moment ago already
  // reads as there, and Discard brings its offer back.
  const view = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const key of VIEW_KEYS) {
      const staged = (formData as Record<string, unknown>)[key];
      out[key] = staged !== undefined ? staged : (client as unknown as Record<string, unknown>)[key];
    }
    return out as IntakeView;
  }, [formData, client]);

  const matches = useMemo(
    () => matchIntake(parsed, view, { status: ford.status, entries: ford.entries, studioId, canAdd: ford.canAdd }, p),
    [parsed, view, ford.status, ford.entries, ford.canAdd, studioId, p],
  );

  // FORD adds this visit: saved, even before FORD's snapshot brings them back.
  const [added, setAdded] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // A second tap before the first add answers must not make a second detail;
  // state lands on the next render, a ref at once.
  const busyRef = useRef(false);

  // The FORD create rule, mirrored: trains at or leads her home studio
  // (`ford.canAdd`) — an administrator elsewhere may edit the record but is
  // refused a FORD detail.
  const canWriteFord = canEdit && ford.canAdd && !!fordAuthor?.id && !!client.id && studioId !== "";

  const addToFord = async (m: IntakeMatch, action: Extract<IntakeAction, { kind: "ford" }>) => {
    if (busyRef.current || !canWriteFord || !fordAuthor) return;
    busyRef.current = true;
    setBusy(m.key);
    setFailed(null);
    let id: string | null = null;
    try {
      id = await createFordEntry(client.id, studioId, fordAuthor, {
        pillar: action.pillar,
        body: action.body,
        isPinned: action.isPinned,
        origin: "mindbody_intake",
      });
    } catch (err) {
      console.error("[account] intake line not added to FORD", err);
      id = null;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
    if (id) {
      setAdded((prev) => new Set(prev).add(m.key));
      toastSuccess(`Added to ${m.targetLabel ?? "FORD"}.`);
    } else {
      setFailed(m.key);
      toastError("Couldn't add that line. Check your connection and try again.");
    }
  };

  const stage = (action: Extract<IntakeAction, { kind: "field" }>) => {
    if (!canEdit) return;
    const saved = (formData as Record<string, unknown>)[action.field];
    const current = (saved !== undefined ? saved : client[action.field]) as string | null | undefined;
    // A field that has filled since the offer was drawn is never replaced.
    if (action.mode === "set" && typeof current === "string" && current.trim()) return;
    updateField(action.field, nextFieldValue(current, action));
  };

  const source = notes
    ? `The first 1,000 characters of ${p.possessive} Mindbody account notes, as the last sync brought them. ` +
      "Nothing is copied on its own: a tap puts one line where it belongs, word for word." +
      (parsed.truncated ? " Mindbody may hold more than this, so the last line may be cut off." : "")
    : null;

  return (
    <Card eyebrow="Mindbody account notes" icon={StickyNote} meta="edit in Mindbody" id="account-mindbody-notes" source={source}>
      {matches.length === 0 ? (
        <EmptyLine>{client.mindbodyMasterSyncedAt || notes ? "No account notes in Mindbody." : "Not synced yet."}</EmptyLine>
      ) : (
        <ul className="cadm-intake">
          {matches.map((m) => {
            const door = m.door;
            const field = m.target ? FIELD_OF[m.target] ?? null : null;
            const staged = m.journey === "present" && field !== null && isDirty(field);
            const isAdded = added.has(m.key);
            const action = isAdded ? null : m.action;
            const offer =
              action && canEdit && (action.kind === "field" || (canWriteFord && ford.status === "ready")) ? action : null;
            const sentence = isAdded
              ? `Added to ${m.targetLabel ?? "FORD"}.`
              : staged && field
                ? stagedSentence(field, p)
                : m.sentence;
            return (
              <li key={m.line.index} className="cadm-intake__row" data-kind={m.line.kind}>
                <p className="cadm-intake__line">
                  {m.line.label ? <span className="cadm-intake__label">{m.line.label}</span> : null}
                  <span className="cadm-intake__text">{m.line.text}</span>
                </p>
                {m.targetLabel ? (
                  <Chip tone="new" icon={ArrowRight} className="cadm-intake__to" title={`Belongs in ${m.targetLabel}`}>
                    {m.targetLabel}
                  </Chip>
                ) : null}
                {sentence ? (
                  <p className="cadm-intake__status">
                    {staged ? <Chip tone="live">Unsaved</Chip> : null}
                    <span>{sentence}</span>
                  </p>
                ) : null}
                {failed === m.key && !isAdded ? (
                  <p className="cadm-intake__failed" role="alert">
                    Not added. Check your connection and try again.
                  </p>
                ) : null}
                {offer || door ? (
                  <div className="cadm-intake__acts">
                    {offer ? (
                      <Btn
                        variant="live"
                        disabled={busy !== null}
                        aria-busy={busy === m.key ? true : undefined}
                        onClick={() => (offer.kind === "ford" ? void addToFord(m, offer) : stage(offer))}
                      >
                        {busy === m.key ? "Adding…" : offer.label}
                      </Btn>
                    ) : null}
                    {door ? (
                      <Btn iconEnd={ChevronRight} onClick={() => go(door.page, door.anchor)}>
                        {door.label}
                      </Btn>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
