/**
 * OVERDUE SETUP ITEMS ON HOME — a studio opening whose checklist has an item
 * past its due day, said as one item of "What needs you".
 * PURE: no React, no Firestore.
 *
 * The Admins room's third wave (Sep 29 2026). The second wave left this off
 * Home because it costs each studio opening two small reads (its setup
 * items and its floor) on every Admins visit; Launches said what was
 * overdue. Now Home reads the same two documents Launches reads
 * (launches/useSetupData.ts, once when the dashboard opens and again on
 * Check again), for the studios whose stage is Setting up or Handed over —
 * usually none, so usually nothing is read. No new index: both are
 * subcollection gets.
 *
 * Overdue is the checklist's own word (launches/checklist.ts): an item still
 * to do, or one whose fact couldn't be read, on a day after its due day.
 * The item names the studio and who leads it (its studio owner, studio
 * leader or head trainer — a setup item itself names no owner, AJ's q1),
 * and its door is the studio's Setup, where the checklist is, or Launches
 * when several studios are late.
 *
 * Unknown is never nothing: a studio whose checklist couldn't be read is
 * named in Home's "Couldn't check", never counted as on time.
 */
import type { Studio, Trainer } from "../../../types";
import { buildChecklist, isLaunching, leadersOf, openingDayOf, todayFor } from "../launches/checklist";
import type { SetupData } from "../launches/useSetupData";
import type { ReadState } from "./useHomeSignals";

export interface OverdueItem {
  id: string;
  title: string;
  /** yyyy-mm-dd. */
  dueOn: string;
}

export interface OverdueStudio {
  studioId: string;
  name: string;
  /** Who leads it, by name, in name order; empty when nobody is named yet. */
  leaders: string[];
  /** Oldest due day first. */
  items: OverdueItem[];
}

export interface OverdueRead {
  /** "loading" while any studio opening is still being read; "ok" once every one has answered (well or not). */
  state: ReadState;
  /** The studios with something overdue, the one with the oldest item first. */
  studios: OverdueStudio[];
  /** The names of studios opening whose checklist couldn't be read. */
  unread: string[];
}

export const NO_LAUNCHES: OverdueRead = { state: "ok", studios: [], unread: [] };

/** The studios opening (stage Setting up or Handed over), soonest opening day first. */
export function launchingIds(studios: readonly Studio[]): string[] {
  return studios
    .filter((s) => s.id && isLaunching(s))
    .sort((a, b) => (openingDayOf(a) ?? "9999").localeCompare(openingDayOf(b) ?? "9999") || (a.name || "").localeCompare(b.name || ""))
    .map((s) => s.id!);
}

/** What is overdue across the studios opening, from what Home read of their checklists. */
export function overdueSetup(
  studios: readonly Studio[],
  trainers: readonly Trainer[],
  data: Record<string, SetupData>,
  now: Date = new Date(),
): OverdueRead {
  const ids = launchingIds(studios);
  if (ids.length === 0) return NO_LAUNCHES;
  let loading = false;
  const unread: string[] = [];
  const out: OverdueStudio[] = [];
  for (const id of ids) {
    const studio = studios.find((s) => s.id === id)!;
    const d = data[id];
    if (!d || d.items.state === "loading" || d.roster.state === "loading") {
      loading = true;
      continue;
    }
    if (d.items.state === "failed") {
      unread.push(studio.name || "A studio");
      continue;
    }
    const facts = { studio, studios, trainers, roster: d.roster, today: todayFor(studio, now) };
    const items = buildChecklist(facts, d.items.docs)
      .filter((i) => i.overdue && i.dueOn)
      .sort((a, b) => a.dueOn!.localeCompare(b.dueOn!) || a.title.localeCompare(b.title))
      .map((i) => ({ id: i.id, title: i.title, dueOn: i.dueOn! }));
    if (items.length === 0) continue;
    out.push({ studioId: id, name: studio.name || "A studio", leaders: leadersOf(trainers, id).map((t) => t.fullName || "Unnamed person"), items });
  }
  out.sort((a, b) => a.items[0].dueOn.localeCompare(b.items[0].dueOn) || a.name.localeCompare(b.name));
  return { state: loading ? "loading" : "ok", studios: out, unread };
}
