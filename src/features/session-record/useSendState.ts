/**
 * Where this iPad's saves are: online or not, and how long the oldest save the
 * database has not yet confirmed has been waiting (session record, Sep 26 2026).
 *
 * `online` is the browser's `online` / `offline` events. `unsentForMs` comes from
 * Firestore itself: the caller says `sent()` each time it issues a write, and
 * `waitForPendingWrites` settles once every write issued so far has reached the
 * database. Only the newest wait may clear the clock, so an early write that
 * lands cannot hide a later one that has not. Offline the wait simply lasts
 * until the connection is back, and then settles by itself.
 *
 * Reads nothing and writes nothing.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { waitForPendingWrites } from "firebase/firestore";
import { db } from "../../firebase";

export interface SendState {
  online: boolean;
  unsentForMs: number;
  /** Call after issuing a write whose arrival matters. Stable across renders. */
  sent: () => void;
}

const browserOnline = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);

export function useSendState(): SendState {
  const [online, setOnline] = useState(browserOnline);
  const [unsentSince, setUnsentSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const generation = useRef(0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    setOnline(browserOnline());
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const sent = useCallback(() => {
    const gen = ++generation.current;
    setUnsentSince((since) => since ?? Date.now());
    /* Watching must never break the save it watches: a wait that cannot even
       start leaves the clock running, and the next sent() tries again. */
    let waiting: Promise<void>;
    try {
      waiting = waitForPendingWrites(db);
    } catch {
      return;
    }
    waiting.then(
      () => {
        if (generation.current === gen) setUnsentSince(null);
      },
      () => {
        /* A failed wait says nothing about the writes; the next sent() waits again. */
      },
    );
  }, []);

  /* Tick only while something is waiting, so the "still sending" line can
     appear without anything else re-rendering the screen. */
  useEffect(() => {
    if (unsentSince === null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [unsentSince]);

  return {
    online,
    unsentForMs: unsentSince === null ? 0 : Math.max(0, now - unsentSince),
    sent,
  };
}
