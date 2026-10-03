// @vitest-environment jsdom
/**
 * THE BOARD, MOUNTED (the Relay Board rebuild, Oct 3 2026): the parts of the
 * day, the four columns of checkbox cards, the box and its Undo, the work
 * opened beside the board, over data handed in (the host's listeners are
 * StudioHubView's, and relay/planner.render.test mounts the whole shell over
 * an empty database).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const writes = vi.hoisted(() => ({
  updates: [] as { path: string; data: unknown }[],
  sets: [] as { path: string; data: Record<string, unknown> }[],
  adds: [] as { path: string; data: Record<string, unknown> }[],
}));
vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t-ioreth" } }, functions: {} }));
vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "s1", activeStudio: { id: "s1", name: "Westlake" }, network: null, studios: [] }),
}));
vi.mock("firebase/firestore", () => {
  /** Firestore refuses undefined anywhere in a write; so does this one. */
  const hasUndefined = (v: unknown): boolean =>
    v === undefined || (Array.isArray(v) ? v.some(hasUndefined) : v !== null && typeof v === "object" && Object.values(v).some(hasUndefined));
  return {
    doc: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
    collection: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
    updateDoc: async (ref: { path: string }, data: unknown) => {
      if (hasUndefined(data)) throw new Error("Unsupported field value: undefined");
      writes.updates.push({ path: ref.path, data });
    },
    addDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
      if (hasUndefined(data)) throw new Error("Unsupported field value: undefined");
      writes.adds.push({ path: ref.path, data });
      return { id: "n1" };
    },
    setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
      if (hasUndefined(data)) throw new Error("Unsupported field value: undefined");
      writes.sets.push({ path: ref.path, data });
    },
    onSnapshot: () => () => {},
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    deleteField: () => "__delete__",
    serverTimestamp: () => "__now__",
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d },
    increment: (n: number) => n,
    FieldPath: class {},
    writeBatch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
  };
});

import { ToastProvider } from "../../../contexts/ToastContext";
import { Board } from "./Board";
import { RelayProvider, type PanelContent, type RelayContextValue } from "./RelayContext";
import { nowContext, type NowSession } from "./now-context";
import { BEREGOND, IORETH, MABLUNG, TODAY, ask, booking, row, template } from "./fixtures";
import type { TaskRow } from "../../studio-tasks/types";
import type { TaskActions } from "../../studio-tasks/useTaskActions";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  writes.updates = [];
  writes.sets = [];
  writes.adds = [];
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
});

const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const mySession = (id: string, clientName: string, start: string): NowSession => ({
  id,
  clientId: id,
  clientName,
  startMin: at(start),
  endMin: at(start) + 30,
  status: "Scheduled",
});

function fakeActions(): TaskActions & { calls: string[] } {
  const calls: string[] = [];
  const rec = (name: string) => async (x: { id?: string; templateId?: string }) => {
    calls.push(`${name}:${x.id ?? x.templateId}`);
  };
  return {
    calls,
    busyIds: new Set(),
    busy: false,
    complete: rec("complete") as never,
    reopen: rec("reopen") as never,
    completeGroup: rec("completeGroup") as never,
    completeMany: async () => {},
    toggleClaim: rec("toggleClaim") as never,
    toggleClaimGroup: rec("toggleClaimGroup") as never,
    assign: (async (g: { templateId: string }, who: { name: string } | null, opts?: { days?: number }) => {
      calls.push(`assign:${g.templateId}:${who ? who.name : "nobody"}:${opts?.days ?? 1}`);
    }) as never,
    closeWithNote: async () => {},
  };
}

const wipe = template("wipe-down", { title: "Wipe-down round", estMinutes: 2 });
const towels = template("towels", { title: "Restock towels", kind: "facility", target: { kind: "facility" }, estMinutes: 3 });

function relayValue(over: Partial<RelayContextValue> = {}): RelayContextValue {
  return {
    studioId: "s1",
    studioName: "Westlake",
    authTrainer: { id: IORETH.id, fullName: IORETH.name } as never,
    uid: IORETH.id,
    trainers: [],
    clients: [],
    schedules: [booking("a", BEREGOND, "Odo Proudfoot", "14:00"), booking("b", MABLUNG, "Belladonna Took", "14:10")],
    sessions: [],
    machines: [],
    // 2:18 PM: the middle of the shift, between clients.
    now: nowContext([mySession("x", "Barliman Butterbur", "14:40"), mySession("y", "Adelard Took", "15:30")], at("14:18"), TODAY),
    canLead: false,
    panel: null,
    openCapture: () => {},
    openPanel: vi.fn(),
    closePanel: () => {},
    ...over,
  };
}

async function render(
  props: {
    requests?: ReturnType<typeof ask>[];
    relay?: Partial<RelayContextValue>;
    rows?: TaskRow[];
    unknown?: boolean;
    onAssign?: (g: unknown) => void;
  } = {},
) {
  const actions = fakeActions();
  const relay = relayValue(props.relay);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <ToastProvider>
        <RelayProvider value={relay}>
          <Board
            rows={[
              row(wipe, "lp", "open", { machineName: "Leg Press" }),
              row(wipe, "cp", "open", { machineName: "Chest Press" }),
              row(wipe, "cr", "done", { machineName: "Compound Row" }),
              row(towels, undefined),
              ...(props.rows ?? []),
            ]}
            jobs={[]}
            requests={props.requests ?? []}
            actions={actions}
            author={IORETH}
            onOpenJob={() => {}}
            onAssign={props.onAssign as never}
            loading={false}
            unknown={props.unknown}
          />
        </RelayProvider>
      </ToastProvider>,
    );
  });
  return { h: host, actions, relay };
}

async function click(el: Element | null | undefined) {
  expect(el).toBeTruthy();
  await act(async () => (el as HTMLElement).click());
}

const cardTitled = (h: HTMLElement, title: string) =>
  [...h.querySelectorAll<HTMLElement>(".rbc")].find((c) => c.querySelector(".rbc__t")?.textContent?.includes(title));
const colOf = (h: HTMLElement, label: string) => [...h.querySelectorAll<HTMLElement>(".rbg__col")].find((c) => c.getAttribute("aria-label") === label);

/** What the Board last opened beside it, drawn into the page so its buttons can be tapped. */
async function drawPanel(relay: RelayContextValue) {
  const calls = (relay.openPanel as ReturnType<typeof vi.fn>).mock.calls;
  const content = calls[calls.length - 1]?.[0] as PanelContent | undefined;
  expect(content).toBeTruthy();
  const box = document.createElement("div");
  document.body.appendChild(box);
  const r = createRoot(box);
  await act(async () => {
    r.render(
      <ToastProvider>
        <RelayProvider value={relay}>
          <div>{content!.body}</div>
          <div>{content!.foot}</div>
        </RelayProvider>
      </ToastProvider>,
    );
  });
  return { box, content: content!, unmount: () => act(() => r.unmount()) };
}

describe("the Board", () => {
  it("opens on the part of the day it is now, with its four columns and every part's count in the tabs", async () => {
    const { h } = await render();
    const tabs = [...h.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(["Opening0", "Between clients0/2", "Close0", "This week0"]);
    expect(h.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("Between clients");
    expect(h.querySelector("#rb-part-day .rbt__now")).not.toBeNull();
    expect([...h.querySelectorAll(".rbg__col")].map((c) => c.getAttribute("aria-label"))).toEqual(["Floor", "Desk", "Clients", "Team"]);
    expect(h.querySelector(".rbd-status")?.textContent).toContain("0 of 2 done");
    const wipeCard = cardTitled(h, "Wipe-down round");
    expect(wipeCard?.dataset.state).toBe("started");
    expect(wipeCard?.querySelector(".rbc__line")?.textContent).toContain("1 of 3 done");
    expect(cardTitled(h, "Restock towels")?.querySelector(".rbc__line")?.textContent).toBe("Anyone · ~3 min");
    // Nothing is dealt and nothing is picked: the board is the plan (AJ, Oct 3 2026).
    expect(h.textContent).not.toContain("Dealt to you");
    expect(h.querySelector(".rbd-door")).toBeNull();
    // Just now stays, at the foot.
    expect(h.querySelector(".rjn")).not.toBeNull();
  });

  it("draws the parts of the day in the header's bar when the shell gives it one", async () => {
    const subhead = document.createElement("div");
    document.body.appendChild(subhead);
    const { h } = await render({ relay: { slots: { news: null, subhead } } });
    expect(subhead.querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(h.querySelector('[role="tab"]')).toBeNull();
  });

  it("finishes a chore with its box, and the Undo opens it again", async () => {
    const { h, actions } = await render();
    await click(cardTitled(h, "Restock towels")?.querySelector(".rbc__box"));
    expect(actions.calls).toContain("completeGroup:towels");
    expect(h.querySelector(".rbd-undo")?.textContent).toContain("Restock towels: done.");
    await click(h.querySelector(".rbd-undo__btn"));
    expect(actions.calls.filter((c) => c.startsWith("reopen:"))).toHaveLength(1);
  });

  it("takes a tick back from a finished chore, with its Undo", async () => {
    const shelf = template("shelf", { title: "Tidy the shelf", kind: "facility", target: { kind: "facility" } });
    const { h, actions } = await render({ rows: [row(shelf, undefined, "done")] });
    const card = cardTitled(h, "Tidy the shelf");
    expect(card?.dataset.state).toBe("done");
    await click(card?.querySelector(".rbc__box"));
    expect(actions.calls).toContain(`reopen:${row(shelf, undefined).id}`);
    expect(h.querySelector(".rbd-undo")?.textContent).toContain("not done after all");
  });

  it("opens a chore's machines beside the board from its words, with Mark all and I'm on it", async () => {
    const { h, actions, relay } = await render();
    await click(cardTitled(h, "Wipe-down round")?.querySelector(".rbc__main"));
    const { box, content, unmount } = await drawPanel(relay);
    expect(content.title).toBe("Wipe-down round");
    expect([...box.querySelectorAll(".rbd-part__t")].map((t) => t.textContent)).toEqual(["Leg Press", "Chest Press", "Compound Row"]);
    await click([...box.querySelectorAll(".rbd-part")][0]);
    expect(actions.calls).toContain(`complete:${row(wipe, "lp").id}`);
    await click([...box.querySelectorAll("button")].find((b) => b.textContent?.includes("I'm on it")));
    expect(actions.calls).toContain("toggleClaimGroup:wipe-down");
    expect([...box.querySelectorAll("button")].some((b) => b.textContent?.includes("Mark all 2 done"))).toBe(true);
    // A trainer is never offered a leader's naming.
    expect([...box.querySelectorAll("button")].some((b) => b.textContent?.includes("Put a name on it"))).toBe(false);
    unmount();
  });

  it("lets a leader put a name on a chore, through the host's Assign", async () => {
    const onAssign = vi.fn();
    const { h, relay } = await render({ relay: { canLead: true }, onAssign });
    await click(cardTitled(h, "Wipe-down round")?.querySelector(".rbc__main"));
    const { box, unmount } = await drawPanel(relay);
    await click([...box.querySelectorAll("button")].find((b) => b.textContent?.includes("Put a name on it")));
    expect(onAssign).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("shows a teammate's cover in orange under Team, and its box opens it rather than closing it", async () => {
    const cover = ask("cover", { kind: "cover", title: "Cover my 4:20?", createdBy: MABLUNG });
    const { h, relay } = await render({ requests: [cover] });
    const card = cardTitled(colOf(h, "Team")!, "Cover my 4:20?");
    expect(card?.dataset.state).toBe("waiting");
    expect(card?.dataset.box).toBe("open");
    expect(h.querySelector("#rb-part-day .rbt__wait")).not.toBeNull();
    await click(card?.querySelector(".rbc__box"));
    expect(writes.updates).toEqual([]);
    expect(relay.openPanel).toHaveBeenCalledWith(expect.objectContaining({ title: "Cover my 4:20?" }));
  });

  it("closes an ordinary ask with its box, and says so with an Undo", async () => {
    const todo = ask("todo", { kind: "todo", title: "Bring in the mail", createdBy: BEREGOND });
    const { h } = await render({ requests: [todo] });
    await click(cardTitled(h, "Bring in the mail")?.querySelector(".rbc__box"));
    expect(writes.updates.some((u) => u.path.includes("taskRequests/todo"))).toBe(true);
    expect(h.querySelector(".rbd-undo")?.textContent).toContain('Closed "Bring in the mail".');
  });

  it("switches the part of the day on a tap", async () => {
    const lights = template("lights", { title: "Lights and music", kind: "facility", target: { kind: "facility" } });
    const am = { ...row(lights, undefined), id: `lights__${TODAY}__am`, shift: "am" as const };
    const { h } = await render({ rows: [am] });
    await click(h.querySelector("#rb-part-open"));
    expect(h.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain("Opening");
    expect(cardTitled(h, "Lights and music")).toBeTruthy();
    expect(cardTitled(h, "Wipe-down round")).toBeUndefined();
  });

  it("says when a read failed, and never calls an empty part 'nothing' then", async () => {
    const { h } = await render({ unknown: true });
    expect(h.querySelector(".rbd-warn")?.textContent).toContain("may not be everything");
    await click(h.querySelector("#rb-part-week"));
    expect(h.querySelector(".rbd-empty")).toBeNull();
  });

  it("says a part with nothing in it is empty, and how to add to it", async () => {
    const { h } = await render();
    await click(h.querySelector("#rb-part-close"));
    expect(h.querySelector(".rbd-empty")?.textContent).toContain("Nothing for close.");
  });
});
