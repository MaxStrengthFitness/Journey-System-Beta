// @vitest-environment jsdom
/**
 * THE BOARD, MOUNTED (Relay room, Sep 28 2026): Right now, the five doors,
 * the dealt card with Take it and Not now, Also fits, Just now and Later
 * today, over data handed in (the host's listeners are StudioHubView's, and
 * relay/planner.render.test mounts the whole shell over an empty database).
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
import { RelayProvider, type RelayContextValue } from "./RelayContext";
import { nowContext, type NowSession } from "./now-context";
import { resetSnoozes } from "./next-up";
import { readTracked, resetTracked } from "./tracked";
import { resetShiftCards } from "./shift-cards";
import { BEREGOND, GLORFINDEL, IORETH, MABLUNG, TODAY, ask, booking, row, template } from "./fixtures";
import type { TaskRow } from "../../studio-tasks/types";
import type { TaskActions } from "../../studio-tasks/useTaskActions";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  resetSnoozes();
  resetTracked();
  resetShiftCards();
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
    // Two sessions running at 2:18 on the studio's floor: a quiet floor.
    schedules: [booking("a", BEREGOND, "Odo Proudfoot", "14:00"), booking("b", MABLUNG, "Belladonna Took", "14:10")],
    sessions: [],
    machines: [],
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
  props: { requests?: ReturnType<typeof ask>[]; relay?: Partial<RelayContextValue>; rows?: TaskRow[]; unknown?: boolean; quietFloorSessions?: number } = {},
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
            loading={false}
            behind={(door) => <p data-behind={door}>Lanes behind {door}</p>}
            unknown={props.unknown}
            quietFloorSessions={props.quietFloorSessions}
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

describe("the Board", () => {
  it("opens Floor work on a quiet floor and says why, with its proof", async () => {
    const { h } = await render();
    expect(h.querySelector(".rbd-lens")?.textContent).toContain("The floor is quiet: 2 sessions running now. A good time for floor work.");
    const open = h.querySelector('.rbd-door[aria-pressed="true"]');
    expect(open?.textContent).toContain("Floor work");
    expect(open?.querySelector('[aria-label="Relay\'s pick"]')).not.toBeNull();
    expect(h.querySelector("[data-behind]")?.getAttribute("data-behind")).toBe("floor");
  });

  it("measures a quiet floor by the studio's own number (the setting, Sep 28 2026)", async () => {
    // Two sessions running: quiet by the app's 2, busy for a studio that set 1.
    const { h } = await render({ quietFloorSessions: 1 });
    expect(h.querySelector(".rbd-lens")?.textContent).toContain("a good time for desk work");
    expect(h.querySelector('.rbd-door[aria-pressed="true"]')?.textContent).toContain("Desk work");
  });

  it("deals the best fit as the biggest words, with Take it and Not now the same size", async () => {
    const { h } = await render();
    const card = h.querySelector(".rbd-dealt");
    expect(card?.querySelector(".rbd-dealt__title")?.textContent).toBe("Restock towels");
    expect(card?.textContent).toContain("The studio");
    expect(card?.textContent).toContain("~3 min");
    const buttons = [...card!.querySelectorAll(".rbd-acts .rbd-btn")].map((b) => b.textContent?.trim());
    // Take it and Not now first and the same size; Done closes a chore in one tap.
    expect(buttons).toEqual(["Take it", "Not now", "Done"]);
    expect(card?.textContent).toContain('"Not now" leaves no trace.');
    // Two more that also fit, and Deal me another.
    const alts = [...h.querySelectorAll(".rbd-alt")].map((a) => a.querySelector(".rbd-alt__t")?.firstChild?.textContent);
    expect(alts).toEqual(["Wipe-down round", "Deal me another"]);
  });

  it("takes the dealt job into the header's Tracking chip, and says so on the card", async () => {
    const { h } = await render();
    await click(h.querySelector(".rbd-btn--primary"));
    expect(readTracked("s1", TODAY)).toMatchObject({ id: expect.stringContaining("towels"), title: "Restock towels" });
    expect(h.querySelector(".rbd-state")?.textContent).toContain("You're on it.");
    await click([...h.querySelectorAll(".rbd-state button")].find((b) => b.textContent === "Stop tracking"));
    expect(readTracked("s1", TODAY)).toBeNull();
  });

  it("passes a card over with Not now, writing nothing, and deals the next", async () => {
    const { h } = await render();
    await click([...h.querySelectorAll(".rbd-acts .rbd-btn")].find((b) => b.textContent === "Not now"));
    expect(h.querySelector(".rbd-dealt__title")?.textContent).toBe("Wipe-down round");
    expect(writes.updates).toEqual([]);
  });

  it("brings an Also fits row up to the dealt card on a tap", async () => {
    const { h } = await render();
    await click([...h.querySelectorAll(".rbd-alt")].find((a) => a.textContent?.includes("Wipe-down round")));
    expect(h.querySelector(".rbd-dealt__title")?.textContent).toBe("Wipe-down round");
    // A chore's machines, each a tick anyone may make, on the card itself.
    const parts = [...h.querySelectorAll(".rbd-part")];
    expect(parts.map((p) => p.textContent)).toEqual(["Leg Press", "Chest Press", "Compound Row"]);
    expect(parts[2].getAttribute("aria-pressed")).toBe("true");
  });

  it("puts a teammate's cover ask first: Help a teammate opens, and the card says I can", async () => {
    const { h } = await render({
      requests: [ask("cover", { kind: "cover", title: "Cover Farmer Maggot at 4:20", createdBy: MABLUNG, priority: "urgent" })],
    });
    expect(h.querySelector(".rbd-lens")?.textContent).toContain("Mablung needs cover: Cover Farmer Maggot at 4:20. Nobody has taken it yet.");
    expect(h.querySelector('.rbd-door[aria-pressed="true"]')?.textContent).toContain("Help a teammate");
    const card = h.querySelector(".rbd-dealt");
    expect(card?.textContent).toContain("cover needed");
    expect(card?.querySelector(".rbd-btn--primary")?.textContent).toBe("I can");
  });

  it("follows the trainer to another door, and back to Relay's pick", async () => {
    const { h } = await render();
    await click([...h.querySelectorAll(".rbd-door")].find((d) => d.textContent?.includes("Desk work")));
    expect(h.querySelector("[data-behind]")?.getAttribute("data-behind")).toBe("desk");
    expect(h.querySelector(".rbd-lens")?.textContent).toContain("You opened Desk work.");
    expect(h.querySelector(".rbd-empty")?.textContent).toContain("Nothing waiting behind Desk work right now.");
    await click([...h.querySelectorAll("button")].find((b) => b.textContent?.includes("Back to Relay's pick")));
    expect(h.querySelector("[data-behind]")?.getAttribute("data-behind")).toBe("floor");
  });

  it("names the trainer's next gaps and when Closing opens, and the studio's chores by chore", async () => {
    const { h } = await render();
    const later = h.querySelector('[aria-label="Later today"]');
    expect(later?.textContent).toContain("3:10 PM");
    expect(later?.textContent).toContain("20 min free");
    expect(later?.textContent).toContain("Closing chores open");
    const team = h.querySelector('[aria-label="Team today"]');
    // One line a chore since the second wave (Sep 28 2026): it was one line a part of the day.
    expect(team?.textContent).toContain("Wipe-down round · 1 of 3");
    expect(team?.textContent).toContain("Restock towels · nobody on it yet");
    // Never a person's count.
    expect(team?.textContent).not.toMatch(/Ioreth|Beregond|Mablung/);
  });

  it("offers an Undo after Not now, and Undo brings the card back", async () => {
    const { h } = await render();
    await click([...h.querySelectorAll(".rbd-acts .rbd-btn")].find((b) => b.textContent === "Not now"));
    const bar = h.querySelector(".rbd-undo");
    expect(bar?.textContent).toContain('Passed over "Restock towels". Nothing was recorded.');
    await click(bar?.querySelector("button"));
    expect(h.querySelector(".rbd-dealt__title")?.textContent).toBe("Restock towels");
    expect(h.querySelector(".rbd-undo")).toBeNull();
  });

  it("closes a chore from the card's own Done, with an Undo that opens its machines again", async () => {
    const { h, actions } = await render();
    await click([...h.querySelectorAll(".rbd-alt")].find((a) => a.textContent?.includes("Wipe-down round")));
    await click([...h.querySelectorAll(".rbd-acts .rbd-btn")].find((b) => b.textContent?.includes("Done")));
    expect(actions.calls).toContain("completeGroup:wipe-down");
    expect(h.querySelector(".rbd-undo")?.textContent).toContain("Wipe-down round: marked done.");
    await click(h.querySelector(".rbd-undo button"));
    expect(actions.calls.filter((c) => c.startsWith("reopen:"))).toHaveLength(2);
  });

  it("marks a card done with a swipe right, and passes it over with a swipe left, each with an Undo", async () => {
    const { h, actions } = await render();
    const swipe = async (dx: number) => {
      const card = h.querySelector(".rbd-swipe .sw__card")!;
      await act(async () => {
        card.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 200, clientY: 100, button: 0 }));
        card.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: 200 + dx, clientY: 100 }));
      });
      await act(async () => {
        card.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 200 + dx, clientY: 100 }));
      });
    };
    await swipe(-120);
    expect(h.querySelector(".rbd-dealt__title")?.textContent).toBe("Wipe-down round");
    expect(h.querySelector(".rbd-undo")?.textContent).toContain("Nothing was recorded.");
    await swipe(120);
    expect(actions.calls).toContain("completeGroup:wipe-down");
    expect(h.querySelector(".rbd-undo")?.textContent).toContain("marked done");
  });

  it("gives a studio's leader the Who? faces, in the order of who can help now, and names for a week", async () => {
    const people = [BEREGOND, MABLUNG, IORETH].map((p) => ({ id: p.id, fullName: p.name, role: "LifeTransformer", primaryHomeStudioId: "s1", accessibleStudioIds: ["s1"] }));
    const { h, actions } = await render({ relay: { canLead: true, trainers: people as never } });
    // Bring the chore up: Who? is offered on shared chores and asks.
    await click([...h.querySelectorAll(".rbd-alt")].find((a) => a.textContent?.includes("Wipe-down round")));
    const faces = [...h.querySelectorAll(".rwho__face")];
    // Mablung has a client now and Beregond is with one too: both busy; the leader choosing is left out.
    expect(faces.map((f) => f.getAttribute("aria-label"))).toEqual([
      "Put Beregond Guard on it: with a client until 2:30 PM",
      "Put Mablung Ranger on it: with a client until 2:40 PM",
    ]);
    expect(h.querySelector(".rwho")?.textContent).toContain("a name is a heads-up, not a lock");
    await click(h.querySelector(".rwho__span"));
    await click([...h.querySelectorAll('.rwho__pop [role="menuitemradio"]')].find((b) => b.textContent === "This week"));
    await click(faces[0]);
    expect(actions.calls).toContain("assign:wipe-down:Beregond Guard:7");
    expect(h.querySelector(".rbd-undo")?.textContent).toContain("Beregond has it for this week.");
    await click(h.querySelector(".rbd-undo button"));
    expect(actions.calls).toContain("assign:wipe-down:nobody:1");
  });

  it("never offers a trainer the faces: leadership assigns, trainers offer (AJ, q5)", async () => {
    const { h } = await render({ relay: { canLead: false } });
    await click([...h.querySelectorAll(".rbd-alt")].find((a) => a.textContent?.includes("Wipe-down round")));
    expect(h.querySelector(".rwho")).toBeNull();
  });

  it("lets the person an ask was handed to say they can't: it goes back on the board, with an Undo", async () => {
    const { h } = await render({
      requests: [ask("hugo", { kind: "handoff", title: "Finish Hugo's report", createdBy: BEREGOND, forId: IORETH.id, forName: IORETH.name })],
    });
    // Handed to you opens Mine.
    expect(h.querySelector(".rbd-lens")?.textContent).toContain("Beregond handed you something.");
    await click([...h.querySelectorAll(".rbd-acts .rbd-btn")].find((b) => b.textContent === "I can't"));
    expect(writes.updates).toContainEqual({ path: "studios/s1/taskRequests/hugo", data: { forId: "__delete__", forName: "__delete__" } });
    expect(h.querySelector(".rbd-undo")?.textContent).toContain("Back on the board, for anyone to take.");
    await click(h.querySelector(".rbd-undo button"));
    expect(writes.updates).toContainEqual({ path: "studios/s1/taskRequests/hugo", data: { forId: IORETH.id, forName: IORETH.name } });
  });

  it("won't guess on an empty list: no door is Relay's pick, and it says so", async () => {
    const { h } = await render({ relay: { schedules: [] } });
    expect(h.querySelector(".rbd-lens")?.textContent).toContain("Relay isn't saying how busy the floor is");
    expect(h.querySelector('[aria-label="Relay\'s pick"]')).toBeNull();
  });
  /* Opening and Close out (phase 6). */

  const card = (name: string) => document.querySelector(`.rsc[aria-label="${name}"]`);
  const button = (scope: ParentNode | null | undefined, words: string) =>
    [...(scope ?? document).querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === words);
  const dayDone = (over: Partial<RelayContextValue> = {}) => ({
    now: nowContext([mySession("x", "Barliman Butterbur", "14:40"), mySession("y", "Adelard Took", "15:30")], at("16:10"), TODAY),
    ...over,
  });

  it("opens the day with what's waiting, each line with its door, and Got it folds it for the day", async () => {
    const { h, relay } = await render({
      relay: { now: nowContext([mySession("x", "Barliman Butterbur", "14:40")], at("13:30"), TODAY), openRelayTab: vi.fn() },
      requests: [
        ask("cover", { kind: "cover", title: "Cover for Farmer Maggot at 4:20", createdBy: MABLUNG }),
        ask("hugo", { kind: "handoff", title: "Finish Hugo's report", createdBy: BEREGOND, forId: IORETH.id, forName: IORETH.name }),
      ],
    });
    const opening = card("Opening");
    expect([...opening!.querySelectorAll(".rsc__t")].map((t) => t.textContent)).toEqual([
      "One thing is handed to you.",
      "Mablung needs cover: Cover for Farmer Maggot at 4:20.",
      "One session today, at 2:40 PM with Barliman Butterbur.",
    ]);
    await click(button(opening, "Tracker"));
    expect(relay.openRelayTab).toHaveBeenCalledWith("mine");
    await click(button(opening, "Got it"));
    expect(card("Opening")).toBeNull();
    const line = h.querySelector(".rsc-line");
    expect(line?.textContent).toContain("Opening · done at 1:30 PM");
    await click(button(line, "Show again"));
    expect(card("Opening")).not.toBeNull();
  });

  it("draws no Opening card when there is nothing it can stand behind", async () => {
    await render({ relay: { now: nowContext([], at("07:00"), TODAY) }, rows: [] });
    expect(card("Opening")).toBeNull();
  });

  it("closes out once the last session has ended: what's left, each handed on with its Undo", async () => {
    const once = template("sign-card", {
      scope: "personal",
      ownerId: IORETH.id,
      kind: "facility",
      target: { kind: "facility" },
      category: "ops",
      title: "Sign the birthday card",
      recurrence: { type: "once", onDate: TODAY },
    });
    await render({
      relay: { ...dayDone(), openRelayTab: vi.fn() },
      rows: [row(once, undefined)],
      requests: [
        ask("hugo", { kind: "handoff", title: "Finish Hugo's report", createdBy: BEREGOND, forId: IORETH.id, forName: IORETH.name }),
        ask("pin", { title: "Spare seat pin", createdBy: MABLUNG, claimedBy: IORETH }),
      ],
    });
    const close = card("Close out");
    expect(close?.textContent).toContain("hand on what's left");
    expect([...close!.querySelectorAll(".rsc__row .rsc__t")].map((t) => t.firstChild?.textContent)).toEqual([
      "Finish Hugo's report",
      "Spare seat pin",
      "Sign the birthday card",
    ]);

    await click(button(close, "Back to the board"));
    expect(writes.updates).toContainEqual({ path: "studios/s1/taskRequests/hugo", data: { forId: "__delete__", forName: "__delete__" } });
    await click(button(document, "Undo"));
    expect(writes.updates).toContainEqual({ path: "studios/s1/taskRequests/hugo", data: { forId: IORETH.id, forName: IORETH.name } });

    await click(button(close, "Hand back"));
    expect(writes.updates).toContainEqual({ path: "studios/s1/taskRequests/pin", data: { claimedBy: null, claimedAt: null } });

    await click(button(close, "Move to tomorrow"));
    expect(writes.sets).toHaveLength(1);
    expect(writes.sets[0].path).toBe(`trainers/${IORETH.id}/taskTemplates/sign-card`);
    expect(writes.sets[0].data.recurrence).toEqual({ type: "once", onDate: "2026-09-29" });
    await click(button(document, "Undo"));
    expect(writes.sets[1].data.recurrence).toEqual({ type: "once", onDate: TODAY });
  });

  it("asks the team to take a chore a leader named you on, and drafts the day in facts", async () => {
    const chore = template("closing-wipe", { title: "Lumbar Extension wipe" });
    const { relay } = await render({
      relay: dayDone({ openCapture: vi.fn() }),
      rows: [row(chore, "lu", "open", { machineName: "Lumbar Extension", instance: { assignedTo: IORETH, assignedBy: GLORFINDEL } as never })],
    });
    const close = card("Close out");
    await click(button(close, "Ask the team"));
    expect(relay.openCapture).toHaveBeenCalledWith(expect.objectContaining({ destination: "floor", askKind: "help" }));
    expect(close?.querySelector(".rsc__draft")?.textContent).toBe(
      "Monday, September 28. 2 sessions on your schedule today, the last ending at 4:00 PM.",
    );
    await click(button(close, "Got it"));
    expect(card("Close out")).toBeNull();
    expect(document.querySelector(".rsc-line")?.textContent).toContain("Close out · done at 4:10 PM");
  });

  it("never says nothing is left when a read failed", async () => {
    await render({ relay: dayDone(), unknown: true });
    expect(card("Close out")?.textContent).toContain("Some of today's list couldn't be loaded");
    expect(card("Close out")?.textContent).not.toContain("Nothing is left open");
  });

  /* The Ask sheet and the open-questions trail (phase 7). */

  it("puts the Ask sheet's six tiles behind Help a teammate, each opening the sheet on its tile", async () => {
    const openAsk = vi.fn();
    const { h } = await render({ relay: { openAsk } });
    await click([...h.querySelectorAll(".rbd-door")].find((d) => d.textContent?.includes("Help a teammate")));
    const asks = h.querySelector('[aria-label="Ask the team"]');
    expect([...asks!.querySelectorAll(".rbd-ask")].map((b) => b.textContent)).toEqual([
      "Cover me",
      "A hand on the floor",
      "Hand this off",
      "A question",
      "Something's broken",
      "Other",
    ]);
    await click(button(asks, "Cover me"));
    expect(openAsk).toHaveBeenCalledWith({ tile: "cover" });
  });

  it("deals a question with Answer, and undoing its close opens her thread again", async () => {
    const { h } = await render({
      requests: [ask("q1", { kind: "question", title: "Nancy isn't feeling her seated dip", createdBy: MABLUNG, clientId: "c-nancy", threadId: "root-1" })],
    });
    await click([...h.querySelectorAll(".rbd-door")].find((d) => d.textContent?.includes("Help a teammate")));
    const acts = [...h.querySelectorAll(".rbd-acts .rbd-btn")].map((b) => b.textContent?.trim());
    expect(acts).toEqual(["Answer", "Not now", "Done"]);
    await click([...h.querySelectorAll(".rbd-acts .rbd-btn")].find((b) => b.textContent?.trim() === "Done"));
    expect(writes.updates).toContainEqual(expect.objectContaining({ path: "studios/s1/taskRequests/q1", data: expect.objectContaining({ status: "resolved" }) }));
    expect(writes.adds.find((a) => a.path === "journalEntries")?.data).toMatchObject({ body: "Ioreth closed it without an answer.", authorId: IORETH.id });
    await click(button(document, "Undo"));
    expect(writes.updates).toContainEqual({ path: "journalEntries/root-1", data: { resolvedAt: null, updatedAt: "__now__" } });
    expect(writes.adds.filter((a) => a.path === "journalEntries").map((a) => a.data.body)).toEqual([
      "Ioreth closed it without an answer.",
      "Ioreth opened it again.",
    ]);
  });

  it("says when Close out opens, and previews it early", async () => {
    const { h } = await render();
    const line = h.querySelector(".rsc-line");
    expect(line?.textContent).toContain("Close out · opens at 4:00 PM, when your last session ends");
    await click(button(line, "Preview"));
    expect(card("Close out")?.textContent).toContain("a preview · it opens at 4:00 PM");
    await click(button(card("Close out"), "Close"));
    expect(card("Close out")).toBeNull();
  });
});

