// @vitest-environment jsdom
/**
 * OPENING JOURNEY, MOUNTED (the speed round, Oct 5 2026, R4).
 *
 * The boot used to read the trainer record, then every studio, then every
 * trainer, then every network, one after another, before the app opened.
 * These mount the hook with each read held open or failed and check:
 *
 *  - the app opens on the trainer record (from the iPad's copy when it has
 *    one), with the three lists still unknown, never empty;
 *  - a list that fails stays unknown; a record that can't be read is
 *    "failed" (Can't check), never "nobody";
 *  - the self-watch takes the server's copy when the person's access changed;
 *  - a copy that says switched off is not trusted to refuse anyone.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const h = vi.hoisted(() => ({
  authCallback: null as null | ((u: unknown) => void),
  currentUser: null as unknown,
  cacheDoc: null as null | (() => Promise<unknown>),
  serverDoc: null as null | (() => Promise<unknown>),
  cacheList: {} as Record<string, () => Promise<unknown>>,
  serverList: {} as Record<string, () => Promise<unknown>>,
  watch: null as null | ((s: unknown) => void),
  signOut: vi.fn(async () => {}),
}));

vi.mock("../firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return h.currentUser;
    },
  },
}));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void) => {
    h.authCallback = cb;
    return () => {};
  },
  signOut: h.signOut,
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  collection: (_db: unknown, path: string) => ({ path }),
  query: (target: unknown) => target,
  where: () => ({}),
  getDocFromCache: () => h.cacheDoc!(),
  getDoc: () => h.serverDoc!(),
  getDocsFromCache: (ref: { path: string }) => h.cacheList[ref.path](),
  getDocs: (ref: { path: string }) => (h.serverList[ref.path] ? h.serverList[ref.path]() : Promise.resolve(listSnap([], false))),
  onSnapshot: (_ref: unknown, next: (s: unknown) => void) => {
    h.watch = next;
    return () => {};
  },
  setDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
}));

function docSnap(id: string, data: Record<string, unknown> | null, fromCache = false) {
  return { id, exists: () => data !== null, data: () => data ?? undefined, metadata: { fromCache } };
}
function listSnap(docs: { id: string; data: Record<string, unknown> }[], fromCache: boolean) {
  return {
    empty: docs.length === 0,
    size: docs.length,
    metadata: { fromCache },
    docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
  };
}

import { useAuthInitialization } from "./useAuthInitialization";

const USER = {
  uid: "u1",
  email: "aj@example.com",
  providerData: [],
  getIdTokenResult: vi.fn(async () => ({ claims: { role: "LifeTransformer" } })),
};
const RECORD = { fullName: "Austin Jurgens", role: "LifeTransformer", primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"] };

let seen: ReturnType<typeof useAuthInitialization>;
function Probe() {
  seen = useAuthInitialization();
  return null;
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => {
  h.currentUser = USER;
  h.cacheList = {};
  h.serverList = {};
  h.watch = null;
  USER.getIdTokenResult.mockClear();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  localStorage.clear();
});

async function mountSignedIn() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<Probe />));
  await act(async () => {
    h.authCallback!(USER);
  });
}

describe("opening Journey", () => {
  it("opens on the iPad's copy of the record while the three lists are still being read", async () => {
    h.cacheDoc = async () => docSnap("u1", RECORD, true);
    h.serverDoc = () => new Promise(() => {});
    const pending = deferred<unknown>();
    for (const list of ["studios", "trainers", "networks"]) {
      h.cacheList[list] = () => pending.promise;
    }
    await mountSignedIn();
    expect(seen.isAuthReady).toBe(true);
    expect(seen.trainerLookup).toBe("done");
    expect(seen.authTrainer?.id).toBe("u1");
    expect(seen.studiosKnown).toBe(false);
    expect(seen.trainersKnown).toBe(false);
    expect(seen.networksKnown).toBe(false);
  });

  it("paints each list from the iPad's copy, and the server's answer (the listener) confirms it", async () => {
    h.cacheDoc = async () => docSnap("u1", RECORD, true);
    h.cacheList.studios = async () => listSnap([{ id: "westlake", data: { name: "Westlake" } }], true);
    h.cacheList.trainers = async () => listSnap([{ id: "u1", data: RECORD }], true);
    h.cacheList.networks = async () => listSnap([{ id: "n1", data: { studioIds: [] } }], true);
    await mountSignedIn();
    expect(seen.studiosKnown).toBe(true);
    expect(seen.studios.map((s) => s.id)).toEqual(["westlake"]);
    expect(seen.studiosConfirmed).toBe(false);
    await act(async () => seen.setStudios([{ id: "westlake", name: "Westlake" } as never, { id: "solon", name: "Solon" } as never], { fromCache: false }));
    expect(seen.studios.map((s) => s.id)).toEqual(["westlake", "solon"]);
    expect(seen.studiosConfirmed).toBe(true);
  });

  it("a list read that fails stays unknown, never empty, and an empty cache-only answer changes nothing", async () => {
    h.cacheDoc = async () => docSnap("u1", RECORD, true);
    h.cacheList.studios = async () => {
      throw new Error("not cached");
    };
    h.serverList.studios = async () => {
      throw new Error("offline");
    };
    h.cacheList.trainers = async () => listSnap([], true);
    h.serverList.trainers = async () => listSnap([], true);
    h.cacheList.networks = async () => listSnap([], true);
    await mountSignedIn();
    expect(seen.studiosKnown).toBe(false);
    expect(seen.trainersKnown).toBe(false);
    await act(async () => seen.setStudios([], { fromCache: true }));
    expect(seen.studiosKnown).toBe(false);
  });

  it("with nothing on the iPad it asks the server, and checks until the server answers", async () => {
    h.cacheDoc = async () => {
      throw new Error("not cached");
    };
    const server = deferred<unknown>();
    h.serverDoc = () => server.promise;
    for (const list of ["studios", "trainers", "networks"]) h.cacheList[list] = () => new Promise(() => {});
    await mountSignedIn();
    expect(seen.trainerLookup).toBe("checking");
    expect(seen.isAuthReady).toBe(false);
    await act(async () => server.resolve(docSnap("u1", RECORD)));
    expect(seen.trainerLookup).toBe("done");
    expect(seen.isAuthReady).toBe(true);
  });

  it("a record that can't be read is Can't check, never nobody", async () => {
    h.cacheDoc = async () => {
      throw new Error("not cached");
    };
    h.serverDoc = async () => {
      throw new Error("unavailable");
    };
    await mountSignedIn();
    expect(seen.trainerLookup).toBe("failed");
    expect(seen.authTrainer).toBeNull();
    expect(seen.isAuthReady).toBe(true);
  });

  it("a copy that says switched off is checked with the server, which may say otherwise", async () => {
    h.cacheDoc = async () => docSnap("u1", { ...RECORD, isActive: false }, true);
    h.serverDoc = async () => docSnap("u1", RECORD);
    for (const list of ["studios", "trainers", "networks"]) h.cacheList[list] = () => new Promise(() => {});
    await mountSignedIn();
    expect(h.signOut).not.toHaveBeenCalled();
    expect(seen.authTrainer?.id).toBe("u1");
  });

  it("the self-watch takes the server's copy when the person's access changed, and only then", async () => {
    h.cacheDoc = async () => docSnap("u1", RECORD, true);
    for (const list of ["studios", "trainers", "networks"]) h.cacheList[list] = () => new Promise(() => {});
    await mountSignedIn();
    const before = seen.authTrainer;
    await act(async () => h.watch!(docSnap("u1", { ...RECORD, photoURL: "new.png" })));
    expect(seen.authTrainer).toBe(before);
    await act(async () => h.watch!(docSnap("u1", { ...RECORD, role: "StudioLeader" })));
    expect(seen.authTrainer?.role).toBe("StudioLeader");
  });

  it("signed out: nothing to check", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(<Probe />));
    expect(seen.isAuthReady).toBe(false);
    await act(async () => h.authCallback!(null));
    expect(seen.isAuthReady).toBe(true);
    expect(seen.trainerLookup).toBe("idle");
  });
});
