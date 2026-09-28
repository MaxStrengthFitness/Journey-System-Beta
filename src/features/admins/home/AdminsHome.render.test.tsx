// @vitest-environment jsdom
/**
 * HOME MOUNTS — the headline counts what needs you, each item says its
 * sentence, its proof and when it clears, its door goes where it says, and
 * "Couldn't check" looks nothing like the rest.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { AdminsHome, type AdminsHomeProps } from "./AdminsHome";
import type { NeedItem } from "./needs";

const items: NeedItem[] = [
  {
    id: "sync-failing",
    kind: "Mindbody sync",
    tone: "watch",
    say: "Strongsville's last 3 pulls from Mindbody failed.",
    proof: "Bookings made in Mindbody since then may not be in Journey yet.",
    door: { label: "Open Mindbody sync", page: "sync" },
    clears: "Clears itself after a pull that works.",
  },
  {
    id: "unknown",
    kind: "Couldn't check",
    tone: "unknown",
    say: "Couldn't check Willoughby's sync.",
    proof: "That is unknown, not fine and not broken.",
    door: { label: "Check again", action: "check-again" },
    clears: "Clears itself when they can be read.",
  },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(overrides: Partial<AdminsHomeProps> = {}) {
  const props: AdminsHomeProps = {
    items,
    more: [],
    checkedAt: Date.parse("2026-09-28T13:08:00Z"),
    network: "4 studios. No cutover date yet: Solon, Strongsville, Westlake and Willoughby.",
    standard: "20 machines in the standard set, of 20 in the MSF catalog.",
    onDoor: () => {},
    onCheckAgain: () => {},
    onOpenStudios: () => {},
    onOpenMachines: () => {},
    ...overrides,
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<AdminsHome {...props} />));
  return host;
}

const button = (el: ParentNode, text: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === text);

describe("Home", () => {
  it("counts what needs you, and says each in a sentence with its proof and when it clears", () => {
    const el = mount();
    expect(el.querySelector("h1")?.textContent).toBe("2 things need you.");
    expect(el.textContent).toContain("Checked at 9:08 AM.");
    const rows = [...el.querySelectorAll(".hq-need")];
    expect(rows.map((r) => r.querySelector(".hq-need__say")?.textContent)).toEqual([
      "Strongsville's last 3 pulls from Mindbody failed.",
      "Couldn't check Willoughby's sync.",
    ]);
    expect(rows[0].textContent).toContain("Clears itself after a pull that works.");
    // Couldn't check has its own look: a dashed outline, not a filled mark.
    expect(rows[1].querySelector(".hq-need__icon--unknown")).not.toBeNull();
    expect(el.textContent).toContain("4 studios. No cutover date yet");
    expect(el.textContent).toContain("20 machines in the standard set");
  });

  it("opens each item's door, and checks again on request", () => {
    const onDoor = vi.fn();
    const onCheckAgain = vi.fn();
    const onOpenStudios = vi.fn();
    const onOpenMachines = vi.fn();
    const el = mount({ onDoor, onCheckAgain, onOpenStudios, onOpenMachines });
    act(() => button(el, "Open Mindbody sync")!.click());
    expect(onDoor).toHaveBeenCalledWith(items[0].door);
    act(() => [...el.querySelectorAll<HTMLButtonElement>(".hq-need__door button")][1].click());
    expect(onDoor).toHaveBeenLastCalledWith({ label: "Check again", action: "check-again" });
    act(() => button(el.querySelector(".hq-home__fresh")!, "Check again")!.click());
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
    act(() => button(el, "All studios")!.click());
    act(() => button(el, "Machines")!.click());
    expect(onOpenStudios).toHaveBeenCalledTimes(1);
    expect(onOpenMachines).toHaveBeenCalledTimes(1);
  });

  it("says nothing needs you only once it has checked", () => {
    const calm = mount({ items: [] });
    expect(calm.querySelector("h1")?.textContent).toBe("Nothing needs you right now.");
    expect(calm.textContent).toContain("Anything new lands here first.");
    act(() => root!.unmount());
    host!.remove();
    const checking = mount({ items: [], checkedAt: null });
    expect(checking.querySelector("h1")?.textContent).toBe("Checking every studio…");
    expect(checking.textContent).not.toContain("Nothing needs you");
  });

  it("names what didn't fit", () => {
    const extra: NeedItem = { ...items[0], id: "bugs", kind: "Bug reports", tone: "live", say: "2 new bug reports." };
    const el = mount({ more: [extra] });
    expect(el.querySelector("h1")?.textContent).toBe("3 things need you.");
    expect(el.textContent).toContain("And 1 more: 2 new bug reports.");
  });
});
