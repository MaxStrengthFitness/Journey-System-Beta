import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEVICE_KEYS,
  DEVICE_KEY_PREFIXES,
  SESSION_HANDOFF_PREFIXES,
  SIGNED_OUT,
  clearPersonalStorage,
  clearSessionHandoffs,
  endPersonalSession,
  personChanged,
  personKey,
  type StorageLike,
} from "./sign-out";
import { forgetOnSignOut, forgetPersonalMemory } from "./memory";
import { DEFAULT_STUDIO_KEY, DEVICE_STUDIO_KEY } from "../../lib/default-studio";
import { LIST_SEEN_PREFIX, listSeen } from "../front-door/boot-lookup";
import { STORE_PREFIX as PROFILE_NAV_PREFIX } from "../client-profile/profile-nav";
import { PREFIX as SETUP_HINT_PREFIX } from "../machine-fit/ui/open-hint";
import { PLACE_KEY, RELOAD_KEY } from "../new-version/reload-once";
import { sessionDraftKey } from "../client-notes/session-draft";
import { clearPlannerIntent, peekPlannerIntent, requestPlanner } from "../relay/intent";
import { rememberMyStudioSection, rememberedMyStudioSection } from "../my-studio/section-memory";

/** Web Storage over a Map, in insertion order like the real thing. */
class FakeStorage implements StorageLike {
  private map = new Map<string, string>();
  constructor(entries: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(entries)) this.map.set(k, v);
  }
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
  keys() {
    return [...this.map.keys()].sort();
  }
}

/** What a leader's iPad holds in local storage mid-shift. */
const leadersLocal = () =>
  new FakeStorage({
    max_strength_active_studio_id: "westlake",
    max_strength_trainer_id: "lead-1",
    max_strength_authenticated: "true",
    [DEFAULT_STUDIO_KEY]: "westlake",
    msf_live_session: "session-9",
  });

afterEach(() => {
  vi.restoreAllMocks();
  clearPlannerIntent(peekPlannerIntent());
  rememberMyStudioSection("relay");
});

describe("clearPersonalStorage — the iPad keeps its studio, nothing else", () => {
  it("keeps the pinned studio and clears the rest", () => {
    const local = leadersLocal();
    clearPersonalStorage(local);
    expect(local.keys()).toEqual([DEFAULT_STUDIO_KEY]);
    expect(local.getItem(DEFAULT_STUDIO_KEY)).toBe("westlake");
  });

  it("clears everything when the iPad is not pinned, and does not invent a pin", () => {
    const local = leadersLocal();
    local.removeItem(DEFAULT_STUDIO_KEY);
    clearPersonalStorage(local);
    expect(local.length).toBe(0);
  });

  it("the pinned studio and the studio this iPad last opened are the only device keys", () => {
    expect(DEVICE_KEYS).toEqual([DEFAULT_STUDIO_KEY, DEVICE_STUDIO_KEY]);
  });

  it("keeps the boot's list-seen flags: they describe the iPad's Firestore copy, which a sign-out keeps", () => {
    const local = leadersLocal();
    local.setItem(LIST_SEEN_PREFIX + "studios", "1");
    local.setItem(LIST_SEEN_PREFIX + "trainers", "1");
    local.setItem(LIST_SEEN_PREFIX + "networks", "1");
    clearPersonalStorage(local);
    expect(listSeen(local, "studios")).toBe(true);
    expect(listSeen(local, "trainers")).toBe(true);
    expect(listSeen(local, "networks")).toBe(true);
    expect(local.getItem("max_strength_trainer_id")).toBeNull();
    expect(DEVICE_KEY_PREFIXES).toEqual([LIST_SEEN_PREFIX]);
  });

  it("a storage that throws is survived, not fatal", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = new FakeStorage();
    broken.clear = () => {
      throw new Error("SecurityError");
    };
    expect(() => clearPersonalStorage(broken)).not.toThrow();
    expect(() => clearPersonalStorage(null)).not.toThrow();
  });
});

describe("clearSessionHandoffs — one-shot handoffs go, note drafts stay", () => {
  it("names the profile's opening place, machine fit's Setup hint and where a new version returns to", () => {
    expect(SESSION_HANDOFF_PREFIXES).toEqual([PROFILE_NAV_PREFIX, SETUP_HINT_PREFIX, PLACE_KEY]);
  });

  it("removes every handoff, for every client, and keeps a note a trainer started mid-set", () => {
    const session = new FakeStorage({
      [PROFILE_NAV_PREFIX + "judy"]: JSON.stringify({ tab: "programming", view: "setup" }),
      [SETUP_HINT_PREFIX + "judy"]: "check",
      [PROFILE_NAV_PREFIX + "marcus"]: JSON.stringify({ tab: "journey" }),
      [PLACE_KEY]: JSON.stringify({ view: "profile", clientId: "judy", uid: "u1", at: 1 }),
      [RELOAD_KEY]: JSON.stringify({ target: "b2", at: 1 }),
      [sessionDraftKey("session-9")]: JSON.stringify({ body: "Left knee sore on the leg press" }),
      unrelated: "x",
    });
    clearSessionHandoffs(session);
    // Removing while walking by index would have skipped every second one.
    // The new-version loop guard belongs to the iPad, so it stays.
    expect(session.keys()).toEqual([RELOAD_KEY, sessionDraftKey("session-9"), "unrelated"].sort());
  });

  it("does nothing to an empty or missing store", () => {
    const session = new FakeStorage();
    clearSessionHandoffs(session);
    expect(session.length).toBe(0);
    expect(() => clearSessionHandoffs(undefined)).not.toThrow();
  });
});

describe("forgetPersonalMemory — the module memories registered with it", () => {
  it("runs every reset, and one that throws does not stop the rest", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ran: string[] = [];
    const offA = forgetOnSignOut(() => {
      throw new Error("broken module");
    });
    const offB = forgetOnSignOut(() => ran.push("b"));
    forgetPersonalMemory();
    expect(ran).toEqual(["b"]);
    offA();
    offB();
    forgetPersonalMemory();
    expect(ran).toEqual(["b"]);
  });

  it("forgets a Planner request left waiting — the last person's new note about a client", () => {
    requestPlanner({ kind: "new-note", client: { id: "judy", name: "Judy" } });
    expect(peekPlannerIntent()).not.toBeNull();
    forgetPersonalMemory();
    expect(peekPlannerIntent()).toBeNull();
  });

  it("sends My Studio back to Relay — a leader's Team section is not the next trainer's", () => {
    rememberMyStudioSection("team");
    forgetPersonalMemory();
    expect(rememberedMyStudioSection()).toBe("relay");
  });
});

describe("endPersonalSession — all three, and safe to run twice", () => {
  it("clears storage, handoffs and memory together", () => {
    const local = leadersLocal();
    const session = new FakeStorage({
      [SETUP_HINT_PREFIX + "judy"]: "check",
      [sessionDraftKey("s")]: "{}",
    });
    rememberMyStudioSection("studio");
    endPersonalSession({ local, session });
    endPersonalSession({ local, session });
    expect(local.keys()).toEqual([DEFAULT_STUDIO_KEY]);
    expect(session.keys()).toEqual([sessionDraftKey("s")]);
    expect(rememberedMyStudioSection()).toBe("relay");
  });
});

describe("personKey — who the signed-in tree belongs to", () => {
  const user = { uid: "u-1" };
  const trainer = { id: "u-1" };

  it("is the uid once the person is signed in AND known", () => {
    expect(personKey(user, trainer)).toBe("u-1");
  });

  it("is signed-out with nobody signed in", () => {
    expect(personKey(null, null)).toBe(SIGNED_OUT);
    expect(personKey(undefined, trainer)).toBe(SIGNED_OUT);
  });

  it("stays signed-out while the profile loads, or an outside account is turned away", () => {
    expect(personKey(user, null)).toBe(SIGNED_OUT);
    expect(personKey({ uid: null }, trainer)).toBe(SIGNED_OUT);
  });
});

describe("personChanged — when the last person's leftovers must go", () => {
  it("not on a reload: Firebase has not answered yet", () => {
    expect(personChanged(undefined, "u-1")).toBe(false);
    expect(personChanged(undefined, null)).toBe(false);
  });

  it("not on a sign-in after a sign-out: that sign-out already forgot", () => {
    expect(personChanged(null, "u-2")).toBe(false);
    expect(personChanged(null, null)).toBe(false);
  });

  it("on a sign-out, and on one person replacing another", () => {
    expect(personChanged("u-1", null)).toBe(true);
    expect(personChanged("u-1", "u-2")).toBe(true);
  });

  it("not when the same person is reported again", () => {
    expect(personChanged("u-1", "u-1")).toBe(false);
  });
});
