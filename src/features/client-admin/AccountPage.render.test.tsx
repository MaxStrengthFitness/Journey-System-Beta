// @vitest-environment jsdom
/**
 * THE ACCOUNT PAGE, MOUNTED (client codex, phase 16).
 *
 * The page works out its words during render (the ID card's facts, the
 * membership) and stages its edits on the record's one form, so only a mount
 * proves it — on the codex's real form (`useRecordForm`):
 *
 *   - a linked client's ID card reads as facts: legal name, born (from the
 *     date's digits), emergency, the Mindbody ID once — and no Sync button;
 *   - Set a nickname opens a box in place, and Done only closes it: the
 *     nickname is staged on the form for the Save bar;
 *   - an unlinked client's card has an Edit that opens her identity; a
 *     linked client's has none;
 *   - Mindbody's account notes show verbatim, and say why when there are none;
 *   - a reader who may not edit gets every fact and no button that edits;
 *   - the page's anchors, its neighbours, and Next reading "Done";
 *   - the pronoun, not the client's name, in the page's own words.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, Studio } from "../../types";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-aj" } } }));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {}, info: () => {}, warning: () => {}, toast: () => {} }),
}));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "westlake", activeStudio: null }),
}));

import { AccountPage, type AccountPageProps } from "./AccountPage";
import { useRecordForm, type RecordForm } from "../client-codex/useRecordForm";
import { pronounsOf } from "../client-codex/kit";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TODAY = "2027-03-16";
const NOW = new Date(2027, 2, 16, 12);
const studios = [
  { id: "westlake", name: "Westlake" },
  { id: "solon", name: "Solon" },
] as Studio[];

const carol = (over: Partial<Client> = {}): Client =>
  ({
    id: "100004418",
    mindbodyClientId: "100004418",
    firstName: "Carol",
    lastName: "Brennan",
    gender: "Female",
    dateOfBirth: "1958-04-02",
    phone: "(440) 555-0142",
    email: "carol@example.com",
    address: "Linden Ct",
    city: "Westlake",
    addressState: "OH",
    postalCode: "44145",
    emergencyContactName: "Tom Brennan",
    emergencyContactRelationship: "husband",
    emergencyContactPhone: "(440) 555-0187",
    homeStudioId: "westlake",
    isActive: true,
    remainingSessions: 0,
    height: "",
    mindbodyMasterSyncedAt: "2027-03-14T15:00:00.000Z",
    mindbodyNotes: "OCC: Retired dental hygienist.\nMED: R TKA Mar 2024.",
    ...over,
  }) as Client;

const sam = (over: Partial<Client> = {}): Client =>
  ({
    id: "auto-id-sam",
    firstName: "Sam",
    lastName: "Lee",
    gender: "Male",
    homeStudioId: "westlake",
    isActive: true,
    remainingSessions: 0,
    height: "",
    ...over,
  }) as Client;

type Probe = { form?: RecordForm };

function Harness({
  c,
  probe = {},
  canEdit = true,
  go = () => {},
  onOpenMigrationHub = () => {},
}: {
  c: Client;
  probe?: Probe;
  canEdit?: boolean;
  go?: AccountPageProps["go"];
  onOpenMigrationHub?: () => void;
}) {
  const form = useRecordForm({ client: c, trainerId: "t-aj", canEdit, homeStudioName: "Westlake" });
  probe.form = form;
  return (
    <div className="cx">
      <div className="cx-pages">
        <AccountPage
          client={c}
          form={form}
          canEdit={canEdit}
          studios={studios}
          author={{ id: "uid-aj", name: "AJ" }}
          coverage="complete"
          pronouns={pronounsOf(c)}
          today={TODAY}
          go={go}
          onOpenMigrationHub={onOpenMigrationHub}
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

/** The ID card's facts as label → value. */
function facts(card: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    Array.from(card.querySelectorAll(".cx-fact")).map((f) => [
      f.querySelector(".cx-fact__label")?.textContent ?? "",
      f.querySelector(".cx-fact__value")?.textContent ?? "",
    ]),
  );
}

const contact = (host: HTMLElement) => host.querySelector<HTMLElement>("#account-contact")!;

describe("AccountPage — the ID card", () => {
  it("reads a linked client as facts, the Mindbody ID once, and offers no Sync button", async () => {
    const host = await mount(<Harness c={carol()} />);
    const card = facts(contact(host));
    expect(card["Legal name"]).toBe("Carol Brennan");
    expect(card["Born"]).toBe("Apr 2, 1958 · 68");
    expect(card["Emergency"]).toBe("Tom Brennan · husband · (440) 555-0187");
    expect(card["Address"]).toBe("Linden Ct · Westlake, OH · 44145");
    expect(card["Mindbody ID"]).toBe("100004418");
    expect(contact(host).textContent).toContain("From Mindbody · synced 2 days ago · Sync is at the top of the profile");
    // One copy of the Mindbody ID on the whole page.
    expect((host.textContent ?? "").split("100004418").length - 1).toBe(1);
    expect(buttons(host).some((b) => /\bsync\b/i.test(b.textContent ?? ""))).toBe(false);
    // Mindbody owns her identity: no Edit on a linked client's card, and no identity box.
    expect(buttonByText(contact(host), "Edit")).toBeUndefined();
    expect(contact(host).querySelectorAll("input")).toHaveLength(0);
  });

  it("stages a nickname on the form; Done only closes the box", async () => {
    const probe: Probe = {};
    const host = await mount(<Harness c={carol()} probe={probe} />);
    expect(facts(contact(host))["Goes by"]).toContain("Her first name");
    await click(buttonByText(contact(host), "Set a nickname"));
    await typeInto(fieldByLabel(contact(host), "Nickname"), "Judy");
    expect(probe.form!.formData.nickname).toBe("Judy");
    expect(probe.form!.where).toEqual([{ page: "account", anchor: "account-contact", label: "Contact" }]);
    await click(buttonByText(contact(host), "Done"));
    expect(fieldByLabel(contact(host), "Nickname")).toBeNull();
    expect(facts(contact(host))["Goes by"]).toContain("Judy");
    expect(buttonByText(contact(host), "Change")).toBeDefined();
    expect(contact(host).textContent).toContain("Unsaved");
    // Nothing was written: the Save bar saves.
    expect(probe.form!.count).toBe(1);
  });

  it("gives an unlinked client's card an Edit that opens her identity", async () => {
    const probe: Probe = {};
    const host = await mount(<Harness c={sam()} probe={probe} />);
    expect(contact(host).textContent).toContain("Typed in Journey · not linked to Mindbody");
    expect(facts(contact(host))["Phone"]).toBe("Not recorded");
    expect(facts(contact(host))["Mindbody ID"]).toBe("Not linked to Mindbody");
    // Mindbody holds nothing for her: said once, not "Not synced yet" four times.
    expect(host.querySelector("#account-on-file")?.textContent).toContain(
      "Not linked to Mindbody, so Mindbody has nothing on file for him yet.",
    );
    expect(host.querySelector("#account-fine-print")?.textContent).toContain("Not linked to Mindbody");
    await click(buttonByText(contact(host), "Edit"));
    const first = fieldByLabel(contact(host), "First name");
    expect(first?.value).toBe("Sam");
    await typeInto(fieldByLabel(contact(host), "Phone"), "555-0100");
    expect(probe.form!.formData.phone).toBe("555-0100");
    // A cleared name would be refused by the rules: the box says so.
    await typeInto(first, "");
    expect(contact(host).textContent).toContain("The record needs a first name to save.");
    await typeInto(first, "Samuel");
    await click(buttonByText(contact(host), "Done"));
    expect(facts(contact(host))["Legal name"]).toBe("Samuel Lee");
    expect(facts(contact(host))["Phone"]).toBe("555-0100");
  });

  it("gives a reader who may not edit every fact and no button that edits", async () => {
    const host = await mount(<Harness c={carol()} canEdit={false} />);
    expect(facts(contact(host))["Legal name"]).toBe("Carol Brennan");
    for (const text of ["Set a nickname", "Edit", "Lock the tier", "Migration Hub"]) {
      expect(buttonByText(host, text), text).toBeUndefined();
    }
    const unlinkedHost = await mount(<Harness c={sam()} canEdit={false} />);
    expect(buttonByText(contact(unlinkedHost), "Edit")).toBeUndefined();
  });
});

describe("AccountPage — Mindbody's account notes", () => {
  it("shows them verbatim, with their own line breaks", async () => {
    const host = await mount(<Harness c={carol()} />);
    const notes = host.querySelector<HTMLElement>("#account-mindbody-notes")!;
    expect(notes.querySelector(".cadm-notes")?.textContent).toBe("OCC: Retired dental hygienist.\nMED: R TKA Mar 2024.");
    expect(notes.textContent).toContain("edit in Mindbody");
    expect(notes.textContent).toContain("The first 1,000 characters of her Mindbody account notes");
  });

  it("says why there are none", async () => {
    let host = await mount(<Harness c={carol({ mindbodyNotes: "" })} />);
    expect(host.querySelector("#account-mindbody-notes")?.textContent).toContain("No account notes in Mindbody.");
    host = await mount(<Harness c={carol({ mindbodyNotes: "", mindbodyMasterSyncedAt: undefined })} />);
    expect(host.querySelector("#account-mindbody-notes")?.textContent).toContain("Not synced yet.");
    // A client Mindbody does not hold has no Mindbody notes card: the ID card takes the row.
    host = await mount(<Harness c={sam()} />);
    expect(host.querySelector("#account-mindbody-notes")).toBeNull();
    expect(host.querySelector(".cadm-row--contact")).toBeNull();
  });
});

describe("AccountPage — the page", () => {
  it("has every card a door lands on, once", async () => {
    const host = await mount(<Harness c={carol()} />);
    for (const anchor of [
      "account-contact",
      "account-mindbody-notes",
      "account-membership",
      "account-train-at",
      "account-on-file",
      "account-found-us",
      "account-fine-print",
    ]) {
      expect(host.querySelectorAll(`[id="${anchor}"][data-cx-anchor]`), anchor).toHaveLength(1);
    }
  });

  it("speaks in the pronoun, not the name, and walks back to Story or home to the Overview", async () => {
    const go = vi.fn();
    const host = await mount(<Harness c={carol()} go={go} />);
    const lede = host.querySelector(".cx-page-lede")?.textContent ?? "";
    expect(lede).toBe(
      "Her contact details as Mindbody knows them, then her membership. The nickname and how she found us are edited here; everything else changes in Mindbody and arrives with the next sync.",
    );
    expect(lede).not.toContain("Carol");
    // A client typed into Journey: her details are typed here, not synced.
    const him = await mount(<Harness c={sam()} />);
    expect(him.querySelector(".cx-page-lede")?.textContent).toBe(
      "His contact details as typed into Journey, then his membership. Mindbody does not hold him yet, so his details are typed here until he is linked.",
    );
    // A reader who may not edit is offered no edit in words either.
    const reader = await mount(<Harness c={carol()} canEdit={false} />);
    expect(reader.querySelector(".cx-page-lede")?.textContent).toBe(
      "Her contact details as Mindbody knows them, then her membership. Read only here: her home studio keeps the record.",
    );
    await click(host.querySelector('[aria-label="Previous page: Story"]'));
    expect(go).toHaveBeenLastCalledWith("story");
    const next = host.querySelector<HTMLElement>(".cx-next")!;
    expect(next.textContent).toContain("Done");
    await click(next);
    expect(go).toHaveBeenLastCalledWith("overview");
  });

  it("opens the Migration Hub from the fine print, for a reader who may change the record", async () => {
    const hub = vi.fn();
    const host = await mount(<Harness c={carol()} onOpenMigrationHub={hub} />);
    await click(buttonByText(host.querySelector<HTMLElement>("#account-fine-print")!, "Migration Hub (OCR)"));
    expect(hub).toHaveBeenCalledTimes(1);
  });

  it("draws nothing with a Tailwind size or colour", async () => {
    const host = await mount(<Harness c={carol()} />);
    const classes = Array.from(host.querySelectorAll("[class]")).map((el) => el.getAttribute("class") || "");
    expect(classes.filter((c) => /\btext-(xs|sm|base|lg|\[)|\b(?:bg|text|border)-(?:slate|sky|amber|rose|red|emerald)-/.test(c))).toEqual([]);
  });
});
