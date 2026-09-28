// @vitest-environment jsdom
/**
 * HOME MOUNTS — the headline counts what needs you, each item says its
 * sentence, its proof and when it clears, its door goes where it says, and
 * "Couldn't check" looks nothing like the rest. The second wave: Take it,
 * Snooze and Dismiss (a dismiss asks why), Undo straight after, what is set
 * aside listed with Bring it back, and "Couldn't check" never offered a mark.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { AdminsHome, type AdminsHomeProps } from "./AdminsHome";
import type { NeedItem } from "./needs";
import { itemKey, type HomeMark } from "./home-marks";

const items: NeedItem[] = [
  {
    id: "sync-failing",
    kind: "Mindbody sync",
    tone: "watch",
    say: "Strongsville's last 3 pulls from Mindbody failed.",
    proof: "Bookings made in Mindbody since then may not be in Journey yet.",
    door: { label: "Open Mindbody sync", page: "sync" },
    clears: "Clears itself after a pull that works.",
    condition: "strongsville",
  },
  {
    id: "unknown",
    kind: "Couldn't check",
    tone: "unknown",
    say: "Couldn't check Willoughby's sync.",
    proof: "That is unknown, not fine and not broken.",
    door: { label: "Check again", action: "check-again" },
    clears: "Clears itself when they can be read.",
    condition: "Willoughby's sync",
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
const click = async (el: Element | null | undefined) => {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
};

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
    act(() => [...el.querySelectorAll<HTMLButtonElement>(".hq-need__door button")].find((b) => b.textContent === "Check again")!.click());
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

  it("names what didn't fit past seven", () => {
    const seven: NeedItem[] = Array.from({ length: 7 }, (_, i) => ({ ...items[0], id: `k${i}`, say: `Thing ${i}.`, condition: String(i) }));
    const extra: NeedItem = { ...items[0], id: "bugs", kind: "Bug reports", tone: "live", say: "2 new bug reports.", condition: "b1,b2" };
    const el = mount({ items: seven, more: [extra] });
    expect(el.querySelector("h1")?.textContent).toBe("8 things need you.");
    expect(el.textContent).toContain("And 1 more: 2 new bug reports.");
  });
});

describe("Home's Take it, Snooze and Dismiss", () => {
  const syncKey = itemKey(items[0]);
  const withMarks = (onMark = vi.fn(async () => {}), onClearMark = vi.fn(async () => {}), marks: Record<string, HomeMark> = {}) =>
    mount({ marks, marksState: "ok", today: "2026-09-28", onMark, onClearMark });

  it("offers Take it, Snooze and Dismiss on a thing to do, and nothing on Couldn't check", async () => {
    const onMark = vi.fn(async () => {});
    const el = withMarks(onMark);
    const rows = [...el.querySelectorAll(".hq-need")];
    expect(rows[1].querySelector('[aria-label^="Take, snooze or dismiss"]')).toBeNull();
    await click(rows[0].querySelector('[aria-label^="Take, snooze or dismiss"]'));
    await click(button(el, "Take it"));
    expect(onMark).toHaveBeenCalledWith(syncKey, { state: "taken" });
  });

  it("says who took an item, and lets it go", async () => {
    const onClearMark = vi.fn(async () => {});
    const taken = { [syncKey]: { key: syncKey, state: "taken", byUid: "u", byName: "Faramir", until: null, reason: null, at: 1 } as HomeMark };
    const el = withMarks(undefined, onClearMark, taken);
    expect(el.querySelector(".hq-need__taken")?.textContent).toBe(" · Taken by Faramir");
    expect(el.querySelector("h1")?.textContent).toBe("2 things need you.");
    await click(el.querySelector('[aria-label^="Take, snooze or dismiss"]'));
    await click(button(el, "Let it go"));
    expect(onClearMark).toHaveBeenCalledWith(syncKey);
  });

  it("snoozes until tomorrow or for a week, and offers Undo straight after", async () => {
    const onMark = vi.fn(async () => {});
    const onClearMark = vi.fn(async () => {});
    const el = withMarks(onMark, onClearMark);
    await click(el.querySelector('[aria-label^="Take, snooze or dismiss"]'));
    await click(button(el, "Snooze…"));
    expect(el.textContent).toContain("Snooze it until when? It comes back sooner if it changes.");
    await click(button(el, "For a week"));
    expect(onMark).toHaveBeenCalledWith(syncKey, { state: "snoozed", until: "2026-10-05" });
    expect(el.textContent).toContain("Snoozed “Strongsville's last 3 pulls from Mindbody failed.” until Mon, Oct 5, 2026.");
    await click(button(el, "Undo"));
    expect(onClearMark).toHaveBeenCalledWith(syncKey);
  });

  it("asks why before a dismiss, with three reasons or one of your own", async () => {
    const onMark = vi.fn(async () => {});
    const el = withMarks(onMark);
    await click(el.querySelector('[aria-label^="Take, snooze or dismiss"]'));
    await click(button(el, "Dismiss…"));
    expect(el.textContent).toContain("Why dismiss it? It comes back if it changes.");
    expect(button(el, "Dismiss")!.disabled).toBe(true);
    const why = el.querySelector<HTMLInputElement>("#hq-why-sync-failing")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(why, "Mindbody's outage, not ours");
      why.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(button(el, "Dismiss"));
    expect(onMark).toHaveBeenCalledWith(syncKey, { state: "dismissed", reason: "Mindbody's outage, not ours" });
  });

  it("lists what is set aside, with who and why, and brings it back", async () => {
    const onClearMark = vi.fn(async () => {});
    const aside = { [syncKey]: { key: syncKey, state: "dismissed", byUid: "u", byName: "Faramir", until: null, reason: "Already handled", at: 1 } as HomeMark };
    const el = withMarks(undefined, onClearMark, aside);
    expect(el.querySelector("h1")?.textContent).toBe("1 thing needs you.");
    expect(el.textContent).toContain("1 set aside.");
    expect([...el.querySelectorAll(".hq-needs .hq-need__say")].map((s) => s.textContent)).toEqual(["Couldn't check Willoughby's sync."]);
    await click(button(el, "Set aside · 1"));
    expect(el.textContent).toContain("Dismissed by Faramir: Already handled");
    await click(button(el, "Bring it back"));
    expect(onClearMark).toHaveBeenCalledWith(syncKey);
  });

  it("says when the marks couldn't be read, and shows every item", () => {
    const el = mount({ marks: {}, marksState: "failed", today: "2026-09-28", onMark: vi.fn(async () => {}), onClearMark: vi.fn(async () => {}) });
    expect(el.textContent).toContain("Couldn't read who has taken, snoozed or dismissed what, so every item shows.");
    expect(el.querySelectorAll(".hq-need")).toHaveLength(2);
  });
});
