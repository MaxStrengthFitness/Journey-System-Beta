/**
 * Starting routines and a studio's choice, read and written: the Firestore
 * half (AJ, Oct 8 2026, "1a": "The Firestore addition is OK"). The pure half,
 * what each document means, is `starting-read.ts`.
 *
 * - `routinePresets/{id}` with a `start` part: a starting routine. Head
 *   office's are company tier (administrators write them, firestore.rules'
 *   routinePresets block, unchanged); a studio's own are studio tier (its
 *   leaders). The Academy's eleven are seeded once by
 *   `scripts/seed-starting-routines.ts`.
 * - `studios/{s}/config/startingRoutines`: the studio's choice, `{ use,
 *   defaultId, updatedAt, updatedBy }`. Its leaders write it, everyone who
 *   works there reads it (firestore.rules, `startingChoiceValid`).
 *
 * THE READS (Enterprise edition: every query has its index,
 * firestore.indexes.json). Two queries on `routinePresets`, both on `tier`
 * and `scope`, served by the one composite (tier, scope):
 * - head office's: `tier == "company"` and `scope == "global"`;
 * - the studio's own: `tier == "studio"` and `scope == studioId`.
 * `scope` rather than `studioId` because every preset carries a scope (a
 * company one has no `studioId`, on purpose: the admin editor leaves it out),
 * and an index holds only the documents that have every field it names, so a
 * (tier, studioId) index would hold none of head office's. A studio preset's
 * scope is its studio (`normalizeRoutinePreset`'s rule; the editor writes
 * both). Nothing filters on `start` in the query: the company tier is a few
 * dozen documents, and `startingRoutineFromPreset` decides what is one.
 *
 * One read of each when Start a plan, the briefing's plan card or the
 * studio's choice opens (the design round, §5: "No new Mindbody call. One
 * read of head office's starting routines and one of the studio's choice");
 * no listener.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Firestore,
  type QuerySnapshot,
} from "firebase/firestore";
import {
  NO_CHOICE,
  STARTING_CHOICE_DOC,
  seededFrom,
  startingChoiceFromDoc,
  startingChoiceToWrite,
  startingRoutinesFromPresets,
  type StartingRoutinesAnswer,
  type StoredPresetDoc,
} from "./starting-read";
import type { StartingRoutineChoice } from "./starting-routines";

function docsOf(snap: QuerySnapshot | null): StoredPresetDoc[] {
  return snap ? snap.docs.map((d) => ({ ...(d.data() as Omit<StoredPresetDoc, "id">), id: d.id })) : [];
}

/**
 * Head office's starting routines, and the studio's own when a studio is
 * named. A failed read throws (unknown, never empty: the caller catches);
 * an answer that is empty and came only from this iPad's cache is `known:
 * false`, because a cache that never held them says nothing about whether
 * there are any.
 */
export async function readStartingRoutines(db: Firestore, studioId?: string | null): Promise<StartingRoutinesAnswer> {
  const [company, studio] = await Promise.all([
    getDocs(query(collection(db, "routinePresets"), where("tier", "==", "company"), where("scope", "==", "global"))),
    studioId
      ? getDocs(query(collection(db, "routinePresets"), where("tier", "==", "studio"), where("scope", "==", studioId)))
      : Promise.resolve(null),
  ]);
  const companyDocs = docsOf(company);
  const routines = startingRoutinesFromPresets(companyDocs, docsOf(studio), studioId);
  const fromCacheOnly = company.metadata.fromCache && (studio === null || studio.metadata.fromCache);
  const empty = company.empty && (studio === null || studio.empty);
  return { routines, known: !(fromCacheOnly && empty), seeded: seededFrom(companyDocs) };
}

const choiceRef = (db: Firestore, studioId: string) => doc(db, "studios", studioId, "config", STARTING_CHOICE_DOC);

/**
 * The studio's choice. No document is "hasn't chosen" (`use: null`, all of
 * head office's, no studio default); a failed read throws, and the caller
 * keeps it unknown, never "hasn't chosen". So does a "no document" only
 * this iPad's cache gave (offline): the iPad may have cached it missing
 * before a leader saved the studio's choice, and reading that as "hasn't
 * chosen" would suggest a routine the studio left out and skip its default
 * without a word (the whole-branch review, Oct 9 2026).
 */
export async function readStartingChoice(db: Firestore, studioId: string): Promise<StartingRoutineChoice> {
  const snap = await getDoc(choiceRef(db, studioId));
  const fromCache = snap.metadata?.fromCache === true;
  if (snap.exists()) return startingChoiceFromDoc(snap.data());
  if (fromCache) throw new Error("The studio's starting-routine choice was answered only from this iPad's cache.");
  return { ...NO_CHOICE };
}

/**
 * A studio's leaders save its choice: the whole document, signed with the
 * signed-in person's Auth uid (the rules pin it) and the server's time. A
 * leader's save on My Studio → Studio, awaited by its own Save button, never
 * by a tap on the floor.
 */
export async function saveStartingChoice(
  db: Firestore,
  studioId: string,
  choice: StartingRoutineChoice,
  uid: string,
): Promise<void> {
  if (!uid) throw new Error("Sign in again to save: the app can't tell who is changing this.");
  // Throws in words a leader can act on before anything is sent (too many ticked).
  const clean = startingChoiceToWrite(choice);
  await setDoc(choiceRef(db, studioId), {
    use: clean.use,
    defaultId: clean.defaultId,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}
