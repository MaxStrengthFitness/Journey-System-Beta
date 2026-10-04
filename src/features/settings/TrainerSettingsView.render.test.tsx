// @vitest-environment jsdom
/**
 * TRAINER SETTINGS, mounted (voice-review round, Sep 27 2026): the role by
 * its name, the Operations door for exactly the people the app lets in, in
 * Operations mode, and no machine count that was never the studio's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ROLE_LABELS, type Studio, type Trainer } from "../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const feedback = vi.hoisted(() => ({
  open: vi.fn(),
  reports: [] as { id: string; description: string; status: string }[],
  error: null as string | null,
}));
vi.mock("../feedback", () => ({
  useFeedback: () => ({ open: feedback.open }),
  useMyFeedback: () => ({
    error: feedback.error,
    reports: feedback.reports,
    counts: {
      total: feedback.reports.length,
      open: feedback.reports.filter((r) => r.status !== "fixed" && r.status !== "wont-fix").length,
      resolved: feedback.reports.filter((r) => r.status === "fixed" || r.status === "wont-fix").length,
    },
  }),
  FEEDBACK_KIND_SHORT: { bug: "Bug", ui: "Looks wrong", idea: "Idea" },
}));

import { TrainerSettingsView } from "./TrainerSettingsView";

const studios = [
  { id: "solon", name: "Solon" },
  { id: "westlake", name: "Westlake" },
] as unknown as Studio[];
const person = (over: Partial<Trainer>): Trainer =>
  ({ id: "t1", fullName: "Sara Kim", initials: "SK", role: "LifeTransformer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"], activeGuestStudioIds: [], ...over }) as Trainer;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  feedback.open.mockReset();
  feedback.reports = [];
  feedback.error = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function mount(me: Trainer, extra: { onOpenOperations?: () => void } = {}) {
  const trainers = [me, person({ id: "t2", fullName: "Pat Doe" }), person({ id: "t3", fullName: "Far Away", primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake"] })];
  await act(async () => {
    root.render(<TrainerSettingsView authTrainer={me} studios={studios} trainers={trainers} activeStudioId="solon" onLogout={() => {}} setView={() => {}} {...extra} />);
  });
}

const fact = (label: string) =>
  [...host.querySelectorAll(".stg-fact")].find((f) => f.querySelector("dt")?.textContent === label)?.querySelector("dd")?.textContent;

describe("Trainer Settings", () => {
  it("names the role, never its key", async () => {
    // Whatever ROLE_LABELS calls it this week; never the key itself.
    await mount(person({ role: "HeadTrainer" }));
    expect(fact("Role")).toBe(ROLE_LABELS.HeadTrainer);
    expect(fact("Role")).not.toBe("HeadTrainer");
    await mount(person({ role: "StudioLeader" }));
    expect(fact("Role")).toBe("Studio Leader");
    await mount(person({ role: "LifeTransformer" }));
    expect(fact("Role")).toBe("Life Transformer");
  });

  it("counts the people on the team, not the catalog's machines", async () => {
    await mount(person({}));
    const studio = host.querySelector("[aria-label='My studio — Solon']");
    expect(studio?.textContent).toContain("2 people on the team");
    expect(studio?.textContent).not.toMatch(/machines ·/);
  });

  it("offers Operations to a leader, in Operations mode, and not to a trainer", async () => {
    const onOpenOperations = vi.fn();
    await mount(person({ role: "StudioLeader" }), { onOpenOperations });
    const door = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes("Open Operations"));
    expect(door).toBeTruthy();
    // All nine tabs, the Delight queue included.
    expect(host.querySelector("[aria-label='Operations']")?.textContent).toContain(
      "The Overview, renewals and the Delight queue, the floor, staff and roles, insights, announcements, Mindbody and the studio's data.",
    );
    await act(async () => door!.click());
    expect(onOpenOperations).toHaveBeenCalledTimes(1);

    await mount(person({ role: "LifeTransformer" }), { onOpenOperations });
    expect([...host.querySelectorAll("button")].some((b) => b.textContent?.includes("Open Operations"))).toBe(false);
  });

  it("leaves out a studio it cannot name, never a dash (AJ's walk, Oct 3 2026)", async () => {
    await mount(person({ accessibleStudioIds: ["solon", "demo-studio", "westlake"] }));
    expect(fact("Also works at")).toBe("Westlake");
  });

  it("shows no screen line outside the Home Screen app", async () => {
    await mount(person({}));
    expect(fact("This screen")).toBeUndefined();
  });

  it("says whether Mindbody is linked, and who links it", async () => {
    await mount(person({ mindbodyStaffId: "100000123" }));
    expect(fact("Mindbody")).toBe("Linked · 100000123");
    await mount(person({}));
    expect(fact("Mindbody")).toBe("Not linked — a studio leader links you on My Studio → Team");
  });

  it("shows what happened to the trainer's reports, in the words Admins uses", async () => {
    feedback.reports = [
      { id: "f1", description: "The grid froze", status: "fixed" },
      { id: "f2", description: "Button too small", status: "investigating" },
      { id: "f3", description: "A second theme", status: "wont-fix" },
    ];
    await mount(person({}));
    // The count too, in Admins' words (Oct 2 2026): never "open" and "closed".
    expect(host.textContent).toContain("Your reports · 1 looking into it · 1 fixed · 1 won't fix");
    const statuses = [...host.querySelectorAll(".stg-status")].map((s) => [s.textContent, s.className]);
    expect(statuses).toEqual([
      ["Fixed", "stg-status stg-status--ok"],
      ["Looking into it", "stg-status stg-status--open"],
      ["Won't fix", "stg-status stg-status--closed"],
    ]);
    await act(async () => (host.querySelector(".stg-kind") as HTMLButtonElement).click());
    expect(feedback.open).toHaveBeenCalledWith("bug");
  });

  it("shows an administrator's reply under the report, with who and when", async () => {
    feedback.reports = [
      {
        id: "f1",
        description: "Can't find where to add a machine photo",
        status: "fixed",
        reply: { text: "It's in My Studio → Machines → the machine → Photo.", by: { uid: "adm", name: "Faramir" }, at: new Date("2026-09-28T14:05:00Z") },
      } as { id: string; description: string; status: string },
      { id: "f2", description: "New one", status: "open" },
    ];
    await mount(person({}));
    const replies = [...host.querySelectorAll(".stg-reply")];
    expect(replies).toHaveLength(1);
    expect(replies[0].querySelector(".stg-reply__who")?.textContent).toBe("Faramir replied on Mon, Sep 28");
    expect(replies[0].querySelector(".stg-reply__text")?.textContent).toBe("It's in My Studio → Machines → the machine → Photo.");
    // A new report reads "New".
    expect([...host.querySelectorAll(".stg-status")].map((s) => s.textContent)).toEqual(["Fixed", "New"]);
  });

  it("shows a whole report, never two lines of it", async () => {
    const long = "The grid froze after the third machine. ".repeat(8).trim();
    feedback.reports = [{ id: "f1", description: long, status: "open" }];
    await mount(person({}));
    expect(host.querySelector(".stg-report__text")?.textContent).toBe(long);
  });

  it("says it couldn't load the reports, rather than hiding them as if there were none", async () => {
    feedback.error = "Couldn't load your reports.";
    await mount(person({}));
    const problem = host.querySelector(".stg-problem");
    expect(problem?.textContent).toBe("Couldn't load your reports. Try again in a moment.");
    expect(problem?.getAttribute("role")).toBe("status");
    expect(host.textContent).not.toContain("Your reports ·");
    // The ways to file one are still there.
    expect(host.querySelectorAll(".stg-kind")).toHaveLength(3);
  });
});
