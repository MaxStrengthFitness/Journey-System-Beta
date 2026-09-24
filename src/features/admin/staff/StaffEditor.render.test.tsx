// @vitest-environment jsdom
/**
 * THE STAFF EDITOR MOUNTS for a request with no name, and a studio-access
 * request never offers "Approve and create the account". That button writes
 * a whole trainers/{uid}, and the person behind a studio-access request
 * already has one, so approving it would replace their account.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));

const writes: Array<{ path: string; data: Record<string, unknown> }> = [];

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    doc: ref,
    arrayUnion: (...v: unknown[]) => v,
    arrayRemove: (...v: unknown[]) => v,
    setDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: target.path, data });
    },
    updateDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: target.path, data });
    },
  };
});
vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));

import type { Studio } from "../../../types";
import { StaffEditor } from "./StaffEditor";
import { NAME_NOT_GIVEN, buildStaffRoster, type AccessRequest, type StaffRow } from "./roster";

const studios = [
  { id: "westlake", name: "Westlake" },
  { id: "solon", name: "Solon" },
] as Studio[];

const rowFor = (req: AccessRequest): StaffRow =>
  buildStaffRoster({ trainers: [], mindbodyStaff: [], requests: [req], studioId: "westlake" })[0];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(row: StaffRow) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <StaffEditor
          row={row}
          studios={studios}
          activeStudioId="westlake"
          assignableRoles={["LifeTransformer", "HeadTrainer", "StudioLeader"]}
          canChangeRole
          lockHomeStudio
          grantStudioId="westlake"
          onDone={() => {}}
        />
      </StrictMode>,
    );
  });
  return host;
}

const buttons = (el: Element) => [...el.querySelectorAll("button")].map((b) => b.textContent ?? "");

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  writes.length = 0;
});

describe("StaffEditor", () => {
  it("mounts a nameless studio-access request, says what it is, and offers no approval", async () => {
    const el = await mount(
      rowFor({ id: "r1", type: "studio_access", trainerId: "uid-x", studioId: "westlake", status: "Pending" }),
    );
    expect(el.textContent).toContain(NAME_NOT_GIVEN);
    expect(el.textContent).toContain("already has an account");
    expect(el.textContent).toContain("asked to work at Westlake");
    expect(buttons(el).some((b) => b.includes("Approve and create the account"))).toBe(false);
    expect(writes).toEqual([]);
  });

  it("still offers approval for a sign-up", async () => {
    const el = await mount(
      rowFor({ id: "r2", fullName: "Jeff Tomaszewski", email: "jeff@example.com", status: "Pending", userId: "uid-new" }),
    );
    expect(el.textContent).toContain("Jeff Tomaszewski");
    expect(el.textContent).not.toContain("already has an account");
    expect(buttons(el).some((b) => b.includes("Approve and create the account"))).toBe(true);
  });
});
