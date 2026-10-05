// @vitest-environment jsdom
/**
 * Mounts the Wrap-up — the post-session screen (reporting round, Sep 2026;
 * named in the voice-review round, Sep 27 2026) — against a fake Firestore.
 * It proves what the thirty seconds walking a client out now offers: the dose
 * Dial with the five DOSE words that saves the moment it is tapped, the
 * Profile note's Loudness (Note · Heads up · Critical, Note
 * checked) with "Matters until" behind Heads up, the To-file tray showing
 * this session's unfiled notes, and that leaving files the note with its
 * loudness. The renewal dialog and Update Pulse are stubbed — each has its
 * own render test. Since the client codex (phase 1) it also proves the FORD
 * sweep mounts on a FAILED read and says it couldn't check, rather than
 * vanishing as if nothing had been caught.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StrictMode, act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../features/renewals", async (importOriginal) => {
  const real = await importOriginal<typeof import("../features/renewals")>();
  return { ...real, LogConversationDialog: () => null };
});

vi.mock("../features/subjective-report", async (importOriginal) => {
  const real = await importOriginal<typeof import("../features/subjective-report")>();
  return {
    ...real,
    PulseQuickLogDialog: (props: { open: boolean }) => (props.open ? <div data-testid="pulse-stub">Pulse stub</div> : null),
  };
});

/**
 * The packages card reads the studio's package table. A stand-in answers it,
 * so each test sets the state it is about (the shared onSnapshot fake below
 * answers every listener as a query, which a document listener can't read).
 */
const renewalSettings = vi.hoisted(() => ({ state: null as any }));
vi.mock("../features/renewals/useRenewalSettings", async () => {
  const { DEFAULT_RENEWAL_SETTINGS } = await import("../features/renewals/settings");
  return {
    useRenewalSettings: (studioId: string | null | undefined) =>
      renewalSettings.state ?? {
        settings: DEFAULT_RENEWAL_SETTINGS,
        saved: true,
        ownPackageTable: true,
        forStudioId: studioId ?? null,
        loading: false,
        error: null,
      },
  };
});

vi.mock("../firebase", () => ({
  db: { __fake: true },
  auth: { currentUser: { uid: "uid-jane" } },
}));

const updates: { path: string; data: any }[] = [];
/** When set, the client's FORD listener errors with this code instead of answering. */
let fordError: string | null = null;
/** More of this session's journal entries, beside the mid-session one below. */
let moreJournal: { id: string; data: () => Record<string, unknown> }[] = [];

const unfiledDoc = {
  id: "raw",
  data: () => ({
    clientId: "c1",
    studioId: "s1",
    kind: "general",
    category: null,
    body: "Knee clicked on leg press",
    importance: "standard",
    machineId: "m1",
    focusId: null,
    sessionId: "sess1",
    origin: "in_session",
    authorId: "uid-jane",
    authorInitials: "JC",
    authorName: "Jane Coach",
    occurredAt: new Date(2026, 8, 14, 12),
    isArchived: false,
    searchTags: [],
  }),
};

/**
 * THE NEXT CARD'S LISTENER on her own bookings (Openings round, phase 8), and
 * Openings' reads for the door: each test sets what the server says.
 *   answer   "server" answers at once; "cache" answers from this iPad's cache
 *            alone; "never" keeps it waiting; "fails" refuses it.
 *   emit()   sends the listener a new snapshot (a booking arriving).
 */
const her = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  answer: "server" as "server" | "cache" | "never" | "fails",
  listens: 0,
  listeners: [] as ((snap: unknown) => void)[],
  emit() {
    const snap = {
      docs: her.rows.map((r) => ({ id: String(r.id), data: () => r })),
      metadata: { fromCache: her.answer === "cache" },
    };
    for (const l of her.listeners) l(snap);
  },
}));
const openingsFake = vi.hoisted(() => ({
  summary: null as unknown,
  weeks: { docs: [] as unknown[], loading: false, error: null as string | null },
  schedule: { entries: [] as unknown[], loading: false, failed: false, fromCache: false },
  lease: undefined as unknown,
}));
vi.mock("../features/standing-week/useStandingWeeks", () => ({ useStandingWeeks: () => openingsFake.weeks }));
vi.mock("../features/admin/changes/useWeekSchedule", () => ({
  useWeekSchedule: (studioId: string | null) => (studioId ? openingsFake.schedule : { entries: [], loading: false, failed: false, fromCache: false }),
}));
vi.mock("../features/admin/sync-lease", () => ({ useSyncLease: () => openingsFake.lease }));

vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  const path = (...parts: any[]) => parts.filter((p) => typeof p === "string").join("/");
  return {
    ...real,
    collection: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    doc: (_db: unknown, ...parts: string[]) => ({ __path: path(...parts) }),
    query: (coll: any) => coll,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    // The journal stream feeds one unfiled note; her bookings and the marks
    // answer as the test says; every other stream is empty. A listener may
    // pass options (includeMetadataChanges) before its callbacks.
    onSnapshot: (q: any, a: any, b?: any, c?: any) => {
      const withOptions = typeof a !== "function";
      const next: (snap: any) => void = withOptions ? b : a;
      const error: ((err: any) => void) | undefined = withOptions ? c : b;
      const at = q?.__path ?? "";
      if (fordError && at === "clients/c1/ford") {
        error?.({ code: fordError, message: fordError });
        return () => {};
      }
      if (at === "schedules") {
        her.listens += 1;
        if (her.answer === "fails") {
          error?.({ code: "unavailable", message: "unavailable" });
          return () => {};
        }
        her.listeners.push(next);
        if (her.answer !== "never") her.emit();
        return () => {
          her.listeners = her.listeners.filter((l) => l !== next);
        };
      }
      if (at.endsWith("/openingsMarks")) {
        next({ docs: [], metadata: { fromCache: false } });
        return () => {};
      }
      const docs = at === "journalEntries" ? [unfiledDoc, ...moreJournal] : [];
      next({ docs, size: docs.length, empty: docs.length === 0 });
      return () => {};
    },
    // The weekly summary Openings reads by id; nothing else is read by id here.
    getDoc: async (ref: any) =>
      String(ref?.__path ?? "").endsWith("/watch/openings") && openingsFake.summary
        ? { exists: () => true, data: () => openingsFake.summary, metadata: { fromCache: false } }
        : { exists: () => false, data: () => undefined, metadata: { fromCache: false } },
    getDocs: async () => ({ docs: [], size: 0 }),
    addDoc: async () => ({ id: "new" }),
    updateDoc: async (ref: any, data: any) => {
      updates.push({ path: ref.__path, data });
    },
    serverTimestamp: () => ({ __server: true }),
  };
});

import { WrapUpScreen } from "./WrapUpScreen";
import { AppBottomBar } from "./AppBottomBar";
import { EFFORT_SCALE } from "../features/rating";
import { UnsavedChangesProvider, useGuardedState } from "../features/unsaved-changes";
import { forgetPersonalMemory } from "../features/sign-out/memory";
import { PAT, PAT_WEEK, SAM, SAM_TUESDAYS, WESTLAKE, foldFixture } from "../features/openings/ui/test-shell";
import { OFFER_FOOT } from "../features/openings/present";
import { congratulation } from "../lib/post-session";
import type { Client, Studio, View, WorkoutSession } from "../types";

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

beforeEach(() => {
  updates.length = 0;
  fordError = null;
  moreJournal = [];
  renewalSettings.state = null;
  her.rows = [];
  her.answer = "server";
  her.listens = 0;
  her.listeners = [];
  openingsFake.summary = null;
  openingsFake.weeks = { docs: [], loading: false, error: null };
  openingsFake.schedule = { entries: [], loading: false, failed: false, fromCache: false };
  openingsFake.lease = undefined;
});

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const click = async (el: Element | null | undefined) => {
  if (!el) throw new Error("element not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
};

const buttonByText = (root: ParentNode, text: string) =>
  Array.from(root.querySelectorAll("button")).find((b) => b.textContent?.trim().includes(text));

const client = { id: "c1", homeStudioId: "s1", firstName: "Judy", lastName: "Client", sessionCount: 12 } as Client;
const session = { id: "sess1", clientId: "c1", status: "Completed", sessionNumber: 12 } as WorkoutSession;
const trainer = { id: "t-doc", fullName: "Jane Coach", initials: "JC", role: "LifeTransformer" } as any;

function Screen({
  onEffort = vi.fn(),
  onLeave = vi.fn(),
  onFile,
}: {
  onEffort?: (v: any, d: boolean) => void;
  onLeave?: (c: any) => void;
  onFile?: (c: any) => void;
}) {
  return (
    <WrapUpScreen
      client={client}
      session={session}
      logs={[]}
      lines={[]}
      journey={{ enough: false, pct: null, machines: 0, since: null, byGroup: [], standout: null } as any}
      schedules={[]}
      authTrainer={trainer}
      onEffort={onEffort}
      onLeave={onLeave}
      onFile={onFile}
      machines={[{ id: "m1", name: "Leg Press" } as any]}
    />
  );
}

describe("the post-session screen mounts", () => {
  it("draws the effort Dial with its five words, neutral, and saves the moment Pushed hard is tapped (Oct 2 2026)", async () => {
    const onEffort = vi.fn();
    const host = await mount(<Screen onEffort={onEffort} />);
    expect(host.querySelector('[data-testid="dose-dial"]')).toBeNull();
    const dial = host.querySelector('[data-testid="effort-dial"]')!;
    expect(dial).toBeTruthy();
    // It follows the app theme (Sep 27 2026): nothing pins it dark, so on the
    // light theme it is not a dark slab with white words on a white card.
    expect(host.querySelector('[data-testid="effort-card"]')!.className.split(/\s+/)).not.toContain("dark");
    expect(host.querySelector('[data-testid="effort-card"]')!.hasAttribute("data-theme")).toBe(false);
    expect(dial.textContent).toContain("How hard did Judy work today?");

    const radios = Array.from(dial.querySelectorAll('[role="radio"]'));
    expect(radios).toHaveLength(5);
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([...EFFORT_SCALE.words]);
    // No green, no red: every position is the neutral tone.
    expect(radios.every((r) => r.getAttribute("data-tone") === "neutral")).toBe(true);
    expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    // Untouched says what it will save.
    expect(dial.textContent).toContain("As expected");
    expect(host.querySelector('[data-testid="effort-default-hint"]')!.textContent).toBe("Left untouched, it saves As expected.");
    expect(onEffort).not.toHaveBeenCalled();

    await click(radios[3]);
    expect(onEffort).toHaveBeenCalledWith(1, false);
    expect(radios[3].getAttribute("aria-checked")).toBe("true");
    // No advice under it (Oct 2 2026): the app never suggests a weight.
    expect(host.querySelector('[data-testid="dose-sentence"]')).toBeNull();
    expect(host.textContent).not.toMatch(/next time/i);
    expect(host.querySelector('[data-testid="effort-card"]')!.textContent).toContain("Saved");

    // Tapping it again takes the tap back: the default is written in its place.
    await click(radios[3]);
    expect(onEffort).toHaveBeenLastCalledWith(0, true);
    expect(host.querySelector('[data-testid="effort-default-hint"]')).toBeTruthy();
  });

  it("saves As expected, marked as the default, once, when the trainer leaves without tapping", async () => {
    const onEffort = vi.fn();
    const onLeave = vi.fn();
    const host = await mount(<Screen onEffort={onEffort} onLeave={onLeave} />);
    await click(buttonByText(host, "Back to Hub"));
    expect(onEffort).toHaveBeenCalledTimes(1);
    expect(onEffort).toHaveBeenCalledWith(0, true);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("writes no default over a tap when the trainer leaves", async () => {
    const onEffort = vi.fn();
    const host = await mount(<Screen onEffort={onEffort} />);
    const radios = Array.from(host.querySelector('[data-testid="effort-dial"]')!.querySelectorAll('[role="radio"]'));
    await click(radios[0]);
    await click(buttonByText(host, "Back to Hub"));
    expect(onEffort.mock.calls).toEqual([[-2, false]]);
  });

  it("saves the default when the screen goes without Back to Hub (the bottom bar, the header)", async () => {
    const onEffort = vi.fn();
    const host = await mount(<Screen onEffort={onEffort} />);
    void host;
    const m = mounted.pop()!;
    await act(async () => m.root.unmount());
    m.host.remove();
    await settle();
    expect(onEffort).toHaveBeenCalledTimes(1);
    expect(onEffort).toHaveBeenCalledWith(0, true);
  });

  it("offers the profile note's Loudness with Note checked, and Matters until behind Heads up", async () => {
    const host = await mount(<Screen />);
    const loud = host.querySelector('[role="radiogroup"][aria-label="How loud?"]')!;
    expect(loud).toBeTruthy();
    expect(Array.from(loud.querySelectorAll("button")).map((b) => b.textContent)).toEqual(["Note", "Heads up", "Critical"]);
    expect(loud.querySelector('[aria-checked="true"]')!.textContent).toBe("Note");
    expect(host.querySelector('input[aria-label="Matters until"]')).toBeNull();
    // At Note the Profile note goes to her profile only (voice-review round,
    // Sep 27 2026), and the screen says so in plain words rather than the
    // generic "found by its category" (it is filed unfiled).
    expect(host.querySelector('[data-testid="profile-note-hint"]')!.textContent).toBe(
      "Stays on Judy's profile. The next trainer's briefing won't show it.",
    );
    expect(host.textContent).not.toContain("found by its category");

    await click(buttonByText(loud, "Heads up"));
    const until = host.querySelector('input[aria-label="Matters until"]') as HTMLInputElement;
    expect(until).toBeTruthy();
    expect(until.getAttribute("min")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(host.textContent).toContain("Matters until (optional)");
    expect(host.textContent).toContain("After this it stops showing on the briefing.");
    // Louder, it does reach the briefing, and Loudness's own hint says so.
    expect(host.querySelector('[data-testid="profile-note-hint"]')).toBeNull();
    expect(host.textContent).toContain("on the briefing while it still matters");

    await click(buttonByText(loud, "Note"));
    expect(host.querySelector('input[aria-label="Matters until"]')).toBeNull();
    expect(host.querySelector('[data-testid="profile-note-hint"]')).toBeTruthy();
  });

  it("is headed Wrap-up: briefing is pre-session, wrap-up is post-session (voice-review round)", async () => {
    const host = await mount(<Screen />);
    expect(host.textContent).toContain("Wrap-up · session saved");
    expect(host.textContent).not.toContain("Session complete");
    // A plain congratulation picked for this session (Oct 2 2026), never a
    // judgement of how she did.
    expect(host.querySelector("h1")!.textContent).toBe(congratulation("sess1", "Judy"));
    expect(host.textContent).not.toContain("strong work");
    expect(host.querySelector('textarea[aria-label="Profile note"]')!.getAttribute("placeholder")).toBe(
      "Profile note — anything for Judy's record. It files when you leave this screen.",
    );
  });

  it("shows this session's unfiled note in the To-file tray and files it with one tap", async () => {
    const host = await mount(<Screen />);
    const tray = host.querySelector('[data-testid="note-sweep"]')!;
    expect(tray).toBeTruthy();
    // Follows the app theme like the rest of the screen.
    expect(tray.className.split(/\s+/)).not.toContain("dark");
    expect(tray.closest("[data-theme]")).toBeNull();
    expect(tray.textContent).toContain("To file · 1");
    expect(tray.textContent).toContain("Knee clicked on leg press");
    expect(tray.textContent).toContain("Leg Press");

    await click(buttonByText(tray.querySelector('[data-testid="sweep-raw"]')!, "Health"));
    expect(updates).toHaveLength(1);
    expect(updates[0].path).toBe("journalEntries/raw");
    expect(updates[0].data).toMatchObject({ kind: "injury", category: null });
    expect(host.querySelector('[data-testid="sweep-raw"]')).toBeNull();
  });

  it("says Update Pulse, never Assessment or priority, and opens the Pulse quick-log", async () => {
    const host = await mount(<Screen />);
    expect(host.textContent).not.toMatch(/assessment/i);
    expect(host.textContent).not.toMatch(/priority/i);
    expect(host.textContent).toContain("Effort · profile note · Pulse");
    expect(host.querySelector('[data-testid="pulse-stub"]')).toBeNull();
    await click(buttonByText(host, "Update Pulse"));
    expect(host.querySelector('[data-testid="pulse-stub"]')).toBeTruthy();
  });

  it("leaves with the profile note, its loudness and its until day", async () => {
    const onLeave = vi.fn();
    const host = await mount(<Screen onLeave={onLeave} />);
    const textarea = host.querySelector('textarea[aria-label="Profile note"]') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Shoulder tender on chest press");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const loud = host.querySelector('[role="radiogroup"][aria-label="How loud?"]')!;
    await click(buttonByText(loud, "Heads up"));
    const until = host.querySelector('input[aria-label="Matters until"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(until, "2099-09-20");
      until.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await click(buttonByText(host, "Back to Hub"));
    expect(onLeave).toHaveBeenCalledTimes(1);
    const profileNote = onLeave.mock.calls[0][0];
    expect(profileNote).toMatchObject({ noteContent: "Shoulder tender on chest press", importance: "elevated" });
    const stored = profileNote.effectiveUntil as Date;
    expect([stored.getFullYear(), stored.getMonth(), stored.getDate(), stored.getHours()]).toEqual([2099, 8, 20, 23]);
    // Leaving twice does nothing.
    await click(buttonByText(host, "Leaving"));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("draws no FORD sweep when FORD answered with nothing caught", async () => {
    const host = await mount(<Screen />);
    expect(host.querySelector(".ford-sweep")).toBeNull();
  });

  it("says it couldn't check for FORD details when the FORD read failed, rather than vanishing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fordError = "unavailable";
    const host = await mount(<Screen />);
    const sweep = host.querySelector('[data-testid="ford-sweep-unread"]')!;
    expect(sweep).toBeTruthy();
    expect(sweep.textContent).toContain("Couldn't check for details caught this session");
    warn.mockRestore();
  });

  it("draws no FORD sweep for a visitor the rules refused — their captures were refused too", async () => {
    fordError = "permission-denied";
    const host = await mount(<Screen />);
    expect(host.querySelector(".ford-sweep")).toBeNull();
  });

  it("leaves a plain Note with no until day", async () => {
    const onLeave = vi.fn();
    const host = await mount(<Screen onLeave={onLeave} />);
    await click(buttonByText(host, "Back to Hub"));
    expect(onLeave.mock.calls[0][0]).toEqual({ noteContent: "", importance: "standard", effectiveUntil: null });
  });
});

/*
 * THE NOTE FOR THE NEXT TRAINER (voice-review follow-up, Sep 27 2026). AJ:
 * "Ideally the end session note is made for the next sessions pre session
 * briefing but also can be filed to the profile". Finish writes it as an
 * unfiled Heads up, so it comes back in the To-file tray: it stays, it says
 * what it is, it can be filed, and it cannot be discarded off the briefing.
 */
describe("the Note for the next trainer in the Wrap-up's To-file tray", () => {
  const words = "Right knee sore after the move. Go light on leg press.";
  const nextDoc = (over: Record<string, unknown> = {}) => ({
    id: "next",
    data: () => ({
      ...unfiledDoc.data(),
      body: words,
      importance: "elevated",
      machineId: null,
      origin: "post_session",
      ...over,
    }),
  });

  function NextScreen({ note }: { note: { id: string | null; body: string } | null }) {
    return (
      <WrapUpScreen
        client={client}
        session={session}
        logs={[]}
        lines={[]}
        journey={{ enough: false, pct: null, machines: 0, since: null, byGroup: [], standout: null } as any}
        schedules={[]}
        authTrainer={trainer}
        onEffort={vi.fn()}
        onLeave={vi.fn()}
        nextTrainerNote={note}
        machines={[{ id: "m1", name: "Leg Press" } as any]}
      />
    );
  }

  it("keeps it in the tray, labelled for the next trainer, with no Discard — the other note keeps its Discard", async () => {
    moreJournal = [nextDoc()];
    const host = await mount(<NextScreen note={{ id: null, body: words }} />);
    const tray = host.querySelector('[data-testid="note-sweep"]')!;
    expect(tray.textContent).toContain("To file · 2");

    const card = tray.querySelector('[data-testid="sweep-next"]')!;
    expect(card.textContent).toContain(words);
    expect(card.querySelector('[data-testid="sweep-next-trainer"]')!.textContent).toContain(
      "Note for the next trainer · on the next briefing",
    );
    // Still a Heads up, and still fileable.
    expect(card.textContent).toContain("Heads up");
    expect(buttonByText(card, "Preference")).toBeTruthy();
    expect(buttonByText(card, "Discard")).toBeUndefined();

    const other = tray.querySelector('[data-testid="sweep-raw"]')!;
    expect(other.querySelector('[data-testid="sweep-next-trainer"]')).toBeNull();
    expect(buttonByText(other, "Discard")).toBeTruthy();
  });

  it("files it to the profile by kind and category only, so it stays a Heads up on the briefing", async () => {
    moreJournal = [nextDoc()];
    const host = await mount(<NextScreen note={{ id: null, body: words }} />);
    await click(buttonByText(host.querySelector('[data-testid="sweep-next"]')!, "Health"));
    expect(updates).toHaveLength(1);
    expect(updates[0].path).toBe("journalEntries/next");
    expect(Object.keys(updates[0].data).sort()).toEqual(["category", "kind", "updatedAt"]);
    expect(updates[0].data).toMatchObject({ kind: "injury", category: null });
    expect(host.querySelector('[data-testid="sweep-next"]')).toBeNull();
  });

  it("knows it by the journal's id once the write has answered", async () => {
    // The words were edited since (History can edit the session's copy);
    // the id is what the journal write returned.
    moreJournal = [nextDoc({ body: "Knee sore." })];
    const host = await mount(<NextScreen note={{ id: "next", body: words }} />);
    const card = host.querySelector('[data-testid="sweep-next"]')!;
    expect(card.querySelector('[data-testid="sweep-next-trainer"]')).toBeTruthy();
    expect(buttonByText(card, "Discard")).toBeUndefined();
  });

  it("does not mistake another Heads up from this session for it", async () => {
    moreJournal = [nextDoc({ body: "A different Heads up saved during the session.", origin: "in_session" })];
    const host = await mount(<NextScreen note={{ id: null, body: words }} />);
    const card = host.querySelector('[data-testid="sweep-next"]')!;
    expect(card.querySelector('[data-testid="sweep-next-trainer"]')).toBeNull();
    expect(buttonByText(card, "Discard")).toBeTruthy();
  });

  it("with no note from End Session, every card keeps its Discard", async () => {
    moreJournal = [nextDoc()];
    const host = await mount(<NextScreen note={null} />);
    expect(host.querySelector('[data-testid="sweep-next-trainer"]')).toBeNull();
    expect(buttonByText(host.querySelector('[data-testid="sweep-next"]')!, "Discard")).toBeTruthy();
  });
});

/*
 * What the screen says about her PAST (Sep 24 2026, lib/history-claims.ts).
 * The client is standing next to this screen. A machine with no earlier set
 * on record is her "First time" only when Journey holds her whole story, and
 * "session #N" is printed only through the Hub card's number gate.
 */
describe("the post-session screen and a client's history", () => {
  const firstLine = {
    machineId: "m1",
    name: "Leg Press",
    outcome: "performed",
    weight: 120,
    count: 8,
    isTSC: false,
    quality: 2,
    loadDelta: null,
    countDelta: null,
    first: true,
  } as const;

  function HistoryScreen({ coverage, who = client }: { coverage?: "complete" | "partial" | "unknown"; who?: Client }) {
    return (
      <WrapUpScreen
        client={who}
        coverage={coverage}
        session={{ ...session, sessionNumber: 4 }}
        logs={[]}
        lines={[firstLine]}
        journey={{ enough: false, pct: null, machines: 0, since: null, byGroup: [], standout: null } as any}
        schedules={[]}
        authTrainer={trainer}
        onEffort={vi.fn()}
        onLeave={vi.fn()}
        machines={[{ id: "m1", name: "Leg Press" } as any]}
      />
    );
  }

  it("calls a machine her first time, and numbers the session, when Journey holds her whole story", async () => {
    const host = await mount(<HistoryScreen coverage="complete" />);
    expect(host.textContent).toContain("First time");
    expect(host.textContent).toContain("1 new machine");
    expect(host.textContent).toContain("session #4");
  });

  it("says neither to a migrating client nobody has recorded a total for", async () => {
    for (const coverage of ["partial", "unknown", undefined] as const) {
      const host = await mount(<HistoryScreen coverage={coverage} />);
      expect(host.textContent).not.toContain("First time");
      expect(host.textContent).not.toMatch(/new machine/);
      expect(host.textContent).not.toContain("session #");
      // What actually happened today is still there.
      expect(host.textContent).toContain("Leg Press");
      expect(host.textContent).toContain("1 of 1 machine");
    }
  });

  it("numbers the session once somebody has recorded her total, and still claims no first time", async () => {
    const recorded = {
      ...client,
      priorHistory: { sessions: 412, importedCount: 0, through: "2026-09-12", source: "filemaker" },
    } as Client;
    const host = await mount(<HistoryScreen coverage="partial" who={recorded} />);
    expect(host.textContent).toContain("session #4");
    expect(host.textContent).not.toContain("First time");
  });
});

/*
 * EVERY WAY OUT FILES (the Atlas answers, Oct 2 2026; it was the unsaved-
 * changes question from Sep 24). The bottom bar stays live on this screen;
 * leaving by it files the typed Profile note as the screen goes, exactly once,
 * and asks nothing. Locking the iPad files it and stays. Mounted with the
 * provider and the real bottom bar, wired the way AppContent wires them:
 * onLeave files, then sets the view through the same guarded setter the bar
 * uses; onFile files without leaving.
 */
describe("every way out of the Wrap-up files the typed profile note, once", () => {
  const filed: unknown[] = [];
  const filedOnTheWay: unknown[] = [];

  function Host() {
    const [view, setView] = useGuardedState<View>("workouts");
    return (
      <div data-testid="app" data-view={view}>
        {view === "workouts" && (
          <Screen
            onFile={(profileNote: unknown) => filedOnTheWay.push(profileNote)}
            onLeave={(profileNote: unknown) => {
              // In the SAME tap, the strictest case: the screen has not
              // re-rendered since Back to Hub was pressed, so only its own
              // release() keeps this from asking about the note it files.
              // (leavePostSession awaits the journal write first, which
              // usually gives React time to re-render — usually.)
              filed.push(profileNote);
              setView("clients");
            }}
          />
        )}
        <AppBottomBar
          appMode="trainer"
          currentView={view}
          isAdmin={false}
          hasClient
          liveSession={undefined}
          lastLearningView="learning"
          onNavigate={setView}
          onResumeSession={() => setView("workouts")}
        />
      </div>
    );
  }

  const withProvider = (ui: ReactNode) => <UnsavedChangesProvider>{ui}</UnsavedChangesProvider>;
  const viewOf = (host: HTMLElement) => host.querySelector('[data-testid="app"]')!.getAttribute("data-view");
  const hub = (host: HTMLElement) =>
    Array.from(host.querySelectorAll("nav button")).find((b) => b.textContent?.trim() === "Hub");
  const typeNote = async (host: HTMLElement, text: string) => {
    const textarea = host.querySelector('textarea[aria-label="Profile note"]') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, text);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  const question = () => document.querySelector('[role="alertdialog"]');

  beforeEach(() => {
    filed.length = 0;
    filedOnTheWay.length = 0;
  });

  const setHidden = (hidden: boolean) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  afterEach(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("lets the bottom bar straight through while no note is typed, and files nothing", async () => {
    const host = await mount(withProvider(<Host />));
    await click(hub(host));
    await settle();
    expect(question()).toBeNull();
    expect(viewOf(host)).toBe("clients");
    expect(filedOnTheWay).toHaveLength(0);
  });

  it("files a typed profile note when the bottom bar leaves, without asking, exactly once", async () => {
    const host = await mount(withProvider(<Host />));
    await typeNote(host, "Shoulder tender on chest press");
    await click(hub(host));
    await settle();
    expect(question()).toBeNull();
    expect(viewOf(host)).toBe("clients");
    expect(filedOnTheWay).toEqual([expect.objectContaining({ noteContent: "Shoulder tender on chest press", importance: "standard" })]);
    expect(filed).toHaveLength(0);
  });

  it("files the note by Back to Hub and goes, once, without asking", async () => {
    const host = await mount(withProvider(<Host />));
    await typeNote(host, "Shoulder tender on chest press");
    await click(buttonByText(host, "Back to Hub"));
    await settle();
    await settle();
    expect(question()).toBeNull();
    expect(viewOf(host)).toBe("clients");
    expect(filed).toEqual([expect.objectContaining({ noteContent: "Shoulder tender on chest press" })]);
    // The unmount that follows Back to Hub files nothing a second time.
    expect(filedOnTheWay).toHaveLength(0);
  });

  it("files it when the iPad is locked, stays, and never files the same words twice", async () => {
    const host = await mount(withProvider(<Host />));
    await typeNote(host, "Shoulder tender on chest press");
    await act(async () => setHidden(true));
    expect(filedOnTheWay).toEqual([expect.objectContaining({ noteContent: "Shoulder tender on chest press" })]);
    expect(viewOf(host)).toBe("workouts");
    await act(async () => setHidden(false));
    expect((host.querySelector('textarea[aria-label="Profile note"]') as HTMLTextAreaElement).value).toBe("");
    expect(host.querySelector('[data-testid="profile-note-filed"]')).toBeTruthy();
    // Hidden again with nothing new typed: nothing more is filed.
    await act(async () => setHidden(true));
    await act(async () => setHidden(false));
    expect(filedOnTheWay).toHaveLength(1);
    // Leaving now files nothing more either.
    await click(buttonByText(host, "Back to Hub"));
    await settle();
    expect(filed).toEqual([expect.objectContaining({ noteContent: "" })]);
  });

  it("files it when a sign-out asks every screen to send now", async () => {
    const host = await mount(withProvider(<Host />));
    await typeNote(host, "Ask about the knee");
    await act(async () => {
      window.dispatchEvent(new Event("journey:send-sets-now"));
    });
    expect(filedOnTheWay).toEqual([expect.objectContaining({ noteContent: "Ask about the knee" })]);
  });
});

describe("the packages card (consultation round, Sep 2026)", () => {
  /* The sheet is a base-ui dialog, which wants both. */
  const g = globalThis as unknown as Record<string, unknown>;
  if (!("ResizeObserver" in g)) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  const checked = { mindbodyServicesSyncedAt: "2026-09-23", mindbodyCommercialSyncedAt: "2026-09-23" };

  function PackagesScreen({ who, coverage = "unknown" }: { who: Partial<Client>; coverage?: "complete" | "partial" | "unknown" }) {
    return (
      <WrapUpScreen
        client={{ ...client, ...who } as Client}
        session={{ ...session, hostedAtStudioId: "s1" } as WorkoutSession}
        logs={[]}
        lines={[]}
        journey={{ enough: false, pct: null, machines: 0, since: null, byGroup: [], standout: null } as any}
        schedules={[]}
        authTrainer={trainer}
        onEffort={vi.fn()}
        onLeave={vi.fn()}
        coverage={coverage}
        machines={[]}
      />
    );
  }

  const card = (host: ParentNode) => host.querySelector('[data-testid="packages-card"]');

  it("shows a prospect the lengths and their prices, and opens the full sheet", async () => {
    const host = await mount(<PackagesScreen who={checked} coverage="complete" />);
    const c = card(host)!;
    expect(c).toBeTruthy();
    expect(c.textContent).toContain("Packages");
    expect(c.textContent).toContain("Mindbody showed no package for Judy when it was last checked, Sep 23.");
    expect(c.textContent).toContain("Committed · 12 months");
    expect(c.textContent).toContain("$60 a session · $480 every 4 weeks");
    await click(buttonByText(c, "Walk through the packages"));
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.textContent).toContain("Every package is the same training");
  });

  it("gives a long-standing client the door and the sentence, but no price list on this screen", async () => {
    const host = await mount(<PackagesScreen who={checked} coverage="partial" />);
    const c = card(host)!;
    expect(c.textContent).toContain("Mindbody showed no package for Judy");
    expect(c.textContent).not.toContain("$");
    expect(buttonByText(c, "Walk through the packages")).toBeTruthy();
  });

  it("says Journey hasn't checked yet, never 'no package', before Mindbody has been read", async () => {
    const host = await mount(<PackagesScreen who={{}} />);
    const c = card(host)!;
    expect(c.textContent).toContain("Journey hasn't checked Mindbody for Judy's package yet.");
    expect(c.textContent).not.toMatch(/no package|\bnew\b|first/i);
  });

  it("is not drawn for a client with a live package: the Renewal conversation is the tool there", async () => {
    const renewal = { cycleKey: "9001", situation: "on-track", flags: [], dataGaps: [] } as any;
    const host = await mount(<PackagesScreen who={{ ...checked, renewal }} coverage="complete" />);
    expect(card(host)).toBeNull();
    expect(buttonByText(host, "Renewal conversation")).toBeTruthy();
  });

  it("is not drawn for a client who is away", async () => {
    const renewal = { cycleKey: null, situation: "away", flags: [], dataGaps: [] } as any;
    const host = await mount(<PackagesScreen who={{ ...checked, renewal }} coverage="complete" />);
    expect(card(host)).toBeNull();
  });

  it("never shows a price it couldn't load", async () => {
    renewalSettings.state = {
      settings: (await import("../features/renewals/settings")).DEFAULT_RENEWAL_SETTINGS,
      saved: false,
      ownPackageTable: false,
      forStudioId: "s1",
      loading: false,
      error: "Couldn't load",
    };
    const host = await mount(<PackagesScreen who={checked} coverage="complete" />);
    const c = card(host)!;
    expect(c.textContent).not.toContain("$");
    // Without the table it can't tell a package name from a stray one, so it says so.
    expect(c.textContent).toContain("Journey couldn't check Judy's package just now.");
  });

  it("tells a temporary profile's trainer the prices couldn't load, rather than showing the defaults", async () => {
    renewalSettings.state = {
      settings: (await import("../features/renewals/settings")).DEFAULT_RENEWAL_SETTINGS,
      saved: false,
      ownPackageTable: false,
      forStudioId: "s1",
      loading: false,
      error: "Couldn't load",
    };
    const host = await mount(<PackagesScreen who={{ provisional: true }} coverage="unknown" />);
    const c = card(host)!;
    expect(c.textContent).toContain("A temporary profile");
    expect(c.textContent).not.toContain("$");
    expect(c.textContent).toContain("Couldn’t load this studio’s prices.");
  });
});

describe("the post-session screen's small honesty fixes (packages round)", () => {
  it("wraps a long machine name rather than cutting it off", async () => {
    const host = await mount(
      <WrapUpScreen
        client={client}
        session={session}
        logs={[]}
        lines={[{ machineId: "m1", name: "Seated Leg Press With A Long Studio Name", outcome: "performed", weight: 180, count: 9 } as any]}
        journey={{ enough: false, pct: null, machines: 0, since: null, byGroup: [], standout: null } as any}
        schedules={[]}
        authTrainer={trainer}
        onEffort={vi.fn()}
        onLeave={vi.fn()}
        machines={[]}
      />,
    );
    const name = Array.from(host.querySelectorAll("li span")).find((el) => el.textContent === "Seated Leg Press With A Long Studio Name")!;
    expect(name).toBeTruthy();
    expect(name.className).not.toContain("truncate");
  });

  it("never says Saved when the effort write failed", async () => {
    const onEffort = vi.fn(async () => false);
    const host = await mount(<Screen onEffort={onEffort} />);
    const radios = Array.from(host.querySelector('[data-testid="effort-dial"]')!.querySelectorAll('[role="radio"]'));
    await click(radios[2]);
    expect(onEffort).toHaveBeenCalledWith(0, false);
    expect(host.querySelector('[data-testid="effort-card"]')!.textContent).not.toContain("Saved");
  });
});

/*
 * THE LOOK (voice review follow-up, Sep 27 2026). The Wrap-up follows the app
 * theme, all of it, and every colour is a token that reads in both themes.
 * The confetti burst stays: AJ, "I like it keep it."
 */
describe("the Wrap-up follows the theme, and keeps its confetti", () => {
  const PALETTE = /(?:^|\s)(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?![\w-])/;

  function FullScreen() {
    return (
      <WrapUpScreen
        client={{ ...client, renewal: { cycleKey: "9001", situation: "on-track", flags: [], dataGaps: [] } } as any}
        session={session}
        logs={[{ id: "l1", machineId: "m1", sessionId: "sess1", weight: "180", reps: "9", outcome: "performed" } as any]}
        lines={[
          { machineId: "m1", name: "Leg Press", outcome: "performed", weight: 180, count: 9, isTSC: false, quality: 3, loadDelta: 5, countDelta: 0, first: false },
        ] as any}
        journey={{ enough: true, pct: 21, machines: 4, since: "2026-07-01", byGroup: [{ group: "Lower Body", pct: 26, machines: 2 }, { group: "Upper Body", pct: 14, machines: 2 }], standout: null } as any}
        schedules={[]}
        authTrainer={trainer}
        onEffort={vi.fn()}
        onLeave={vi.fn()}
        unsavedDraft={{ body: "Mentioned her daughter's wedding", category: null } as any}
        machines={[{ id: "m1", name: "Leg Press", anatomicalRegion: "Lower Body" } as any]}
      />
    );
  }

  it("pins nothing dark: no .dark class and no data-theme anywhere inside it", async () => {
    const host = await mount(<FullScreen />);
    expect(host.querySelector("[data-theme]")).toBeNull();
    expect(Array.from(host.querySelectorAll("[class]")).some((el) => el.classList.contains("dark"))).toBe(false);
  });

  it("draws no Tailwind palette colour of its own: every colour it sets is a token", async () => {
    const host = await mount(<FullScreen />);
    // The To-file tray is the notes feature's own component (its category
    // chips carry their own dots); this is about what the Wrap-up draws.
    const offenders = Array.from(host.querySelectorAll("[class]"))
      .filter((el) => !el.closest('[data-testid="note-sweep"]'))
      .map((el) => el.getAttribute("class") ?? "")
      .filter((c) => PALETTE.test(c));
    expect(offenders).toEqual([]);
  });

  it("says a save in brand blue on its own on-colour, in sentence case", async () => {
    const host = await mount(<FullScreen />);
    const save = buttonByText(host.querySelector('[data-testid="unsaved-draft"]')!, "Save note")!;
    expect(save.className).toContain("bg-(--eq-live)");
    expect(save.className).toContain("text-(--eq-live-on)");
    expect(save.className).not.toContain("uppercase");
  });

  it("draws its own buttons in bold sentence case at 14px, with the brand focus ring", async () => {
    const host = await mount(<FullScreen />);
    const own = ["Save note", "Drop it", "Update Pulse", "Renewal conversation", "Back to Hub"].map(
      (label) => buttonByText(host, label)!,
    );
    for (const b of own) {
      expect(b).toBeTruthy();
      const cls = b.className.split(/\s+/);
      expect(cls).toContain("font-bold");
      expect(cls).toContain("text-[14px]");
      expect(cls).not.toContain("uppercase");
      expect(cls).not.toContain("italic");
      expect(cls).not.toContain("font-display");
      expect(cls).toContain("focus-visible:ring-(--eq-focus-ring)");
      // At least 40px tall (min-h-10 = 40px, min-h-11 = 44px, 52px for leaving).
      expect(cls.some((c) => c === "min-h-10" || c === "min-h-11" || c === "min-h-[52px]")).toBe(true);
    }
  });

  it("heads its cards in small upright capitals, and titles the page in the codex voice", async () => {
    const host = await mount(<FullScreen />);
    const title = host.querySelector("h1")!;
    expect(title.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["font-display", "font-extrabold", "italic", "uppercase", "text-[30px]", "break-words"]),
    );
    const head = Array.from(host.querySelectorAll("div")).find((d) => d.textContent === "The journey")!;
    const cls = head.className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(["uppercase", "font-extrabold", "text-[12px]", "text-ink-d2"]));
    expect(cls).not.toContain("italic");
    expect(cls).not.toContain("font-display");
  });

  it("keeps every text size in its source on the scale, and no cyan focus left: the Wrap-up and the Times with room sheet it opens", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    // The sheet is drawn in a portal, out of the DOM palette test's reach, so its source is held here too (the final review).
    for (const f of ["WrapUpScreen.tsx", "../features/openings/ui/TimesWithRoomSheet.tsx"]) {
      const src = readFileSync(join(here, f), "utf8");
      const sizes = new Set([...src.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1])));
      // 22 joined the codex scale on Oct 4 2026 (type and depth, phase 2).
      expect([...sizes].filter((n) => ![11, 12, 14, 17, 22, 30].includes(n)), f).toEqual([]);
      expect(src, f).not.toMatch(/ring-cyan|border-cyan/);
      expect(src.split(/["'`]/).filter((s) => PALETTE.test(s)), f).toEqual([]);
    }
  });

  /* Where the work went: hero orange (chart-2, the same colour as --cta) is
     the one loud action of a screen and chart-1 is the brand blue in the
     light theme, so neither colours a muscle group. */
  it("colours where the work went with neither of the brand's two colours, one colour per region", async () => {
    const machines = [
      { id: "m1", name: "Leg Press", anatomicalRegion: "Lower Body" },
      { id: "m2", name: "Chest Press", anatomicalRegion: "Chest" },
      { id: "m3", name: "Lower Back", anatomicalRegion: "Lumbar" },
      { id: "m4", name: "Mystery Machine", anatomicalRegion: "" },
    ];
    const logs = machines.map((m, i) => ({ id: `l${i}`, machineId: m.id, sessionId: "sess1", weight: "100", reps: String(5 + i), outcome: "performed" }));
    const host = await mount(
      <WrapUpScreen
        client={client}
        session={session}
        logs={logs as any}
        lines={[]}
        journey={{ enough: false, pct: null, machines: 0, since: null, byGroup: [], standout: null } as any}
        schedules={[]}
        authTrainer={trainer}
        onEffort={vi.fn()}
        onLeave={vi.fn()}
        machines={machines as any}
      />,
    );
    const label = Array.from(host.querySelectorAll("span")).find((s) => s.textContent === "Where the work went")!;
    const block = label.parentElement!.parentElement!;
    for (const region of ["Lower Body", "Upper Body", "Core & Spine", "Other"]) expect(block.textContent).toContain(region);
    const classes = Array.from(block.querySelectorAll("[class]")).flatMap((el) => el.className.split(/\s+/));
    expect(classes).not.toContain("bg-chart-1");
    expect(classes).not.toContain("bg-chart-2");
    expect(classes).not.toContain("bg-cta");
    const dotTones = Array.from(block.querySelectorAll("span.rounded-full.shrink-0")).map((d) =>
      d.className.split(/\s+/).find((c) => c.startsWith("bg-")),
    );
    expect(dotTones).toHaveLength(4);
    expect(new Set(dotTones).size).toBe(4);
  });

  it("bursts its confetti once as it opens, out of the way of every tap", async () => {
    const host = await mount(<FullScreen />);
    const layer = host.querySelector(".pointer-events-none.z-50")!;
    expect(layer).toBeTruthy();
    expect(layer.children).toHaveLength(36);
  });
});

describe("the post-session screen says where the session is saved (session record, Sep 26 2026)", () => {
  const screen = (savedOnThisIpad?: boolean) => (
    <WrapUpScreen
      client={client}
      session={session}
      logs={[]}
      lines={[]}
      journey={{ enough: false, pct: null, machines: 0, since: null, byGroup: [], standout: null } as any}
      schedules={[]}
      authTrainer={trainer}
      onEffort={vi.fn()}
      onLeave={vi.fn()}
      savedOnThisIpad={savedOnThisIpad}
      machines={[{ id: "m1", name: "Leg Press" } as any]}
    />
  );

  it("says 'saved' once the studio's records have the session", async () => {
    const host = await mount(screen());
    expect(host.textContent).toContain("Wrap-up · session saved");
    expect(host.textContent).not.toContain("saved on this iPad");
    expect(host.textContent).not.toContain("when the connection is back");
  });

  it("says 'saved on this iPad' while the database has not answered, and that it will send", async () => {
    const host = await mount(screen(true));
    expect(host.textContent).toContain("Wrap-up · session saved on this iPad");
    expect(host.textContent).toContain("It sends to the studio's records when the connection is back. Nothing more to do.");
  });
});

/*
 * NEXT, AND TIMES WITH ROOM (Openings round, Sep 27 2026, phase 8). The Next
 * card listens for her own bookings from the server (at any studio on the
 * same Mindbody) and never says a plain "Nothing booked yet"; the door to
 * Times with room is quiet on every Wrap-up with something to offer,
 * prominent only when nothing is booked, and absent before there is anything;
 * the sheet opens on top of the Wrap-up and names nobody.
 *
 * Today is Monday Nov 9 2026, noon Eastern, at Westlake. Sam (running this
 * Wrap-up) takes clients Monday 7:00 - 10:00 and Tuesday 10:00 - 12:00, with
 * Ann Regular his Tuesday 10:00 regular; Pat takes them Monday 7:00 - 9:00.
 */
describe("Next: her next booking, and the door to Times with room", () => {
  /* The sheet is a base-ui dialog, which wants both. */
  const g = globalThis as unknown as Record<string, unknown>;
  if (!("ResizeObserver" in g)) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  const STRONGSVILLE = { id: "strongsville", name: "Strongsville", timezone: "America/New_York", mindbodySiteId: "29068" } as unknown as Studio;
  const ANN_TUESDAY = { id: "r1", weekday: 2, start: "10:00", clientId: "c-ann", clientName: "Ann Regular" };
  const samWeek = () => ({ ...SAM_TUESDAYS, final: { ...SAM_TUESDAYS.final!, regulars: [ANN_TUESDAY] } });
  const booking = (iso: string, over: Record<string, unknown> = {}) => ({
    id: `b-${iso}`,
    clientId: "c1",
    clientName: "Judy Client",
    trainerId: "t-sam",
    trainerName: "Sam Lee",
    studioId: "westlake",
    startTime: new Date(iso),
    endTime: new Date(new Date(iso).getTime() + 30 * 60_000),
    status: "Scheduled",
    ...over,
  });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date("2026-11-09T12:00:00-05:00") });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    forgetPersonalMemory();
    openingsFake.summary = foldFixture();
    openingsFake.weeks = { docs: [samWeek(), PAT_WEEK], loading: false, error: null };
    // The month was read in full this morning.
    openingsFake.lease = { lastDeepScheduleSyncAt: new Date("2026-11-09T06:30:00-05:00").getTime() };
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function NextScreen({ schedules = [] as unknown[], studio = WESTLAKE }: { schedules?: unknown[]; studio?: Studio }) {
    return (
      <WrapUpScreen
        studioName="Westlake"
        studio={studio}
        studios={[WESTLAKE, STRONGSVILLE]}
        trainers={[SAM, PAT]}
        client={client}
        session={session}
        logs={[]}
        lines={[]}
        journey={{ enough: false, pct: null, machines: 0, since: null, byGroup: [], standout: null } as any}
        schedules={schedules as any}
        authTrainer={SAM}
        onEffort={vi.fn()}
        onLeave={vi.fn()}
        machines={[{ id: "m1", name: "Leg Press" } as any]}
      />
    );
  }

  const nextLine = (host: HTMLElement) => host.querySelector('[data-testid="next-booking"]') as HTMLElement;
  /** The Next line's sentence alone (the door sits in the same line). */
  const nextText = (host: HTMLElement) => host.querySelector('[data-testid="next-booking-sentence"]')?.textContent;
  const door = (host: HTMLElement) => host.querySelector('[data-testid="times-door"]') as HTMLElement | null;
  const sheet = () => document.querySelector('[data-testid="times-with-room"]') as HTMLElement | null;

  it("counts a booking at another studio on the same Mindbody, and says where", async () => {
    her.rows = [booking("2026-11-12T08:00:00-05:00", { studioId: "strongsville" })];
    const host = await mount(<NextScreen />);
    await settle();
    expect(nextLine(host).getAttribute("data-state")).toBe("booked");
    expect(nextText(host)).toBe("Next session: Thu, Nov 12 · 8:00 AM at Strongsville.");
    expect(door(host)?.getAttribute("data-door")).toBe("quiet");
  });

  it("with nothing booked, confirmed by the server, says how far ahead and shows the prominent door", async () => {
    const host = await mount(<NextScreen />);
    await settle();
    expect(nextLine(host).getAttribute("data-state")).toBe("none");
    expect(nextText(host)).toBe("Nothing booked in the next 30 days. Book the next one before they leave.");
    expect(host.textContent).not.toContain("Nothing booked yet");
    expect(door(host)?.getAttribute("data-door")).toBe("prominent");
    expect(door(host)?.textContent).toBe("Times with room");
    // The prominent door is a 44px button in the Wrap-up's own voice.
    expect(door(host)!.className.split(/\s+/)).toEqual(expect.arrayContaining(["min-h-11", "font-bold", "text-[14px]", "focus-visible:ring-(--eq-focus-ring)"]));
  });

  it("says 7 days, not 30, when the month wasn't read in full today", async () => {
    openingsFake.lease = { lastDeepScheduleSyncAt: new Date("2026-11-07T06:30:00-05:00").getTime() };
    const host = await mount(<NextScreen />);
    await settle();
    expect(nextText(host)).toBe("Nothing booked in the next 7 days. Book the next one before they leave.");
  });

  it("booked in the schedule already on screen: says so at once, without listening, and the door is the quiet link", async () => {
    her.answer = "never";
    const host = await mount(<NextScreen schedules={[booking("2026-11-10T10:00:00-05:00")]} />);
    expect(nextText(host)).toBe("Next session: Tomorrow · 10:00 AM.");
    expect(her.listens).toBe(0);
    await settle();
    expect(door(host)?.getAttribute("data-door")).toBe("quiet");
    // The same 44px as the prominent door, so one turning into the other moves nothing.
    expect(door(host)!.className.split(/\s+/)).toEqual(expect.arrayContaining(["min-h-11", "font-bold", "text-[14px]"]));
  });

  it("while her bookings are still coming, says it is checking, in the same space", async () => {
    her.answer = "never";
    const host = await mount(<NextScreen />);
    await settle();
    expect(nextLine(host).getAttribute("data-state")).toBe("checking");
    expect(nextText(host)).toBe("Checking the next booking…");
    expect(nextLine(host).className.split(/\s+/)).toContain("min-h-14");
    expect(door(host)?.getAttribute("data-door")).toBe("quiet");
  });

  it("with nothing to offer yet, shows no door", async () => {
    openingsFake.summary = null;
    openingsFake.weeks = { docs: [{ ...samWeek(), final: null, proposed: samWeek().final }], loading: false, error: null };
    const host = await mount(<NextScreen />);
    await settle();
    expect(nextLine(host).getAttribute("data-state")).toBe("none");
    expect(door(host)).toBeNull();
  });

  it("offline: says it can't check the next booking, and never shows the prominent door", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    her.answer = "cache";
    // Even with a booking in this iPad's cache: a cache is not an answer.
    her.rows = [booking("2026-11-12T08:00:00-05:00")];
    const host = await mount(<NextScreen />);
    await settle();
    expect(nextLine(host).getAttribute("data-state")).toBe("cant-check");
    expect(nextText(host)).toBe("Can't check the next booking right now.");
    expect(door(host)?.getAttribute("data-door")).not.toBe("prominent");
    online.mockRestore();
  });

  it("at a studio whose bookings aren't linked, can't check the next booking, never 'nothing booked' (the final review)", async () => {
    const host = await mount(<NextScreen studio={{ ...WESTLAKE, mindbodySiteId: "" } as unknown as Studio} />);
    await settle();
    expect(nextLine(host).getAttribute("data-state")).toBe("cant-check");
    expect(nextText(host)).toBe("Can't check the next booking right now.");
    expect(door(host)).toBeNull();
  });

  it("a failed read says it can't check, never that nothing is booked", async () => {
    her.answer = "fails";
    const host = await mount(<NextScreen />);
    await settle();
    expect(nextText(host)).toBe("Can't check the next booking right now.");
    expect(door(host)?.getAttribute("data-door")).toBe("quiet");
  });

  it("a booking arriving while the screen is open turns the card green, and the door steps back", async () => {
    const host = await mount(<NextScreen />);
    await settle();
    expect(door(host)?.getAttribute("data-door")).toBe("prominent");
    await act(async () => {
      her.rows = [booking("2026-11-16T08:00:00-05:00")];
      her.emit();
    });
    expect(nextLine(host).getAttribute("data-state")).toBe("booked");
    expect(nextText(host)).toBe("Next session: Mon, Nov 16 · 8:00 AM.");
    expect(nextLine(host).className).toContain("bg-(--eq-ok-fill)");
    expect(door(host)?.getAttribute("data-door")).toBe("quiet");
  });

  it("keeps the door inside the Next line, so its arriving moves nothing on the card above the dose Dial", async () => {
    /** The Next card's rows down to the dose card, by what they are. */
    const rowsAboveDose = (host: HTMLElement) => {
      const rows = Array.from(nextLine(host).parentElement!.children);
      const dose = rows.findIndex((el) => el.getAttribute("data-testid") === "effort-card");
      expect(dose).toBeGreaterThan(0);
      return rows.slice(0, dose).map((el) => `${el.tagName}:${el.getAttribute("data-testid") ?? ""}`);
    };

    const withDoor = await mount(<NextScreen />);
    await settle();
    expect(door(withDoor)).not.toBeNull();
    expect(door(withDoor)!.closest('[data-testid="next-booking"]')).toBe(nextLine(withDoor));
    // The live region is the sentence, not the door beside it.
    expect(nextLine(withDoor).hasAttribute("aria-live")).toBe(false);
    expect(withDoor.querySelector('[data-testid="next-booking-sentence"]')!.getAttribute("aria-live")).toBe("polite");
    const rowsWithDoor = rowsAboveDose(withDoor);

    // A studio with nothing to offer yet: no door, and the same rows.
    forgetPersonalMemory();
    openingsFake.summary = null;
    openingsFake.weeks = { docs: [{ ...samWeek(), final: null, proposed: samWeek().final }], loading: false, error: null };
    const noDoor = await mount(<NextScreen />);
    await settle();
    expect(door(noDoor)).toBeNull();
    expect(rowsAboveDose(noDoor)).toEqual(rowsWithDoor);
  });

  it("opens Times with room on top of the Wrap-up, naming no client, and closes back to it", async () => {
    const host = await mount(<NextScreen />);
    await settle();
    const note = host.querySelector('textarea[aria-label="Profile note"]') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "Asked about Tuesdays");
      note.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await click(door(host));
    await settle();
    const s = sheet()!;
    expect(s).toBeTruthy();
    expect(s.textContent).toContain("Times with room");
    expect(s.textContent).toContain("Tue, Nov 10");
    expect(s.textContent).toContain("10:30 AM");
    expect(s.querySelector('[data-testid="times-foot"]')?.textContent).toBe(OFFER_FOOT);
    // Times only: no client (hers or anyone's), no trainer, and never why.
    for (const name of ["Judy", "Ann", "Regular", "Sam", "Pat"]) expect(s.textContent).not.toContain(name);
    expect(s.textContent).not.toMatch(/cancel|isn't booked/i);
    // It never left the Wrap-up: the Profile note is still there as typed.
    expect((host.querySelector('textarea[aria-label="Profile note"]') as HTMLTextAreaElement).value).toBe("Asked about Tuesdays");
    await click(Array.from(s.querySelectorAll("button")).find((b) => b.textContent === "Done"));
    await settle();
    expect(sheet()).toBeNull();
    expect((host.querySelector('textarea[aria-label="Profile note"]') as HTMLTextAreaElement).value).toBe("Asked about Tuesdays");
  });
});

/*
 * Auto-renewal (Sep 25 2026): the post-session prompt reads the client's
 * renewal with her auto-renewal mark applied (renewals/auto-renew.ts,
 * renewalOf), so a trainer's "not on auto-renewal" on the profile stops the
 * before-the-charge prompt at once, before tonight's run rewrites the lists.
 */
describe("the renewal prompt follows the auto-renewal mark", () => {
  const warning = {
    version: 2,
    cycleKey: "9001",
    clientContractId: "9001",
    situation: "will-bank",
    paymentMode: "monthly",
    chargeDate: "2026-10-20",
    chargeDateSource: "mindbody",
    bankedAtCharge: 16,
    sessionsLeft: 30,
    chargeWarning: true,
    conversationDue: false,
    renewalOnBooks: null,
    autoRenews: true,
    autoRenewsFrom: "studio",
    autoRenewsInherited: { renews: true, from: "studio" },
    flags: [],
    dataGaps: [],
  } as any;

  function RenewalScreen({ who }: { who: Partial<Client> }) {
    return (
      <WrapUpScreen
        client={{ ...client, renewal: warning, ...who } as Client}
        session={session}
        logs={[]}
        lines={[]}
        journey={{ enough: false, pct: null, machines: 0, since: null, byGroup: [], standout: null } as any}
        schedules={[]}
        authTrainer={trainer}
        onEffort={vi.fn()}
        onLeave={vi.fn()}
        machines={[]}
      />
    );
  }

  it("asks before the charge while the package renews", async () => {
    const host = await mount(<RenewalScreen who={{}} />);
    expect(buttonByText(host, "Auto-renews with about 16 sessions banked. Talk about it today?")).toBeTruthy();
  });

  it("asks nothing once a trainer marked her not on auto-renewal for this contract", async () => {
    const autoRenewMark = { renews: false, contractId: "9001", setAt: "2026-09-25T14:00:00.000Z", setById: "uid-jane" };
    const host = await mount(<RenewalScreen who={{ autoRenewMark }} />);
    expect(host.textContent).not.toContain("Talk about it today?");
    expect(buttonByText(host, "Renewal conversation")).toBeTruthy();
  });

  it("still asks when the mark was made on another contract", async () => {
    const autoRenewMark = { renews: false, contractId: "8000", setAt: "2026-09-25T14:00:00.000Z" };
    const host = await mount(<RenewalScreen who={{ autoRenewMark }} />);
    expect(buttonByText(host, "Talk about it today?")).toBeTruthy();
  });
});
