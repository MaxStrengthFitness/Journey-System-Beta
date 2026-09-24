// @vitest-environment jsdom
/**
 * Mounts the Pulse panel (ClientCheckInPanel) against a fake Firestore.
 *
 * WHY THIS EXISTS. The panel returned early for "no client" and declared the
 * search box's `useState` and `useEffect` BELOW that return. Mounted with no
 * client and then given one — which is exactly what the profile and the
 * session slide-over do while a client loads — React sees more hooks than
 * the render before and throws. Typecheck, the suite and the build all pass
 * that code; only a mount catches it (see the render-test note in CLAUDE.md).
 *
 * It also proves the round's screen is really there: the three pillar
 * headers, the scale ends, the history log with a saved note, and a change
 * made in the draft landing in the log and in the autosaved `changeLog`.
 *
 * Reporting round: a statement is the five frequency words on the Dial (no
 * 0…10 buttons anywhere), and "Hand to client" opens client mode, where a
 * tap writes the answer with `enteredBy: "client"`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

// Tell React this is a test renderer, so act() is honoured without warnings.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: {} }));
vi.mock("../../lib/firestore-errors", () => ({
  OperationType: { GET: "get", CREATE: "create", UPDATE: "update", DELETE: "delete" },
  handleFirestoreError: vi.fn(),
}));

/** Every progressReports document the fake knows, newest first. */
let store: Array<Record<string, any>> = [];
let failHistory = false;
const updateDocCalls: Array<{ path: string; data: any }> = [];
const addDocCalls: any[] = [];
/** Every getDocs the fake answered (client codex: a handed-in draft reads nothing more). */
const getDocsCalls: string[] = [];
/** While set, every read waits for it — to see the panel before the draft is in. */
let holdReads: Promise<void> | null = null;

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    collection: (_db: unknown, path: string) => ({ __collection: path }),
    doc: (_db: unknown, ...segments: string[]) => ({ __path: segments.join("/") }),
    query: (coll: any, ...constraints: any[]) => ({ ...coll, constraints }),
    where: (field: string, op: string, value: unknown) => ({ type: "where", field, op, value }),
    orderBy: (field: string, dir: string) => ({ type: "orderBy", field, dir }),
    limit: (n: number) => ({ type: "limit", n }),
    serverTimestamp: () => ({ __serverTime: true }),
    getDocs: async (q: any) => {
      getDocsCalls.push(q.__collection);
      if (holdReads) await holdReads;
      await new Promise((r) => setTimeout(r, 0));
      const wheres = q.constraints.filter((c: any) => c.type === "where");
      const max = q.constraints.find((c: any) => c.type === "limit")?.n ?? Infinity;
      const isDraftQuery = wheres.some((c: any) => c.field === "status");
      if (!isDraftQuery && failHistory) throw Object.assign(new Error("offline"), { code: "unavailable" });
      const rows = store.filter((d) =>
        wheres.every((c: any) => (c.field in d ? d[c.field] === c.value : false)),
      );
      return {
        docs: rows.slice(0, max).map(({ id, ...data }) => ({ id, data: () => data })),
      };
    },
    updateDoc: async (ref: any, data: any) => {
      updateDocCalls.push({ path: ref.__path, data });
    },
    addDoc: async (_coll: any, data: any) => {
      addDocCalls.push(data);
      return { id: "new-draft" };
    },
    deleteDoc: async () => {},
  };
});

import { ClientCheckInPanel } from "../../components/journal/ClientCheckInPanel";
import { useCheckInDraft, type CheckInDraftState } from "./useCheckInDraft";
import { emptyAssessment } from "./scoring";
import { studioTodayKey } from "../../lib/studio-time";
import type { Client, Trainer } from "../../types";

const DAY = 86_400_000;
const daysAgo = (n: number) => studioTodayKey(new Date(Date.now() - n * DAY));
const secondsAgo = (days: number) => ({ seconds: Math.floor((Date.now() - days * DAY) / 1000) });

function sleep(v: number) {
  const a = emptyAssessment();
  a.answers = {
    sleepRecovery_1: { value: v },
    sleepRecovery_2: { value: v },
    sleepRecovery_3: { value: v },
  };
  return a;
}

function seed() {
  const r2 = { ...sleep(9), completedAt: daysAgo(30) };
  r2.changeLog = [
    {
      categoryId: "sleepRecovery",
      from: 6,
      to: 11,
      at: new Date(Date.now() - 25 * DAY).toISOString(),
      byId: "t9",
      byName: "Ana Lopez",
      note: "Client finally purchased a new mattress; sleep improved",
    },
  ];
  store = [
    {
      id: "d1",
      clientId: "judy",
      status: "Draft",
      isCheckInOnly: true,
      trainerName: "Ana Lopez",
      date: daysAgo(2),
      subjective: { ...emptyAssessment(), completedAt: daysAgo(2) },
      checkInSectionsReviewed: [],
      createdAt: secondsAgo(2),
      updatedAt: secondsAgo(1),
    },
    {
      id: "r2",
      clientId: "judy",
      status: "Finalized",
      isCheckInOnly: true,
      trainerName: "Ana Lopez",
      date: daysAgo(30),
      subjective: r2,
      checkInSectionsReviewed: [],
      createdAt: secondsAgo(30),
      updatedAt: secondsAgo(20),
    },
    {
      id: "r1",
      clientId: "judy",
      status: "Finalized",
      isCheckInOnly: true,
      trainerName: "Sam Reyes",
      date: daysAgo(200),
      subjective: {
        ...sleep(5),
        completedAt: daysAgo(200),
        protein: { ...emptyAssessment().protein, daysPerWeekOnTarget: 2 },
      },
      checkInSectionsReviewed: [],
      createdAt: secondsAgo(200),
      updatedAt: secondsAgo(200),
    },
  ];
}

const client = { id: "judy", firstName: "Judy", lastName: "Hart", weight: "150" } as unknown as Client;
const trainer = { id: "t1", fullName: "Christian Moore", initials: "CM" } as unknown as Trainer;

async function mount(ui: React.ReactNode): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  return { host, root };
}

const settle = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  seed();
  failHistory = false;
  updateDocCalls.length = 0;
  addDocCalls.length = 0;
  getDocsCalls.length = 0;
  holdReads = null;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ClientCheckInPanel mounts", () => {
  it("renders nothing without a client, then the whole panel once one arrives — no hook-order crash", async () => {
    const { host, root } = await mount(<ClientCheckInPanel client={null} trainer={trainer} machines={[]} />);
    expect(host.textContent).toBe("");

    await act(async () => {
      root.render(
        <StrictMode>
          <ClientCheckInPanel client={client} trainer={trainer} machines={[]} />
        </StrictMode>,
      );
    });
    await settle();

    const text = host.textContent ?? "";
    // The three pillars, in order.
    const pillars = [...host.querySelectorAll(".sra-pillar__title")].map((n) => n.textContent);
    expect(pillars).toEqual(["Recovery & Fuel", "Physical & Functional", "Psychological & Behavioral"]);
    // Four areas under each.
    for (const p of host.querySelectorAll(".sra-pillar")) {
      expect(p.querySelectorAll(".sra-area-btn")).toHaveLength(4);
    }
    // The name, the living framing and who touched it last.
    expect(host.querySelector(".sra-head__title")?.textContent).toBe("Pulse");
    expect(text).toContain("never done");
    expect(text).toContain("by Ana Lopez");
    // The pillar's sentence: sleep was updated 25 days ago; the rest of the pillar was not.
    expect(text).toContain("1 of 4 updated in the last 90 days");
    // Protein was last touched 200 days ago: the quiet marker.
    const protein = [...host.querySelectorAll(".sra-area-btn")].find((b) =>
      b.textContent?.includes("Protein compliance"),
    )!;
    expect(protein.querySelector(".sra-stale")?.textContent).toBe("90+ days");

    // The history log, with the note saved at the time.
    const log = host.querySelector('section[aria-label="Pulse history"]')!;
    expect(log).not.toBeNull();
    expect(log.textContent).toContain("Client finally purchased a new mattress; sleep improved");
    expect(log.textContent).toContain("6 → 11");
    expect(log.textContent).toContain("Recovery & Fuel");

    await act(async () => root.unmount());
  });

  it("opens the first area with its scale ends in plain words", async () => {
    const { host, root } = await mount(<ClientCheckInPanel client={client} trainer={trainer} machines={[]} />);
    await settle();
    const ends = host.querySelector(".sra-ends");
    expect(ends?.textContent).toContain("Under 5 hours most nights, broken sleep, no routine");
    expect(ends?.textContent).toContain("7–9 hours most nights on a steady schedule");
    await act(async () => root.unmount());
  });

  it("answers a statement on the five frequency words, never a 0…10 button", async () => {
    const { host, root } = await mount(<ClientCheckInPanel client={client} trainer={trainer} machines={[]} />);
    await settle();

    // The open area (sleep) shows its three statements on the frequency Dial.
    const dials = host.querySelectorAll('[data-scale="frequency"]');
    expect(dials).toHaveLength(3);
    const legend = Array.from(dials[0].querySelectorAll(".rt__legend > span")).map((n) => n.textContent);
    expect(legend).toEqual(["Not at all", "Rarely", "Sometimes", "Often", "Nearly always"]);
    // Nothing on the panel is a 0…10 button, and no "+ Add note" per statement.
    for (let i = 0; i <= 10; i++) {
      expect(host.querySelector(`button[aria-label="${i}"]`)).toBeNull();
    }
    expect(host.querySelectorAll(".sr-scale, .sr-range, .sr-note-toggle")).toHaveLength(0);
    expect(host.textContent).not.toContain("Add note");
    await act(async () => root.unmount());
  });

  it("logs a change made in the draft, takes a note inline, and autosaves both", async () => {
    const { host, root } = await mount(<ClientCheckInPanel client={client} trainer={trainer} machines={[]} />);
    await settle();

    // Sleep statement 1 → "Not at all" (0). The other two carry forward from
    // the last save (9, 9), so the area goes 11 → 7.
    const group = host.querySelector('[role="radiogroup"][aria-label="I am getting consistent, quality sleep."]')!;
    const notAtAll = group.querySelector<HTMLButtonElement>('button[aria-label="Not at all"]')!;
    await act(async () => {
      notAtAll.click();
    });
    expect(group.parentElement?.querySelector(".rt__word")?.textContent).toBe("Not at all");

    const just = host.querySelector(".sra-justnow")!;
    expect(just.textContent).toContain("11 → 7");
    const log = host.querySelector('section[aria-label="Pulse history"]')!;
    expect(log.querySelector(".sra-row--draft")?.textContent).toContain("In the open round");

    const input = just.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      typeInto(input, "Up with a new grandchild");
    });
    expect(log.querySelector<HTMLInputElement>(".sra-row--draft input")?.value).toBe("Up with a new grandchild");

    // Past the autosave debounce.
    await settle(1400);
    const write = updateDocCalls.find((c) => c.path === "progressReports/d1");
    expect(write).toBeDefined();
    expect(write!.data.subjective.changeLog).toEqual([
      expect.objectContaining({
        categoryId: "sleepRecovery",
        from: 11,
        to: 7,
        byId: "t1",
        byName: "Christian Moore",
        note: "Up with a new grandchild",
      }),
    ]);
    expect(write!.data.subjective.answers.sleepRecovery_1.value).toBe(0);
    expect(write!.data.subjective.enteredBy).toBe("coach");
    expect(addDocCalls).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it("hands the iPad to the client: a plain sheet, one area at a time, and a tap writes enteredBy client", async () => {
    const { host, root } = await mount(<ClientCheckInPanel client={client} trainer={trainer} machines={[]} />);
    await settle();

    const hand = host.querySelector<HTMLButtonElement>(".sra-hand")!;
    expect(hand.textContent).toContain("Hand to client");
    await act(async () => hand.click());

    const sheet = document.querySelector<HTMLElement>('[data-testid="pulse-client-mode"]')!;
    expect(sheet).not.toBeNull();
    expect(sheet.textContent).toContain("Judy, tap the word that fits.");
    expect(sheet.querySelector(".pcm__title")?.textContent).toBe("Sleep & Recovery");
    expect(sheet.querySelector(".pcm__step")?.textContent).toBe("1 of 8");
    // Three statements on the frequency Dial with all five words; nothing of the coach's.
    expect(sheet.querySelectorAll('[data-scale="frequency"]')).toHaveLength(3);
    expect(sheet.textContent).not.toMatch(/of 12|history|note|flag/i);
    expect(sheet.querySelector(".sr-score, .sra-log, .sr-pill, textarea")).toBeNull();

    // "Often" on the second statement.
    const group = sheet.querySelector('[role="radiogroup"][aria-label="I wake up feeling rested."]')!;
    await act(async () => group.querySelector<HTMLButtonElement>('button[aria-label="Often"]')!.click());

    // Next walks the areas; the last one offers Done.
    const next = () => sheet.querySelector<HTMLButtonElement>(".pcm__nav--primary")!;
    expect(next().textContent).toContain("Next");
    for (let i = 0; i < 7; i++) await act(async () => next().click());
    expect(sheet.querySelector(".pcm__step")?.textContent).toBe("8 of 8");
    expect(next().textContent).toContain("Done");
    await act(async () => next().click());
    expect(document.querySelector('[data-testid="pulse-client-mode"]')).toBeNull();

    // The panel now says whose answers these are, and the autosave carries the mark.
    expect(host.textContent).toContain("Judy's own answers");
    await settle(1400);
    const write = updateDocCalls.find((c) => c.path === "progressReports/d1");
    expect(write).toBeDefined();
    expect(write!.data.subjective.enteredBy).toBe("client");
    expect(write!.data.subjective.answers.sleepRecovery_2.value).toBe(8);

    // The coach's next edit takes it back.
    const coachGroup = host.querySelector('[role="radiogroup"][aria-label="I am getting consistent, quality sleep."]')!;
    await act(async () => coachGroup.querySelector<HTMLButtonElement>('button[aria-label="Sometimes"]')!.click());
    expect(host.textContent).not.toContain("Judy's own answers");
    await settle(1400);
    const later = updateDocCalls.filter((c) => c.path === "progressReports/d1").pop()!;
    expect(later.data.subjective.enteredBy).toBe("coach");
    await act(async () => root.unmount());
  });

  it("says the history is unknown, not empty, when it cannot be read", async () => {
    failHistory = true;
    const { host, root } = await mount(<ClientCheckInPanel client={client} trainer={trainer} machines={[]} />);
    await settle();
    const text = host.textContent ?? "";
    expect(text).toContain("couldn't be loaded");
    expect(text).not.toContain("None of 4 updated");
    expect(host.querySelectorAll(".sra-stale")).toHaveLength(0);
    await act(async () => root.unmount());
  });
});

/*
 * CLIENT CODEX (Sep 2026): the Body & Pulse page owns the ONE draft for the
 * client and hands it to the panel. The panel must then read nothing and
 * save nothing of its own — two drafts of one client autosaving side by side
 * is the duplicate-draft bug useCheckInDraft exists to prevent.
 */
describe("ClientCheckInPanel given the page's draft", () => {
  /** The page: one useCheckInDraft, one "Hand to client" of its own. */
  let pageDraft: CheckInDraftState | null = null;
  function Page({ start = false, onClosed }: { start?: boolean; onClosed?: () => void }) {
    const draft = useCheckInDraft({ client, trainer, machines: [] });
    pageDraft = draft;
    const [handing, setHanding] = useState(start);
    return (
      <>
        <button type="button" data-testid="page-hand" onClick={() => setHanding(true)}>
          Hand to client
        </button>
        <ClientCheckInPanel
          client={client}
          trainer={trainer}
          machines={[]}
          draft={draft}
          startInClientMode={handing}
          onClientModeClose={() => {
            setHanding(false);
            onClosed?.();
          }}
        />
      </>
    );
  }

  const sheet = () => document.querySelector<HTMLElement>('[data-testid="pulse-client-mode"]');

  it("draws the page's draft and makes no progressReports read of its own", async () => {
    // What the panel costs on its own, StrictMode included…
    const alone = await mount(<ClientCheckInPanel client={client} trainer={trainer} machines={[]} />);
    await settle();
    const ownReads = getDocsCalls.length;
    expect(ownReads).toBeGreaterThan(0);
    expect(getDocsCalls.every((c) => c === "progressReports")).toBe(true);
    await act(async () => alone.root.unmount());
    document.body.innerHTML = "";
    getDocsCalls.length = 0;

    // …is exactly what the page's one draft costs with the panel inside it.
    const { host, root } = await mount(<Page />);
    await settle();
    expect(getDocsCalls).toHaveLength(ownReads);

    // The panel shows that draft: the pillars, and who touched it last.
    const pillars = [...host.querySelectorAll(".sra-pillar__title")].map((n) => n.textContent);
    expect(pillars).toEqual(["Recovery & Fuel", "Physical & Functional", "Psychological & Behavioral"]);
    expect(host.textContent).toContain("by Ana Lopez");
    expect(host.querySelector('section[aria-label="Pulse history"]')?.textContent).toContain(
      "Client finally purchased a new mattress; sleep improved",
    );
    await act(async () => root.unmount());
  });

  it("edits the page's draft, and the page's one autosave writes it once", async () => {
    const { host, root } = await mount(<Page />);
    await settle();
    const group = host.querySelector('[role="radiogroup"][aria-label="I am getting consistent, quality sleep."]')!;
    await act(async () => group.querySelector<HTMLButtonElement>('button[aria-label="Not at all"]')!.click());
    // The page sees the answer the panel took: it is the same draft.
    expect(pageDraft!.assessment.answers.sleepRecovery_1?.value).toBe(0);

    await settle(1400);
    expect(updateDocCalls.filter((c) => c.path === "progressReports/d1")).toHaveLength(1);
    expect(addDocCalls).toHaveLength(0);
    await act(async () => root.unmount());
  });

  it("starts in client mode, but only once the draft is in", async () => {
    let release!: () => void;
    holdReads = new Promise<void>((r) => {
      release = r;
    });
    const { root } = await mount(<Page start />);
    await settle();
    // The draft is still loading: no sheet for the client to tap onto a blank round.
    expect(sheet()).toBeNull();

    await act(async () => release());
    await settle();
    expect(sheet()).not.toBeNull();
    expect(sheet()!.textContent).toContain("Judy, tap the word that fits.");
    await act(async () => root.unmount());
  });

  it("tells the page when client mode closes, and opens again when the page asks again", async () => {
    const onClosed = vi.fn();
    const { host, root } = await mount(<Page onClosed={onClosed} />);
    await settle();
    expect(sheet()).toBeNull();

    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="page-hand"]')!.click());
    expect(sheet()).not.toBeNull();

    await act(async () => sheet()!.querySelector<HTMLButtonElement>(".pcm__close")!.click());
    expect(sheet()).toBeNull();
    expect(onClosed).toHaveBeenCalledTimes(1);

    // A second tap on the page's button is a second hand-over.
    await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="page-hand"]')!.click());
    expect(sheet()).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("left without the new props, never opens client mode on its own", async () => {
    const { root } = await mount(<ClientCheckInPanel client={client} trainer={trainer} machines={[]} />);
    await settle();
    expect(sheet()).toBeNull();
    await act(async () => root.unmount());
  });
});
