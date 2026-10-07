/**
 * OPERATIONS' PLACES — the five destinations, the pages inside each, and
 * where a leader was. Pure: places.test.ts.
 *
 * The Operations room of the redesign (Sep 28 2026; the pick "Brief +
 * Journey", AJ took it with every default). Nine tabs sorted by kind of data
 * became five destinations sorted by a leader's job:
 *
 *   Today     the brief: what needs you, who to catch, what changed
 *   Week      last week's review, this week so far (with its
 *             cancellations and moves), the week ahead (phase 5)
 *   Month     a given month's renewals, birthdays and anniversaries, and
 *             who is MIA today (Sep 29 2026, AJ: "what do I need to
 *             worry about today, this week and this month")
 *   Ahead     everything past this week on one scroll: each client's dates
 *             on the week they land, and every client's two clocks on one
 *             line (Oct 7 2026, AJ: "1b", beside Month; admin/ahead/)
 *   Clients   the Journey (where each client is, against her own rhythm;
 *             phase 4), Renewals, Moments (the Delight queue) and Trends
 *             (the quarter's lines over the Insights screen; phase 5)
 *   Team      this week (each trainer in today's schedule order, the
 *             leaders-only renewal counts; phase 6) and Hours
 *   Setup     how the studio is set up: Floor, People & access (Staff &
 *             Roles), Announcements, Mindbody, Data, and the Rules behind
 *             every sentence (phase 3)
 *
 * AJ's question 1 took the default: the fifth place is "Setup", because
 * "Studio" would clash with My Studio. Question 2's default moved Renewals
 * and the Delight queue under Clients as full screens, the same screens,
 * moved. Every tab's screen is mounted as it was (research-operations §6.2).
 *
 * Why these live in one pure file: the sidebar, the tabs across the top, the
 * shell's page switch, the doors from one page to another and the memory of
 * where a leader was all ask the same list, so they can never disagree about
 * which pages exist. A page id a later round retires still resolves (to the
 * destination's first page), so a remembered place never opens nothing.
 */

export type OpsPage = "today" | "week" | "month" | "ahead" | "clients" | "team" | "setup";

export interface OpsSubDef {
  id: string;
  label: string;
}

export interface OpsPageDef {
  id: OpsPage;
  label: string;
  /**
   * The pages inside, in order. Today has none. Setup opens on its own list
   * (a settings-style menu) until one is picked, so it has no default.
   */
  subs: OpsSubDef[];
}

/** The destinations, in the order the menu shows them. */
export const OPS_PAGES: readonly OpsPageDef[] = [
  { id: "today", label: "Today", subs: [] },
  {
    id: "week",
    label: "Week",
    subs: [
      { id: "last", label: "Last week" },
      { id: "now", label: "This week so far" },
      { id: "ahead", label: "Week ahead" },
    ],
  },
  { id: "month", label: "Month", subs: [] },
  { id: "ahead", label: "Ahead", subs: [] },
  {
    id: "clients",
    label: "Clients",
    subs: [
      { id: "journey", label: "Journey" },
      { id: "renewals", label: "Renewals" },
      { id: "moments", label: "Moments" },
      { id: "trends", label: "Trends" },
    ],
  },
  {
    id: "team",
    label: "Team",
    subs: [
      { id: "week", label: "This week" },
      { id: "hours", label: "Hours" },
    ],
  },
  {
    id: "setup",
    label: "Setup",
    subs: [
      { id: "floor", label: "Floor" },
      { id: "people", label: "People & access" },
      { id: "announcements", label: "Announcements" },
      { id: "mindbody", label: "Mindbody" },
      { id: "data", label: "Data" },
      { id: "rules", label: "Rules" },
    ],
  },
];

/** Where a leader is: the destination, and the page inside it (null for Today and Setup's list). */
export interface OpsPlace {
  page: OpsPage;
  sub: string | null;
}

export const HOME_PLACE: OpsPlace = { page: "today", sub: null };

export function pageDef(page: OpsPage): OpsPageDef {
  return OPS_PAGES.find((p) => p.id === page) ?? OPS_PAGES[0];
}

const isPage = (v: unknown): v is OpsPage => typeof v === "string" && OPS_PAGES.some((p) => p.id === v);

/**
 * The page a destination opens on when nothing inside it is asked for: its
 * first. Setup opens on its own list, so it has no default page.
 */
export function defaultSub(page: OpsPage): string | null {
  if (page === "setup" || page === "today" || page === "month" || page === "ahead") return null;
  return pageDef(page).subs[0]?.id ?? null;
}

/**
 * A place made safe to open: an unknown destination is Today, an unknown or
 * missing page inside one is its default (Setup's list), and Today never has
 * a page inside it.
 */
export function resolvePlace(place: Partial<OpsPlace> | null | undefined): OpsPlace {
  const page = isPage(place?.page) ? place.page : "today";
  if (page === "today") return HOME_PLACE;
  if (page === "month" || page === "ahead") return { page, sub: null };
  const def = pageDef(page);
  const sub = typeof place?.sub === "string" && def.subs.some((s) => s.id === place.sub) ? place.sub : defaultSub(page);
  return { page, sub };
}

/** One key per place, for the scroll memory and a remount. */
export function placeKey(place: OpsPlace): string {
  return place.sub ? `${place.page}:${place.sub}` : place.page;
}

export function samePlace(a: OpsPlace, b: OpsPlace): boolean {
  return a.page === b.page && (a.sub ?? null) === (b.sub ?? null);
}

/** "Clients · Renewals", "Today", "Setup" — where a Back button says it goes. */
export function placeLabel(place: OpsPlace): string {
  const def = pageDef(place.page);
  const sub = place.sub ? def.subs.find((s) => s.id === place.sub) : null;
  return sub ? `${def.label} · ${sub.label}` : def.label;
}

/**
 * THE OLD TAB IDS, still answered. The Overview's doors were written against
 * the nine tabs ("renewals", "delight", "insights", "floor"); each now opens
 * the page the tab's screen moved to.
 */
export type LegacyTab = "overview" | "renewals" | "delight" | "floor" | "users" | "insights" | "announcements" | "mindbody" | "data" | "hours";

export const LEGACY_TAB_PLACE: Record<LegacyTab, OpsPlace> = {
  overview: HOME_PLACE,
  renewals: { page: "clients", sub: "renewals" },
  delight: { page: "clients", sub: "moments" },
  insights: { page: "clients", sub: "trends" },
  hours: { page: "team", sub: "hours" },
  floor: { page: "setup", sub: "floor" },
  users: { page: "setup", sub: "people" },
  announcements: { page: "setup", sub: "announcements" },
  mindbody: { page: "setup", sub: "mindbody" },
  data: { page: "setup", sub: "data" },
};

/**
 * A DOOR on one page to another: every old tab id, the week's changes
 * (Today's "All changes"), the Journey and the team this week.
 */
export type OpsDoor = LegacyTab | "week" | "month" | "ahead" | "journey" | "team";

export const DOOR_PLACE: Record<OpsDoor, OpsPlace> = {
  ...LEGACY_TAB_PLACE,
  week: { page: "week", sub: "now" },
  month: { page: "month", sub: null },
  ahead: { page: "ahead", sub: null },
  journey: { page: "clients", sub: "journey" },
  team: { page: "team", sub: "week" },
};

/**
 * The places a switch between pages would unmount. Opening the page already
 * on screen changes nothing and never asks the leave question.
 */
export function placeChanges(from: OpsPlace, to: OpsPlace): boolean {
  return !samePlace(from, to);
}
