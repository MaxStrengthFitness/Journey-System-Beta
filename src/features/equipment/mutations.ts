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
 */

import { addDoc, collection, doc, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { createJournalEntry } from "../../hooks/useClientJournal";
import type { JournalOrigin } from "../../types/journal";
import type { MachineNote } from "../../types";
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
}

/**
 * File an equipment change into the client's Journal.
 *
 * Never throws into the caller: a journal entry is a record OF the change, not
 * part of it. If the Journal write fails the setting is still saved and the
 * audit trail still has it, and the trainer should not be told their setup
 * did not stick when it did.
 */
async function fileToJournal(
  clientId: string,
  author: MutationAuthor,
  ctx: JournalContext | undefined,
  body: string,
  machineId: string,
  importance: "standard" | "elevated" | "critical",
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
        origin: ctx.origin,
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

/** Drop empty values so a cleared field disappears rather than saving "". */
function cleanSettings(
  fields: SettingFieldSpec[],
  draft: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = (draft[f.key] ?? "").toString().trim();
    if (v) out[f.key] = v;
  }
  return out;
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
  reason: string;
  author: MutationAuthor;
  /** First time this machine has ever been set up for this client. */
  isInitialSetup: boolean;
  /** Machine name, for a journal entry that reads on its own. */
  machineName: string;
  journal?: JournalContext;
}

export interface SaveSettingsResult {
  changes: SettingsChange[];
  summary: string;
  reason: string;
}

/**
 * Save machine settings.
 *
 * Returns the change list so the caller can hand the same sentence to the
 * journal without recomputing it — and so a no-op save can be detected without
 * a second diff.
 */
export async function saveSettings({
  clientId,
  machineId,
  fields,
  saved,
  draft,
  reason,
  author,
  isInitialSetup,
  machineName,
  journal,
}: SaveSettingsArgs): Promise<SaveSettingsResult | null> {
  const changes = diffSettings(fields, saved, draft);
  if (changes.length === 0) return null;

  const summary = describeChanges(changes);
  const actualReason = reason.trim() || (isInitialSetup ? "Initial setup" : "Settings update");

  await setDoc(
    doc(db, "clientMachineSettings", `${clientId}_${machineId}`),
    {
      clientId,
      machineId,
      settings: cleanSettings(fields, draft),
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
    changeType: isInitialSetup ? "INITIAL_SETUP" : "SETTINGS",
    oldValue: changes.map((c) => `${c.label}: ${c.from || "—"}`).join(", "),
    newValue: changes.map((c) => `${c.label}: ${c.to || "—"}`).join(", "),
    reason: actualReason,
  });

  // Box 10: the audit reason a trainer just typed is coaching knowledge, not
  // just compliance. It belongs in the one place anyone looks for this
  // client's history.
  await fileToJournal(
    clientId,
    author,
    journal,
    `${machineName} — ${summary}. ${actualReason}`,
    machineId,
    "standard",
  );

  return { changes, summary, reason: actualReason };
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

export interface AddNoteArgs {
  clientId: string;
  machineId: string;
  machineName: string;
  existingNotes: MachineNote[];
  content: string;
  isMaintenance: boolean;
  author: MutationAuthor;
  journal?: JournalContext;
}

/**
 * Add a machine-specific note (box 11).
 *
 * Written twice, on purpose:
 *   clientMachineSettings.machineNotes   the machine-scoped list the Equipment
 *                                        tab, the Entry HUD and the Journey
 *                                        Grid's alert icon all already read
 *   journalEntries                       the client-scoped timeline
 *
 * A maintenance flag files as `critical`, which is what puts it in the
 * PRE-SESSION BRIEFING — so "seat sticks on the compound row" reaches the next
 * trainer before they walk the client up to it, rather than after.
 */
export async function addMachineNote({
  clientId,
  machineId,
  machineName,
  existingNotes,
  content,
  isMaintenance,
  author,
  journal,
}: AddNoteArgs): Promise<MachineNote | null> {
  const body = content.trim();
  if (!body) return null;

  const note: MachineNote = {
    id: Date.now().toString(),
    content: body,
    authorId: author.id,
    authorName: author.fullName,
    timestamp: new Date().toISOString(),
    isImportant: isMaintenance,
  };

  await setDoc(
    doc(db, "clientMachineSettings", `${clientId}_${machineId}`),
    {
      clientId,
      machineId,
      machineNotes: [...existingNotes, note],
      updatedAt: new Date(),
      updatedBy: author.id,
    },
    { merge: true },
  );

  await fileToJournal(
    clientId,
    author,
    journal,
    isMaintenance ? `${machineName} — maintenance: ${body}` : `${machineName} — ${body}`,
    machineId,
    isMaintenance ? "critical" : "standard",
  );

  return note;
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
