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
 *   - every button is 40px or taller (the kit's, or the page's own rows);
 *   - IN ONE LINE (phase 11): written at clients/{id}/ford/one-line (the
 *     whole document the first time, archived; an update of the words
 *     after, never the studio), "Written by the team · last by …", never
 *     drawn for a reader FORD refuses, and not rewritable over a line that
 *     could not be read;
 *   - FOLLOW UP NEXT TIME (phase 11): the newest open question is Ask next,
 *     "Asked it" clears it (saving an answer as a new detail first), the
 *     dialog stamps a question only when it changed, and a question on a
 *     detail Ask next is not showing — or on an unfiled one — is still said;
 *   - WHO MAY ADD (phase 19): a reader who may change the record but whom the
 *     FORD create rule refuses (an administrator who works elsewhere) is told
 *     why adding isn't offered, gets no Add anywhere, and may still change
 *     what is on file — file a capture, rewrite a line that exists;
 *   - A DOOR THAT ASKS TO WRITE THE LINE (phase 19, the Overview's "Write
 *     one"): the editor opens with the cursor in it, once per request, only
 *     when there is no line and this reader may write one, and only once
 *     FORD has answered.
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
  /** When set, only updateDoc throws this (an add lands, the next update is refused). */
  failUpdate: null as null | { code: string },
  /**
   * When set, updateDoc waits on this before it answers — the gap in which
   * real Firestore has already applied the update to this iPad's cache.
   */
  holdUpdate: null as null | Promise<void>,
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
      if (fake.holdUpdate) await fake.holdUpdate;
      if (fake.fail) throw fake.fail;
      if (fake.failUpdate) throw fake.failUpdate;
      fake.writes.push({ op: "update", path: r.path, data });
    },
    setDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      if (fake.fail) throw fake.fail;
      fake.writes.push({ op: "set", path: r.path, data });
    },
    serverTimestamp: () => ({ __server: true }),
  };
});

import { FordPage, type FordPageProps } from "./FordPage";
import { ONE_LINE_BLOCKED, ONE_LINE_SAVED_MS } from "./OneLinePanel";
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

function fordOf(rows: FordEntry[], status: FordReadStatus = "ready", oneLine: FordEntry | null = null): UseClientFordResult {
  const { buckets, untagged } = groupByPillar(rows);
  return { entries: rows, buckets, untagged, upcoming: upcomingFord(rows), status, isLoading: status === "loading", oneLine };
}

/** The In one line document as useClientFord hands it out (phase 11). */
const lineDoc = (body: string): FordEntry =>
  detail({
    id: "one-line",
    kind: "one-line",
    pillar: null,
    isPinned: true,
    isArchived: true,
    body,
    occurredAt: new Date(2027, 2, 15, 9),
  });

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
  canAdd = true,
  writeLine = null,
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
      canAdd={canAdd}
      writeLine={writeLine}
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

let mounted: { root: Root; host: HTMLElement; client: Client }[] = [];

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
  mounted.push({ root, host, client });
  return host;
}

/**
 * Hand a mounted page new props, as a new snapshot would — same client
 * object, so the record form does not re-seed.
 */
async function rerender(host: HTMLElement, props: HarnessProps) {
  const m = mounted.find((x) => x.host === host)!;
  await act(async () => {
    m.root.render(
      <StrictMode>
        <Harness {...props} client={m.client} />
      </StrictMode>,
    );
  });
  await settle();
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
  fake.failUpdate = null;
  fake.holdUpdate = null;
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

  it("says where a detail's words came from when it was Mindbody's intake notes, not a trainer (phase 17)", async () => {
    const intake = detail({
      id: "mb",
      pillar: "recreation",
      isPinned: true,
      body: "Pickleball 2x/wk, gardening.",
      origin: "mindbody_intake",
      authorName: "AJ Jurgens",
    });
    const moment = detail({ id: "mb2", pillar: "recreation", body: "Tournament in May", origin: "mindbody_intake", authorName: "AJ Jurgens" });
    const heard = detail({ id: "t1", pillar: "recreation", isPinned: true, body: "Loves the Browns" });
    const host = await mount({ ford: fordOf([intake, moment, heard]) });
    const rec = card(host, "recreation");
    const facts = [...rec.querySelectorAll(".fordpg-fact")].map((f) => f.textContent);
    expect(facts).toContain("Pickleball 2x/wk, gardening. · from the Mindbody account notes, added by AJ Jurgens");
    // A fact a trainer heard is its words alone.
    expect(facts).toContain("Loves the Browns");
    // Leading a moment's meta line, it starts with a capital, not a clipped sentence.
    expect(rec.textContent).toContain("From the Mindbody account notes, added by AJ Jurgens · Jan 1");
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
    const asking = detail({ id: "q1", pillar: "dreams", followUp: "Did the Camino booking go through?", followUpBy: "Jess Moreno" });
    const host = await mount({
      ford: fordOf(
        [caught, detail({ id: "f1", isPinned: true }), detail({ id: "m1" }), detail({ id: "i1", opportunity: opp("idea") }), asking],
        "ready",
        lineDoc("Retired hygienist, pickleball regular"),
      ),
      older: { state: "ready", settled: settled(lifeNote({ id: "anniv" })) },
    });
    // The new fields' buttons are the kit's too.
    expect(buttonIn(host, "Asked it")).toBeTruthy();
    expect(host.querySelector('#ford-one-line [aria-label="Edit the line"]')).not.toBeNull();
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

/* ------------------------------------------------------------------ */
/* Phase 11 — In one line                                              */
/* ------------------------------------------------------------------ */

describe("In one line", () => {
  const panel = (host: HTMLElement) => host.querySelector<HTMLElement>("#ford-one-line");
  const input = (host: HTMLElement) => panel(host)!.querySelector("input") as HTMLInputElement;

  it("sits at the top, before Coming up, and says there is no line yet — with a way to write one", async () => {
    const host = await mount();
    const ids = [...host.querySelectorAll("[data-cx-anchor]")].map((el) => el.id);
    expect(ids.indexOf("ford-one-line")).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf("ford-one-line")).toBeLessThan(ids.indexOf("ford-coming-up"));
    expect(panel(host)!.textContent).toContain("No line yet. The one sentence a new trainer should read first.");
    expect(buttonIn(panel(host)!, "Write the line")).toBeTruthy();
  });

  it("writes the first line as the whole document at clients/c1/ford/one-line: archived, the studio, the Auth uid", async () => {
    const host = await mount();
    await click(buttonIn(panel(host)!, "Write the line"));
    expect(input(host).maxLength).toBe(120);
    await typeInto(input(host), "Retired hygienist, pickleball regular, walking the Camino in May");
    await click(buttonIn(panel(host)!, "Save"));
    const set = fake.writes.find((w) => w.op === "set")!;
    expect(set.path).toBe("clients/c1/ford/one-line");
    expect(set.data).toMatchObject({
      kind: "one-line",
      body: "Retired hygienist, pickleball regular, walking the Camino in May",
      isArchived: true,
      pillar: null,
      studioId: "s1",
      clientId: "c1",
      authorId: "uid-ann",
      authorName: "Ann Trainer",
    });
    expect(panel(host)!.querySelector('[role="status"]')?.textContent).toContain("Saved");
    expect(panel(host)!.querySelector("input")).toBeNull();
    // It is not a detail: no rollup refresh.
    expect(fake.writes.some((w) => w.path === "clients/c1")).toBe(false);
  });

  it("shows the line, who wrote it last and when — and a rewrite updates the words, never the studio", async () => {
    const host = await mount({ ford: fordOf([], "ready", lineDoc("Retired hygienist, pickleball regular")) });
    expect(panel(host)!.querySelector(".fordpg-line__text")?.textContent).toBe("Retired hygienist, pickleball regular");
    expect(panel(host)!.textContent).toContain("Written by the team · last by Jess Moreno, Mar 15");
    await click(panel(host)!.querySelector('[aria-label="Edit the line"]'));
    expect(input(host).value).toBe("Retired hygienist, pickleball regular");
    await typeInto(input(host), "Walking the Camino with Tom in May");
    await click(buttonIn(panel(host)!, "Save"));
    const update = fake.writes.find((w) => w.op === "update" && w.path === "clients/c1/ford/one-line")!;
    expect(update.data).toMatchObject({ body: "Walking the Camino with Tom in May", authorId: "uid-ann" });
    expect("studioId" in update.data).toBe(false);
    expect("clientId" in update.data).toBe(false);
    expect(fake.writes.some((w) => w.op === "set")).toBe(false);
  });

  it("clears the line when the box is emptied", async () => {
    const host = await mount({ ford: fordOf([], "ready", lineDoc("Old line")) });
    await click(panel(host)!.querySelector('[aria-label="Edit the line"]'));
    await typeInto(input(host), "");
    await click(buttonIn(panel(host)!, "Save"));
    expect(fake.writes.find((w) => w.path === "clients/c1/ford/one-line")?.data).toMatchObject({ body: "" });
  });

  it("labels the box once: the card says In one line, the field says what goes in it", async () => {
    const host = await mount();
    await click(buttonIn(panel(host)!, "Write the line"));
    expect(panel(host)!.querySelector("label")?.textContent).toBe("The sentence");
    expect(panel(host)!.textContent!.split("In one line").length - 1).toBe(1);
  });

  it("keeps the words when the save fails, and says so", async () => {
    fake.fail = { code: "unavailable" };
    const host = await mount();
    await click(buttonIn(panel(host)!, "Write the line"));
    await typeInto(input(host), "Retired hygienist");
    await click(buttonIn(panel(host)!, "Save"));
    expect(input(host).value).toBe("Retired hygienist");
    expect(panel(host)!.querySelector('[role="alert"]')?.textContent).toContain("Not saved — still here, try again");
  });

  it("says a line from an earlier studio may be in the way when a first line is refused — never 'try again'", async () => {
    // A client who moved home studio: the old line sits at the fixed id,
    // stamped with the old studio, so this studio sees "No line yet" and the
    // rules refuse every save. Retrying can never work; an administrator can
    // clear it.
    fake.fail = { code: "permission-denied" };
    const host = await mount();
    await click(buttonIn(panel(host)!, "Write the line"));
    await typeInto(input(host), "Retired hygienist");
    await click(buttonIn(panel(host)!, "Save"));
    expect(input(host).value).toBe("Retired hygienist");
    const alert = panel(host)!.querySelector('[role="alert"]')?.textContent ?? "";
    expect(alert).toBe(ONE_LINE_BLOCKED);
    expect(alert).toContain("earlier home studio");
    expect(alert).toContain("An administrator can clear it");
    expect(alert).not.toContain("try again");
  });

  it("says 'Saved' for a moment, and not under a line someone else wrote after it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ["setTimeout", "clearTimeout"] });
    try {
      const host = await mount();
      await click(buttonIn(panel(host)!, "Write the line"));
      await typeInto(input(host), "Retired hygienist");
      await click(buttonIn(panel(host)!, "Save"));
      expect(panel(host)!.querySelector('[role="status"]')?.textContent).toBe("Saved");
      await act(async () => {
        vi.advanceTimersByTime(ONE_LINE_SAVED_MS);
      });
      expect(panel(host)!.querySelector('[role="status"]')).toBeNull();

      // Save again, and another trainer's rewrite arrives while "Saved" is up.
      await click(buttonIn(panel(host)!, "Write the line"));
      await typeInto(input(host), "Retired hygienist, pickleball regular");
      await click(buttonIn(panel(host)!, "Save"));
      expect(panel(host)!.querySelector('[role="status"]')?.textContent).toBe("Saved");
      await rerender(host, { ford: fordOf([], "ready", lineDoc("Walking the Camino with Tom in May")) });
      expect(panel(host)!.querySelector(".fordpg-line__text")?.textContent).toBe("Walking the Camino with Tom in May");
      expect(panel(host)!.querySelector('[role="status"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Cancel writes nothing", async () => {
    const host = await mount({ ford: fordOf([], "ready", lineDoc("Old line")) });
    await click(panel(host)!.querySelector('[aria-label="Edit the line"]'));
    await typeInto(input(host), "Something else");
    await click(buttonIn(panel(host)!, "Cancel"));
    expect(fake.writes).toEqual([]);
    expect(panel(host)!.textContent).toContain("Old line");
  });

  it("is never 'no line yet' when FORD did not answer, and cannot be rewritten over a line nobody here has read", async () => {
    const loading = await mount({ status: "loading", ford: fordOf([], "loading") });
    expect(panel(loading)!.textContent).toContain("Loading…");
    expect(panel(loading)!.querySelector("button")).toBeNull();
    const failed = await mount({ status: "failed", ford: fordOf([], "failed") });
    expect(panel(failed)!.textContent).toContain("couldn't be read just now");
    expect(panel(failed)!.textContent).not.toContain("No line yet");
    expect(panel(failed)!.querySelector("button")).toBeNull();
  });

  it("is not drawn at all for a reader FORD refuses — the line is FORD text", async () => {
    const off = await mount({ status: "off", canEdit: false, ford: fordOf([], "ready", lineDoc("Retired hygienist")) });
    expect(panel(off)).toBeNull();
    expect(off.textContent).not.toContain("Retired hygienist");
    const denied = await mount({ status: "denied", ford: fordOf([], "denied") });
    expect(panel(denied)).toBeNull();
  });

  it("is read only for a reader who may not write FORD", async () => {
    const host = await mount({ canEdit: false, ford: fordOf([], "ready", lineDoc("Retired hygienist")) });
    expect(panel(host)!.textContent).toContain("Retired hygienist");
    expect(panel(host)!.querySelector("button")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Phase 19 — who may add, and a door that asks to write the line      */
/* ------------------------------------------------------------------ */

describe("a reader who may change FORD but not add to it (phase 19)", () => {
  // An administrator who works elsewhere: the record's update rule and the
  // FORD update rule let them in, the FORD create rule does not.
  const caught = detail({ id: "u1", pillar: null, origin: "in_session", body: "Her sister might visit from Arizona in April." });
  const kids = detail({ id: "f1", pillar: "family", body: "Two granddaughters, Ellie and Rose." });

  it("says why adding isn't offered, and offers no Add anywhere", async () => {
    const host = await mount({ canAdd: false, ford: fordOf([caught, kids]) });
    expect(host.querySelector('[data-testid="ford-add-not-offered"]')?.textContent).toBe(
      "Only a trainer at her home studio can add to FORD, so adding isn't offered here.",
    );
    expect(buttonIn(host, "Remember something")).toBeUndefined();
    expect(host.querySelector('[aria-label^="Add a "]')).toBeNull();
    expect(buttonIn(host.querySelector("#ford-one-line")!, "Write the line")).toBeUndefined();
    expect(buttonIn(host.querySelector("#ford-beyond")!, "Add an idea")).toBeUndefined();
    // The birthday nobody planned is a new detail: not offered.
    expect(host.querySelector('#ford-coming-up button[data-kind="birthday"]')).toBeNull();
    expect(host.querySelector("#ford-coming-up")!.textContent).toContain("Her 69th birthday");
  });

  it("still changes what is on file: files a capture, opens a detail", async () => {
    const host = await mount({ canAdd: false, ford: fordOf([caught, kids]) });
    await click(host.querySelector('[aria-label="File under Family"]'));
    expect(fake.writes.find((w) => w.op === "update" && w.path === "clients/c1/ford/u1")?.data).toMatchObject({ pillar: "family" });
    const kidsRow = Array.from(card(host, "family").querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Two granddaughters"),
    );
    await click(kidsRow);
    expect(dialog()).not.toBeNull();
  });

  it("rewrites a line that exists (an update), and writes no first line (a create)", async () => {
    const host = await mount({ canAdd: false, ford: fordOf([], "ready", lineDoc("Retired hygienist")) });
    const panel = host.querySelector<HTMLElement>("#ford-one-line")!;
    await click(panel.querySelector('[aria-label="Edit the line"]'));
    await typeInto(panel.querySelector("input"), "Retired hygienist, pickleball regular");
    await click(buttonIn(panel, "Save"));
    expect(fake.writes.find((w) => w.path === "clients/c1/ford/one-line")?.op).toBe("update");
  });

  it("says nothing of the kind to a trainer at her studio, or to a reader FORD refuses", async () => {
    const trainer = await mount();
    expect(trainer.querySelector('[data-testid="ford-add-not-offered"]')).toBeNull();
    expect(buttonIn(trainer, "Remember something")).toBeTruthy();
    const refused = await mount({ status: "off", canEdit: false, canAdd: false, ford: fordOf([]) });
    expect(refused.querySelector('[data-testid="ford-add-not-offered"]')).toBeNull();
  });
});

describe("a door that asks to write the line (phase 19)", () => {
  const panel = (host: HTMLElement) => host.querySelector<HTMLElement>("#ford-one-line")!;
  const input = (host: HTMLElement) => panel(host).querySelector("input");

  it("opens the editor with the cursor in it when there is no line yet", async () => {
    const host = await mount({ writeLine: { move: 1 } });
    expect(input(host)).not.toBeNull();
    expect(input(host)!.value).toBe("");
    expect(document.activeElement).toBe(input(host));
    expect(fake.writes).toHaveLength(0);
  });

  it("acts once per request: Cancel stays closed until a new door asks again", async () => {
    const first = { move: 1 };
    const host = await mount({ writeLine: first });
    await click(buttonIn(panel(host), "Cancel"));
    expect(input(host)).toBeNull();
    await rerender(host, { writeLine: first });
    expect(input(host)).toBeNull();
    await rerender(host, { writeLine: { move: 2 } });
    expect(input(host)).not.toBeNull();
  });

  it("never opens over a line — one written meanwhile is shown instead", async () => {
    const host = await mount({ writeLine: { move: 1 }, ford: fordOf([], "ready", lineDoc("Retired hygienist")) });
    expect(input(host)).toBeNull();
    expect(panel(host).textContent).toContain("Retired hygienist");
  });

  it("waits for FORD to answer, then opens", async () => {
    const move = { move: 1 };
    const host = await mount({ writeLine: move, status: "loading", ford: fordOf([], "loading") });
    expect(input(host)).toBeNull();
    await rerender(host, { writeLine: move, status: "ready", ford: fordOf([]) });
    expect(input(host)).not.toBeNull();
  });

  it("opens nothing for a reader who may not write the line, or when FORD could not be read", async () => {
    const admin = await mount({ canAdd: false, writeLine: { move: 1 } });
    expect(input(admin)).toBeNull();
    const failed = await mount({ writeLine: { move: 1 }, status: "failed", ford: fordOf([], "failed") });
    expect(input(failed)).toBeNull();
  });

  it("focuses nothing when no door asked", async () => {
    const host = await mount();
    expect(input(host)).toBeNull();
    expect(document.activeElement === document.body || document.activeElement === null).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Phase 11 — Follow up next time                                      */
/* ------------------------------------------------------------------ */

describe("Follow up next time", () => {
  const boots = detail({
    id: "boots",
    pillar: "recreation",
    subject: "Boots",
    body: "New hiking boots for the Camino",
    followUp: "How were the boots?",
    followUpAt: new Date(2027, 2, 15, 9),
    followUpBy: "Jess Moreno",
  });
  const ask = (host: HTMLElement, pillar = "recreation") => card(host, pillar).querySelector<HTMLElement>(".fordpg-ask")!;
  const followUpField = () =>
    dialog()!.querySelector('input[placeholder^="e.g. \\"How did the new boots"]') as HTMLInputElement;

  it("is Ask next, ahead of FORD's prompt, with who set it and when", async () => {
    const host = await mount({ ford: fordOf([boots]) });
    expect(ask(host).textContent).toContain("“How were the boots?”");
    expect(ask(host).textContent).toContain("Follow up from Jess Moreno, Mar 15");
    // The detail it came from does not say it twice.
    expect(card(host, "recreation").querySelector(".fordpg-item")?.textContent).not.toContain("follow up next time");
  });

  it("'Asked it', then 'Nothing new, clear it' nulls the question and nothing else", async () => {
    const host = await mount({ ford: fordOf([boots]) });
    await click(buttonIn(ask(host), "Asked it"));
    await click(buttonIn(ask(host), "Nothing new, clear it"));
    const update = fake.writes.find((w) => w.op === "update" && w.path === "clients/c1/ford/boots")!;
    expect(update.data).toMatchObject({ followUp: null, followUpAt: null, followUpBy: null });
    expect(Object.keys(update.data).sort()).toEqual(["followUp", "followUpAt", "followUpBy", "updatedAt"]);
    expect(fake.writes.some((w) => w.op === "add")).toBe(false);
  });

  it("'Save the answer' files the answer as a new detail under the pillar, then clears the question", async () => {
    const host = await mount({ ford: fordOf([boots]) });
    await click(buttonIn(ask(host), "Asked it"));
    expect((buttonIn(ask(host), "Save the answer") as HTMLButtonElement).disabled).toBe(true);
    await typeInto(ask(host).querySelector("textarea"), "Broke them in on the towpath. No blisters.");
    await click(buttonIn(ask(host), "Save the answer"));
    const add = fake.writes.find((w) => w.op === "add")!;
    expect(add.path).toBe("clients/c1/ford");
    expect(add.data).toMatchObject({
      pillar: "recreation",
      body: "Broke them in on the towpath. No blisters.",
      subject: "Boots",
      studioId: "s1",
      authorId: "uid-ann",
      followUp: null,
    });
    const clear = fake.writes.find((w) => w.op === "update" && w.path === "clients/c1/ford/boots")!;
    expect(clear.data).toMatchObject({ followUp: null, followUpAt: null, followUpBy: null });
    expect(fake.writes.indexOf(add)).toBeLessThan(fake.writes.indexOf(clear));
  });

  it("keeps the answer and the question when the answer is refused", async () => {
    fake.fail = { code: "permission-denied" };
    const host = await mount({ ford: fordOf([boots]) });
    await click(buttonIn(ask(host), "Asked it"));
    await typeInto(ask(host).querySelector("textarea"), "No blisters.");
    await click(buttonIn(ask(host), "Save the answer"));
    expect((ask(host).querySelector("textarea") as HTMLTextAreaElement).value).toBe("No blisters.");
    expect(ask(host).querySelector('[role="alert"]')?.textContent).toContain("Not saved — still here, try again");
    expect(fake.writes).toEqual([]);
  });

  it("says so when the answer saved but the question could not be cleared — and never files the answer twice", async () => {
    fake.failUpdate = { code: "unavailable" };
    const host = await mount({ ford: fordOf([boots]) });
    await click(buttonIn(ask(host), "Asked it"));
    await typeInto(ask(host).querySelector("textarea"), "No blisters.");
    await click(buttonIn(ask(host), "Save the answer"));
    expect(fake.writes.filter((w) => w.op === "add")).toHaveLength(1);
    expect(ask(host).querySelector('[role="alert"]')?.textContent).toContain("The answer is saved.");
    expect((buttonIn(ask(host), "Save the answer") as HTMLButtonElement).disabled).toBe(true);
    // The retry is the clear alone.
    fake.failUpdate = null;
    await click(buttonIn(ask(host), "Nothing new, clear it"));
    expect(fake.writes.filter((w) => w.op === "add")).toHaveLength(1);
    expect(fake.writes.find((w) => w.op === "update" && w.path === "clients/c1/ford/boots")?.data).toMatchObject({ followUp: null });
  });

  it("'Not yet' closes the panel and writes nothing", async () => {
    const host = await mount({ ford: fordOf([boots]) });
    await click(buttonIn(ask(host), "Asked it"));
    await click(buttonIn(ask(host), "Not yet"));
    expect(ask(host).querySelector("textarea")).toBeNull();
    expect(buttonIn(ask(host), "Asked it")).toBeTruthy();
    expect(fake.writes).toEqual([]);
  });

  it("shows the question, with no 'Asked it', to a reader who may not write FORD", async () => {
    const host = await mount({ canEdit: false, ford: fordOf([boots]) });
    expect(ask(host).textContent).toContain("“How were the boots?”");
    expect(buttonIn(ask(host), "Asked it")).toBeUndefined();
  });

  it("marks a second open question on the pillar, so it never waits unseen", async () => {
    const older = detail({
      id: "trip",
      pillar: "recreation",
      body: "Trip to the Smokies in April",
      followUp: "How was the Smokies trip?",
      followUpAt: new Date(2027, 1, 1, 9),
      followUpBy: "AJ Jurgens",
      occurredAt: new Date(2027, 1, 1, 9),
    });
    const fact = detail({
      id: "fact",
      pillar: "recreation",
      isPinned: true,
      body: "Plays pickleball",
      followUp: "Still Tuesdays?",
      followUpAt: new Date(2027, 0, 5),
    });
    const host = await mount({ ford: fordOf([boots, older, fact]) });
    expect(ask(host).textContent).toContain("“How were the boots?”");
    const items = [...card(host, "recreation").querySelectorAll(".fordpg-item")];
    const trip = items.find((i) => i.textContent?.includes("Smokies"))!;
    // The question itself, not only that there is one.
    expect(trip.textContent).toContain("follow up next time: “How was the Smokies trip?”");
    const newest = items.find((i) => i.textContent?.includes("hiking boots"))!;
    expect(newest.textContent).not.toContain("follow up next time");
    expect(card(host, "recreation").querySelector(".fordpg-fact")?.textContent).toBe(
      "Plays pickleball · follow up next time: “Still Tuesdays?”",
    );
  });

  it("shows a waiting question in full to a reader who can read FORD but cannot open the detail", async () => {
    const older = detail({
      id: "trip",
      pillar: "recreation",
      body: "Trip to the Smokies in April",
      followUp: "How was the Smokies trip?",
      followUpAt: new Date(2027, 1, 1, 9),
    });
    const host = await mount({ canEdit: false, ford: fordOf([boots, older]) });
    const trip = [...card(host, "recreation").querySelectorAll(".fordpg-item")].find((i) => i.textContent?.includes("Smokies"))!;
    expect(trip.tagName).not.toBe("BUTTON");
    expect(trip.textContent).toContain("“How was the Smokies trip?”");
  });

  it("holds the question it was opened on while the cache shows it cleared — and says so when the server refuses", async () => {
    // Real Firestore applies an update to this iPad's cache before the server
    // answers, so the one listener delivers the question as cleared the moment
    // "clear" is tapped, and Ask next moves on. The line must not follow it:
    // a remount would close the panel as if the clear had worked.
    const trip = detail({
      id: "trip",
      pillar: "recreation",
      body: "Trip to the Smokies in April",
      followUp: "How was the Smokies trip?",
      followUpAt: new Date(2027, 1, 1, 9),
      followUpBy: "AJ Jurgens",
    });
    const cleared = { ...boots, followUp: null, followUpAt: null, followUpBy: null };
    let refuse!: () => void;
    fake.holdUpdate = new Promise<void>((_, reject) => {
      refuse = () => reject({ code: "permission-denied" });
    });
    const host = await mount({ ford: fordOf([boots, trip]) });
    await click(buttonIn(ask(host), "Asked it"));
    await click(buttonIn(ask(host), "Nothing new, clear it"));

    // The cache already says cleared: Ask next is now the Smokies question.
    await rerender(host, { ford: fordOf([cleared, trip]) });
    expect(ask(host).textContent).toContain("“How were the boots?”");
    expect(ask(host).textContent).toContain("Follow up from Jess Moreno, Mar 15");
    expect(ask(host).querySelector("textarea")).not.toBeNull();

    // The server refuses; the question comes back.
    await act(async () => {
      refuse();
    });
    await settle();
    await rerender(host, { ford: fordOf([boots, trip]) });
    expect(ask(host).textContent).toContain("“How were the boots?”");
    expect(ask(host).querySelector('[role="alert"]')?.textContent).toContain("Not saved — still here, try again");

    // A retry clears the question it was opened on, not the one Ask next showed meanwhile.
    fake.holdUpdate = null;
    fake.writes.length = 0;
    await click(buttonIn(ask(host), "Nothing new, clear it"));
    expect(fake.writes.map((w) => w.path)).toEqual(["clients/c1/ford/boots"]);
    await rerender(host, { ford: fordOf([cleared, trip]) });
    expect(ask(host).textContent).toContain("“How was the Smokies trip?”");
    expect(ask(host).querySelector("textarea")).toBeNull();
  });

  it("shows the question on a capture that is not filed yet", async () => {
    const caught = detail({ id: "u1", pillar: null, body: "Sister visiting from Arizona", followUp: "Did her sister make it?" });
    const host = await mount({ ford: fordOf([caught]) });
    expect(host.querySelector(".fordpg-tray")?.textContent).toContain("Follow up next time: “Did her sister make it?”");
  });

  it("the dialog saves a new detail's question with who set it", async () => {
    const host = await mount();
    await click(host.querySelector('[aria-label="Add a Recreation detail"]'));
    const d = dialog()!;
    await typeInto(d.querySelector("textarea"), "New hiking boots for the Camino");
    expect(followUpField().maxLength).toBe(140);
    expect(d.textContent).toContain("Follow up next time (optional)");
    await typeInto(followUpField(), "How did the new boots do on the long walk?");
    await click(buttonIn(d, "Save it"));
    const add = fake.writes.find((w) => w.op === "add")!;
    expect(add.data).toMatchObject({ followUp: "How did the new boots do on the long walk?", followUpBy: "Ann Trainer" });
    expect(add.data.followUpAt).toBeTruthy();
  });

  it("the dialog leaves an unchanged question alone, and stamps a changed one", async () => {
    const host = await mount({ ford: fordOf([boots]) });
    await click(buttonIn(card(host, "recreation"), "New hiking boots for the Camino"));
    expect(followUpField().value).toBe("How were the boots?");
    await typeInto(dialog()!.querySelector("textarea"), "New hiking boots for the Camino, size 8");
    await click(buttonIn(dialog()!, "Save changes"));
    const first = fake.writes.find((w) => w.path === "clients/c1/ford/boots")!;
    expect(first.data.body).toBe("New hiking boots for the Camino, size 8");
    expect("followUp" in first.data || "followUpAt" in first.data || "followUpBy" in first.data).toBe(false);

    fake.writes.length = 0;
    await click(buttonIn(card(host, "recreation"), "New hiking boots for the Camino"));
    await typeInto(followUpField(), "Any blisters on the long walk?");
    await click(buttonIn(dialog()!, "Save changes"));
    const second = fake.writes.find((w) => w.path === "clients/c1/ford/boots")!;
    expect(second.data).toMatchObject({ followUp: "Any blisters on the long walk?", followUpBy: "Ann Trainer" });
    expect(second.data.followUpAt).toBeTruthy();
  });
});
