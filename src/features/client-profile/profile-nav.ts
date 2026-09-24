/**
 * CLIENT PROFILE NAVIGATION — one model for four tabs and their sub-views.
 *
 * Why this file exists
 * --------------------
 * The profile used to be seven tabs, each a flat string in one `useState`.
 * Seven tabs meant a trainer hunting for "her A routine" had to know whether
 * that lived under Routines or Equipment, and "what happened in March" had to
 * know whether that was History or Clinical. The tabs were named after the
 * screens that produced them, not after the questions a coach asks.
 *
 * Four tabs now, and each one answers a question:
 *
 *   Journey            what has she done, in order
 *   Programming        what is she supposed to do          (Routines + Equipment)
 *   Notes & Profile    what do we know and what did we say (Journal + Details)
 *   Activity Archive   what has already happened           (Clinical + History)
 *                      (was "Clinical History" — renamed in the client-profile
 *                      audit, Sep 2026: it is a ledger of visits and reports,
 *                      not a medical tool. The tab id stays "clinical".)
 *
 * Two of those carry more than one view, so a tab is no longer a single
 * string: it is a tab AND a position inside it. That pair is a
 * `ProfileLocation`, and it is the only thing the profile stores about where
 * the trainer is.
 *
 * Three rules the rest of the profile depends on:
 *
 *   1. NOTHING IS LOST IN A CONSOLIDATION. Every view that had a tab still
 *      has a segment, including Routine B when it is switched off. A control
 *      that disappears when its feature is off is a feature nobody finds
 *      again.
 *
 *   2. SWITCHING A SUB-VIEW COSTS NO FETCH. Every pane inside a tab reads
 *      data the profile has already loaded, or keeps its own gate (the
 *      clinical report still only runs when asked). Sub-views are therefore
 *      pure state, which is what lets them be tapped without thinking.
 *
 *   3. OLD LINKS STILL LAND. `legacyLocation()` maps every tab id the app has
 *      ever used — including the six-tab and seven-tab vocabularies — onto a
 *      location, so a `setActiveTab("journal")` anywhere in the codebase (or
 *      in a trainer's muscle memory) still arrives somewhere sane.
 *
 * Pure module, no React: the reducer and the maps are tested with plain
 * objects, and the screen is the only thing that needs a browser.
 */
import type { DossierSection } from "../../types/journal";

/* ------------------------------------------------------------------ *
 * The vocabulary
 * ------------------------------------------------------------------ */

export type ProfileTab = "journey" | "programming" | "record" | "clinical";

/**
 * Programming's segments: the two prescriptions, the whole roster, and the
 * set-up — every machine's settings on one list, with what similar clients
 * use and a passive check of what is saved (machine fit round, Sep 2026).
 */
export type ProgrammingView = "routine-a" | "routine-b" | "machines" | "setup";

/**
 * Activity Archive's segments (tab id "clinical").
 *
 * `calendar` and `sessions` were the History tab's own internal switch. They
 * are promoted to this level rather than nested inside it: a toggle inside a
 * toggle is two decisions to reach one screen, and the whole point of the
 * consolidation was to remove a hop, not move it.
 */
export type ClinicalView = "calendar" | "sessions" | "trends" | "reports";

export type ProfileLocation =
  | { tab: "journey" }
  | { tab: "programming"; view: ProgrammingView }
  | { tab: "record"; section?: DossierSection }
  | { tab: "clinical"; view: ClinicalView };

export const PROFILE_TABS: { id: ProfileTab; label: string; blurb: string }[] = [
  { id: "journey", label: "Journey", blurb: "Every machine she has performed, in order" },
  { id: "programming", label: "Programming", blurb: "What she is prescribed and how it is set up" },
  { id: "record", label: "Notes & Profile", blurb: "Everything written down, and who she is" },
  { id: "clinical", label: "Activity Archive", blurb: "Every visit, the trends, and the filed reports" },
];

/* ------------------------------------------------------------------ *
 * Defaults
 * ------------------------------------------------------------------ */

export const DEFAULT_LOCATION: ProfileLocation = { tab: "journey" };

/**
 * Which Programming segment to open on.
 *
 * The routine the client is training TODAY, when one is chosen — that is the
 * screen the trainer wanted nine times out of ten, and it saves the tap that
 * used to be "open Routines, then read which one is today". Otherwise A,
 * unless A is empty and B is not, in which case B: a client mid-way through
 * a rebuild can have an empty A for a week, and opening on an empty list
 * reads as a broken screen.
 */
export function defaultProgrammingView(args: {
  todayRoutine?: "Routine A" | "Routine B" | null;
  countA?: number;
  countB?: number;
  isBActive?: boolean;
}): ProgrammingView {
  const { todayRoutine, countA = 0, countB = 0, isBActive = false } = args;
  if (todayRoutine === "Routine B" && isBActive) return "routine-b";
  if (todayRoutine === "Routine A") return "routine-a";
  if (countA === 0 && isBActive && countB > 0) return "routine-b";
  return "routine-a";
}

/* ------------------------------------------------------------------ *
 * Legacy ids
 * ------------------------------------------------------------------ */

/**
 * Every tab id the profile has ever answered to, mapped onto where that
 * subject lives now. Callers elsewhere in the app (and the deep links in the
 * Hub, the briefing and the directory) keep passing these strings; they are
 * translated here rather than chased down one at a time.
 */
export function legacyLocation(id: string | null | undefined): ProfileLocation {
  switch ((id || "").toLowerCase()) {
    case "journey":
      return { tab: "journey" };

    case "routines":
      return { tab: "programming", view: "routine-a" };
    case "routine-b":
      return { tab: "programming", view: "routine-b" };
    case "equipment":
    case "machines":
      return { tab: "programming", view: "machines" };
    case "setup":
    case "set-up":
    case "setup-check":
    case "fit":
      return { tab: "programming", view: "setup" };

    case "journal":
    case "notes":
      return { tab: "record", section: "notes" };
    case "details":
    case "profile":
    case "identity":
    case "general":
      return { tab: "record", section: "general" };
    case "life":
    case "lifestyle":
    case "ford":
    case "events":
      return { tab: "record", section: "life" };
    case "medical":
      return { tab: "record", section: "medical" };
    case "goals":
      return { tab: "record", section: "goals" };
    case "focus":
      return { tab: "record", section: "focus" };
    case "admin":
      return { tab: "record", section: "admin" };

    case "history":
      return { tab: "clinical", view: "calendar" };
    case "sessions":
      return { tab: "clinical", view: "sessions" };
    case "clinical":
    case "trends":
      return { tab: "clinical", view: "trends" };
    case "reports":
      return { tab: "clinical", view: "reports" };

    default:
      return DEFAULT_LOCATION;
  }
}

/* ------------------------------------------------------------------ *
 * Moving around
 * ------------------------------------------------------------------ */

/**
 * Actions.
 *
 * `tab` carries its own `programmingDefault` rather than the reducer reading
 * one from the outside. That is not a style choice — it is the fix for a
 * crash. React processes a queued action by calling the reducer DURING the
 * next render, at the point of the `useReducer` call. A reducer that closes
 * over anything declared below that call (a `const` ref, say) is reading it
 * inside its temporal dead zone, and the profile threw "Cannot access 'ctxRef'
 * before initialization" the first time a trainer changed tabs.
 *
 * So the reducer takes exactly two arguments, is declared at module scope,
 * closes over nothing, and everything it needs arrives in the action — which
 * is assembled at DISPATCH time, safely after render. The bug is not fixed
 * here, it is made impossible.
 */
export type ProfileNavAction =
  | { type: "tab"; tab: ProfileTab; programmingDefault?: ProgrammingView }
  | { type: "programming"; view: ProgrammingView }
  | { type: "clinical"; view: ClinicalView }
  | { type: "section"; section: DossierSection }
  | { type: "go"; to: ProfileLocation }
  | { type: "legacy"; id: string };

/**
 * The reducer.
 *
 * The one behaviour worth stating out loud: **re-entering a tab returns you
 * to the segment you left it on.** A trainer who was reading Routine B, looks
 * at the Journey grid, and comes back expects Routine B — not a reset to A.
 * So the last segment of each tab is remembered in the state, and `tab` only
 * falls back to the default when that tab has not been visited yet.
 */
export interface ProfileNavState {
  location: ProfileLocation;
  lastProgramming: ProgrammingView | null;
  lastClinical: ClinicalView | null;
  lastSection: DossierSection | null;
}

export function initialNavState(
  location: ProfileLocation = DEFAULT_LOCATION,
): ProfileNavState {
  return {
    location,
    lastProgramming: location.tab === "programming" ? location.view : null,
    lastClinical: location.tab === "clinical" ? location.view : null,
    lastSection: location.tab === "record" ? (location.section ?? null) : null,
  };
}

function remember(state: ProfileNavState, location: ProfileLocation): ProfileNavState {
  return {
    location,
    lastProgramming: location.tab === "programming" ? location.view : state.lastProgramming,
    lastClinical: location.tab === "clinical" ? location.view : state.lastClinical,
    lastSection:
      location.tab === "record" && location.section ? location.section : state.lastSection,
  };
}

export function profileNavReducer(
  state: ProfileNavState,
  action: ProfileNavAction,
): ProfileNavState {
  switch (action.type) {
    case "tab": {
      if (action.tab === state.location.tab) return state;
      return remember(state, enterTab(state, action.tab, action.programmingDefault));
    }
    case "programming":
      return remember(state, { tab: "programming", view: action.view });
    case "clinical":
      return remember(state, { tab: "clinical", view: action.view });
    case "section":
      return remember(state, { tab: "record", section: action.section });
    case "go":
      return remember(state, action.to);
    case "legacy":
      return remember(state, legacyLocation(action.id));
    default:
      return state;
  }
}

function enterTab(
  state: ProfileNavState,
  tab: ProfileTab,
  programmingDefault?: ProgrammingView,
): ProfileLocation {
  switch (tab) {
    case "journey":
      return { tab: "journey" };
    case "programming":
      return {
        tab: "programming",
        view: state.lastProgramming ?? programmingDefault ?? "routine-a",
      };
    case "clinical":
      return { tab: "clinical", view: state.lastClinical ?? "calendar" };
    case "record":
      return { tab: "record", section: state.lastSection ?? undefined };
  }
}

/* ------------------------------------------------------------------ *
 * Resuming
 * ------------------------------------------------------------------ */

/** Exported for sign-out, which clears these one-shot handoffs (features/sign-out). */
export const STORE_PREFIX = "msf_profile_nav:";

/**
 * Where the trainer was on THIS client, last time.
 *
 * Per client, not per app: coming back to Judy should resume Judy's screen,
 * and opening Marcus straight afterwards should not inherit it. Session
 * storage rather than local — a tab left open for a week resuming on last
 * Tuesday's segment is surprise, not service. Every access is wrapped:
 * storage throws in a private window and returns null in the harness.
 */
export function readStoredLocation(clientId: string | null | undefined): ProfileLocation | null {
  if (!clientId) return null;
  try {
    const raw = window.sessionStorage.getItem(STORE_PREFIX + clientId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProfileLocation;
    return isLocation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The handoff, consumed.
 *
 * Fluidity round, Sep 2026 — AJ's call: **a client always opens on Journey.**
 * The stored location stopped being a memory of where the trainer was and
 * became a one-shot INTENT written by a screen that is deliberately sending
 * them somewhere else (Operations -> Machine fit is the only one today). It
 * is read once and removed, so the deep link lands and the next visit to that
 * client is Journey again, like every other visit.
 *
 * Resuming per client read well on paper and badly on a floor: a trainer who
 * had glanced at Programming last Tuesday walked up to the iPad, tapped the
 * client, and got a screen they had not asked for. Predictable beats clever
 * when the thing is held in one hand.
 */
export function takeStoredLocation(clientId: string | null | undefined): ProfileLocation | null {
  const loc = readStoredLocation(clientId);
  if (!clientId) return loc;
  try {
    window.sessionStorage.removeItem(STORE_PREFIX + clientId);
  } catch {
    /* nothing to clear, or storage threw — the location is still honoured. */
  }
  return loc;
}

export function writeStoredLocation(
  clientId: string | null | undefined,
  location: ProfileLocation,
): void {
  if (!clientId) return;
  try {
    window.sessionStorage.setItem(STORE_PREFIX + clientId, JSON.stringify(location));
  } catch {
    /* private window, or storage full — the profile just opens on Journey. */
  }
}

/**
 * Open a client's profile AT a location, from a screen outside the profile.
 *
 * The profile always mounts fresh when it is reached from another view (the
 * Hub, a search result), and on mount it resumes whatever is stored for that
 * client - so storing the location first IS the navigation. Call this, then
 * switch the view to "profile". Used by the Hub's History button, which used
 * to open a separate legacy History screen (deleted in the beta-prep trim,
 * Sep 17 2026) and now lands on Activity Archive -> Sessions.
 */
export function openProfileAt(
  clientId: string | null | undefined,
  location: ProfileLocation,
): void {
  writeStoredLocation(clientId, location);
}

/** Defensive: sessionStorage is user-writable and survives a deploy. */
export function isLocation(v: unknown): v is ProfileLocation {
  if (!v || typeof v !== "object") return false;
  const loc = v as { tab?: unknown; view?: unknown; section?: unknown };
  switch (loc.tab) {
    case "journey":
      return true;
    case "programming":
      return (
        loc.view === "routine-a" ||
        loc.view === "routine-b" ||
        loc.view === "machines" ||
        loc.view === "setup"
      );
    case "clinical":
      return (
        loc.view === "calendar" ||
        loc.view === "sessions" ||
        loc.view === "trends" ||
        loc.view === "reports"
      );
    case "record":
      return loc.section === undefined || typeof loc.section === "string";
    default:
      return false;
  }
}
