/**
 * BODY & PULSE → WHERE IT MATTERS — which spots on the body figure carry a
 * watch-out on file, which she told us about, and the words for each.
 *
 * Client codex, Sep 2026 (phase 12). Two sources describe the same body and
 * are never merged: the studio's clinical flags (on file — a condition the
 * team recorded) and the Pulse pain map (she told us — region, side and how
 * bad). The figure draws both, told apart by SHAPE, never by a heat colour:
 *
 *   ◆ a plum diamond   a flag on file. A flag records no side, so it sits on
 *                      the body's midline at that height (AJ's decision) —
 *                      and a region with no midline spot (the elbow, the
 *                      wrist and hand, which sit out at the arms) is LISTED,
 *                      not drawn: a diamond on the belly would read as a
 *                      different body part.
 *   ○ an ink ring      a spot she told us about, on the side she named. Both
 *                      sides is two rings; a centre-line region is one.
 *
 * A flag that is about the whole body (blood pressure, osteoporosis, balance)
 * belongs to no spot and is listed under "Whole body". A flag id the studio's
 * clinical list does not have is listed as such, never dropped.
 *
 * Every clinical flag is in `FLAG_REGIONS` (figure-map.test.ts fails when a
 * new flag is added to the matrix without a place), and every region has a
 * spot in `SPOTS`, in the figure's own coordinates (viewBox 0 0 120 262).
 * Front view: the client's right is the viewer's left. Back view: the
 * client's right is the viewer's right.
 *
 * Pure: no React. figure-map.test.ts.
 */
import { BODY_REGION_GROUPS, BODY_REGION_LABELS, CENTERLINE_REGIONS } from "../../subjective-report/questions";
import type { BodyRegion, PainPoint } from "../../subjective-report/types";
import { CLINICAL_FLAGS_MATRIX } from "../../../data/clinical-matrix";
import { selectedFlags, type FlagOption } from "../../clinical-flags/flag-search";
import type { ClinicalSafetyFlag } from "../../../types";
import type { Pronouns } from "../kit/pronouns";
import { dayWords, spotWords, type PainReading } from "./pulse-read";

/** A spot on the figure: the Pulse's regions, and the abdomen (for a hernia). */
export type FigureRegion = BodyRegion | "abdomen";
export type FigureView = "front" | "back";

/**
 * Where each clinical flag sits. `[]` is the whole body — not drawn, listed.
 * Keyed by the clinical matrix's ids; the test holds it complete.
 */
export const FLAG_REGIONS: Readonly<Record<string, readonly FigureRegion[]>> = {
  "cv-hypertension": [],
  "cv-aortic-aneurysm": [],
  "cv-recent-cardiac": [],
  "cv-pacemaker": [],
  "cv-glaucoma": [],
  "bone-osteoporosis": [],
  "bone-frailty": [],
  "spine-spondylolisthesis": ["lower_back"],
  "spine-deformity": ["mid_back"],
  "spine-ddd": ["lower_back"],
  "spine-cervical": ["neck"],
  "joint-tha": ["hip"],
  "joint-tka": ["knee"],
  "neuro-parkinsons": [],
  "neuro-neuropathy": ["foot", "wrist_hand"],
  "soft-ra": [],
  "soft-tendonitis": ["elbow", "wrist_hand"],
  "soft-rotator": ["shoulder"],
  "sys-diabetes": [],
  "sys-dvt": [],
  "sys-hernia": ["abdomen"],
  "gen-shoulder": ["shoulder"],
  "gen-knee": ["knee"],
  "gen-low-back": ["lower_back"],
  "gen-hip": ["hip"],
  "gen-neck": ["neck"],
  "gen-elbow-wrist": ["elbow", "wrist_hand"],
  "gen-blood-pressure": [],
  "gen-balance": [],
  "gen-recent-surgery": [],
};

interface Point {
  x: number;
  y: number;
}

export interface Spot {
  view: FigureView;
  /** The client's right side. */
  right?: Point;
  /** The client's left side. */
  left?: Point;
  /** The midline at that height — where a flag's diamond goes. None for the arms. */
  mid?: Point;
}

const p = (x: number, y: number): Point => ({ x, y });

/** Every region's spots, in the figure's coordinates (viewBox 0 0 120 262). */
export const SPOTS: Readonly<Record<FigureRegion, Spot>> = {
  // Front: the client's right is the viewer's left.
  neck: { view: "front", mid: p(60, 41) },
  chest: { view: "front", mid: p(60, 66) },
  abdomen: { view: "front", mid: p(60, 100) },
  groin: { view: "front", mid: p(60, 136) },
  shoulder: { view: "front", right: p(27, 52), left: p(93, 52), mid: p(60, 50) },
  elbow: { view: "front", right: p(23, 104), left: p(97, 104) },
  wrist_hand: { view: "front", right: p(21, 157), left: p(99, 157) },
  hip: { view: "front", right: p(45, 122), left: p(75, 122), mid: p(60, 122) },
  thigh: { view: "front", right: p(49, 170), left: p(71, 170), mid: p(60, 170) },
  knee: { view: "front", right: p(49, 203), left: p(71, 203), mid: p(60, 203) },
  calf_shin: { view: "front", right: p(49, 227), left: p(71, 227), mid: p(60, 227) },
  ankle: { view: "front", right: p(49, 246), left: p(71, 246), mid: p(60, 246) },
  foot: { view: "front", right: p(47, 253), left: p(73, 253), mid: p(60, 253) },
  // Back: the client's right is the viewer's right.
  upper_back: { view: "back", mid: p(60, 62) },
  mid_back: { view: "back", mid: p(60, 85) },
  lower_back: { view: "back", mid: p(60, 108) },
  glute: { view: "back", right: p(71, 128), left: p(49, 128), mid: p(60, 128) },
  hamstring: { view: "back", right: p(71, 172), left: p(49, 172), mid: p(60, 172) },
};

/** The order regions are listed in: head to foot, the abdomen after the chest. */
export const REGION_ORDER: readonly FigureRegion[] = [
  ...BODY_REGION_GROUPS.flatMap((g) => g.regions).flatMap((r): FigureRegion[] =>
    r === "chest" ? ["chest", "abdomen"] : [r],
  ),
];

export function regionLabel(region: FigureRegion): string {
  return region === "abdomen" ? "Abdomen" : BODY_REGION_LABELS[region];
}

const isCentreline = (region: FigureRegion) =>
  region === "abdomen" || region === "groin" || (CENTERLINE_REGIONS as readonly string[]).includes(region);

/** The regions a flag sits at; `[]` (the whole body) for one the table does not know. */
export function flagRegions(flagId: string): readonly FigureRegion[] {
  return FLAG_REGIONS[flagId] ?? [];
}

/* ------------------------------------------------------------------ */
/* Marks                                                               */
/* ------------------------------------------------------------------ */

export interface FigureMark {
  key: string;
  view: FigureView;
  region: FigureRegion;
  kind: "onfile" | "told";
  x: number;
  y: number;
  /** A ring's radius; 0 for a diamond. */
  r: number;
}

/** The spots of a told pain point: its side, both sides, or the midline. */
function toldPoints(spot: Spot, region: FigureRegion, side: PainPoint["side"]): Point[] {
  if (isCentreline(region) || side === "center") return spot.mid ? [spot.mid] : [];
  if (side === "both") return [spot.right, spot.left].filter((x): x is Point => !!x);
  const one = side === "left" ? spot.left : spot.right;
  return one ? [one] : spot.mid ? [spot.mid] : [];
}

/**
 * What the figure draws: a diamond at the midline of every region a flag
 * names (once per region), and a ring on every active or improving spot she
 * told us about. Arms have no midline, so an arm flag draws nothing.
 */
export function figureMarks({
  flagIds,
  painSpots,
}: {
  flagIds: readonly string[] | null | undefined;
  painSpots: ReadonlyArray<Pick<PainPoint, "id" | "region" | "side" | "status">>;
}): FigureMark[] {
  const out: FigureMark[] = [];
  const diamonds = new Set<FigureRegion>();
  for (const id of flagIds ?? []) {
    for (const region of flagRegions(id)) {
      if (diamonds.has(region)) continue;
      diamonds.add(region);
      const spot = SPOTS[region];
      if (!spot?.mid) continue;
      out.push({ key: `flag:${region}`, view: spot.view, region, kind: "onfile", x: spot.mid.x, y: spot.mid.y, r: 0 });
    }
  }
  for (const point of painSpots) {
    if (!point || point.status === "resolved") continue;
    const region = point.region as FigureRegion;
    const spot = SPOTS[region];
    if (!spot) continue;
    const r = region === "knee" || region === "hip" ? 8 : 7;
    toldPoints(spot, region, point.side).forEach((at, i) => {
      out.push({ key: `told:${point.id}:${i}`, view: spot.view, region, kind: "told", x: at.x, y: at.y, r });
    });
  }
  return out;
}

/** A figure's accessible name: which view, and what is marked on it. */
export function figureLabel(
  view: FigureView,
  marks: readonly FigureMark[],
  pronouns: Pick<Pronouns, "subject">,
): string {
  const mine = marks.filter((m) => m.view === view);
  const head = view === "front" ? "Front of the body" : "Back of the body";
  if (mine.length === 0) return `${head}, nothing marked`;
  const regions = (kind: FigureMark["kind"]) => [
    ...new Set(mine.filter((m) => m.kind === kind).map((m) => regionLabel(m.region).toLowerCase())),
  ];
  const parts: string[] = [];
  const onFile = regions("onfile");
  const told = regions("told");
  if (onFile.length) parts.push(`a watch-out on file at the ${onFile.join(", ")}`);
  if (told.length) parts.push(`${pronouns.subject} told us about the ${told.join(", ")}`);
  return `${head}: ${parts.join("; ")}`;
}

/* ------------------------------------------------------------------ */
/* The region list                                                     */
/* ------------------------------------------------------------------ */

/** How often a region was tapped at the door (the arrive/leave track; phase 13 fills it). */
export interface DoorTaps {
  /** Sessions it was tapped at… */
  k: number;
  /** …of this many. */
  n: number;
  /** The newest tap's word and day. */
  latest: { word: string; day: string };
}

export type RegionMeta = "both" | "onfile" | "told" | "door";

export interface RegionRow {
  /** A figure region, or "whole" for the flags that belong to no spot. */
  region: FigureRegion | "whole";
  label: string;
  kind: RegionMeta;
  /** "on file + she told us" · "on file" · "she told us" · "at the door". */
  meta: string;
  sentences: string[];
  /** Whether the figure draws anything for this row (a tap highlights it). */
  drawn: boolean;
}

const KIND_RANK: Record<RegionMeta, number> = { both: 0, onfile: 1, told: 2, door: 3 };

function flagName(f: FlagOption): string {
  return f.detail ? `${f.name} (${f.detail})` : f.name;
}

/**
 * One row per region with anything to say, then a "Whole body" row: on file
 * and told first, then on file, then told, then the door; head to foot within
 * each. Every sentence names its source and its date.
 */
export function regionRows({
  flagIds,
  pain,
  machinesById,
  door,
  pronouns,
  now,
  matrix = CLINICAL_FLAGS_MATRIX,
}: {
  flagIds: readonly string[] | null | undefined;
  pain: PainReading | null;
  machinesById: ReadonlyMap<string, { name?: string | null }>;
  door?: ReadonlyMap<FigureRegion, DoorTaps> | null;
  pronouns: Pick<Pronouns, "subject" | "possessive">;
  now: Date;
  matrix?: readonly ClinicalSafetyFlag[];
}): RegionRow[] {
  const known = new Set(matrix.map((f) => f.id));
  const flags = selectedFlags(flagIds, matrix);
  const byRegion = new Map<FigureRegion, FlagOption[]>();
  const wholeBody: FlagOption[] = [];
  const unknown: string[] = [];
  for (const f of flags) {
    if (!known.has(f.id)) {
      unknown.push(f.id);
      continue;
    }
    const regions = flagRegions(f.id);
    if (regions.length === 0) wholeBody.push(f);
    for (const region of regions) byRegion.set(region, [...(byRegion.get(region) ?? []), f]);
  }

  const told = new Map<FigureRegion, PainReading["spots"]>();
  for (const s of pain?.spots ?? []) {
    if (s.point.status === "resolved") continue;
    const region = s.point.region as FigureRegion;
    told.set(region, [...(told.get(region) ?? []), s]);
  }

  const Subject = pronouns.subject.charAt(0).toUpperCase() + pronouns.subject.slice(1);
  const toldWords = `${pronouns.subject} told us`;
  const regions = new Set<FigureRegion>([...byRegion.keys(), ...told.keys(), ...(door ? door.keys() : [])]);
  const rows: RegionRow[] = [];
  for (const region of regions) {
    const onFile = byRegion.get(region) ?? [];
    const spots = told.get(region) ?? [];
    const taps = door?.get(region) ?? null;
    const spot = SPOTS[region];
    const sentences: string[] = [];

    if (onFile.length) {
      sentences.push(`On file: ${onFile.map(flagName).join("; ")}.`);
      if (!spot?.mid) sentences.push("No side on file, so it isn't drawn.");
      else if (!isCentreline(region)) {
        sentences.push(
          onFile.length === 1
            ? "The flag doesn't record a side, so the diamond sits on the midline."
            : "The flags don't record a side, so the diamond sits on the midline.",
        );
      }
    }
    for (const s of spots) {
      const when = dayWords(pain?.day, now);
      const prevWhen = s.prev ? dayWords(s.prev.day, now) : "";
      const prev = s.prev ? `, ${s.prev.word}${prevWhen ? ` on ${prevWhen}` : ""}` : "";
      sentences.push(`${Subject} told us: ${spotWords(s.point)}, ${s.word} (Pulse${when ? `, ${when}` : ""})${prev}.`);
      const machines = (s.point.aggravatingMachineIds ?? [])
        .map((id) => (machinesById.get(id)?.name ?? "").trim())
        .filter(Boolean);
      if (machines.length) sentences.push(`Brought on by ${machines.join(", ")}.`);
      const note = (s.point.note ?? "").trim();
      if (note) sentences.push(`“${note}”`);
    }
    if (taps && taps.n > 0) {
      const when = dayWords(taps.latest.day, now);
      sentences.push(
        `At the door: “${taps.latest.word}”${when ? ` on ${when}` : ""} · tapped at ${taps.k} of ${pronouns.possessive} last ${taps.n} sessions.`,
      );
    }
    if (sentences.length === 0) continue;

    const kind: RegionMeta =
      onFile.length && spots.length ? "both" : onFile.length ? "onfile" : spots.length ? "told" : "door";
    const meta = [
      onFile.length ? "on file" : "",
      spots.length ? toldWords : "",
      taps && !onFile.length && !spots.length ? "at the door" : "",
    ]
      .filter(Boolean)
      .join(" + ");
    const drawn = (onFile.length > 0 && !!spot?.mid) || spots.length > 0;
    rows.push({ region, label: regionLabel(region), kind, meta, sentences, drawn });
  }

  const order = (r: FigureRegion | "whole") => {
    const i = REGION_ORDER.indexOf(r as FigureRegion);
    return i === -1 ? REGION_ORDER.length : i;
  };
  rows.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || order(a.region) - order(b.region));

  if (wholeBody.length || unknown.length) {
    const sentences: string[] = [];
    if (wholeBody.length) {
      sentences.push(`On file: ${wholeBody.map(flagName).join("; ")}.`);
      sentences.push(
        wholeBody.length === 1
          ? "It doesn't belong to one spot, so it isn't drawn."
          : "These don't belong to one spot, so they aren't drawn.",
      );
    }
    for (const id of unknown) sentences.push(`Not in the studio's clinical list: ${id}.`);
    rows.push({ region: "whole", label: "Whole body", kind: "onfile", meta: "on file", sentences, drawn: false });
  }
  return rows;
}
