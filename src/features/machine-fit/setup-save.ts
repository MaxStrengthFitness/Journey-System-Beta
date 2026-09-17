/**
 * MACHINE FIT — the Setup screen's one Save, written.
 *
 * setup-plan.ts decides what to write; this writes it, in three steps whose
 * ORDER is the point:
 *
 *   1. ONE BATCH: every changed clientMachineSettings document and its audit
 *      row in machines/{id}/settingHistory. All or nothing — a Save that half
 *      landed would leave a client set up on some machines and not others
 *      with no way to tell which.
 *   2. The studio's machine-fit index, as a second batch. CAUGHT: the index
 *      is a copy (scripts/rebuild-machine-fit.ts can always rebuild it), and
 *      the rules may refuse it for a trainer covering at a studio that is not
 *      the client's home. The set-up is already saved by then.
 *   3. One journal entry. Caught, like every other equipment journal sync.
 *
 * Same documents, same fields and the same audit rows as the Settings card
 * and the Equipment tab write (equipment/mutations.ts) — a machine set up
 * here is indistinguishable from one set up there.
 */

import { collection, doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { createJournalEntry } from "../../hooks/useClientJournal";
import type { MachineNote } from "../../types";
import type { JournalOrigin } from "../../types/journal";
import { ackFitRow, queueFitRow } from "./fit-store";
import { describeFieldChanges, journalBodyFor, reasonFor, type SetupPlan } from "./setup-plan";

export interface SetupAuthor {
  /** The Auth uid — the journalEntries rule pins authorId to it. */
  id: string;
  fullName: string;
  initials?: string;
}

export interface CommitSetupArgs {
  clientId: string;
  /** The client's HOME studio, for the machine-fit index. */
  homeStudioId: string | null | undefined;
  /** The studio the iPad is in, for the journal entry. */
  activeStudioId: string | null | undefined;
  author: SetupAuthor;
  plan: SetupPlan;
  reason: string;
  /** True in quick-entry mode: values are copied from the FileMaker chart. */
  legacy: boolean;
  /** machineId → the notes already on the document, so a new one is appended rather than replacing them. */
  existingNotes: Record<string, MachineNote[] | undefined>;
  /** machineId → the reviews already on the document (fitAcks), carried onto the rewritten index row. */
  existingAcks?: Record<string, Record<string, { value?: unknown } | undefined> | null | undefined>;
  origin?: JournalOrigin;
}

export interface CommitSetupResult {
  machines: number;
  indexed: boolean;
}

export async function commitSetupSave({
  clientId,
  homeStudioId,
  activeStudioId,
  author,
  plan,
  reason,
  legacy,
  existingNotes,
  existingAcks = {},
  origin = "profile",
}: CommitSetupArgs): Promise<CommitSetupResult> {
  if (plan.entries.length === 0) return { machines: 0, indexed: true };

  const now = new Date();
  const iso = now.toISOString();
  const batch = writeBatch(db);

  for (const entry of plan.entries) {
    const ref = doc(db, "clientMachineSettings", `${clientId}_${entry.machineId}`);
    const data: Record<string, unknown> = {
      clientId,
      machineId: entry.machineId,
      updatedAt: now,
      updatedBy: author.id,
    };
    const fields = ["clientId", "machineId", "updatedAt", "updatedBy"];
    const history = collection(db, "machines", entry.machineId, "settingHistory");

    if (entry.settings) {
      data.settings = entry.settings;
      data.sources = entry.sources ?? {};
      fields.push("settings", "sources");
      batch.set(doc(history), {
        clientId,
        timestamp: iso,
        trainerId: author.id,
        trainerName: author.fullName,
        changeType: entry.isInitialSetup ? "INITIAL_SETUP" : "SETTINGS",
        oldValue: entry.changes.map((c) => `${c.label}: ${c.from || "—"}`).join(", "),
        newValue: entry.changes.map((c) => `${c.label}: ${c.to || "—"}`).join(", "),
        reason: reasonFor(entry, reason, legacy),
      });
    }

    if (entry.weight) {
      data.currentWeight = entry.weight.current;
      fields.push("currentWeight");
      if (entry.weight.stampStart) {
        data.startingWeight = entry.weight.starting;
        data.startingWeightDate = now;
        fields.push("startingWeight", "startingWeightDate");
      }
      batch.set(doc(history), {
        clientId,
        timestamp: iso,
        trainerId: author.id,
        trainerName: author.fullName,
        changeType: "WEIGHT",
        oldValue: `Current: ${entry.weight.from ?? "None"}`,
        newValue: `Current: ${entry.weight.current}`,
        reason: legacy ? "Copied from the FileMaker chart" : "Weight update",
      });
    }

    if (entry.note) {
      const note: MachineNote = {
        id: `${now.getTime()}-${entry.machineId}`,
        content: legacy ? `From the FileMaker chart: ${entry.note}` : entry.note,
        authorId: author.id,
        authorName: author.fullName,
        timestamp: iso,
        isImportant: false,
      };
      data.machineNotes = [...(existingNotes[entry.machineId] ?? []), note];
      fields.push("machineNotes");
    }

    batch.set(ref, data, { mergeFields: fields });
  }

  await batch.commit();

  // 2. The index — a copy, so never the reason a Save fails.
  let indexed = true;
  try {
    const indexBatch = writeBatch(db);
    const after: Array<() => void> = [];
    for (const entry of plan.entries) {
      if (!entry.settings) continue;
      const done = queueFitRow(indexBatch, {
        homeStudioId,
        machineId: entry.machineId,
        clientId,
        settings: entry.settings,
        sources: entry.sources,
        acks: existingAcks[entry.machineId] ?? null,
        at: now.getTime(),
      });
      if (done) after.push(done);
    }
    if (after.length > 0) {
      await indexBatch.commit();
      after.forEach((fn) => fn());
    } else if (plan.settingsChanged > 0) {
      indexed = false; // no home studio on the client: nothing to index against
    }
  } catch (err) {
    indexed = false;
    console.warn("[machine fit] index batch skipped", err);
  }

  // 3. One journal entry for the whole Save.
  const body = journalBodyFor(plan, reason, legacy);
  if (body) {
    try {
      await createJournalEntry(
        clientId,
        activeStudioId || homeStudioId || "",
        { id: author.id, initials: author.initials || "??", fullName: author.fullName },
        {
          kind: "equipment",
          category: null,
          body,
          importance: "standard",
          machineId: null,
          focusId: null,
          sessionId: null,
          origin,
        },
      );
    } catch (err) {
      console.error("[machine fit] journal sync failed", err);
    }
  }

  return { machines: plan.entries.length, indexed };
}

/** A trainer's "this is right for her" — one field on one document, nothing else touched. */
export async function acknowledgeFlag(args: {
  clientId: string;
  /** The client's HOME studio: where her row in the machine-fit index lives. */
  homeStudioId?: string | null;
  machineId: string;
  ackKey: string;
  value: string;
  author: SetupAuthor;
  note?: string;
}): Promise<void> {
  const { clientId, homeStudioId, machineId, ackKey, value, author, note } = args;
  const ack: Record<string, string> = { value, by: author.id, byName: author.fullName, at: new Date().toISOString() };
  if (note?.trim()) ack.note = note.trim();
  await setDoc(
    doc(db, "clientMachineSettings", `${clientId}_${machineId}`),
    { clientId, machineId, fitAcks: { [ackKey]: ack } },
    // `merge`, deliberately: this adds ONE key to the fitAcks map and must
    // leave every other review on the document where it is.
    { merge: true },
  );
  // A copy for the studio-wide check (Operations → Machine fit). Caught inside.
  void ackFitRow({ homeStudioId, machineId, clientId, ackKey, value });
}

export { describeFieldChanges };
