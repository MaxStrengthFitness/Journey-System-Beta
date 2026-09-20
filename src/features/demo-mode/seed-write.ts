import {
  Timestamp,
  doc,
  getDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { db } from "../../firebase";
import { buildDemoSeed, isTsSentinel, type DemoSeed, type SeedDoc } from "./seed-core";
import { DEMO_STUDIO_ID } from "./constants";

/**
 * LAYING THE DEMO STUDIO DOWN, from inside the app.
 *
 * The decision of WHAT to write is entirely in `seed-core.ts`; this file only
 * knows how to put a list of documents into Firestore. `scripts/seed-demo.ts`
 * is the same job through the Admin SDK, over the identical list.
 *
 * ── Why this is safe to press twice ──────────────────────────────────────
 *
 * Every id is derived, so a second run overwrites the same documents rather
 * than creating a second set. That makes "Set up Demo Mode" and "Reset Demo
 * Mode" the same operation, and it makes a half-finished run — a dropped
 * connection at document 700 — something you fix by pressing the button
 * again rather than something you have to clean up first.
 *
 * A wipe is deliberately NOT part of this. Deleting a thousand documents from
 * a browser is slow, partial failures leave the studio in a state no code
 * describes, and it is a loaded gun pointed at a collection that also holds
 * real clients. Overwriting reaches the same place with nothing to aim.
 */

/** Firestore's hard limit is 500 writes per batch; this leaves room. */
const BATCH_SIZE = 400;

export interface SeedProgress {
  written: number;
  total: number;
}

export interface SeedResult {
  summary: DemoSeed["summary"];
  written: number;
  /**
   * Catalog machines the roster points at that do not exist.
   *
   * `resolveMachine()` returns null for a roster entry whose `basedOn` is
   * missing, and `useStudioMachines` then drops that machine silently — so
   * the floor comes up short and nothing says why. Reported rather than
   * thrown: nineteen machines and a warning beats no demo studio at all.
   */
  missingCatalog: string[];
}

/** Firestore Timestamps, from the sentinels the pure core emits. */
function materialise(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue; // Firestore refuses undefined
    out[key] = convert(value);
  }
  return out;
}

function convert(value: unknown): unknown {
  if (isTsSentinel(value)) return Timestamp.fromDate(new Date(value.__ts));
  if (Array.isArray(value)) return value.map(convert);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return materialise(value as Record<string, unknown>);
  }
  return value;
}

function refFor(database: Firestore, path: string) {
  const parts = path.split("/");
  return doc(database, parts[0], ...parts.slice(1));
}

/** Which of the catalog machines the roster needs are actually there. */
async function findMissingCatalog(
  database: Firestore,
  ids: string[],
): Promise<string[]> {
  const checks = await Promise.all(
    ids.map(async (id) => ({ id, there: (await getDoc(doc(database, "machines", id))).exists() })),
  );
  return checks.filter((c) => !c.there).map((c) => c.id);
}

/**
 * Write the demo studio.
 *
 * @param seededBy  the trainer pressing the button — stamped as the author.
 * @param today     the studio's own day, `YYYY-MM-DD`.
 * @param onProgress called after each batch, for a progress line.
 */
export async function seedDemoStudio(
  seededBy: { id: string; name: string },
  today: string,
  onProgress?: (progress: SeedProgress) => void,
  database: Firestore = db,
): Promise<SeedResult> {
  const seed = buildDemoSeed({ today, seededBy });
  const missingCatalog = await findMissingCatalog(database, seed.summary.requiresCatalog);

  let written = 0;
  for (let i = 0; i < seed.docs.length; i += BATCH_SIZE) {
    const chunk = seed.docs.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(database);
    for (const entry of chunk) {
      batch.set(refFor(database, entry.path), materialise(entry.data), {
        merge: entry.merge ?? false,
      });
    }
    await batch.commit();
    written += chunk.length;
    onProgress?.({ written, total: seed.docs.length });
  }

  return { summary: seed.summary, written, missingCatalog };
}

/** What the demo studio's own document says about the last seed. */
export async function readDemoSeedState(
  database: Firestore = db,
): Promise<{ exists: boolean; version: number | null; seededAt: Date | null }> {
  const snap = await getDoc(doc(database, "studios", DEMO_STUDIO_ID));
  if (!snap.exists()) return { exists: false, version: null, seededAt: null };
  const data = snap.data() as Record<string, unknown>;
  const at = data.demoSeededAt;
  return {
    exists: true,
    version: typeof data.demoSeedVersion === "number" ? data.demoSeedVersion : null,
    seededAt: at instanceof Timestamp ? at.toDate() : null,
  };
}

export type { SeedDoc };
