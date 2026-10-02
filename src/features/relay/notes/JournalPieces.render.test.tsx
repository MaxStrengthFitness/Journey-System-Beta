// @vitest-environment jsdom
/**
 * THE JOURNAL'S PIECES, MOUNTED (the second wave of the Relay room, Sep 28
 * 2026): a hunch takes evidence and can be retired, a met hunch or a machine
 * note goes on the Studio shelf only once saved, and a day log reads back
 * privately. Over props; the whole Journal tab is mounted in
 * relay/planner.render.test.tsx.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t-ioreth" } }, functions: {} }));

import { DayLogView, HunchPanel, StudioShelfCard, StudioShelfView, WriteRow } from "./JournalPieces";
import type { Hunch } from "./types";

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  return host;
}

const button = (label: string) => [...(host?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

async function type(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const hunch = (over: Partial<Hunch> = {}): Hunch => ({
  claim: "Clients over 80 move more smoothly on the Pullover with the range two notches shorter.",
  how: "8 clients over 80.",
  need: 8,
  unit: "clients",
  evidence: [{ id: "e1", at: Date.parse("2026-09-26T15:00:00Z"), text: "Belladonna, smoother on the shorter range", clientId: "c-bella" }],
  retiredAt: null,
  ...over,
});

describe("the Journal's pieces", () => {
  it("Write offers six types, and holds back a seventh hunch", async () => {
    const onWrite = vi.fn();
    const h = await render(<WriteRow slotsFree={0} onWrite={onWrite} />);
    expect(h.querySelectorAll(".jn-type")).toHaveLength(6);
    const trend = [...h.querySelectorAll<HTMLButtonElement>(".jn-type")].find((b) => b.textContent?.startsWith("Trend"))!;
    expect(trend.disabled).toBe(true);
    expect(trend.textContent).toContain("All 3 hunch slots are in use");
    await act(async () => button("Machine")!.click());
    expect(onWrite).toHaveBeenCalledWith("machine");
  });

  it("offers a leader a seventh kind, a note about a team member, and nobody else (Oct 2 2026)", async () => {
    const onWrite = vi.fn();
    const h = await render(<WriteRow slotsFree={3} onWrite={onWrite} leader />);
    expect(h.querySelectorAll(".jn-type")).toHaveLength(7);
    expect(h.textContent).toContain("seven kinds");
    await act(async () => button("Team member")!.click());
    expect(onWrite).toHaveBeenCalledWith("team");
  });

  it("a hunch says how far it has got, takes evidence about a client, and can be retired", async () => {
    const onAdd = vi.fn(async (_entry: { text: string; clientId: string | null }) => true);
    const onRetire = vi.fn();
    const h = await render(
      <HunchPanel hunch={hunch()} clients={[{ id: "c-bella", name: "Belladonna Took" }]} busy={false} onAdd={onAdd} onRemove={() => {}} onRetire={onRetire} />,
    );
    expect(h.textContent).toContain("1 of 8 clients so far · not enough data yet");
    expect(h.textContent).toContain("Belladonna, smoother on the shorter range");
    expect(h.textContent).toContain("Private to you until its sample is met.");
    await type(h.querySelector<HTMLTextAreaElement>(".jn-evi__add textarea")!, "Odo, calmer with the shorter range");
    await act(async () => button("Belladonna Took")!.click());
    await act(async () => button("Add evidence")!.click());
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0]).toMatchObject({ text: "Odo, calmer with the shorter range", clientId: "c-bella" });
    await act(async () => button("Retire")!.click());
    expect(onRetire).toHaveBeenCalledWith(true);
  });

  it("a met hunch goes on the Studio shelf, as a copy that never names a client, once it is saved", async () => {
    const onPut = vi.fn(async () => true);
    const met = hunch({ need: 1 });
    const note = { noteType: "trend" as const, fields: {}, hunch: met, title: "", body: "" };
    let h = await render(<StudioShelfCard note={note} dirty studioName="Westlake" canWrite onPut={onPut} />);
    expect(h.textContent).toContain("Write it up for the Studio shelf");
    expect(h.textContent).toContain("Save first: the shelf takes what's saved.");
    act(() => root?.unmount());
    host?.remove();
    h = await render(<StudioShelfCard note={note} dirty={false} studioName="Westlake" canWrite onPut={onPut} />);
    expect(h.textContent).toContain("It never names a client");
    await act(async () => button("Put it on the Studio shelf")!.click());
    expect(onPut).toHaveBeenCalledTimes(1);
    expect(h.textContent).toContain("On the Studio shelf. Your note stays here, private to you.");
  });

  it("says so when the trainer can't add to this studio's shelf", async () => {
    const h = await render(
      <StudioShelfCard
        note={{ noteType: "machine", fields: { machine: "Pullover", setting: "Seat pin 4" }, hunch: null, title: "", body: "" }}
        dirty={false}
        studioName="Westlake"
        canWrite={false}
        onPut={async () => true}
      />,
    );
    expect(h.textContent).toContain("Only someone who works at Westlake can add to its shelf.");
    expect(button("Put it on the Studio shelf")).toBeUndefined();
  });

  it("reads a Studio-shelf entry, and takes a 'worked for me too'", async () => {
    const onConfirm = vi.fn();
    const h = await render(
      <StudioShelfView
        entry={{ id: "p1", studioId: "s1", title: "Pullover and a sore shoulder", situation: "A sore shoulder at the top.", worked: "Shorten the range two notches.", machineIds: [], tags: [], authorId: "t-beregond", authorName: "Beregond Guard" }}
        mine={false}
        onConfirm={onConfirm}
      />,
    );
    expect(h.textContent).toContain("Shorten the range two notches.");
    expect(h.textContent).toContain("It never names a client. Kept by Beregond Guard.");
    await act(async () => button("Worked for me too")!.click());
    expect(onConfirm).toHaveBeenCalled();
  });

  it("reads a day log back: what was carried, the facts, the one line, privately", async () => {
    const h = await render(
      <DayLogView
        log={{
          id: "t-ioreth_2026-09-28",
          uid: "t-ioreth",
          studioId: "s1",
          day: "2026-09-28",
          facts: ["Monday, September 28.", "5 sessions on your schedule today, the last ending at 6:40 PM."],
          carry: ["Slow down at the door"],
          line: { what: "Covered Rosie Cotton", soWhat: "", nowWhat: "Leave the same kind of notes myself" },
        }}
      />,
    );
    expect(h.textContent).toContain("Monday, September 28");
    expect(h.textContent).toContain("Slow down at the door");
    expect(h.textContent).toContain("5 sessions on your schedule today");
    expect(h.textContent).toContain("Leave the same kind of notes myself");
    expect(h.textContent).not.toContain("So what?");
    expect(h.textContent).toContain("Private to you, never shown to leaders.");
  });
});
