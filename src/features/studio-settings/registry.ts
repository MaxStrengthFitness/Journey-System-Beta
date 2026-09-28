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
  | "newMax"
  | "settlingMax"
  | "deepCleanDays"
  | "wipeAfterSessions"
  | "weeklyMaintenanceDay";

export type SettingGroup = "relay" | "journey" | "care";

export type SettingKind =
  /** A whole number between min and max. */
  | "count"
  /** A number of days, a whole number between min and max. */
  | "days"
  /** A number with one decimal place, between min and max. */
  | "multiple"
  /** A day of the week (0 = Sunday … 6 = Saturday), or none. */
  | "weekday";

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
  /** The app's own value, used until head office or the studio sets one. `null` means "none" (weekday only). */
  appDefault: number | null;
  /** One sentence: what changes when it changes. */
  help: string;
  /** The code that reads it (every number has a reader). */
  readers: string[];
  /**
   * A field on the studio's own document that held this before the settings
   * existed, read as the studio's value when its settings document has none:
   * the studio's day panel still edits it there (one editor, not two).
   */
  legacyStudioField?: "deepCleanIntervalDays";
}

export const GROUP_LABEL: Record<SettingGroup, string> = {
  relay: "Relay",
  journey: "Where a client is (Operations → Clients → Journey)",
  care: "The machines' care (Relay's Floor Map)",
};

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
    help: "Relay's Right now calls the floor quiet at this many sessions or fewer, and points a trainer with a gap at the jobs that take a while.",
    readers: ["features/relay/board/right-now.ts"],
  },
  {
    key: "driftMultiple",
    group: "journey",
    label: "Drifting at",
    unit: "times her usual gap, with nothing booked",
    kind: "multiple",
    min: 1.2,
    max: 5,
    appDefault: 2,
    help: "A client is Drifting once she has been away this many times her usual gap between visits and has nothing booked.",
    readers: ["features/admin/journey/states.ts"],
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
    help: "However short her usual gap, Drifting waits at least this many days.",
    readers: ["features/admin/journey/states.ts"],
  },
  {
    key: "lapsedDays",
    group: "journey",
    label: "Lapsed after",
    unit: "days since her last visit, with nothing booked",
    kind: "days",
    min: 14,
    max: 365,
    appDefault: 45,
    help: "A client with nothing booked this long after her last visit is Lapsed. A client Journey can't judge yet is never Lapsed.",
    readers: ["features/admin/journey/states.ts"],
  },
  {
    key: "newMax",
    group: "journey",
    label: "New, up to session",
    kind: "count",
    min: 1,
    max: 50,
    appDefault: 10,
    help: "A client is New until this session, counted from her whole history, never from Journey's alone.",
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
];

export const SETTING_BY_KEY: Record<SettingKey, SettingDef> = Object.fromEntries(
  SETTINGS.map((d) => [d.key, d]),
) as Record<SettingKey, SettingDef>;

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
