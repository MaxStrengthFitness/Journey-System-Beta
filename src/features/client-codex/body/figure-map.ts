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
 * spot in `SPOTS`, for each figure.
 *
 * THE FIGURE IS THE CATALOG'S (Sep 26 2026: AJ, "update the pulse body
 * visualizer to be matching to the body chart that we use in the catalog").
 * It was a blocky silhouette of its own (viewBox 0 0 120 262); it is now the
 * Catalog's muscle figure (components/anatomy BodyModel), male or female by
 * her record, and the marks are drawn over it in the figure's own
 * coordinates (`FIGURE_VIEWBOX`). The spots were measured from the model's
 * own paths — each region's box on each figure — so a ring on her right knee
 * sits on the knee the figure draws. Front view: the client's right is the
 * viewer's left. Back view: the client's right is the viewer's right.
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
/** The Catalog's two figures (components/anatomy `figureGenderOf` picks one). */
export type FigureGender = "male" | "female";

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

/**
 * Each figure's own coordinate space: the viewBox the model draws it in
 * (react-muscle-highlighter's SvgMaleWrapper / SvgFemaleWrapper). The marks
 * are drawn in a second svg with the same viewBox laid over it, so the two
 * line up at any size; BodyPulsePage.render.test.tsx holds them equal.
 */
export const FIGURE_VIEWBOX: Readonly<Record<FigureGender, Readonly<Record<FigureView, string>>>> = {
  male: { front: "0 0 724 1448", back: "724 0 724 1448" },
  female: { front: "-50 -40 734 1538", back: "756 0 774 1448" },
};

/**
 * Every region's spots on each figure, in that figure's coordinates.
 *
 * Measured from the model's paths (Sep 26 2026): a muscle region's spot is
 * the middle of its box on that side (the knee is the knees' box, the thigh
 * the quadriceps'); a joint the model has no region for sits where its
 * neighbours meet (the elbow where the biceps ends and the forearm starts,
 * the hip at the top outer corner of the quadriceps, the middle of the back
 * between the upper and the lower back). Each region belongs to ONE view, as
 * before: the back view carries the back, the glutes and the hamstrings.
 */
export const SPOTS: Readonly<Record<FigureGender, Readonly<Record<FigureRegion, Spot>>>> = {
  male: {
    // Front (midline x 364): the client's right is the viewer's left.
    neck: { view: "front", mid: p(364, 282) },
    chest: { view: "front", mid: p(364, 376) },
    abdomen: { view: "front", mid: p(364, 560) },
    groin: { view: "front", mid: p(364, 740) },
    shoulder: { view: "front", right: p(236, 348), left: p(496, 348), mid: p(364, 348) },
    elbow: { view: "front", right: p(193, 497), left: p(533, 497) },
    wrist_hand: { view: "front", right: p(102, 750), left: p(627, 750) },
    hip: { view: "front", right: p(262, 680), left: p(466, 680), mid: p(364, 680) },
    thigh: { view: "front", right: p(284, 815), left: p(444, 815), mid: p(364, 815) },
    knee: { view: "front", right: p(296, 1006), left: p(432, 1006), mid: p(364, 1006) },
    calf_shin: { view: "front", right: p(282, 1105), left: p(446, 1105), mid: p(364, 1105) },
    ankle: { view: "front", right: p(290, 1250), left: p(439, 1250), mid: p(364, 1250) },
    foot: { view: "front", right: p(278, 1312), left: p(450, 1312), mid: p(364, 1312) },
    // Back (midline x 1084): the client's right is the viewer's right.
    upper_back: { view: "back", mid: p(1084, 420) },
    mid_back: { view: "back", mid: p(1084, 505) },
    lower_back: { view: "back", mid: p(1084, 590) },
    glute: { view: "back", right: p(1140, 698), left: p(1028, 698), mid: p(1084, 698) },
    hamstring: { view: "back", right: p(1158, 875), left: p(1008, 875), mid: p(1084, 875) },
  },
  female: {
    // Front (midline x 320): the client's right is the viewer's left.
    neck: { view: "front", mid: p(320, 290) },
    chest: { view: "front", mid: p(320, 376) },
    abdomen: { view: "front", mid: p(320, 555) },
    groin: { view: "front", mid: p(320, 710) },
    shoulder: { view: "front", right: p(202, 327), left: p(439, 327), mid: p(320, 327) },
    elbow: { view: "front", right: p(165, 480), left: p(476, 480) },
    wrist_hand: { view: "front", right: p(44, 708), left: p(597, 708) },
    hip: { view: "front", right: p(214, 650), left: p(426, 650), mid: p(320, 650) },
    thigh: { view: "front", right: p(248, 800), left: p(393, 800), mid: p(320, 800) },
    knee: { view: "front", right: p(265, 1023), left: p(376, 1023), mid: p(320, 1023) },
    calf_shin: { view: "front", right: p(262, 1170), left: p(380, 1170), mid: p(320, 1170) },
    ankle: { view: "front", right: p(275, 1345), left: p(365, 1345), mid: p(320, 1345) },
    foot: { view: "front", right: p(260, 1406), left: p(381, 1406), mid: p(320, 1406) },
    // Back (midline x 1143): the client's right is the viewer's right.
    upper_back: { view: "back", mid: p(1143, 400) },
    mid_back: { view: "back", mid: p(1143, 485) },
    lower_back: { view: "back", mid: p(1143, 570) },
    glute: { view: "back", right: p(1216, 696), left: p(1073, 696), mid: p(1143, 696) },
    hamstring: { view: "back", right: p(1228, 880), left: p(1057, 880), mid: p(1143, 880) },
  },
};

/** Which view a region is drawn on, and whether it has a midline (the same on both figures). */
export const regionSpot = (region: FigureRegion): Spot | undefined => SPOTS.male[region];

/**
 * The marks' size, in the figures' units (about 724 across): the same share
 * of the figure the silhouette's 9px diamond and 7px rings were of its 120.
 */
export const DIAMOND_SIZE = 54;
const RING_R = 42;
/** The knee and the hip are the big joints: a slightly larger ring. */
const RING_R_BIG = 48;

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
 * told us about. Arms have no midline, so an arm flag draws nothing. The
 * points are on her figure (`gender`), in its coordinates.
 */
export function figureMarks({
  flagIds,
  painSpots,
  gender,
}: {
  flagIds: readonly string[] | null | undefined;
  painSpots: ReadonlyArray<Pick<PainPoint, "id" | "region" | "side" | "status">>;
  gender: FigureGender;
}): FigureMark[] {
  const spots = SPOTS[gender];
  const out: FigureMark[] = [];
  const diamonds = new Set<FigureRegion>();
  for (const id of flagIds ?? []) {
    for (const region of flagRegions(id)) {
      if (diamonds.has(region)) continue;
      diamonds.add(region);
      const spot = spots[region];
      if (!spot?.mid) continue;
      out.push({ key: `flag:${region}`, view: spot.view, region, kind: "onfile", x: spot.mid.x, y: spot.mid.y, r: 0 });
    }
  }
  for (const point of painSpots) {
    if (!point || point.status === "resolved") continue;
    const region = point.region as FigureRegion;
    const spot = spots[region];
    if (!spot) continue;
    const r = region === "knee" || region === "hip" ? RING_R_BIG : RING_R;
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

/**
 * How often a region was tapped on the briefing's body map at the door, over
 * her sessions in the last six months (arrivals.ts `regionTaps`, phase 13).
 */
export interface DoorTaps {
  /** Sessions it was tapped at… */
  k: number;
  /** …of this many: the sessions whose door could have been recorded. */
  n: number;
  /** True when imported or logged sessions were left out of `n` ("run in Journey"). */
  runOnly?: boolean;
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
    // Whether it has a midline: the same on either figure.
    const spot = regionSpot(region);
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
      const ran = taps.runOnly ? " run in Journey" : "";
      const of =
        taps.n === 1
          ? `at ${pronouns.possessive} one session${ran} in these six months`
          : `at ${taps.k} of ${pronouns.possessive} last ${taps.n} sessions${ran}`;
      sentences.push(`At the door: “${taps.latest.word}”${when ? ` on ${when}` : ""} · tapped ${of}.`);
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
