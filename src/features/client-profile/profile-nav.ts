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
 * The client codex (Sep 2026) turned Notes & Profile from one long scroll of
 * dossier sections into PAGES — an Overview and six more — so the record
 * tab's position is a page and, optionally, an anchor on it (a card the
 * trainer was sent to). Every dossier section id still lands: see
 * SECTION_TO_PAGE and the legacy table below.
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

/**
 * Notes & Profile's pages (tab id "record") — the client codex, Sep 2026.
 *
 * AJ's order: Overview · Notes · FORD · Body & Pulse · Goals & Focus · Story
 * · Account. The tab always opens on the Overview (AJ's decision 1), and a
 * page is found by position like every other segment, so this order is the
 * order of the sub-toggle and of the neighbour buttons, and it never moves.
 */
export type RecordPage =
  | "overview"
  | "notes"
  | "ford"
  | "body"
  | "goals"
  | "story"
  | "account";

/**
 * The pages, in order, with the line each one's "Next" card reads.
 *
 * The blurbs name no client and use no pronoun, so they read the same for
 * everyone; the pages' own copy is where "she" and "he" appear.
 */
export const RECORD_PAGES: { id: RecordPage; label: string; blurb: string }[] = [
  { id: "overview", label: "Overview", blurb: "Back to the front page" },
  { id: "notes", label: "Notes", blurb: "Every note, as threads: open, standing, resolved" },
  { id: "ford", label: "FORD", blurb: "Family, occupation, recreation, dreams" },
  { id: "body", label: "Body & Pulse", blurb: "How the body is built, what to protect, and the Pulse" },
  { id: "goals", label: "Goals & Focus", blurb: "How to coach, the why, and each coach’s focus" },
  { id: "story", label: "Story", blurb: "Time with Max Strength, moment by moment" },
  { id: "account", label: "Account", blurb: "Contact details, then the membership" },
];

export const RECORD_PAGE_IDS: readonly RecordPage[] = RECORD_PAGES.map((p) => p.id);

export function isRecordPage(v: unknown): v is RecordPage {
  return typeof v === "string" && (RECORD_PAGE_IDS as readonly string[]).includes(v);
}

/**
 * A place ON a page: the id of a card, used as the element id the page puts
 * on it (with `data-cx-anchor`). A string rather than a union because one
 * family is dynamic — `note-{threadId}` opens one thread on Notes.
 *
 * The shape is checked because a location can come back out of
 * sessionStorage, which is user-writable: letters, digits, `_`, `-` and `:`
 * (a thread id can be a synthesised journal id such as
 * `legacy:clinicalIncidents:{id}`), at most 80 characters.
 */
export type RecordAnchor = string;

const ANCHOR_SHAPE = /^[A-Za-z0-9_:-]{1,80}$/;

export function isRecordAnchor(v: unknown): v is RecordAnchor {
  return typeof v === "string" && ANCHOR_SHAPE.test(v);
}

/**
 * THE ANCHOR REGISTRY — every static place a door, a legacy link or the Save
 * bar's "Show" may send a trainer. A page puts `id={anchor}` and
 * `data-cx-anchor` on the card; an anchor that is not on this list is a door
 * that lands on the top of a page instead of the card, which the codex's
 * render test catches once the pages are in.
 *
 * Every id starts with its page's id (the one exception is the dynamic
 * `note-{threadId}`, which belongs to Notes), so `pageOfAnchor()` can answer
 * from the id alone and the test below the registry can hold it to that.
 */
export const RECORD_ANCHORS = [
  // Notes. `note-{threadId}` is the dynamic third: Notes opens that thread.
  "notes-compose",
  "notes-resolved",
  // FORD
  "ford-one-line",
  "ford-coming-up",
  "ford-family",
  "ford-occupation",
  "ford-recreation",
  "ford-dreams",
  "ford-beyond",
  // Body & Pulse
  "body-build",
  "body-training-story",
  "body-watchouts",
  "body-figure",
  "body-floor",
  "body-measured",
  "body-timeline",
  "body-pulse",
  "body-inbody",
  // Goals & Focus
  "goals-coach",
  "goals-why",
  "goals-now",
  "goals-focus",
  "goals-plans",
  "goals-reached",
  // Account
  "account-contact",
  "account-mindbody-notes",
  "account-on-file",
  "account-membership",
  "account-train-at",
  "account-found-us",
  "account-fine-print",
] as const;

/**
 * The dynamic anchor for one thread on Notes.
 *
 * Not every thread id fits the anchor shape. A client event with no id is
 * synthesised as `legacy:clientEvents:{date}{title}` (useClientJournal), so
 * its id can carry spaces and run past 80 characters; `isRecordAnchor` then
 * refuses the anchor and `recordLocation` drops it, and the door opens Notes
 * at its top instead of the thread. A door to one thread checks
 * `isRecordAnchor(noteAnchor(id))` first, and offers the page when it fails.
 */
export const noteAnchor = (threadId: string): RecordAnchor => `note-${threadId}`;

/**
 * Which page an anchor lives on, read from its prefix. Null when the id
 * follows no page's prefix — the caller's page then stands.
 */
export function pageOfAnchor(anchor: RecordAnchor): RecordPage | null {
  if (anchor.startsWith("note-")) return "notes";
  const dash = anchor.indexOf("-");
  if (dash <= 0) return null;
  const prefix = anchor.slice(0, dash);
  return isRecordPage(prefix) ? prefix : null;
}

/**
 * The page before and after this one, for the neighbour buttons and the Next
 * card. The Overview has no "before"; Account's "next" is back to the
 * Overview, and the card says Done rather than Next.
 */
export function neighbours(page: RecordPage): {
  prev: RecordPage | null;
  next: RecordPage;
  nextIsDone: boolean;
} {
  const i = RECORD_PAGE_IDS.indexOf(page);
  const last = RECORD_PAGE_IDS.length - 1;
  return {
    prev: i > 0 ? RECORD_PAGE_IDS[i - 1] : null,
    next: i >= 0 && i < last ? RECORD_PAGE_IDS[i + 1] : "overview",
    nextIsDone: i === last,
  };
}

export type ProfileLocation =
  | { tab: "journey" }
  | { tab: "programming"; view: ProgrammingView }
  | { tab: "record"; page?: RecordPage; anchor?: RecordAnchor }
  | { tab: "clinical"; view: ClinicalView };

/**
 * The record arm as it was stored before the client codex: a dossier section.
 * Only ever READ (a one-shot handoff written by an older bundle can outlive a
 * deploy in sessionStorage) and normalised straight away — see
 * normalizeLocation. Nothing writes this shape any more.
 */
export type LegacyRecordLocation = { tab: "record"; section?: string };

/** Anything `isLocation` accepts: today's shapes, or the pre-codex record arm. */
export type StoredProfileLocation = ProfileLocation | LegacyRecordLocation;

/**
 * A record location, built safely: an anchor that is malformed, or that names
 * a DIFFERENT page, is dropped (the page still opens, at its top), and no key
 * is ever `undefined` — the location is JSON in sessionStorage.
 *
 * The drop is silent, so a door mapped to the wrong page's card would land on
 * the right page's top without anyone noticing. Every table of doors (a
 * page's own, the Overview's, a field's home) therefore asserts in its test
 * that `recordLocation(page, anchor).anchor === anchor` for each entry.
 */
export function recordLocation(page: RecordPage, anchor?: RecordAnchor | null): ProfileLocation {
  if (!anchor || !isRecordAnchor(anchor)) return { tab: "record", page };
  const home = pageOfAnchor(anchor);
  if (home && home !== page) return { tab: "record", page };
  return { tab: "record", page, anchor };
}

/**
 * Every dossier section (the long scroll's eight, still the type a journal
 * entry may carry as `profileSection`) onto its page and card. `reports` was
 * the section titled Pulse, which is Body & Pulse now; `general` was "Who
 * they are", which is Account's contact card; `admin` is the membership.
 */
export const SECTION_TO_PAGE: Record<DossierSection, { page: RecordPage; anchor?: RecordAnchor }> = {
  notes: { page: "notes" },
  general: { page: "account", anchor: "account-contact" },
  life: { page: "ford" },
  medical: { page: "body", anchor: "body-watchouts" },
  goals: { page: "goals" },
  focus: { page: "goals", anchor: "goals-focus" },
  reports: { page: "body", anchor: "body-pulse" },
  admin: { page: "account", anchor: "account-membership" },
};

function isDossierSection(v: string): v is DossierSection {
  return Object.prototype.hasOwnProperty.call(SECTION_TO_PAGE, v);
}

/** A dossier section as a location. */
export function sectionLocation(section: DossierSection): ProfileLocation {
  const to = SECTION_TO_PAGE[section];
  return to ? recordLocation(to.page, to.anchor) : recordLocation("overview");
}

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
 *
 * The record's ids land on a codex PAGE (and a card, where one helps) since
 * Sep 2026. "details" and "profile" were the old Details tab — the whole
 * profile — so they open the Overview; "identity" and "general" were its ID
 * card, which is Account's contact card. `reports` still means the filed
 * shelf in the Activity Archive; the dossier section that shared that id
 * (Pulse) is reached through SECTION_TO_PAGE, never through this table.
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

    case "overview":
    case "codex":
    case "record":
    case "details":
    case "profile":
      return recordLocation("overview");
    case "journal":
    case "notes":
      return recordLocation("notes");
    case "identity":
    case "general":
      return recordLocation("account", "account-contact");
    case "life":
    case "lifestyle":
    case "ford":
    case "events":
      return recordLocation("ford");
    case "medical":
      return recordLocation("body", "body-watchouts");
    case "body":
      return recordLocation("body");
    case "pulse":
    case "check-in":
    case "assessment":
      return recordLocation("body", "body-pulse");
    case "goals":
      return recordLocation("goals");
    case "focus":
      return recordLocation("goals", "goals-focus");
    case "story":
      return recordLocation("story");
    case "account":
      return recordLocation("account");
    case "admin":
    case "membership":
    case "contract":
      return recordLocation("account", "account-membership");

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
  /** Open Notes & Profile at a page, and optionally at a card on it. */
  | { type: "record"; page: RecordPage; anchor?: RecordAnchor }
  /** The pre-codex door: a dossier section, landed through SECTION_TO_PAGE. */
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
 *
 * Notes & Profile is the exception, on purpose (AJ's decision 1, client
 * codex): entering it ALWAYS opens the Overview, the front page of the
 * record, and nothing else about it is remembered. A deep link still lands on
 * its page — that is a `record` action, not a tab tap.
 */
export interface ProfileNavState {
  location: ProfileLocation;
  lastProgramming: ProgrammingView | null;
  lastClinical: ClinicalView | null;
}

export function initialNavState(
  location: ProfileLocation = DEFAULT_LOCATION,
): ProfileNavState {
  return {
    location,
    lastProgramming: location.tab === "programming" ? location.view : null,
    lastClinical: location.tab === "clinical" ? location.view : null,
  };
}

function remember(state: ProfileNavState, location: ProfileLocation): ProfileNavState {
  return {
    location,
    lastProgramming: location.tab === "programming" ? location.view : state.lastProgramming,
    lastClinical: location.tab === "clinical" ? location.view : state.lastClinical,
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
    case "record":
      return remember(state, recordLocation(action.page, action.anchor));
    case "section":
      return remember(state, sectionLocation(action.section));
    case "go":
      return remember(state, normalizeLocation(action.to));
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
      return recordLocation("overview");
  }
}

/**
 * Any stored or handed-over location, in today's shape.
 *
 * The record arm is the one that changed: a pre-codex `{ tab: "record",
 * section }` lands on that section's page and card (SECTION_TO_PAGE, then the
 * legacy table for an id that was never a section), and a record location
 * with no page opens the page its anchor names, else the Overview. Every
 * other tab passes through untouched.
 */
export function normalizeLocation(loc: StoredProfileLocation): ProfileLocation {
  if (loc.tab !== "record") return loc;
  const { page, anchor } = loc as { page?: unknown; anchor?: unknown };
  const section = (loc as { section?: unknown }).section;
  const cleanAnchor = isRecordAnchor(anchor) ? anchor : undefined;

  if (isRecordPage(page)) return recordLocation(page, cleanAnchor);

  if (page === undefined && cleanAnchor) {
    return recordLocation(pageOfAnchor(cleanAnchor) ?? "overview", cleanAnchor);
  }

  if (page === undefined && typeof section === "string" && section) {
    if (isDossierSection(section)) return sectionLocation(section);
    const legacy = legacyLocation(section);
    if (legacy.tab === "record") return legacy;
  }

  return recordLocation("overview");
}

/* ------------------------------------------------------------------ *
 * Resuming
 * ------------------------------------------------------------------ */

const STORE_PREFIX = "msf_profile_nav:";

/**
 * Where the trainer was on THIS client, last time.
 *
 * Per client, not per app: coming back to Judy should resume Judy's screen,
 * and opening Marcus straight afterwards should not inherit it. Session
 * storage rather than local — a tab left open for a week resuming on last
 * Tuesday's segment is surprise, not service. Every access is wrapped:
 * storage throws in a private window and returns null in the harness.
 *
 * A handoff written by an older bundle can outlive a deploy, so what comes
 * back is normalised: a pre-codex `{ tab: "record", section: "medical" }`
 * opens Body & Pulse at the watch-outs.
 */
export function readStoredLocation(clientId: string | null | undefined): ProfileLocation | null {
  if (!clientId) return null;
  try {
    const raw = window.sessionStorage.getItem(STORE_PREFIX + clientId);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isLocation(parsed) ? normalizeLocation(parsed) : null;
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

/**
 * Defensive: sessionStorage is user-writable and survives a deploy.
 *
 * The record arm accepts today's `{ page?, anchor? }` — a known page, a
 * well-formed anchor — and, so a handoff written before the client codex
 * still lands, the old `{ section }` string. Pass what this accepts through
 * normalizeLocation before using it.
 */
export function isLocation(v: unknown): v is StoredProfileLocation {
  if (!v || typeof v !== "object") return false;
  const loc = v as {
    tab?: unknown;
    view?: unknown;
    section?: unknown;
    page?: unknown;
    anchor?: unknown;
  };
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
      return (
        (loc.page === undefined || isRecordPage(loc.page)) &&
        (loc.anchor === undefined || isRecordAnchor(loc.anchor)) &&
        (loc.section === undefined || typeof loc.section === "string")
      );
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ *
 * TEMPORARY — the long scroll's landing (client codex, phase 3)
 * ------------------------------------------------------------------ */

/**
 * Until the codex shell replaces it, Notes & Profile is still the one long
 * scroll of dossier sections (ClientInfoSheet → ClientDossier), which lands
 * on a SECTION. These two tables turn a page and anchor back into the section
 * that holds that content today, so every door still scrolls to the right
 * place. The shell phase deletes both, with the scroll.
 *
 * The Overview and Story have no section of their own: they land where the
 * tab has always opened (Notes, the top of the spine). Training story lives
 * in Life on the long scroll; the membership, the cross-studio access, how
 * they found us and the fine print are all in Admin.
 */
export const PAGE_TO_SECTION: Record<RecordPage, DossierSection | undefined> = {
  overview: undefined,
  notes: "notes",
  ford: "life",
  body: "medical",
  goals: "goals",
  story: undefined,
  account: "general",
};

const ANCHOR_TO_SECTION: Readonly<Record<string, DossierSection>> = {
  "body-training-story": "life",
  "body-pulse": "reports",
  "goals-focus": "focus",
  "account-membership": "admin",
  "account-train-at": "admin",
  "account-found-us": "admin",
  "account-fine-print": "admin",
};

/** The dossier section the long scroll should land on for this page and card. */
export function sectionForRecord(
  page: RecordPage,
  anchor?: RecordAnchor,
): DossierSection | undefined {
  if (anchor && Object.prototype.hasOwnProperty.call(ANCHOR_TO_SECTION, anchor)) {
    return ANCHOR_TO_SECTION[anchor];
  }
  return PAGE_TO_SECTION[page];
}
