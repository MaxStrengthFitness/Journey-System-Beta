/**
 * NOTICING A NEW VERSION, AND LOADING IT AT A SAFE MOMENT (new-version round,
 * Sep 26 2026). The React half; the rules are in verdict.ts, the words in
 * words.ts. Mounted once, by AppContent, which hands it the facts only it
 * knows: the screen, the client, the trainer's own open session.
 *
 * WHEN IT LOOKS. Coming back to Journey (the iPad unlocked, the app brought
 * back from the app switcher, a page restored from the back-forward cache),
 * the connection coming back, arriving at the Hub, and a screen whose file
 * could not be loaded (main.tsx's `vite:preloadError` listener asks at once).
 * No timer. Each look is one request for a few dozen bytes to our own
 * server, and coming back over and over within a minute looks once.
 *
 * WHEN IT LOADS BY ITSELF. Only on the Hub (AJ, Sep 26 2026): on arriving
 * there, or on coming back to Journey while it shows the Hub. A reload lands
 * on the Hub anyway, and every session starts and ends there. It never fires
 * from a timer while someone is reading a screen.
 *
 * EVERYWHERE ELSE, the line under the header says a new version is ready,
 * with Load now where pressing it can work. A screen that could not open asks
 * `recoverScreen` (LoadBoundary), which reloads by itself when nothing is at
 * risk and returns the trainer to the same screen and client.
 *
 * Every reload asks `whenToLoad` first, with the facts read AFTER every wait,
 * so a trainer who tapped into a session while the server was being asked is
 * never reloaded out of it.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasDraftText, readSessionDraft } from "../client-notes/session-draft";
import { unsentWritesWaiting } from "../session-record/sign-out-check";
import { useLeaveGuard, useUnsavedStatus } from "../unsaved-changes";
import { peekLiveSessionId } from "../../lib/live-session";
import { APP_BUILD, isNewBuild } from "./build";
import { noteReload, rememberPlace, takePlace, triedAlready, type ReturnPlace, type SessionStorageLike } from "./reload-once";
import { whenToLoad, type LoadMoment, type LoadVerdict } from "./verdict";
import { reloadTarget, versionStore, type VersionStore } from "./version-store";
import { newVersionLine, type BrokenCause, type BrokenScreenState, type LineWords } from "./words";

/** An automatic moment trusts an answer from the server this recent. */
export const AUTO_FRESH_MS = 30_000;
/**
 * How long an automatic moment waits for saves to reach the database before
 * it says they are still sending. Nobody is waiting on it (the Hub is already
 * on screen), and Back to Hub after a session has just written the session
 * and its note: long enough for those to land on studio Wi-Fi.
 */
export const AUTO_SEND_WAIT_MS = 4_000;
/** A person pressed a button: this long at most. */
export const TAP_SEND_WAIT_MS = 2_000;

export interface NewVersionOptions {
  /** The screen showing (AppContent's `currentView`). */
  view: string;
  /** The Hub's screen. */
  hubView: string;
  /** The Active Session's screen. */
  sessionView: string;
  /** Signed in, a studio chosen, the shell on screen. */
  shellReady: boolean;
  /** The Auth uid of whoever is signed in. */
  uid: string | null;
  /** The client on screen. */
  clientId: string | null;
  /** This trainer's own open session's client, or null when none is open. */
  ownSessionClientName: string | null;
  /** Firestore's `waitForPendingWrites` for the app's database. */
  waitForPendingWrites: () => Promise<void>;
  /** The screens this build can show by themselves, for "where you were". */
  isKnownView: (view: string) => boolean;
  /** Go back to a remembered place, through the app's own guarded setters. */
  restorePlace: (place: ReturnPlace) => void;
  /** Tests only. */
  reload?: () => void;
  storage?: SessionStorageLike | null;
  store?: VersionStore;
  running?: string;
}

export interface NewVersionHandle {
  /** The line under the header, or null. */
  line: LineWords | null;
  /** Load now is working (asking the server, waiting for saves). */
  busy: boolean;
  /** The line's Load now. */
  loadNow: () => void;
  /** A screen could not open: reload by itself when nothing is at risk. */
  recoverScreen: (sessionScreen: boolean) => Promise<BrokenScreenState>;
  /** The broken screen's Load the new version, or Try again. */
  tapScreen: () => Promise<BrokenScreenState>;
}

interface Attempt {
  verdict: LoadVerdict | null;
  cause: BrokenCause;
  target: string | null;
}

function sessionStorageOrNull(): SessionStorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function reloadPage(): void {
  window.location.reload();
}

export function useNewVersion(options: NewVersionOptions): NewVersionHandle {
  const store = options.store ?? versionStore;
  const running = options.running ?? APP_BUILD;
  const storage = options.storage !== undefined ? options.storage : sessionStorageOrNull();

  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const unsaved = useUnsavedStatus();
  const guardLeave = useLeaveGuard();

  // The facts as they are NOW, for reading after an await.
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });

  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const trying = useRef(false);
  const leaving = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** The line says "sending" until the saves it found have landed. */
  const watchSends = useCallback(() => {
    let settled: Promise<void>;
    try {
      settled = latest.current.waitForPendingWrites();
    } catch {
      return;
    }
    const clear = () => {
      if (mounted.current) setSending(false);
    };
    settled.then(clear, clear);
  }, []);

  /** Ask the server, gather the facts, and hear the verdict. Reloads nothing. */
  const attempt = useCallback(
    async (moment: LoadMoment): Promise<Attempt> => {
      const automatic = moment !== "tap";
      const live = await store.check({ maxAgeMs: automatic ? AUTO_FRESH_MS : 0 });
      const online = typeof navigator === "undefined" || navigator.onLine !== false;
      const serverAnswered = live !== null && online;
      const cause: BrokenCause = isNewBuild(running, live) ? "new-version" : "not-loaded";
      // A person may ask for a reload of this same build (Try again); a
      // moment that loads by itself only ever reloads for something.
      const target = reloadTarget(store.get(), running) ?? (automatic ? null : `again:${running}`);
      if (target === null) return { verdict: null, cause, target };

      const sendingNow = serverAnswered
        ? await unsentWritesWaiting(
            () => latest.current.waitForPendingWrites(),
            automatic ? AUTO_SEND_WAIT_MS : TAP_SEND_WAIT_MS,
          )
        : false;
      if (mounted.current) setSending(sendingNow);
      if (sendingNow) watchSends();

      const now = latest.current;
      const verdict = whenToLoad(moment, {
        serverAnswered,
        onSessionScreen: now.view === now.sessionView,
        ownSessionClientName: now.ownSessionClientName,
        sending: sendingNow,
        typing: unsaved.anyDirty(),
        noteDraft: hasDraftText(readSessionDraft(peekLiveSessionId())),
        triedAlready: triedAlready(storage, target, Date.now()),
      });
      return { verdict, cause, target };
    },
    [store, running, storage, unsaved, watchSends],
  );

  /** Reload for `target`, noting it and where the trainer was. Once. */
  const go = useCallback(
    (target: string) => {
      if (leaving.current) return;
      leaving.current = true;
      const now = latest.current;
      const at = Date.now();
      noteReload(storage, target, at);
      if (now.uid && now.view !== now.hubView) {
        rememberPlace(storage, { view: now.view, clientId: now.clientId }, now.uid, at);
      }
      (now.reload ?? reloadPage)();
    },
    [storage],
  );

  /** The Hub moment: load by itself when a reload is wanted and nothing is at risk. */
  const tryOnHub = useCallback(async () => {
    const onHub = () => latest.current.shellReady && latest.current.view === latest.current.hubView;
    if (trying.current || !onHub()) return;
    trying.current = true;
    try {
      const a = await attempt("hub");
      if (a.target !== null && a.verdict?.load === "now" && onHub()) go(a.target);
    } finally {
      trying.current = false;
    }
  }, [attempt, go]);

  // Arriving at the Hub (and the Hub being the first screen after sign-in).
  useEffect(() => {
    if (options.shellReady && options.view === options.hubView) void tryOnHub();
  }, [options.shellReady, options.view, options.hubView, tryOnHub]);

  // Coming back to Journey, and the connection coming back.
  useEffect(() => {
    const onReturn = () => {
      const now = latest.current;
      if (now.shellReady && now.view === now.hubView) void tryOnHub();
      else void store.check();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") onReturn();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) onReturn();
    };
    const onOnline = () => onReturn();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("online", onOnline);
    };
  }, [store, tryOnHub]);

  // Where the trainer was before a reload for a new version: once, when the
  // shell is up for the person who was using it.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !options.shellReady || !options.uid) return;
    restored.current = true;
    const place = takePlace(storage, options.uid, Date.now(), options.isKnownView);
    if (place && (place.view !== options.view || place.clientId !== options.clientId)) {
      options.restorePlace(place);
    }
    // Once per page: the options it reads are the ones at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.shellReady, options.uid]);

  /**
   * A person asked. Typing goes through the app's own question ("You have
   * unsaved changes to … Leave without saving?"); the reload runs only on
   * Leave, and only if the Active Session has not been opened meanwhile.
   * Returns false when the question is up and the reload is held.
   */
  const reloadAsked = useCallback(
    (target: string): boolean => {
      let ran = false;
      guardLeave(() => {
        ran = true;
        const now = latest.current;
        if (now.view === now.sessionView || now.ownSessionClientName !== null) return;
        go(target);
      });
      return ran;
    },
    [guardLeave, go],
  );

  const loadNow = useCallback(() => {
    if (trying.current) return;
    trying.current = true;
    setBusy(true);
    void attempt("tap")
      .then((a) => {
        if (a.target !== null && a.verdict?.load === "now") reloadAsked(a.target);
      })
      .finally(() => {
        trying.current = false;
        if (mounted.current) setBusy(false);
      });
  }, [attempt, reloadAsked]);

  const recoverScreen = useCallback(
    async (sessionScreen: boolean): Promise<BrokenScreenState> => {
      store.markBroken();
      const a = await attempt(sessionScreen ? "broken-session-screen" : "broken-screen");
      if (a.target !== null && a.verdict?.load === "now") {
        go(a.target);
        return { phase: "loading", cause: a.cause };
      }
      return { phase: "wait", cause: a.cause, reason: a.verdict?.load === "wait" ? a.verdict.reason : "offline" };
    },
    [store, attempt, go],
  );

  const tapScreen = useCallback(async (): Promise<BrokenScreenState> => {
    const a = await attempt("tap");
    if (a.target !== null && a.verdict?.load === "now") {
      return reloadAsked(a.target)
        ? { phase: "loading", cause: a.cause }
        : { phase: "wait", cause: a.cause, reason: "typing" };
    }
    return { phase: "wait", cause: a.cause, reason: a.verdict?.load === "wait" ? a.verdict.reason : "offline" };
  }, [attempt, reloadAsked]);

  const now = options;
  const line =
    now.shellReady && isNewBuild(running, state.live)
      ? newVersionLine({
          onSessionScreen: now.view === now.sessionView,
          onHub: now.view === now.hubView,
          ownSessionClientName: now.ownSessionClientName,
          sending,
        })
      : null;

  return { line, busy, loadNow, recoverScreen, tapScreen };
}

/** Whether the server has a build live other than this one, for a reader outside the hook. */
export function useNewVersionLive(store: VersionStore = versionStore, running: string = APP_BUILD): boolean {
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  return isNewBuild(running, state.live);
}
