/**
 * THE ADMINS DASHBOARD'S MAP — which pages exist, which place each belongs
 * to, and what each is called. PURE: no React, no Firestore.
 *
 * Round: the Admins room of the redesign (Sep 28 2026), AJ's pick "Command
 * Center". The seven tabs of the Operations overhaul (Sep 19) sat in two
 * groups on a strip that needed about 1,000px in portrait and got about 724,
 * so Bug reports and Data started off screen. Now the pages sit in PLACES,
 * never more than four, which fit a portrait bar with room to spare, and a
 * landscape sidebar lists every page under its place's name — two levels at
 * most, Apple's limit for a sidebar.
 *
 *   place     a portrait bar button, and a sidebar group
 *   page      what the main column shows; every page belongs to one place
 *
 * A page that is reached from inside another (a studio's own page, reached
 * from All studios) lights the sidebar item it came from (`navKeyOf`).
 *
 * The pages are the screens that already existed, moved not rewritten, plus
 * what this room adds. "Waiting for review" is a place held open for the
 * review queue AJ asked for ("sharing with all MSF studios should submit to
 * admins first for review, we can review in admin dashboard"), which is being
 * built beside this room; until it is mounted the page says so.
 */

export type AdminsPlace = "home" | "studios" | "standard" | "machinery";

export type AdminsPage =
  | "home"
  | "studios"
  | "studio"
  | "franchises"
  | "machines"
  | "template"
  | "review"
  | "limbo"
  | "sync"
  | "bugs"
  | "data"
  | "system"
  | "activity";

/** A page a person can pick from the sidebar or a place's chips. A studio's
 *  own page is reached from All studios (or the search), so it is not one. */
export type AdminsNavPage = Exclude<AdminsPage, "studio">;

export interface AdminsNavItem {
  page: AdminsNavPage;
  label: string;
}

export interface AdminsNavGroup {
  place: AdminsPlace;
  /** The group's name in the sidebar; Home has none, it is one item. */
  label: string | null;
  items: AdminsNavItem[];
}

/** The sidebar, top to bottom, and each place's chips in portrait. */
export const ADMINS_NAV: readonly AdminsNavGroup[] = [
  { place: "home", label: null, items: [{ page: "home", label: "Home" }] },
  {
    place: "studios",
    label: "Studios",
    items: [
      { page: "studios", label: "All studios" },
      { page: "franchises", label: "Franchises" },
    ],
  },
  {
    place: "standard",
    label: "The MSF standard",
    items: [
      { page: "machines", label: "Machines" },
      { page: "template", label: "Standard template" },
      { page: "review", label: "Waiting for review" },
    ],
  },
  {
    place: "machinery",
    label: "The machinery",
    items: [
      { page: "limbo", label: "Limbo" },
      { page: "sync", label: "Mindbody sync" },
      { page: "bugs", label: "Bug reports" },
      { page: "data", label: "Data" },
      { page: "system", label: "System tools" },
      // The Activity record (the second wave, Sep 28 2026): who changed what from here.
      { page: "activity", label: "Activity" },
    ],
  },
];

/** The places of the portrait bar, and the page each opens on. */
export const ADMINS_PLACES: readonly { place: AdminsPlace; label: string; opens: AdminsNavPage }[] = [
  { place: "home", label: "Home", opens: "home" },
  { place: "studios", label: "Studios", opens: "studios" },
  { place: "standard", label: "Standard", opens: "machines" },
  { place: "machinery", label: "Machinery", opens: "limbo" },
];

/** Where the Admins dashboard opens: what needs you. */
export const ADMINS_START: AdminsNavPage = "home";

/** The sidebar item a page lights: a studio's own page lights All studios. */
export function navKeyOf(page: AdminsPage): AdminsNavPage {
  return page === "studio" ? "studios" : page;
}

/** Which place a page belongs to. */
export function placeOf(page: AdminsPage): AdminsPlace {
  const key = navKeyOf(page);
  for (const group of ADMINS_NAV) {
    if (group.items.some((item) => item.page === key)) return group.place;
  }
  return ADMINS_NAV[0].place;
}

/** A page's name, as the sidebar says it. */
export function labelOf(page: AdminsPage): string {
  if (page === "studio") return "Studio";
  for (const group of ADMINS_NAV) {
    const item = group.items.find((i) => i.page === page);
    if (item) return item.label;
  }
  return page;
}

/** The pages of one place, for its chips in portrait. */
export function pagesOf(place: AdminsPlace): AdminsNavItem[] {
  return ADMINS_NAV.find((g) => g.place === place)?.items ?? [];
}

/** Every page a person can pick, in sidebar order. */
export function allNavPages(): AdminsNavPage[] {
  return ADMINS_NAV.flatMap((g) => g.items.map((i) => i.page));
}
