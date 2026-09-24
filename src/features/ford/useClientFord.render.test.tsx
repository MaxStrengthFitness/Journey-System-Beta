// @vitest-environment jsdom
/**
 * FORD READS THAT WORK FOR EVERY TRAINER (client codex, phase 1).
 *
 * Until this round `useClientFord` listed `clients/{id}/ford` with no studio
 * filter. The read rule tests `resource.data.studioId`, so Firestore refused
 * that list for every role below franchise owner — and the hook turned the
 * refusal into an empty list, so every trainer saw "Nothing here yet" about
 * clients with plenty on file. Only AJ (an administrator) could see FORD.
 *
 * These mount the hook and its four callers against a fake Firestore that
 * records every query's constraints and lets each test answer, refuse or
 * fail a listener by hand:
 *   - the query names the client's studio, is capped, and has NO orderBy
 *     (an orderBy would need a composite index nobody has deployed);
 *   - a refused read is `denied`, a failed one `failed`, and neither is ever
 *     `ready` with an empty list;
 *   - the rollup refresh on save reads through the same filter;
 *   - the Life section, the briefing cue, the Active Session sheet and the
 *     post-session sweep say "couldn't load" / "kept by the home studio"
 *     instead of their empty state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Constraint = { type: string; field?: string; op?: string; value?: unknown; n?: number };
type Listener = {
  path: string;
  constraints: Constraint[];
  next: (snap: unknown) => void;
  error?: (err: unknown) => void;
  live: boolean;
};

const fake = vi.hoisted(() => ({
  listeners: [] as Listener[],
  reads: [] as { path: string; constraints: Constraint[] }[],
  docReads: [] as string[],
  writes: [] as { path: string; data: Record<string, unknown> }[],
  /** What getDoc(clients/{id}) answers during a rollup refresh. */
  clientDoc: { homeStudioId: "s1" } as Record<string, unknown> | null,
}));

vi.mock("../../firebase", () => ({
  db: { __fake: true },
  auth: { currentUser: { uid: "uid-ann" } },
  functions: {},
}));
vi.mock("../../lib/firestore-errors", () => ({
  OperationType: { GET: "get", CREATE: "create", UPDATE: "update", DELETE: "delete", LIST: "list", WRITE: "write" },
  handleFirestoreError: vi.fn(),
}));
// The Pulse tab of the Active Session sheet has its own render test.
vi.mock("../subjective-report", async (importOriginal) => {
  const real = await importOriginal<typeof import("../subjective-report")>();
  return { ...real, PulseQuickLog: () => <div data-testid="pulse-stub" /> };
});

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const ref = (_db: unknown, ...parts: unknown[]) => ({
    path: parts.filter((p) => typeof p === "string").join("/"),
  });
  const snap = (rows: Array<Record<string, unknown>>) => ({
    docs: rows.map((r) => ({ id: String(r.id), data: () => r })),
    size: rows.length,
    empty: rows.length === 0,
  });
  return {
    ...real,
    collection: ref,
    doc: ref,
    collectionGroup: (_db: unknown, id: string) => ({ path: id }),
    query: (target: { path: string }, ...constraints: Constraint[]) => ({ path: target.path, constraints }),
    where: (field: string, op: string, value: unknown) => ({ type: "where", field, op, value }),
    orderBy: (field: string) => ({ type: "orderBy", field }),
    limit: (n: number) => ({ type: "limit", n }),
    onSnapshot: (q: { path: string; constraints?: Constraint[] }, next: (s: unknown) => void, error?: (e: unknown) => void) => {
      const l: Listener = { path: q.path, constraints: q.constraints ?? [], next, error, live: true };
      fake.listeners.push(l);
      return () => {
        l.live = false;
      };
    },
    getDocs: async (q: { path: string; constraints?: Constraint[] }) => {
      fake.reads.push({ path: q.path, constraints: q.constraints ?? [] });
      return snap([]);
    },
    getDoc: async (r: { path: string }) => {
      fake.docReads.push(r.path);
      const data = fake.clientDoc;
      return { exists: () => data !== null, data: () => data ?? undefined };
    },
    addDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      fake.writes.push({ path: r.path, data });
      return { id: `new-${fake.writes.length}` };
    },
    updateDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      fake.writes.push({ path: r.path, data });
    },
    setDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      fake.writes.push({ path: r.path, data });
    },
    deleteDoc: async () => {},
    serverTimestamp: () => ({ __server: true }),
  };
});

import { useClientFord, type UseClientFordResult } from "./useClientFord";
import { createFordEntry, updateFordEntry } from "./ford-write";
import { groupByPillar } from "./ford-rollup";
import { FordSection } from "./FordSection";
import { FordBriefingCue } from "./FordBriefingCue";
import { FordSweep } from "./FordSweep";
import { SessionJournalSidebar } from "../../components/journal/SessionJournalSidebar";
import { ToastProvider } from "../../contexts/ToastContext";
import type { Client, WorkoutSession } from "../../types";

const client = { id: "c1", homeStudioId: "s1", firstName: "Judy", lastName: "Client" } as Client;
const author = { id: "uid-ann", initials: "AT", fullName: "Ann T" };

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <ToastProvider>{ui}</ToastProvider>
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return { host, root };
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("element not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
};

function typeInto(el: Element | null | undefined, value: string) {
  if (!el) throw new Error("field not found");
  return act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const buttonByText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

/** The one live listener on a client's FORD. StrictMode opens and closes one first. */
const fordListener = (clientId = "c1") => {
  const live = fake.listeners.filter((l) => l.live && l.path === `clients/${clientId}/ford`);
  expect(live).toHaveLength(1);
  return live[0];
};

const answer = (l: Listener, rows: Array<Record<string, unknown>>) =>
  act(async () => {
    l.next({ docs: rows.map((r) => ({ id: String(r.id), data: () => r })), size: rows.length, empty: rows.length === 0 });
  });

const refuse = (l: Listener, code: string) =>
  act(async () => {
    l.error?.({ code, message: code });
  });

const detail = (patch: Record<string, unknown>) => ({
  clientId: "c1",
  studioId: "s1",
  pillar: "family",
  body: "Wife is Karen.",
  subject: null,
  isPinned: true,
  eventDate: null,
  recurrence: "none",
  opportunity: null,
  occurredAt: new Date(2026, 8, 1, 12),
  authorId: "uid-bob",
  authorName: "Bob T",
  authorInitials: "BT",
  origin: "profile",
  sessionId: null,
  isArchived: false,
  ...patch,
});

let last: UseClientFordResult | null = null;
function Probe(props: { clientId: string | null; client: Client | null; enabled?: boolean }) {
  last = useClientFord(props);
  return null;
}

beforeEach(() => {
  fake.listeners.length = 0;
  fake.reads.length = 0;
  fake.docReads.length = 0;
  fake.writes.length = 0;
  fake.clientDoc = { homeStudioId: "s1" };
  last = null;
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

describe("useClientFord reads what the rules allow", () => {
  it("lists the client's FORD filtered to the client's home studio, capped, with no orderBy", async () => {
    await mount(<Probe clientId="c1" client={client} />);
    const l = fordListener();
    expect(l.constraints).toContainEqual({ type: "where", field: "studioId", op: "==", value: "s1" });
    expect(l.constraints).toContainEqual({ type: "limit", n: 500 });
    // An orderBy beside the equality needs a composite index; there is none.
    expect(l.constraints.some((c) => c.type === "orderBy")).toBe(false);
    expect(l.constraints).toHaveLength(2);
    // Nothing answered yet: loading, never ready.
    expect(last!.status).toBe("loading");
    expect(last!.isLoading).toBe(true);
  });

  it("falls back to the older studioId when the client has no home studio", async () => {
    await mount(<Probe clientId="c1" client={{ id: "c1", studioId: "solon" } as unknown as Client} />);
    expect(fordListener().constraints).toContainEqual({ type: "where", field: "studioId", op: "==", value: "solon" });
  });

  it("sorts newest first on the client, and only an answer makes it ready", async () => {
    await mount(<Probe clientId="c1" client={client} />);
    await answer(fordListener(), [
      detail({ id: "old", isPinned: false, body: "Old news", occurredAt: new Date(2026, 5, 1, 12) }),
      detail({ id: "new", isPinned: false, body: "New news", occurredAt: new Date(2026, 8, 20, 12) }),
      detail({ id: "mid", isPinned: false, body: "Middle", occurredAt: new Date(2026, 7, 1, 12) }),
    ]);
    expect(last!.status).toBe("ready");
    expect(last!.isLoading).toBe(false);
    expect(last!.entries.map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  it("reads the rules saying no as denied — never as ready with nothing on file", async () => {
    await mount(<Probe clientId="c1" client={client} />);
    await refuse(fordListener(), "permission-denied");
    expect(last!.status).toBe("denied");
    expect(last!.status).not.toBe("ready");
    expect(last!.isLoading).toBe(false);
    expect(last!.entries).toEqual([]);
  });

  it("reads any other failure as failed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount(<Probe clientId="c1" client={client} />);
    await refuse(fordListener(), "unavailable");
    expect(last!.status).toBe("failed");
    expect(last!.status).not.toBe("ready");
    warn.mockRestore();
  });

  it("queries nothing until the client is known, and a client with no studio is failed, not empty", async () => {
    const { root } = await mount(<Probe clientId="c1" client={null} />);
    expect(fake.listeners).toHaveLength(0);
    expect(last!.status).toBe("loading");

    await act(async () => {
      root.render(
        <StrictMode>
          <Probe clientId="c1" client={{ id: "c1" } as Client} />
        </StrictMode>,
      );
    });
    expect(fake.listeners).toHaveLength(0);
    expect(last!.status).toBe("failed");
  });

  it("does not read while disabled", async () => {
    await mount(<Probe clientId="c1" client={client} enabled={false} />);
    expect(fake.listeners).toHaveLength(0);
    expect(last!.status).toBe("loading");
  });

  it("never lets the last client's answer stand for the next client's", async () => {
    const { root } = await mount(<Probe clientId="c1" client={client} />);
    await answer(fordListener(), [detail({ id: "k" })]);
    expect(last!.status).toBe("ready");

    const other = { id: "c2", homeStudioId: "s2", firstName: "Ruth" } as Client;
    await act(async () => {
      root.render(
        <StrictMode>
          <Probe clientId="c2" client={other} />
        </StrictMode>,
      );
    });
    expect(last!.status).toBe("loading");
    expect(last!.entries).toEqual([]);
    expect(fordListener("c2").constraints).toContainEqual({ type: "where", field: "studioId", op: "==", value: "s2" });
    // The first client's listener is closed.
    expect(fake.listeners.filter((l) => l.live && l.path === "clients/c1/ford")).toHaveLength(0);
  });
});

describe("the rollup refresh reads through the same filter", () => {
  it("a new detail refreshes clients/{id}.fordSummary from the studio it was stamped with", async () => {
    const id = await createFordEntry("c1", "s1", author, { pillar: "family", body: "Grandson graduates in May" });
    expect(id).toBeTruthy();
    await settle();
    expect(fake.writes[0]).toMatchObject({ path: "clients/c1/ford", data: { studioId: "s1", authorId: "uid-ann" } });
    expect(fake.reads).toHaveLength(1);
    expect(fake.reads[0].path).toBe("clients/c1/ford");
    expect(fake.reads[0].constraints).toContainEqual({ type: "where", field: "studioId", op: "==", value: "s1" });
    // It knew the studio, so it did not read the client for it.
    expect(fake.docReads).toEqual([]);
    expect(fake.writes.some((w) => w.path === "clients/c1" && "fordSummary" in w.data)).toBe(true);
  });

  it("an edit reads the client's studio first, then refreshes through that filter", async () => {
    fake.clientDoc = { homeStudioId: "westlake" };
    expect(await updateFordEntry("c1", "f1", { isPinned: true })).toBe(true);
    await settle();
    expect(fake.docReads).toEqual(["clients/c1"]);
    expect(fake.reads[0].constraints).toContainEqual({ type: "where", field: "studioId", op: "==", value: "westlake" });
  });

  it("leaves the cache alone when the client names no studio", async () => {
    fake.clientDoc = {};
    expect(await updateFordEntry("c1", "f1", { isPinned: true })).toBe(true);
    await settle();
    expect(fake.reads).toHaveLength(0);
    expect(fake.writes.filter((w) => w.path === "clients/c1")).toHaveLength(0);
  });
});

describe("the Life section never says 'nothing here' about a read that did not come back", () => {
  it("says FORD is the home studio's when a visitor is refused, and offers no add", async () => {
    const { host } = await mount(<FordSection client={client} author={author} />);
    await refuse(fordListener(), "permission-denied");
    const notice = host.querySelector('[data-testid="ford-read-notice"]')!;
    expect(notice.textContent).toContain("kept by the client's home studio");
    expect(host.textContent).not.toContain("Nothing here yet");
    expect(host.textContent).not.toContain("Nothing on Judy yet");
    expect((buttonByText(host, "Add a detail") as HTMLButtonElement).disabled).toBe(true);
  });

  it("says it couldn't be read when the read failed, and still lets a detail be added", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { host } = await mount(<FordSection client={client} author={author} />);
    await refuse(fordListener(), "unavailable");
    expect(host.querySelector('[data-testid="ford-read-notice"]')!.textContent).toContain(
      "isn't the same as nothing on file",
    );
    expect(host.textContent).not.toContain("Nothing here yet");
    expect((buttonByText(host, "Add a detail") as HTMLButtonElement).disabled).toBe(false);
    warn.mockRestore();
  });

  it("says a client with no studio has none on file — no retry that cannot help, and no add the rules would refuse", async () => {
    const homeless = { id: "c9", firstName: "Nora", lastName: "Client" } as Client;
    const { host } = await mount(<FordSection client={homeless} author={author} />);
    // Nothing to read by, so nothing was queried.
    expect(fake.listeners.filter((l) => l.path === "clients/c9/ford")).toHaveLength(0);
    const notice = host.querySelector('[data-testid="ford-read-notice"]')!;
    expect(notice.textContent).toContain("no home studio on file");
    expect(notice.textContent).not.toMatch(/retry|again/i);
    expect(host.textContent).not.toContain("Nothing here yet");
    expect(host.textContent).toContain("No home studio on file.");
    expect((buttonByText(host, "Add a detail") as HTMLButtonElement).disabled).toBe(true);
  });

  it("says 'Loading…' while waiting and 'Nothing here yet' only once FORD answered empty", async () => {
    const { host } = await mount(<FordSection client={client} author={author} />);
    expect(host.textContent).toContain("Loading…");
    expect(host.textContent).not.toContain("Nothing here yet");
    await answer(fordListener(), []);
    expect(host.textContent).toContain("Nothing here yet");
    expect(host.textContent).toContain("Nothing on Judy yet");
    expect(host.querySelector('[data-testid="ford-read-notice"]')).toBeNull();
  });

  it("shows the details a trainer's filtered read brings back", async () => {
    const { host } = await mount(<FordSection client={client} author={author} />);
    await answer(fordListener(), [detail({ id: "k", body: "Wife is Karen." })]);
    expect(host.textContent).toContain("Wife is Karen.");
  });
});

/*
 * CLIENT CODEX: the Notes & Profile tab reads FORD ONCE and hands the same
 * stream to every page. Given one, the Life section opens no listener.
 */
describe("the Life section given the tab's FORD stream", () => {
  function Tab() {
    const ford = useClientFord({ clientId: "c1", client });
    return <FordSection client={client} author={author} ford={ford} />;
  }

  it("opens no listener of its own and draws the stream it was handed", async () => {
    const { host } = await mount(<Tab />);
    // One listener on her FORD: the tab's. (fordListener asserts exactly one.)
    const l = fordListener();
    expect(l.constraints).toContainEqual({ type: "where", field: "studioId", op: "==", value: "s1" });
    expect(host.textContent).toContain("Loading…");
    await answer(l, [detail({ id: "k", body: "Wife is Karen." })]);
    expect(host.textContent).toContain("Wife is Karen.");
    expect(fake.listeners.filter((x) => x.live && x.path === "clients/c1/ford")).toHaveLength(1);
  });

  it("draws a refused stream as the home studio's, never as nothing on file", async () => {
    const refused: UseClientFordResult = {
      entries: [],
      buckets: groupByPillar([]).buckets,
      untagged: [],
      upcoming: [],
      status: "denied",
      isLoading: false,
    };
    const { host } = await mount(<FordSection client={client} author={author} ford={refused} />);
    // Nothing read at all: the stream was handed in.
    expect(fake.listeners.filter((l) => l.path === "clients/c1/ford")).toHaveLength(0);
    expect(host.querySelector('[data-testid="ford-read-notice"]')!.textContent).toContain(
      "kept by the client's home studio",
    );
    expect(host.textContent).not.toContain("Nothing here yet");
    expect((buttonByText(host, "Add a detail") as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("the briefing cue waits for FORD, and says why when it cannot read it", () => {
  it("draws nothing while FORD is loading — no prompt that flashes and is replaced", async () => {
    const { host } = await mount(<FordBriefingCue client={client} author={author} />);
    expect(host.querySelector('[data-testid="ford-briefing-cue"]')).toBeNull();
  });

  it("asks a question only once FORD has answered with nothing", async () => {
    const { host } = await mount(<FordBriefingCue client={client} author={author} />);
    await answer(fordListener(), []);
    const cue = host.querySelector('[data-testid="ford-briefing-cue"]')!;
    expect(cue.getAttribute("data-status")).toBe("ready");
    expect(cue.textContent).toContain("Nothing on file under");
  });

  it("tells a visitor FORD is the home studio's, read-only, with no capture", async () => {
    const { host } = await mount(<FordBriefingCue client={client} author={author} />);
    await refuse(fordListener(), "permission-denied");
    const cue = host.querySelector('[data-testid="ford-briefing-cue"]')!;
    expect(cue.textContent).toContain("kept by the client's home studio");
    expect(cue.textContent).not.toContain("Nothing on file");
    expect(cue.querySelector("button")).toBeNull();
  });

  it("on a failed read says so, and still opens the capture, stamped with the client's studio", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { host } = await mount(<FordBriefingCue client={client} author={author} studioId="elsewhere" />);
    await refuse(fordListener(), "unavailable");
    const cue = host.querySelector('[data-testid="ford-briefing-cue"]')!;
    expect(cue.textContent).toContain("couldn't be loaded");
    expect(cue.textContent).not.toContain("Nothing on file under");

    await click(cue.querySelector("button.ford-upnext__row"));
    const capture = cue.querySelector(".ford-capture")!;
    expect(capture).toBeTruthy();
    // Unfiled: the cue did not know a pillar to ask about.
    expect(capture.querySelector('.ford-letter[aria-pressed="true"]')).toBeNull();
    await typeInto(capture.querySelector("textarea"), "Off to Italy in May");
    await click(buttonByText(capture, "Remember this"));
    const created = fake.writes.find((w) => w.path === "clients/c1/ford")!;
    // The client's own studio, not the prop: it is what the read filters on.
    expect(created.data).toMatchObject({ studioId: "s1", pillar: null, origin: "briefing" });
    warn.mockRestore();
  });
});

describe("the post-session sweep", () => {
  it("says it could not check when FORD failed, and draws nothing when it answered empty", async () => {
    const failed = await mount(<FordSweep clientId="c1" clientFirstName="Judy" untagged={[]} status="failed" />);
    expect(failed.host.querySelector('[data-testid="ford-sweep-unread"]')!.textContent).toContain(
      "Couldn't check for details caught this session",
    );
    const ready = await mount(<FordSweep clientId="c1" clientFirstName="Judy" untagged={[]} status="ready" />);
    expect(ready.host.querySelector(".ford-sweep")).toBeNull();
    // A visitor's captures were refused too: nothing to say.
    const denied = await mount(<FordSweep clientId="c1" clientFirstName="Judy" untagged={[]} status="denied" />);
    expect(denied.host.querySelector(".ford-sweep")).toBeNull();
  });
});

describe("the Active Session sheet's Remember this", () => {
  const sheet = (c: Client | null) => (
    <SessionJournalSidebar
      session={{ id: "sess1" } as WorkoutSession}
      clientId="c1"
      clientFirstName="Judy"
      studioId="active-studio"
      author={author}
      machines={[]}
      client={c}
      defaultMode="ford"
      onClose={() => {}}
    />
  );

  it("reads FORD by the client's studio and stamps a capture with the same studio", async () => {
    const { host } = await mount(sheet(client));
    const l = fordListener();
    expect(l.constraints).toContainEqual({ type: "where", field: "studioId", op: "==", value: "s1" });
    await answer(l, []);
    const capture = host.querySelector(".ford-capture")!;
    await typeInto(capture.querySelector("textarea"), "Grandson graduates in May");
    await click(buttonByText(capture, "Remember this"));
    expect(fake.writes.find((w) => w.path === "clients/c1/ford")!.data).toMatchObject({
      studioId: "s1",
      sessionId: "sess1",
      origin: "in_session",
    });
  });

  it("tells a visitor FORD is the home studio's instead of offering a box the rules would refuse", async () => {
    const { host } = await mount(sheet(client));
    await refuse(fordListener(), "permission-denied");
    expect(host.querySelector('[data-testid="ford-read-notice"]')!.textContent).toContain("home studio");
    expect(host.querySelector(".ford-capture")).toBeNull();
  });

  it("keeps the capture on a failed read, and says the caught list is unknown", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { host } = await mount(sheet(client));
    await refuse(fordListener(), "unavailable");
    expect(host.querySelector('[data-testid="ford-read-notice"]')!.textContent).toContain("Couldn't load");
    expect(host.querySelector(".ford-capture")).toBeTruthy();
    warn.mockRestore();
  });
});
