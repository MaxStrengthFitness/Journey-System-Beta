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
  type ProfileNavContext,
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
  ctx: ProfileNavContext = {},
): UseProfileNav {
  // Read once per client. `useReducer`'s lazy initialiser runs on mount only,
  // so the effect below handles a client change without a remount.
  const [state, rawDispatch] = useReducer(
    (s: ReturnType<typeof initialNavState>, a: ProfileNavAction) =>
      profileNavReducer(s, a, ctxRef.current),
    clientId,
    (id) => initialNavState(readStoredLocation(id) ?? DEFAULT_LOCATION),
  );

  // The reducer must see the LATEST default without being re-created on every
  // render — the programming default depends on the routine chosen for today,
  // which arrives a beat after the profile opens.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

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

  const setTab = useCallback((tab: ProfileTab) => rawDispatch({ type: "tab", tab }), []);
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
          : (state.lastProgramming ?? ctxRef.current.programmingDefault ?? "routine-a"),
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
