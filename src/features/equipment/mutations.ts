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

import { collection, deleteField, doc, setDoc, writeBatch, type WriteBatch } from "firebase/firestore";
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
  /**
   * Write only the dials this save changes (`settings.{dial}`,
   * `sources.{dial}`, merged), so a dial it didn't change stays exactly as
   * the DATABASE holds it, whatever `saved` said (the open session round,
   * Oct 9 2026). For a save made while the client's settings may not be the
   * server's yet: Assign (a client the iPad has never opened, offline), and
   * the session's card until the server has answered for the client. The
   * whole-map write below would put the other dials back as `saved` had
   * them, wiping a saved seat. A cleared dial is deleted.
   */
  dialsOnly?: boolean;
  /**
   * With `dialsOnly`: dials written whatever `saved` says (the open session
   * round, Oct 9 2026; the review). A held set-up's dials at Assign: `saved`
   * may be this iPad's stale copy, and a held value that happens to equal it
   * would otherwise be left out, and lost once the session's hold is
   * cleared. Their source is this save's (`changedSources`), else typed.
   */
  writeDials?: readonly string[];
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

/** What one settings save writes, worked out before anything is written. */
interface SettingsPlan {
  args: SaveSettingsArgs;
  result: SaveSettingsResult;
  /** One moment for the whole save: the document's updatedAt, the history row's timestamp and the journal copy's occurredAt. */
  now: Date;
  /** The dials a `dialsOnly` save writes, by name. */
  dials: Record<string, unknown> | null;
  dialSources: Record<string, unknown> | null;
}

/**
 * A SETTINGS SAVE ALWAYS NAMES ITS CLIENT (the open session round, Oct 9
 * 2026; finding 4). The machine card in an open session, before its client
 * was chosen, saved with `clientId: ""`: the ghost record
 * `clientMachineSettings/_{machineId}`, shared by every open session and
 * never reaching anyone. Those settings are held on the session now
 * (features/open-session/held-setup.ts), and a save with no client throws
 * here, before anything is written. Old ghost records may still be in
 * production; nothing reads an empty client, so they are harmless and left
 * alone.
 *
 * Null when there is nothing to write.
 */
function planSettingsSave(args: SaveSettingsArgs): SettingsPlan | null {
  const { clientId, machineId, fields, saved, draft, reason = "", isInitialSetup, changedSources, existingSources, dialsOnly = false } = args;
  if (!(clientId ?? "").trim() || !(machineId ?? "").trim()) {
    throw new Error("A settings save names its client and its machine: nothing was written.");
  }
  const changes = diffSettings(fields, saved, draft);
  const forced = new Set(dialsOnly ? (args.writeDials ?? []) : []);
  if (changes.length === 0 && !fields.some((f) => forced.has(f.key))) return null;

  const summary = describeChanges(changes);
  const actualReason = (reason ?? "").trim() || (isInitialSetup ? "Initial setup" : "Settings update");
  const settings = nextSettings(fields, saved, draft);
  const sources = nextSources(fields, saved, settings, existingSources, changedSources);

  let dials: Record<string, unknown> | null = null;
  let dialSources: Record<string, unknown> | null = null;
  if (dialsOnly) {
    // Only the dials that change, and the ones the caller names, each by
    // name: `merge: true` walks into the maps, so every other dial (and every
    // other source) stays as the database holds it. A cleared dial is
    // deleted outright, never left as a merge that brings it back.
    dials = {};
    dialSources = {};
    for (const f of fields) {
      const before = (saved[f.key] ?? "").toString().trim();
      const after = (draft[f.key] ?? "").toString().trim();
      const moved = before !== after;
      if (!moved && !forced.has(f.key)) continue;
      dials[f.key] = f.key in settings ? settings[f.key] : deleteField();
      // A named dial `saved` already shows: its source is this save's, never the stale copy's.
      const source = moved ? sources[f.key] : changedSources?.[f.key];
      dialSources[f.key] = source && source !== "typed" && f.key in settings ? source : deleteField();
    }
  }
  return {
    args,
    result: { changes, summary, reason: actualReason, settings, sources },
    now: new Date(),
    dials,
    dialSources,
  };
}

/** The settings document and its history row, into `batch`. */
function queuePlan(batch: WriteBatch, plan: SettingsPlan): void {
  const { clientId, machineId, author, isInitialSetup } = plan.args;
  const { changes, reason, settings, sources } = plan.result;
  const settingsRef = doc(db, "clientMachineSettings", `${clientId}_${machineId}`);
  if (plan.dials && plan.dialSources) {
    batch.set(
      settingsRef,
      { clientId, machineId, settings: plan.dials, sources: plan.dialSources, updatedAt: plan.now, updatedBy: author.id },
      { merge: true },
    );
  } else {
    // `mergeFields`, not `merge: true`. A merge walks INTO a map, so a cleared
    // field was never actually removed — it came back on the next load. Naming
    // the fields replaces `settings` and `sources` whole and still leaves the
    // weights, the notes and the fit reviews on the document alone.
    batch.set(
      settingsRef,
      {
        clientId,
        machineId,
        settings,
        sources,
        updatedAt: plan.now,
        updatedBy: author.id,
      },
      { mergeFields: ["clientId", "machineId", "settings", "sources", "updatedAt", "updatedBy"] },
    );
  }
  // A save that changes nothing this iPad can see (a held dial `saved`
  // already shows, written by name all the same) has no change to record.
  if (changes.length === 0) return;
  batch.set(doc(collection(db, "machines", machineId, "settingHistory")), {
    clientId,
    timestamp: plan.now.toISOString(),
    trainerId: author.id,
    trainerName: author.fullName,
    changeType: isInitialSetup ? "INITIAL_SETUP" : "SETTINGS",
    oldValue: changes.map((c) => `${c.label}: ${c.from || "—"}`).join(", "),
    newValue: changes.map((c) => `${c.label}: ${c.to || "—"}`).join(", "),
    reason,
  });
}

/** The journal copy and the studio's machine-fit row: issued, never awaited, never thrown. */
function issueCopies(plan: SettingsPlan): void {
  const { clientId, machineId, author, machineName, journal, fileNote = true, homeStudioId, existingAcks } = plan.args;
  const { changes, summary, reason, settings, sources } = plan.result;
  if (changes.length === 0) return;
  // Box 10: the audit reason a trainer just typed is coaching knowledge, not
  // just compliance. It belongs in the one place anyone looks for this
  // client's history.
  if (fileNote) {
    void fileToJournal(clientId, author, journal, `${machineName} — ${summary}. ${reason}`, machineId, "standard", plan.now);
  }
  // The studio's machine-fit index: who is set to what. The settings above
  // are the record.
  void upsertFitRow({ homeStudioId, machineId, clientId, settings, sources, acks: existingAcks, at: plan.now.getTime() });
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
 *
 * Never with no client (`planSettingsSave`): that throws at the call. NOT
 * ASYNC, on purpose, so the refusal comes back there (every caller issues it
 * inside a try) before anything is written.
 */
export function saveSettings(args: SaveSettingsArgs): Promise<SaveSettingsResult | null> {
  const plan = planSettingsSave(args);
  if (!plan) return Promise.resolve(null);
  const batch = writeBatch(db);
  queuePlan(batch, plan);
  const committed = batch.commit();
  issueCopies(plan);
  return committed.then(() => plan.result);
}

/** A settings save put into a caller's batch (`queueSettingsSave`). */
export interface QueuedSettingsSave {
  result: SaveSettingsResult;
  /**
   * The journal copy and the machine-fit row, for the caller to issue once
   * its batch has COMMITTED, never before: a refused batch then leaves no
   * journal copy and no fit row for settings that never landed, and choosing
   * the client again files no second copy.
   */
  afterCommit: () => void;
}

/**
 * The same save, its settings document and history row put into the
 * CALLER's batch, committing nothing and issuing nothing outside it (the
 * open session round, Oct 9 2026; the review): an open session's Assign
 * moves the settings held on the session to the client in the same write
 * that gives the session its client and clears what it held, so all of it
 * lands or none of it does. Null when there is nothing to write; throws
 * with no client, before anything is put in the batch.
 */
export function queueSettingsSave(batch: WriteBatch, args: SaveSettingsArgs): QueuedSettingsSave | null {
  const plan = planSettingsSave(args);
  if (!plan) return null;
  queuePlan(batch, plan);
  return { result: plan.result, afterCommit: () => issueCopies(plan) };
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
  /* A note about the client needs the client (the open session round, Oct 9
     2026; finding 4). With none (an open session before Who's this?) the
     journal wrote nothing and still answered "saved", and the old list's
     branch below would have written the ghost `clientMachineSettings/_{machineId}`.
     Refused instead, so the card says it couldn't save and keeps the words. */
  if (!(clientId ?? "").trim()) {
    return Promise.reject(new Error("A note about the client needs the client: nothing was written."));
  }

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
