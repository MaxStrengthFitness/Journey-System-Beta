// @vitest-environment jsdom
/**
 * THE HUB GRID, MOUNTED (calm Hub round, Sep 28 2026): blocks at their real
 * length, the empty middle of the day folded (a tap opens it), your column
 * pinned, the off hours of an agreed week hatched, and the Now line only on
 * the day it is.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HubGrid, type GridBlock, type GridColumn, type HubGridProps } from "./HubGrid";
import { PX_PER_MIN, CARD_GAP_PX } from "./grid-model";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const t = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const COLUMNS: GridColumn[] = [
  { id: "t-ioreth", name: "Ioreth", initials: "IO", isMe: true, count: 2 },
  { id: "t-damrod", name: "Damrod", initials: "DA", isMe: false, count: 1 },
];
const block = (key: string, columnId: string, from: string, to: string): GridBlock => ({ key, columnId, span: { from: t(from), to: t(to) }, booking: { id: key } });
const BLOCKS = [
  block("belladonna", "t-ioreth", "09:30", "10:00"),
  block("mentha", "t-ioreth", "15:00", "15:30"),
  block("targon", "t-damrod", "10:00", "10:45"),
];

function mount(over: Partial<HubGridProps> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <StrictMode>
        <HubGrid
          dayKey="2026-09-28"
          columns={COLUMNS}
          blocks={BLOCKS}
          nowMin={t("09:24")}
          renderCard={(b) => <span className="card" data-key={b.key} />}
          {...over}
        />
      </StrictMode>,
    );
  });
  return host;
}

const slotOf = (el: HTMLElement, key: string) => el.querySelector<HTMLElement>(`.card[data-key="${key}"]`)?.parentElement as HTMLElement;
const px = (v: string) => Number(v.replace("px", ""));

describe("the Hub grid", () => {
  it("draws a column per trainer, yours first and pinned, whole names and counts", () => {
    const el = mount();
    const heads = [...el.querySelectorAll<HTMLElement>(".hs-colhead")];
    expect(heads.map((h) => h.textContent)).toEqual(["IOIorethYou2 sessions", "DADamrod1 session"]);
    expect(heads[0].dataset.me).toBe("true");
    expect(el.querySelectorAll('.hs-col[data-me="true"]')).toHaveLength(1);
  });

  it("puts every block at its real length: a 45-minute consult is half again a session", () => {
    const el = mount();
    const session = slotOf(el, "belladonna");
    const consult = slotOf(el, "targon");
    expect(px(session.style.height)).toBeCloseTo(30 * PX_PER_MIN - CARD_GAP_PX);
    expect(px(consult.style.height)).toBeCloseTo(45 * PX_PER_MIN - CARD_GAP_PX);
  });

  it("folds the empty middle of the day into a band, and a tap opens it", () => {
    const el = mount();
    const band = el.querySelector<HTMLButtonElement>(".hs-band");
    expect(band?.textContent).toContain("No sessions 11:00 AM – 3:00 PM");
    const before = px(slotOf(el, "mentha").style.top);
    act(() => band!.click());
    expect(el.querySelector(".hs-band")).toBeNull();
    expect(px(slotOf(el, "mentha").style.top)).toBeGreaterThan(before);
  });

  it("draws the Now line on the day it is, and not on another", () => {
    expect(mount().querySelector(".hs-now")?.textContent).toBe("9:24");
    act(() => root?.unmount());
    host?.remove();
    expect(mount({ nowMin: null }).querySelector(".hs-now")).toBeNull();
  });

  it("hatches what the agreed week says, and says a day away in the header", () => {
    const el = mount({
      frameOf: (id, range) =>
        id === "t-damrod" ? { kind: "week", off: [{ from: range.from, to: t("10:00") }] } : { kind: "away", note: "Rivendell" },
    });
    const cols = [...el.querySelectorAll<HTMLElement>(".hs-col")];
    expect(cols[1].querySelectorAll(".hs-off")).toHaveLength(1);
    expect(cols[0].querySelector(".hs-away")?.textContent).toBe("Away · Rivendell");
    expect(el.querySelector(".hs-colhead")?.textContent).toContain("Away");
  });

  it("hatches nothing it doesn't know", () => {
    expect(mount().querySelectorAll(".hs-off")).toHaveLength(0);
  });

  it("says an empty day in words", () => {
    expect(mount({ blocks: [] }).querySelector(".hs-empty")?.textContent).toBe("Nobody is booked on this day.");
  });
});
