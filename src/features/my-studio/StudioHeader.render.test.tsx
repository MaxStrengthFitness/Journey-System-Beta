// @vitest-environment jsdom
/**
 * THE ONE HEADER, MOUNTED (Relay room, Sep 28 2026; made calm in the Relay
 * Board rebuild, Oct 3 2026): the section and its menu, Relay's tabs, the
 * day, the slot for what's new, Ask and +, drawn by StudioHeader on its own
 * (MyStudioView mounts it for real in relay/planner.render.test).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CalendarRange, Dumbbell, LayoutGrid, ListChecks, Settings2, StickyNote, UserRound, Users, Zap } from "lucide-react";
import { StudioHeader, type HeaderSection } from "./StudioHeader";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SECTIONS: HeaderSection[] = [
  { id: "relay", label: "Relay", icon: Zap },
  { id: "openings", label: "Openings", icon: CalendarRange },
  { id: "machines", label: "Machines", icon: Dumbbell },
  { id: "team", label: "Team", icon: Users, note: "The studio's leaders" },
  { id: "studio", label: "Studio", icon: Settings2 },
];
const TABS = [
  { id: "floor" as const, label: "Board", icon: LayoutGrid },
  { id: "mine" as const, label: "Tracker", icon: UserRound },
  { id: "notes" as const, label: "Journal", icon: StickyNote },
];

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
});

function render(props: Partial<Parameters<typeof StudioHeader<"floor" | "mine" | "notes">>[0]> = {}) {
  const calls = { section: vi.fn(), tab: vi.fn(), ask: vi.fn(), todo: vi.fn(), slot: vi.fn() };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <div className="ms">
        <StudioHeader
          sections={SECTIONS}
          shown="relay"
          onChooseSection={calls.section}
          relayTabs={TABS}
          relayTab="floor"
          onRelayTab={calls.tab}
          studioName="Westlake"
          todayLabel="Mon, Sep 28"
          newsSlot={calls.slot}
          onAsk={calls.ask}
          plusItems={[{ id: "todo", label: "A to-do for me", icon: ListChecks, onSelect: calls.todo }]}
          {...props}
        />
      </div>,
    );
  });
  return { h: host, calls };
}

function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  act(() => (el as HTMLElement).click());
}

describe("the one header", () => {
  it("on Relay: the section, Relay's tabs, the day, what's new, Ask and +, in one calm bar", () => {
    const { h, calls } = render();
    const bar = h.querySelector("header.msh");
    expect(bar).not.toBeNull();
    expect(bar!.querySelectorAll("header")).toHaveLength(0);
    expect(h.querySelector(".msh__sect")?.textContent).toContain("My Studio");
    expect(h.querySelector(".msh__sect-name")?.textContent).toBe("Relay");
    // The section's label keeps the old tab's id, so the section's panel is labelled by it.
    expect(h.querySelector("#ms-tab-relay")?.textContent).toBe("Relay");
    const tabs = [...h.querySelectorAll('[role="tablist"][aria-label="Relay"] [role="tab"]')].map((t) => t.textContent);
    expect(tabs).toEqual(["Board", "Tracker", "Journal"]);
    expect(h.querySelector("#pl-tab-floor")?.getAttribute("aria-selected")).toBe("true");
    expect(h.querySelector(".msh__day")?.textContent).toBe("Mon, Sep 28");
    // The Board draws "● 2 new" into this slot; the bar hands it over.
    const slot = h.querySelector(".msh__news");
    expect(slot).not.toBeNull();
    expect(calls.slot).toHaveBeenCalledWith(slot);
    // The time button and Tracking went (AJ, Oct 3 2026: "Drop both").
    expect(h.querySelector(".msh__now")).toBeNull();
    expect(h.querySelector(".msh__track")).toBeNull();
    expect(h.querySelector(".msh__ask")?.textContent).toBe("Ask");
    expect(h.querySelector(".msh__plus")?.getAttribute("aria-label")).toBe("Add something just for you");
    // Nothing in the bar carries its words only in a tooltip.
    expect(h.querySelectorAll("[title]")).toHaveLength(0);
  });

  it("opens the section menu on a tap, marks where you are, and moves on a choice", () => {
    const { h, calls } = render();
    const btn = h.querySelector<HTMLButtonElement>(".msh__sect");
    expect(btn?.getAttribute("aria-haspopup")).toBe("menu");
    expect(btn?.getAttribute("aria-expanded")).toBe("false");
    click(btn);
    expect(btn?.getAttribute("aria-expanded")).toBe("true");
    const items = [...h.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    expect(items.map((i) => i.textContent?.replace("The studio's leaders", "").trim())).toEqual(["Relay", "Openings", "Machines", "Team", "Studio"]);
    expect(items[0].getAttribute("aria-checked")).toBe("true");
    // A section that is not everyone's says whose it is, in view.
    expect(items[3].textContent).toContain("The studio's leaders");
    click(items[2]);
    expect(calls.section).toHaveBeenCalledWith("machines");
    expect(h.querySelector('[role="menuitemradio"]')).toBeNull();
  });

  it("closes a menu with Escape and gives the focus back to its button", () => {
    const { h } = render();
    const btn = h.querySelector<HTMLButtonElement>(".msh__sect");
    click(btn);
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(h.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(btn);
  });

  it("switches Relay's tab", () => {
    const { h, calls } = render();
    click(h.querySelector("#pl-tab-mine"));
    expect(calls.tab).toHaveBeenCalledWith("mine");
    // The tab already showing does nothing.
    click(h.querySelector("#pl-tab-floor"));
    expect(calls.tab).toHaveBeenCalledTimes(1);
  });

  it("asks the team from Ask, and keeps your own things behind +", () => {
    const { h, calls } = render();
    click(h.querySelector(".msh__ask"));
    expect(calls.ask).toHaveBeenCalled();
    click(h.querySelector(".msh__plus"));
    const menu = h.querySelector('[role="menu"][aria-label="Add something just for you"]');
    expect(menu?.textContent).toContain("Just for you");
    expect(menu?.textContent).toContain("Ask is for asking the team.");
    click([...menu!.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.includes("A to-do for me")));
    expect(calls.todo).toHaveBeenCalled();
  });

  it("on another section: the section and the studio's day, Ask and +, and no Relay tabs", () => {
    const { h } = render({ shown: "machines" });
    expect(h.querySelector(".msh__sect-name")?.textContent).toBe("Machines");
    expect(h.querySelector("#ms-tab-machines")).not.toBeNull();
    expect(h.querySelector('[role="tablist"]')).toBeNull();
    expect(h.querySelector(".msh__news")).toBeNull();
    expect(h.querySelector(".msh__where")?.textContent).toBe("Westlake · Mon, Sep 28");
    expect(h.querySelector(".msh__ask")).not.toBeNull();
  });
});
