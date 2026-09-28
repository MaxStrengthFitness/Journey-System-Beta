/**
 * WHERE EACH STUDIO STANDS — grouped by what Journey knows today.
 * PURE: no React, no Firestore.
 *
 * Round: the Admins room (Sep 28 2026). The design grouped studios by a
 * STAGE — setting up, handed over, running — and a stage is not recorded
 * anywhere (it would be a new field, which waits for AJ's OK). So the groups
 * here are built from the two facts every studio document already carries,
 * and the screen says that is what they are:
 *
 *   the Mindbody link        linked with a Site ID (and a location when the
 *                            site is shared), offline on purpose, or marked
 *                            linked with something missing (registry.ts's
 *                            mindbodyLinkState, the one rule for it)
 *   the Journey cutover      the day the studio moved onto Journey
 *                            (`journeyCutoverDate`, yyyy-mm-dd, in the
 *                            studio's own day): none yet, still to come,
 *                            or passed
 *
 * AJ, Sep 28 2026, on the studios opening: "the studios are open we are just
 * more talking a migration period, studios are slowly opening". So a missing
 * cutover date is said plainly, never as a fault: it is where every studio is
 * until it moves over.
 *
 * THE REALM RULE: the practice studio is listed in a group of its own, never
 * among the real studios.
 */
import type { FranchiseNetwork, Studio } from "../../../types";
import { isDemoStudio } from "../../demo-mode/is-demo";
import { DEFAULT_TIME_ZONE, isValidTimeZone, studioTodayKey } from "../../../lib/studio-time";
import { mindbodyLinkState, type MindbodyLinkState } from "../../admin/studios/registry";
import type { HqTone } from "../kit";

export type StudioStage = "needs-mindbody" | "offline" | "no-cutover" | "cutover-coming" | "on-journey" | "demo";

/** The groups, in the order All studios lists them: what needs a person first. */
export const STAGE_ORDER: readonly StudioStage[] = ["needs-mindbody", "offline", "no-cutover", "cutover-coming", "on-journey", "demo"];

export const STAGE_TEXT: Record<StudioStage, { title: string; note: string }> = {
  "needs-mindbody": {
    title: "Mindbody not set up",
    note: "Marked as linked to Mindbody, with its Site ID missing or, on a shared site, no location. Its bookings can't reach Journey as it is.",
  },
  offline: {
    title: "Runs offline",
    note: "On purpose: a floor before launch, or one not on Mindbody. Everything works; nothing syncs.",
  },
  "no-cutover": {
    title: "No cutover date yet",
    note: "Linked to Mindbody, and not moved onto Journey yet. Until a cutover date is set, every client here reads as unknown and gets the cautious wording.",
  },
  "cutover-coming": {
    title: "Moving onto Journey",
    note: "A cutover date is set, and the day hasn't come yet.",
  },
  "on-journey": {
    title: "On Journey",
    note: "The studio's Journey cutover date has passed.",
  },
  demo: {
    title: "Demo Mode",
    note: "The practice studio. Its numbers never mix with a real studio's.",
  },
};

export interface StudioStanding {
  studioId: string;
  name: string;
  stage: StudioStage;
  /** The franchise, or MSF corporate, or Independent. */
  context: string;
  /** The Mindbody link in words, and the tone of its mark. */
  link: string;
  linkTone: HqTone;
  linkState: MindbodyLinkState;
  /** The Journey cutover in words. */
  cutover: string;
  /** yyyy-mm-dd, or null when none is set. */
  cutoverDate: string | null;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "Mon, Sep 14, 2026" for a stored day. The day is read as the day it names,
 * never through a time zone: a date-only string is midnight UTC, which in
 * Ohio is the evening before.
 */
export function dayLabel(day: string): string {
  const m = DAY.exec(day.trim());
  if (!m) return day;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}

function linkWords(studio: Studio, studios: readonly Studio[]): { state: MindbodyLinkState; text: string; tone: HqTone } {
  const state = mindbodyLinkState(studio, studios as Studio[]);
  const site = str(studio.mindbodySiteId);
  const location = str(studio.mindbodyLocationId);
  switch (state) {
    case "offline":
      return { state, text: "Runs offline, on purpose", tone: "idle" };
    case "unlinked":
      return { state, text: "Marked as linked to Mindbody, with no Site ID", tone: "watch" };
    case "needs-location": {
      const others = studios.filter((s) => s.id !== studio.id && str(s.mindbodySiteId) === site).map((s) => s.name);
      return {
        state,
        text: `Shares Mindbody site ${site}${others.length ? ` with ${others.join(", ")}` : ""} but names no location`,
        tone: "watch",
      };
    }
    default:
      return { state, text: location ? `Mindbody site ${site}, location ${location}` : `Mindbody site ${site}`, tone: "ok" };
  }
}

function contextOf(studio: Studio, networks: readonly FranchiseNetwork[]): string {
  const franchise = networks.find((n) => n.id === studio.networkId)?.name;
  if (franchise) return franchise;
  return studio.locationType === "corporate" ? "MSF corporate" : "Independent";
}

/** Where one studio stands, in words. `now` decides whether a cutover has come. */
export function standingOf(
  studio: Studio,
  studios: readonly Studio[],
  networks: readonly FranchiseNetwork[],
  now: Date = new Date(),
): StudioStanding {
  const link = linkWords(studio, studios);
  const tz = isValidTimeZone(studio.timezone) ? studio.timezone : DEFAULT_TIME_ZONE;
  const today = studioTodayKey(now, tz);
  const raw = str(studio.journeyCutoverDate);
  const cutoverDate = DAY.test(raw) ? raw : null;

  let stage: StudioStage;
  if (isDemoStudio(studio)) stage = "demo";
  else if (link.state === "offline") stage = "offline";
  else if (link.state === "unlinked" || link.state === "needs-location") stage = "needs-mindbody";
  else if (!cutoverDate) stage = "no-cutover";
  else stage = cutoverDate > today ? "cutover-coming" : "on-journey";

  const cutover = !cutoverDate
    ? "No Journey cutover date yet"
    : cutoverDate > today
      ? `Moves onto Journey on ${dayLabel(cutoverDate)}`
      : `On Journey since ${dayLabel(cutoverDate)}`;

  return {
    studioId: studio.id ?? "",
    name: studio.name || "Unnamed studio",
    stage,
    context: contextOf(studio, networks),
    link: link.text,
    linkTone: link.tone,
    linkState: link.state,
    cutover,
    cutoverDate,
  };
}

export interface StandingGroup {
  stage: StudioStage;
  title: string;
  note: string;
  studios: StudioStanding[];
}

/** Every studio, in its group, groups in STAGE_ORDER and names A to Z; empty groups left out. */
export function groupStudios(
  studios: readonly Studio[],
  networks: readonly FranchiseNetwork[],
  now: Date = new Date(),
): StandingGroup[] {
  const standings = studios.filter((s) => s.id).map((s) => standingOf(s, studios, networks, now));
  return STAGE_ORDER.map((stage) => ({
    stage,
    ...STAGE_TEXT[stage],
    studios: standings.filter((s) => s.stage === stage).sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.studios.length > 0);
}

/** "4 studios" / "1 studio". */
export function studiosCount(n: number): string {
  return `${n} ${n === 1 ? "studio" : "studios"}`;
}
