// @vitest-environment jsdom
/**
 * THE HUB'S TOP, MOUNTED (calm Hub round, Sep 28 2026): the week with each
 * day's count (zero left out) and a dot for a day to celebrate, Today when
 * you are elsewhere, Tasks as a door that never shows a grey 0 while
 * loading, the chips that light the grid, the spotlight's bar, and the Key.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DayHeader, DaySummary, KeySheet, type DayHeaderProps, type DaySummaryProps } from "./DayHeader";
import type { StripDay } from "./day-summary";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = "";
  root = null;
  host = null;
});

function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<StrictMode>{node}</StrictMode>));
  return host;
}

const DAYS: StripDay[] = [
  { key: "2026-09-27", weekday: "Sun", date: 27, count: null, celebrate: false, isToday: false },
  { key: "2026-09-28", weekday: "Mon", date: 28, count: 57, celebrate: true, isToday: true },
  { key: "2026-09-29", weekday: "Tue", date: 29, count: 47, celebrate: false, isToday: false },
];

function header(over: Partial<DayHeaderProps> = {}) {
  const calls = { layer: [] as string[], day: [] as string[], tasks: 0, key: 0 };
  const el = render(
    <DayHeader
      layer="schedule"
      onLayer={(l) => calls.layer.push(l)}
      days={DAYS}
      selected="2026-09-28"
      onSelectDay={(d) => calls.day.push(d)}
      openTasks={3}
      onOpenTasks={() => (calls.tasks += 1)}
      onOpenKey={() => (calls.key += 1)}
      {...over}
    />,
  );
  return { el, calls };
}

const btn = (el: HTMLElement, text: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.includes(text));

describe("the week and the doors", () => {
  it("shows each day's count, leaves an empty day without a number, and dots a day to celebrate", () => {
    const { el } = header();
    const days = [...el.querySelectorAll<HTMLButtonElement>(".hd-day")];
    expect(days.map((d) => d.textContent)).toEqual(["Sun 27", "Mon 2857", "Tue 2947"]);
    expect(days[1].getAttribute("aria-selected")).toBe("true");
    expect(days[1].querySelector(".hd-dot")).toBeTruthy();
    expect(days[2].querySelector(".hd-dot")).toBeNull();
    expect(days[0].getAttribute("aria-label")).toBe("Sun 27, nothing booked");
  });

  it("offers Today only when you are on another day, and moves the day", () => {
    expect(btn(header().el, "Today")).toBeUndefined();
    act(() => root?.unmount());
    const { el, calls } = header({ selected: "2026-09-29" });
    act(() => btn(el, "Today")!.click());
    act(() => el.querySelectorAll<HTMLButtonElement>(".hd-day")[2].click());
    expect(calls.day).toEqual(["2026-09-28", "2026-09-29"]);
  });

  it("makes Tasks a door, with its count, and never a grey 0 while they load", () => {
    const { el, calls } = header();
    expect(btn(el, "Tasks")?.textContent).toBe("Tasks3");
    act(() => btn(el, "Tasks")!.click());
    expect(calls.tasks).toBe(1);
    act(() => root?.unmount());
    expect(btn(header({ openTasks: null }).el, "Tasks")?.textContent).toBe("Tasks");
  });

  it("opens the Key", () => {
    const { el, calls } = header();
    act(() => btn(el, "Key")!.click());
    expect(calls.key).toBe(1);
  });
});

function summary(over: Partial<DaySummaryProps> = {}) {
  const calls = { spot: [] as Array<string | null>, next: 0, list: 0 };
  const el = render(
    <DaySummary
      title="Monday, Sep 28"
      sessions={57}
      trainers={5}
      chips={[
        { id: "read-first", label: "Read first", count: 1 },
        { id: "celebrate", label: "Celebrate", count: 3 },
      ]}
      spot={null}
      spotText=""
      onSpot={(f) => calls.spot.push(f)}
      onNext={() => (calls.next += 1)}
      onAsList={() => (calls.list += 1)}
      {...over}
    />,
  );
  return { el, calls };
}

describe("the day in words, the chips and the spotlight", () => {
  it("says the day and draws the list's own chips, which light the grid", () => {
    const { el, calls } = summary();
    expect(el.querySelector(".hd-sum-words")?.textContent).toBe("Monday, Sep 28 · 57 sessions · 5 trainers");
    expect([...el.querySelectorAll(".hd-chip")].map((c) => c.textContent)).toEqual(["Read first 1", "Celebrate 3"]);
    act(() => btn(el, "Celebrate")!.click());
    expect(calls.spot).toEqual(["celebrate"]);
  });

  it("says an empty day without a zero", () => {
    expect(summary({ sessions: 0, chips: [] }).el.querySelector(".hd-sum-words")?.textContent).toBe("Monday, Sep 28 · nothing booked");
  });

  it("ends the same line with Focus: Me | Everyone, for someone with a column (hub cherry round)", () => {
    const picked: string[] = [];
    const { el } = summary({ focus: { value: "me", onChange: (f) => picked.push(f) } });
    const seg = el.querySelector('[role="group"][aria-label="Focus"]');
    expect([...seg!.querySelectorAll("button")].map((b) => [b.textContent, b.getAttribute("aria-pressed")])).toEqual([
      ["Me", "true"],
      ["Everyone", "false"],
    ]);
    act(() => btn(el, "Everyone")!.click());
    expect(picked).toEqual(["everyone"]);
    // One line: the switch sits in the summary itself, after the chips.
    expect(el.querySelector(".hd-sum")?.lastElementChild?.className).toBe("hd-focus");
  });

  it("offers no switch without a column, nor on the spotlight's bar", () => {
    expect(summary().el.querySelector(".hd-focus")).toBeNull();
    act(() => root?.unmount());
    expect(summary({ spot: "celebrate", spotText: "3 to celebrate", focus: { value: "me", onChange: () => {} } }).el.querySelector(".hd-focus")).toBeNull();
  });

  it("turns into the spotlight's bar: what it shows, Next, the list, and Done", () => {
    const { el, calls } = summary({ spot: "celebrate", spotText: "3 to celebrate: 2 birthdays, 1 milestone" });
    expect(el.querySelector(".hd-spot-words")?.textContent).toBe("Showing 3 to celebrate: 2 birthdays, 1 milestone on the grid");
    act(() => btn(el, "Next")!.click());
    act(() => btn(el, "See them as a list")!.click());
    act(() => btn(el, "Done")!.click());
    expect(calls).toEqual({ spot: [null], next: 1, list: 1 });
  });
});

describe("the Key", () => {
  it("says every mark and state in words when open", () => {
    const onClose = vi.fn();
    render(<KeySheet open onClose={onClose} />);
    const text = document.body.textContent || "";
    expect(text).toContain("The Key");
    expect(text).toContain("No waiver signed.");
    expect(text).toContain("Not working.");
  });

  it("explains the ✎ Ask about, and says its words stay off the card (wave 2 hub)", () => {
    render(<KeySheet open onClose={() => {}} />);
    const row = [...document.querySelectorAll(".hd-key-list li")].find((li) => li.textContent?.startsWith("Ask about."));
    expect(row?.textContent).toContain("never on the card");
    expect(row?.querySelector(".hs-g")?.getAttribute("data-family")).toBe("get-to-know");
  });
});

describe("the chips, with Get to know (wave 2 hub)", () => {
  it("draws its chip after the others, and lights its cards", () => {
    const { el, calls } = summary({
      chips: [
        { id: "celebrate", label: "Celebrate", count: 3 },
        { id: "get-to-know", label: "Get to know", count: 2 },
      ],
    });
    expect([...el.querySelectorAll(".hd-chip")].map((c) => c.textContent)).toEqual(["Celebrate 3", "Get to know 2"]);
    expect(el.querySelectorAll(".hd-chip")[1].querySelector(".hd-fam")?.getAttribute("data-family")).toBe("get-to-know");
    act(() => btn(el, "Get to know")!.click());
    expect(calls.spot).toEqual(["get-to-know"]);
  });
});
