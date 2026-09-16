// @vitest-environment jsdom
/**
 * Mounts the 4 P's step. It proves that each P is ONE Dial on the mastery
 * scale (no red/black/green, no 1–5 buttons), that a tap on "Strong" stores
 * rank 4 as the report's `score` (80) and derives the talking points'
 * status ("green"), and that no digit 1–5 is on screen as a rank.
 */
import { afterEach, describe, expect, it } from "vitest";
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { FourPsStep, type PerformanceMatrix } from "./FourPsStep";
import { FourPsCards } from "./ClientReportSections";
import { rankFromScore } from "./four-ps";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  mounted.push({ root, host });
  return host;
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

const tp = (id: string) => ({ id, text: id, status: "black" as const });

function fresh(): PerformanceMatrix {
  return {
    posture: { score: 0, note: "", talkingPoints: [tp("pos-1"), tp("pos-2")] },
    pace: { score: 0, note: "", talkingPoints: [tp("pac-1")] },
    path: { score: 0, note: "", talkingPoints: [] },
    purpose: { score: 0, note: "", talkingPoints: [] },
  };
}

function Harness({ initial, onValue }: { initial: PerformanceMatrix; onValue?: (v: PerformanceMatrix) => void }) {
  const [v, setV] = useState(initial);
  return (
    <FourPsStep
      value={v}
      onChange={(n) => {
        setV(n);
        onValue?.(n);
      }}
    />
  );
}

describe("FourPsStep", () => {
  it("draws four mastery dials and nothing else that rates", async () => {
    const host = await mount(<Harness initial={fresh()} />);
    const dials = host.querySelectorAll('[data-scale="mastery"]');
    expect(dials).toHaveLength(4);
    // Five radios per dial, all resting.
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(20);
    expect(
      Array.from(host.querySelectorAll('[role="radio"]')).every((r) => r.getAttribute("aria-checked") === "false"),
    ).toBe(true);
    // Every dial rests on "Not rated" — nothing defaulted.
    expect(Array.from(host.querySelectorAll(".rt__word")).map((w) => w.textContent)).toEqual(
      Array(4).fill("Not rated"),
    );
  });

  it("tapping Strong stores rank 4 (score 80) and derives status green", async () => {
    const seen: PerformanceMatrix[] = [];
    const host = await mount(<Harness initial={fresh()} onValue={(v) => seen.push(v)} />);
    const posture = host.querySelector('[data-testid="fourps-dial-posture"]')!;
    const strong = Array.from(posture.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find((r) =>
      (r.getAttribute("aria-label") ?? "").startsWith("Strong"),
    )!;
    await act(async () => strong.click());

    const last = seen[seen.length - 1];
    expect(last.posture.score).toBe(80);
    expect(rankFromScore(last.posture.score)).toBe(4);
    expect(last.posture.talkingPoints.map((t) => t.status)).toEqual(["green", "green"]);
    // The other three are untouched.
    expect(last.pace.score).toBe(0);
    expect(last.pace.talkingPoints[0].status).toBe("black");
    expect(posture.querySelector(".rt__word")?.textContent).toBe("Strong");
  });

  it("shows words, never a rank digit", async () => {
    const m = fresh();
    m.pace.score = 100;
    m.path.score = 20;
    const host = await mount(<Harness initial={m} />);
    // Rank labels like "4 / 5" or "Rank 3" must not exist. The definitions
    // legitimately contain "6-to-10-second", so the check is on the dials
    // and the words, not the whole card.
    for (const d of host.querySelectorAll('[data-scale="mastery"]')) {
      expect(d.textContent ?? "").not.toMatch(/\d/);
    }
    expect(host.textContent ?? "").not.toMatch(/\b[1-5]\s*\/\s*5\b/);
    expect(host.textContent ?? "").not.toMatch(/\bRank\b/i);
    expect(host.querySelector('[data-testid="fourps-dial-pace"] .rt__word')?.textContent).toBe("Mastered");
    expect(host.querySelector('[data-testid="fourps-dial-path"] .rt__word')?.textContent).toBe("Needs work");
  });

  it("include in summary keeps working and the note is the trainer's own", async () => {
    const seen: PerformanceMatrix[] = [];
    const host = await mount(<Harness initial={fresh()} onValue={(v) => seen.push(v)} />);
    const include = host.querySelector<HTMLButtonElement>('[data-p="purpose"] .pr-p__include')!;
    expect(include.getAttribute("aria-pressed")).toBe("false");
    await act(async () => include.click());
    expect(include.getAttribute("aria-pressed")).toBe("true");
    expect(seen[seen.length - 1].includedNotes).toHaveLength(1);
    expect(host.querySelector(".pr-fourps__summary")).not.toBeNull();
    await act(async () => include.click());
    expect(seen[seen.length - 1].includedNotes).toEqual([]);
  });
});

describe("FourPsCards (client copy)", () => {
  it("prints the mastery word, never the number, and says Not rated honestly", async () => {
    const m = fresh();
    m.posture.score = 80;
    m.posture.note = "Chin stayed tucked all set";
    m.pace.score = 20;
    const host = await mount(<FourPsCards value={m} />);
    const words = Array.from(host.querySelectorAll(".pr-pcard__word")).map((w) => w.textContent);
    expect(words).toEqual(["Strong", "Needs work", "Not rated", "Not rated"]);
    expect(host.textContent ?? "").not.toMatch(/\d/);
    expect(host.querySelector(".pr-pcard__note")?.textContent).toContain("Chin stayed tucked");
    // Four filled segments for Strong, one for Needs work, none unrated.
    const filled = (tone: string) => host.querySelectorAll(`.pr-pcard[data-tone="${tone}"] [data-on="true"]`).length;
    expect(filled("ok")).toBe(4);
    expect(filled("alert")).toBe(1);
    expect(filled("none")).toBe(0);
  });
});
