// @vitest-environment jsdom
/**
 * THE HUB'S DAY AS A LIST, MOUNTED (Journey Lite, Oct 1 2026): the cards in
 * time order, Me narrowing to your own, "with Sam" under the time on
 * Everyone, the Now line, and an empty day said in words.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PhoneDayList } from "./PhoneDayList";
import type { DayBlock } from "./day-list";

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

type B = DayBlock & { name: string };
const block = (key: string, name: string, columnId: string, from: number, staff = false): B => ({
  key,
  name,
  columnId,
  span: { from, to: from + 30 },
  staff,
});
const BLOCKS: B[] = [
  block("p", "Peregrin Took", "aj", 7 * 60),
  block("f", "Frodo Baggins", "aj", 6 * 60),
  block("m", "Meriadoc Brandybuck", "sam", 6 * 60 + 30),
  block("lunch", "Unavailable", "sam", 12 * 60, true),
];

function mount(mineOnly: string | null, nowMin: number | null, blocks = BLOCKS) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <StrictMode>
        <PhoneDayList
          blocks={blocks}
          columnOrder={["aj", "sam"]}
          mineOnly={mineOnly}
          nowMin={nowMin}
          renderCard={(b) => <div className="card">{b.name}</div>}
          withWords={(b) => (mineOnly ? null : b.columnId === "aj" ? "with you" : "with Sam")}
          emptyWords="Nobody booked."
        />
      </StrictMode>,
    ),
  );
}

const rows = () => Array.from(host!.querySelectorAll(".ph-day__list > li")).map((li) => li.textContent);

describe("PhoneDayList", () => {
  it("lists everyone's bookings in time order, never an Unavailable block", () => {
    mount(null, null);
    expect(rows()).toEqual(["6AMFrodo Bagginswith you", "6:30AMMeriadoc Brandybuckwith Sam", "7AMPeregrin Tookwith you"]);
  });

  it("narrows to your own on Me, and puts Now where the day is", () => {
    mount("aj", 6 * 60 + 15);
    expect(rows()).toEqual(["6AMFrodo Baggins", "Now", "7AMPeregrin Took"]);
  });

  it("says an empty day in words, and whose it is on Me", () => {
    mount(null, null, []);
    expect(host!.textContent).toBe("Nobody booked.");
    act(() => root!.unmount());
    host!.remove();
    mount("aj", null, [block("m", "Meriadoc Brandybuck", "sam", 400)]);
    expect(host!.textContent).toBe("Nobody booked with you on this day.");
  });
});
