/**
 * The Account page's words (client codex, phase 16) — run with
 * TZ=America/New_York, where a date read through UTC slips a day.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { AutoRenewMark, Client, ContractTierOverride, MindbodyContract, Studio } from "../../types";
import type { RenewalSnapshot } from "../renewals/types";
import type { PriorHistory } from "../../lib/prior-history";
import { pronounsOf } from "../client-codex/kit/pronouns";
import { buildContractHistory } from "./contract";
import {
  accountGlance,
  accountLede,
  accountTabHint,
  ageAndBirthday,
  autoRenewView,
  contactFacts,
  isMindbodyLinked,
  membershipTimeline,
  missingWords,
  onFileFacts,
  onHandTotal,
  packageView,
  contractWords,
  extraWords,
  sessionsSplit,
  tabTone,
  tierSourceLine,
} from "./account";
import { DEFAULT_RENEWAL_SETTINGS, buildPackageNameIndex } from "../renewals/settings";

const HERE = dirname(fileURLToPath(import.meta.url));
const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const NOW = new Date(2027, 2, 16, 12);
const TODAY = "2027-03-16";

const linked = (over: Partial<Client> = {}): Client =>
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
    ...over,
  }) as Client;

const unlinked = (over: Partial<Client> = {}): Client =>
  ({
    id: "auto-id-abc",
    firstName: "Sam",
    lastName: "Lee",
    homeStudioId: "westlake",
    isActive: true,
    remainingSessions: 0,
    height: "",
    ...over,
  }) as Client;

const fact = (facts: ReturnType<typeof contactFacts>, key: string) => facts.find((f) => f.key === key)!;

const renewal = (over: Partial<RenewalSnapshot> = {}): RenewalSnapshot =>
  ({
    situation: "on-track",
    packageLabel: "Committed · 12 months",
    sessionsLeft: 95,
    sessionsLeftSource: "mindbody",
    sessionsOnHand: 7,
    paymentsLeft: 11,
    chargeDate: "2028-03-14",
    chargeDateSource: "mindbody",
    autoRenews: true,
    paymentMode: "monthly",
    pacePerWeek: 2,
    conversationDue: false,
    renewalOnBooks: null,
    dataGaps: [],
    focusDate: "2028-03-14",
    ...over,
  }) as unknown as RenewalSnapshot;

/* ------------------------------------------------------------------ */
/* The ID card                                                         */
/* ------------------------------------------------------------------ */

describe("contactFacts", () => {
  it("reads a linked client's card off the record, in the card's order", () => {
    const facts = contactFacts(linked(), {}, { now: NOW });
    expect(facts.map((f) => f.label)).toEqual([
      "Goes by",
      "Legal name",
      "Born",
      "Gender",
      "Phone",
      "Email",
      "Address",
      "Emergency",
      "Mindbody ID",
    ]);
    expect(fact(facts, "legal").value).toBe("Carol Brennan");
    expect(fact(facts, "address").value).toBe("Linden Ct · Westlake, OH · 44145");
    expect(fact(facts, "emergency").value).toBe("Tom Brennan · husband · (440) 555-0187");
    expect(fact(facts, "mindbodyId").value).toBe("100004418");
    // Mindbody's: nothing but the nickname is editable.
    expect(facts.filter((f) => f.editable).map((f) => f.key)).toEqual(["goesBy"]);
  });

  it("reads a date of birth from its digits: Apr 2, never Apr 1", () => {
    expect(fact(contactFacts(linked(), {}, { now: NOW }), "born").value).toBe("Apr 2, 1958 · 68");
    // The day she turns 69.
    expect(fact(contactFacts(linked(), {}, { now: new Date(2027, 3, 2, 8) }), "born").value).toBe("Apr 2, 1958 · 69");
  });

  it("says why an empty fact is empty", () => {
    const synced = contactFacts(linked({ phone: "" }), {}, { now: NOW });
    expect(fact(synced, "phone")).toMatchObject({ value: "Not in Mindbody", empty: true });
    const unsynced = contactFacts(linked({ phone: "", mindbodyMasterSyncedAt: undefined }), {}, { now: NOW });
    expect(fact(unsynced, "phone")).toMatchObject({ value: "Not synced yet", empty: true });
    const typed = contactFacts(unlinked(), {}, { now: NOW });
    expect(fact(typed, "phone")).toMatchObject({ value: "Not recorded", empty: true, editable: true });
    expect(fact(typed, "mindbodyId")).toMatchObject({ value: "Not linked to Mindbody", empty: true, editable: false });
    expect(missingWords(linked())).toBe("Not in Mindbody");
  });

  it("lets a coach type an unlinked client's identity, and shows the form's value", () => {
    const facts = contactFacts(unlinked(), { firstName: "Samantha", phone: "555-0100", dateOfBirth: "1990-12-31" }, { now: NOW });
    expect(fact(facts, "legal").value).toBe("Samantha Lee");
    expect(fact(facts, "phone").value).toBe("555-0100");
    expect(fact(facts, "born").value).toBe("Dec 31, 1990 · 36");
    expect(facts.filter((f) => f.editable).map((f) => f.key)).toEqual([
      "goesBy",
      "legal",
      "born",
      "gender",
      "phone",
      "email",
      "address",
      "emergency",
    ]);
  });

  it("never shows a linked client's form over the record (the form can hold a stale name)", () => {
    const facts = contactFacts(linked(), { firstName: "Old", phone: "000" }, { now: NOW });
    expect(fact(facts, "legal").value).toBe("Carol Brennan");
    expect(fact(facts, "phone").value).toBe("(440) 555-0142");
  });

  it("goes by the nickname — the form's, staged or saved — else the first name, in the pronoun", () => {
    expect(fact(contactFacts(linked(), {}, { now: NOW }), "goesBy")).toMatchObject({ value: "Her first name", empty: true });
    expect(fact(contactFacts(linked({ nickname: "Judy" }), {}, { now: NOW }), "goesBy")).toMatchObject({ value: "Judy", empty: false });
    expect(fact(contactFacts(linked({ nickname: "Judy" }), { nickname: "Jude" }, { now: NOW }), "goesBy").value).toBe("Jude");
    expect(fact(contactFacts(linked({ gender: "Male" }), {}, { now: NOW }), "goesBy").value).toBe("His first name");
    expect(fact(contactFacts(linked({ gender: undefined }), {}, { now: NOW, pronouns: pronounsOf(null) }), "goesBy").value).toBe(
      "Their first name",
    );
  });

  it("treats a temporary profile as unlinked, and says so on the ID", () => {
    const temp = linked({ provisional: true });
    expect(isMindbodyLinked(temp)).toBe(false);
    expect(fact(contactFacts(temp, {}, { now: NOW }), "mindbodyId").value).toBe(
      "A temporary profile, not linked to Mindbody yet",
    );
  });
});

describe("ageAndBirthday", () => {
  it("counts to the next birthday from the date of birth's digits", () => {
    expect(ageAndBirthday("1958-04-02", TODAY)).toEqual({ age: 68, birthday: "Apr 2", turns: 69, daysUntil: 17 });
    expect(ageAndBirthday("1958-03-16", TODAY)).toEqual({ age: 69, birthday: "Mar 16", turns: 69, daysUntil: 0 });
    expect(ageAndBirthday("", TODAY)).toBeNull();
    expect(ageAndBirthday("April 2", TODAY)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* On file with Mindbody                                               */
/* ------------------------------------------------------------------ */

describe("onFileFacts", () => {
  const facts = (c: Partial<Client>) => Object.fromEntries(onFileFacts(c).map((f) => [f.key, f]));

  it("says the first visit only of Mindbody's own date; an inferred one is the earliest seen", () => {
    const own = facts({ mindbodyCreatedAt: ts("2019-03-01T00:00:00Z"), firstAppointmentDate: ts("2019-03-06T00:00:00Z") });
    expect(own.since.value).toBe("Mar 1, 2019 · first visit Mar 6, 2019");
    const inferred = facts({
      mindbodyCreatedAt: ts("2019-03-01T00:00:00Z"),
      firstAppointmentDate: "2024-06-03T14:00:00.000Z",
      firstAppointmentDateSource: "pull-sync:earliest-in-window",
    });
    expect(inferred.since.value).toBe("Mar 1, 2019 · earliest visit seen Jun 3, 2024");
    expect(inferred.since.value).not.toContain("first visit");
    expect(facts({ firstAppointmentDate: ts("2019-03-06T00:00:00Z") }).since.value).toBe("First visit Mar 6, 2019");
  });

  it("gives the prospect and inactive flags a reader", () => {
    expect(facts({ mindbodyStatus: "Active", isProspect: true, mindbodyActive: false }).status.value).toBe(
      "Active · a prospect in Mindbody · marked inactive in Mindbody",
    );
    expect(facts({ isProspect: true }).status.value).toBe("a prospect in Mindbody");
    expect(facts({ mindbodyStatus: "Active", isProspect: false, mindbodyActive: true }).status.value).toBe("Active");
  });

  it("reads the waiver in its three states", () => {
    expect(facts({ isLiabilityReleased: true, liabilityAgreementDate: ts("2019-03-04T00:00:00Z") }).waiver).toMatchObject({
      value: "Signed Mar 4, 2019",
      tone: "ok",
      empty: false,
    });
    expect(facts({ isLiabilityReleased: false }).waiver).toMatchObject({ value: "Not signed", tone: "warn" });
    expect(facts({}).waiver).toMatchObject({ value: "Not synced yet", tone: "neutral", empty: true });
  });

  it("says Not synced yet for anything Mindbody has not sent, and names its own visit count", () => {
    const none = facts({});
    expect([none.status.value, none.since.value, none.visits.value]).toEqual(["Not synced yet", "Not synced yet", "Not synced yet"]);
    expect(facts({ clientsNumberOfVisitsAtSite: 486 }).visits).toMatchObject({
      value: "486",
      source: "Mindbody's own count, separate from Journey's sessions",
    });
  });
});

/* ------------------------------------------------------------------ */
/* The package                                                         */
/* ------------------------------------------------------------------ */

const contracted = (over: Partial<Client> = {}): Client =>
  linked({
    mindbodyContracts: {
      k: {
        clientContractId: "k",
        status: "Active",
        contractName: "96 Sessions - 2X Week",
        startDate: ts("2027-03-14T00:00:00Z"),
        endDate: ts("2028-03-14T00:00:00Z"),
      },
    } as Client["mindbodyContracts"],
    mindbodyServices: { s: { serviceId: "s", name: "96 Sessions · 12 Mo", remaining: 7, count: 8 } } as unknown as Client["mindbodyServices"],
    ...over,
  });

/** A version-2 snapshot of contract "k" (auto-renew decided, Sep 25 2026). */
const V2 = { version: 2, clientContractId: "k" } as const;
const mark = (renews: boolean, contractId = "k", over: Partial<AutoRenewMark> = {}): AutoRenewMark => ({
  renews,
  contractId,
  setAt: "2027-03-15T14:00:00.000Z",
  setById: "uid-aj",
  setByName: "AJ",
  ...over,
});

describe("packageView", () => {
  it("names the package, then its terms, from Mindbody's names", () => {
    const v = packageView(contracted(), null, TODAY);
    expect(v).toMatchObject({ headline: "Committed", terms: "12 months · paying every 4 weeks", mindbodyReads: null });
    expect(v.tier.source).toBe("parsed");
  });

  it("reads the renewal: what is left, when it renews, the pace", () => {
    const v = packageView(contracted({ renewal: renewal() }), null, TODAY);
    expect(v).toMatchObject({
      left: "95 left",
      leftWords: "sessions left",
      payments: "11 payments to go",
      when: "Auto-renews Mar 14, 2028",
      tone: "ok",
      worked: true,
    });
    expect(packageView(contracted({ renewal: renewal({ chargeDate: "2027-11-14" }) }), null, TODAY).when).toBe("Auto-renews Nov 14");
    // Mindbody's own flag: a studio without auto-renew, and a contract Mindbody hasn't said about.
    expect(packageView(contracted({ renewal: renewal({ autoRenews: false }) }), null, TODAY).when).toBe("Billing ends Mar 14, 2028");
    expect(packageView(contracted({ renewal: renewal({ autoRenews: null }) }), null, TODAY).when).toBe("Payments finish Mar 14, 2028");
    expect(packageView(contracted({ renewal: renewal({ sessionsLeftSource: "estimate" }) }), null, TODAY).leftWords).toBe(
      "sessions left (estimated)",
    );
  });

  it("reads a staged auto-renewal untick before Save", () => {
    const c = contracted({ renewal: renewal({ ...V2, autoRenewsFrom: "default", autoRenewsInherited: { renews: true, from: "default" } }) });
    expect(packageView(c, null, TODAY).when).toBe("Auto-renews Mar 14, 2028");
    expect(packageView(c, null, TODAY, undefined, mark(false)).when).toBe("Billing ends Mar 14, 2028");
    // A saved mark is the default for the pending one.
    expect(packageView({ ...c, autoRenewMark: mark(false) }, null, TODAY).when).toBe("Billing ends Mar 14, 2028");
    // Staged back to the studio's answer: null.
    expect(packageView({ ...c, autoRenewMark: mark(false) }, null, TODAY, undefined, null).when).toBe("Auto-renews Mar 14, 2028");
  });

  it("claims no renewal under a paid-in-full or banked-sessions lock, staged or saved", () => {
    const c = contracted({
      renewal: renewal({ ...V2, situation: "will-bank", bankedAtCharge: 6, autoRenewsFrom: "default", autoRenewsInherited: { renews: true, from: "default" } }),
    });
    const pif: ContractTierOverride = { term: 12, payment: "pif", setAt: "2027-03-15T00:00:00Z", setByName: "AJ" };
    expect(packageView(c, null, TODAY).when).toBe("Auto-renews Mar 14, 2028");
    for (const payment of ["pif", "sessions-only"] as const) {
      const staged = packageView(c, { ...pif, payment }, TODAY);
      expect(staged.when, payment).toBe("Payments finish Mar 14, 2028");
      expect(staged.status, payment).toBe("Payments finish Mar 14, 2028 with about 6 sessions still banked");
    }
    // Saved: the form holds the saved lock, and a mark under it claims nothing either.
    const saved = { ...c, contractTierOverride: pif, autoRenewMark: mark(true) };
    expect(packageView(saved, pif, TODAY).when).toBe("Payments finish Mar 14, 2028");
    // Staged to come off: the answer it has without it, before Save.
    expect(packageView(saved, null, TODAY).when).toBe("Auto-renews Mar 14, 2028");
    // A monthly lock bills.
    expect(packageView(c, { ...pif, payment: "monthly" }, TODAY).when).toBe("Auto-renews Mar 14, 2028");
  });

  it("never calls what she holds right now 'left'", () => {
    const v = packageView(contracted(), null, TODAY);
    expect(v).toMatchObject({ left: "7 on hand", leftWords: "sessions on hand in Mindbody", worked: false });
    expect(v.when).toBe("Contract ends Mar 14, 2028");
    expect(v.status).toBe("Renewal not worked out yet — it appears after the nightly run.");
    const nothing = packageView(linked(), null, TODAY);
    expect(nothing).toMatchObject({ left: "—", when: "No end date on file", headline: "Not known yet", terms: null });
  });

  it("puts a staged lock first, with Mindbody's reading beside it", () => {
    const v = packageView(contracted(), { term: 18, payment: "pif", setAt: "2027-03-15T00:00:00Z", setByName: "AJ" }, TODAY);
    expect(v).toMatchObject({
      headline: "Life Transformed",
      terms: "18 months · paid in full",
      mindbodyReads: "Committed · 12 months · paying every 4 weeks",
    });
    expect(v.tier.source).toBe("override");
    const m2m = packageView(contracted(), { term: null, payment: "month-to-month", setAt: "2027-03-15T00:00:00Z" }, TODAY);
    expect(m2m).toMatchObject({ headline: "Month-to-month", terms: null });
  });

  it("adds the renewal's sentence only when it says more than the columns", () => {
    expect(packageView(contracted({ renewal: renewal() }), null, TODAY).status).toBeNull();
    expect(packageView(contracted({ renewal: renewal({ situation: "will-bank", bankedAtCharge: 6 }) }), null, TODAY).status).toBe(
      "Auto-renews Mar 14, 2028 with about 6 sessions still banked",
    );
    expect(
      packageView(contracted({ renewal: renewal({ situation: "ended", sessionsLeft: 0, focusDate: "2027-03-01" }) }), null, TODAY).status,
    ).toBe("Package ended Mar 1 — no new one in Mindbody yet");
  });

  it("dates a package paid in full, or on banked sessions, by when it runs out — an estimate, said so", () => {
    const pif = linked({
      mindbodyServices: { p: { serviceId: "p", name: "96 PIF", remaining: 60, count: 96 } } as unknown as Client["mindbodyServices"],
    });
    const prepaid = renewal({
      paymentMode: "prepaid",
      chargeDate: null,
      chargeDateSource: null,
      autoRenews: null,
      paymentsLeft: 0,
      sessionsLeft: 60,
      sessionsOnHand: 60,
      runOutDate: "2027-09-01",
      focusDate: "2027-09-01",
    });
    const v = packageView({ ...pif, renewal: prepaid }, null, TODAY);
    expect(v).toMatchObject({ left: "60 left", when: "Runs out around Sep 1 (estimated)", status: null, held: null });
    expect(packageView({ ...pif, renewal: { ...prepaid, runOutDate: "2028-01-10" } }, null, TODAY).when).toBe(
      "Runs out around Jan 10, 2028 (estimated)",
    );
    // Banked sessions after billing ended, no pace yet: no date to give, and it says so.
    const banked = packageView(
      { ...pif, renewal: { ...prepaid, paymentMode: "sessions-only", runOutDate: null, focusDate: null, pacePerWeek: null } },
      null,
      TODAY,
    );
    expect(banked.when).toBe("Run-out date not known yet");
    expect(banked.pace).toBe("Pace: not enough visits on record yet");
  });

  it("says a contract that has ended ended, and dates a used-up package by the job's own end", () => {
    const ended = contracted({
      mindbodyContracts: {
        k: {
          clientContractId: "k",
          status: "Active",
          contractName: "96 Sessions - 2X Week",
          startDate: ts("2025-08-01T00:00:00Z"),
          endDate: ts("2026-08-01T00:00:00Z"),
        },
      } as Client["mindbodyContracts"],
    });
    expect(packageView(ended, null, TODAY).when).toBe("Contract ended Aug 1, 2026");
    // The day it ends is still "ends".
    expect(packageView(ended, null, "2026-08-01").when).toBe("Contract ends Aug 1, 2026");
    const usedUp = packageView(
      linked({ renewal: renewal({ situation: "ended", paymentMode: null, chargeDate: null, sessionsLeft: null, focusDate: "2027-03-01" }) }),
      null,
      TODAY,
    );
    expect(usedUp.when).toBe("Ended Mar 1");
    expect(usedUp.tone).toBe("warn");
  });

  it("says an unknown renewal's gap once, not as the status and again beneath it", () => {
    const gap = "Mindbody shows no package for this client.";
    const v = packageView(
      contracted({ renewal: renewal({ situation: "unknown", sessionsLeft: null, sessionsLeftSource: null, dataGaps: [gap] }) }),
      null,
      TODAY,
    );
    expect(v.status).toBe(gap);
    expect(v.gap).toBeNull();
    // A gap the status does not say still shows.
    const other = packageView(
      contracted({ renewal: renewal({ situation: "will-bank", bankedAtCharge: 6, dataGaps: ["Contract \"X\" isn't matched."] }) }),
      null,
      TODAY,
    );
    expect(other.gap).toBe("Contract \"X\" isn't matched.");
  });

  it("counts on-hand one way: the package card and the sub-toggle agree, an unmatched pack included", () => {
    const withDropIn = contracted({
      mindbodyServices: {
        s: { serviceId: "s", name: "96 Sessions · 12 Mo", remaining: 5, count: 8 },
        d: { serviceId: "d", name: "Drop-in 3 pack", remaining: 3, count: 3 },
      } as unknown as Client["mindbodyServices"],
      renewal: renewal({
        situation: "unknown",
        sessionsLeft: null,
        sessionsLeftSource: null,
        sessionsOnHand: 5,
        dataGaps: ['"Drop-in 3 pack" (3 sessions) isn\'t matched to a package in Renewal settings, so it isn\'t counted.'],
      }),
    });
    expect(onHandTotal(withDropIn)).toBe(8);
    expect(packageView(withDropIn, null, TODAY).left).toBe("8 on hand");
    expect(accountTabHint(withDropIn)).toBe("8 on hand");
    // Beside an estimate of what is left, the firm number is on the page too.
    const estimated = { ...withDropIn, renewal: renewal({ sessionsLeftSource: "estimate", sessionsOnHand: 5 }) };
    expect(packageView(estimated, null, TODAY)).toMatchObject({ left: "95 left", held: "8 on hand in Mindbody now" });
    expect(accountTabHint(estimated)).toBe("8 on hand");
    // Mindbody's own figure needs no second number.
    expect(packageView({ ...withDropIn, renewal: renewal() }, null, TODAY).held).toBeNull();
  });

  it("says where the tier came from once: its evidence, else in a word", () => {
    expect(tierSourceLine(packageView(contracted(), null, TODAY).tier)).toBe(
      "Read from the Mindbody contract “96 Sessions - 2X Week”",
    );
    expect(tierSourceLine({ source: "override", evidence: "Locked by AJ" })).toBe("Locked by AJ");
    expect(tierSourceLine({ source: "unknown", evidence: null })).toBe("Mindbody hasn't said");
  });

  it("asks for the conversation only while no renewal is on the books", () => {
    expect(packageView(contracted({ renewal: renewal({ conversationDue: true }) }), null, TODAY).conversationDue).toBe(true);
    expect(
      packageView(
        contracted({ renewal: renewal({ conversationDue: true, renewalOnBooks: { cycleKey: "c", packageKey: null, startsOn: "2028-03-15" } }) }),
        null,
        TODAY,
      ).conversationDue,
    ).toBe(false);
  });
});

describe("autoRenewView — the package card's auto-renewal box (Sep 25 2026)", () => {
  const her = pronounsOf({ gender: "Female" });
  const them = pronounsOf(null);
  const BILLING = "This tells Journey's renewal screens what Mindbody is set to. It doesn't change her billing: auto-renewal itself is changed in Mindbody.";
  type Over = Partial<Parameters<typeof autoRenewView>[0]>;
  const view = (client: Client, over: Over = {}) =>
    autoRenewView({
      client,
      pendingMark: client.autoRenewMark ?? null,
      pendingOverride: null,
      canEdit: true,
      pronouns: her,
      studioName: "Westlake",
      ...over,
    });
  const on = (inherited: { renews: boolean; from: "package" | "studio" | "default" } | null, over: Partial<Client> = {}) =>
    contracted({
      renewal: renewal({
        ...V2,
        autoRenews: inherited?.renews ?? null,
        autoRenewsFrom: inherited?.from ?? null,
        autoRenewsInherited: inherited,
      }),
      ...over,
    });

  it("D2 — the standard, when the studio never answered: ticked, and never called the studio's answer", () => {
    const v = view(on({ renews: true, from: "default" }));
    expect(v).toMatchObject({ kind: "pick", pressed: true, canClear: false, contractId: "k" });
    expect(v.source).toBe(
      "Westlake hasn't said whether its packages renew by themselves. The standard is yes, so this starts ticked. Untick if she isn't on auto-renewal.",
    );
    expect(v.metas).toEqual([BILLING]);
  });

  it("C — the package's answer, either way", () => {
    expect(view(on({ renews: true, from: "package" }))).toMatchObject({
      pressed: true,
      source: "Westlake set Committed to renew automatically, so this starts ticked. Untick if she isn't on auto-renewal.",
    });
    expect(view(on({ renews: false, from: "package" }))).toMatchObject({
      pressed: false,
      source: "Westlake set Committed not to renew by itself, so this starts unticked. Tick if she is on auto-renewal.",
    });
  });

  it("D — the studio's answer, either way", () => {
    expect(view(on({ renews: true, from: "studio" }))).toMatchObject({
      pressed: true,
      source: "Westlake's packages renew automatically, so this starts ticked. Untick if she isn't on auto-renewal.",
    });
    expect(view(on({ renews: false, from: "studio" }))).toMatchObject({
      pressed: false,
      source: "Westlake's packages don't renew by themselves, so this starts unticked. Tick if she is on auto-renewal.",
    });
  });

  it("D3 — no inherited answer: both answers offered, neither chosen, and nothing read as 'no'", () => {
    expect(view(on(null))).toMatchObject({
      kind: "pick",
      pair: true,
      answer: null,
      pressed: false,
      canClear: false,
      source:
        "Journey can't tell: Mindbody hasn't said, and this contract isn't matched to a package in Renewal settings. Tap one once you know whether she is on auto-renewal.",
    });
    // Picking "no" is an answer, staged and then saved.
    expect(view(on(null), { pendingMark: mark(false) })).toMatchObject({
      pair: true,
      answer: false,
      pressed: false,
      canClear: true,
      source: "Tap Save changes on the bar to keep it.",
    });
    const saidNo = on(null, { autoRenewMark: mark(false) });
    saidNo.renewal = { ...saidNo.renewal!, autoRenews: false, autoRenewsFrom: "client" };
    expect(view(saidNo)).toMatchObject({ pair: true, answer: false, canClear: true, source: "Marked by AJ · Mar 15, 2027." });
    // Wherever there is an inherited answer, one box: unticked honestly means "no".
    expect(view(on({ renews: false, from: "studio" }))).toMatchObject({ pair: false, answer: false });
    expect(view(on({ renews: true, from: "default" }))).toMatchObject({ pair: false, answer: true });
  });

  it("E — a saved mark for this contract names who marked it, and offers to remove it", () => {
    const c = on({ renews: true, from: "default" }, { autoRenewMark: mark(false) });
    // As the nightly run wrote it once the mark was saved.
    c.renewal = { ...c.renewal!, autoRenews: false, autoRenewsFrom: "client" };
    const v = view(c);
    expect(v).toMatchObject({ kind: "pick", pressed: false, canClear: true, source: "Marked by AJ · Mar 15, 2027." });
    expect(v.metas).toEqual([BILLING]);
    const anon = on({ renews: true, from: "default" }, { autoRenewMark: mark(false, "k", { setByName: undefined }) });
    expect(view(anon).source).toBe("Marked Mar 15, 2027.");
  });

  it("F — a staged mark or a staged clear says what Save will do", () => {
    const c = on({ renews: true, from: "studio" });
    const staged = view(c, { pendingMark: mark(false) });
    expect(staged).toMatchObject({ pressed: false, canClear: true, source: "Tap Save changes on the bar to keep it." });
    const saved = on({ renews: true, from: "studio" }, { autoRenewMark: mark(false) });
    const cleared = view(saved, { pendingMark: null });
    expect(cleared).toMatchObject({ pressed: true, canClear: false, source: "Back to the studio's answer when you save." });
  });

  it("F — a staged clear names where it goes back to: the package's, the standard, or no answer at all", () => {
    const clear = (inherited: Parameters<typeof on>[0]) => view(on(inherited, { autoRenewMark: mark(true) }), { pendingMark: null });
    expect(clear({ renews: false, from: "package" })).toMatchObject({
      pressed: false,
      source: "Back to the package's answer when you save.",
    });
    // The standard is never credited to the studio.
    expect(clear({ renews: true, from: "default" })).toMatchObject({
      pressed: true,
      source: "Back to the standard answer (the studio hasn't set one) when you save.",
    });
    expect(clear(null)).toMatchObject({
      pair: true,
      answer: null,
      pressed: false,
      source:
        "Back to no answer when you save: Mindbody hasn't said, and this contract isn't matched to a package in Renewal settings.",
    });
  });

  it("G — saved, while the stored nightly snapshot still disagrees: the lists catch up tonight", () => {
    const v = view(on({ renews: true, from: "studio" }, { autoRenewMark: mark(false) }));
    expect(v.pressed).toBe(false);
    expect(v.metas).toEqual([BILLING, "The renewal lists catch up tonight."]);
  });

  it("K — a mark from the contract before this one is shown, never used", () => {
    const v = view(on({ renews: true, from: "studio" }, { autoRenewMark: mark(false, "old") }));
    expect(v).toMatchObject({
      pressed: true,
      canClear: false,
      source: "Westlake's packages renew automatically, so this starts ticked. Untick if she isn't on auto-renewal.",
    });
    expect(v.metas).toEqual([BILLING, "AJ's mark was for the contract before this one."]);
  });

  it("A and B — where Mindbody's contract has said, a line and no box", () => {
    const withFlag = (isAutoRenewing: boolean) =>
      on(
        { renews: true, from: "default" },
        {
          mindbodyContracts: {
            k: { ...contracted().mindbodyContracts!.k, isAutoRenewing },
          } as Client["mindbodyContracts"],
          autoRenewMark: mark(!isAutoRenewing),
        },
      );
    expect(view(withFlag(true))).toMatchObject({
      kind: "line",
      pressed: true,
      source: "On auto-renewal · Mindbody's contract says so. Change it in Mindbody.",
    });
    expect(view(withFlag(false))).toMatchObject({
      kind: "line",
      pressed: false,
      source: "Not on auto-renewal · Mindbody's contract says so. Change it in Mindbody.",
    });
  });

  it("H — a reader who may not edit gets the answer in words, and nothing when there is none", () => {
    const read = (c: Client) => view(c, { canEdit: false });
    expect(read(on({ renews: true, from: "studio" }))).toMatchObject({
      kind: "line",
      source: "On auto-renewal · the studio's answer",
    });
    expect(read(on({ renews: true, from: "default" })).source).toBe(
      "On auto-renewal · the standard answer (the studio hasn't set one)",
    );
    const marked = on({ renews: true, from: "studio" }, { autoRenewMark: mark(false) });
    expect(read(marked).source).toBe("Not on auto-renewal · marked by AJ · Mar 15, 2027");
    const mindbody = on(
      { renews: true, from: "default" },
      { mindbodyContracts: { k: { ...contracted().mindbodyContracts!.k, isAutoRenewing: true } } as Client["mindbodyContracts"] },
    );
    expect(read(mindbody).source).toBe("On auto-renewal · Mindbody's contract");
    expect(read(on(null)).kind).toBeNull();
  });

  it("I — a snapshot from before tonight's run: the box comes after it", () => {
    const v1 = contracted({ renewal: renewal({ clientContractId: "k", autoRenews: null }) });
    expect(view(v1)).toMatchObject({ kind: "note", metas: ["Auto-renewal can be marked here after tonight's renewal run."] });
    expect(view(v1, { canEdit: false }).kind).toBeNull();
    // A version-1 flag was Mindbody's own.
    const v1Flag = contracted({ renewal: renewal({ clientContractId: "k", autoRenews: true }) });
    expect(view(v1Flag)).toMatchObject({ kind: "line", source: "On auto-renewal · Mindbody's contract says so. Change it in Mindbody." });
  });

  it("is not there for paid in full, banked sessions, no charge date, or a staged paid-in-full lock", () => {
    const def = { renews: true, from: "default" } as const;
    expect(view(on(def, { renewal: renewal({ ...V2, paymentMode: "prepaid", chargeDate: null }) })).kind).toBeNull();
    expect(view(on(def, { renewal: renewal({ ...V2, paymentMode: "sessions-only" }) })).kind).toBeNull();
    expect(view(on(def, { renewal: renewal({ ...V2, chargeDate: null }) })).kind).toBeNull();
    expect(view(contracted()).kind).toBeNull();
    const lock = (payment: ContractTierOverride["payment"]): ContractTierOverride => ({ term: 12, payment, setAt: "2027-03-15T14:00:00.000Z" });
    expect(view(on(def), { pendingOverride: lock("pif") }).kind).toBeNull();
    expect(view(on(def), { pendingOverride: lock("sessions-only") }).kind).toBeNull();
    expect(view(on(def), { pendingOverride: lock("monthly") }).kind).toBe("pick");
    // Saved, as the form holds it: no box, for any reader.
    const locked = on(def, { contractTierOverride: lock("pif") });
    expect(view(locked, { pendingOverride: lock("pif") }).kind).toBeNull();
    expect(view(locked, { pendingOverride: lock("pif"), canEdit: false }).kind).toBeNull();
    // A saved lock staged to come off: the box, on the answer it has without it.
    expect(view(locked, { pendingOverride: null })).toMatchObject({ kind: "pick", pressed: true, answer: true, pair: false });
  });

  it("speaks in the pronoun, and names 'the studio' when it has no name", () => {
    const v = view(on({ renews: true, from: "default" }), { pronouns: them, studioName: null });
    expect(v.source).toBe(
      "The studio hasn't said whether its packages renew by themselves. The standard is yes, so this starts ticked. Untick if they aren't on auto-renewal.",
    );
    expect(v.metas[0]).toContain("It doesn't change their billing");
    expect(view(on({ renews: false, from: "studio" }), { pronouns: them, studioName: "" }).source).toBe(
      "The studio's packages don't renew by themselves, so this starts unticked. Tick if they are on auto-renewal.",
    );
  });
});

describe("tabTone", () => {
  it("never paints a package crimson: ended and lapsed are a caution", () => {
    expect(tabTone("lapsed")).toBe("warn");
    expect(tabTone("ended")).toBe("warn");
    expect(tabTone("will-bank")).toBe("warn");
    expect(tabTone("on-track")).toBe("ok");
    expect(tabTone("away")).toBe("neutral");
    expect(tabTone(null)).toBe("neutral");
  });
});

/* ------------------------------------------------------------------ */
/* The contract history                                                */
/* ------------------------------------------------------------------ */

describe("membershipTimeline", () => {
  const prior: PriorHistory = { sessions: 412, from: "2019-03-01", through: "2026-09-12", source: "filemaker", importedCount: 0 };
  const rows = buildContractHistory(
    {
      mindbodyContracts: {
        b: {
          clientContractId: "b",
          status: "Active",
          contractName: "96 Sessions - 2X Week",
          startDate: ts("2027-03-14T00:00:00Z"),
          endDate: ts("2028-03-14T00:00:00Z"),
          isAutoRenewing: true,
        },
        a: {
          clientContractId: "a",
          status: "Active",
          contractName: "96 Sessions - 2X Week",
          startDate: ts("2026-03-14T00:00:00Z"),
          endDate: ts("2027-03-14T00:00:00Z"),
        },
        x: { clientContractId: "x", status: "Active", contractName: "Old import" },
      } as Client["mindbodyContracts"],
      mindbodyServices: {
        p: { serviceId: "p", name: "48 PIF", remaining: 3, count: 48, activeDate: ts("2025-01-10T00:00:00Z") },
      } as unknown as Client["mindbodyServices"],
    },
    TODAY,
  );

  it("puts the years before Journey first and dashed, then the terms oldest first", () => {
    const tiles = membershipTimeline(rows, prior, "partial");
    expect(tiles.map((t) => [t.when, t.era])).toEqual([
      ["Mar 2019 – Sep 2026", true],
      ["Jan 2025 – no expiry", false],
      ["Mar 2026 – Mar 2027", false],
      ["Mar 2027 – Mar 2028", false],
      ["Start not synced – open-ended", false],
    ]);
    expect(tiles[0]).toMatchObject({ name: "412 sessions in FileMaker", meta: "Before Journey", status: null });
    expect(tiles[1]).toMatchObject({ pills: ["6 mo", "Paid in full"], sessions: "3 of 48 sessions left" });
    expect(tiles[3]).toMatchObject({ statusText: "Active", pills: ["12 mo", "Auto-renews"] });
  });

  it("shows Auto-renews only when Mindbody's flag says so, never from autopay", () => {
    const pillsOf = (contract: Partial<MindbodyContract>) =>
      membershipTimeline(
        buildContractHistory(
          {
            mindbodyContracts: {
              c: { clientContractId: "c", status: "Active", contractName: "96 Sessions - 2X Week", ...contract },
            } as Client["mindbodyContracts"],
          },
          TODAY,
        ),
        null,
        "complete",
      )[0].pills;
    expect(pillsOf({ isAutoRenewing: true })).toEqual(["12 mo", "Auto-renews"]);
    // A studio without auto-renew, with the payments still running.
    expect(pillsOf({ isAutoRenewing: false, autopayStatus: "Active" })).toEqual(["12 mo"]);
    // Autopay alone only says the monthly payments are running.
    expect(pillsOf({ autopayStatus: "Active" })).toEqual(["12 mo"]);
  });

  it("reads a contract start as its UTC day: Mar 2026, never Feb", () => {
    const march = membershipTimeline(
      buildContractHistory(
        {
          mindbodyContracts: {
            m: { clientContractId: "m", status: "Active", contractName: "C", startDate: "2026-03-01T00:00:00Z", endDate: "2027-03-01T00:00:00Z" },
          } as Client["mindbodyContracts"],
        },
        TODAY,
      ),
      null,
      "complete",
    );
    expect(march[0].when).toBe("Mar 2026 – Mar 2027");
  });

  it("has no era tile for a story Journey holds whole, and an undated one otherwise", () => {
    expect(membershipTimeline(rows, null, "complete").some((t) => t.era)).toBe(false);
    const unknown = membershipTimeline(rows, null, "unknown");
    expect(unknown[0]).toMatchObject({ era: true, when: "Before Journey", name: "Not recorded here" });
    expect(unknown[0].meta).toContain("may not be recorded");
    // A prior record of no sessions says nothing happened before Journey.
    expect(membershipTimeline(rows, { ...prior, sessions: 0 }, "complete").some((t) => t.era)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* The sub-toggle and the Overview                                     */
/* ------------------------------------------------------------------ */

describe("accountTabHint", () => {
  it("says what is left only on Mindbody's own figures, else what she holds, else nothing", () => {
    expect(accountTabHint(contracted({ renewal: renewal() }))).toBe("95 sessions left");
    expect(accountTabHint(contracted({ renewal: renewal({ sessionsLeft: 1 }) }))).toBe("1 session left");
    expect(accountTabHint(contracted({ renewal: renewal({ sessionsLeftSource: "estimate", sessionsOnHand: 7 }) }))).toBe("7 on hand");
    expect(accountTabHint(contracted())).toBe("7 on hand");
    expect(accountTabHint(contracted({ renewal: renewal({ situation: "lapsed" }) }))).toBe("package ended");
    expect(accountTabHint(linked())).toBeNull();
  });

  it("stays short enough for the portrait bar", () => {
    for (const c of [contracted({ renewal: renewal({ sessionsLeft: 144 }) }), contracted(), contracted({ renewal: renewal({ situation: "ended" }) })]) {
      expect((accountTabHint(c) ?? "").length).toBeLessThanOrEqual(18);
    }
  });
});

describe("accountGlance", () => {
  const studios = [
    { id: "westlake", name: "Westlake" },
    { id: "solon", name: "Solon" },
  ] as Studio[];

  it("gives the Overview her age and birthday, emergency, waiver, package and studios", () => {
    const g = accountGlance(
      contracted({
        renewal: renewal(),
        isLiabilityReleased: true,
        liabilityAgreementDate: ts("2019-03-04T00:00:00Z"),
        approvedCrossTrainStudioIds: ["solon"],
      }),
      studios,
      TODAY,
      NOW,
    );
    expect(g.lines).toEqual([
      "68, turns 69 on Apr 2 · Female",
      "Emergency: Tom Brennan, husband",
      "Liability waiver signed Mar 4, 2019",
      "95 sessions left · auto-renews Mar 14, 2028",
      "Committed · 12 months · paying every 4 weeks",
      "Home: Westlake · also trains at Solon",
    ]);
    // The same lines, split the way the Overview draws its two columns.
    expect(g.who).toEqual(g.lines.slice(0, 3));
    expect(g.membership).toEqual(g.lines.slice(3));
    expect(g.foot).toBe("From Mindbody, synced 2 days ago · the renewal is worked out nightly");
  });

  it("says the decided auto-renew answer in every renewal screen's words, and claims none it hasn't got", () => {
    const line = (autoRenews: boolean | null) =>
      accountGlance(contracted({ renewal: renewal({ autoRenews }) }), studios, TODAY, NOW).membership[0];
    expect(line(true)).toBe("95 sessions left · auto-renews Mar 14, 2028");
    expect(line(false)).toBe("95 sessions left · billing ends Mar 14, 2028");
    expect(line(null)).toBe("95 sessions left · payments finish Mar 14, 2028");
    // A saved "not on auto-renewal" mark reads at once, before tonight's run.
    const marked = accountGlance(
      contracted({
        renewal: renewal({ ...V2, autoRenewsFrom: "studio", autoRenewsInherited: { renews: true, from: "studio" } }),
        autoRenewMark: mark(false),
      }),
      studios,
      TODAY,
      NOW,
    );
    expect(marked.membership[0]).toBe("95 sessions left · billing ends Mar 14, 2028");
  });

  it("leaves out what is not on file, and never an unknown tier", () => {
    const g = accountGlance(linked({ homeStudioId: "", dateOfBirth: "", gender: "", emergencyContactName: "" }), studios, TODAY, NOW);
    expect(g.lines).toEqual(["Liability waiver not synced yet"]);
    expect(g.who).toEqual(["Liability waiver not synced yet"]);
    expect(g.membership).toEqual([]);
    const never = accountGlance(linked({ mindbodyMasterSyncedAt: undefined }), studios, TODAY, NOW);
    expect(never.foot).toBe("From Mindbody, never synced · the renewal is worked out nightly");
  });

  it("says what the page says of a client Mindbody does not hold: typed in Journey, no waiver to sync", () => {
    const g = accountGlance(unlinked({ homeStudioId: "" }), studios, TODAY, NOW);
    expect(g.lines).toEqual([]);
    expect(g.foot).toBe("Typed in Journey · not linked to Mindbody");
    expect(accountGlance(linked({ provisional: true }), studios, TODAY, NOW).foot).toBe("Typed in Journey · not linked to Mindbody");
  });
});

describe("accountLede", () => {
  const her = pronounsOf({ gender: "Female" });
  it("is true for the client and the reader", () => {
    expect(accountLede(linked(), true, her)).toBe(
      "Her contact details as Mindbody knows them, then her membership. The nickname, how she found us, where she can train, the tier lock and auto-renewal are marked here; everything else changes in Mindbody and arrives with the next sync.",
    );
    expect(accountLede(unlinked(), true, her)).toBe(
      "Her contact details as typed into Journey, then her membership. Mindbody does not hold her yet, so her details are typed here until she is linked.",
    );
    expect(accountLede(linked(), false, her)).toBe(
      "Her contact details as Mindbody knows them, then her membership. Read only here: her home studio keeps the record.",
    );
    expect(accountLede(unlinked(), false, pronounsOf(null))).toBe(
      "Their contact details as typed into Journey, then their membership. Read only here: their home studio keeps the record.",
    );
    expect(accountLede(unlinked(), true, pronounsOf(null))).toContain("until they are linked");
  });
});

describe("the module", () => {
  it("uses no regex lookbehind (iPadOS Safari)", () => {
    expect(readFileSync(join(HERE, "account.ts"), "utf8")).not.toContain("(?<");
  });
});


/*
 * Left in the contract, and extra (AJ, Sep 26 2026): "How many left in their
 * contract is the correct number, but ... clients can be given sessions that
 * also plays a part, so a left in contract and then extra sessions works."
 * Judy Daus's real options, from her fine print: "96 Sessions - PIF: 36 of 96"
 * and "Session Comp: 12 of 12" — read as "36 LEFT · PIF" on the header and
 * "48 on hand" on Account.
 */
describe("sessionsSplit — left in the contract, and extra", () => {
  const index = buildPackageNameIndex(DEFAULT_RENEWAL_SETTINGS);
  const services = (rows: Array<[string, number, number]>): Pick<Client, "mindbodyServices"> =>
    ({
      mindbodyServices: Object.fromEntries(
        rows.map(([name, remaining, count], i) => [`s${i}`, { serviceId: `s${i}`, name, remaining, count }]),
      ),
    }) as unknown as Pick<Client, "mindbodyServices">;
  const judy = services([
    ["96 Sessions - PIF", 36, 96],
    ["Session Comp", 12, 12],
  ]);

  it("splits Judy's 48 into the 36 left in her contract and the 12 she was given", () => {
    const split = sessionsSplit(judy, index);
    expect(split).toEqual({ contract: 36, hasContract: true, perPayment: false, extra: 12, other: 0 });
    expect(contractWords(split)).toBe("36 left in contract");
    expect(extraWords(split)).toBe("+12 extra");
    // The total the fine print adds up is still the same 48.
    expect(onHandTotal(judy)).toBe(48);
  });

  it("reads a location's own spelling of a package by its name, and the studio's table by its own", () => {
    // "96 Sessions - PIF" is not in the default table; its name says what it is.
    expect(sessionsSplit(services([["96 Sessions - PIF", 36, 96]]), index).hasContract).toBe(true);
    // "144 PIF" is in the default table.
    expect(sessionsSplit(services([["144 PIF", 100, 144]]), index)).toMatchObject({ contract: 100, perPayment: false });
  });

  it("says ON HAND, never left in the contract, when the contract comes a payment at a time", () => {
    const monthly = sessionsSplit(services([["48 Sessions - 2X Week", 5, 8], ["Session Comp", 2, 2]]), index);
    expect(monthly).toMatchObject({ contract: 5, perPayment: true, extra: 2 });
    expect(contractWords(monthly)).toBe("5 on hand in contract");
  });

  it("never guesses an option it cannot place into either", () => {
    const split = sessionsSplit(services([["10 Pack", 3, 10], ["Intro Offer", 1, 3], ["96 Sessions - PIF", 36, 96]]), index);
    expect(split).toMatchObject({ contract: 36, extra: 0, other: 4 });
  });

  it("gives a lone comp no contract: extra, never left", () => {
    const split = sessionsSplit(services([["Session Comp", 2, 2]]), index);
    expect(split).toMatchObject({ hasContract: false, contract: 0, extra: 2 });
    expect(contractWords(split)).toBeNull();
    expect(extraWords(split)).toBe("+2 extra");
  });

  it("keeps a used-up contract as 0 left in contract beside what she was given", () => {
    const split = sessionsSplit(services([["96 Sessions - PIF", 0, 96], ["Session Comp", 4, 4]]), index);
    expect(contractWords(split)).toBe("0 left in contract");
    expect(extraWords(split)).toBe("+4 extra");
  });

  it("puts the pair on Account's sub-toggle, short enough for the portrait bar", () => {
    const client = { ...judy } as Client;
    expect(accountTabHint(client, sessionsSplit(judy, index))).toBe("36 left +12 extra");
    expect(accountTabHint(client, sessionsSplit(services([["144 PIF", 120, 144], ["Session Comp", 12, 12]]), index))).toBe(
      "120 left +12 extra",
    );
    expect((accountTabHint(client, sessionsSplit(services([["144 PIF", 120, 144], ["Session Comp", 12, 12]]), index)) ?? "").length).toBeLessThanOrEqual(18);
    const monthly = services([["48 Sessions - 2X Week", 5, 8]]);
    expect(accountTabHint(monthly as Client, sessionsSplit(monthly, index))).toBe("5 on hand");
    const comp = services([["Session Comp", 2, 2]]);
    expect(accountTabHint(comp as Client, sessionsSplit(comp, index))).toBe("+2 extra");
    // Without the split, what she holds, as before.
    expect(accountTabHint(client)).toBe("48 on hand");
  });

  it("puts the pair on the package card, and leaves a worked-out renewal to speak for itself", () => {
    const view = packageView(judy as PackageClientLike, null, TODAY, sessionsSplit(judy, index));
    expect(view.left).toBe("36 left");
    expect(view.leftWords).toBe("sessions left in the contract");
    expect(view.held).toBe("+12 extra sessions, on top of the contract");
    const monthly = services([["48 Sessions - 2X Week", 5, 8], ["10 Pack", 3, 10]]);
    const m = packageView(monthly as PackageClientLike, null, TODAY, sessionsSplit(monthly, index));
    expect(m.left).toBe("5 on hand");
    expect(m.held).toBe("3 more sessions on options not matched to a package");
    // A renewal the nightly job worked out still says what is left.
    const withRenewal = packageView({ ...judy, renewal: renewal() } as PackageClientLike, null, TODAY, sessionsSplit(judy, index));
    expect(withRenewal.left).toBe(`${renewal().sessionsLeft} left`);
  });
});

type PackageClientLike = Parameters<typeof packageView>[0];
