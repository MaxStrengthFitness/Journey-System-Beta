import { useCallback, useEffect, useRef, useState } from "react";
import {
  collection,
  updateDoc,
  doc,
  getDocFromCache,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { Client, Trainer } from "../types";
import { studioTodayKey } from "../lib/studio-time";
import {
  forgetLiveSession,
  myTrainerIds,
  peekLiveSessionId,
  rememberLiveSession,
  type LiveSessionLike,
  type RememberedSessionData,
} from "../lib/live-session";
import {
  OPEN_SESSION_GUARD_MS,
  OPEN_SESSION_REFUSED,
  announceOpenSessionRefused,
  declinedStaleOpenSessions,
  isSecondTap,
  openSessionPayload,
  runningOpenSessionId,
  type LastOpenStart,
} from "../features/open-session/start";

export interface ClientMutationsOptions {
  authTrainer: Trainer | null;
  /** The sign-in uid: one of the ids this trainer's sessions may carry. */
  uid: string | null;
  activeStudioId: string | null;
  /** The studio's sessions stream: Open session goes back to the trainer's own running one. */
  sessions: readonly LiveSessionLike[];
  setSelectedClientId: (id: string | null) => void;
  setCurrentView: (view: any) => void;
  /** Says a refused write (the toast). */
  onRefused?: (message: string) => void;
}

export function useClientMutations({
  authTrainer,
  uid,
  activeStudioId,
  sessions,
  setSelectedClientId,
  setCurrentView,
  onRefused,
}: ClientMutationsOptions) {
  const [isMutating, setIsMutating] = useState(false);

  /*
   * THE OPEN SESSION'S START (the open session round, Oct 9 2026; see
   * features/open-session/start.ts). One write, issued and never awaited; the
   * screen moves in the same tap. While this trainer's own open session is
   * still running, a tap goes back to it and writes nothing
   * (`runningOpenSessionId`); the ref is also the double-tap guard, for an
   * iPad that cannot remember a session, and keeps the studio it was started
   * at (the stream is one studio's). `startingOpenSession` is what the
   * Directory's button shows.
   */
  const lastStartRef = useRef<(LastOpenStart & { at: number }) | null>(null);
  /* A tap waiting on the iPad's own copy of the remembered session (after a
     reload): a second tap meanwhile starts nothing. */
  const checkingRef = useRef(false);
  const [startingOpenSession, setStartingOpenSession] = useState(false);
  const startingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (startingTimer.current) clearTimeout(startingTimer.current);
    },
    [],
  );

  const goToSession = useCallback(() => {
    setSelectedClientId(null);
    setCurrentView("workouts");
  }, [setSelectedClientId, setCurrentView]);

  const startOpenSession = () => {
    if (!authTrainer || !uid) return;
    if (checkingRef.current) return;
    const now = Date.now();
    const last = lastStartRef.current;
    const studioHere = activeStudioId ?? null;
    const remembered = peekLiveSessionId();
    const facts = {
      stream: sessions,
      myIds: myTrainerIds(authTrainer, uid),
      lastStarted: last,
      rememberedId: remembered,
      studioId: studioHere,
      declined: declinedStaleOpenSessions(),
      now,
    };
    const goBack = (id: string) => {
      rememberLiveSession(id);
      goToSession();
    };
    const running =
      last && isSecondTap(last, now) && (last.studioId ?? null) === studioHere ? last.id : runningOpenSessionId(facts);
    if (running) {
      goBack(running);
      return;
    }
    /* After a reload, offline: the session the device remembers is in no
       stream (the stream ranges over the server's createdAt, which a write
       still on the iPad doesn't have yet), so the iPad's own copy of it is
       read, at once and with no network, before a second open session is
       started beside it. */
    if (!last && remembered && !sessions.some((s) => s.id === remembered)) {
      checkingRef.current = true;
      getDocFromCache(doc(db, "sessions", remembered))
        .then(
          (snap) => (snap.exists() ? ({ id: snap.id, ...snap.data() } as RememberedSessionData) : null),
          () => null,
        )
        .then((onDevice) => {
          checkingRef.current = false;
          const back = runningOpenSessionId({ ...facts, rememberedOnDevice: onDevice, now: Date.now() });
          if (back) goBack(back);
          else startNew(now);
        });
      return;
    }
    startNew(now);
  };

  const startNew = (now: number) => {
    if (!authTrainer || !uid) return;
    /* This iPad's studio only. The Active Session finds an open session in
       the studio on screen, so one written anywhere else (the trainer's home
       studio, as it was) could be neither seen nor found again. */
    const studioId = activeStudioId;
    if (!studioId) {
      onRefused?.("Choose a studio first, then press Open session.");
      return;
    }

    // The id is made on the iPad: nothing waits for the database to name it.
    const sessionRef = doc(collection(db, "sessions"));
    const payload = openSessionPayload({
      trainer: authTrainer,
      uid,
      studioId,
      date: studioTodayKey(),
      nowIso: new Date(now).toISOString(),
      stamp: serverTimestamp(),
    });
    const refused = (error: unknown) => {
      console.error("[open session] the start was refused", error);
      if (lastStartRef.current?.id === sessionRef.id) lastStartRef.current = null;
      forgetLiveSession(sessionRef.id);
      /* The Active Session holding it says so itself (the sets typed in it
         are kept); otherwise this does. */
      if (!announceOpenSessionRefused(sessionRef.id)) onRefused?.(OPEN_SESSION_REFUSED);
    };
    // Issued now and never awaited: the iPad's copy holds it this instant.
    let write: Promise<void>;
    try {
      write = setDoc(sessionRef, payload);
    } catch (error) {
      refused(error);
      return;
    }
    write.catch(refused);

    lastStartRef.current = { id: sessionRef.id, studioId, at: now };
    setStartingOpenSession(true);
    if (startingTimer.current) clearTimeout(startingTimer.current);
    startingTimer.current = setTimeout(() => setStartingOpenSession(false), OPEN_SESSION_GUARD_MS);
    // The device remembers it, so the Session tab can bring the trainer back.
    rememberLiveSession(sessionRef.id);
    goToSession();
  };

  const updateClient = async (clientId: string, updates: Partial<Client>) => {
    setIsMutating(true);
    try {
      await updateDoc(doc(db, "clients", clientId), { ...updates, updatedAt: serverTimestamp() });
    } catch (e) {
      console.error(e);
      throw e;
    } finally {
      setIsMutating(false);
    }
  };

  // No client delete (Oct 2 2026): Mindbody owns people, and the dialog that
  // offered one had no door. A client who leaves goes inactive in Mindbody.
  return {
    isMutating,
    startOpenSession,
    startingOpenSession,
    updateClient,
  };
}
