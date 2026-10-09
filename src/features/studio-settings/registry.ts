/**
 * THE STUDIO SETTINGS — every number a studio may set for itself, with a
 * company default head office sets in the app.
 *
 * AJ, Sep 28 2026: "let the admins assign the default within the app". Until
 * then each of these was a constant in the code ("2 sessions or fewer is a
 * quiet floor", "Lapsed at 45 days"), and the rooms that read them waited on
 * a place to store a studio's own. Now there are three layers, and the first
 * that holds a usable value wins:
 *
 *   this studio's own        studios/{s}/config/settings   its leaders
 *   Max Strength's default   system/studioDefaults          administrators
 *   the app's default        APP_DEFAULT below              the code
 *
 * `resolve.ts` is the one answer to "what is this studio's value, and where
 * did it come from"; the admins' page (Admins → Standard → Studio defaults)
 * and the studio's own panel (My Studio → Studio → This studio's settings)
 * write the first two. Every setting names its reader, because every number
 * has one (docs/business/data-and-metrics.md).
 *
 * The keys are stored as they are written here, inside one `values` map per
 * document: plain words, no dots, so a key is never mistaken for a path.
 */

export type SettingKey =
  | "quietFloorSessions"
  | "driftMultiple"
  | "driftMinDays"
  | "lapsedDays"
  | "inactiveDays"
  | "newMax"
  | "settlingMax"
  | "deepCleanDays"
  | "wipeAfterSessions"
  | "weeklyMaintenanceDay"
  | "inbodyEverySessions"
  | "newClientsStart";

export type SettingGroup = "relay" | "journey" | "care" | "inbody" | "newClients";

export type SettingKind =
  /** A whole number between min and max. */
  | "count"
  /** A number of days, a whole number between min and max. */
  | "days"
  /** A number with one decimal place, between min and max. */
  | "multiple"
  /** A day of the week (0 = Sunday … 6 = Saturday), or none. */
  | "weekday"
  /**
   * One of a few named choices (`choices`), stored as the choice's number,
   * so its value is a number like every other setting's: the rules, the
   * store and the resolver stay as they were.
   */
  | "choice";

/** One of a "choice" setting's choices: the number stored, its words, and one line under them. */
export interface SettingChoice {
  value: number;
  label: string;
  sub?: string;
}

export interface SettingDef {
  key: SettingKey;
  group: SettingGroup;
  /** The label, as a studio leader reads it. */
  label: string;
  /** Words after the number ("sessions or fewer"). */
  unit?: string;
  kind: SettingKind;
  min?: number;
  max?: number;
  /** A "choice" setting's choices, in the order the editors draw them. */
  choices?: readonly SettingChoice[];
  /** The app's own value, used until head office or the studio sets one. `null` means "none" (weekday only). */
  appDefault: number | null;
  /** One sentence: what changes when it changes. */
  help: string;
  /** The code that reads it (every number has a reader). */
  readers: string[];
  /**
   * A field on the studio's own document that held this before the settings
   * existed, read as the studio's value when its settings document has none.
   * Nothing edits it since Sep 28 2026 (This studio's settings is the one
   * editor), and clearing the setting there clears the field too.
   */
  legacyStudioField?: "deepCleanIntervalDays";
}

export const GROUP_LABEL: Record<SettingGroup, string> = {
  relay: "Relay",
  journey: "Where a client is (Operations → Clients → Journey)",
  care: "The machines' care (Relay's Floor Map)",
  inbody: "InBody scans (the briefing and the InBody card)",
  newClients: "New clients",
};

/** The order the editors show the groups in. */
export const GROUP_ORDER: readonly SettingGroup[] = ["relay", "journey", "care", "inbody", "newClients"];

export const SETTINGS: readonly SettingDef[] = [
  {
    key: "quietFloorSessions",
    group: "relay",
    label: "A quiet floor",
    unit: "sessions running or starting soon, or fewer",
    kind: "count",
    min: 0,
    max: 12,
    appDefault: 2,
    help: "Relay's Board calls the floor quiet at this many sessions or fewer, and says it's a good time for floor work.",
    readers: ["features/relay/board/right-now.ts"],
  },
  {
    key: "driftMultiple",
    group: "journey",
    label: "Drifting at",
    unit: "times the usual gap, with nothing booked",
    kind: "multiple",
    min: 1.2,
    max: 5,
    appDefault: 2,
    help: "A client is Drifting after being away this many times the usual gap between visits, with nothing booked.",
    readers: ["features/admin/journey/states.ts", "features/machine-menu/timeline-model.ts"],
  },
  {
    key: "driftMinDays",
    group: "journey",
    label: "…but never under",
    unit: "days",
    kind: "days",
    min: 3,
    max: 60,
    appDefault: 7,
    help: "However short the usual gap, Drifting waits at least this many days.",
    readers: ["features/admin/journey/states.ts", "features/machine-menu/timeline-model.ts"],
  },
  {
    key: "lapsedDays",
    group: "journey",
    label: "Lapsed after",
    unit: "days since the last visit, with nothing booked",
    kind: "days",
    min: 14,
    max: 365,
    appDefault: 45,
    help: "A client with nothing booked this long after the last visit is Lapsed. A client Journey can't judge yet is never Lapsed.",
    readers: ["features/admin/journey/states.ts"],
  },
  {
    // The inactive round, Oct 1 2026. AJ: "studios can customize time or
    // manually set clients inactive"; the 90 days with nothing booked was
    // his pick ("I like your idea"). It must be past the Lapsed line:
    // resolve.ts skips a value that isn't, and both editors refuse one.
    key: "inactiveDays",
    group: "journey",
    label: "Inactive after",
    unit: "days since the last visit, with nothing booked",
    kind: "days",
    min: 30,
    max: 730,
    appDefault: 90,
    help: "A client with nothing booked this long after the last visit becomes Inactive, and the nightly job stops asking Mindbody about that client's packages every month. It must be more than Lapsed's. A booking makes the client active again; a client Journey can't judge is never made Inactive.",
    readers: ["features/admin/journey/states.ts", "features/renewals/job-plan.ts", "features/client-directory/views.ts"],
  },
  {
    key: "newMax",
    group: "journey",
    label: "New, up to session",
    kind: "count",
    min: 1,
    max: 50,
    appDefault: 10,
    help: "A client is New until this session, counted from the client's whole history, never from Journey's alone.",
    readers: ["features/admin/journey/states.ts"],
  },
  {
    key: "settlingMax",
    group: "journey",
    label: "Settling in, up to session",
    kind: "count",
    min: 2,
    max: 100,
    appDefault: 24,
    help: "After New, a client is Settling in until this session. It must be more than New's.",
    readers: ["features/admin/journey/states.ts"],
  },
  {
    key: "deepCleanDays",
    group: "care",
    label: "Deep clean every",
    unit: "days (1 is a daily deep clean)",
    kind: "days",
    min: 1,
    max: 365,
    appDefault: 14,
    help: "How often each machine is due a deep clean on Relay's Floor Map.",
    readers: ["features/relay/board/machine-care.ts"],
    legacyStudioField: "deepCleanIntervalDays",
  },
  {
    key: "wipeAfterSessions",
    group: "care",
    label: "Wipe after",
    unit: "sessions on the machine",
    kind: "count",
    min: 1,
    max: 20,
    appDefault: 4,
    help: "A machine wants a wipe once this many sessions have used it since the last one.",
    readers: ["features/relay/board/machine-care.ts"],
  },
  {
    key: "weeklyMaintenanceDay",
    group: "care",
    label: "Weekly maintenance on",
    kind: "weekday",
    appDefault: null,
    help: "The day each week the studio does its machine maintenance, or none.",
    readers: ["features/relay/board/machine-care.ts"],
  },
  {
    // FileMaker parity, Oct 1 2026. AJ: "up to the studio or even that
    // client" -- a client's own number (clients/{id}.inbodyEvery) comes first.
    key: "inbodyEverySessions",
    group: "inbody",
    label: "An InBody scan is due after",
    unit: "sessions since the last one",
    kind: "count",
    min: 4,
    max: 200,
    appDefault: 50,
    help: "The briefing's Before you start says a client is due an InBody once this many sessions have passed since the last scan. A client's own number is set on Body & Pulse → InBody.",
    readers: ["features/inbody/due.ts"],
  },
  {
    // The first-session design round, Round 2, item 8. AJ, Oct 7 2026: "Some
    // studios may start building an A and B routine immediately for a
    // client. So we need to be able to have that customization." The
    // research named it startingRoutines ("A" | "AB"); that name went to the
    // studio's choice of starting routines (studios/{s}/config/
    // startingRoutines), so this one is newClientsStart. A number like every
    // other setting: 1 is A alone, the Academy's way and Max Strength's
    // default; 2 is A and B together.
    key: "newClientsStart",
    group: "newClients",
    label: "A new client starts with",
    kind: "choice",
    choices: [
      { value: 1, label: "A alone", sub: "The Academy's way. B is planned later, from Routine A." },
      { value: 2, label: "A and B together", sub: "B starts as A with one machine different." },
    ],
    appDefault: 1,
    help: "With A and B together, Start a plan and the briefing plan Routine B beside Routine A, and the first visit's Wrap-up starts B with Routine A.",
    // Read by the profile and the briefing (through useNewClientsStart, which
    // tells a value that answered from one still loading or not read), for the
    // two screens that act on it.
    readers: [
      "features/routine-plan/ui/useNewClientsStart.ts",
      "components/ClientProfileView.tsx",
      "features/routine-plan/ui/StartPlanPanel.tsx",
      "features/briefing/BriefingScreen.tsx",
      "features/routine-plan/ui/useBriefingPlan.ts",
    ],
  },
];

/** `newClientsStart`'s two choices by name, so a reader never writes the bare number. */
export const NEW_CLIENTS_START = { aAlone: 1, aAndB: 2 } as const;

export const SETTING_BY_KEY: Record<SettingKey, SettingDef> = Object.fromEntries(
  SETTINGS.map((d) => [d.key, d]),
) as Record<SettingKey, SettingDef>;

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
