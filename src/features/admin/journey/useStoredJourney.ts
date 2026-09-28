/**
 * THE NIGHT'S STATES ON A SCREEN — what the nightly job wrote for a studio
 * (wave 2, Sep 28 2026; nightly.ts has what each document says):
 *
 *   studios/{s}/watch/journey      the summary: the day the states were
 *                                  worked out for, and the lines they used
 *   studios/{s}/clientStates       each active client's state (one small
 *                                  collection: a document a client)
 *
 * Both are the studio's leaders' to read (firestore.rules), so for anyone
 * else the read is refused and the page simply works every state out
 * itself, as before; a refused or failed read is never "nobody". One
 * listener pair per studio for the whole app, however many pages ask (the
 * Journey page and the client opened over it both do), dropped when the last
 * one leaves and forgotten at sign-out.
 */
import { useEffect, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../../../firebase";
import { forgetOnSignOut } from "../../sign-out/memory";
import { CLIENT_STATES, JOURNEY_WATCH_ID, parseStateDoc, parseSummary, type ClientStateDoc, type JourneySummary } from "./nightly";

export interface StoredJourney {
  summary: (JourneySummary & { computedAt: Date | null }) | null;
  states: ReadonlyMap<string, ClientStateDoc>;
  loading: boolean;
  /** Either read was refused or failed: every state is worked out on the page. */
  failed: boolean;
}

const EMPTY: ReadonlyMap<string, ClientStateDoc> = new Map();
const LOADING: StoredJourney = { summary: null, states: EMPTY, loading: true, failed: false };
const NONE: StoredJourney = { summary: null, states: EMPTY, loading: false, failed: false };

interface Shared {
  value: StoredJourney;
  listeners: Set<(v: StoredJourney) => void>;
  stop: () => void;
}

const shared = new Map<string, Shared>();

function subscribe(studioId: string, fn: (v: StoredJourney) => void): () => void {
  let s = shared.get(studioId);
  if (!s) {
    let summary: StoredJourney["summary"] | undefined;
    let states: ReadonlyMap<string, ClientStateDoc> | undefined;
    let failed = false;
    const entry: Shared = { value: LOADING, listeners: new Set(), stop: () => {} };
    const publish = () => {
      entry.value = failed
        ? { summary: null, states: EMPTY, loading: false, failed: true }
        : { summary: summary ?? null, states: states ?? EMPTY, loading: summary === undefined || states === undefined, failed: false };
      entry.listeners.forEach((l) => l(entry.value));
    };
    const fail = () => {
      failed = true;
      publish();
    };
    const stopSummary = onSnapshot(
      doc(db, "studios", studioId, "watch", JOURNEY_WATCH_ID),
      (snap) => {
        summary = snap.exists() ? parseSummary(snap.data() as Record<string, unknown>) : null;
        publish();
      },
      fail,
    );
    const stopStates = onSnapshot(
      collection(db, "studios", studioId, CLIENT_STATES),
      (snap) => {
        const next = new Map<string, ClientStateDoc>();
        snap.docs.forEach((d) => {
          const parsed = parseStateDoc(d.data() as Record<string, unknown>);
          if (parsed) next.set(d.id, parsed);
        });
        states = next;
        publish();
      },
      fail,
    );
    entry.stop = () => {
      stopSummary();
      stopStates();
    };
    s = entry;
    shared.set(studioId, s);
  }
  const entry = s;
  entry.listeners.add(fn);
  fn(entry.value);
  return () => {
    entry.listeners.delete(fn);
    if (entry.listeners.size === 0) {
      entry.stop();
      // Only this entry: after a sign-out a newer one may hold the studio's place.
      if (shared.get(studioId) === entry) shared.delete(studioId);
    }
  };
}

// The next person on a shared iPad reads the night afresh (and may not be a leader).
forgetOnSignOut(() => {
  for (const s of shared.values()) s.stop();
  shared.clear();
});

export function useStoredJourney(studioId: string | null | undefined): StoredJourney {
  const [value, setValue] = useState<StoredJourney>(studioId ? LOADING : NONE);
  useEffect(() => {
    if (!studioId) {
      setValue(NONE);
      return;
    }
    return subscribe(studioId, setValue);
  }, [studioId]);
  return value;
}
