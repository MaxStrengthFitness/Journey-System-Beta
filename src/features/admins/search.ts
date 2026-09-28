/**
 * ONE SEARCH ACROSS THE COMPANY — studios, machines and people.
 * PURE: no React, no Firestore.
 *
 * Round: the Admins room (Sep 28 2026). Today's header search looks through
 * the clients of the studio this iPad is in, so an administrator could not
 * type "Avon" or "Leg Press" and land there. This search reads only what the
 * Admins dashboard already holds — every studio, every trainer, the machine
 * catalog — so it costs no query of its own.
 *
 * Matching is forgiving in the ways a name needs: case and accents are
 * ignored ("cirdan" finds Círdan), every word typed must appear somewhere in
 * the entry ("leg ext" finds Leg Extension), and an entry whose NAME starts
 * with what was typed comes before one that merely contains it.
 *
 * THE REALM RULE (features/demo-mode/access.ts): from outside Demo Mode the
 * practice studio and its seeded trainers are not searched. All studios still
 * lists the practice studio in a group of its own.
 */
import { ROLE_LABELS, type FranchiseNetwork, type Studio, type Trainer } from "../../types";
import { isDemoStudio } from "../demo-mode/is-demo";
import { isStandardSetMachine } from "../admin/studios/registry";

export type SearchKind = "studio" | "machine" | "person";

export type SearchTarget =
  | { kind: "studio"; studioId: string }
  | { kind: "machine"; machineId: string }
  | { kind: "person"; trainerId: string; studioId: string | null };

export interface SearchEntry {
  kind: SearchKind;
  /** Unique within the index. */
  key: string;
  /** The name, whole. It wraps on screen; it is never cut short. */
  title: string;
  /** One line saying what it is. */
  detail: string;
  target: SearchTarget;
}

export interface SearchGroups {
  studios: SearchEntry[];
  machines: SearchEntry[];
  people: SearchEntry[];
}

/** What the catalog gives the search: enough to name a machine and say where it stands. */
export interface SearchMachine {
  id: string;
  name?: string;
  status?: string;
  inStandardSet?: boolean;
}

/** A trainer as the search reads one; every field but the id optional, as Firestore gives them. */
export interface SearchTrainer {
  id: string;
  fullName?: string;
  role?: Trainer["role"] | string;
  primaryHomeStudioId?: string | null;
  /** On the documents, not the Trainer type: false for a switched-off account. */
  isActive?: boolean;
  supersededByUid?: string | null;
  /** Demo Mode's seeded trainers carry it. */
  isDemo?: boolean;
}

/** Lower case, no accents, single spaces: how two spellings of a name are compared. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function studioDetail(studio: Studio, networks: readonly FranchiseNetwork[]): string {
  const franchise = networks.find((n) => n.id === studio.networkId)?.name;
  const parts = ["Studio", franchise ?? (studio.locationType === "corporate" ? "MSF corporate" : "Independent")];
  if (studio.mindbodyMode === "offline") parts.push("Runs offline");
  else if (studio.mindbodySiteId) {
    const loc = studio.mindbodyLocationId;
    parts.push(
      loc !== undefined && loc !== null && String(loc).trim() !== ""
        ? `Mindbody site ${studio.mindbodySiteId}, location ${loc}`
        : `Mindbody site ${studio.mindbodySiteId}`,
    );
  } else parts.push("No Mindbody Site ID");
  return parts.join(" · ");
}

function machineDetail(machine: SearchMachine): string {
  if (String(machine.status ?? "").toLowerCase() === "retired") return "Machine · Retired from the catalog";
  return isStandardSetMachine(machine)
    ? "Machine · In the MSF catalog and the standard set"
    : "Machine · In the MSF catalog, not in the standard set";
}

/**
 * Everything the search can find. Built once per change of the lists it reads,
 * never per keystroke.
 */
export function buildSearchIndex(input: {
  studios: readonly Studio[];
  networks: readonly FranchiseNetwork[];
  machines: readonly SearchMachine[];
  trainers: readonly SearchTrainer[];
}): SearchEntry[] {
  const out: SearchEntry[] = [];
  const studioName = new Map<string, string>();
  for (const s of input.studios) {
    if (!s.id || isDemoStudio(s)) continue;
    studioName.set(s.id, s.name);
    out.push({
      kind: "studio",
      key: `studio:${s.id}`,
      title: s.name || "Unnamed studio",
      detail: studioDetail(s, input.networks),
      target: { kind: "studio", studioId: s.id },
    });
  }
  for (const m of input.machines) {
    if (!m.id) continue;
    out.push({
      kind: "machine",
      key: `machine:${m.id}`,
      title: m.name || m.id,
      detail: machineDetail(m),
      target: { kind: "machine", machineId: m.id },
    });
  }
  for (const t of input.trainers) {
    if (!t.id || t.isDemo === true || t.supersededByUid) continue;
    const home = t.primaryHomeStudioId ?? null;
    if (home && !studioName.has(home) && input.studios.some((s) => s.id === home && isDemoStudio(s))) continue;
    const role = (ROLE_LABELS as Record<string, string>)[String(t.role ?? "")] ?? String(t.role ?? "");
    const where = home ? studioName.get(home) ?? "a studio not in the list" : "No home studio";
    const parts = [role, where].filter(Boolean);
    if (t.isActive === false) parts.push("Account switched off");
    out.push({
      kind: "person",
      key: `person:${t.id}`,
      title: t.fullName || "Unnamed person",
      detail: parts.join(" · "),
      target: { kind: "person", trainerId: t.id, studioId: home && studioName.has(home) ? home : null },
    });
  }
  return out;
}

/**
 * How well an entry answers the query: lower is better, null is no match.
 * Every word must appear in the title or the detail; a title that starts
 * with the query beats one with a word starting with it, which beats one
 * that only contains it, which beats a match in the detail alone.
 */
export function scoreEntry(entry: SearchEntry, query: string): number | null {
  const q = fold(query);
  if (!q) return null;
  const title = fold(entry.title);
  const hay = `${title} ${fold(entry.detail)}`;
  const words = q.split(" ");
  if (!words.every((w) => hay.includes(w))) return null;
  if (title === q) return 0;
  if (title.startsWith(q)) return 1;
  if (title.split(" ").some((w) => w.startsWith(words[0]))) return 2;
  if (words.every((w) => title.includes(w))) return 3;
  return 4;
}

/** The matches, best first, grouped the way the screen lists them. */
export function searchEntries(index: readonly SearchEntry[], query: string, perGroup = 6): SearchGroups {
  const scored = index
    .map((entry) => ({ entry, score: scoreEntry(entry, query) }))
    .filter((x): x is { entry: SearchEntry; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score || a.entry.title.localeCompare(b.entry.title));
  const take = (kind: SearchKind) =>
    scored
      .filter((x) => x.entry.kind === kind)
      .slice(0, perGroup)
      .map((x) => x.entry);
  return { studios: take("studio"), machines: take("machine"), people: take("person") };
}

/** How many matches in all. */
export function matchCount(groups: SearchGroups): number {
  return groups.studios.length + groups.machines.length + groups.people.length;
}
