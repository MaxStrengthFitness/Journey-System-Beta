/**
 * EQUIPMENT TAB — every write this feature makes, in one file.
 *
 * Round: Equipment Dual-Pane, Sep 2026.
 *
 * The old tab spread four near-identical setDoc/addDoc pairs across four
 * dialogs inside one 1,500-line component. They drifted: one wrote a reason,
 * one hard-coded "Weight Update", one forgot the audit log entirely. Putting
 * them here means the audit trail (and, from phase 5, the journal sync) cannot
 * be forgotten by a future call site — there is only one call site.
 *
 * Two documents are touched on every settings change:
 *   clientMachineSettings/{clientId}_{machineId}   the value trainers read
 *   machines/{machineId}/settingHistory/{auto}     the audit trail
 *
 * THE FLOOR NEVER WAITS ON THE SERVER (machine menu, Oct 4 2026). A write is
 * on the iPad the moment it is made; its promise waits for the database's
 * answer, which offline never comes. `saveSettings` used to await its three
 * writes one after another, so offline the history row and the journal copy
 * were never even started, and a reload dropped them. Now every write a save
 * makes is ISSUED before anything is awaited — the settings and their history
 * row as one batch, the journal copy and the machine-fit row beside it — so
 * the iPad's own copy of the database holds all of them through a reload or
 * a new version. `addMachineNote` likewise issues its write and hands the
 * caller the database's answer to wait on, briefly, through session-record's
 * `settleOrQueue` (KNOWN-TRAPS, "Never await the database's answer on the
 * floor").
 */

import { addDoc, collection, doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { createJournalEntry } from "../../hooks/useClientJournal";
import type { JournalEntry, JournalImportance, JournalKind, JournalOrigin, NoteBodyMark } from "../../types/journal";
import type { MachineNote } from "../../types";
import { upsertFitRow } from "../machine-fit/fit-store";
import { nextSettings, nextSources } from "../machine-fit/settings-write";
import type { SettingSource } from "../machine-fit/types";
import type { SettingFieldSpec } from "./types";

export interface MutationAuthor {
  id: string;
  fullName: string;
  initials?: string;
}

/**
 * Context every write needs to reach the Journal.
 *
 * `origin` is what lets the Journal say where a note was written without the
 * trainer having to: "profile" from the Equipment tab, "in_session" from the
 * setup prompt during a live session.
 */
export interface JournalContext {
  studioId: string;
  origin: JournalOrigin;
  sessionId?: string | null;
  /** With `sessionId`: the session's number and day (client-notes/session-link.ts). */
  sessionNumber?: number | null;
  sessionDay?: string | null;
}

/**
 * File an equipment change into the client's Journal.
 *
 * Never throws into the caller: a journal entry is a record OF the change, not
 * part of it. If the Journal write fails the setting is still saved and the
 * audit trail still has it, and the trainer should not be told their setup
 * did not stick when it did.
 *
 * The write itself is issued the moment this is called (nothing is awaited
 * before it), so a caller that does not await it still has it on the iPad.
 * `occurredAt` is the save's own moment: the settings copy is recognised by
 * it sitting beside its history row (machine-menu/settings-copy.ts).
 */
async function fileToJournal(
  clientId: string,
  author: MutationAuthor,
  ctx: JournalContext | undefined,
  body: string,
  machineId: string,
  importance: JournalImportance,
  occurredAt?: Date,
): Promise<void> {
  if (!ctx || !body.trim()) return;
  try {
    await createJournalEntry(
      clientId,
      ctx.studioId,
      { id: author.id, initials: author.initials || "??", fullName: author.fullName },
      {
        kind: "equipment",
        category: null,
        body: body.trim(),
        importance,
        machineId,
        focusId: null,
        sessionId: ctx.sessionId ?? null,
        sessionNumber: ctx.sessionNumber ?? null,
        sessionDay: ctx.sessionDay ?? null,
        origin: ctx.origin,
        ...(occurredAt ? { occurredAt } : {}),
      },
    );
  } catch (err) {
    console.error("[equipment] journal sync failed", err);
  }
}

export interface SettingsChange {
  label: string;
  from: string;
  to: string;
}

/** Human sentence for the audit log and (phase 5) the journal. */
export function describeChanges(changes: SettingsChange[]): string {
  return changes
    .map((c) => `${c.label} ${c.from || "—"} → ${c.to || "—"}`)
    .join(", ");
}

/**
 * What actually differs between the saved settings and the draft.
 *
 * A field left showing its ghost placeholder reads as "" and is NOT a change —
 * that is the whole point of ghosting. Trailing whitespace is not a change
 * either; trainers type on a tablet.
 */
export function diffSettings(
  fields: SettingFieldSpec[],
  saved: Record<string, string>,
  draft: Record<string, string>,
): SettingsChange[] {
  const changes: SettingsChange[] = [];
  for (const f of fields) {
    const before = (saved[f.key] ?? "").toString().trim();
    const after = (draft[f.key] ?? "").toString().trim();
    if (before !== after) changes.push({ label: f.label, from: before, to: after });
  }
  return changes;
}

async function writeHistory(
  machineId: string,
  entry: Record<string, unknown>,
): Promise<void> {
  await addDoc(collection(db, "machines", machineId, "settingHistory"), entry);
}

export interface SaveSettingsArgs {
  clientId: string;
  machineId: string;
  fields: SettingFieldSpec[];
  saved: Record<string, string>;
  draft: Record<string, string>;
  /**
   * Why, when the trainer said. Asked, never required (machine menu, Oct 4
   * 2026: "never block a save"): left empty, the history row and the journal
   * copy say "Initial setup" or "Settings update".
   */
  reason?: string;
  author: MutationAuthor;
  /** First time this machine has ever been set up for this client. */
  isInitialSetup: boolean;
  /** Machine name, for a journal entry that reads on its own. */
  machineName: string;
  journal?: JournalContext;
  /**
   * File the journal copy (default true). The menu's Undo passes false: the
   * copy of the save it undoes stands, and its history row ("Undone") is the
   * record, so there is no second copy (machine-menu/setting-draft.ts
   * `undoPayload`).
   */
  fileNote?: boolean;
  /**
   * Machine fit (Sep 2026). `changedSources` says where each CHANGED value
   * came from ("suggested" when the trainer tapped Use and left it alone);
   * `existingSources` is what the document already holds. `homeStudioId` is
   * the client's home studio: with it, the studio's machine-fit index gets
   * this client's row — caught, so it can never fail the save.
   */
  changedSources?: Record<string, SettingSource | undefined>;
  existingSources?: Record<string, SettingSource> | null;
  homeStudioId?: string | null;
  /** The "right for this client" reviews already on the document, carried onto the rewritten index row. */
  existingAcks?: Record<string, { value?: unknown } | undefined> | null;
}

export interface SaveSettingsResult {
  changes: SettingsChange[];
  summary: string;
  reason: string;
  /**
   * The settings map as written, whole — what Undo puts its dials back from
   * (machine-menu/setting-draft.ts `undoPayload`'s `after`). A caller whose
   * save was only queued can build the same map with `nextSettings`
   * (machine-fit/settings-write.ts), which is what this is.
   */
  settings: Record<string, string>;
  /** The sources map as written, whole. */
  sources: Record<string, SettingSource>;
}

/**
 * Save machine settings.
 *
 * Every write is ISSUED before anything is awaited, in this order, all in
 * the call's own tick:
 *
 *   1. ONE BATCH: the settings document and its settingHistory row, the
 *      history ref made up front (as machine-fit/setup-save.ts does). All or
 *      nothing: a change with no audit row, or an audit row for a change
 *      that never landed, can't happen.
 *   2. The journal copy, NOT in the batch: a refused journal write must never
 *      fail a settings save (`fileToJournal`'s rule, and setup-save's). Its
 *      `occurredAt` is the very moment the history row's `timestamp` holds.
 *      Caught.
 *   3. The studio's machine-fit row, a copy the rebuild script can always
 *      remake, so it is never the reason a save fails. Caught.
 *
 * The returned promise is the batch's answer: it resolves (with the change
 * list, so a no-op save is told apart without a second diff) once the
 * database has the settings and their row, and rejects if it refuses them.
 * On the floor the caller waits on it only through `settleOrQueue`
 * (session-record/finish-wait.ts): offline it is already saved on the iPad.
 */
export async function saveSettings({
  clientId,
  machineId,
  fields,
  saved,
  draft,
  reason = "",
  author,
  isInitialSetup,
  machineName,
  journal,
  fileNote = true,
  changedSources,
  existingSources,
  homeStudioId,
  existingAcks,
}: SaveSettingsArgs): Promise<SaveSettingsResult | null> {
  const changes = diffSettings(fields, saved, draft);
  if (changes.length === 0) return null;

  const summary = describeChanges(changes);
  const actualReason = (reason ?? "").trim() || (isInitialSetup ? "Initial setup" : "Settings update");

  const settings = nextSettings(fields, saved, draft);
  const sources = nextSources(fields, saved, settings, existingSources, changedSources);

  // One moment for the whole save: the document's updatedAt, the history
  // row's timestamp and the journal copy's occurredAt are the same instant.
  const now = new Date();

  const batch = writeBatch(db);
  // `mergeFields`, not `merge: true`. A merge walks INTO a map, so a cleared
  // field was never actually removed — it came back on the next load. Naming
  // the fields replaces `settings` and `sources` whole and still leaves the
  // weights, the notes and the fit reviews on the document alone.
  batch.set(
    doc(db, "clientMachineSettings", `${clientId}_${machineId}`),
    {
      clientId,
      machineId,
      settings,
      sources,
      updatedAt: now,
      updatedBy: author.id,
    },
    { mergeFields: ["clientId", "machineId", "settings", "sources", "updatedAt", "updatedBy"] },
  );
  batch.set(doc(collection(db, "machines", machineId, "settingHistory")), {
    clientId,
    timestamp: now.toISOString(),
    trainerId: author.id,
    trainerName: author.fullName,
    changeType: isInitialSetup ? "INITIAL_SETUP" : "SETTINGS",
    oldValue: changes.map((c) => `${c.label}: ${c.from || "—"}`).join(", "),
    newValue: changes.map((c) => `${c.label}: ${c.to || "—"}`).join(", "),
    reason: actualReason,
  });
  const committed = batch.commit();

  // Box 10: the audit reason a trainer just typed is coaching knowledge, not
  // just compliance. It belongs in the one place anyone looks for this
  // client's history. Issued now, never awaited into the result.
  if (fileNote) {
    void fileToJournal(
      clientId,
      author,
      journal,
      `${machineName} — ${summary}. ${actualReason}`,
      machineId,
      "standard",
      now,
    );
  }

  // The studio's machine-fit index: who is set to what. Never awaited into
  // the result and never thrown — the settings above are the record.
  void upsertFitRow({ homeStudioId, machineId, clientId, settings, sources, acks: existingAcks, at: now.getTime() });

  await committed;
  return { changes, summary, reason: actualReason, settings, sources };
}

/* ------------------------------------------------------------------ *
 * Weights
 * ------------------------------------------------------------------ */

export interface SaveWeightsArgs {
  clientId: string;
  machineId: string;
  machineName: string;
  savedStarting: number | null;
  savedCurrent: number | null;
  draftStarting: string;
  draftCurrent: string;
  author: MutationAuthor;
}

export interface SaveWeightsResult {
  starting: number | null;
  current: number | null;
  summary: string;
}

const toWeight = (v: string): number | null => {
  const t = (v ?? "").toString().trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Save prescribed weights.
 *
 * No journal entry — see README section 3.4. Weights move most sessions, and
 * journaling every one would bury coaching notes under progression noise that
 * the Journey Grid already tells better. The audit trail stays in
 * settingHistory.
 */
export async function saveWeights({
  clientId,
  machineId,
  machineName,
  savedStarting,
  savedCurrent,
  draftStarting,
  draftCurrent,
  author,
}: SaveWeightsArgs): Promise<SaveWeightsResult | null> {
  const starting = toWeight(draftStarting);
  const current = toWeight(draftCurrent);

  if (starting === savedStarting && current === savedCurrent) return null;

  await setDoc(
    doc(db, "clientMachineSettings", `${clientId}_${machineId}`),
    {
      clientId,
      machineId,
      startingWeight: starting,
      currentWeight: current,
      // First time a starting weight is recorded, stamp when — the Journey
      // Grid reads this to anchor a client's baseline.
      ...(savedStarting === null && starting !== null ? { startingWeightDate: new Date() } : {}),
      updatedAt: new Date(),
      updatedBy: author.id,
    },
    { merge: true },
  );

  await writeHistory(machineId, {
    clientId,
    timestamp: new Date().toISOString(),
    trainerId: author.id,
    trainerName: author.fullName,
    changeType: "WEIGHT",
    oldValue: `Start: ${savedStarting ?? "None"}, Current: ${savedCurrent ?? "None"}`,
    newValue: `Start: ${starting ?? "None"}, Current: ${current ?? "None"}`,
    reason: "Weight update",
  });

  const summary =
    savedCurrent !== null && current !== null && savedCurrent !== current
      ? `${machineName} ${savedCurrent} → ${current} lbs`
      : `${machineName} weights updated`;

  return { starting, current, summary };
}

/* ------------------------------------------------------------------ *
 * Machine notes
 * ------------------------------------------------------------------ */

/**
 * Where a machine note is filed: the notes catalog's one answer,
 * `storedNoteOf` (client-notes/note-catalog.ts) — the kind, the category and
 * the parts of the body (Health and Incident only).
 */
export interface MachineNoteFiling {
  kind: JournalKind;
  category: JournalEntry["category"];
  bodyParts?: NoteBodyMark[] | null;
}

export interface AddNoteArgs {
  clientId: string;
  machineId: string;
  machineName: string;
  existingNotes: MachineNote[];
  content: string;
  /**
   * The filing (`storedNoteOf`'s answer). Left out, the note files as it
   * always did: Coaching & equipment · Set-up (`kind: "equipment"`).
   */
  filing?: MachineNoteFiling | null;
  /**
   * How loud, from the one Loudness control. Left out, the old checkbox
   * answers: Critical when `isMaintenance`, else Note.
   */
  importance?: JournalImportance | null;
  /**
   * The old "flag as important (maintenance or safety)" checkbox, read only
   * when no `importance` is given (the machine sheet's notes, until the
   * machine menu retires them).
   */
  isMaintenance?: boolean;
  author: MutationAuthor;
  journal?: JournalContext;
}

/**
 * Add a machine-specific note (box 11).
 *
 * ONE LIST (the Atlas answers, Oct 2 2026): the note lives in her journal
 * only, carrying `machineId`, and every reader takes `machineNotesFor`
 * (machine-notes.ts), which reads the journal plus the old `machineNotes`
 * list for data written before. Only a host that gives no journal context
 * (no studio to file it under) still writes the old list.
 *
 * Filed by what it is for (machine menu, Oct 4 2026): the caller passes the
 * filing and the loudness the note box chose, and the parts of the body for
 * Health or Incident. A Critical note is what puts it in the PRE-SESSION
 * BRIEFING and on the Hub card, so "hip pain if the pace is too fast"
 * reaches the next trainer before they walk the client up to the machine.
 *
 * NOT ASYNC, on purpose. The write is issued the moment this is called and
 * the promise handed back is the database's answer: the note (its id the
 * journal entry's) once the database has it, a rejection if it refuses it.
 * Offline that answer never comes, so on the floor a caller waits on it only
 * through `settleOrQueue` (session-record/finish-wait.ts) and keeps the words
 * only when it says "failed". The note is in the client's journal stream at
 * once either way: the stream shows the iPad's own write.
 */
export function addMachineNote({
  clientId,
  machineId,
  machineName,
  existingNotes,
  content,
  filing = null,
  importance = null,
  isMaintenance = false,
  author,
  journal,
}: AddNoteArgs): Promise<MachineNote | null> {
  const body = (content ?? "").trim();
  if (!body) return Promise.resolve(null);

  // The loudness the note box chose; without one, the old checkbox's answer.
  // Only the old checkbox still writes "maintenance:" into the words.
  const loudness: JournalImportance = importance ?? (isMaintenance ? "critical" : "standard");
  const maintenance = !importance && isMaintenance;

  const note: MachineNote = {
    id: Date.now().toString(),
    content: body,
    authorId: author.id,
    authorName: author.fullName,
    timestamp: new Date().toISOString(),
    isImportant: loudness !== "standard",
  };

  if (journal) {
    const sent = createJournalEntry(
      clientId,
      journal.studioId,
      { id: author.id, initials: author.initials || "??", fullName: author.fullName },
      {
        kind: filing?.kind ?? "equipment",
        category: filing ? filing.category : null,
        bodyParts: filing?.bodyParts ?? null,
        body: maintenance ? `${machineName} — maintenance: ${body}` : `${machineName} — ${body}`,
        importance: loudness,
        machineId,
        focusId: null,
        sessionId: journal.sessionId ?? null,
        sessionNumber: journal.sessionNumber ?? null,
        sessionDay: journal.sessionDay ?? null,
        origin: journal.origin,
      },
    );
    return sent.then((id) => ({ ...note, id: id ? `journal:${id}` : note.id }));
  }

  return setDoc(
    doc(db, "clientMachineSettings", `${clientId}_${machineId}`),
    {
      clientId,
      machineId,
      machineNotes: [...existingNotes, note],
      updatedAt: new Date(),
      updatedBy: author.id,
    },
    { merge: true },
  ).then(() => note);
}

export interface DeleteNoteArgs {
  clientId: string;
  machineId: string;
  existingNotes: MachineNote[];
  noteId: string;
  author: MutationAuthor;
}

/**
 * Remove a machine note.
 *
 * Deliberately does NOT delete the matching journal entry. The Journal is a
 * timeline: "the seat was sticking in September" stays true even after the
 * seat is fixed and the reminder is cleared off the machine. Archive it from
 * the Journal if it should go.
 */
export async function deleteMachineNote({
  clientId,
  machineId,
  existingNotes,
  noteId,
  author,
}: DeleteNoteArgs): Promise<void> {
  await setDoc(
    doc(db, "clientMachineSettings", `${clientId}_${machineId}`),
    {
      machineNotes: existingNotes.filter((n) => n.id !== noteId),
      updatedAt: new Date(),
      updatedBy: author.id,
    },
    { merge: true },
  );
}
