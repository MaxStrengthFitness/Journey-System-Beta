// @vitest-environment jsdom
/**
 * THE NETWORK'S TWO ACTIONS ON OPERATIONS (voice-review round, Sep 27 2026).
 *
 * Moved from My Studio → Relay → Network, with the studio ranking dropped.
 * Mounted against a fake Firestore that records writes and, like the real
 * browser library, refuses `undefined`. It proves:
 *   - the focus writes only the line that changed, with who and when, and a
 *     focus that arrives after the page opened is taken up rather than wiped
 *     (the Relay form copied it once and could erase it);
 *   - Launch asks first and names every studio, posts with its DEFAULT
 *     choices (the Relay form's defaults were refused at every studio), and
 *     names a studio it missed, posting there only on Launch again;
 *   - a studio leader is offered neither; an owner with no network is told
 *     there is nowhere to keep a focus, but only once the networks have been
 *     read: an empty list is "can't see the networks yet";
 *   - an owner is offered the focus of every network that holds a studio in
 *     scope, listed on it or not (AJ, Sep 27 2026), and none from the
 *     practice studio (the Demo Mode realm rule).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const fake = vi.hoisted(() => ({
  adds: [] as { path: string; data: Record<string, unknown> }[],
  updates: [] as { path: string; data: Record<string, unknown> }[],
  failAt: new Set<string>(),
}));

function hasUndefined(v: unknown): boolean {
  if (v === undefined) return true;
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).some(hasUndefined);
  return false;
}

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-owner" } }, functions: {} }));
vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const path = parts.filter((p) => typeof p === "string").join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  return {
    collection: ref,
    doc: ref,
    addDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      if (hasUndefined(data)) throw new Error("Unsupported field value: undefined");
      if ([...fake.failAt].some((s) => r.path.includes(`/${s}/`))) throw new Error("unavailable");
      fake.adds.push({ path: r.path, data });
      return { id: `req-${fake.adds.length}` };
    },
    updateDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      if (hasUndefined(data)) throw new Error("Unsupported field value: undefined");
      fake.updates.push({ path: r.path, data });
    },
    serverTimestamp: () => "SERVER_TIME",
    Timestamp: { fromDate: (d: Date) => d, now: () => new Date() },
  };
});

import { NetworkActions } from "./NetworkActions";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";

const studios = [
  { id: "solon", name: "Solon" },
  { id: "westlake", name: "Westlake" },
] as unknown as Studio[];
const owner = { id: "owner", fullName: "Own Er", role: "FranchiseOwner" } as unknown as Trainer;
const ohio = (relayFocus?: FranchiseNetwork["relayFocus"]): FranchiseNetwork => ({
  id: "n-ohio",
  name: "Ohio",
  studioIds: ["solon", "westlake"],
  ownerId: "owner",
  ...(relayFocus ? { relayFocus } : {}),
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function render(props: Partial<Parameters<typeof NetworkActions>[0]> = {}) {
  if (!host) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  }
  await act(async () => {
    root!.render(
      <StrictMode>
        <NetworkActions trainer={owner} uid="uid-owner" studios={studios} networks={[ohio({ mastery: "Hip hinge" })]} todayKey="2026-09-28" {...props} />
      </StrictMode>,
    );
  });
  return host!;
}

async function type(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function press(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
  });
}

const button = (root: Element, text: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) as HTMLButtonElement | undefined;

beforeEach(() => {
  fake.adds.length = 0;
  fake.updates.length = 0;
  fake.failAt.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("Focus this quarter", () => {
  it("writes only the line that changed, with who set it and when", async () => {
    const el = await render();
    expect((el.querySelector("#nw-focus-n-ohio-mastery") as HTMLInputElement).value).toBe("Hip hinge");
    await type(el.querySelector("#nw-focus-n-ohio-machine") as HTMLInputElement, "Leg Curl");
    await press(button(el, "Set the focus")!);
    expect(fake.updates).toEqual([
      {
        path: "networks/n-ohio",
        data: { "relayFocus.machine": "Leg Curl", "relayFocus.setBy": { id: "uid-owner", name: "Own Er" }, "relayFocus.setAt": "SERVER_TIME" },
      },
    ]);
  });

  it("takes up a focus that arrives after the page opened, instead of wiping it", async () => {
    const el = await render({ networks: [ohio()] });
    expect((el.querySelector("#nw-focus-n-ohio-mastery") as HTMLInputElement).value).toBe("");
    await render({ networks: [ohio({ mastery: "Hip hinge", note: "Five clients by October." })] });
    expect((el.querySelector("#nw-focus-n-ohio-mastery") as HTMLInputElement).value).toBe("Hip hinge");
    expect((el.querySelector("#nw-focus-n-ohio-note") as HTMLInputElement).value).toBe("Five clients by October.");
    expect(button(el, "Set the focus")).toBeUndefined();
  });

  it("says who set the focus and on which day while nothing is being edited", async () => {
    const setAt = { toDate: () => new Date("2026-09-28T02:30:00Z") };
    const el = await render({ networks: [ohio({ mastery: "Hip hinge", machine: "", note: "", setBy: { id: "uid-ann", name: "Ann Owner" }, setAt })] });
    expect(el.textContent).toContain("Set by Ann Owner on Sep 27, 2026.");
  });

  it("says there is no focus yet when none is set", async () => {
    const el = await render({ networks: [ohio()] });
    expect(el.textContent).toContain("No focus yet: the Floors show nothing.");
  });

  it("tells an owner with no network there is nowhere to keep one, once the networks have been read", async () => {
    const elsewhere: FranchiseNetwork = { id: "n-west", name: "West", studioIds: ["denver"] };
    const el = await render({ networks: [elsewhere] });
    expect(el.textContent).toContain("No network yet");
    expect(el.textContent).toContain("None of these studios is in a network");
  });

  it("never says a studio is not in a network while the networks have not come through (a failed read is unknown, never empty)", async () => {
    const el = await render({ networks: [] });
    expect(el.textContent).toContain("Can't see the networks yet");
    expect(el.textContent).toContain("it can't tell yet whether these studios are in one");
    expect(el.textContent).not.toContain("not in a network");
    const one = await render({ networks: [], studios: [studios[0]] });
    expect(one.textContent).toContain("whether Solon is in one");
  });

  it("offers an owner the focus of a network that holds their studio, even one that does not list them", async () => {
    const unlisted: FranchiseNetwork = { id: "n-lake", name: "Lake", studioIds: ["westlake"] };
    const el = await render({ networks: [unlisted] });
    expect(el.querySelector("#nw-focus-n-lake-mastery")).not.toBeNull();
    expect(el.textContent).not.toContain("No network yet");
  });

  it("offers no real network's focus from the practice studio", async () => {
    const demo = [{ id: "demo-studio", name: "Demo Studio", isDemo: true }] as unknown as Studio[];
    const el = await render({ studios: demo });
    expect(el.querySelector("#nw-focus-n-ohio-mastery")).toBeNull();
    expect(el.textContent).toContain("Demo Studio is not in a network");
    expect(el.textContent).toContain("Launch at 1 studio");
  });
});

describe("Launch an initiative", () => {
  it("asks first, names every studio, and posts with the default choices", async () => {
    const el = await render();
    expect(el.textContent).toContain("Posts at Solon and Westlake.");
    await type(el.querySelector("#nw-launch-title") as HTMLInputElement, "Five Pulses each");
    await press(button(el, "Launch at 2 studios")!);
    expect(fake.adds).toHaveLength(0);
    expect(el.textContent).toContain("Post this at 2 studios?");
    expect(el.textContent).toContain('"Five Pulses each" goes to Solon and Westlake');

    await press(button(el, "Post it")!);
    expect(fake.adds.map((a) => a.path)).toEqual(["studios/solon/taskRequests", "studios/westlake/taskRequests"]);
    expect(fake.adds[0].data).toMatchObject({ kind: "initiative", title: "Five Pulses each", target: { action: "assessment", perTrainer: 5 } });
    expect(fake.adds[0].data.target).not.toHaveProperty("dueOn");
    expect((fake.adds[0].data.createdBy as { id: string }).id).toBe("uid-owner");
    expect(el.textContent).toContain("Posted at 2 studios.");
    expect((el.querySelector("#nw-launch-title") as HTMLInputElement).value).toBe("");
  });

  it("names a studio it missed, and Launch again posts there only", async () => {
    fake.failAt.add("westlake");
    const el = await render();
    await type(el.querySelector("#nw-launch-title") as HTMLInputElement, "InBody for everyone");
    await press(button(el, "Launch at 2 studios")!);
    await press(button(el, "Post it")!);
    expect(fake.adds.map((a) => a.path)).toEqual(["studios/solon/taskRequests"]);
    expect(el.textContent).toContain("Posted at 1 of 2 studios. Not posted at Westlake — Launch again posts at that studio only.");

    fake.failAt.clear();
    await press(button(el, "Launch again at 1 studio")!);
    expect(el.textContent).toContain('"InBody for everyone" goes to Westlake');
    await press(button(el, "Post it")!);
    expect(fake.adds.map((a) => a.path)).toEqual(["studios/solon/taskRequests", "studios/westlake/taskRequests"]);
    expect(el.textContent).toContain("Posted at 2 studios.");
  });
});

describe("who is offered it", () => {
  it("offers a studio leader neither action", async () => {
    const el = await render({ trainer: { id: "lead", fullName: "Lee Der", role: "StudioLeader" } as unknown as Trainer });
    expect(el.textContent).toBe("");
  });
});
