/**
 * RENEWALS — the renewal plan, the pure half (the renewals dashboard, Oct 7
 * 2026).
 *
 * AJ, Oct 6 2026: "allow in app response" — the studio records in Journey
 * what was decided about a client's renewal — and "strongsville does not
 * autorenew, allow on the new renewal dashboard for studios without auto
 * renew to mark if a client is set to renew or not in some way manually".
 *
 * So the choices depend on the DECIDED auto-renew answer (auto-renew.ts; pass
 * `renewalOf(client)` or the live snapshot, so a mark saved today counts):
 *
 *   renews by itself  Let it renew (sessions carry over) · Pause billing in
 *                     Mindbody until sessions run low (only when it will
 *                     bank sessions) · Not renewing · Not decided yet
 *   doesn't, or       Renewing — same package · Upgrading · Downgrading ·
 *   nobody knows      Pay as you go · Not renewing · Not decided yet
 *
 * The plan lives on the cycle (`studios/{s}/renewals/{cycleKey}.plan`) and
 * every change also writes one touch of kind "plan", so the history stays.
 * Anyone who works at the studio may set it, as they may log a
 * conversation. It is never an outcome: a leader's outcome stands beside it
 * and wins, and the nightly job's outcomes never read it. A plan to renew
 * doesn't take the client off Talk now: the new package appearing in
 * Mindbody does (`renewalOnBooks`), as it always has.
 *
 * The writes are useRenewalCycle.ts `saveRenewalPlan`; firestore.rules
 * holds the same shape (renewalPlanValid).
 */

import { studioDateKey } from "../../lib/studio-time";
import { dayLabel } from "./sentences";
import { byPackageLength } from "./options";
import type {
  PackageTier,
  RenewalCycle,
  RenewalInterest,
  RenewalLeaning,
  RenewalPlan,
  RenewalPlanChoice,
  RenewalSettings,
  RenewalSnapshot,
  RenewalTouch,
} from "./types";

/**
 * Every choice, in the words the picker shows. firestore.rules lists the same
 * keys. Short, so a closed select on an iPad never cuts one off (AJ, Oct 7
 * 2026: "fix"): at most PLAN_LABEL_MAX characters, held by plan.test.ts. The
 * whole meaning is PLAN_WORDS, said under the picker.
 */
export const PLAN_LABELS: Record<RenewalPlanChoice, string> = {
  "let-renew": "Let it renew",
  "pause-billing": "Pause billing",
  "renew-same": "Same package",
  upgrade: "Upgrading",
  downgrade: "Downgrading",
  "pay-as-you-go": "Pay as you go",
  "not-renewing": "Not renewing",
  undecided: "Not decided yet",
};

/** The longest a picker label may be: what a closed select in the row's narrowest plan column shows whole. */
export const PLAN_LABEL_MAX = 15;

/**
 * Each choice said whole: the plan's sentence under the picker, the line
 * under it while a choice is being picked, and the conversation history.
 */
export const PLAN_WORDS: Record<RenewalPlanChoice, string> = {
  "let-renew": "Let it renew (sessions carry over)",
  "pause-billing": "Pause billing in Mindbody until sessions run low",
  "renew-same": "Renewing — same package",
  upgrade: "Upgrading",
  downgrade: "Downgrading",
  "pay-as-you-go": "Pay as you go",
  "not-renewing": "Not renewing",
  undecided: "Not decided yet",
};

/** The whole meaning of a choice when its picker label is shorter than it; null when the label already says it all. */
export function planMeaning(choice: RenewalPlanChoice | null | undefined): string | null {
  if (!choice || !PLAN_WORDS[choice]) return null;
  return PLAN_WORDS[choice] === PLAN_LABELS[choice] ? null : PLAN_WORDS[choice];
}

export const PLAN_CHOICES = Object.keys(PLAN_LABELS) as RenewalPlanChoice[];

export const PLAN_NOTE_MAX = 500;

/** "auto-renew" when the contract renews by itself; "manual" otherwise (Strongsville, paid in full, unknown). */
export type PlanMode = "auto-renew" | "manual";

export function planModeOf(s: Pick<RenewalSnapshot, "autoRenews" | "paymentMode"> | null | undefined): PlanMode {
  return s?.paymentMode === "monthly" && s.autoRenews === true ? "auto-renew" : "manual";
}

/** Will sessions still be banked when the payments finish? The projection's word, else the old one. */
function willBank(s: Pick<RenewalSnapshot, "projection" | "bankedAtCharge"> | null | undefined): boolean {
  const left = s?.projection?.leftAtEnd ?? s?.bankedAtCharge ?? null;
  return left !== null && left > 0;
}

/**
 * The choices to offer, in order. A plan already saved keeps its choice on
 * the list even when the answer has since changed, so it can be read back
 * and changed rather than silently disappearing.
 */
export function planChoicesFor(
  s: Pick<RenewalSnapshot, "autoRenews" | "paymentMode" | "projection" | "bankedAtCharge"> | null | undefined,
  saved?: RenewalPlanChoice | null,
): RenewalPlanChoice[] {
  const list: RenewalPlanChoice[] =
    planModeOf(s) === "auto-renew"
      ? ["let-renew", ...(willBank(s) ? (["pause-billing"] as const) : []), "not-renewing", "undecided"]
      : ["renew-same", "upgrade", "downgrade", "pay-as-you-go", "not-renewing", "undecided"];
  if (saved && PLAN_LABELS[saved] && !list.includes(saved)) list.splice(list.length - 1, 0, saved);
  return list;
}

/** The choices that name the package they are renewing onto. */
export function planNamesPackage(choice: RenewalPlanChoice | null | undefined): boolean {
  return choice === "renew-same" || choice === "upgrade" || choice === "downgrade";
}

/**
 * The packages a choice can name, shortest first: the same package, the
 * longer ones, or the shorter ones. Every package when the current one isn't
 * known.
 */
export function planPackageOptions(
  choice: RenewalPlanChoice | null | undefined,
  settings: Pick<RenewalSettings, "packages">,
  currentKey: string | null | undefined,
): PackageTier[] {
  if (!planNamesPackage(choice)) return [];
  const all = [...settings.packages].sort(byPackageLength);
  const current = all.find((p) => p.key === currentKey) ?? null;
  if (!current) return all;
  if (choice === "renew-same") return [current];
  if (choice === "upgrade") return all.filter((p) => p.months > current.months);
  return all.filter((p) => p.months < current.months);
}

/** The package a choice starts on: the same one, the next longer, the next shorter. Null when none fits. */
export function defaultPlanPackage(
  choice: RenewalPlanChoice | null | undefined,
  settings: Pick<RenewalSettings, "packages">,
  currentKey: string | null | undefined,
): string | null {
  const current = settings.packages.find((p) => p.key === currentKey) ?? null;
  if (!current) return null;
  const options = planPackageOptions(choice, settings, currentKey);
  if (options.length === 0) return null;
  if (choice === "renew-same") return current.key;
  if (choice === "upgrade") return options[0].key;
  return options[options.length - 1].key;
}

export interface PlanDraft {
  choice: RenewalPlanChoice | null;
  packageKey: string | null;
  note: string;
}

export const EMPTY_PLAN_DRAFT: PlanDraft = { choice: null, packageKey: null, note: "" };

/** What's missing before a plan can be saved, in words; null when ready. Naming the package is optional. */
export function planProblem(
  d: PlanDraft,
  settings: Pick<RenewalSettings, "packages">,
  currentKey: string | null | undefined,
): string | null {
  if (!d.choice || !PLAN_LABELS[d.choice]) return "Pick what was decided.";
  if (d.note.length > PLAN_NOTE_MAX) return `Keep the note under ${PLAN_NOTE_MAX} characters.`;
  if (d.packageKey && planNamesPackage(d.choice) && !planPackageOptions(d.choice, settings, currentKey).some((p) => p.key === d.packageKey)) {
    return "That package doesn't fit this choice.";
  }
  return null;
}

/** The touch's leaning, so the conversation history reads a plan in its own words. */
export function planLeaning(choice: RenewalPlanChoice): RenewalLeaning {
  switch (choice) {
    case "not-renewing":
    case "pay-as-you-go":
      return "not-renewing";
    case "undecided":
      return "unsure";
    default:
      return "renewing";
  }
}

function planInterest(choice: RenewalPlanChoice): RenewalInterest | null {
  if (choice === "renew-same") return "same";
  if (choice === "upgrade") return "longer";
  if (choice === "downgrade") return "shorter";
  return null;
}

/** What the plan expects: the pipeline's words for whether the lost or win-back lanes should surprise anyone. */
export function planExpectation(plan: Pick<RenewalPlan, "choice"> | null | undefined): "renewing" | "not-renewing" | "undecided" | null {
  if (!plan || !PLAN_LABELS[plan.choice]) return null;
  if (plan.choice === "undecided") return "undecided";
  return planLeaning(plan.choice) === "renewing" ? "renewing" : "not-renewing";
}

/**
 * The two documents a plan change writes, before timestamps: the cycle's
 * `plan` with its context (exactly the fields firestore.rules lets anyone at
 * the studio write this way, renewalPlanKeys) and one touch of kind "plan".
 */
export function planWrites(params: {
  draft: PlanDraft;
  clientId: string;
  clientName: string;
  cycleKey: string;
  snapshot: Pick<RenewalSnapshot, "packageKey" | "chargeDate"> | null;
  authorId: string;
  authorName: string;
}): {
  touch: Omit<RenewalTouch, "at">;
  cycle: Pick<RenewalCycle, "clientId" | "clientName" | "cycleKey" | "packageKey" | "chargeDate"> & {
    plan: Omit<RenewalPlan, "at">;
  };
} {
  const { draft, clientId, clientName, cycleKey, snapshot, authorId, authorName } = params;
  const choice: RenewalPlanChoice = draft.choice && PLAN_LABELS[draft.choice] ? draft.choice : "undecided";
  const packageKey = planNamesPackage(choice) && draft.packageKey ? draft.packageKey : null;
  const note = draft.note.trim().slice(0, PLAN_NOTE_MAX);
  const name = authorName.trim().slice(0, 80) || "Someone at the studio";
  return {
    touch: {
      clientId,
      authorId,
      authorName: name,
      leaning: planLeaning(choice),
      concerns: [],
      interestedIn: planInterest(choice),
      note,
      needsLeader: false,
      kind: "plan",
      plan: { choice, packageKey },
    },
    cycle: {
      clientId,
      clientName,
      cycleKey,
      packageKey: snapshot?.packageKey ?? null,
      chargeDate: snapshot?.chargeDate ?? null,
      // Every key, every time: the write is a merge, which would keep an
      // earlier plan's note or package under a new choice.
      plan: { choice, packageKey, note, byUid: authorId, byName: name },
    },
  };
}

/**
 * The plan in one line: "Upgrading to Life Transformed · Jen, Oct 6",
 * "Renewing — same package (Committed) · AJ, Oct 6". Null with no plan.
 */
export function planSentence(
  plan: RenewalPlan | null | undefined,
  settings: Pick<RenewalSettings, "packages">,
  today: string,
): string | null {
  if (!plan || !PLAN_LABELS[plan.choice]) return null;
  const tier = plan.packageKey ? settings.packages.find((p) => p.key === plan.packageKey) ?? null : null;
  let what = PLAN_WORDS[plan.choice];
  if (tier) {
    if (plan.choice === "renew-same") what = `${what} (${tier.label})`;
    else what = `${what} to ${tier.label}`;
  }
  const who = (plan.byName ?? "").trim().split(/\s+/)[0] ?? "";
  const day = studioDateKey((plan.at ?? null) as any);
  const when = day ? dayLabel(day, today) : "";
  const by = [who, when].filter(Boolean).join(", ");
  return by ? `${what} · ${by}` : what;
}

/**
 * The next step a plan sets, for a pipeline row. Null when the plan says
 * nothing more than the situation would (no plan, or not decided yet).
 */
export function planNextStep(
  plan: Pick<RenewalPlan, "choice"> | null | undefined,
  s: Pick<RenewalSnapshot, "chargeDate" | "situation">,
  today: string,
): string | null {
  if (!plan) return null;
  // A charge day that has passed is not a deadline: the date is left out.
  const charge = s.chargeDate && s.chargeDate >= today ? dayLabel(s.chargeDate, today) : null;
  switch (plan.choice) {
    case "let-renew":
      return charge ? `Letting it renew ${charge} — sessions carry over` : "Letting it renew — sessions carry over";
    case "pause-billing":
      return charge ? `Pause billing in Mindbody before ${charge}` : "Pause billing in Mindbody";
    case "renew-same":
    case "upgrade":
    case "downgrade":
      return "Renewing — the new package shows here once it's in Mindbody";
    case "pay-as-you-go":
      return s.situation === "ended" || s.situation === "lapsed"
        ? "Pay as you go — record the outcome"
        : "Moving to pay as you go when this package ends";
    case "not-renewing":
      return s.situation === "ended" || s.situation === "lapsed"
        ? "Said they weren't renewing — record the outcome"
        : "Not renewing — talk about what would bring them back";
    default:
      return null;
  }
}
