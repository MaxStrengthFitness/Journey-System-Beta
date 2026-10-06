/**
 * THE MACHINE MENU — the Staircase, drawn (AJ, Oct 4 2026: Q1 (a), "ill take
 * all your recommended").
 *
 * The block "How Avery has done here": a fixed readout, then the plot, then
 * ‹ Older · the overview strip · Newer ›, the before-Journey line and the two
 * lists. The SAME component in both doors; only what Load older reads differs,
 * and the door hands that in (`older`).
 *
 * The plot is plain React SVG over the pure core — timeline-model.ts says
 * what happened, timeline-geometry.ts where it sits, timeline-words.ts how it
 * is said — with no chart library and no d3 (d3 would drag the charts chunk
 * into the session). Top to bottom it is:
 *
 *   weight   the load as a step-after line, a dot at each performed set (a
 *            square for a timed hold), dashed across a column that counted
 *            nothing, broken at a folded gap and never at a set-up change;
 *            the load printed wherever it changes
 *   reps     the count printed AS the mark, in the grid's own boxes (gold
 *            star, red kaizen ring), framed by the client's own fewest and
 *            most (never under 4 reps, never a fixed band), joined within
 *            one load and one set-up by a hairline: the climb and the reset
 *   hold     the seconds, only when the loaded history mixes holds and reps
 *   set-up   bands of one set-up, a sliders glyph and a dashed rule where it
 *            changed (never the wrench: that is Relay's flag)
 *   notes    the note key's glyphs, a skip's ⊘ and its reason (never red)
 *   dates    the session's day; today in the hero orange
 *
 * TOUCH. A whole column (52px × the plot) is the target; a tap selects it and
 * the selection stays after the finger lifts; tap it again, or ✕, for the
 * sentence. ‹ › and the arrow keys step and cross a page by themselves. The
 * plot is `touch-action: pan-y`, so a vertical drag scrolls the card. Nothing
 * animates.
 *
 * WIDTH. A `width` prop (the content width: 712 in a portrait session), else
 * measured in a layout effect with a feature-detected ResizeObserver (a throw
 * there takes the screen down — KNOWN-TRAPS → React), else 640.
 */
import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Ban, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { LoadingMark } from "../../components/LoadingMark";
import type { SessionTotal } from "../../lib/session-total";
import { QualityMark } from "../journey-grid/QualityMark";
import { formatSeconds } from "../journey-grid/stats";
import { noteKeyOf } from "./note-key";
import { OverviewStrip } from "./OverviewStrip";
import type { ProgressFigure } from "./progress-figure";
import { SessionList } from "./SessionList";
import { countedRuns, stepRuns } from "./step-runs";
import {
  COL_W,
  FOLD_W,
  GUTTER_W,
  allHoldsInView,
  chipSpots,
  fitWindow,
  foldFlags,
  hairlinePairs,
  hitBands,
  layoutSlots,
  loadsInView,
  mergeMarkers,
  needsOverview,
  newerWindow,
  noteX,
  olderWindow,
  pinnedY,
  plotRows,
  plotWidthOf,
  repsFrame,
  repsInView,
  repsScale,
  secondsInView,
  stepSegments,
  weightFrame,
  weightLabelIndexes,
  weightScale,
  windowAround,
  windowShowing,
  type ChipSpot,
  type Marker,
  type ViewWindow,
} from "./timeline-geometry";
import type { LaneNote, SetupStretch, TimelineColumn, TimelineModel } from "./timeline-model";
import { GLYPH_CLASS, TimelineReadout, UsageWords } from "./TimelineReadout";
import {
  CACHE_ONLY_LINE,
  NOTES_UNREAD_LINE,
  OLDER_NOT_LOADED_LINES,
  ONE_SESSION_TAIL,
  PAGING_WORDS,
  PLOT_LABEL,
  beforeJourneyLine,
  chartDescription,
  chartHeading,
  chartState,
  chartTitle,
  columnDateLabel,
  foldLabel,
  laneWord,
  runsButtonLabel,
  sessionsButtonLabel,
  stateLine,
  usageLine,
  wallLines,
  type WordsContext,
} from "./timeline-words";
import { WeightRuns } from "./WeightRuns";
import "./machine-menu.css";

/** Drawn at this content width until the block has been measured (and where it can't be). */
export const TIMELINE_FALLBACK_WIDTH = 640;
/** ‹ Older and Newer ›'s width (machine-menu.css), for the strip's width before it is measured. */
const PAGING_BUTTON_W = 112;
const CONTROLS_GAP = 8;
/** A timed hold's track never spans less than this many seconds. */
const HOLD_MIN_SPAN = 10;
/** A retry: a button, never advice (kept out of the words' coaching guard). */
const RETRY = "Try again";

/** Load older, as the door wires it (phase 6): the state of its read, and the read. */
export interface OlderLoad {
  state: "idle" | "loading" | "failed" | "offline";
  onLoad: () => void;
}

export interface MachineTimelineProps {
  model: TimelineModel;
  ctx: WordsContext;
  /** The content width in px (712 in a portrait session dialog). Measured when absent. */
  width?: number;
  /** The landscape column's shorter panels. */
  landscape?: boolean;
  /** The Now Bar's figure (progress-figure.ts): "Starting weight 80 lb, +25%". */
  progress?: ProgressFigure | null;
  /** A running total knows the machine was done before (header-words' `knownElsewhere`). */
  knownElsewhere?: boolean;
  /** `sessionTotalOf(client, coverage)`, for the before-Journey line. */
  sessionTotal?: SessionTotal | null;
  /** Load older, read the door's way; absent, nothing more can be read here. */
  older?: OlderLoad | null;
  /** The failed read's Try again. */
  onRetry?: () => void;
  /** Open note in the readout: opens the note's thread in the Notes block. */
  onOpenNote?: (note: LaneNote) => void;
  /** The tapped session, when the host holds it ("Last changed" selects a column). */
  selectedSessionId?: string | null;
  onSelectedChange?: (sessionId: string | null) => void;
}

const f = (n: number) => Math.round(n * 10) / 10;
/** Roughly how wide a line of text is, to draw a label only where it fits. */
const textWidth = (s: string, px: number) => s.length * px * 0.56;
/** A setting's first word ("Back pad" → "Back"), for the narrow set-up lane. */
const shortLabel = (label: string) => label.trim().split(/\s+/)[0] ?? label;
const NOTE_RANK: Record<LaneNote["loudness"], number> = { critical: 3, elevated: 2, standard: 1 };

/* ------------------------------------------------------------------ *
 * The plot
 * ------------------------------------------------------------------ */

type LaneItem = { kind: "note"; note: LaneNote } | { kind: "skip"; col: TimelineColumn } | { kind: "unreached"; col: TimelineColumn };

/** A rep count, printed as the mark in the grid's own box. */
function Chip({
  x,
  y,
  label,
  mark,
  hatch,
  w = 40,
  h = 30,
  text = "mm-cn",
  base = 8,
  glyph = true,
}: {
  x: number;
  y: number;
  label: string;
  mark: TimelineColumn["mark"];
  hatch: string;
  w?: number;
  h?: number;
  text?: string;
  base?: number;
  glyph?: boolean;
}) {
  const rx = x - w / 2;
  const ry = y - h / 2;
  return (
    <>
      {mark === "poor" ? (
        <>
          <rect className="mm-chip--poor" x={f(rx)} y={f(ry)} width={w} height={h} rx={6} />
          <rect x={f(rx)} y={f(ry)} width={w} height={h} rx={6} fill={`url(#${hatch})`} />
          <rect className="mm-chip__poor-edge" x={f(rx + 1)} y={f(ry + 1)} width={w - 2} height={h - 2} rx={5} />
        </>
      ) : (
        <rect className={mark === "max" ? "mm-chip--max" : "mm-chip--done"} x={f(rx)} y={f(ry)} width={w} height={h} rx={6} />
      )}
      <text className={text} x={f(x)} y={f(y + base)} textAnchor="middle">
        {label}
      </text>
      {glyph && mark ? (
        <g transform={`translate(${f(x + w / 2 - 7)} ${f(y - h / 2 - 8)})`} className={mark === "max" ? "mm-star" : "mm-kaizen"}>
          <QualityMark quality={mark === "max" ? 3 : 1} size={14} />
        </g>
      ) : null}
    </>
  );
}

interface PlotProps {
  model: TimelineModel;
  ctx: WordsContext;
  view: ViewWindow;
  contentWidth: number;
  landscape: boolean;
  selected: number | null;
  idBase: string;
  onTapColumn: (index: number) => void;
}

function StaircasePlot({ model, ctx, view, contentWidth, landscape, selected, idBase, onTapColumn }: PlotProps) {
  const cols = model.columns;
  const n = cols.length;
  const plotWidth = plotWidthOf(contentWidth);
  const folds = foldFlags(model);
  const layout = layoutSlots(view, folds, plotWidth);
  const { colX } = layout;
  const half = COL_W / 2;

  const rows = plotRows(model, { landscape });
  const rowOf = (k: (typeof rows)[number]["key"]) => rows.find((r) => r.key === k) ?? null;
  const wRow = rowOf("weight")!;
  const rRow = rowOf("reps")!;
  const hRow = rowOf("hold");
  const sRow = rowOf("setup");
  const nRow = rowOf("notes")!;
  const dRow = rowOf("dates")!;
  const H = dRow.top + dRow.height;
  const panelsBottom = (hRow ?? rRow).top + (hRow ?? rRow).height;
  const lanesBottom = nRow.top + nRow.height;
  const hatch = `${idBase}-hatch`;
  const away = `${idBase}-away`;

  const inView: number[] = [];
  for (let i = Math.max(0, view.start); i <= view.end && i < n; i++) if (colX.has(i)) inView.push(i);
  const xOf = (i: number) => colX.get(i) as number;

  // The weight panel: framed to the performed loads in view.
  const wFrame = weightFrame(loadsInView(cols, view));
  const wy = wFrame ? weightScale(wFrame, wRow.top, wRow.height) : null;

  // The reps track (or, when the loaded history is only holds, the seconds).
  const holdsOnly = !hRow && allHoldsInView(cols, view);
  const repCounts = holdsOnly ? secondsInView(cols, view) : repsInView(cols, view);
  const rFrame = holdsOnly ? repsFrame(repCounts, HOLD_MIN_SPAN) : repsFrame(repCounts);
  const ry = rFrame ? repsScale(rFrame, rRow.top, rRow.height) : null;
  const holdY = hRow ? () => hRow.top + hRow.height / 2 : holdsOnly ? ry : null;
  const repsY = holdsOnly ? null : ry;
  const chips = chipSpots(cols, view, colX, repsY, holdsOnly ? null : rFrame, holdY);

  // Gutter: the rows' names, and the reps track's two ends.
  const repsTitleY = rRow.top + rRow.height / 2 + 5;
  const ends: { value: number; y: number }[] = [];
  if (ry && repCounts.length) {
    const hi = Math.max(...repCounts);
    const lo = Math.min(...repCounts);
    for (const v of hi === lo ? [hi] : [hi, lo]) {
      const y = ry(v) + 5;
      if (Math.abs(y - repsTitleY) >= 12) ends.push({ value: v, y });
    }
  }

  // Set-up stretches in view (shaded alternately when two or more show).
  const stretchesInView = model.stretches
    .map((s, k) => ({ s, k }))
    .filter(({ s }) => s.end >= view.start && s.start <= view.end);
  const foldXs = layout.slots.filter((s) => s.kind === "fold").map((s) => s.x);

  // A dial at the same value in every stretch in view says nothing about
  // where the set-up changed, so the shortest label leaves it out ("Seat 5 ·
  // Back 2", not "… · Foot High").
  const sameEverywhere = new Set<string>();
  if (stretchesInView.length >= 2 && stretchesInView.every(({ s }) => s.settings)) {
    for (const v of stretchesInView[0].s.settings ?? []) {
      if (stretchesInView.every(({ s }) => s.settings?.some((w) => w.label === v.label && w.value === v.value))) sameEverywhere.add(v.label);
    }
  }
  /** The longest of a band's labels that fits the room, or null. */
  const bandLabel = (s: SetupStretch, room: number): string | null => {
    if (!s.settings) return textWidth("not recorded", 14) <= room ? "not recorded" : null;
    const changing = s.settings.filter((v) => !sameEverywhere.has(v.label));
    const tries = [
      s.settings.map((v) => `${v.label} ${v.value}`).join(" · "),
      s.settings.map((v) => `${shortLabel(v.label)} ${v.value}`).join(" · "),
      changing.length ? changing.map((v) => `${shortLabel(v.label)} ${v.value}`).join(" · ") : "",
    ];
    return tries.find((t) => t && textWidth(t, 14) <= room) ?? null;
  };

  // The notes & skips lane: notes at their place, skips and unreached columns.
  const markers: Marker<LaneItem>[] = [];
  if (model.notesRead) {
    for (const note of model.notes) {
      const x = noteX(note.place, view, colX, n - 1);
      if (x !== null) markers.push({ x, rank: note.resolved ? 0.5 : NOTE_RANK[note.loudness], item: { kind: "note", note } });
    }
  }
  for (const i of inView) {
    const c = cols[i];
    if (c.outcome === "skipped") markers.push({ x: xOf(i), rank: 0.25, item: { kind: "skip", col: c } });
    else if (c.outcome === "not_reached") markers.push({ x: xOf(i), rank: 0, item: { kind: "unreached", col: c } });
  }
  const lane = mergeMarkers(markers);

  const sel = selected !== null && colX.has(selected) ? selected : null;
  const wall = layout.slots.find((s) => s.kind === "wall");
  const [wallA, wallB] = wallLines(ctx.coverage);

  // Chips by column, so a one-side-at-a-time set's two halves draw together.
  const sideChips = new Map<number, ChipSpot[]>();
  for (const c of chips) if (c.kind === "side") sideChips.set(c.index, [...(sideChips.get(c.index) ?? []), c]);

  return (
    <svg
      width={contentWidth}
      height={H}
      viewBox={`0 0 ${contentWidth} ${H}`}
      role="img"
      aria-labelledby={`${idBase}-t ${idBase}-d`}
      data-capacity={inView.length}
    >
      <title id={`${idBase}-t`}>{chartTitle(model)}</title>
      <desc id={`${idBase}-d`}>{chartDescription(model, view, ctx)}</desc>
      <defs>
        <pattern id={hatch} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="mm-hatch-line" x1="0" y1="0" x2="0" y2="6" strokeWidth="3" />
        </pattern>
        <pattern id={away} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line className="mm-hatch-away" x1="0" y1="0" x2="0" y2="6" strokeWidth="1" />
        </pattern>
      </defs>

      {/* Alternate set-up stretches, behind both panels. */}
      {stretchesInView.length >= 2
        ? stretchesInView
            .filter(({ k }) => k % 2 === 1)
            .map(({ s, k }) => {
              const x1 = xOf(Math.max(s.start, view.start)) - half;
              const x2 = xOf(Math.min(s.end, view.end)) + half;
              return <rect key={`shade-${k}`} className="mm-shade" x={f(x1)} y={0} width={f(x2 - x1)} height={panelsBottom} />;
            })
        : null}

      {sel !== null ? <rect className="mm-wash" x={f(xOf(sel) - half)} y={0} width={COL_W} height={dRow.top} /> : null}

      {/* The set-up lane: bands, cells, and each boundary's rule and sliders. */}
      {sRow ? (
        <g data-lane-row="setup">
          {stretchesInView.map(({ s, k }) => {
            const a = Math.max(s.start, view.start);
            const b = Math.min(s.end, view.end);
            const x1 = xOf(a) - half + 2;
            const x2 = xOf(b) + half - 2;
            let lx = x1 + 6;
            const parts: ReactNode[] = [];
            const boundary = model.boundaryAt[s.start];
            if (boundary && s.start >= view.start) {
              const bx = xOf(s.start) - half;
              const words = boundary.changes.map((c) => `${shortLabel(c.label)} ${c.from || "—"}→${c.to || "—"}`).join(", ");
              lx = bx + 25;
              if (bx + 25 + textWidth(words, 14) <= x2) {
                parts.push(
                  <text key="chg" className="mm-t mm-t--ink2" x={f(bx + 25)} y={sRow.top + 19}>
                    {words}
                  </text>,
                );
                lx = bx + 25 + textWidth(words, 14) + 12;
              }
            }
            // A fold or a cell (an unrecorded or other-studio column) would
            // cover the label, so it goes in the first clear piece of the
            // band that holds it; a band under two columns gets none.
            const blocked: [number, number][] = foldXs.map((fx) => [fx, fx + FOLD_W]);
            for (let i = a; i <= b; i++) {
              if (cols[i].atOtherStudio || !cols[i].settings) blocked.push([xOf(i) - half + 3, xOf(i) + half - 3]);
            }
            blocked.sort((p, r) => p[0] - r[0]);
            let label: { text: string; x: number } | null = null;
            if (b > a) {
              let from = lx;
              for (const [bs, be] of [...blocked.filter(([, be]) => be > lx), [x2, x2] as [number, number]]) {
                const text = bs > from ? bandLabel(s, Math.min(bs, x2) - 6 - from) : null;
                if (text) {
                  label = { text, x: from };
                  break;
                }
                from = Math.max(from, be + 6);
                if (from >= x2) break;
              }
            }
            return (
              <g key={`band-${k}`}>
                <rect className="mm-band" x={f(x1)} y={sRow.top + 3} width={f(Math.max(0, x2 - x1))} height={22} rx={5} />
                {parts}
                {label ? (
                  <text className="mm-t mm-t--ink2" x={f(label.x)} y={sRow.top + 19} data-band-label="">
                    {label.text}
                  </text>
                ) : null}
              </g>
            );
          })}
          {inView.map((i) => {
            const c = cols[i];
            const x = xOf(i);
            if (c.atOtherStudio) {
              return (
                <g key={`cell-${i}`} data-away={c.sessionId}>
                  <rect className="mm-cell" x={f(x - half + 3)} y={sRow.top + 4} width={COL_W - 6} height={20} />
                  <rect x={f(x - half + 3)} y={sRow.top + 4} width={COL_W - 6} height={20} fill={`url(#${away})`} />
                  <line className="mm-rule" x1={f(x - half)} y1={sRow.top} x2={f(x - half)} y2={sRow.top + sRow.height} />
                  <line className="mm-rule" x1={f(x + half)} y1={sRow.top} x2={f(x + half)} y2={sRow.top + sRow.height} />
                </g>
              );
            }
            if (!c.settings) {
              return (
                <g key={`cell-${i}`} data-unrecorded={c.sessionId}>
                  <rect className="mm-cell" x={f(x - half + 3)} y={sRow.top + 4} width={COL_W - 6} height={20} />
                  <text className="mm-t" x={f(x)} y={sRow.top + 19} textAnchor="middle">
                    –
                  </text>
                </g>
              );
            }
            return null;
          })}
          {inView
            .filter((i) => model.boundaryAt[i])
            .map((i) => {
              const bx = xOf(i) - half;
              return (
                <g key={`bd-${i}`} data-boundary={cols[i].sessionId}>
                  <line className="mm-rule" x1={f(bx)} y1={0} x2={f(bx)} y2={sRow.top + sRow.height} />
                  <SlidersHorizontal x={f(bx + 5)} y={sRow.top + 6} size={16} className="mm-g--ink2" aria-hidden="true" />
                </g>
              );
            })}
        </g>
      ) : null}

      {/* Folded gaps: a zigzag through every panel and lane, "7 wk" in the dates. */}
      {layout.slots.map((s) => {
        if (s.kind !== "fold") return null;
        const fold = model.foldAt[s.index];
        const cx = s.x + s.w / 2;
        let d = `M${f(cx)} 4`;
        let side = 1;
        for (let y = 4; y < lanesBottom - 10; side = -side) {
          y += 8;
          d += `L${f(cx + 6 * side)} ${y}`;
        }
        return (
          <g key={`fold-${s.index}`} data-fold={cols[s.index]?.sessionId} data-days={fold?.days}>
            <rect className="mm-fold" x={f(s.x)} y={0} width={FOLD_W} height={lanesBottom} />
            <path className="mm-zig" d={d} />
            {fold ? (
              <text className="mm-t" x={f(cx)} y={dRow.top + 19} textAnchor="middle">
                {foldLabel(fold.days)}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* The start wall, only when every Journey session has been read. */}
      {wall ? (
        <g data-wall="">
          <line className="mm-wall" x1={f(wall.x + wall.w - 6)} y1={0} x2={f(wall.x + wall.w - 6)} y2={lanesBottom} />
          <text className="mm-t" x={f(wall.x + wall.w - 12)} y={24} textAnchor="end">
            {wallA}
          </text>
          {wallB ? (
            <text className="mm-t" x={f(wall.x + wall.w - 12)} y={42} textAnchor="end">
              {wallB}
            </text>
          ) : null}
        </g>
      ) : null}
      {view.start === 0 && model.moreToLoad && layout.leftRoom >= 150 ? (
        <g data-older-unread="">
          <text className="mm-t" x={f(layout.left - 12)} y={44} textAnchor="end">
            {OLDER_NOT_LOADED_LINES[0]}
          </text>
          <text className="mm-t" x={f(layout.left - 12)} y={62} textAnchor="end">
            {OLDER_NOT_LOADED_LINES[1]}
          </text>
        </g>
      ) : null}

      {/* The gutter. */}
      <g aria-hidden="true">
        <text className="mm-t" x={2} y={f(wRow.top + wRow.height * 0.64)}>
          lb
        </text>
        <text className="mm-t" x={2} y={f(repsTitleY)}>
          {holdsOnly ? "hold" : "reps"}
        </text>
        {ends.map((e) => (
          <text key={`end-${e.value}`} className="mm-t" x={GUTTER_W - 2} y={f(e.y)} textAnchor="end">
            {holdsOnly ? formatSeconds(e.value) : e.value}
          </text>
        ))}
        {hRow ? (
          <text className="mm-t" x={2} y={hRow.top + 23}>
            hold
          </text>
        ) : null}
        {sRow ? (
          <text className="mm-t" x={2} y={sRow.top + 19}>
            set-up
          </text>
        ) : null}
        <text className="mm-t" x={2} y={nRow.top + 25}>
          notes
        </text>
      </g>

      {/* The weight line: step-after, dashed where nothing counted, broken at a fold. */}
      {wy
        ? stepSegments(cols, view, folds, colX, wy).map((s, k) => (
            <path
              key={`seg-${k}`}
              className={s.dashed ? "mm-line mm-line--carry" : "mm-line"}
              d={`M${f(s.x1)} ${f(s.y1)}L${f(s.x2)} ${f(s.y2)}`}
            />
          ))
        : null}

      {/* The climb-and-reset hairline, then the chips over it. */}
      {repsY
        ? hairlinePairs(model, view).map(([a, b]) => (
            <line
              key={`hair-${a}`}
              className="mm-hair"
              x1={f(xOf(a))}
              y1={f(repsY(cols[a].reps as number))}
              x2={f(xOf(b))}
              y2={f(repsY(cols[b].reps as number))}
            />
          ))
        : null}

      {chips.map((c) => {
        const col = cols[c.index];
        const at = { "data-chip": c.kind, "data-at": col.sessionId, "data-value": c.value, "data-cy": f(c.y) };
        if (c.kind === "reps") {
          return (
            <g key={`chip-${c.index}`} {...at}>
              <Chip x={c.x} y={c.y} label={String(c.value)} mark={col.mark} hatch={hatch} />
            </g>
          );
        }
        if (c.kind === "hold") {
          return (
            <g key={`hold-${c.index}`} {...at}>
              <Chip x={c.x} y={c.y} label={formatSeconds(c.value)} mark={col.mark} hatch={hatch} w={46} h={26} text="mm-cn mm-cn--hold" base={6} />
            </g>
          );
        }
        if (c.kind === "practice") {
          const flow = col.practice === "bloodFlow";
          // "P" / "BF" above the chip, or under it when the chip sits high in
          // the track, where the weight panel's pinned ring would meet it.
          const labelY = c.y - rRow.top < rRow.height / 2 ? c.y + 31 : c.y - 20;
          return (
            <g key={`prac-${c.index}`} {...at}>
              <rect className="mm-chip--practice" x={f(c.x - 20)} y={f(c.y - 15)} width={40} height={30} rx={6} />
              <text className="mm-cn mm-cn--muted" x={f(c.x)} y={f(c.y + 8)} textAnchor="middle">
                {c.value}
              </text>
              <text className={`mm-t mm-t--bold ${flow ? "mm-t--flow" : "mm-t--practice"}`} x={f(c.x)} y={f(labelY)} textAnchor="middle">
                {flow ? "BF" : "P"}
              </text>
            </g>
          );
        }
        // One side at a time: draw both halves once, at the first.
        const pair = sideChips.get(c.index) ?? [c];
        if (pair[0] !== c) return null;
        const top = rRow.top + 13;
        const bottom = rRow.top + rRow.height - 13;
        const left = pair.find((p) => p.side === "L");
        const right = pair.find((p) => p.side === "R");
        let yL = left?.y ?? null;
        let yR = right?.y ?? null;
        if (yL !== null && yR !== null && Math.abs(yL - yR) < 26) {
          const mid = Math.min(bottom - 13, Math.max(top + 13, (yL + yR) / 2));
          yL = mid - 13;
          yR = mid + 13;
        }
        const sideMark = (s: "L" | "R") => (s === "L" ? col.sides?.L?.mark : col.sides?.R?.mark) ?? null;
        return (
          <g key={`side-${c.index}`} {...at}>
            {yL !== null && yR !== null ? <line className="mm-bar" x1={f(c.x)} y1={f(yL)} x2={f(c.x)} y2={f(yR)} /> : null}
            {left && yL !== null ? (
              <Chip x={c.x} y={yL} label={`L ${left.value}`} mark={sideMark("L")} hatch={hatch} w={46} h={24} text="mm-cn mm-cn--side" base={5} />
            ) : null}
            {right && yR !== null ? (
              <Chip x={c.x} y={yR} label={`R ${right.value}`} mark={sideMark("R")} hatch={hatch} w={46} h={24} text="mm-cn mm-cn--side" base={5} />
            ) : null}
          </g>
        );
      })}

      {/* The dots on the weight line, practice rings off it, and the loads printed. */}
      {wy && wFrame
        ? inView.map((i) => {
            const c = cols[i];
            const x = xOf(i);
            if (c.outcome === "performed" && c.weight !== null) {
              const L = c.sides?.L;
              const R = c.sides?.R;
              if (L && R && L.weight !== null && R.weight !== null && L.weight !== R.weight) {
                const yl = wy(L.weight);
                const yr = wy(R.weight);
                return (
                  <g key={`dot-${i}`} data-dot={c.sessionId}>
                    <line className="mm-bar" x1={f(x)} y1={f(yl)} x2={f(x)} y2={f(yr)} />
                    <circle className="mm-dot" cx={f(x)} cy={f(yl)} r={5} />
                    <circle className="mm-dot" cx={f(x)} cy={f(yr)} r={5} />
                    <text className="mm-t mm-t--ink2" x={f(x + 9)} y={f(yl + 5)}>
                      L
                    </text>
                    <text className="mm-t mm-t--ink2" x={f(x + 9)} y={f(yr + 5)}>
                      R
                    </text>
                  </g>
                );
              }
              const y = wy(c.weight);
              return c.isHold ? (
                <rect key={`dot-${i}`} data-dot={c.sessionId} className="mm-dot" x={f(x - 5)} y={f(y - 5)} width={10} height={10} />
              ) : (
                <circle key={`dot-${i}`} data-dot={c.sessionId} className="mm-dot" cx={f(x)} cy={f(y)} r={5} />
              );
            }
            if (c.outcome === "practice" && c.weight !== null) {
              const flow = c.practice === "bloodFlow";
              const p = pinnedY(c.weight, wFrame, wy);
              const ring = flow ? "mm-ring--flow" : "mm-ring--practice";
              if (p.pinned) {
                return (
                  <g key={`ring-${i}`} data-ring={c.sessionId}>
                    <circle className={ring} cx={f(x - 10)} cy={f(p.y)} r={5} />
                    <text className={`mm-t ${flow ? "mm-t--flow" : "mm-t--practice"}`} x={f(x - 2)} y={f(p.y + 5)}>
                      {`${c.weight}${p.pinned === "below" ? "↓" : "↑"}`}
                    </text>
                  </g>
                );
              }
              return <circle key={`ring-${i}`} data-ring={c.sessionId} className={ring} cx={f(x)} cy={f(p.y)} r={5} />;
            }
            return null;
          })
        : null}
      {wy
        ? weightLabelIndexes(cols, view, folds)
            .filter((i) => colX.has(i))
            .map((i) => (
              <text key={`wl-${i}`} className="mm-wl" x={f(xOf(i))} y={f(wy(cols[i].weight as number) - 12)} textAnchor="middle" data-load={cols[i].sessionId}>
                {cols[i].weight}
              </text>
            ))
        : null}

      {/* The notes & skips lane. */}
      {lane.map((m, k) => {
        const top = m.items[0];
        const at = top.kind === "note" ? (top.note.place.kind === "column" ? cols[top.note.place.index]?.sessionId : top.note.place.kind) : top.col.sessionId;
        if (top.kind === "note") {
          const key = noteKeyOf(top.note);
          const Glyph = key.glyph;
          const off = m.count > 1 ? 6 : 0;
          return (
            <g key={`lane-${k}`} data-lane="note" data-at={at} data-count={m.count}>
              <Glyph x={f(m.x - 10 - off)} y={nRow.top + 10} size={20} className={GLYPH_CLASS[key.color]} aria-hidden="true" />
              {m.count > 1 ? (
                <>
                  <circle className="mm-badge" cx={f(m.x + 12)} cy={nRow.top + 12} r={10} />
                  <text className="mm-badge-t" x={f(m.x + 12)} y={nRow.top + 17} textAnchor="middle">
                    {m.count}
                  </text>
                </>
              ) : null}
            </g>
          );
        }
        if (top.kind === "skip") {
          const word = laneWord(top.col);
          return (
            <g key={`lane-${k}`} data-lane="skip" data-at={at} data-count={m.count}>
              <Ban x={f(m.x - 24)} y={nRow.top + 12} size={16} className="mm-g--muted" aria-hidden="true" />
              {m.count > 1 ? (
                <>
                  <circle className="mm-badge" cx={f(m.x + 12)} cy={nRow.top + 12} r={10} />
                  <text className="mm-badge-t" x={f(m.x + 12)} y={nRow.top + 17} textAnchor="middle">
                    {m.count}
                  </text>
                </>
              ) : word ? (
                <text className="mm-t mm-t--ink2" x={f(m.x - 5)} y={nRow.top + 25}>
                  {word}
                </text>
              ) : null}
            </g>
          );
        }
        return (
          <text key={`lane-${k}`} className="mm-t" x={f(m.x)} y={nRow.top + 25} textAnchor="middle" data-lane="unreached" data-at={at}>
            {laneWord(top.col)}
          </text>
        );
      })}

      {/* The date row: "Sep 17", today in the hero orange, the selected day in a pill. */}
      {inView.map((i) => {
        const c = cols[i];
        const x = xOf(i);
        const label = columnDateLabel(c);
        if (i === sel) {
          return (
            <g key={`date-${i}`}>
              <rect className="mm-pill" x={f(x - half + 2)} y={dRow.top + 3} width={COL_W - 4} height={22} rx={11} />
              <text className="mm-dl mm-dl--on" x={f(x)} y={dRow.top + 19} textAnchor="middle">
                {label}
              </text>
            </g>
          );
        }
        return (
          <g key={`date-${i}`}>
            {c.isToday ? <rect className="mm-today-bar" x={f(x - half)} y={0} width={COL_W} height={3} /> : null}
            <text className={c.isToday ? "mm-dl mm-dl--today" : "mm-dl"} x={f(x)} y={dRow.top + 19} textAnchor="middle" data-date={c.sessionId}>
              {label}
            </text>
          </g>
        );
      })}

      {sel !== null ? <rect className="mm-sel" x={f(xOf(sel) - half + 1)} y={1} width={COL_W - 2} height={dRow.top - 2} rx={4} /> : null}

      {/* Whole-column tap targets, on top of everything. */}
      {hitBands(view, colX).map((b) => {
        const c = cols[b.index];
        return (
          <rect
            key={`hit-${b.index}`}
            className="mm-hit"
            x={f(b.x)}
            y={0}
            width={b.width}
            height={H}
            data-col={c.sessionId}
            data-outcome={c.outcome}
            data-quality={c.mark ?? "none"}
            data-selected={b.index === sel ? "" : undefined}
            onClick={() => onTapColumn(b.index)}
          />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * The block
 * ------------------------------------------------------------------ */

export function MachineTimeline({
  model,
  ctx,
  width: forced,
  landscape = false,
  progress = null,
  knownElsewhere = false,
  sessionTotal = null,
  older = null,
  onRetry,
  onOpenNote,
  selectedSessionId,
  onSelectedChange,
}: MachineTimelineProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  /* Whether the card's width has been read once (the iPad round, Oct 6
     2026). Until it has, the Staircase is not drawn: the read happens before
     the first paint, so nobody sees the gap, and the chart is drawn once at
     its real width instead of once at a guessed width and again at the real
     one (the machine menu opened in 146 ms on an iPad 10th gen and 247 ms
     on an older iPad in the perf lab). A hidden card that measures 0 still
     draws at the fallback width, as it always did. */
  const [widthRead, setWidthRead] = useState(!!forced);
  const rawId = useId();
  const idBase = `mm${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  useLayoutEffect(() => {
    if (forced) return;
    const el = rootRef.current;
    if (!el) return;
    const read = () => {
      const w = el.clientWidth;
      // A hidden card measures 0: keep what we had until it is shown.
      if (w > 0) setMeasured(Math.round(w));
      setWidthRead(true);
    };
    read();
    if (typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [forced]);

  const contentWidth = Math.max(GUTTER_W + COL_W, forced ?? measured ?? TIMELINE_FALLBACK_WIDTH);
  const plotWidth = plotWidthOf(contentWidth);
  const state = chartState(model, { knownElsewhere });
  const cols = model.columns;
  const n = cols.length;
  const folds = useMemo(() => foldFlags(model), [model]);
  const wall = model.startWall;

  // The selection: the host's when it holds one, else the block's own.
  const controlled = selectedSessionId !== undefined;
  const [ownSelected, setOwnSelected] = useState<string | null>(null);
  const selectedId = controlled ? (selectedSessionId ?? null) : ownSelected;
  const setSelectedId = (id: string | null) => {
    if (!controlled) setOwnSelected(id);
    onSelectedChange?.(id);
  };

  // The window, kept by the session at its right edge (null: the newest), so
  // Load older or a new width never jumps it somewhere else.
  const [endId, setEndId] = useState<string | null>(null);
  const endFound = endId ? cols.findIndex((c) => c.sessionId === endId) : -1;
  const view = fitWindow(n, folds, endFound >= 0 ? endFound : n - 1, plotWidth, wall);
  const endIdOf = (w: ViewWindow): string | null => (w.end < 0 || w.end >= n - 1 ? null : cols[w.end].sessionId);
  const selIndex = selectedId ? cols.findIndex((c) => c.sessionId === selectedId) : -1;

  // A selection made anywhere (a tap, a step, the host's "Last changed") is
  // brought into view once.
  const [followed, setFollowed] = useState<string | null>(null);
  if (selectedId !== followed) {
    setFollowed(selectedId);
    if (selIndex >= 0 && (selIndex < view.start || selIndex > view.end)) {
      setEndId(endIdOf(windowShowing(selIndex, view, n, folds, plotWidth, wall)));
    }
  }

  // After Load older, the window ends at what used to be the oldest column,
  // so the sessions just read are the ones in view.
  const firstId = cols[0]?.sessionId ?? null;
  const [seenFirst, setSeenFirst] = useState(firstId);
  const [pendingOlder, setPendingOlder] = useState<string | null>(null);
  if (firstId !== seenFirst) {
    setSeenFirst(firstId);
    if (pendingOlder) {
      if (firstId !== pendingOlder && cols.some((c) => c.sessionId === pendingOlder)) setEndId(pendingOlder);
      setPendingOlder(null);
    }
  }

  const [lists, setLists] = useState({ sessions: false, runs: false });
  const runCount = useMemo(() => countedRuns(stepRuns(model)), [model]);

  const select = (index: number) => {
    const col = cols[index];
    if (!col) return;
    setEndId(endIdOf(windowShowing(index, view, n, folds, plotWidth, wall)));
    setSelectedId(col.sessionId);
  };
  const tapColumn = (index: number) => {
    if (cols[index]?.sessionId === selectedId) setSelectedId(null);
    else select(index);
  };
  const step = (dir: -1 | 1) => {
    const next = selIndex >= 0 ? selIndex + dir : view.end;
    if (next >= 0 && next < n) select(next);
  };
  const pageOlder = () => {
    if (view.start > 0) setEndId(endIdOf(olderWindow(view, n, folds, plotWidth, wall)));
  };
  const pageNewer = () => setEndId(endIdOf(newerWindow(view, n, folds, plotWidth, wall)));
  const overviewTap = (index: number) => {
    setEndId(endIdOf(windowAround(index, n, folds, plotWidth, wall)));
    setSelectedId(cols[index]?.sessionId ?? null);
  };
  const overviewDrag = (index: number) => setEndId(endIdOf(windowAround(index, n, folds, plotWidth, wall)));
  const loadOlder = () => {
    if (!older || older.state === "loading") return;
    setPendingOlder(firstId);
    older.onLoad();
  };

  const onPlotKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (n === 0) return;
    if (e.key === "ArrowLeft") step(-1);
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "Home") select(0);
    else if (e.key === "End") select(n - 1);
    else if (e.key === "Escape" && selectedId) {
      // Back to the summary only: the dialog's own Escape (Base UI's dismiss,
      // which ignores defaultPrevented) must not close the card as well.
      setSelectedId(null);
      e.stopPropagation();
    } else return;
    e.preventDefault();
  };

  const before = beforeJourneyLine(sessionTotal, ctx.coverage);
  const beforeLine = before ? <p className="mm-before">{before}</p> : null;
  const canLoad = model.moreToLoad && !!older;
  const olderMessage =
    canLoad && older?.state === "failed" ? PAGING_WORDS.failed : canLoad && older?.state === "offline" ? PAGING_WORDS.offline : null;

  const loadButton = (label: string = PAGING_WORDS.loadOlder) =>
    older ? (
      <button type="button" className="mm-pg-btn" disabled={older.state === "loading"} onClick={loadOlder} data-load-older="">
        {older.state === "loading" ? PAGING_WORDS.loading : older.state === "failed" ? RETRY : label}
      </button>
    ) : null;

  /** The controls row: ‹ Older (or Load older), the overview strip and Newer ›. */
  const controls = (chart: boolean) => {
    const strip = chart && needsOverview(n, folds, plotWidth, wall);
    let olderButton: ReactNode = null;
    if (chart && view.start > 0) {
      olderButton = (
        <button type="button" className="mm-pg-btn" onClick={pageOlder} data-page="older">
          <ChevronLeft size={18} aria-hidden="true" />
          {PAGING_WORDS.older}
        </button>
      );
    } else if (canLoad) {
      olderButton = loadButton();
    } else if (strip) {
      olderButton = (
        <button type="button" className="mm-pg-btn" disabled data-page="older">
          <ChevronLeft size={18} aria-hidden="true" />
          {PAGING_WORDS.older}
        </button>
      );
    }
    if (!olderButton && !strip) return null;
    return (
      <>
        <div className="mm-ctrl">
          {olderButton}
          {strip ? (
            <>
              <OverviewStrip
                model={model}
                view={view}
                today={ctx.today}
                fallbackWidth={contentWidth - 2 * (PAGING_BUTTON_W + CONTROLS_GAP)}
                onTap={overviewTap}
                onDrag={overviewDrag}
              />
              <button type="button" className="mm-pg-btn" disabled={view.end >= n - 1} onClick={pageNewer} data-page="newer">
                {PAGING_WORDS.newer}
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
        {olderMessage ? (
          <p className="mm-ctrl__msg" role="status">
            {olderMessage}
          </p>
        ) : null}
      </>
    );
  };

  let body: ReactNode;
  switch (state) {
    case "loading":
      body = (
        <div className="mm-readout">
          <LoadingMark size="sm" label={stateLine("loading", model, ctx) ?? ""} />
        </div>
      );
      break;
    case "failed":
      body = (
        <div className="mm-chart__retry">
          <p className="mm-chart__state" role="status">
            {stateLine("failed", model, ctx)}
          </p>
          {onRetry ? (
            <button type="button" className="mm-retry" onClick={onRetry}>
              {RETRY}
            </button>
          ) : null}
        </div>
      );
      break;
    case "elsewhere":
      body = (
        <>
          <p className="mm-chart__state">{stateLine("elsewhere", model, ctx)}</p>
          {canLoad ? <div className="mm-ctrl">{loadButton(PAGING_WORDS.loadThem)}</div> : null}
          {olderMessage ? (
            <p className="mm-ctrl__msg" role="status">
              {olderMessage}
            </p>
          ) : null}
          {beforeLine}
        </>
      );
      break;
    case "nothing":
      body = (
        <>
          {controls(false)}
          {beforeLine}
        </>
      );
      break;
    case "one": {
      const sentence = usageLine(model, ctx);
      body = (
        <>
          <p className="mm-chart__state">
            {sentence ? <UsageWords sentence={sentence} progress={progress} /> : null}. {ONE_SESSION_TAIL}
          </p>
          {controls(false)}
          {beforeLine}
        </>
      );
      break;
    }
    case "practice-only":
    case "uncounted":
      body = (
        <>
          <p className="mm-chart__state">{stateLine(state, model, ctx)}</p>
          {controls(false)}
          {beforeLine}
        </>
      );
      break;
    default:
      body = (
        <>
          <TimelineReadout
            model={model}
            ctx={ctx}
            view={view}
            selected={selIndex >= 0 ? selIndex : null}
            progress={progress}
            eventMax={Math.max(40, Math.floor(contentWidth / 8))}
            onStep={step}
            onClose={() => setSelectedId(null)}
            onOpenNote={onOpenNote}
          />
          {/* A group, so its name (and the keys it takes) is announced: a role-less div's label is dropped. */}
          <div className="mm-plot" role="group" tabIndex={0} aria-label={PLOT_LABEL} onKeyDown={onPlotKey}>
            {widthRead || forced ? (
              <StaircasePlot
                model={model}
                ctx={ctx}
                view={view}
                contentWidth={contentWidth}
                landscape={landscape}
                selected={selIndex >= 0 ? selIndex : null}
                idBase={idBase}
                onTapColumn={tapColumn}
              />
            ) : null}
          </div>
          {!model.notesRead ? <p className="mm-chart__note">{NOTES_UNREAD_LINE}</p> : null}
          {controls(true)}
          {beforeLine}
          <div className="mm-lists">
            <button
              type="button"
              className="mm-list-btn"
              aria-expanded={lists.sessions}
              aria-controls={`${idBase}-sessions`}
              onClick={() => setLists((l) => ({ ...l, sessions: !l.sessions }))}
            >
              {sessionsButtonLabel(n)}
            </button>
            <button
              type="button"
              className="mm-list-btn"
              aria-expanded={lists.runs}
              aria-controls={`${idBase}-runs`}
              onClick={() => setLists((l) => ({ ...l, runs: !l.runs }))}
            >
              {runsButtonLabel(runCount)}
            </button>
          </div>
          {lists.sessions ? <SessionList id={`${idBase}-sessions`} model={model} ctx={ctx} /> : null}
          {lists.runs ? <WeightRuns id={`${idBase}-runs`} model={model} ctx={ctx} /> : null}
        </>
      );
  }

  return (
    <section ref={rootRef} className="mm-chart" aria-labelledby={`${idBase}-h`} data-state={state} data-width={contentWidth}>
      <div className="mm-chart__head">
        <h3 id={`${idBase}-h`} className="mm-chart__title">
          {chartHeading(ctx.name)}
        </h3>
      </div>
      {model.readState === "cache-only" && state !== "failed" && state !== "loading" ? (
        <p className="mm-chart__note" role="status">
          {CACHE_ONLY_LINE}
        </p>
      ) : null}
      {body}
    </section>
  );
}
