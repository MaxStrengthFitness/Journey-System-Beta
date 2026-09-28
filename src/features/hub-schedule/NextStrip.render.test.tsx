// @vitest-environment jsdom
/**
 * THE NEXT 30 MINUTES STRIP, MOUNTED (hub cherry round, Sep 28 2026): when,
 * the whole name, who with, the Critical triangle as the only red, the
 * card's own marks with their sayable words, a tap that opens the peek, a
 * booking with no profile that opens nothing, and a quiet gap said in words.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NextStrip, type NextStripItem } from "./NextStrip";

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

const item = (over: Partial<NextStripItem> & Pick<NextStripItem, "key" | "name">): NextStripItem => ({
  when: "soon",
  time: "9:30",
  withText: "with you",
  critical: null,
  glyphs: [],
  more: 0,
  moreLabel: null,
  clientId: over.key,
  ...over,
});

const ITEMS: NextStripItem[] = [
  item({ key: "hamfast", name: "Hamfast Gamgee", when: "in-session", time: "9:00" }),
  item({
    key: "belladonna",
    name: "Belladonna Took",
    critical: "Critical: no overhead pressing",
    glyphs: [
      { kind: "milestone", family: "celebrate", word: "100th", label: "100th today" },
      { kind: "birthday", family: "celebrate", word: "turns 80", label: "Turns 80 Thu" },
    ],
  }),
  item({ key: "estella", name: "Estella Bolger", when: "now", withText: "with Damrod", glyphs: [{ kind: "waiver", family: "watch", word: null, label: "No waiver signed" }] }),
  item({ key: "wilcome", name: "Wilcome Cotton", withText: "with Mablung", clientId: null }),
];

function mount(items: NextStripItem[] = ITEMS, onOpen = vi.fn(), openKey: string | null = null) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<StrictMode><NextStrip items={items} onOpen={onOpen} openKey={openKey} /></StrictMode>));
  return { el: host, onOpen };
}

const itemOf = (el: HTMLElement, name: string) => [...el.querySelectorAll<HTMLElement>(".hn-item")].find((i) => i.textContent?.includes(name))!;

describe("the Next 30 minutes strip", () => {
  it("says when, the whole name and who with, for each booking due", () => {
    const { el } = mount();
    expect(el.querySelector("section")?.getAttribute("aria-label")).toBe("Next 30 minutes");
    expect([...el.querySelectorAll(".hn-when")].map((w) => w.textContent)).toEqual(["In session", "9:30", "Now · 9:30", "9:30"]);
    expect([...el.querySelectorAll(".hn-name")].map((n) => n.textContent)).toEqual(["Hamfast Gamgee", "Belladonna Took", "Estella Bolger", "Wilcome Cotton"]);
    expect(itemOf(el, "Estella").querySelector(".hn-with")?.textContent).toBe("with Damrod");
  });

  it("the triangle is the only red, and the card's marks say only their sayable words", () => {
    const { el } = mount();
    const bella = itemOf(el, "Belladonna");
    expect(bella.querySelector(".hs-tri")?.getAttribute("aria-label")).toBe("Critical: no overhead pressing");
    expect([...bella.querySelectorAll(".hs-g-word")].map((w) => w.textContent)).toEqual(["100th", "turns 80"]);
    const estella = itemOf(el, "Estella");
    expect(estella.querySelector('.hs-g[aria-label="No waiver signed"]')?.getAttribute("data-family")).toBe("watch");
    expect(estella.querySelector(".hs-g-word")).toBeNull();
    expect(el.querySelectorAll(".hs-tri")).toHaveLength(1);
  });

  it("a tap opens the same peek a card opens, on that booking", () => {
    const { el, onOpen } = mount();
    const bella = itemOf(el, "Belladonna");
    act(() => bella.click());
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ key: "belladonna", clientId: "belladonna" }), bella);
  });

  it("a booking with no profile yet is shown, says so, and opens nothing", () => {
    const { el, onOpen } = mount();
    const wilcome = itemOf(el, "Wilcome");
    expect(wilcome.tagName).toBe("DIV");
    expect(wilcome.textContent).toContain("Not synced yet");
    act(() => wilcome.click());
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("marks the booking whose peek is open", () => {
    const { el } = mount(ITEMS, vi.fn(), "estella");
    expect(itemOf(el, "Estella").dataset.open).toBe("true");
    expect(itemOf(el, "Belladonna").dataset.open).toBeUndefined();
  });

  it("says a quiet gap in words, rather than leaving an empty row", () => {
    const { el } = mount([]);
    expect(el.querySelector(".hn-empty")?.textContent).toBe("Nobody due in the next 30 minutes.");
    expect(el.querySelector(".hn-row")).toBeNull();
  });
});
