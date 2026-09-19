/**
 * ADOPTING THE MSF STANDARD SET — one implementation.
 *
 * Until the My Studio round (Sep 2026) two screens each had their own "Add
 * the standard set": the Studios tab's Equipment panel and the inventory
 * manager. They once disagreed about the default for a missing
 * `inStandardSet` flag (fixed by sharing isStandardSetMachine), and they
 * still wrote their batches separately. This is the one write both of them,
 * and My Studio → Machines, call.
 *
 * It reads the roster once from the server rather than trusting the
 * listener's copy: a leader who taps twice in the beat before the first
 * write echoes back would otherwise seed the same machines twice (harmless,
 * merged — but "24 added" on a 20-machine floor is a number nobody should
 * see).
 */

import { collection, doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { standardSetSeed } from "../studios/registry";

export interface SeedResult {
  added: number;
  alreadyPresent: number;
  /** Catalog ids collapsed as duplicates of a machine already seeded. */
  duplicates: string[];
}

export interface SeedCatalogEntry {
  id: string;
  name?: string;
  inStandardSet?: boolean;
  status?: string;
}

export async function seedStandardSet(
  studioId: string,
  catalog: SeedCatalogEntry[],
): Promise<SeedResult> {
  const snap = await getDocs(collection(db, "studios", studioId, "roster"));
  const { seed, duplicates, alreadyPresent } = standardSetSeed(
    catalog,
    snap.docs.map((d) => d.id),
  );
  if (seed.length > 0) {
    const batch = writeBatch(db);
    for (const machine of seed) {
      batch.set(
        doc(db, "studios", studioId, "roster", machine.id),
        {
          machineId: machine.id,
          studioId,
          source: "catalog",
          basedOn: machine.id,
          status: "active",
          updatedAt: serverTimestamp(),
          updatedBy: auth.currentUser?.uid ?? null,
        },
        { merge: true },
      );
    }
    await batch.commit();
  }
  return { added: seed.length, alreadyPresent, duplicates: Object.values(duplicates).flat() };
}

/** One catalog machine onto the floor — "Adopt" on a New-in-the-standard row. */
export async function adoptCatalogMachine(studioId: string, machineId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(
    doc(db, "studios", studioId, "roster", machineId),
    {
      machineId,
      studioId,
      source: "catalog",
      basedOn: machineId,
      status: "active",
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser?.uid ?? null,
    },
    { merge: true },
  );
  await batch.commit();
}
