/**
 * Writing a client's machine totals (totals.ts says what and why). Every
 * writer in the app comes through here, so the document is written one way:
 * a `set` with `mergeFields`, which touches exactly the paths given (as
 * `update` would) and creates the document the first time (which `update`
 * cannot). Never a whole client object, never the whole document.
 */
import { deleteField, doc, serverTimestamp, type DocumentReference, type Firestore, type WriteBatch } from "firebase/firestore";
import { MACHINE_TOTALS_FIELDS, machineTotalsPath, mergeWriteOf } from "./totals";

export function machineTotalsRef(db: Firestore, clientId: string): DocumentReference {
  const [c, id, col, docId] = machineTotalsPath(clientId);
  return doc(db, c, id, col, docId);
}

/**
 * Adds the totals half of a dot-path update ("machineStats.<id>.timesPerformed":
 * increment(1), "currentMachineMetrics.<id>": {...}) to a batch, stamped with
 * updatedAt. Nothing is added for an empty update. Returns whether it added one.
 */
export function addMachineTotalsWrite(
  batch: WriteBatch,
  db: Firestore,
  clientId: string,
  dotted: Record<string, unknown>,
): boolean {
  if (!clientId || Object.keys(dotted).length === 0) return false;
  const { data, mergeFields } = mergeWriteOf({ ...dotted, updatedAt: serverTimestamp() });
  batch.set(machineTotalsRef(db, clientId), data, { mergeFields });
  return true;
}

/**
 * A whole-history rebuild (the profile's backfill, the console repair): the
 * given fields REPLACE the totals document's, and the same fields come off the
 * client document in the same batch, so the old and new sides never both hold
 * a count (totals.ts, "Why a sum").
 */
export function addMachineTotalsReplace(
  batch: WriteBatch,
  db: Firestore,
  clientId: string,
  fields: Partial<Record<(typeof MACHINE_TOTALS_FIELDS)[number], unknown>>,
): void {
  const keys = Object.keys(fields).filter((k) => (MACHINE_TOTALS_FIELDS as readonly string[]).includes(k));
  if (!clientId || keys.length === 0) return;
  const top: Record<string, unknown> = {};
  for (const k of keys) top[k] = fields[k as keyof typeof fields];
  addMachineTotalsWrite(batch, db, clientId, top);
  const deletes: Record<string, unknown> = {};
  for (const k of keys) deletes[k] = deleteField();
  batch.update(doc(db, "clients", clientId), deletes);
}
