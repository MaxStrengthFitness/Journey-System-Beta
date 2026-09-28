/**
 * HOME'S MARKS, READ AND WRITTEN — the only place adminHome/{itemKey} is
 * touched (home-marks.ts says what a mark is). Administrators only.
 *
 * Read once with Home's other reads (when the dashboard opens and on Check
 * again): the whole collection, which holds a handful of documents — one per
 * item currently marked, and stale ones are removed. A mark is written whole
 * with setDoc (no merge), signed with the Auth uid and the server's time;
 * Let it go, Bring it back and Undo delete it.
 */
import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { REASON_MAX, toHomeMark, type HomeMark, type HomeMarkState } from "./home-marks";

export async function fetchHomeMarks(): Promise<Record<string, HomeMark>> {
  const snap = await getDocs(collection(db, "adminHome"));
  const out: Record<string, HomeMark> = {};
  for (const d of snap.docs) {
    const mark = toHomeMark(d.id, d.data());
    if (mark) out[d.id] = mark;
  }
  return out;
}

/** Writes a mark and says what was written, for the screen to show at once. */
export async function setHomeMark(
  key: string,
  input: { state: HomeMarkState; until?: string | null; reason?: string | null },
  byName: string,
): Promise<HomeMark> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sign in again: the app can't tell who is marking this.");
  const name = byName.trim().slice(0, 120) || "An administrator";
  const reason = input.reason?.trim().slice(0, REASON_MAX) || null;
  if (input.state === "dismissed" && !reason) throw new Error("Say why it's dismissed.");
  if (input.state === "snoozed" && !input.until) throw new Error("Say until when.");
  const data: Record<string, unknown> = { state: input.state, by: { uid, name }, at: serverTimestamp() };
  if (input.state === "snoozed") data.until = input.until;
  if (input.state === "dismissed") data.reason = reason;
  await setDoc(doc(db, "adminHome", key), data);
  return {
    key,
    state: input.state,
    byUid: uid,
    byName: name,
    until: input.state === "snoozed" ? (input.until ?? null) : null,
    reason: input.state === "dismissed" ? reason : null,
    at: Date.now(),
  };
}

export async function clearHomeMark(key: string): Promise<void> {
  await deleteDoc(doc(db, "adminHome", key));
}
