import { describe, expect, it } from "vitest";
import {
  STUDIO_AUTO_RENEW_DEFAULT,
  decideAutoRenew,
  lockSaysNothingBills,
  markAfterTap,
  markFor,
  packageRenews,
  renewalOf,
  type AutoRenewInputs,
} from "./auto-renew";
import type { AutoRenewMark, Client, ContractTierOverride } from "../../types";
import type { AutoRenewSource, RenewalSnapshot } from "./types";

const mark = (renews: boolean, contractId = "c1", over: Partial<AutoRenewMark> = {}): AutoRenewMark => ({
  renews,
  contractId,
  setAt: "2026-09-25T14:00:00.000Z",
  setById: "uid-aj",
  setByName: "AJ",
  ...over,
});
const lock = (payment: ContractTierOverride["payment"]): ContractTierOverride => ({
  term: 12,
  payment,
  setAt: "2026-09-25T14:00:00.000Z",
  setByName: "AJ",
});

describe("decideAutoRenew — the one order", () => {
  const MINDBODY = [true, false, undefined] as const;
  const MARKS = [
    ["true", mark(true)],
    ["false", mark(false)],
    ["none", null],
    ["other contract", mark(false, "c0")],
  ] as const;
  const TIER = [true, false] as const;
  const ANSWERS = [true, false, undefined] as const;

  /** The order, written out once more by hand: the table the function must agree with. */
  function expected(i: AutoRenewInputs): { renews: boolean; from: AutoRenewSource } | null {
    if (typeof i.mindbody === "boolean") return { renews: i.mindbody, from: "mindbody" };
    if (i.mark && i.mark.contractId === "c1") return { renews: i.mark.renews, from: "client" };
    if (!i.tierMatched) return null;
    if (typeof i.pkg === "boolean") return { renews: i.pkg, from: "package" };
    if (typeof i.studio === "boolean") return { renews: i.studio, from: "studio" };
    return { renews: true, from: "default" };
  }

  it("agrees with the order for every combination: Mindbody, this contract's mark, (unmatched: nothing), package, studio, the standard ON", () => {
    let n = 0;
    for (const mindbody of MINDBODY)
      for (const [, m] of MARKS)
        for (const tierMatched of TIER)
          for (const pkg of ANSWERS)
            for (const studio of ANSWERS) {
              const i: AutoRenewInputs = { contractId: "c1", mindbody, mark: m, tierMatched, pkg, studio };
              expect(decideAutoRenew(i), JSON.stringify(i)).toEqual(expected(i));
              n++;
            }
    expect(n).toBe(3 * 4 * 2 * 3 * 3);
  });

  it("is ON by default, from 'default' — never credited to the studio", () => {
    expect(STUDIO_AUTO_RENEW_DEFAULT).toBe(true);
    expect(decideAutoRenew({ contractId: "c1", tierMatched: true })).toEqual({ renews: true, from: "default" });
  });

  it("gives no answer with nothing running, whatever the mark says", () => {
    for (const contractId of [null, ""]) {
      expect(decideAutoRenew({ contractId, mindbody: true, mark: mark(true), tierMatched: true, studio: true })).toBeNull();
    }
  });

  it("skips malformed values rather than trusting them", () => {
    const i = { contractId: "c1", tierMatched: true } as const;
    expect(decideAutoRenew({ ...i, mindbody: "yes" })).toEqual({ renews: true, from: "default" });
    expect(decideAutoRenew({ ...i, mark: { renews: "yes", contractId: "c1" } as unknown as AutoRenewMark })).toEqual({
      renews: true,
      from: "default",
    });
    expect(decideAutoRenew({ ...i, pkg: "no", studio: "no" })).toEqual({ renews: true, from: "default" });
    expect(decideAutoRenew({ ...i, pkg: 0, studio: false })).toEqual({ renews: false, from: "studio" });
  });

  it("gives no answer under a coach's paid-in-full or banked-sessions lock, whatever Mindbody, a mark or the studio say", () => {
    for (const payment of ["pif", "sessions-only"] as const) {
      expect(lockSaysNothingBills(lock(payment))).toBe(true);
      for (const mindbody of [true, false, undefined])
        expect(
          decideAutoRenew({ contractId: "c1", mindbody, mark: mark(true), tierMatched: true, studio: true, lock: lock(payment) }),
          `${payment} ${mindbody}`,
        ).toBeNull();
    }
    // A monthly or month-to-month lock still bills: the order as ever.
    for (const payment of ["monthly", "month-to-month"] as const) {
      expect(lockSaysNothingBills(lock(payment))).toBe(false);
      expect(decideAutoRenew({ contractId: "c1", tierMatched: true, lock: lock(payment) })).toEqual({ renews: true, from: "default" });
    }
    expect(lockSaysNothingBills(null)).toBe(false);
    expect(lockSaysNothingBills({ payment: "PIF" })).toBe(false);
  });

  it("uses a mark only on the contract it was made on", () => {
    expect(markFor(mark(true), "c1")).toBe(true);
    expect(markFor(mark(true), "c2")).toBe(false);
    expect(markFor(null, "c1")).toBe(false);
    expect(markFor(mark(true), null)).toBe(false);
  });
});

describe("packageRenews — the packages screen's answer", () => {
  it("takes the package's own answer over the studio's", () => {
    expect(packageRenews({ renewsAutomatically: true }, { packagesRenewAutomatically: false })).toBe(true);
    expect(packageRenews({ renewsAutomatically: false }, { packagesRenewAutomatically: true })).toBe(false);
  });

  it("inherits the studio's answer when the package hasn't one, and the standard ON when neither has", () => {
    expect(packageRenews({}, { packagesRenewAutomatically: false })).toBe(false);
    expect(packageRenews({}, { packagesRenewAutomatically: true })).toBe(true);
    expect(packageRenews({}, {})).toBe(true);
  });
});

describe("renewalOf — one client's renewal, with the mark and Mindbody as they are now", () => {
  const snapshot = (over: Partial<RenewalSnapshot> = {}): RenewalSnapshot =>
    ({
      version: 2,
      paymentMode: "monthly",
      clientContractId: "c1",
      chargeDate: "2026-11-14",
      situation: "will-bank",
      chargeWarning: true,
      bankedAtCharge: 12,
      autoRenews: true,
      autoRenewsFrom: "studio",
      autoRenewsInherited: { renews: true, from: "studio" },
      ...over,
    }) as RenewalSnapshot;
  const client = (over: Partial<Client> = {}) =>
    ({ renewal: snapshot(), ...over }) as Pick<Client, "renewal" | "autoRenewMark" | "mindbodyContracts" | "contractTierOverride">;

  it("returns the same object when nothing changes", () => {
    const c = client();
    expect(renewalOf(c)).toBe(c.renewal);
    const withMark = client({ renewal: snapshot({ autoRenews: false, autoRenewsFrom: "client", chargeWarning: false }), autoRenewMark: mark(false) });
    expect(renewalOf(withMark)).toBe(withMark.renewal);
  });

  it("leaves a version-1 snapshot, or one that isn't a monthly contract, as it was", () => {
    const v1 = client({ renewal: snapshot({ version: 1 }), autoRenewMark: mark(false) });
    expect(renewalOf(v1)).toBe(v1.renewal);
    const pif = client({ renewal: snapshot({ paymentMode: "prepaid" }), autoRenewMark: mark(false) });
    expect(renewalOf(pif)).toBe(pif.renewal);
    expect(renewalOf({})).toBeNull();
    expect(renewalOf(null)).toBeNull();
  });

  it("applies a saved 'not on auto-renewal' at once: the answer, its source, and no warning", () => {
    const r = renewalOf(client({ autoRenewMark: mark(false) }))!;
    expect(r.autoRenews).toBe(false);
    expect(r.autoRenewsFrom).toBe("client");
    expect(r.autoRenewsInherited).toEqual({ renews: true, from: "studio" });
    expect(r.chargeWarning).toBe(false);
  });

  it("never turns a warning ON: that needs the studio's window, which waits for the night", () => {
    const r = renewalOf(
      client({
        renewal: snapshot({ autoRenews: false, autoRenewsFrom: "studio", autoRenewsInherited: { renews: false, from: "studio" }, chargeWarning: false }),
        autoRenewMark: mark(true),
      }),
    )!;
    expect(r.autoRenews).toBe(true);
    expect(r.autoRenewsFrom).toBe("client");
    expect(r.chargeWarning).toBe(false);
  });

  it("ignores a mark made on another contract", () => {
    const c = client({ autoRenewMark: mark(false, "c0") });
    expect(renewalOf(c)).toBe(c.renewal);
  });

  it("lets Mindbody's flag, landed today, beat the mark and last night's inherited answer", () => {
    const r = renewalOf(
      client({
        autoRenewMark: mark(true),
        mindbodyContracts: { c1: { clientContractId: "c1", status: "Active", isAutoRenewing: false } },
      }),
    )!;
    expect(r.autoRenews).toBe(false);
    expect(r.autoRenewsFrom).toBe("mindbody");
    expect(r.autoRenewsInherited).toEqual({ renews: false, from: "mindbody" });
    expect(r.chargeWarning).toBe(false);
  });

  it("lets today's Mindbody flag beat last night's Mindbody answer", () => {
    const r = renewalOf(
      client({
        renewal: snapshot({ autoRenews: true, autoRenewsFrom: "mindbody", autoRenewsInherited: { renews: true, from: "mindbody" } }),
        mindbodyContracts: { c1: { clientContractId: "c1", status: "Active", isAutoRenewing: false } },
      }),
    )!;
    expect(r.autoRenews).toBe(false);
    expect(r.autoRenewsFrom).toBe("mindbody");
    expect(r.chargeWarning).toBe(false);
    expect(r.autoRenewsInherited).toEqual({ renews: false, from: "mindbody" });
  });

  it("claims no renewal under a saved paid-in-full lock, keeps the answer without it, and never turns a warning on or off for it", () => {
    for (const payment of ["pif", "sessions-only"] as const) {
      const r = renewalOf(client({ contractTierOverride: lock(payment), autoRenewMark: mark(true) }))!;
      expect(r.autoRenews, payment).toBeNull();
      expect(r.autoRenewsFrom, payment).toBeNull();
      expect(r.autoRenewsInherited, payment).toEqual({ renews: true, from: "studio" });
      expect(r.chargeWarning, payment).toBe(true);
    }
    // As the engine wrote it under the lock: nothing changes.
    const stored = client({
      renewal: snapshot({ autoRenews: null, autoRenewsFrom: null }),
      contractTierOverride: lock("pif"),
    });
    expect(renewalOf(stored)).toBe(stored.renewal);
    // The lock comes off: the answer it had without it, at once.
    expect(renewalOf({ ...stored, contractTierOverride: null })!.autoRenews).toBe(true);
    // A monthly lock bills: no change.
    const monthly = client({ contractTierOverride: lock("monthly") });
    expect(renewalOf(monthly)).toBe(monthly.renewal);
  });

  it("rebuilds the standard and an unmatched package from last night's inherited answer", () => {
    const standard = renewalOf(
      client({ renewal: snapshot({ autoRenewsFrom: "default", autoRenewsInherited: { renews: true, from: "default" } }) }),
    )!;
    expect(standard.autoRenewsFrom).toBe("default");
    const unmatched = client({
      renewal: snapshot({ autoRenews: null, autoRenewsFrom: null, autoRenewsInherited: null, chargeWarning: false, situation: "unknown" }),
    });
    expect(renewalOf(unmatched)).toBe(unmatched.renewal);
    const ticked = renewalOf({ ...unmatched, autoRenewMark: mark(true) })!;
    expect(ticked.autoRenews).toBe(true);
    expect(ticked.autoRenewsFrom).toBe("client");
    expect(ticked.autoRenewsInherited).toBeNull();
  });
});

describe("markAfterTap — what one tap on the box stages", () => {
  const NOW = new Date("2026-09-25T15:30:00.000Z");
  const author = { id: "uid-aj", name: "AJ" };

  it("stages a stamped mark, named with the Auth uid", () => {
    expect(markAfterTap({ want: false, saved: null, contractId: "c1", author, now: NOW })).toEqual({
      renews: false,
      contractId: "c1",
      setAt: "2026-09-25T15:30:00.000Z",
      setById: "uid-aj",
      setByName: "AJ",
    });
  });

  it("gives back the SAVED mark itself on a tap back to it, so the form is clean again", () => {
    const saved = mark(false);
    expect(markAfterTap({ want: false, saved, contractId: "c1", author, now: NOW })).toBe(saved);
  });

  it("pins a tap back with nothing saved: a new stamped mark, not 'nothing'", () => {
    const next = markAfterTap({ want: true, saved: null, contractId: "c1", author, now: NOW });
    expect(next).toEqual({ renews: true, contractId: "c1", setAt: NOW.toISOString(), setById: "uid-aj", setByName: "AJ" });
  });

  it("never reuses a mark from another contract, and never writes an empty name", () => {
    const old = mark(false, "c0");
    const next = markAfterTap({ want: false, saved: old, contractId: "c1", author: { id: "uid-aj", name: "" }, now: NOW });
    expect(next).not.toBe(old);
    expect(next).toEqual({ renews: false, contractId: "c1", setAt: NOW.toISOString(), setById: "uid-aj" });
    expect("setByName" in next).toBe(false);
    const anon = markAfterTap({ want: true, saved: null, contractId: "c1", author: null, now: NOW });
    expect(Object.keys(anon).sort()).toEqual(["contractId", "renews", "setAt"]);
  });
});
