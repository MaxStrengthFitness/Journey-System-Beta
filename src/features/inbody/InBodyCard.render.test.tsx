// @vitest-environment jsdom
/**
 * THE INBODY READERS ON SCREEN obey the client's HOME studio's variation
 * (client codex, Sep 2026; AJ's decision 8).
 *
 * The pure words are pinned in scans.test.ts and variation.test.ts. What only
 * a mount can show: that the card, the progress report's section and the
 * renewals pipeline's lookup actually look the numbers up for the CLIENT'S
 * studio (not the studio the iPad is in), from the studios already in
 * context, and render the withheld call.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "u1" } } }));

const Y = new Date().getFullYear();
/** Jan 15 → Sep 2: muscle +1.2 lb, fat mass −3.1 lb, body fat −1.3 points, weight −2.0 lb. */
const SCANS = [
  { id: "a", testedAt: `${Y}-01-15`, weightLb: 176.2, skeletalMuscleMassLb: 65.8, bodyFatMassLb: 58.9, percentBodyFat: 33.4 },
  { id: "b", testedAt: `${Y}-09-02`, weightLb: 174.2, skeletalMuscleMassLb: 67.0, bodyFatMassLb: 55.8, percentBodyFat: 32.1 },
];
let scans = SCANS;
const listeners: string[] = [];

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  query: (q: unknown) => q,
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: (target: { path: string }, next: (s: unknown) => void) => {
    listeners.push(target.path);
    const t = setTimeout(() => next({ docs: scans.map(({ id, ...data }) => ({ id, data: () => data })) }), 0);
    return () => clearTimeout(t);
  },
  writeBatch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
  serverTimestamp: () => "NOW",
  deleteField: () => "DELETE",
}));

vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }),
}));

// The iPad is at Westlake (Max Strength's defaults); the client's home is
// Solon, which set its own, tighter, muscle number.
let studios: Array<Record<string, unknown>> = [];
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "westlake", activeStudio: { id: "westlake" }, studios }),
}));

const { InBodyCard } = await import("./InBodyCard");
const { InBodyReportSection } = await import("./InBodyReportSection");
const { DEFAULT_INBODY_VARIATION, normalizeInBodyVariation } = await import("./variation");
const { useInBodyVariationLookup } = await import("./useInBodyVariation");
const { scanFromDoc } = await import("./scans");
import type { Client } from "../../types";

const carol = { id: "carol", firstName: "Carol", lastName: "Tester", homeStudioId: "solon" } as unknown as Client;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<StrictMode>{node}</StrictMode>);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

/** The smallest element whose own text is exactly `text`. */
const byText = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll<HTMLElement>("p, td, span")].find((n) => n.textContent?.trim() === text);

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
  scans = SCANS;
  studios = [];
  listeners.length = 0;
});

describe("the InBody card", () => {
  it("shows a change inside the variation with its number, uncoloured, and says so in the sentence", async () => {
    studios = [{ id: "solon" }, { id: "westlake" }];
    const el = await mount(<InBodyCard client={carol} authTrainer={null} />);
    const muscle = byText(el, "+1.2 lb · within normal variation");
    expect(muscle).toBeTruthy();
    // Inside the variation: no colour of good news (the codex tokens: data-tone).
    expect(muscle!.dataset.tone).toBe("neutral");
    expect(byText(el, "−1.3 pts · within normal variation")).toBeTruthy();
    // Weight has no variation and is never coloured.
    expect(byText(el, "−2.0 lb")).toBeTruthy();
    expect(el.textContent).toContain("Since Jan 15: no change bigger than the scanner's normal variation.");
    expect(el.textContent).not.toContain("muscle up");
    // The scans are the only thing read: the variation is a lookup.
    expect(listeners.length).toBeGreaterThan(0);
    expect(listeners.every((p) => p === "clients/carol/inbodyScans")).toBe(true);
  });

  it("uses the client's HOME studio's numbers, not the studio the iPad is in", async () => {
    studios = [
      { id: "solon", inbodyVariation: { skeletalMuscleMassLb: 1, updatedBy: "u9" } },
      { id: "westlake" },
    ];
    const el = await mount(<InBodyCard client={carol} authTrainer={null} />);
    const muscle = byText(el, "+1.2 lb");
    expect(muscle).toBeTruthy();
    expect(muscle!.dataset.tone).toBe("good");
    expect(el.textContent).toContain("Since Jan 15: muscle up 1.2 lb; body fat within the scanner's normal variation.");
  });

  it("falls back to Max Strength's defaults while the studios have not arrived", async () => {
    const el = await mount(<InBodyCard client={carol} authTrainer={null} />);
    expect(byText(el, "+1.2 lb · within normal variation")).toBeTruthy();
  });
});

// Client codex: the Notes & Profile tab reads the scans ONCE and hands the
// same state to every page that shows them.
describe("the InBody card given the tab's scans", () => {
  const handed = () => SCANS.map(({ id, ...data }) => scanFromDoc(id, data)!);

  it("draws the scans it is handed and opens no listener of its own", async () => {
    studios = [{ id: "solon" }];
    const el = await mount(
      <InBodyCard client={carol} authTrainer={null} inbody={{ scans: handed(), loading: false, error: null }} />,
    );
    expect(listeners).toHaveLength(0);
    expect(byText(el, "+1.2 lb · within normal variation")).toBeTruthy();
    expect(el.textContent).toContain("Since Jan 15: no change bigger than the scanner's normal variation.");
  });

  it("says a handed-in failure, never 'No InBody scans yet'", async () => {
    const el = await mount(
      <InBodyCard
        client={carol}
        authTrainer={null}
        inbody={{ scans: [], loading: false, error: "Couldn't load InBody scans." }}
      />,
    );
    expect(listeners).toHaveLength(0);
    expect(el.textContent).toContain("Couldn't load InBody scans.");
    expect(el.textContent).not.toContain("No InBody scans yet");
  });

  it("says loading while the handed-in read has not answered", async () => {
    const el = await mount(
      <InBodyCard client={carol} authTrainer={null} inbody={{ scans: [], loading: true, error: null }} />,
    );
    expect(el.textContent).toContain("Loading scans…");
    expect(el.textContent).not.toContain("No InBody scans yet");
  });
});

// Client codex, phase 12: the card is drawn with the codex kit and tokens.
describe("the InBody card on Body & Pulse", () => {
  const handed = () =>
    SCANS.map(({ id, ...data }) => scanFromDoc(id, { ...data, enteredByName: "Jess Moreno", device: "InBody 270S" })!);

  it("draws no trend lines when the page draws them (showTrends false)", async () => {
    const el = await mount(
      <InBodyCard client={carol} authTrainer={null} inbody={{ scans: handed(), loading: false, error: null }} showTrends={false} />,
    );
    expect(el.querySelector(".ib-trends")).toBeNull();
    expect(el.textContent).not.toContain("Trend lines appear");
    const withTrends = await mount(
      <InBodyCard client={carol} authTrainer={null} inbody={{ scans: handed(), loading: false, error: null }} />,
    );
    expect(withTrends.querySelector(".ib-trends")).not.toBeNull();
  });

  it("lists every scan with who entered it, at every width, and cuts nothing", async () => {
    const el = await mount(
      <InBodyCard client={carol} authTrainer={null} inbody={{ scans: handed(), loading: false, error: null }} showTrends={false} />,
    );
    const toggle = [...el.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Every scan"))!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle.click());
    const rows = el.querySelectorAll(".ib-scan");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Jess Moreno");
    // No Tailwind colour, no truncate, no hidden-at-a-width class left on the card.
    expect(el.innerHTML).not.toMatch(/truncate|emerald|amber|sky-|slate-|hidden sm:/);
  });

  it("gives Add scan 40px or more (the kit's button) to a trainer who may record", async () => {
    const trainer = { id: "t1", role: "LifeTransformer", primaryHomeStudioId: "solon" } as never;
    const el = await mount(<InBodyCard client={carol} authTrainer={trainer} inbody={{ scans: [], loading: false, error: null }} />);
    const add = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Add scan"));
    expect(add?.className).toContain("cx-btn");
  });
});

describe("the renewals pipeline's lookup", () => {
  it("reads each row's client against their own home studio, not the studio the iPad is in", async () => {
    studios = [
      { id: "solon", inbodyVariation: { skeletalMuscleMassLb: 1 } },
      { id: "westlake", inbodyVariation: { skeletalMuscleMassLb: 6 } },
    ];
    function Rows() {
      const variationFor = useInBodyVariationLookup();
      const rows = [carol, { id: "wes", homeStudioId: "westlake" }, { id: "old", studioId: "solon" }, { id: "none" }];
      return (
        <ul>
          {rows.map((c) => (
            <li key={c.id}>{`${c.id}:${variationFor(c).skeletalMuscleMassLb}`}</li>
          ))}
        </ul>
      );
    }
    const el = await mount(<Rows />);
    expect([...el.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
      "carol:1",
      "wes:6",
      "old:1",
      `none:${DEFAULT_INBODY_VARIATION.skeletalMuscleMassLb}`,
    ]);
  });
});

describe("the progress report's Body Composition", () => {
  it("prints the withheld call, and says what it means once", async () => {
    const el = await mount(
      <InBodyReportSection clientId="carol" reportDate={`${Y}-09-10`} variation={DEFAULT_INBODY_VARIATION} />,
    );
    expect(byText(el, "+1.2 lb · within normal variation")).toBeTruthy();
    expect(el.textContent).toContain("Within normal variation: smaller than the difference an InBody scanner can show");
  });

  it("prints plain changes, and no note, when every change is beyond the studio's numbers", async () => {
    const tight = normalizeInBodyVariation({ skeletalMuscleMassLb: 1, bodyFatMassLb: 3, percentBodyFat: 1 });
    const el = await mount(<InBodyReportSection clientId="carol" reportDate={`${Y}-09-10`} variation={tight} />);
    expect(byText(el, "+1.2 lb")).toBeTruthy();
    expect(byText(el, "−3.1 lb")).toBeTruthy();
    expect(el.textContent).not.toContain("within normal variation");
    expect(el.textContent).not.toContain("Within normal variation");
  });

  it("prints no note for an unchanged weight when every other change is called", async () => {
    // Weight 174.2 → 174.2 ("no change"); muscle +4.1, fat mass −6.0, body
    // fat −3.0: all beyond the defaults. No cell says "within", so neither
    // may the footnote.
    scans = [
      { id: "a", testedAt: `${Y}-01-15`, weightLb: 174.2, skeletalMuscleMassLb: 65.8, bodyFatMassLb: 58.9, percentBodyFat: 33.4 },
      { id: "b", testedAt: `${Y}-09-02`, weightLb: 174.2, skeletalMuscleMassLb: 69.9, bodyFatMassLb: 52.9, percentBodyFat: 30.4 },
    ];
    const el = await mount(
      <InBodyReportSection clientId="carol" reportDate={`${Y}-09-10`} variation={DEFAULT_INBODY_VARIATION} />,
    );
    expect(byText(el, "no change")).toBeTruthy();
    expect(byText(el, "+4.1 lb")).toBeTruthy();
    expect(byText(el, "−6.0 lb")).toBeTruthy();
    expect(byText(el, "−3.0 pts")).toBeTruthy();
    expect(el.textContent).not.toContain("within normal variation");
    expect(el.textContent).not.toContain("Within normal variation");
  });
});
