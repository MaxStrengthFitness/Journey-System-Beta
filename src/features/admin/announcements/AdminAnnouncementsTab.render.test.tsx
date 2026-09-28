// @vitest-environment jsdom
/**
 * OPERATIONS → ANNOUNCEMENTS POSTS AS THE SIGNED-IN PERSON (the voice review
 * notes' audit, Sep 28 2026).
 *
 * firestore.rules refuses a notice whose `authorId` is not the Auth uid, and
 * on older accounts the trainer document's id is not the uid (CLAUDE.md,
 * "Use the Auth uid, not authTrainer.id"). The tab passed `authTrainer.id`,
 * so every publish from such an account failed with "Could not publish";
 * My Studio → Studio already used the uid. Mounted for real, because the
 * author is decided where the tab builds the composer, not in the pure
 * audience module.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "uid-faramir" } },
}));

const added: Array<Record<string, unknown>> = [];
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  query: (q: unknown) => q,
  onSnapshot: (_q: unknown, next: (s: unknown) => void) => {
    const t = setTimeout(() => next({ docs: [] }), 0);
    return () => clearTimeout(t);
  },
  addDoc: async (_ref: unknown, data: Record<string, unknown>) => {
    added.push(data);
    return { id: "new" };
  },
  updateDoc: async () => {},
  serverTimestamp: () => "NOW",
}));

vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "westlake" }),
}));

vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }),
}));

// The Learning picker reads Learning's own lists; not what is under test.
vi.mock("./LearningLinkPicker", () => ({ LearningLinkPicker: () => null }));

const { AdminAnnouncementsTab } = await import("./AdminAnnouncementsTab");

// An older account: the trainer document's id is not the sign-in uid.
const faramir = { id: "t-faramir-doc", authUid: "uid-faramir", fullName: "Faramir Hurin", role: "StudioLeader" } as never;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  await act(async () => {
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
  added.length = 0;
});

describe("Operations → Announcements", () => {
  it("publishes with the Auth uid as the author, never the trainer document's id", async () => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <AdminAnnouncementsTab
          authTrainer={faramir}
          studios={[{ id: "westlake", name: "Westlake" } as never]}
          networks={[]}
          scopes={["studio"]}
        />,
      );
    });
    await type(host.querySelector<HTMLInputElement>("#ann-title")!, "Deep clean Saturday");
    await type(host.querySelector<HTMLInputElement>("#ann-short")!, "Pads off the Leg Press after close.");
    await type(host.querySelector<HTMLSelectElement>("#ann-studio")!, "westlake");
    const publish = [...host.querySelectorAll("button")].find((b) => /Publish/.test(b.textContent ?? ""));
    expect(publish).toBeTruthy();
    await act(async () => {
      publish!.click();
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(added).toHaveLength(1);
    expect(added[0].authorId).toBe("uid-faramir");
    expect(added[0].authorName).toBe("Faramir Hurin");
  });
});
