/**
 * THE `machines` COLLECTION, READ ONCE FOR THE WHOLE APP (the speed round,
 * Oct 5 2026, R16).
 *
 * Two hooks read the catalog: `useMachines` (AppContent, ordered by `order`
 * in the query) and `useMachineCatalog` (the session, the profile, the
 * Catalog, the floor map and more, unordered). They were two different
 * queries, so two live reads of the same documents on every iPad. Now there
 * is one unordered listener, shared by everyone who asks, stopped when the
 * last one leaves and forgotten at sign-out; each hook sorts and shapes in
 * memory.
 *
 * Why unordered (useMachineCatalog's reason, kept): Firestore's orderBy
 * silently drops a document that lacks the field, so a machine created
 * without one would vanish rather than sort badly. `useMachines` reproduces
 * its old query exactly in memory (documents that HAVE `order`, sorted by
 * it), so nothing it shows changed.
 *
 * A read that fails is `failed`, never an empty catalog.
 */
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { OperationType, handleFirestoreError } from "./firestore-errors";
import { forgetOnSignOut } from "../features/sign-out/memory";

export interface MachineDoc {
  id: string;
  data: Record<string, unknown>;
}

export interface MachinesRead {
  docs: readonly MachineDoc[];
  loading: boolean;
  failed: boolean;
}

export const MACHINES_LOADING: MachinesRead = { docs: [], loading: true, failed: false };

interface Shared {
  value: MachinesRead;
  listeners: Set<(v: MachinesRead) => void>;
  stop: () => void;
}

let shared: Shared | null = null;

/** Listen to the catalog. The first caller opens the one listener; the last one out closes it. */
export function subscribeMachines(fn: (v: MachinesRead) => void): () => void {
  if (!shared) {
    const entry: Shared = { value: MACHINES_LOADING, listeners: new Set(), stop: () => {} };
    const publish = (v: MachinesRead) => {
      entry.value = v;
      entry.listeners.forEach((l) => l(v));
    };
    entry.stop = onSnapshot(
      collection(db, "machines"),
      (snap) => {
        publish({
          docs: snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })),
          loading: false,
          failed: false,
        });
      },
      (error) => {
        // Keep what was there: the catalog that was read is still the catalog.
        publish({ docs: entry.value.docs, loading: false, failed: true });
        handleFirestoreError(error, OperationType.GET, "machines");
      },
    );
    shared = entry;
  }
  const entry = shared;
  entry.listeners.add(fn);
  fn(entry.value);
  return () => {
    entry.listeners.delete(fn);
    if (entry.listeners.size === 0) {
      entry.stop();
      if (shared === entry) shared = null;
    }
  };
}

// The next person on a shared iPad opens a fresh read under their own sign-in.
forgetOnSignOut(() => {
  shared?.stop();
  shared = null;
});

/** How many listeners are open on `machines` right now: 0 or 1. For tests. */
export function openMachinesListeners(): number {
  return shared ? 1 : 0;
}
