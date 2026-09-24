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
 *   - Mindbody's account notes show line by line, verbatim, and say why when
 *     there are none;
 *   - the intake matcher (phase 17): each line says where it belongs; an
 *     Activity line is ONE FORD detail however fast it is tapped, stamped
 *     with the home studio, the Auth uid and `mindbody_intake`; Occ, Goals
 *     and Med are staged on the form for the Save bar (the medical line added
 *     to the history), never written; nothing is offered while FORD is
 *     unread, or to a reader who may not edit;
 *   - a reader who may not edit gets every fact and no button that edits;
 *   - the page's anchors, its neighbours, and Next reading "Done";
 *   - the pronoun, not the client's name, in the page's own words.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, Studio } from "../../types";
import type { FordEntry } from "../ford/types";
import type { CodexFordStatus } from "../client-codex/codex-data";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const fordWrite = vi.hoisted(() => ({ createFordEntry: vi.fn() }));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-aj" } } }));
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: toast.success, error: toast.error, info: () => {}, warning: () => {}, toast: () => {} }),
}));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "westlake", activeStudio: null }),
}));
vi.mock("../ford/ford-write", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ford/ford-write")>()),
  createFordEntry: fordWrite.createFordEntry,
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

const FORD_AUTHOR = { id: "uid-aj", initials: "AJ", fullName: "AJ Jurgens" };

function Harness({
  c,
  probe = {},
  canEdit = true,
  go = () => {},
  onOpenMigrationHub = () => {},
  fordStatus = "ready",
  fordEntries = [],
  fordCanAdd = true,
}: {
  c: Client;
  probe?: Probe;
  canEdit?: boolean;
  go?: AccountPageProps["go"];
  onOpenMigrationHub?: () => void;
  fordStatus?: CodexFordStatus;
  fordEntries?: FordEntry[];
  fordCanAdd?: boolean;
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
          ford={{ status: fordStatus, entries: fordEntries, canAdd: fordCanAdd }}
          fordAuthor={FORD_AUTHOR}
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

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  fordWrite.createFordEntry.mockReset();
  fordWrite.createFordEntry.mockResolvedValue("f-new");
});

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

const MOCKUP_NOTES =
  "OCC: Retired dental hygienist.\nMED: R TKA Mar 2024. BP managed w/ meds.\nACTIVITY: Pickleball 2x/wk, gardening.\nGOALS: Keep up w/ grandkids. Camino!\nPmt: autopay";

const notesCard = (host: HTMLElement) => host.querySelector<HTMLElement>("#account-mindbody-notes")!;
const rows = (host: HTMLElement) => Array.from(notesCard(host).querySelectorAll<HTMLElement>(".cadm-intake__row"));
const row = (host: HTMLElement, label: string) =>
  rows(host).find((r) => r.querySelector(".cadm-intake__label")?.textContent === label)!;
/** A line whose label the matcher does not know has no label of its own: it is found by its words, as typed. */
const rowByText = (host: HTMLElement, text: string) =>
  rows(host).find((r) => r.querySelector(".cadm-intake__text")?.textContent === text)!;
const status = (r: HTMLElement) => r.querySelector(".cadm-intake__status")?.textContent ?? "";

describe("AccountPage — Mindbody's account notes", () => {
  it("shows them line by line, the label as written and the words verbatim", async () => {
    const host = await mount(<Harness c={carol({ mindbodyNotes: "OCC: Retired dental hygienist.\nMED: R TKA Mar 2024.\nwith a second line" })} />);
    const card = notesCard(host);
    expect(rows(host).map((r) => [r.querySelector(".cadm-intake__label")?.textContent, r.querySelector(".cadm-intake__text")?.textContent])).toEqual([
      ["OCC", "Retired dental hygienist."],
      // A line with no label goes on with the one above it, its own break kept.
      ["MED", "R TKA Mar 2024.\nwith a second line"],
    ]);
    expect(card.textContent).toContain("edit in Mindbody");
    expect(card.textContent).toContain("The first 1,000 characters of her Mindbody account notes");
    expect(card.textContent).toContain("Nothing is copied on its own");
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

describe("AccountPage — the intake matcher (AJ's decision 4)", () => {
  it("says where each line belongs, and offers one tap for each on an empty record", async () => {
    const host = await mount(<Harness c={carol({ mindbodyNotes: MOCKUP_NOTES })} />);
    const to = (label: string) => row(host, label).querySelector(".cadm-intake__to")?.textContent;
    expect([to("OCC"), to("MED"), to("ACTIVITY"), to("GOALS")]).toEqual(["Occupation", "Body", "Recreation", "Her why"]);
    expect(status(row(host, "OCC"))).toBe("No job title on her record yet.");
    expect(status(row(host, "MED"))).toBe("Nothing in Body's watch-outs yet.");
    expect(status(row(host, "ACTIVITY"))).toBe("Nothing in Recreation yet.");
    expect(status(row(host, "GOALS"))).toBe("Her why isn't written yet.");
    expect(buttonByText(row(host, "OCC"), "Add to Occupation")).toBeDefined();
    expect(buttonByText(row(host, "MED"), "Add as medical history")).toBeDefined();
    expect(buttonByText(row(host, "ACTIVITY"), "Add to Recreation")).toBeDefined();
    expect(buttonByText(row(host, "GOALS"), "Use as her why")).toBeDefined();
    // A line it does not know is shown exactly as typed, label and all, with
    // nothing offered and nowhere to go.
    const pmt = rowByText(host, "Pmt: autopay");
    expect(pmt.querySelector(".cadm-intake__label")).toBeNull();
    expect(pmt.querySelector(".cadm-intake__to")).toBeNull();
    expect(pmt.querySelectorAll("button")).toHaveLength(0);
    // Nothing was copied anywhere by drawing the card.
    expect(fordWrite.createFordEntry).not.toHaveBeenCalled();
  });

  it("adds an Activity line as ONE pinned FORD Recreation detail, however fast it is tapped", async () => {
    let resolve: (id: string | null) => void = () => {};
    fordWrite.createFordEntry.mockImplementation(() => new Promise<string | null>((r) => (resolve = r)));
    const host = await mount(<Harness c={carol({ mindbodyNotes: MOCKUP_NOTES })} />);
    const add = buttonByText(row(host, "ACTIVITY"), "Add to Recreation")!;
    await act(async () => {
      add.click();
      add.click();
    });
    expect(fordWrite.createFordEntry).toHaveBeenCalledTimes(1);
    expect(fordWrite.createFordEntry).toHaveBeenCalledWith("100004418", "westlake", FORD_AUTHOR, {
      pillar: "recreation",
      body: "Pickleball 2x/wk, gardening.",
      isPinned: true,
      origin: "mindbody_intake",
    });
    // Busy: every tap on the card waits for the first to answer.
    expect(buttonByText(row(host, "ACTIVITY"), "Adding")?.disabled).toBe(true);
    expect(buttonByText(row(host, "OCC"), "Add to Occupation")?.disabled).toBe(true);
    await click(buttonByText(row(host, "ACTIVITY"), "Adding"));
    expect(fordWrite.createFordEntry).toHaveBeenCalledTimes(1);
    await act(async () => resolve("f-new"));
    expect(status(row(host, "ACTIVITY"))).toBe("Added to Recreation.");
    expect(buttonByText(row(host, "ACTIVITY"), "Add to Recreation")).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith("Added to Recreation.");
    // It saved on its own, as every FORD detail does: nothing waits on the Save bar.
  });

  it("keeps the offer, and says so, when the FORD add is refused", async () => {
    fordWrite.createFordEntry.mockResolvedValue(null);
    const host = await mount(<Harness c={carol({ mindbodyNotes: MOCKUP_NOTES })} />);
    await click(buttonByText(row(host, "ACTIVITY"), "Add to Recreation"));
    expect(row(host, "ACTIVITY").querySelector('[role="alert"]')?.textContent).toBe(
      "Not added. Check your connection and try again.",
    );
    expect(toast.error).toHaveBeenCalledWith("Couldn't add that line. Check your connection and try again.");
    expect(buttonByText(row(host, "ACTIVITY"), "Add to Recreation")?.disabled).toBe(false);
  });

  it("stages the medical line on the form — added to the history — and writes nothing", async () => {
    const probe: Probe = {};
    const host = await mount(
      <Harness c={carol({ mindbodyNotes: MOCKUP_NOTES, medicalHistory: "Knee replaced 2024." })} probe={probe} />,
    );
    const med = row(host, "MED");
    expect(status(med)).toBe(
      "Body has a medical history on file. Read both side by side; the app can't tell whether they say the same thing.",
    );
    await click(buttonByText(med, "Add to medical history"));
    expect(probe.form!.formData.medicalHistory).toBe("Knee replaced 2024.\n\nR TKA Mar 2024. BP managed w/ meds.");
    expect(probe.form!.isDirty("medicalHistory")).toBe(true);
    expect(probe.form!.where).toEqual([{ page: "body", anchor: "body-watchouts", label: "Watch-outs" }]);
    expect(status(row(host, "MED"))).toBe(
      "UnsavedAdded to her medical history. Nothing is saved until you tap Save changes on the bar at the bottom.",
    );
    expect(buttonByText(row(host, "MED"), "Add to medical history")).toBeUndefined();
    expect(fordWrite.createFordEntry).not.toHaveBeenCalled();
    // Discard on the bar brings the offer back.
    await act(async () => probe.form!.discard());
    expect(buttonByText(row(host, "MED"), "Add to medical history")).toBeDefined();
  });

  it("stages the job title and her why only while each is empty, each named on the bar by its own page", async () => {
    const probe: Probe = {};
    const host = await mount(<Harness c={carol({ mindbodyNotes: MOCKUP_NOTES })} probe={probe} />);
    await click(buttonByText(row(host, "OCC"), "Add to Occupation"));
    await click(buttonByText(row(host, "GOALS"), "Use as her why"));
    expect(probe.form!.formData.occupation).toBe("Retired dental hygienist.");
    expect(probe.form!.formData.globalNotes).toBe("Keep up w/ grandkids. Camino!");
    expect(probe.form!.where).toEqual([
      { page: "ford", anchor: "ford-occupation", label: "Occupation" },
      { page: "goals", anchor: "goals-why", label: "The why" },
    ]);
    expect(status(row(host, "OCC"))).toContain("Now her job title.");
    expect(status(row(host, "GOALS"))).toContain("Now her why.");

    // A job title or why already on the record is never replaced.
    const other = await mount(
      <Harness c={carol({ mindbodyNotes: MOCKUP_NOTES, occupation: "Hygienist", globalNotes: "Walk the Camino" })} />,
    );
    expect(status(row(other, "OCC"))).toBe("Journey has: “Hygienist” as her job title.");
    expect(status(row(other, "GOALS"))).toBe("Her why is already written on her record.");
    expect(row(other, "OCC").textContent).not.toContain("Add to Occupation");
    expect(row(other, "GOALS").textContent).not.toContain("Use as her why");
  });

  it("offers nothing once these exact words are there", async () => {
    const host = await mount(
      <Harness
        c={carol({ mindbodyNotes: MOCKUP_NOTES, medicalHistory: "Intake: R TKA Mar 2024. BP managed w/ meds." })}
        fordEntries={[
          {
            id: "f1",
            clientId: "100004418",
            studioId: "westlake",
            pillar: "recreation",
            body: "Pickleball 2x/wk, gardening.",
            isPinned: true,
            isArchived: false,
            origin: "mindbody_intake",
          } as FordEntry,
        ]}
      />,
    );
    expect(status(row(host, "MED"))).toBe("This exact line is in her medical history.");
    expect(status(row(host, "ACTIVITY"))).toBe("This line is already a detail in Recreation.");
    expect(buttonByText(row(host, "MED"), "Add")).toBeUndefined();
    expect(buttonByText(row(host, "ACTIVITY"), "Add")).toBeUndefined();
  });

  it("offers no FORD add while FORD is unread — unknown, never nothing — and still offers the record's own fields", async () => {
    const loading = await mount(<Harness c={carol({ mindbodyNotes: MOCKUP_NOTES })} fordStatus="loading" />);
    expect(status(row(loading, "ACTIVITY"))).toBe("Still reading FORD, so it isn't known yet whether this line is in Recreation.");
    expect(buttonByText(row(loading, "ACTIVITY"), "Add")).toBeUndefined();
    expect(buttonByText(row(loading, "OCC"), "Add to Occupation")).toBeDefined();
    const failed = await mount(<Harness c={carol({ mindbodyNotes: MOCKUP_NOTES })} fordStatus="failed" />);
    expect(status(row(failed, "ACTIVITY"))).toMatch(/^Couldn't check FORD just now/);
    expect(buttonByText(row(failed, "ACTIVITY"), "Add")).toBeUndefined();
  });

  it("offers no FORD add to a reader the FORD create rule refuses (an administrator elsewhere), and says why", async () => {
    const host = await mount(<Harness c={carol({ mindbodyNotes: MOCKUP_NOTES })} fordCanAdd={false} />);
    expect(status(row(host, "ACTIVITY"))).toBe(
      "Nothing in Recreation yet. Only a trainer at her home studio can add a FORD detail, so it isn't offered here.",
    );
    expect(buttonByText(row(host, "ACTIVITY"), "Add")).toBeUndefined();
    // The record's own fields are still theirs to stage.
    expect(buttonByText(row(host, "OCC"), "Add to Occupation")).toBeDefined();
    expect(fordWrite.createFordEntry).not.toHaveBeenCalled();
  });

  it("gives a reader who may not edit the sentences and the doors, and no tap", async () => {
    const go = vi.fn();
    const host = await mount(<Harness c={carol({ mindbodyNotes: MOCKUP_NOTES })} canEdit={false} fordStatus="off" go={go} />);
    expect(status(row(host, "OCC"))).toBe("No job title on her record yet.");
    expect(status(row(host, "ACTIVITY"))).toBe(
      "FORD is kept by her home studio, so this line can't be checked or added to Recreation here.",
    );
    for (const text of ["Add to", "Add as", "Use as"]) expect(buttonByText(notesCard(host), text), text).toBeUndefined();
    await click(buttonByText(row(host, "MED"), "Open Watch-outs"));
    expect(go).toHaveBeenLastCalledWith("body", "body-watchouts");
    await click(buttonByText(row(host, "GOALS"), "Open her why"));
    expect(go).toHaveBeenLastCalledWith("goals", "goals-why");
  });

  it("never says 'covered' or 'match' about a medical line", async () => {
    for (const over of [{}, { medicalHistory: "Knee" }, { clinicalFlags: ["joint-tka"], clinicalNotes: "No lunges" }] as Partial<Client>[]) {
      const host = await mount(<Harness c={carol({ mindbodyNotes: MOCKUP_NOTES, ...over })} />);
      expect(row(host, "MED").textContent).not.toMatch(/\bcovered\b|\bmatch/i);
      expect(notesCard(host).textContent).not.toMatch(/\bcovered\b/i);
    }
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
