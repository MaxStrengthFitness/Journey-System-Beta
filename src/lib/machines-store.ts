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

/** Everyone listening now. Kept apart from the read, so a read that died can be reopened under them. */
const listeners = new Set<(v: MachinesRead) => void>();
/** The one live read, or null when none is open (nobody listening, or the last one failed). */
let target: { stop: () => void } | null = null;
/** The last answer, handed to anyone who starts listening. */
let last: MachinesRead = MACHINES_LOADING;

function publish(v: MachinesRead) {
  last = v;
  listeners.forEach((l) => l(v));
}

function open() {
  const mine = { stop: () => {} };
  target = mine;
  mine.stop = onSnapshot(
    collection(db, "machines"),
    (snap) => {
      if (target !== mine) return;
      publish({
        docs: snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> })),
        loading: false,
        failed: false,
      });
    },
    (error) => {
      if (target !== mine) return;
      // A listener that errored never answers again (the SDK ends it). Let it
      // go, so the next screen that asks opens a fresh read for everyone
      // still listening, rather than the whole session living on a dead one
      // (the speed round's review, Oct 5 2026). Keep what was there: the
      // catalog that was read is still the catalog.
      target = null;
      mine.stop();
      publish({ docs: last.docs, loading: false, failed: true });
      handleFirestoreError(error, OperationType.GET, "machines");
    },
  );
}

/**
 * Listen to the catalog. The first caller opens the one listener and the last
 * one out closes it; a caller arriving after the read failed opens it again.
 */
export function subscribeMachines(fn: (v: MachinesRead) => void): () => void {
  listeners.add(fn);
  if (!target) open();
  fn(last);
  return () => {
    if (!listeners.delete(fn)) return;
    if (listeners.size === 0) {
      target?.stop();
      target = null;
      last = MACHINES_LOADING;
    }
  };
}

// The next person on a shared iPad opens a fresh read under their own sign-in.
forgetOnSignOut(() => {
  target?.stop();
  target = null;
  last = MACHINES_LOADING;
});

/** How many listeners are open on `machines` right now: 0 or 1. For tests. */
export function openMachinesListeners(): number {
  return target ? 1 : 0;
}
