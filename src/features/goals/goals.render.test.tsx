// @vitest-environment jsdom
/**
 * Mounts the Goals & Focus page's goal cards and the focus board.
 *
 * The goal cards do their work in click handlers that fire several
 * `updateField` calls in a row (mark achieved = four field edits), and the
 * record's Save bar decides what to write from those calls. Only a mount
 * proves the sequence leaves the form in the state the Save bar needs. The
 * harness below drives Her why, Working toward now and Reached (split out of
 * the long scroll's GoalsPanel in the client codex, phase 14) with the
 * record's real form (the client codex's useRecordForm), so the test checks
 * what would actually be written.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../types";
import type { ClientFocus, JournalEntry } from "../../types/journal";
import { HerWhyCard } from "./HerWhyCard";
import { WorkingTowardCard } from "./WorkingTowardCard";
import { ReachedShelf } from "./ReachedShelf";
import { herWhyLinks, reachedShelf } from "./goals-page";
import { FocusBoard } from "../../components/journal/FocusBoard";
import { useRecordForm } from "../client-codex/useRecordForm";
import { pronounsOf } from "../client-codex/kit";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-jane" } } }));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {}, info: () => {}, warning: () => {}, toast: () => {} }),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  mounted.push({ root, host });
  return host;
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

const click = (el: Element | null | undefined) =>
  act(async () => {
    if (!el) throw new Error("element not found");
    (el as HTMLElement).click();
  });

function typeInto(el: Element | null, value: string) {
  if (!el) throw new Error("field not found");
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  return act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const buttonByText = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

/** A kit field by its label's words: the <label> names its control by `for`. */
function fieldByLabel(host: HTMLElement, text: string): HTMLInputElement | HTMLTextAreaElement | null {
  const label = Array.from(host.querySelectorAll("label")).find((l) => l.textContent?.trim() === text);
  const id = label?.getAttribute("for");
  return id ? (host.querySelector(`[id="${id}"]`) as HTMLInputElement | HTMLTextAreaElement | null) : null;
}

/* ------------------------------------------------------------------ */
/* Goals                                                               */
/* ------------------------------------------------------------------ */

type Probe = { formData: Partial<Client>; dirty: ReadonlySet<string> };

/**
 * The record's real form (the client codex's useRecordForm): the same
 * dirty rules and the same Save bar payload the Goals page saves with.
 */
function GoalsHarness({ client, probe, canEdit = true }: { client: Client; probe: Probe; canEdit?: boolean }) {
  const form = useRecordForm({ client, trainerId: "t1", canEdit });
  probe.formData = form.formData;
  probe.dirty = form.dirty;
  const p = pronounsOf(client);
  const rows = reachedShelf({
    current: form.formData.goalHistory !== undefined ? form.formData.goalHistory : client.goalHistory,
    saved: client.goalHistory,
    focuses: [],
  });
  return (
    <>
      <HerWhyCard
        value={(form.formData.globalNotes as string | undefined) ?? ""}
        updateField={form.updateField}
        links={herWhyLinks({ client, fordStatus: "ready", fordEntries: [] })}
        canEdit={canEdit}
        dirty={form.isDirty("globalNotes")}
        revision={form.revision}
        pronouns={p}
        go={() => {}}
      />
      <WorkingTowardCard
        client={client}
        formData={form.formData}
        updateField={form.updateField}
        authTrainer={{ id: "t1", fullName: "Jane Coach" } as any}
        canEdit={canEdit}
        dirty={form.isDirty("smartGoal", "smartChecks", "goalTargetDate", "goalHistory")}
        revision={form.revision}
        pronouns={p}
      />
      <ReachedShelf rows={rows} focusesState="ready" coverage="complete" />
    </>
  );
}

const baseClient = (over: Partial<Client> = {}): Client =>
  ({
    id: "c1",
    firstName: "Judy",
    lastName: "Client",
    gender: "Female",
    globalNotes: "Wants to garden again",
    smartGoal: "Carry the grandkids up the stairs",
    ...over,
  }) as Client;

const card = (host: HTMLElement, id: string) => host.querySelector<HTMLElement>(`#${id}`)!;
/** The card's Edit / Done button (the kit's EditButton names what it edits). */
const editOf = (host: HTMLElement, id: string) =>
  card(host, id).querySelector<HTMLButtonElement>('button[aria-label^="Edit"], button[aria-label^="Done editing"]');

describe("the goal cards mount", () => {
  it("reads the why and the goal first, and Edit reveals the why", async () => {
    const probe = {} as Probe;
    const host = await mount(<GoalsHarness client={baseClient()} probe={probe} />);
    const why = card(host, "goals-why");
    expect(why.textContent).toContain("“Wants to garden again”");
    expect(why.textContent).toContain("Her why, as it's written on her record");
    await click(editOf(host, "goals-why"));
    expect((fieldByLabel(why, "Her why") as HTMLTextAreaElement).value).toBe("Wants to garden again");
  });

  it("shows the goal, its SMART words and five squares, and Edit reveals the goal and the five toggles", async () => {
    const probe = {} as Probe;
    const host = await mount(<GoalsHarness client={baseClient()} probe={probe} />);
    const now = card(host, "goals-now");
    expect(now.textContent).toContain("Carry the grandkids up the stairs");
    expect(now.textContent).toContain("Nothing ticked yet");
    expect(now.querySelectorAll(".gf-square")).toHaveLength(5);
    expect(now.querySelectorAll(".gf-square[data-on]")).toHaveLength(0);
    // The squares are not buttons: only Edit and Mark achieved are.
    expect(now.querySelectorAll(".gf-squares button")).toHaveLength(0);

    await click(editOf(host, "goals-now"));
    expect((fieldByLabel(now, "The goal") as HTMLTextAreaElement).value).toBe("Carry the grandkids up the stairs");
    // Five toggles, each a real button with its definition.
    const toggles = now.querySelectorAll(".gf-smart-toggle");
    expect(toggles).toHaveLength(5);
    expect(toggles[0].textContent).toContain("Specific");
  });

  it("ticks all five to a SMART goal, and a toggle back is not an edit", async () => {
    const probe = {} as Probe;
    const host = await mount(<GoalsHarness client={baseClient()} probe={probe} />);
    await click(editOf(host, "goals-now"));
    const toggles = () => Array.from(host.querySelectorAll(".gf-smart-toggle"));
    for (const t of toggles()) await click(t);
    expect(probe.formData.smartChecks).toEqual({ s: true, m: true, a: true, r: true, t: true });
    expect(probe.dirty.has("smartChecks")).toBe(true);

    // Done closes the editor; the read view says it, and that it is unsaved.
    await click(editOf(host, "goals-now"));
    expect(card(host, "goals-now").textContent).toContain("All five ticked");
    expect(card(host, "goals-now").querySelectorAll(".gf-square[data-on]")).toHaveLength(5);
    expect(card(host, "goals-now").textContent).toContain("Unsaved");

    await click(editOf(host, "goals-now"));
    for (const t of toggles()) await click(t);
    expect(probe.dirty.has("smartChecks")).toBe(false);
  });

  it("a target date ticks Time-bound", async () => {
    const probe = {} as Probe;
    const host = await mount(<GoalsHarness client={baseClient()} probe={probe} />);
    await click(editOf(host, "goals-now"));
    await typeInto(fieldByLabel(card(host, "goals-now"), "Target date"), "2026-11-26");
    expect(probe.formData.goalTargetDate).toBe("2026-11-26");
    expect(probe.formData.smartChecks?.t).toBe(true);
  });

  it("marks a goal achieved into Reached and clears it for the next one", async () => {
    const probe = {} as Probe;
    const client = baseClient({
      smartChecks: { s: true, m: true, a: true, r: true, t: true },
      goalTargetDate: "2026-11-26",
      goalHistory: [{ goal: "Older goal", achievedAt: "2025-05-01T12:00:00.000Z" }],
    });
    const host = await mount(<GoalsHarness client={client} probe={probe} />);
    expect(card(host, "goals-now").textContent).toContain("All five ticked");
    expect(card(host, "goals-now").textContent).toContain("Nov 26, 2026");

    await click(buttonByText(host, "Mark achieved"));
    await typeInto(fieldByLabel(card(host, "goals-now"), "Reward (optional)"), "Kaizen pin");
    await click(buttonByText(host, "Goal achieved"));

    const history = probe.formData.goalHistory!;
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      goal: "Carry the grandkids up the stairs",
      targetDate: "2026-11-26",
      reward: "Kaizen pin",
      byTrainerId: "t1",
      byName: "Jane Coach",
    });
    expect(Object.values(history[0]).every((v) => v !== undefined)).toBe(true);
    expect(probe.formData.smartGoal).toBe("");
    expect(probe.formData.goalTargetDate).toBe("");
    expect(probe.formData.smartChecks).toBeNull();
    // Everything the Save bar has to write, and nothing else.
    expect([...probe.dirty].sort()).toEqual(
      ["goalHistory", "goalTargetDate", "smartChecks", "smartGoal"].sort(),
    );

    // The squares and the achieve button go with the goal; Reached shows both,
    // the new one not saved yet.
    expect(card(host, "goals-now").querySelectorAll(".gf-square")).toHaveLength(0);
    expect(buttonByText(host, "Mark achieved")).toBeUndefined();
    expect(card(host, "goals-now").textContent).toContain("Nothing set yet. What is she working toward now?");
    const shelf = host.querySelector<HTMLElement>('[data-testid="goal-history"]')!;
    expect(shelf.textContent).toContain("Reached · 2 goals");
    expect(shelf.textContent).toContain("Kaizen pin");
    expect(shelf.textContent).toContain("Older goal");
    const rows = shelf.querySelectorAll(".gf-shelf__row");
    expect(rows[0].textContent).toContain("Carry the grandkids up the stairs");
    expect(rows[0].textContent).toContain("Not saved yet");
    expect(rows[1].textContent).not.toContain("Not saved yet");
  });

  it("a client with no checklist on record gets none written when a goal is achieved", async () => {
    const probe = {} as Probe;
    const host = await mount(<GoalsHarness client={baseClient()} probe={probe} />);
    await click(buttonByText(host, "Mark achieved"));
    await click(buttonByText(host, "Goal achieved"));
    expect(probe.dirty.has("smartChecks")).toBe(false);
    expect(probe.dirty.has("goalTargetDate")).toBe(false);
    expect(probe.formData.goalHistory).toHaveLength(1);
  });

  it("gives a reader who may not edit the read views and no Edit or Mark achieved", async () => {
    const probe = {} as Probe;
    const host = await mount(<GoalsHarness client={baseClient()} probe={probe} canEdit={false} />);
    expect(host.textContent).toContain("Carry the grandkids up the stairs");
    expect(host.textContent).toContain("“Wants to garden again”");
    expect(host.querySelectorAll('button[aria-label^="Edit"]')).toHaveLength(0);
    expect(buttonByText(host, "Mark achieved")).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ */
/* Focus                                                               */
/* ------------------------------------------------------------------ */

const day = (d: number) => new Date(2026, 7, d, 10);

function focus(over: Partial<ClientFocus>): ClientFocus {
  return {
    id: "f1",
    clientId: "c1",
    studioId: "s1",
    trainerId: "uid-jane",
    trainerName: "Jane Coach",
    trainerInitials: "JC",
    category: "Pace",
    intent: "No dumping at the ends",
    targetMachineId: null,
    status: "active",
    startedAt: day(1),
    reviewDueAt: null,
    passedAt: null,
    lastExtendedAt: null,
    extensionCount: 0,
    checkInCount: 0,
    lastCheckInAt: null,
    createdAt: day(1),
    updatedAt: day(1),
    ...over,
  };
}

const checkIn = (id: string, focusId: string): JournalEntry =>
  ({
    id,
    clientId: "c1",
    studioId: "s1",
    kind: "coaching",
    category: "Pace",
    body: `note ${id}`,
    importance: "standard",
    machineId: null,
    focusId,
    sessionId: null,
    origin: "manual",
    authorId: "uid-jane",
    authorInitials: "JC",
    authorName: "Jane Coach",
    occurredAt: day(3),
    createdAt: day(3),
    updatedAt: day(3),
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
  }) as JournalEntry;

describe("FocusBoard mounts", () => {
  const focuses = [
    focus({ id: "a" }),
    focus({ id: "b", trainerId: "uid-sam", trainerName: "Sam Kim", trainerInitials: "SK", category: "Path" }),
    focus({ id: "c", status: "passed", achievedAt: day(22), rewardNote: "Kaizen pin" }),
    focus({ id: "d", status: "retired", retiredAt: day(8), trainerId: "uid-sam", trainerName: "Sam Kim" }),
  ];
  const handlers = () => ({
    onCreate: vi.fn(async () => {}),
    onAchieve: vi.fn(async () => {}),
    onExtend: vi.fn(async () => {}),
    onRetire: vi.fn(async () => {}),
    onCheckIn: vi.fn(async () => true),
  });

  it("shows several active focuses, a Set-a-focus button, and the history", async () => {
    const h = handlers();
    const host = await mount(
      <FocusBoard
        focuses={focuses}
        entries={[checkIn("e1", "a"), checkIn("e2", "a"), checkIn("e3", "c")]}
        machines={[]}
        viewerIds={["uid-jane"]}
        {...h}
      />,
    );
    expect(host.querySelectorAll('[data-testid="active-focus"]')).toHaveLength(2);
    expect(buttonByText(host, "Set a focus")).toBeTruthy();
    const cards = host.querySelectorAll('[data-testid="active-focus"]');
    expect(cards[0].textContent).toContain("Set by Jane Coach (JC)");
    expect(cards[0].textContent).toContain("2 check-ins");
    // Someone else's focus: check in yes, close no.
    expect(cards[1].textContent).toContain("Check in");
    expect(cards[1].textContent).not.toContain("Achieved");
    expect(cards[1].textContent).toContain("Only Sam Kim");

    const history = host.querySelector('[data-testid="focus-history"]')!;
    expect(history.textContent).toContain("Focus history · 2");
    expect(history.textContent).toContain("Achieved");
    expect(history.textContent).toContain("Reward: Kaizen pin");
    expect(history.textContent).toContain("3 weeks");
    expect(history.textContent).toContain("Retired");
    // Two coaches in the history: the filter is offered, and it filters.
    await click(buttonByText(history as HTMLElement, "Sam Kim"));
    expect(history.querySelectorAll('[data-testid="past-focus"]')).toHaveLength(1);
  });

  it("files a check-in with the focus, from the card itself", async () => {
    const h = handlers();
    const host = await mount(
      <FocusBoard focuses={focuses} entries={[]} machines={[]} viewerIds={["uid-jane"]} {...h} />,
    );
    const card = host.querySelector('[data-testid="active-focus"]') as HTMLElement;
    await click(buttonByText(card, "Check in"));
    await typeInto(card.querySelector("textarea"), "Held the bottom today");
    await click(buttonByText(card, "Log check-in"));
    expect(h.onCheckIn).toHaveBeenCalledTimes(1);
    const [f, body] = h.onCheckIn.mock.calls[0] as unknown as [ClientFocus, string];
    expect(f.id).toBe("a");
    expect(body).toBe("Held the bottom today");
  });

  it("marks a focus achieved with a reward", async () => {
    const h = handlers();
    const host = await mount(
      <FocusBoard focuses={focuses} entries={[]} machines={[]} viewerIds={["uid-jane"]} {...h} />,
    );
    const card = host.querySelector('[data-testid="active-focus"]') as HTMLElement;
    await click(buttonByText(card, "Achieved"));
    await typeInto(card.querySelector("input"), "Kaizen pin");
    await click(buttonByText(card, "Mark achieved"));
    expect(h.onAchieve).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), "Kaizen pin");
  });

  it("heads the card with the focuses running, and folds the history behind its summary when asked", async () => {
    const h = handlers();
    const host = await mount(
      <FocusBoard
        focuses={focuses}
        entries={[]}
        machines={[]}
        viewerIds={["uid-jane"]}
        historyCollapsed
        anchor="goals-focus"
        {...h}
      />,
    );
    const board = host.querySelector<HTMLElement>('[data-testid="focus-board"]')!;
    expect(board.id).toBe("goals-focus");
    expect(board.hasAttribute("data-cx-anchor")).toBe(true);
    expect(board.textContent).toContain("Coach focuses · 2 running");

    const history = host.querySelector<HTMLElement>('[data-testid="focus-history"]')!;
    expect(history.tagName).toBe("DETAILS");
    expect((history as HTMLDetailsElement).open).toBe(false);
    expect(history.querySelector("summary")?.textContent).toContain(
      "Focus history · 2 — who set it, how long it ran, how it ended",
    );
    // Still one tap from every past focus, and the coach filter still filters.
    await click(buttonByText(history, "Sam Kim"));
    expect(history.querySelectorAll('[data-testid="past-focus"]')).toHaveLength(1);
  });

  it("puts a review date that is still ahead on the card's line", async () => {
    const h = handlers();
    const ahead = new Date(Date.now() + 10 * 86400000);
    const host = await mount(
      <FocusBoard
        focuses={[focus({ id: "r", reviewDueAt: ahead })]}
        entries={[]}
        machines={[]}
        viewerIds={["uid-jane"]}
        {...h}
      />,
    );
    const card = host.querySelector<HTMLElement>('[data-testid="active-focus"]')!;
    expect(card.textContent).toContain(`review ${ahead.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    expect(card.textContent).not.toContain("Review due");
  });
});
