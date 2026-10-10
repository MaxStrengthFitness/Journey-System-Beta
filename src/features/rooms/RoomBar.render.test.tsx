// @vitest-environment jsdom
/**
 * The room bar, MOUNTED (the rooms round, Oct 10 2026): the page says which
 * room it is, the mark carries the room (its hue is the stylesheet's, from
 * `data-room`), the one switch says which section is on, and a tap on
 * another section asks for it while a tap on the one you're on asks nothing.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CalendarDays, CalendarRange } from "lucide-react";
import { RoomBar } from "./RoomBar";
import { RoomSwitch } from "./RoomSwitch";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
}

describe("RoomBar", () => {
  it("names the room, carries it on the bar, and draws the mark for no one but the eye", () => {
    mount(<RoomBar room="calendar" name="Calendar" icon={CalendarDays} />);
    const bar = host!.querySelector("header.rm-bar")!;
    expect(bar.getAttribute("data-room")).toBe("calendar");
    expect(bar.querySelector("h1.rm-name")?.textContent).toBe("Calendar");
    const mark = bar.querySelector(".rm-mark")!;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.querySelector("svg")).not.toBeNull();
    // Nothing but the stylesheet paints the hue: no inline colour.
    expect(bar.innerHTML).not.toMatch(/style=/);
  });

  it("puts the switch and the tools on the first row, and the rest on a second row in the same shelf", () => {
    mount(
      <RoomBar room="calendar" name="Calendar" icon={CalendarDays} switcher={<span id="sw" />} tools={<button type="button">Entire team</button>}>
        <span id="more" />
      </RoomBar>,
    );
    const rows = host!.querySelectorAll(".rm-bar > .rm-bar__in > .rm-bar__row");
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".rm-bar__switch #sw")).not.toBeNull();
    expect(rows[0].querySelector(".rm-bar__tools button")?.textContent).toBe("Entire team");
    expect(rows[1].classList.contains("rm-bar__row--more")).toBe(true);
    expect(rows[1].querySelector("#more")).not.toBeNull();
  });

  it("draws no empty slots", () => {
    mount(<RoomBar room="learning" name="Learning" icon={CalendarDays} />);
    expect(host!.querySelector(".rm-bar__switch")).toBeNull();
    expect(host!.querySelector(".rm-bar__tools")).toBeNull();
    expect(host!.querySelectorAll(".rm-bar__row")).toHaveLength(1);
  });
});

describe("RoomSwitch", () => {
  const options = [
    { id: "month", label: "Month", icon: CalendarRange },
    { id: "week", label: "Week" },
    { id: "day", label: "Day" },
  ] as const;

  it("is one group, every section visible, the one you're on pressed", () => {
    mount(<RoomSwitch label="View" options={options} value="week" onChange={() => undefined} />);
    const group = host!.querySelector('.rm-switch[role="group"]')!;
    expect(group.getAttribute("aria-label")).toBe("View");
    const buttons = [...group.querySelectorAll<HTMLButtonElement>("button.rm-switch__btn")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Month", "Week", "Day"]);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(buttons[0].querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("asks for another section, and asks nothing for the one you're on", () => {
    const onChange = vi.fn();
    mount(<RoomSwitch label="View" options={options} value="week" onChange={onChange} />);
    const buttons = [...host!.querySelectorAll<HTMLButtonElement>("button.rm-switch__btn")];
    act(() => buttons[1].click());
    expect(onChange).not.toHaveBeenCalled();
    act(() => buttons[2].click());
    expect(onChange).toHaveBeenCalledWith("day");
  });
});
