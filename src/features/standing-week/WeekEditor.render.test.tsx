// @vitest-environment jsdom
/**
 * THE WEEK EDITOR, THREE BLOCKS A DAY (Openings round, Sep 27 2026), mounted
 * on its own: a day takes up to three blocks of when the trainer takes
 * clients, each with its own name for VoiceOver; a day with none "Doesn't
 * take clients"; a regular outside every block wears the chip; and the line
 * under the days says why the breaks stay out. The two screens that hold it
 * (My Profile, Team's Review) have their own render tests.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../types";
import { formOf, type WeekForm } from "./present";
import type { StandingWeek } from "./week";
import { WeekEditor } from "./WeekEditor";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const clients = [{ id: "c-judy", firstName: "Judy", lastName: "Smith", isActive: true }] as unknown as Client[];

let root: Root;
let host: HTMLDivElement;
/** Every form the editor handed back, latest last. */
let seen: WeekForm[] = [];

function Harness({ start, disabled }: { start: StandingWeek | null; disabled?: boolean }) {
  const [form, setForm] = useState<WeekForm>(() => formOf(start));
  return (
    <WeekEditor
      value={form}
      onChange={(next) => {
        seen.push(next);
        setForm(next);
      }}
      clients={clients}
      noteLabel="Note"
      disabled={disabled}
    />
  );
}

beforeEach(() => {
  seen = [];
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function mount(start: StandingWeek | null = null, disabled = false) {
  await act(async () => {
    root.render(
      <StrictMode>
        <Harness start={start} disabled={disabled} />
      </StrictMode>,
    );
  });
}

const byLabel = (label: string) => host.querySelector(`[aria-label="${label}"]`);
const button = (label: string) => {
  const b = [...host.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === label || x.textContent === label);
  if (!b) throw new Error(`No button "${label}" in: ${[...host.querySelectorAll("button")].map((x) => x.getAttribute("aria-label") ?? x.textContent).join(" | ")}`);
  return b as HTMLButtonElement;
};
const click = async (label: string) => {
  await act(async () => {
    button(label).click();
  });
};
const choose = async (label: string, value: string) => {
  const el = byLabel(label) as HTMLSelectElement;
  if (!el) throw new Error(`No select "${label}"`);
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
};
const last = () => seen[seen.length - 1];
const mondayBlocks = () => last().hours.filter((h) => h.weekday === 1);

describe("the week editor's blocks", () => {
  it("says a day with no blocks doesn't take clients, and offers a block on every day", async () => {
    await mount();
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]) {
      const section = byLabel(day);
      expect(section?.querySelector(".stw-quiet")?.textContent, day).toBe("Doesn't take clients");
      expect(button(`Add a block on ${day}`).textContent).toBe("Add a block");
    }
    expect(host.querySelector("[data-testid='stw-breaks']")?.textContent).toBe(
      "A break inside a block shows as room on Openings, so leave the breaks out.",
    );
    // No word of hours anywhere a trainer reads.
    expect(host.textContent).not.toMatch(/\bhours\b/i);
  });

  it("takes three blocks on a day, each with its own name, and no fourth", async () => {
    await mount();
    await click("Add a block on Monday");
    expect(button("Add another block on Monday").textContent).toBe("Add another block");
    expect(byLabel("Monday")?.querySelector(".stw-quiet")).toBeNull();
    await click("Add another block on Monday");
    await click("Add another block on Monday");
    expect(byLabel("Add another block on Monday")).toBeNull();
    expect(byLabel("Add a block on Monday")).toBeNull();
    // Every other day still offers its first block.
    expect(button("Add a block on Tuesday")).toBeTruthy();

    // The breaks left out: each block an hour after the one before.
    expect(mondayBlocks()).toEqual([
      { weekday: 1, from: "07:00", to: "13:00" },
      { weekday: 1, from: "14:00", to: "18:00" },
      { weekday: 1, from: "19:00", to: "21:45" },
    ]);
    // VoiceOver hears three different blocks, not three "Monday: starts".
    for (const label of ["Monday: starts", "Monday: ends", "Monday, block 2: starts", "Monday, block 2: ends", "Monday, block 3: starts", "Monday, block 3: ends"]) {
      expect(byLabel(label), label).not.toBeNull();
    }
    expect(host.querySelectorAll("[aria-label='Monday'] .stw-range")).toHaveLength(3);
  });

  it("offers another block again once one of three is removed", async () => {
    await mount({
      hours: [
        { weekday: 1, from: "06:00", to: "09:00" },
        { weekday: 1, from: "10:00", to: "13:00" },
        { weekday: 1, from: "15:00", to: "19:00" },
      ],
      regulars: [],
    });
    expect(byLabel("Add another block on Monday")).toBeNull();
    await click("Remove Monday, 10:00 AM – 1:00 PM");
    expect(mondayBlocks().map((h) => h.from)).toEqual(["06:00", "15:00"]);
    expect(button("Add another block on Monday").textContent).toBe("Add another block");
    // The block that was third is now the second, and is named so.
    expect((byLabel("Monday, block 2: starts") as HTMLSelectElement).value).toBe("15:00");
    expect(byLabel("Monday, block 3: starts")).toBeNull();
  });

  it("changes the third block's times, its end moving with a start that passes it", async () => {
    await mount({
      hours: [
        { weekday: 1, from: "06:00", to: "08:00" },
        { weekday: 1, from: "09:00", to: "11:00" },
        { weekday: 1, from: "15:00", to: "16:00" },
      ],
      regulars: [],
    });
    await choose("Monday, block 3: starts", "16:30");
    expect(mondayBlocks()[2]).toEqual({ weekday: 1, from: "16:30", to: "17:30" });
    await choose("Monday, block 3: ends", "19:00");
    expect(mondayBlocks()[2]).toEqual({ weekday: 1, from: "16:30", to: "19:00" });
    // The other two are untouched.
    expect(mondayBlocks().slice(0, 2)).toEqual([
      { weekday: 1, from: "06:00", to: "08:00" },
      { weekday: 1, from: "09:00", to: "11:00" },
    ]);
  });

  it("marks a regular outside every block, and not one inside the third", async () => {
    await mount({
      hours: [
        { weekday: 1, from: "06:00", to: "08:00" },
        { weekday: 1, from: "09:00", to: "11:00" },
        { weekday: 1, from: "15:00", to: "18:00" },
      ],
      regulars: [
        { id: "r1", weekday: 1, start: "16:00", clientId: "c-judy", clientName: "Judy Smith" },
        { id: "r2", weekday: 1, start: "12:00", clientId: "c-bob", clientName: "Bob Jones" },
      ],
    });
    const rows = [...host.querySelectorAll("[aria-label='Regulars on Monday'] .stw-regular")];
    const judy = rows.find((r) => r.textContent?.includes("Judy Smith"));
    const bob = rows.find((r) => r.textContent?.includes("Bob Jones"));
    expect(judy?.querySelector(".stw-note-chip")).toBeNull();
    expect(bob?.querySelector(".stw-note-chip")?.textContent).toBe("Outside when they take clients");
  });

  it("offers nothing to add while the week is saving", async () => {
    await mount(null, true);
    expect(button("Add a block on Monday").disabled).toBe(true);
  });
});
