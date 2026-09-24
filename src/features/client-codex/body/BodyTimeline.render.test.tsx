// @vitest-environment jsdom
/**
 * THE OVER TIME TIMELINE, MOUNTED (client codex, phase 13).
 *
 * BodyTimeline measures its own width in a layout effect, and a throw there
 * takes the whole profile down (KNOWN-TRAPS → React), so only a mount proves:
 *
 *   - it mounts with NO ResizeObserver (jsdom has none) at the fallback width,
 *     and follows one when there is;
 *   - the lanes draw in the model's order, each strip with a <desc> that says
 *     the lane in words;
 *   - the variation band is drawn for skeletal muscle, never for weight;
 *   - a session where the question was not asked draws no mark;
 *   - nothing is red: no alert token or class anywhere, in the markup or in
 *     the timeline's rules in body.css;
 *   - a loading lane is the one loading mark, a failed one its sentence.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DialValue, PreSessionCheckIn, WorkoutSession } from "../../../types";
import { DEFAULT_INBODY_VARIATION } from "../../inbody/variation";
import { scanFromDoc } from "../../inbody/scans";
import { historyFromDocs } from "../../subjective-report/assessment-history";
import { emptyAssessment } from "../../subjective-report/scoring";
import { pronounsOf } from "../kit/pronouns";
import { readArrivals } from "./arrivals";
import { BodyTimeline, TIMELINE_FALLBACK_WIDTH } from "./BodyTimeline";
import { buildTimeline, timelineWindow, type TimelineInput } from "./timeline";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2027, 2, 24, 12);
const W = timelineWindow("2027-03-24");
const her = pronounsOf({ gender: "Female" });

let seq = 0;
const session = (date: string, recovery?: DialValue): WorkoutSession => {
  seq += 1;
  return {
    id: `s${seq}`,
    clientId: "c1",
    date,
    status: "Completed",
    preSessionCheckIn: { readiness: recovery === undefined ? {} : { recovery } } as PreSessionCheckIn,
  } as WorkoutSession;
};

const round = (id: string, date: string, value: number) => ({
  id,
  date,
  status: "Finalized",
  subjective: { ...emptyAssessment({ bodyWeightLbs: null }), scaleVersion: 2, answers: { sleepRecovery_2: { value } } },
  createdAt: `${date}T15:00:00Z`,
});

const scan = (id: string, testedAt: string, muscle: number, weight: number) =>
  scanFromDoc(id, { testedAt, weightLb: weight, skeletalMuscleMassLb: muscle, bodyFatMassLb: 48, percentBodyFat: 34 })!;

function model(over: Partial<TimelineInput> = {}) {
  return buildTimeline({
    window: W,
    arrivals: readArrivals({
      sessions: [session("2027-03-20", -1), session("2027-03-13"), session("2027-03-06", 0), session("2027-02-27", 1)],
      state: "ready",
      window: W,
      limit: 40,
    }),
    pulseStatus: "ready",
    source: { draft: null, history: historyFromDocs([round("r2", "2027-03-10", 8), round("r1", "2026-12-09", 5)], 50) },
    inbody: {
      scans: [scan("a", "2026-10-02", 47.1, 145), scan("b", "2027-03-03", 48.3, 142)],
      loading: false,
      error: null,
    },
    variation: DEFAULT_INBODY_VARIATION,
    variationOwner: null,
    coverage: "complete",
    prior: null,
    pronouns: her,
    now: NOW,
    ...over,
  });
}

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(node: ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  mounted.push({ root, host });
  return host;
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
  delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
});

describe("BodyTimeline", () => {
  it("mounts with no ResizeObserver, at the fallback width", async () => {
    expect(typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver).toBe("undefined");
    const host = await mount(<BodyTimeline model={model()} />);
    const tl = host.querySelector<HTMLElement>(".bp-tl")!;
    expect(tl.getAttribute("data-width")).toBe(String(TIMELINE_FALLBACK_WIDTH));
    expect(host.querySelector(".bp-tl__plot")?.getAttribute("width")).toBe(String(TIMELINE_FALLBACK_WIDTH));
  });

  it("draws at the width a ResizeObserver reports, and stops observing when it goes", async () => {
    let disconnected = 0;
    class FakeObserver {
      constructor(private cb: () => void) {}
      observe(el: HTMLElement) {
        Object.defineProperty(el, "clientWidth", { configurable: true, value: 900 });
        this.cb();
      }
      disconnect() {
        disconnected += 1;
      }
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeObserver;
    const host = await mount(<BodyTimeline model={model()} />);
    expect(host.querySelector(".bp-tl")?.getAttribute("data-width")).toBe("900");
    expect(host.querySelector(".bp-tl__plot")?.getAttribute("viewBox")).toBe("0 0 900 56");
    await act(async () => mounted[0].root.unmount());
    mounted = [];
    expect(disconnected).toBe(1);
  });

  it("draws the lanes in the model's order, each strip saying its lane in words", async () => {
    const m = model();
    const host = await mount(<BodyTimeline model={m} />);
    const lanes = Array.from(host.querySelectorAll(".bp-tl__lane")).map((l) => l.getAttribute("data-lane"));
    expect(lanes).toEqual(m.lanes.map((l) => l.key));
    expect(lanes[0]).toBe("arrive:recovery");
    expect(lanes[lanes.length - 1]).toBe("inbody:weightLb");
    for (const lane of m.lanes) {
      const svg = host.querySelector(`svg[data-lane="${lane.key}"]`)!;
      expect(svg.getAttribute("role")).toBe("img");
      expect(svg.querySelector("desc")?.textContent).toBe(lane.desc);
    }
    // A lane's title and lines are text in the page (they wrap), not only in the drawing.
    const recovery = host.querySelector('[data-lane="arrive:recovery"] .bp-tl__head')!;
    expect(recovery.textContent).toContain("“How's the body since last time?”");
  });

  it("draws the variation band for skeletal muscle and never for weight", async () => {
    const host = await mount(<BodyTimeline model={model()} />);
    expect(host.querySelector('svg[data-lane="inbody:skeletalMuscleMassLb"] rect.bp-tl__band')).not.toBeNull();
    expect(host.querySelector('svg[data-lane="inbody:weightLb"] rect.bp-tl__band')).toBeNull();
  });

  it("draws a mark only where the question was asked — none for 'not asked'", async () => {
    const host = await mount(<BodyTimeline model={model()} />);
    const marks = host.querySelectorAll('svg[data-lane="arrive:recovery"] rect.bp-tl__mark');
    expect(marks).toHaveLength(3);
    expect(host.querySelectorAll('svg[data-lane="arrive:recovery"] rect.bp-tl__mark[data-below]')).toHaveLength(1);
  });

  it("uses no red: no alert token or class in the markup, or in the timeline's rules", async () => {
    const host = await mount(<BodyTimeline model={model()} />);
    expect(host.innerHTML).not.toMatch(/alert/i);
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "body.css"), "utf8");
    const rules = css.split("}").filter((r) => /\.bp-tl|\.bp-lg-m/.test(r));
    expect(rules.length).toBeGreaterThan(5);
    for (const r of rules) expect(r).not.toMatch(/alert|hero/);
  });

  it("shows one loading mark while her sessions load, and a failed read's sentence", async () => {
    const loading = await mount(
      <BodyTimeline model={model({ arrivals: readArrivals({ sessions: [], state: "loading", window: W, limit: 40 }) })} />,
    );
    const gap = loading.querySelector('[data-lane="gap:sessions"]')!;
    expect(gap.querySelector('[role="status"]')?.getAttribute("aria-label")).toBe("Loading her recent sessions…");
    expect(gap.querySelector("svg.bp-tl__plot")).toBeNull();

    const failed = await mount(
      <BodyTimeline model={model({ arrivals: readArrivals({ sessions: [], state: "failed", window: W, limit: 40 }) })} />,
    );
    expect(failed.querySelector('[data-lane="gap:sessions"]')?.textContent).toContain(
      "Her recent sessions couldn't be loaded just now",
    );
    expect(failed.textContent).not.toContain("Try again");
    // The rest still draws.
    expect(failed.querySelector('svg[data-lane="pulse:sleepRecovery_2"]')).not.toBeNull();
  });

  it("keeps a point's word off the gutter's words at the start of the window", async () => {
    const m = model({
      source: { draft: null, history: historyFromDocs([round("r2", "2027-03-10", 8), round("r1", "2026-09-24", 5)], 50) },
    });
    const host = await mount(<BodyTimeline model={m} width={640} />);
    const labels = Array.from(host.querySelectorAll('svg[data-lane="pulse:sleepRecovery_2"] text.bp-tl__label'));
    const first = labels.find((t) => t.textContent === "Sometimes")!;
    expect(first.getAttribute("text-anchor")).toBe("start");
    // The gutter's words end at 112; the word starts right of them.
    expect(Number(first.getAttribute("x"))).toBeGreaterThan(112);
    const last = labels.find((t) => t.textContent === "Often")!;
    expect(last.getAttribute("text-anchor")).toBe("middle");
  });

  it("puts the month axis under the last lane, with today at the end", async () => {
    const host = await mount(<BodyTimeline model={model()} />);
    const axis = host.querySelector("svg.bp-tl__axis")!;
    expect(axis.getAttribute("aria-hidden")).toBe("true");
    expect(axis.textContent).toContain("Jan 2027");
    expect(axis.textContent).toContain("today");
  });
});
