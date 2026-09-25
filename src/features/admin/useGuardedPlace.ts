import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { View } from "../../types";
import { HUB_PLACE, guardPlace, type AppMode, type PlaceAccess } from "./operations-access";

export interface GuardedPlace {
  /** The screen to show: never one this person may not open. */
  currentView: View;
  setCurrentView: Dispatch<SetStateAction<View>>;
  /** Which bottom bar: never Operations' for someone who may not open it. */
  appMode: AppMode;
  setAppMode: Dispatch<SetStateAction<AppMode>>;
}

/**
 * AppContent's screen and app mode, held to `guardPlace` (sign-out round,
 * Sep 24 2026; see ./operations-access.ts).
 *
 * Two halves, and both matter:
 *
 *  - DERIVED during render, so a screen this person may not open is never
 *    drawn, not even for the one frame before an effect could move them.
 *  - WRITTEN BACK in an effect, so the refusal sticks. A trainer who opened
 *    Operations in Demo Mode and then chose a real studio is sent to the Hub;
 *    going back into Demo Mode afterwards must not reopen Operations by
 *    itself, which it would if only the derived value had changed.
 *
 * Starts at the Hub in trainer mode, which is also where every new person
 * starts: App remounts this on sign-out (features/sign-out).
 */
export function useGuardedPlace(access: PlaceAccess): GuardedPlace {
  const [view, setCurrentView] = useState<View>(HUB_PLACE.view);
  const [mode, setAppMode] = useState<AppMode>(HUB_PLACE.appMode);
  const place = guardPlace({ view, appMode: mode }, access);

  useEffect(() => {
    if (place.view !== view) setCurrentView(place.view);
    if (place.appMode !== mode) setAppMode(place.appMode);
  }, [place.view, place.appMode, view, mode]);

  return { currentView: place.view, setCurrentView, appMode: place.appMode, setAppMode };
}
