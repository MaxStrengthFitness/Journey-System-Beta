// @vitest-environment jsdom
/**
 * THE FORD PAGE, MOUNTED (client codex, phase 10).
 *
 * The page does its work during render — Coming up, the pillars, the Pulse
 * lines and Ask next are all worked out from props — so only a mount proves
 * it. It is handed the tab's one FORD stream and the journal's settled life
 * notes, and it must open no listener of its own. Writes are recorded, not
 * sent (a fake Firestore). Run with TZ=America/New_York.
 *
 * What it holds:
 *   - Coming up has the Mindbody birthday ("Her 69th birthday", "In 17 days ·
 *     Family · from Mindbody"); a birthday nobody planned for opens a new
 *     annual Family detail with the gesture open;
 *   - the To file tray's buttons carry their words, and one tap files;
 *   - a pillar shows three moments, then "Show all";
 *   - an older journal Anniversary note sits in Family, "From an older note";
 *   - a retired client is asked about retirement, never about work;
 *   - the Pulse's own statement text shows beside Recreation;
 *   - Edit on Occupation stages the record field, and says "Not saved yet";
 *   - a read that failed, was refused, or has no studio is never "Nothing on
 *     file yet" — the states the Life section's test used to hold — and a
 *     refused read offers no FORD add even to a trainer who may edit the
 *     record; while FORD loads or after it failed, the birthday card plans
 *     nothing (a Birthday detail may already exist unseen);
 *   - a save that fails keeps the dialog and the words; a new idea is unowned;
 *   - every button is 40px or taller (the kit's, or the page's own rows).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fake = vi.hoisted(() => ({
  listeners: [] as string[],
  writes: [] as { op: string; path: string; data: Record<string, unknown> }[],
  /** When set, addDoc and updateDoc throw this. */
  fail: null as null | { code: string },
  toasts: [] as { kind: string; message: string }[],
}));

vi.mock("../../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-ann" } }, functions: {} }));
vi.mock("../../../lib/firestore-errors", () => ({
  OperationType: { GET: "get", CREATE: "create", UPDATE: "update", DELETE: "delete", LIST: "list", WRITE: "write" },
  handleFirestoreError: vi.fn(),
}));
vi.mock("../../../contexts/ToastContext", () => {
  const push = (kind: string) => (message: string) => fake.toasts.push({ kind, message });
  const api = { success: push("success"), error: push("error"), info: push("info"), warning: push("warning"), toast: push("toast") };
  return { useToast: () => api, ToastProvider: ({ children }: { children: unknown }) => children };
});
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  const empty = { docs: [], size: 0, empty: true, exists: () => false, data: () => undefined };
  return {
    ...real,
    collection: ref,
    doc: ref,
    query: (target: { path: string }) => ({ path: target.path }),
    where: () => ({}),
    limit: () => ({}),
    onSnapshot: (q: { path: string }) => {
      fake.listeners.push(q.path);
      return () => {};
    },
    getDocs: async () => empty,
    getDoc: async () => ({ exists: () => true, data: () => ({ homeStudioId: "s1" }) }),
    addDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      if (fake.fail) throw fake.fail;
      fake.writes.push({ op: "add", path: r.path, data });
      return { id: "new-1" };
    },
    updateDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      if (fake.fail) throw fake.fail;
      fake.writes.push({ op: "update", path: r.path, data });
    },
    setDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      fake.writes.push({ op: "set", path: r.path, data });
    },
    serverTimestamp: () => ({ __server: true }),
  };
});

import { FordPage, type FordPageProps } from "./FordPage";
import { useRecordForm } from "../../client-codex/useRecordForm";
import { pronounsOf } from "../../client-codex/kit";
import { groupByPillar, upcomingFord } from "../ford-rollup";
import type { UseClientFordResult } from "../useClientFord";
import type { FordReadStatus } from "../read-status";
import type { FordEntry, FordOpportunity } from "../types";
import { assembleThreads } from "../../client-notes/threads";
import { notesOnRecord } from "../../client-notes/record-selectors";
import { historyFromDocs } from "../../subjective-report/assessment-history";
import { statementText } from "../pulse-links";
import type { Client } from "../../../types";
import type { JournalEntry } from "../../../types/journal";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const TODAY = "2027-03-16";

const baseClient = (over: Partial<Client> = {}): Client =>
  ({
    id: "c1",
    firstName: "Carol",
    lastName: "Brennan",
    gender: "Female",
    homeStudioId: "s1",
    mindbodyClientId: "100000123",
    dateOfBirth: "1958-04-02",
    emergencyContactName: "Tom",
    emergencyContactRelationship: "husband",
    globalNotes: "Keep up with my granddaughters, and walk the Camino with Tom.",
    occupation: "Dental hygienist",
    isActive: true,
    remainingSessions: 10,
    ...over,
  }) as Client;

const detail = (patch: Partial<FordEntry> & { id: string }): FordEntry =>
  ({
    clientId: "c1",
    studioId: "s1",
    pillar: "family",
    body: "A detail",
    subject: null,
    isPinned: false,
    eventDate: null,
    recurrence: "none",
    opportunity: null,
    occurredAt: new Date(2027, 0, 1, 12),
    createdAt: null,
    updatedAt: null,
    authorId: "uid-jess",
    authorName: "Jess Moreno",
    authorInitials: "JM",
    origin: "profile",
    sessionId: null,
    isArchived: false,
    ...patch,
  }) as FordEntry;

const opp = (status: FordOpportunity["status"], patch: Partial<FordOpportunity> = {}): FordOpportunity => ({
  idea: "A good-luck card before the recital",
  status,
  ownerTrainerId: null,
  ownerName: null,
  plannedFor: null,
  doneAt: null,
  outcome: null,
  ...patch,
});

function fordOf(rows: FordEntry[], status: FordReadStatus = "ready"): UseClientFordResult {
  const { buckets, untagged } = groupByPillar(rows);
  return { entries: rows, buckets, untagged, upcoming: upcomingFord(rows), status, isLoading: status === "loading" };
}

const lifeNote = (over: Partial<JournalEntry> & { id: string }): JournalEntry =>
  ({
    clientId: "c1",
    studioId: "s1",
    kind: "life",
    category: "Anniversary",
    body: "Anniversary is Oct 12. They're planning a trip for the 41st.",
    importance: "standard",
    machineId: null,
    focusId: null,
    threadId: null,
    sessionId: null,
    origin: "manual",
    authorId: "uid-jess",
    authorInitials: "JM",
    authorName: "Jess Moreno",
    occurredAt: new Date(2026, 8, 20, 12),
    createdAt: null,
    updatedAt: null,
    effectiveFrom: null,
    effectiveUntil: null,
    resolvedAt: null,
    isArchived: false,
    searchTags: [],
    ...over,
  }) as JournalEntry;

const settled = (...notes: JournalEntry[]) =>
  notesOnRecord(assembleThreads(notes), TODAY, { tz: "America/New_York", lifeOnFord: true }).lifeSettled;

const AUTHOR = { id: "uid-ann", initials: "AT", fullName: "Ann Trainer" };
const go = vi.fn();

interface HarnessProps extends Partial<Omit<FordPageProps, "form" | "pronouns">> {
  client?: Client;
}

function Harness({
  client = baseClient(),
  ford = fordOf([]),
  status = "ready",
  older = { state: "ready", settled: [] },
  pulse = { status: "ready", history: historyFromDocs([], 50) },
  canEdit = true,
  homeStudioName = "Westlake",
  author = AUTHOR,
  today = TODAY,
}: HarnessProps) {
  const form = useRecordForm({ client, canEdit, trainerId: "t-ann", homeStudioName });
  return (
    <FordPage
      client={client}
      ford={ford}
      status={status}
      older={older}
      pulse={pulse}
      form={form}
      canEdit={canEdit}
      homeStudioName={homeStudioName}
      author={author}
      pronouns={pronounsOf(client)}
      today={today}
      go={go}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */

let mounted: { root: Root; host: HTMLElement }[] = [];

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function mount(props: HarnessProps = {}) {
  // One client object for the whole mount: the record form re-seeds whenever
  // it is handed a new one (a new Firestore snapshot), as the profile does.
  const client = props.client ?? baseClient();
  const host = document.createElement("div");
  host.className = "cx";
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <Harness {...props} client={client} />
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return host;
}

const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("element not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
};

function typeInto(el: Element | null | undefined, value: string) {
  if (!el) throw new Error("field not found");
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  return act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const buttonIn = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === text) ??
  Array.from(root.querySelectorAll("button")).find((b) => (b.textContent ?? "").includes(text));
const card = (host: HTMLElement, pillar: string) => host.querySelector<HTMLElement>(`#ford-${pillar}`)!;
/** The dialog renders in a portal on document.body. */
const dialog = () => document.body.querySelector<HTMLElement>(".ford-capture");

beforeEach(() => {
  fake.listeners.length = 0;
  fake.writes.length = 0;
  fake.toasts.length = 0;
  fake.fail = null;
  go.mockClear();
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe("the FORD page — reads", () => {
  it("opens no listener of its own: FORD, the notes and the Pulse are the tab's", async () => {
    await mount({ ford: fordOf([detail({ id: "f1", isPinned: true, body: "Married to Tom" })]) });
    expect(fake.listeners).toEqual([]);
  });

  it("has the four pillars in order, with their anchors", async () => {
    const host = await mount();
    const ids = [...host.querySelectorAll("[data-cx-anchor]")].map((el) => el.id);
    expect(ids).toEqual(expect.arrayContaining(["ford-family", "ford-occupation", "ford-recreation", "ford-dreams", "ford-beyond"]));
    expect(ids.indexOf("ford-family")).toBeLessThan(ids.indexOf("ford-dreams"));
  });
});

describe("Coming up", () => {
  it("leads with the Mindbody birthday: her 69th, in 17 days", async () => {
    const host = await mount();
    const coming = host.querySelector("#ford-coming-up")!;
    expect(coming.textContent).toContain("Her 69th birthday");
    expect(coming.textContent).toContain("In 17 days · Family · from Mindbody");
    expect(coming.querySelector('.fordpg-when[data-urgency="soon"]')).not.toBeNull();
  });

  it("opens a new annual Family 'Birthday' with the gesture open for a birthday nobody planned", async () => {
    const host = await mount();
    await click(host.querySelector('#ford-coming-up button[data-kind="birthday"]'));
    const d = dialog()!;
    expect(d).not.toBeNull();
    expect((d.querySelector("textarea") as HTMLTextAreaElement).value).toBe("Birthday");
    expect(d.querySelector('.ford-letter--family[aria-pressed="true"]')).not.toBeNull();
    expect(buttonIn(d, "Comes round every year")?.getAttribute("aria-pressed")).toBe("true");
    await typeInto(d.querySelector('input[placeholder^="e.g. \\"Cover"]'), "Cake at the front desk");
    await click(buttonIn(d, "Save it"));
    const add = fake.writes.find((w) => w.op === "add")!;
    expect(add.path).toBe("clients/c1/ford");
    expect(add.data).toMatchObject({ pillar: "family", body: "Birthday", recurrence: "annual", studioId: "s1", authorId: "uid-ann" });
    // A new idea is nobody's until someone takes it.
    expect(add.data.opportunity).toMatchObject({ idea: "Cake at the front desk", status: "idea", ownerTrainerId: null, ownerName: null });
    expect(fake.toasts).toContainEqual({ kind: "success", message: "Saved to FORD." });
  });

  it("folds a FORD 'Birthday' on the same day into the birthday, with its gesture", async () => {
    const own = detail({
      id: "bday",
      body: "Birthday",
      subject: "Birthday",
      eventDate: new Date(2020, 3, 2),
      recurrence: "annual",
      opportunity: opp("planned", { idea: "Cake", ownerTrainerId: "uid-bob", ownerName: "Bob Trainer" }),
    });
    const host = await mount({ ford: fordOf([own]) });
    const cards = host.querySelectorAll("#ford-coming-up .fordpg-cu");
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain("Planned: Cake");
  });
});

describe("the To file tray", () => {
  const caught = detail({ id: "u1", pillar: null, origin: "in_session", body: "Her sister might visit from Arizona in April." });

  it("files a capture with a labelled button, and says where it was caught", async () => {
    const host = await mount({ ford: fordOf([caught]) });
    const tray = host.querySelector(".fordpg-tray")!;
    expect(tray.textContent).toContain("To file · 1");
    expect(tray.textContent).toContain("Caught mid-session by Jess Moreno, Jan 1");
    const family = tray.querySelector('[aria-label="File under Family"]')!;
    expect(family.textContent).toContain("Family");
    for (const label of ["Occupation", "Recreation", "Dreams"]) {
      expect(tray.querySelector(`[aria-label="File under ${label}"]`)?.textContent).toContain(label);
    }
    await click(family);
    const update = fake.writes.find((w) => w.op === "update" && w.path === "clients/c1/ford/u1")!;
    expect(update.data).toMatchObject({ pillar: "family" });
  });

  it("offers no filing to a reader who may not write FORD", async () => {
    const host = await mount({ ford: fordOf([caught]), canEdit: false });
    expect(host.querySelector('[aria-label="File under Family"]')).toBeNull();
  });
});

describe("a pillar", () => {
  it("shows three moments, then Show all, and every fact", async () => {
    const moments = [1, 2, 3, 4, 5].map((n) =>
      detail({ id: `m${n}`, body: `Moment ${n}`, occurredAt: new Date(2027, 1, n, 12) }),
    );
    const facts = [detail({ id: "f1", isPinned: true, body: "Married to Tom, 41 years this October" })];
    const host = await mount({ ford: fordOf([...moments, ...facts]) });
    const family = card(host, "family");
    expect(family.textContent).toContain("Married to Tom, 41 years this October");
    expect(family.textContent).toContain("Moment 5");
    expect(family.textContent).not.toContain("Moment 2");
    await click(buttonIn(family, "Show all 5"));
    expect(family.textContent).toContain("Moment 1");
    expect(buttonIn(family, "Show fewer")).toBeTruthy();
  });

  it("carries an older journal Anniversary note in Family, from an older note", async () => {
    const host = await mount({ older: { state: "ready", settled: settled(lifeNote({ id: "anniv" })) } });
    const family = card(host, "family");
    expect(family.textContent).toContain("Anniversary is Oct 12.");
    expect(family.textContent).toContain("From an older note · Jess Moreno · Sep 20, 2026");
    expect(family.textContent).not.toContain("Nothing on file yet");
  });

  it("puts an older note of no pillar under Older life notes", async () => {
    const host = await mount({ older: { state: "ready", settled: settled(lifeNote({ id: "m", category: "Milestone", body: "Retired in June." })) } });
    const older = [...host.querySelectorAll(".cx-card")].find((c) => c.textContent?.includes("Older life notes"))!;
    expect(older.textContent).toContain("Retired in June.");
  });

  it("asks a retired client about retirement, never about work, and says why", async () => {
    const host = await mount({ client: baseClient({ isRetired: true }) });
    const ask = card(host, "occupation").querySelector(".fordpg-ask")!;
    expect(ask.textContent).toContain("“How is retirement going?”");
    expect(ask.textContent).toContain("The work questions are skipped because she is retired");
  });

  it("quotes the Pulse's own statement beside Recreation, and says nothing is copied", async () => {
    const pulse = {
      status: "ready" as const,
      history: historyFromDocs(
        [
          {
            id: "r1",
            status: "Finalized",
            date: "2027-03-10",
            subjective: { scaleVersion: 2, answers: { lifestyleAlignment_2: { value: 10 } }, stressAnchors: [], overallStressLevel: null },
          },
        ],
        50,
      ),
    };
    const host = await mount({ pulse });
    const rec = card(host, "recreation");
    expect(rec.querySelector(".fordpg-pulse")?.textContent).toBe(
      `Pulse, “${statementText("lifestyleAlignment_2")}” Nearly always on Mar 10.`,
    );
    expect(host.textContent).toContain("Nothing is copied between FORD and the Pulse.");
  });

  it("stages Occupation on the Save bar: Edit, pick, 'Not saved yet' — and Done does not save", async () => {
    const host = await mount();
    const occ = card(host, "occupation");
    expect(occ.textContent).toContain("Work · from her record");
    await click(occ.querySelector('[aria-label="Edit Occupation"]'));
    await click(buttonIn(occ, "Seated / desk"));
    expect(occ.textContent).toContain("Not saved yet");
    await click(occ.querySelector('[aria-label="Done editing Occupation"]'));
    expect(occ.textContent).toContain("Seated / desk (Dental hygienist)");
    expect(occ.textContent).toContain("Not saved yet");
    expect(fake.writes).toEqual([]);
  });

  it("gives a reader who may not edit no Edit, no Add and no Remember something", async () => {
    const host = await mount({ canEdit: false, status: "off" });
    expect(host.querySelector('[aria-label="Edit Occupation"]')).toBeNull();
    expect(host.querySelector('[aria-label="Add a Family detail"]')).toBeNull();
    expect(buttonIn(host, "Remember something")).toBeUndefined();
  });

  it("shows the Dreams band's why, and a door to Goals & Focus", async () => {
    const host = await mount();
    const dreams = card(host, "dreams");
    expect(dreams.textContent).toContain("“Keep up with my granddaughters, and walk the Camino with Tom.”");
    await click(buttonIn(dreams, "Goals & Focus"));
    expect(go).toHaveBeenCalledWith("goals", "goals-why");
  });
});

describe("a read that did not come back is never 'nothing on file'", () => {
  it("says 'Nothing on file yet.' only once FORD and the older notes have answered", async () => {
    const ready = await mount();
    expect(ready.querySelectorAll(".fordpg-gap")).toHaveLength(4);
    const loading = await mount({ status: "loading", ford: fordOf([], "loading") });
    expect(loading.textContent).toContain("Loading…");
    expect(loading.querySelector(".fordpg-gap")).toBeNull();
    const notesLoading = await mount({ older: { state: "loading", settled: [] } });
    expect(notesLoading.querySelector(".fordpg-gap")).toBeNull();
  });

  it("says it couldn't be read when the read failed — and still lets a trainer add", async () => {
    const host = await mount({ status: "failed", ford: fordOf([], "failed") });
    expect(host.querySelector('[data-testid="ford-read-notice"]')?.textContent).toContain("isn't the same as nothing on file");
    expect(host.querySelector(".fordpg-gap")).toBeNull();
    expect(host.textContent).not.toContain("No ideas yet");
    expect((buttonIn(host, "Remember something") as HTMLButtonElement).disabled).toBe(false);
  });

  it("says FORD is the home studio's to a reader it refuses, with no FORD text and no add", async () => {
    const host = await mount({ status: "off", canEdit: false, ford: fordOf([]) });
    expect(host.querySelector('[data-testid="ford-read-notice"]')?.textContent).toContain("FORD is kept by Westlake");
    expect(host.querySelector(".fordpg-gap")).toBeNull();
    expect(host.querySelector("#ford-beyond")).toBeNull();
    // The birthday is the client record's, which every reader of the tab can see.
    expect(host.querySelector("#ford-coming-up")?.textContent).toContain("Her 69th birthday");
  });

  it("says a client with no studio has none, and offers no add the rules would refuse", async () => {
    const homeless = baseClient({ homeStudioId: undefined });
    const host = await mount({ client: homeless, status: "failed", ford: fordOf([], "failed") });
    expect(host.querySelector('[data-testid="ford-read-notice"]')?.textContent).toContain("no home studio on file");
    expect((buttonIn(host, "Remember something") as HTMLButtonElement).disabled).toBe(true);
    expect(host.querySelector('[aria-label="Add a Family detail"]')).toBeNull();
  });

  it("gives a trainer who may edit the record, but whose FORD read was refused, no FORD add", async () => {
    const host = await mount({ status: "denied", canEdit: true, ford: fordOf([], "denied") });
    expect(host.querySelector('[data-testid="ford-read-notice"]')?.textContent).toContain("FORD is kept by Westlake");
    expect((buttonIn(host, "Remember something") as HTMLButtonElement).disabled).toBe(true);
    expect(host.querySelector('[aria-label="Add a Family detail"]')).toBeNull();
    expect(host.querySelector("#ford-beyond")).toBeNull();
    expect(host.querySelector(".fordpg-gap")).toBeNull();
    expect(host.querySelector("#ford-coming-up button")).toBeNull();
    // The record's own bands are not FORD's: Edit stays.
    expect(host.querySelector('[aria-label="Edit Occupation"]')).not.toBeNull();
  });

  it("offers no birthday plan while FORD loads or after it failed: a Birthday detail may exist unseen", async () => {
    for (const status of ["loading", "failed"] as const) {
      const host = await mount({ status, ford: fordOf([], status) });
      const coming = host.querySelector("#ford-coming-up")!;
      expect(coming.textContent).toContain("Her 69th birthday");
      expect(coming.querySelector('button[data-kind="birthday"]')).toBeNull();
      expect(coming.querySelector('div[data-kind="birthday"]')).not.toBeNull();
    }
    expect(dialog()).toBeNull();
    expect(fake.writes).toEqual([]);
  });

  it("says when the older notes could not be loaded", async () => {
    const host = await mount({ older: { state: "failed", settled: [] } });
    expect(host.textContent).toContain("Older life notes couldn't be loaded");
  });
});

describe("the detail dialog", () => {
  it("saves a new detail stamped with the client's studio and the Auth uid", async () => {
    const host = await mount();
    await click(buttonIn(host, "Remember something"));
    const d = dialog()!;
    await typeInto(d.querySelector("textarea"), "Grandson graduates in May");
    await click(buttonIn(d, "Save it"));
    const add = fake.writes.find((w) => w.op === "add")!;
    expect(add.data).toMatchObject({ studioId: "s1", authorId: "uid-ann", pillar: null, origin: "profile", body: "Grandson graduates in May" });
    expect(dialog()).toBeNull();
  });

  it("stays open with every word when the save is refused", async () => {
    fake.fail = { code: "permission-denied" };
    const host = await mount();
    await click(host.querySelector('[aria-label="Add a Dreams detail"]'));
    const d = dialog()!;
    await typeInto(d.querySelector("textarea"), "The Camino with Tom in May");
    await click(buttonIn(d, "Save it"));
    expect(dialog()).not.toBeNull();
    expect((dialog()!.querySelector("textarea") as HTMLTextAreaElement).value).toBe("The Camino with Tom in May");
    expect(dialog()!.querySelector('[role="alert"]')?.textContent).toContain("Not saved — still here, try again");
    expect(fake.toasts.filter((t) => t.kind === "success")).toEqual([]);
  });

  it("keeps an existing owner on an edit, and makes nobody the owner of an idea", async () => {
    const owned = detail({
      id: "g1",
      pillar: "dreams",
      body: "The Camino",
      opportunity: opp("planned", { idea: "A send-off", ownerTrainerId: "uid-bob", ownerName: "Bob Trainer" }),
    });
    const host = await mount({ ford: fordOf([owned]) });
    await click(buttonIn(card(host, "dreams"), "The Camino"));
    await click(buttonIn(dialog()!, "Save changes"));
    const update = fake.writes.find((w) => w.op === "update" && w.path === "clients/c1/ford/g1")!;
    expect(update.data.opportunity).toMatchObject({ ownerTrainerId: "uid-bob", ownerName: "Bob Trainer", status: "planned" });
  });
});

describe("going above and beyond", () => {
  const idea = detail({ id: "g-idea", body: "Ellie's recital", eventDate: new Date(2027, 3, 18), opportunity: opp("idea") });
  const planned = detail({
    id: "g-plan",
    pillar: "dreams",
    body: "The Camino",
    opportunity: opp("planned", { idea: "A Buen Camino send-off", ownerTrainerId: "uid-aj", ownerName: "AJ Jurgens", plannedFor: new Date(2027, 4, 10) }),
  });

  it("lists open gestures with who is on each, in full", async () => {
    const host = await mount({ ford: fordOf([idea, planned]) });
    const beyond = host.querySelector("#ford-beyond")!;
    expect(beyond.textContent).toContain("A good-luck card before the recital");
    expect(beyond.textContent).toContain("AJ Jurgens · for May 10");
    expect(beyond.textContent).toContain("Operations → Delight queue");
  });

  it("I'll do it makes the signed-in person the owner, by Auth uid", async () => {
    const host = await mount({ ford: fordOf([idea]) });
    await click(buttonIn(host.querySelector("#ford-beyond")!, "I'll do it"));
    const update = fake.writes.find((w) => w.path === "clients/c1/ford/g-idea")!;
    expect(update.data.opportunity).toMatchObject({ status: "planned", ownerTrainerId: "uid-ann", ownerName: "Ann Trainer" });
  });

  it("Mark done asks what happened and keeps the owner", async () => {
    const host = await mount({ ford: fordOf([planned]) });
    const beyond = host.querySelector("#ford-beyond")!;
    await click(buttonIn(beyond, "Mark done"));
    await typeInto(beyond.querySelector('input[placeholder^="What actually happened"]'), "She cried at the door.");
    await click(buttonIn(beyond, "Done"));
    const update = fake.writes.find((w) => w.path === "clients/c1/ford/g-plan")!;
    expect(update.data.opportunity).toMatchObject({ status: "done", outcome: "She cried at the door.", ownerTrainerId: "uid-aj" });
  });

  it("says there are no ideas yet only once FORD answered", async () => {
    const host = await mount();
    expect(host.querySelector("#ford-beyond")?.textContent).toContain("No ideas yet.");
  });
});

describe("the page's controls", () => {
  it("are all 40px or taller: the kit's buttons, or the page's own row buttons", async () => {
    const caught = detail({ id: "u1", pillar: null, body: "Caught" });
    const host = await mount({
      ford: fordOf([caught, detail({ id: "f1", isPinned: true }), detail({ id: "m1" }), detail({ id: "i1", opportunity: opp("idea") })]),
      older: { state: "ready", settled: settled(lifeNote({ id: "anniv" })) },
    });
    const allowed = ["cx-btn", "cx-pick", "cx-next", "fordpg-cu", "fordpg-fact", "fordpg-item", "fordpg-tray__quote", "fordpg-by__text"];
    const buttons = [...host.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThan(10);
    for (const b of buttons) {
      expect(allowed.some((c) => b.classList.contains(c)), `${b.className} · ${b.textContent}`).toBe(true);
    }
  });

  it("clips nothing and uses no palette class", async () => {
    const host = await mount({ ford: fordOf([detail({ id: "f1", isPinned: true })]) });
    const classes = [...host.querySelectorAll("[class]")].map((el) => el.getAttribute("class") ?? "").join(" ");
    expect(classes).not.toMatch(/\btruncate\b|line-clamp|text-ellipsis/);
    expect(classes).not.toMatch(/\b(?:text|bg|border)-(?:slate|red|orange|amber|sky|emerald)-\d{2,3}\b/);
  });
});
