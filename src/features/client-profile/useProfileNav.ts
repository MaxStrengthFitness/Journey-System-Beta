/**
 * The profile's one piece of navigation state.
 *
 * Wraps profileNavReducer with the two things a reducer cannot do on its own:
 * the per-client resume (sessionStorage, best-effort), and the context the
 * reducer needs to pick a default segment for a tab that has not been opened
 * yet.
 *
 * Everything else about where the trainer is — which tab, which segment,
 * which dossier section — comes out of here, and nothing in ClientProfileView
 * keeps a second copy of it.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { DossierSection } from "../../types/journal";
import {
  DEFAULT_LOCATION,
  initialNavState,
  profileNavReducer,
  readStoredLocation,
  writeStoredLocation,
  type ClinicalView,
  type ProfileLocation,
  type ProfileNavAction,
  type ProfileTab,
  type ProgrammingView,
} from "./profile-nav";

export interface UseProfileNav {
  location: ProfileLocation;
  tab: ProfileTab;
  /** Programming's segment — meaningful only while that tab is showing. */
  programmingView: ProgrammingView;
  clinicalView: ClinicalView;
  /** Which dossier section the record tab should land on, if any. */
  recordSection: DossierSection | undefined;
  setTab: (tab: ProfileTab) => void;
  setProgrammingView: (view: ProgrammingView) => void;
  setClinicalView: (view: ClinicalView) => void;
  /** Open Notes & Profile at a section. The cross-tab jump every screen uses. */
  openSection: (section: DossierSection) => void;
  go: (to: ProfileLocation) => void;
  /** Accepts any tab id the profile has ever used. See legacyLocation. */
  goLegacy: (id: string) => void;
}

export function useProfileNav(
  clientId: string | null | undefined,
  opts: { programmingDefault?: ProgrammingView } = {},
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

  // Read once per client. `useReducer`'s lazy initialiser runs on mount only,
  // so the effect below handles a client change without a remount.
  // `profileNavReducer` is passed DIRECTLY: module scope, two arguments,
  // closing over nothing.
  const [state, rawDispatch] = useReducer(
    profileNavReducer,
    clientId,
    (id) => initialNavState(readStoredLocation(id) ?? DEFAULT_LOCATION),
  );

  // A different client is a different screen. Resume theirs, or start on
  // Journey; never inherit the last client's segment.
  const lastClient = useRef(clientId);
  useEffect(() => {
    if (lastClient.current === clientId) return;
    lastClient.current = clientId;
    rawDispatch({ type: "go", to: readStoredLocation(clientId) ?? DEFAULT_LOCATION });
  }, [clientId]);

  useEffect(() => {
    writeStoredLocation(clientId, state.location);
  }, [clientId, state.location]);

  const setTab = useCallback(
    (tab: ProfileTab) =>
      rawDispatch({ type: "tab", tab, programmingDefault: defaultRef.current }),
    [],
  );
  const setProgrammingView = useCallback(
    (view: ProgrammingView) => rawDispatch({ type: "programming", view }),
    [],
  );
  const setClinicalView = useCallback(
    (view: ClinicalView) => rawDispatch({ type: "clinical", view }),
    [],
  );
  const openSection = useCallback(
    (section: DossierSection) => rawDispatch({ type: "section", section }),
    [],
  );
  const go = useCallback((to: ProfileLocation) => rawDispatch({ type: "go", to }), []);
  const goLegacy = useCallback((id: string) => rawDispatch({ type: "legacy", id }), []);

  return useMemo(
    () => ({
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
      recordSection:
        state.location.tab === "record" ? state.location.section : undefined,
      setTab,
      setProgrammingView,
      setClinicalView,
      openSection,
      go,
      goLegacy,
    }),
    [state, setTab, setProgrammingView, setClinicalView, openSection, go, goLegacy],
  );
}
