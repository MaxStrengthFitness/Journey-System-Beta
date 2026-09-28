/**
 * WHO IS EDITING — the Auth uid and a name, for a record that says who did
 * something (a removed safety line's record, a catalog machine's change log).
 *
 * The uid is the Auth uid, never `trainer.id`: the rules pin records to it,
 * and the two differ on older accounts. The name is the trainer document's
 * `fullName`, read once per person, falling back to the sign-in's display
 * name — a record names someone, never an email address.
 */

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";

export interface Person {
  uid: string;
  name: string;
}

/** Keyed by the signed-in uid, so a sign-out needs no reset (docs/KNOWN-TRAPS.md). */
const names = new Map<string, Promise<string>>();

function fallbackName(): string {
  return auth.currentUser?.displayName?.trim() || "A studio leader";
}

/** The person signed in right now, with their name as the trainer record has it. */
export async function signedInPerson(): Promise<Person | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;
  let hit = names.get(uid);
  if (!hit) {
    hit = getDoc(doc(db, "trainers", uid))
      .then((snap) => {
        const full = snap.exists() ? (snap.data() as { fullName?: unknown }).fullName : undefined;
        return typeof full === "string" && full.trim() ? full.trim() : fallbackName();
      })
      .catch(() => fallbackName());
    names.set(uid, hit);
  }
  return { uid, name: await hit };
}

/** The same, as a hook. Undefined until known, or when nobody is signed in. */
export function useSignedInPerson(): Person | undefined {
  const [person, setPerson] = useState<Person | undefined>(undefined);
  useEffect(() => {
    let live = true;
    signedInPerson().then((p) => {
      if (live) setPerson(p ?? undefined);
    });
    return () => {
      live = false;
    };
  }, []);
  return person;
}
