/**
 * OPENING A STUDIO, READ AND WRITTEN — the only place studios/{s}/setupItems
 * and a studio's stage and opening day are written (checklist.ts says what
 * they mean). Administrators only: the rules refuse anyone else, and a
 * studio's leaders may read its checklist.
 *
 *   an item ticked     { block, title, dueOn, doneAt: server time, doneBy }
 *   an item skipped    { block, title, dueOn, doneAt: null, doneBy, skipReason }
 *   an item added      { block, title, dueOn, doneAt: null, doneBy: null }
 *   untick / put back  a template item's document is deleted (back to the
 *                      template); an added item keeps its document, cleared
 *
 * Each item is written whole with setDoc (no merge), so an untick or a put
 * back can never leave an old field behind. `doneBy` is the Auth uid (the
 * rules pin it) and the name as the app knew it. After a write lands, one
 * line goes into the Activity record (kind `studio-stage`).
 *
 * Reads: the checklist's documents (one small subcollection) and the
 * studio's floor (its roster, to count the machines on it) — one read of
 * each, when a page opens and on Check again; never a listener.
 */
import { collection, deleteDoc, deleteField, doc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { logActivity } from "../activity/log-activity";
import {
  checklistLine,
  isTemplateItem,
  openingRecord,
  type ChecklistItem,
  type LaunchStage,
  type SetupBlock,
  type SetupItemDoc,
} from "./checklist";

export const setupItemsRef = (studioId: string) => collection(db, "studios", studioId, "setupItems");

/** Every stored item document, by id. Throws when the read fails; the caller says "couldn't check". */
export async function fetchSetupItems(studioId: string): Promise<Record<string, SetupItemDoc>> {
  const snap = await getDocs(setupItemsRef(studioId));
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data() as SetupItemDoc]));
}

/** How many machines are on the studio's floor: its roster, less what was switched off. */
export async function fetchFloorCount(studioId: string): Promise<number> {
  const snap = await getDocs(collection(db, "studios", studioId, "roster"));
  return snap.docs.filter((d) => (d.data() as { status?: string }).status !== "inactive").length;
}

function signer(byName: string): { uid: string; name: string } {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again to change the checklist: the app can't tell who is changing it.");
  return { uid, name: byName.trim().slice(0, 120) || "An administrator" };
}

const itemRef = (studioId: string, itemId: string) => doc(db, "studios", studioId, "setupItems", itemId);

interface Who {
  studioId: string;
  studioName: string;
  byName: string;
}

function record(who: Who, what: string, after?: Record<string, string | null>) {
  void logActivity({ kind: "studio-stage", studioId: who.studioId, what, after: after ?? null, byName: who.byName });
}

export async function tickItem(who: Who, item: ChecklistItem): Promise<void> {
  await setDoc(itemRef(who.studioId, item.id), {
    block: item.block,
    title: item.title,
    dueOn: item.dueOn ?? null,
    doneAt: serverTimestamp(),
    doneBy: signer(who.byName),
  });
  record(who, checklistLine("tick", who.studioName, item));
}

export async function untickItem(who: Who, item: ChecklistItem): Promise<void> {
  if (isTemplateItem(item.id)) await deleteDoc(itemRef(who.studioId, item.id));
  else await setDoc(itemRef(who.studioId, item.id), { block: item.block, title: item.title, dueOn: item.dueOn ?? null, doneAt: null, doneBy: null });
  record(who, checklistLine("untick", who.studioName, item));
}

export async function skipItem(who: Who, item: ChecklistItem, reason: string): Promise<void> {
  const why = reason.trim().slice(0, 200);
  if (!why) throw new Error("Say why it's skipped: the reason is kept with it.");
  await setDoc(itemRef(who.studioId, item.id), {
    block: item.block,
    title: item.title,
    dueOn: item.dueOn ?? null,
    doneAt: null,
    doneBy: signer(who.byName),
    skipReason: why,
  });
  record(who, checklistLine("skip", who.studioName, item, why), { Reason: why });
}

export async function unskipItem(who: Who, item: ChecklistItem): Promise<void> {
  if (isTemplateItem(item.id)) await deleteDoc(itemRef(who.studioId, item.id));
  else await setDoc(itemRef(who.studioId, item.id), { block: item.block, title: item.title, dueOn: item.dueOn ?? null, doneAt: null, doneBy: null });
  record(who, checklistLine("unskip", who.studioName, item));
}

/** A new id for an item an administrator adds: never one of the template's. */
export function customItemId(now: number = Date.now(), rand: number = Math.random()): string {
  return `custom-${now.toString(36)}${Math.floor(rand * 1296).toString(36).padStart(2, "0")}`;
}

export async function addCustomItem(who: Who, input: { block: SetupBlock; title: string; dueOn: string | null }): Promise<string> {
  const title = input.title.trim().slice(0, 160);
  if (!title) throw new Error("Name the item.");
  const id = customItemId();
  await setDoc(itemRef(who.studioId, id), { block: input.block, title, dueOn: input.dueOn || null, doneAt: null, doneBy: null });
  record(who, checklistLine("add", who.studioName, { title, block: input.block, dueOn: input.dueOn }));
  return id;
}

export async function removeCustomItem(who: Who, item: ChecklistItem): Promise<void> {
  await deleteDoc(itemRef(who.studioId, item.id));
  record(who, checklistLine("remove", who.studioName, item));
}

/**
 * A studio's stage and opening day: only what changed, a cleared one
 * removed. The studio rule already lets an administrator write them.
 */
export async function saveOpening(
  who: Who,
  was: { stage: LaunchStage | null; openingDay: string | null },
  now: { stage: LaunchStage | null; openingDay: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (was.stage !== now.stage) patch.stage = now.stage ?? deleteField();
  if (was.openingDay !== now.openingDay) patch.openingDay = now.openingDay ?? deleteField();
  if (Object.keys(patch).length === 0) return;
  await updateDoc(doc(db, "studios", who.studioId), patch);
  const entry = openingRecord(who.studioName, was, now);
  if (entry) void logActivity({ kind: "studio-stage", studioId: who.studioId, ...entry, byName: who.byName });
}
