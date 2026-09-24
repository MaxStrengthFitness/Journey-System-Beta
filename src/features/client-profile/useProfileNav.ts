/**
 * The profile's one piece of navigation state.
 *
 * Wraps profileNavReducer with the two things a reducer cannot do on its own:
 * the per-client resume (sessionStorage, best-effort), and the context the
 * reducer needs to pick a default segment for a tab that has not been opened
 * yet.
 *
 * Everything else about where the trainer is — which tab, which segment,
 * which page of Notes & Profile and which card on it — comes out of here, and
 * nothing in ClientProfileView keeps a second copy of it.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { DossierSection } from "../../types/journal";
import {
  DEFAULT_LOCATION,
  initialNavState,
  legacyLocation,
  profileNavReducer,
  takeStoredLocation,
  type ClinicalView,
  type ProfileLocation,
  type ProfileTab,
  type ProgrammingView,
  type RecordAnchor,
  type RecordPage,
} from "./profile-nav";

export interface UseProfileNav {
  location: ProfileLocation;
  tab: ProfileTab;
  /** Programming's segment — meaningful only while that tab is showing. */
  programmingView: ProgrammingView;
  clinicalView: ClinicalView;
  /**
   * Notes & Profile's page. The Overview whenever the record tab is not
   * showing: entering the tab always opens there (AJ's decision 1).
   */
  recordPage: RecordPage;
  /** The card on that page a door asked for, if any. */
  recordAnchor: RecordAnchor | undefined;
  setTab: (tab: ProfileTab) => void;
  setProgrammingView: (view: ProgrammingView) => void;
  setClinicalView: (view: ClinicalView) => void;
  /** Open Notes & Profile at a page, and at a card on it. The cross-tab jump. */
  openRecord: (page: RecordPage, anchor?: RecordAnchor) => void;
  /** The pre-codex door: a dossier section, landed on its page and card. */
  openSection: (section: DossierSection) => void;
  go: (to: ProfileLocation) => void;
  /** Accepts any tab id the profile has ever used. See legacyLocation. */
  goLegacy: (id: string) => void;
}

export function useProfileNav(
  clientId: string | null | undefined,
  opts: {
    programmingDefault?: ProgrammingView;
    /**
     * Asked before any move that changes the TAB, because the tabs unmount
     * when hidden and take their typing with them (unsaved changes, Sep 24
     * 2026): run `proceed` to go, or hold it and ask first. A move within a
     * tab never asks — Setup, the one segment holding drafts, is kept
     * mounted when hidden. Omitted, every move goes straight through.
     */
    guard?: (proceed: () => void) => void;
  } = {},
): UseProfileNav {
  /*
   * The latest default, for dispatch time.
   *
   * It has to be a ref: the segment Programming opens on depends on the
   * routine chosen for today, which arrives a beat after the profile does,
   * and rebuilding the callbacks every time it changes would re-render every
   * consumer. It is read when an action is BUILT — after render, in an event
   * handler — never from inside the reducer.
   *
   * Declared ABOVE useReducer and never referenced by the reducer, both on
   * purpose. React runs a queued reducer during the next render at the point
   * of the useReducer call; a reducer closing over a const declared below it
   * reads that const in its temporal dead zone, and the profile crashed with
   * "Cannot access 'ctxRef' before initialization" the first time a trainer
   * changed tabs. See the note on ProfileNavAction.
   */
  const defaultRef = useRef(opts.programmingDefault);
  defaultRef.current = opts.programmingDefault;
  // Read at dispatch time, like the default above, so a new guard never
  // rebuilds the callbacks.
  const guardRef = useRef(opts.guard);
  guardRef.current = opts.guard;

  // Read once per client. `useReducer`'s lazy initialiser runs on mount only,
  // so the effect below handles a client change without a remount.
  // `profileNavReducer` is passed DIRECTLY: module scope, two arguments,
  // closing over nothing.
  const [state, rawDispatch] = useReducer(
    profileNavReducer,
    clientId,
    (id) => initialNavState(takeStoredLocation(id) ?? DEFAULT_LOCATION),
  );

  /*
   * A different client is a different screen: Journey, unless a screen
   * deliberately handed this client off somewhere (takeStoredLocation, which
   * consumes the intent). Nothing writes that key on the way OUT any more —
   * the profile no longer remembers a tab, by design. Fluidity round, Sep 2026.
   */
  /*
   * The tab on screen, for deciding whether a move changes it. A mirror kept
   * for event handlers; the reducer never reads it.
   */
  const tabRef = useRef(state.location.tab);
  tabRef.current = state.location.tab;
  const toTab = useCallback((tab: ProfileTab, move: () => void) => {
    const guard = guardRef.current;
    if (!guard || tab === tabRef.current) move();
    else guard(move);
  }, []);

  const lastClient = useRef(clientId);
  useEffect(() => {
    if (lastClient.current === clientId) return;
    lastClient.current = clientId;
    rawDispatch({ type: "go", to: takeStoredLocation(clientId) ?? DEFAULT_LOCATION });
  }, [clientId]);

  const setTab = useCallback(
    (tab: ProfileTab) =>
      toTab(tab, () =>
        rawDispatch({ type: "tab", tab, programmingDefault: defaultRef.current }),
      ),
    [toTab],
  );
  // Segment moves. Each also lands on its tab, so from anywhere else it is a
  // tab change like any other; from inside the tab it never asks.
  const setProgrammingView = useCallback(
    (view: ProgrammingView) =>
      toTab("programming", () => rawDispatch({ type: "programming", view })),
    [toTab],
  );
  const setClinicalView = useCallback(
    (view: ClinicalView) =>
      toTab("clinical", () => rawDispatch({ type: "clinical", view })),
    [toTab],
  );
  const openRecord = useCallback(
    (page: RecordPage, anchor?: RecordAnchor) =>
      rawDispatch(anchor ? { type: "record", page, anchor } : { type: "record", page }),
    [],
  );
  const openSection = useCallback(
    (section: DossierSection) =>
      toTab("record", () => rawDispatch({ type: "section", section })),
    [toTab],
  );
  const go = useCallback(
    (to: ProfileLocation) => toTab(to.tab, () => rawDispatch({ type: "go", to })),
    [toTab],
  );
  const goLegacy = useCallback(
    (id: string) =>
      toTab(legacyLocation(id).tab, () => rawDispatch({ type: "legacy", id })),
    [toTab],
  );

  return useMemo(() => {
    const recordPage: RecordPage =
      state.location.tab === "record" ? (state.location.page ?? "overview") : "overview";
    const recordAnchor =
      state.location.tab === "record" ? state.location.anchor : undefined;
    return {
      location: state.location,
      tab: state.location.tab,
      programmingView:
        state.location.tab === "programming"
          ? state.location.view
          : (state.lastProgramming ?? defaultRef.current ?? "routine-a"),
      clinicalView:
        state.location.tab === "clinical"
          ? state.location.view
          : (state.lastClinical ?? "calendar"),
      recordPage,
      recordAnchor,
      setTab,
      setProgrammingView,
      setClinicalView,
      openRecord,
      openSection,
      go,
      goLegacy,
    };
  }, [state, setTab, setProgrammingView, setClinicalView, openRecord, openSection, go, goLegacy]);
}
