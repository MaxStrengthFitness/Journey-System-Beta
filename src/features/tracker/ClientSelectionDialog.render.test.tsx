// @vitest-environment jsdom
/**
 * Who's this?, the open session's client picker, mounted (the open session
 * round, Oct 9 2026; finding 3 of docs/rounds/2026-10-09-open-session.md).
 * It finds a person the way the Client Directory does, shows names and
 * nothing about anyone's body, and offers New client.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../types";
import { ClientSelectionDialog } from "./ClientSelectionDialog";
import { clientDirectoryName } from "../../lib/client-name";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const people = [
  { id: "c-judith", firstName: "Judith", lastName: "Alvarez", height: "5'4\"", weight: 141 },
  { id: "c-dan", firstName: "Daniel", lastName: "O'Brien", nickname: "Danny", height: "6'1\"", weight: 212 },
  { id: "c-nancy", firstName: "Nancy", lastName: "Reed" },
  { id: "c-mary", firstName: "Mary-Ann", lastName: "Kowalski" },
] as unknown as Client[];

async function mount(props: Partial<Parameters<typeof ClientSelectionDialog>[0]> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ClientSelectionDialog clients={people} onSelect={vi.fn()} onClose={vi.fn()} {...props} />);
  });
}
const names = () => Array.from(document.querySelectorAll('[data-testid="client-picker-name"]')).map((n) => n.textContent);
async function search(text: string) {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Find a client"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("Who's this? (the client picker)", () => {
  it("asks who it is, and lists everyone by name, in order", async () => {
    await mount();
    expect(document.body.textContent).toContain("Who's this?");
    expect(names()).toEqual(["Daniel “Danny” O'Brien", "Judith Alvarez", "Mary-Ann Kowalski", "Nancy Reed"]);
  });

  it("shows nothing about anyone's body: no height, no weight", async () => {
    await mount();
    const text = document.body.textContent ?? "";
    for (const said of ["5'4", "6'1", "141", "212", "lbs"]) expect(text).not.toContain(said);
  });

  it("finds a person the way the Client Directory does: a nickname both ways, punctuation ignored, part of a name", async () => {
    await mount();
    await search("judy");
    expect(names()).toEqual(["Judith Alvarez"]);
    await search("danny");
    expect(names()).toEqual(["Daniel “Danny” O'Brien"]);
    await search("obrien");
    expect(names()).toEqual(["Daniel “Danny” O'Brien"]);
    await search("ann");
    expect(names()).toContain("Mary-Ann Kowalski");
    await search("nan r");
    expect(names()).toEqual(["Nancy Reed"]);
  });

  it("says when it has only close matches, and finds a typo", async () => {
    await mount();
    await search("nacny");
    expect(names()).toEqual(["Nancy Reed"]);
    expect(document.body.textContent).toContain("No exact match. Close matches:");
  });

  it("says when nobody matches", async () => {
    await mount();
    await search("zzzzzzzz");
    expect(names()).toEqual([]);
    expect(document.body.textContent).toContain("No clients found");
  });

  it("choosing a person hands back their id", async () => {
    const onSelect = vi.fn();
    await mount({ onSelect });
    await search("nancy");
    const row = document.querySelector('[data-testid="client-picker-name"]')!.closest("button")!;
    await act(async () => row.click());
    expect(onSelect).toHaveBeenCalledWith("c-nancy");
  });

  it("offers New client when the session can be given to a new person, and only then", async () => {
    await mount();
    const newClient = () => Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "New client");
    expect(newClient()).toBeUndefined();
    await act(async () => root!.unmount());
    host!.remove();
    const onCreateNew = vi.fn();
    await mount({ onCreateNew });
    await act(async () => newClient()!.click());
    expect(onCreateNew).toHaveBeenCalledTimes(1);
  });

  it("never cuts a name short: it wraps, and the row grows", async () => {
    await mount();
    const name = document.querySelector('[data-testid="client-picker-name"]')!;
    expect(name.className).toContain("[overflow-wrap:anywhere]");
    expect(name.className).not.toMatch(/truncate|line-clamp|whitespace-nowrap/);
    expect(name.closest("button")!.className).toContain("min-h-14");
  });
});

describe("a list that hasn't answered (the whole-branch review, Oct 9 2026)", () => {
  const empty = () => document.querySelector('[data-testid="client-picker-empty"]')?.textContent?.trim();
  it("says it is reading the clients, or that it couldn't, never 'No clients found', and New client stays offered", async () => {
    await mount({ clients: [], clientsStatus: "loading", onCreateNew: vi.fn() });
    expect(empty()).toBe("Reading the studio's clients…");
    expect(Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.trim() === "New client")).toBe(true);
    await act(async () => root!.unmount());
    host!.remove();
    await mount({ clients: [], clientsStatus: "error" });
    expect(empty()).toBe("Couldn't read the studio's clients just now.");
    await act(async () => root!.unmount());
    host!.remove();
    await mount({ clients: [], clientsStatus: "ready" });
    expect(empty()).toBe("No clients found");
  });
});

describe("clientDirectoryName (the picker's names, the Directory's own)", () => {
  it("writes the nickname beside the legal first name, as the Directory does, and only when it differs", () => {
    expect(clientDirectoryName({ firstName: "Judith", lastName: "Alvarez", nickname: "Judy" } as Client)).toBe("Judith “Judy” Alvarez");
    expect(clientDirectoryName({ firstName: "Judith", lastName: "Alvarez", nickname: "judith" } as Client)).toBe("Judith Alvarez");
    expect(clientDirectoryName({ firstName: "", lastName: "" } as Client)).toBe("Unnamed client");
  });
});
