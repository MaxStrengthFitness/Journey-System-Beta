// @vitest-environment jsdom
/**
 * THE MEMBERSHIP SECTION, MOUNTED (client codex, phase 16; it was the
 * contract panel's test, ContractPanel.render.test.tsx, moved with it).
 *
 * The section works out its words during render (the tier, what is left, the
 * timeline, the clearance) and writes through the record's one form, so only
 * a mount proves it — here on the codex's real form (`useRecordForm`), the
 * one the Save bar saves:
 *
 *   - what she is on, what is left and what she has had, from a client
 *     document; an on-hand count is never called "left";
 *   - the tier lock goes through the form, named with the Auth uid; a saved
 *     lock shows Mindbody's reading beside it and can be taken off;
 *   - only studios in the client's realm are offered for cross-training, and
 *     a toggle is staged on the form;
 *   - a lapsed or ended package is a plum edge, never crimson; the renewal
 *     conversation is brand blue, never hero orange;
 *   - the years before Journey are the first, dashed tile;
 *   - a reader who may not edit gets every fact and no Lock, no toggle, no
 *     Edit and no Migration Hub;
 *   - the fine print holds no second Mindbody ID.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, Studio } from "../../types";
import type { RenewalSnapshot } from "../renewals/types";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-aj" } } }));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {}, info: () => {}, warning: () => {}, toast: () => {} }),
}));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "westlake", activeStudio: null }),
}));

import { MembershipSection, type MembershipSectionProps } from "./MembershipSection";
import { useRecordForm, type RecordForm } from "../client-codex/useRecordForm";
import { pronounsOf } from "../client-codex/kit";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HERE = dirname(fileURLToPath(import.meta.url));
const TODAY = "2026-09-24";
const NOW = new Date(2026, 8, 24, 12);

const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const studios = [
  { id: "solon", name: "Solon" },
  { id: "westlake", name: "Westlake" },
] as Studio[];

const client = (over: Partial<Client> = {}): Client =>
  ({
    id: "100",
    mindbodyClientId: "100",
    firstName: "Judith",
    lastName: "Daus",
    gender: "Female",
    homeStudioId: "solon",
    height: "",
    isActive: true,
    remainingSessions: 0,
    mindbodyContracts: {
      k: {
        clientContractId: "k",
        status: "Active",
        contractName: "96 Sessions - 2X Week",
        startDate: ts("2026-01-05T00:00:00Z"),
        endDate: ts("2027-01-01T00:00:00Z"),
        autopayStatus: "Active",
        agreementDate: ts("2026-01-04T00:00:00Z"),
        soldByStaffName: "Pat Front",
      },
    },
    mindbodyServices: { s: { serviceId: "s", name: "Session Comp", remaining: 2, count: 2 } },
    ...over,
  }) as unknown as Client;

const renewal = (over: Partial<RenewalSnapshot> = {}): RenewalSnapshot =>
  ({
    situation: "on-track",
    packageLabel: "Committed · 12 months",
    sessionsLeft: 95,
    sessionsLeftSource: "mindbody",
    sessionsOnHand: 7,
    paymentsLeft: 11,
    chargeDate: "2027-01-01",
    chargeDateSource: "mindbody",
    autoRenews: true,
    paymentMode: "monthly",
    pacePerWeek: 2,
    conversationDue: false,
    renewalOnBooks: null,
    dataGaps: [],
    focusDate: "2027-01-01",
    ...over,
  }) as unknown as RenewalSnapshot;

type Probe = { form?: RecordForm };

function Harness({
  c,
  probe = {},
  canEdit = true,
  studioList = studios,
  author = { id: "uid-aj", name: "AJ" },
  coverage = "complete",
  onOpenMigrationHub,
  priorHistoryDoor,
}: {
  c: Client;
  probe?: Probe;
  canEdit?: boolean;
  studioList?: Studio[];
  author?: MembershipSectionProps["author"];
  coverage?: MembershipSectionProps["coverage"];
  onOpenMigrationHub?: () => void;
  priorHistoryDoor?: MembershipSectionProps["priorHistoryDoor"];
}) {
  const form = useRecordForm({ client: c, trainerId: "t-aj", canEdit, homeStudioName: "Solon" });
  probe.form = form;
  return (
    <div className="cx">
      <div className="cx-pages">
        <MembershipSection
          client={c}
          form={form}
          studios={studioList}
          author={author}
          coverage={coverage}
          canEdit={canEdit}
          pronouns={pronounsOf(c)}
          today={TODAY}
          onOpenMigrationHub={onOpenMigrationHub}
          priorHistoryDoor={priorHistoryDoor}
          now={NOW}
        />
      </div>
    </div>
  );
}

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

const buttons = (host: HTMLElement) => Array.from(host.querySelectorAll("button"));
const buttonByText = (host: HTMLElement, text: string) => buttons(host).find((b) => b.textContent?.trim().startsWith(text));

function typeInto(el: Element | null, value: string) {
  if (!el) throw new Error("field not found");
  return act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function fieldByLabel(host: HTMLElement, text: string): HTMLInputElement | null {
  const label = Array.from(host.querySelectorAll("label")).find((l) => l.textContent?.trim() === text);
  const id = label?.getAttribute("for");
  return id ? (host.querySelector(`[id="${id}"]`) as HTMLInputElement | null) : null;
}

const pkg = (host: HTMLElement) => host.querySelector<HTMLElement>(".cadm-pkg")!;

describe("MembershipSection — the package", () => {
  it("answers what she is on, what is left and what she has had", async () => {
    const host = await mount(<Harness c={client()} />);
    const text = host.textContent || "";
    // The tier: the package's name, then its terms, with where that came from.
    expect(pkg(host).querySelector('[aria-label="Tier: Committed · 12 months · paying every 4 weeks"]')).not.toBeNull();
    expect(pkg(host).querySelector(".cx-big")?.textContent).toBe("Committed");
    expect(text).toContain("12 months · paying every 4 weeks");
    // Where the tier came from, once: the contract it was read from.
    expect(text).toContain("Read from the Mindbody contract “96 Sessions - 2X Week”");
    // No renewal yet: says so rather than inventing, and what she holds is
    // "on hand", never "left".
    expect(text).toContain("Renewal not worked out yet");
    expect(text).toContain("2 on hand");
    expect(text).not.toContain("2 left");
    expect(text).toContain("Contract ends Jan 1, 2027");
    // The fine print: sessions on hand, the contract's number, who sold it.
    expect(text).toContain("Session Comp: 2 of 2");
    expect(text).toContain("#k · signed Jan 4, 2026 · sold by Pat Front · autopay active");
    // Visiting Westlake without approval.
    expect(text).toContain("NOT yet cleared to train at Westlake");
  });

  it("reads the renewal as it is: sessions left, when it renews, the pace", async () => {
    const host = await mount(<Harness c={client({ renewal: renewal() })} />);
    const text = pkg(host).textContent || "";
    expect(text).toContain("95 left");
    expect(text).toContain("sessions left");
    expect(text).not.toContain("(estimated)");
    expect(text).toContain("11 payments to go");
    expect(text).toContain("Renews Jan 1, 2027");
    expect(text).toContain("Worked out each night · Operations → Renewals");
    expect(text).toContain("Comes 2× a week");
    expect(pkg(host).getAttribute("data-tone")).toBe("ok");
    // On track, the two columns say it all: no second line repeating them.
    expect(text).not.toContain("auto-renews");
  });

  it("says what the columns cannot: sessions banked when billing ends", async () => {
    const host = await mount(<Harness c={client({ renewal: renewal({ situation: "will-bank", bankedAtCharge: 6 }) })} />);
    expect(pkg(host).textContent).toContain("Auto-renews Jan 1, 2027 with about 6 sessions still banked");
    expect(pkg(host).getAttribute("data-tone")).toBe("warn");
  });

  it("says an estimate is one", async () => {
    const host = await mount(<Harness c={client({ renewal: renewal({ sessionsLeftSource: "estimate", autoRenews: false }) })} />);
    const text = pkg(host).textContent || "";
    expect(text).toContain("sessions left (estimated)");
    expect(text).toContain("Billing ends Jan 1, 2027");
  });

  it("dates a package paid in full by when it runs out, and says an unknown renewal's gap once", async () => {
    const pif = client({
      mindbodyContracts: {},
      mindbodyServices: { p: { serviceId: "p", name: "96 PIF", remaining: 60, count: 96 } },
      renewal: renewal({
        paymentMode: "prepaid",
        chargeDate: null,
        chargeDateSource: null,
        autoRenews: null,
        paymentsLeft: 0,
        sessionsLeft: 60,
        runOutDate: "2027-04-01",
      }),
    } as unknown as Partial<Client>);
    let host = await mount(<Harness c={pif} />);
    expect(pkg(host).textContent).toContain("60 left");
    expect(pkg(host).textContent).toContain("Runs out around Apr 1, 2027 (estimated)");
    expect(pkg(host).textContent).not.toContain("No end date on file");

    const gap = "Mindbody shows no package for this client.";
    host = await mount(
      <Harness c={client({ renewal: renewal({ situation: "unknown", sessionsLeft: null, sessionsLeftSource: null, dataGaps: [gap] }) })} />,
    );
    expect((pkg(host).textContent ?? "").split(gap).length - 1).toBe(1);
  });

  it("draws a lapsed or ended package plum, never crimson", async () => {
    for (const situation of ["lapsed", "ended"] as const) {
      const host = await mount(<Harness c={client({ renewal: renewal({ situation, sessionsLeft: 0 }) })} />);
      expect(pkg(host).getAttribute("data-tone"), situation).toBe("warn");
      expect(host.querySelector('[data-tone="alert"]'), situation).toBeNull();
    }
  });

  it("asks for the renewal conversation in brand blue, never hero orange", async () => {
    const host = await mount(<Harness c={client({ renewal: renewal({ conversationDue: true, sessionsLeft: 8 }) })} />);
    const due = host.querySelector(".cadm-due");
    expect(due?.textContent).toContain("Time for the renewal conversation");
    expect(Array.from(host.querySelectorAll("[class]")).some((el) => /hero/.test(el.getAttribute("class") || ""))).toBe(false);
    const css = readFileSync(join(HERE, "client-admin.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/--(?:cx|eq)-hero/);
    expect(css).not.toMatch(/--(?:cx|eq)-alert/);
    expect(css).toMatch(/\.cadm-due\s*\{[^}]*--cx-live-fill/);
  });

  it("locks the tier through the one form, named with the Auth uid", async () => {
    const probe: Probe = {};
    const host = await mount(<Harness c={client()} probe={probe} />);
    await click(buttonByText(host, "Lock the tier"));
    // Each choice names the package it stands for.
    const choice = buttonByText(host, "18 mo · paid in full")!;
    expect(choice.textContent).toContain("Life Transformed");
    await click(choice);
    expect(probe.form!.formData.contractTierOverride).toEqual(
      expect.objectContaining({ term: 18, payment: "pif", setByName: "AJ", setById: "uid-aj" }),
    );
    expect([...probe.form!.dirty]).toEqual(["contractTierOverride"]);
    // The staged lock shows at once, marked unsaved, with Mindbody's reading beside it.
    expect(pkg(host).querySelector(".cx-big")?.textContent).toBe("Life Transformed");
    expect(pkg(host).textContent).toContain("Unsaved");
    expect(pkg(host).textContent).toContain("Mindbody reads as: Committed · 12 months · paying every 4 weeks");
    // The picker closed; the button now changes the lock.
    expect(buttonByText(host, "Change lock")).toBeDefined();
  });

  it("shows a saved lock with Mindbody's reading, and Use Mindbody's takes it off", async () => {
    const probe: Probe = {};
    const locked = client({
      contractTierOverride: { term: 18, payment: "pif", setAt: "2026-09-15T00:00:00Z", setByName: "AJ" },
    } as Partial<Client>);
    const host = await mount(<Harness c={locked} probe={probe} />);
    const text = host.textContent || "";
    expect(pkg(host).querySelector('[aria-label="Tier: Life Transformed · 18 months · paid in full"]')).not.toBeNull();
    expect(text).toContain("Locked by AJ");
    expect(text).toContain("Mindbody reads as: Committed · 12 months · paying every 4 weeks");
    await click(buttonByText(host, "Use Mindbody's"));
    expect(probe.form!.formData.contractTierOverride).toBeNull();
    expect([...probe.form!.dirty]).toEqual(["contractTierOverride"]);
    expect(pkg(host).querySelector(".cx-big")?.textContent).toBe("Committed");
  });
});

describe("MembershipSection — the contract history", () => {
  it("lists the terms oldest first, after the years before Journey as a dashed tile", async () => {
    const c = client({
      priorHistory: { sessions: 412, from: "2019-03-01", through: "2025-12-31", source: "filemaker", importedCount: 0 },
      mindbodyContracts: {
        old: {
          clientContractId: "old",
          status: "Active",
          contractName: "48 Sessions - 2X Week",
          startDate: ts("2025-06-01T00:00:00Z"),
          endDate: ts("2025-12-01T00:00:00Z"),
        },
        k: {
          clientContractId: "k",
          status: "Active",
          contractName: "96 Sessions - 2X Week",
          startDate: ts("2026-01-05T00:00:00Z"),
          endDate: ts("2027-01-01T00:00:00Z"),
        },
      },
    } as Partial<Client>);
    const host = await mount(<Harness c={c} coverage="partial" />);
    const tiles = Array.from(host.querySelectorAll<HTMLElement>(".cadm-tl__tile"));
    expect(tiles.map((t) => t.querySelector(".cadm-tl__when")?.textContent)).toEqual([
      "Mar 2019 – Dec 2025",
      "Jun 2025 – Dec 2025",
      "Jan 2026 – Jan 2027",
    ]);
    expect(tiles[0].hasAttribute("data-era")).toBe(true);
    expect(tiles[0].textContent).toContain("412 sessions in FileMaker");
    expect(tiles.slice(1).every((t) => !t.hasAttribute("data-era"))).toBe(true);
    expect(tiles[1].textContent).toContain("Ended");
    expect(tiles[2].textContent).toContain("Active");
    expect(tiles[2].textContent).toContain("12 mo");
  });

  it("says when there is nothing on file, and where Sync is", async () => {
    const host = await mount(<Harness c={client({ mindbodyContracts: {}, mindbodyServices: {} } as Partial<Client>)} />);
    expect(host.textContent).toContain("No contracts or paid-in-full packages on file — Sync at the top of the profile pulls them.");
  });
});

/*
 * Sessions before Journey (landing, Sep 24 2026): AJ asked for the door
 * from the header's session count AND from Account. The profile hands both
 * the SAME door (priorHistoryDoorText's words, canEditPriorHistory's rule,
 * its one editor); the package card draws it under the contract history.
 */
describe("MembershipSection — the door to Sessions before Journey", () => {
  const door = (host: HTMLElement) => pkg(host).querySelector<HTMLButtonElement>('[data-action="prior-history"]');

  it("draws the header's door under the contract history, and opens the profile's editor", async () => {
    let opened = 0;
    const c = client({
      priorHistory: { sessions: 412, from: "2019-03-01", through: "2025-12-31", source: "filemaker", importedCount: 0 },
    } as Partial<Client>);
    const host = await mount(
      <Harness
        c={c}
        coverage="partial"
        priorHistoryDoor={{ text: "412 before Journey · FileMaker", canEdit: true, onOpen: () => (opened += 1) }}
      />,
    );
    const button = door(host)!;
    expect(button.textContent).toBe("412 before Journey · FileMaker");
    expect(button.getAttribute("aria-label")).toBe(
      "Sessions before Journey: 412 before Journey · FileMaker. Open to edit.",
    );
    // After the tiles, the first of which is the years before Journey.
    const timeline = pkg(host).querySelector('[data-testid="contract-timeline"]')!;
    expect(timeline.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The kit's one button, 40px or taller.
    expect(button.classList.contains("cx-btn")).toBe(true);
    await click(button);
    expect(opened).toBe(1);
  });

  it("offers a reader the rules refuse the same door, to read", async () => {
    const host = await mount(
      <Harness c={client()} canEdit={false} priorHistoryDoor={{ text: "None before Journey", canEdit: false, onOpen: () => {} }} />,
    );
    expect(door(host)?.getAttribute("aria-label")).toBe("Sessions before Journey: None before Journey. Open to read.");
  });

  it("draws no door when the profile hands none (nothing recorded, and this reader may not add it)", async () => {
    const host = await mount(<Harness c={client()} canEdit={false} priorHistoryDoor={null} />);
    expect(door(host)).toBeNull();
    expect(host.textContent).not.toContain("before Journey");
  });
});

describe("MembershipSection — where she can train", () => {
  it("offers a Demo Mode client no real studio to cross-train at, and a real client no demo studio", async () => {
    const withDemo = [...studios, { id: "demo-studio", name: "Demo Mode", isDemo: true }] as Studio[];
    const probe: Probe = {};
    const names = (e: HTMLElement) =>
      Array.from(e.querySelectorAll('#account-train-at .cx-pick')).map((b) => b.textContent);
    let host = await mount(<Harness c={client({ homeStudioId: "demo-studio" })} studioList={withDemo} probe={probe} />);
    expect(names(host)).toEqual([]);
    expect(host.querySelector("#account-train-at")?.textContent).toContain("No other studios to approve.");
    expect(probe.form!.count).toBe(0);

    host = await mount(<Harness c={client()} studioList={withDemo} />);
    expect(names(host)).toEqual(["Westlake"]);
  });

  it("says the studios are not loaded, never that there are none, while the list is empty", async () => {
    const host = await mount(<Harness c={client()} studioList={[]} />);
    const card = host.querySelector<HTMLElement>("#account-train-at")!;
    expect(card.textContent).toContain("Studio names not loaded yet");
    expect(card.textContent).not.toContain("No other studios to approve.");
    // Never the raw studio id.
    expect(card.querySelector(".cx-fact__value")?.textContent).not.toBe("solon");
  });

  it("stages a studio on the form, and the card says it is unsaved", async () => {
    const probe: Probe = {};
    const host = await mount(<Harness c={client()} probe={probe} />);
    const card = host.querySelector<HTMLElement>("#account-train-at")!;
    expect(card.querySelector(".cx-fact__value")?.textContent).toBe("Solon");
    const pick = card.querySelector<HTMLButtonElement>(".cx-pick")!;
    expect(pick.getAttribute("aria-pressed")).toBe("false");
    await click(pick);
    expect(probe.form!.formData.approvedCrossTrainStudioIds).toEqual(["westlake"]);
    expect(probe.form!.where).toEqual([{ page: "account", anchor: "account-train-at", label: "Where they can train" }]);
    expect(card.querySelector(".cx-pick")?.getAttribute("aria-pressed")).toBe("true");
    expect(card.textContent).toContain("Unsaved");
    expect(card.textContent).toContain("Cleared to train at Westlake");
  });
});

describe("MembershipSection — on file, how she found us, the fine print", () => {
  it("reads what Mindbody has on file, the prospect and inactive flags included", async () => {
    const c = client({
      isLiabilityReleased: true,
      liabilityAgreementDate: ts("2019-03-04T00:00:00Z"),
      mindbodyStatus: "Active",
      isProspect: true,
      mindbodyActive: false,
      mindbodyCreatedAt: ts("2019-03-01T00:00:00Z"),
      firstAppointmentDate: ts("2019-03-06T00:00:00Z"),
      clientsNumberOfVisitsAtSite: 486,
    } as Partial<Client>);
    const host = await mount(<Harness c={c} />);
    const card = host.querySelector<HTMLElement>("#account-on-file")!;
    expect(card.querySelector('.cx-chip[data-tone="ok"]')?.textContent).toBe("Signed Mar 4, 2019");
    expect(card.textContent).toContain("Active · a prospect in Mindbody · marked inactive in Mindbody");
    expect(card.textContent).toContain("Mar 1, 2019 · first visit Mar 6, 2019");
    expect(card.textContent).toContain("486");
    expect(card.textContent).toContain("Mindbody's own count, separate from Journey's sessions");
  });

  it("edits how she found us on the form; Done only closes the editor", async () => {
    const probe: Probe = {};
    const host = await mount(<Harness c={client({ referredBy: "Janet Olsen" })} probe={probe} />);
    const card = () => host.querySelector<HTMLElement>("#account-found-us")!;
    expect(card().querySelector("h3")?.textContent).toBe("How she found us");
    expect(card().textContent).toContain("Janet Olsen");
    expect(card().textContent).toContain("Not recorded");
    await click(buttonByText(card(), "Edit"));
    await typeInto(fieldByLabel(card(), "Lead source"), "Referral");
    expect(probe.form!.formData.leadSource).toBe("Referral");
    await click(buttonByText(card(), "Done"));
    expect(fieldByLabel(card(), "Lead source")).toBeNull();
    expect(card().textContent).toContain("Referral");
    expect(card().textContent).toContain("Unsaved");
    expect(probe.form!.where.map((w) => w.anchor)).toEqual(["account-found-us"]);
  });

  it("keeps the Mindbody ID out of the fine print (it is on the ID card), and opens the Migration Hub", async () => {
    const hub = vi.fn();
    const host = await mount(<Harness c={client({ mindbodyIndexes: { LongtermGoal: "Strength", ReferralType: "Friend" } })} onOpenMigrationHub={hub} />);
    const fine = host.querySelector<HTMLElement>("#account-fine-print")!;
    expect(fine.tagName).toBe("DETAILS");
    expect(fine.hasAttribute("open")).toBe(false);
    expect(fine.textContent).not.toContain("Mindbody client ID");
    // Mindbody's other indexes; the long-term goal is Goals & Focus's.
    expect(fine.textContent).toContain("ReferralType: Friend");
    expect(fine.textContent).not.toContain("LongtermGoal");
    await click(buttonByText(fine, "Migration Hub (OCR)"));
    expect(hub).toHaveBeenCalledTimes(1);
  });
});

describe("MembershipSection — a reader who may not edit", () => {
  it("shows every fact and offers no Lock, no studio toggle, no Edit and no Migration Hub", async () => {
    const hub = vi.fn();
    const probe: Probe = {};
    const host = await mount(
      <Harness
        c={client({ approvedCrossTrainStudioIds: ["westlake"], leadSource: "Referral", renewal: renewal() })}
        canEdit={false}
        probe={probe}
        onOpenMigrationHub={hub}
      />,
    );
    const text = host.textContent || "";
    expect(text).toContain("95 left");
    expect(text).toContain("Referral");
    expect(buttonByText(host, "Lock the tier")).toBeUndefined();
    expect(buttonByText(host, "Use Mindbody's")).toBeUndefined();
    expect(buttonByText(host, "Edit")).toBeUndefined();
    expect(buttonByText(host, "Migration Hub")).toBeUndefined();
    expect(host.querySelectorAll(".cx-pick")).toHaveLength(0);
    // Where she can train reads as a list.
    const train = host.querySelector<HTMLElement>("#account-train-at")!;
    expect(train.textContent).toContain("Westlake");
    expect(train.textContent).toContain("Cleared to train at Westlake");
    expect(host.querySelector("#account-fine-print")).not.toBeNull();
    expect(probe.form!.count).toBe(0);
  });
});

describe("MembershipSection — the section", () => {
  it("heads the section with its question, in the pronoun, and every anchor once", async () => {
    const host = await mount(<Harness c={client()} />);
    const head = host.querySelector<HTMLElement>("#account-membership")!;
    expect(head.textContent).toContain("Membership");
    expect(head.textContent).toContain("what she has bought, what is left, and where she can train");
    for (const anchor of ["account-membership", "account-train-at", "account-on-file", "account-found-us", "account-fine-print"]) {
      expect(host.querySelectorAll(`[id="${anchor}"][data-cx-anchor]`), anchor).toHaveLength(1);
    }
    expect(host.textContent).not.toContain("Judith");
  });

  it("draws nothing with a Tailwind size or colour", async () => {
    const host = await mount(<Harness c={client({ renewal: renewal({ conversationDue: true }) })} />);
    const classes = Array.from(host.querySelectorAll("[class]")).map((el) => el.getAttribute("class") || "");
    expect(classes.filter((c) => /\btext-(xs|sm|base|lg|\[)|\b(?:bg|text|border)-(?:slate|sky|amber|rose|red|emerald)-/.test(c))).toEqual([]);
  });
});
