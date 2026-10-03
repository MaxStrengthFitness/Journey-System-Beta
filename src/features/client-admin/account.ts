/**
 * ACCOUNT — the pure half of the Account page of Notes & Profile.
 *
 * Client codex, Sep 2026 (phase 16). The long scroll's "Who they are" was a
 * form of greyed-out boxes and its Admin section a contract panel with a
 * catch-all fine print. Account is now a clean ID card (Mindbody's facts, as
 * sentences) and the membership under it. Every word the page says about the
 * record is worked out here, so it is tested without a screen:
 *
 *   contactFacts      the ID card: goes by, legal name, born, gender, phone,
 *                     email, address, emergency, Mindbody ID — and what an
 *                     empty one says, which depends on WHY it is empty
 *   onFileFacts       On file with Mindbody: the waiver (three states), the
 *                     status (with the prospect and inactive flags, which
 *                     Master Sync writes and nothing read until now), since
 *                     when, and Mindbody's own visit count
 *   packageView       The package: what she is on, what is left, when it
 *                     renews or runs out — the contract panel's three answers
 *   onHandTotal       what Mindbody says she holds right now: the ONE
 *                     on-hand figure, for the package card and the sub-toggle
 *   membershipTimeline  the contract history as tiles, oldest first, with
 *                     the years before Journey as the first, dashed one
 *   accountTabHint    the sub-toggle's line ("95 sessions left")
 *   accountGlance     the Overview's Account slot (phase 18), in two columns
 *   accountLede       the page's opening lines, by linked or not and by
 *                     whether this reader may edit
 *   tabTone           a renewal's tone on this page: never crimson
 *
 * THE RULES IT KEEPS.
 *  - Mindbody owns who a client is. On a LINKED client every identity and
 *    contact fact is read straight off the record (never the form, which
 *    re-seeds only while nothing is unsaved and could hold a stale name) and
 *    changes in Mindbody. On an UNLINKED one (a temporary profile, or no
 *    Mindbody id) the coach types them, so the form's value is shown. The
 *    nickname is the coach's on both.
 *  - An empty fact says why it is empty: "Not in Mindbody" once Master Sync
 *    has read her, "Not synced yet" before it has, "Not recorded" on a
 *    client Mindbody does not hold. Never a blank, never "None".
 *  - Dates: a date of birth is a calendar day, read from its digits; a
 *    Mindbody date is its UTC day (lib/mindbody-dates.ts); the first visit
 *    is read as the Story reads it (`firstVisitOf`), so "first visit" is
 *    said only of Mindbody's own date and an inferred one is "earliest …".
 *  - Crimson is for a Critical note and an absolute contraindication only:
 *    a package that ended reads plum here (`tabTone`), as a caution.
 *  - A number that is an estimate says so, and an on-hand count is never
 *    called "left" (a monthly client holds a few sessions between payments).
 *
 * Pronoun-aware only where a sentence needs one; the text is otherwise the
 * record's. Pure: account.test.ts, run with TZ=America/New_York.
 */
import type { AutoRenewMark, Client, ContractTierOverride, Studio } from "../../types";
import type { RenewalSituation } from "../renewals/types";
import {
  SITUATION_TONE,
  autoRenewSourceWords,
  billingEndPhrase,
  chipText,
  dayLabel,
  paceSentence,
  situationSentence,
} from "../renewals/sentences";
import { mindbodyDayKey } from "../renewals/engine";
import { isAutoRenewMark, liveMindbodyFlag, lockSaysNothingBills, markFor, renewalOf } from "../renewals/auto-renew";
import { formatStudioDate, studioDayKeyOf } from "../../lib/studio-time";
import { mindbodyIdOf } from "../../lib/mindbody-id";
import { clientLegalName } from "../../lib/client-name";
import { waiverProfileState as waiverState } from "../../lib/client-waiver";
import { formatMindbodyDate, toDateSafe, type FirestoreDateLike } from "../../lib/mindbody-dates";
import { daysUntilBirthday } from "../../lib/hub-markers";
import { resolveClientSince, statedFirstDay, type ClientSinceSource } from "../../lib/client-since";
import {
  COVERAGE_CAVEAT,
  type HistoryCoverage,
  type PriorHistory,
  type PriorHistorySource,
} from "../../lib/prior-history";
import { ageFromDob, masterSyncLabel } from "../client-profile/sync-label";
import { firstVisitOf, monthYear, type FirstVisitBasis } from "../client-story/story";
import { cap, dayKeyDate, joinDots, plural } from "../client-codex/kit/text";
import { agree, pronounsOf, type Pronouns } from "../client-codex/kit/pronouns";
import { recordStudioIdOf } from "../client-codex/access";
import {
  PACKAGE_NAME,
  PAYMENT_LABEL,
  currentContract,
  parseTierFromName,
  resolveContractTier,
  sessionsOnHand,
  type ContractTier,
  type ContractTermRow,
} from "./contract";
import type { PackageNameIndex } from "../renewals/settings";

/* ------------------------------------------------------------------ */
/* Linked or not                                                       */
/* ------------------------------------------------------------------ */

type LinkFields = Pick<Client, "id" | "mindbodyClientId" | "mindbodyId" | "provisional" | "supersededById" | "migratedTo">;

/**
 * Whether Mindbody owns this client's identity: a Mindbody id the app trusts,
 * and not a temporary profile. The same test the old ID card made
 * (ClientDossier: `!!mindbodyIdOf(client) && !client.provisional`).
 */
export function isMindbodyLinked(client: Partial<LinkFields> | null | undefined): boolean {
  return !!mindbodyIdOf(client) && !client?.provisional;
}

/** What an empty identity fact says, by why it is empty. */
export function missingWords(client: Partial<LinkFields & Pick<Client, "mindbodyMasterSyncedAt">> | null | undefined): string {
  if (!isMindbodyLinked(client)) return "Not recorded";
  return client?.mindbodyMasterSyncedAt ? "Not in Mindbody" : "Not synced yet";
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

/** "Mar 6, 2019" for a day key; null for anything that is not a real day. */
function dayWords(key: string | null | undefined): string | null {
  const d = dayKeyDate(key ?? null);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
}

/** The yyyy-mm-dd of a date of birth, from its digits (never through UTC). */
function dobKey(dob: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dob ?? "").trim());
  return m && dayKeyDate(`${m[1]}-${m[2]}-${m[3]}`) ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "Mar 2026" for a Mindbody date: its UTC day. */
function mindbodyMonth(value: Date | null): string | null {
  const key = value ? mindbodyDayKey(value) : null;
  return key ? monthYear(key) || null : null;
}

/** The studio day key as a Date at local noon (the day's own "now"). */
function noonOf(today: string): Date {
  return dayKeyDate(today) ?? new Date();
}

/**
 * Her age and her next birthday, from the date of birth's digits. Null when
 * there is no readable date of birth. `turns` is the age she will be on the
 * next birthday — today's age on the day itself.
 */
export function ageAndBirthday(
  dob: string | null | undefined,
  today: string,
): { age: number | null; birthday: string; turns: number | null; daysUntil: number | null } | null {
  const key = dobKey(dob);
  if (!key) return null;
  const now = noonOf(today);
  const age = ageFromDob(key, now);
  const daysUntil = daysUntilBirthday(key, now);
  const date = dayKeyDate(key)!;
  return {
    age,
    birthday: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    turns: age === null ? null : daysUntil === 0 ? age : age + 1,
    daysUntil,
  };
}

/* ------------------------------------------------------------------ */
/* Her first day at the studio                                         */
/* ------------------------------------------------------------------ */

/**
 * What the "First day at the studio" card says (Sep 29 2026).
 *
 * The anniversary rule: every date Journey can infer for when she started
 * (her first session in Journey, Mindbody's first visit, when Mindbody made
 * her record, her first package) is only an upper bound, so a person is
 * asked to SET the day, once, and the app reads it before every inferred
 * one (`lib/client-since.ts`, source "stated"). The card shows the day when
 * it is set, and otherwise the best guess with where it came from, so the
 * person setting it knows what the app is going on today.
 */
export interface FirstDayView {
  /** The set day, `YYYY-MM-DD`, or null. */
  day: string | null;
  /** "Mar 3, 2019", or null. */
  words: string | null;
  /**
   * With no day set: what the app infers today, or null when it can infer
   * nothing. `day` is that guess as a calendar day when a trainer may CONFIRM
   * it in one tap (Oct 2 2026: Mindbody's first appointment, or Mindbody's
   * record, shown "from Mindbody" until confirmed); null when it is only a
   * Journey date, which is never offered as her first day.
   */
  guess: { words: string; from: string; day: string | null; confirmed: boolean } | null;
}

const GUESS_WORDS: Record<ClientSinceSource, string> = {
  stated: "set on the profile",
  firstSession: "the first session Journey recorded",
  firstAppointment: "her first appointment in Mindbody",
  mindbodyCreated: "the day Mindbody made the record",
  commercial: "the first package on file",
  journey: "the day Journey first saw the record",
};

/** The guess as a calendar day: a Mindbody date on Mindbody's (UTC) calendar, a Journey one on the studio's. */
function guessDay(source: ClientSinceSource, raw: unknown, date: Date): string | null {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  if (source === "firstAppointment" || source === "mindbodyCreated" || source === "commercial") {
    return mindbodyDayKey(raw as never) ?? studioDayKeyOf(date);
  }
  return studioDayKeyOf(date);
}

export function firstDayView(
  client: Pick<Client, "firstStudioDay" | "firstSessionDate" | "firstAppointmentDate" | "mindbodyCreatedAt" | "createdAt" | "mindbodyContracts" | "mindbodyMemberships" | "priorHistory">,
  coverage: HistoryCoverage,
): FirstDayView {
  const stated = statedFirstDay(client);
  if (stated) {
    const key = client.firstStudioDay as string;
    return { day: key, words: dayWords(key), guess: null };
  }
  const since = resolveClientSince(client, { coverage });
  if (!since) return { day: null, words: null, guess: null };
  const words = since.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const raw =
    since.source === "firstAppointment"
      ? client.firstAppointmentDate
      : since.source === "mindbodyCreated"
        ? client.mindbodyCreatedAt
        : since.source === "firstSession"
          ? client.firstSessionDate
          : null;
  const day = since.fromMindbody && since.source !== "commercial" ? guessDay(since.source, raw, since.date) : null;
  return { day: null, words: null, guess: { words, from: GUESS_WORDS[since.source], day, confirmed: since.confirmed } };
}

/* ------------------------------------------------------------------ */
/* The ID card                                                         */
/* ------------------------------------------------------------------ */

export type ContactKey =
  | "goesBy"
  | "legal"
  | "born"
  | "gender"
  | "phone"
  | "email"
  | "address"
  | "emergency"
  | "mindbodyId";

export interface ContactFact {
  key: ContactKey;
  label: string;
  /** What the card prints: the fact, or — when `empty` — why there is none. */
  value: string;
  empty: boolean;
  /**
   * A coach may change it here: the nickname always, and an unlinked
   * client's identity and contact (a linked client's are Mindbody's).
   */
  editable: boolean;
}

/** The client fields the ID card reads. */
export type ContactClient = Partial<
  Pick<
    Client,
    | "id"
    | "mindbodyClientId"
    | "mindbodyId"
    | "provisional"
    | "supersededById"
    | "migratedTo"
    | "mindbodyMasterSyncedAt"
    | "firstName"
    | "lastName"
    | "nickname"
    | "dateOfBirth"
    | "gender"
    | "phone"
    | "email"
    | "address"
    | "city"
    | "addressState"
    | "postalCode"
    | "country"
    | "emergencyContactName"
    | "emergencyContactRelationship"
    | "emergencyContactPhone"
  >
>;

const text = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/**
 * The ID card's facts, in the card's order. The nickname is the form's value
 * (the coach's, staged on the Save bar); the rest are the record's on a
 * linked client and the form's on an unlinked one.
 */
export function contactFacts(
  client: ContactClient,
  formData: Partial<Client>,
  { now = new Date(), pronouns = pronounsOf(client) }: { now?: Date; pronouns?: Pronouns } = {},
): ContactFact[] {
  const linked = isMindbodyLinked(client);
  const missing = missingWords(client);
  /** A coach-typed field: the form's value while it holds one. */
  const typed = (key: keyof Client): string =>
    text(formData[key] !== undefined ? formData[key] : (client as Record<string, unknown>)[key]);
  /** An identity field: the record's on a linked client, the form's otherwise. */
  const own = (key: keyof Client): string => (linked ? text((client as Record<string, unknown>)[key]) : typed(key));

  const fact = (key: ContactKey, label: string, value: string, editable = !linked, whenMissing = missing): ContactFact => ({
    key,
    label,
    value: value || whenMissing,
    empty: !value,
    editable,
  });

  const nickname = typed("nickname");
  const legal = clientLegalName({ firstName: own("firstName"), lastName: own("lastName") });
  const dob = own("dateOfBirth");
  const key = dobKey(dob);
  const age = key ? ageFromDob(key, now) : null;
  const born = key ? joinDots([dayWords(key), age !== null ? String(age) : null]) : dob;
  const address = joinDots([
    own("address"),
    [text(client.city), text(client.addressState)].filter(Boolean).join(", "),
    [text(client.postalCode), text(client.country)].filter(Boolean).join(" "),
  ]);
  const emergency = joinDots([own("emergencyContactName"), text(client.emergencyContactRelationship), own("emergencyContactPhone")]);
  const mbId = mindbodyIdOf(client);

  return [
    {
      key: "goesBy",
      label: "Goes by",
      value: nickname || `${cap(pronouns.possessive)} first name`,
      empty: !nickname,
      editable: true,
    },
    fact("legal", "Legal name", legal),
    fact("born", "Born", born),
    fact("gender", "Gender", own("gender")),
    fact("phone", "Phone", own("phone")),
    fact("email", "Email", own("email")),
    fact("address", "Address", address),
    fact("emergency", "Emergency", emergency),
    fact(
      "mindbodyId",
      "Mindbody ID",
      mbId ?? "",
      false,
      client.provisional ? "A temporary profile, not linked to Mindbody yet" : "Not linked to Mindbody",
    ),
  ];
}

/* ------------------------------------------------------------------ */
/* On file with Mindbody                                               */
/* ------------------------------------------------------------------ */

export interface OnFileFact {
  key: "waiver" | "status" | "since" | "visits";
  label: string;
  value: string;
  empty: boolean;
  /** Only the waiver has one: ok (signed), else neutral ("Not in Mindbody" is a fact about Mindbody, Oct 3 2026). */
  tone: "ok" | "warn" | "neutral";
  source: string | null;
}

export type OnFileClient = Partial<
  Pick<
    Client,
    | "isLiabilityReleased"
    | "liabilityAgreementDate"
    | "mindbodyStatus"
    | "isProspect"
    | "mindbodyActive"
    | "mindbodyCreatedAt"
    | "firstAppointmentDate"
    | "firstAppointmentDateSource"
    | "clientsNumberOfVisitsAtSite"
  >
>;

/** "first visit Mar 6, 2019", or what an inferred date really is. */
const VISIT_WORDS: Record<FirstVisitBasis, string> = {
  mindbody: "first visit",
  booking: "earliest visit seen",
  session: "earliest session on file",
  contract: "earliest package began",
  other: "earliest date on file",
};

const NOT_SYNCED = "Not synced yet";

export function onFileFacts(client: OnFileClient, tz?: string): OnFileFact[] {
  const waiver = waiverState(client);

  const status = joinDots([
    text(client.mindbodyStatus),
    client.isProspect === true ? "a prospect in Mindbody" : null,
    client.mindbodyActive === false ? "marked inactive in Mindbody" : null,
  ]);

  const created = formatMindbodyDate(client.mindbodyCreatedAt as FirestoreDateLike);
  const visit = firstVisitOf(
    { firstAppointmentDate: client.firstAppointmentDate, firstAppointmentDateSource: client.firstAppointmentDateSource },
    tz,
  );
  const visitLine = visit ? `${VISIT_WORDS[visit.basis]} ${dayWords(visit.day)}` : null;
  const since = created ? joinDots([created, visitLine]) : visitLine ? cap(visitLine) : "";

  const visits =
    typeof client.clientsNumberOfVisitsAtSite === "number" && Number.isFinite(client.clientsNumberOfVisitsAtSite)
      ? String(client.clientsNumberOfVisitsAtSite)
      : "";

  return [
    {
      key: "waiver",
      label: "Waiver",
      value: waiver.label,
      empty: waiver.state === "unknown",
      tone: waiver.tone,
      source: waiver.state === "signed" ? null : waiver.detail,
    },
    { key: "status", label: "Status", value: status || NOT_SYNCED, empty: !status, tone: "neutral", source: null },
    { key: "since", label: "Since", value: since || NOT_SYNCED, empty: !since, tone: "neutral", source: null },
    {
      key: "visits",
      label: "Visits",
      value: visits || NOT_SYNCED,
      empty: !visits,
      tone: "neutral",
      source: visits ? "Mindbody's own count, separate from Journey's sessions" : null,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* The package                                                         */
/* ------------------------------------------------------------------ */

/** A renewal's tone on this page. Crimson is not a package's colour: an ended one is a caution. */
export function tabTone(situation: RenewalSituation | null | undefined): "ok" | "warn" | "neutral" {
  if (!situation) return "neutral";
  const tone = SITUATION_TONE[situation] ?? "neutral";
  return tone === "alert" ? "warn" : tone;
}

export interface PackageView {
  /** What she is on — the lock (staged or saved) when there is one. */
  tier: ContractTier;
  /** "Mindbody reads as: …" — Mindbody's reading beside a lock that disagrees; null otherwise. */
  mindbodyReads: string | null;
  /** The 30px line: the package's name ("Committed"), or the tier's words when it has no term. */
  headline: string;
  /** The rest of the tier: "12 months · paying every 4 weeks"; null when the headline says it all. */
  terms: string | null;
  /** The 30px count: "95 left", "8 on hand", or "—". */
  left: string;
  /** What that count is: "sessions left", "sessions left (estimated)", "sessions on hand"… */
  leftWords: string;
  /**
   * "8 on hand in Mindbody now" beside an ESTIMATE of what is left: the firm
   * number next to the worked-out one (and the figure the sub-toggle prints
   * then). Null otherwise.
   */
  held: string | null;
  /** "3 payments to go"; null when not known. */
  payments: string | null;
  /**
   * "Renews Mar 14, 2028" · "Billing ends …" · "Runs out around … (estimated)"
   * for a package paid in full or on banked sessions · "Contract ends …" /
   * "Contract ended …" · "Run-out date not known yet" · "No end date on file".
   */
  when: string;
  /**
   * The renewal's sentence when it says more than the two columns do (billing
   * ends with sessions banked, runs out early, away, ended, renewed), or that
   * it is not worked out yet; null for a package simply on track.
   */
  status: string | null;
  pace: string | null;
  conversationDue: boolean;
  /**
   * The first thing the nightly job could not tell, in its words — null when
   * `status` already says it (an "unknown" renewal's sentence IS that gap).
   */
  gap: string | null;
  tone: "ok" | "warn" | "neutral";
  /** Whether the nightly job has worked this client out. */
  worked: boolean;
}

/** Where a tier came from, in a word, when the tier carries no evidence of its own. */
const TIER_SOURCE_TEXT: Record<ContractTier["source"], string> = {
  override: "Locked by a coach",
  renewal: "From the studio's package table",
  parsed: "Read from Mindbody names",
  unknown: "Mindbody hasn't said",
};

/**
 * The package card's source line: the tier's own evidence ("Read from the
 * Mindbody contract “96 Sessions · 12 Mo”", "Locked by AJ"), else where it
 * came from in a word — never both, which said the same thing twice.
 */
export function tierSourceLine(tier: Pick<ContractTier, "source" | "evidence">): string {
  return tier.evidence?.trim() || TIER_SOURCE_TEXT[tier.source];
}

export type PackageClient = Pick<Client, "mindbodyContracts" | "mindbodyServices"> &
  Partial<Pick<Client, "renewal" | "contractTierOverride" | "autoRenewMark">>;

/**
 * What Mindbody says she holds right now: every pricing option with sessions
 * on it, as the fine print lists them. The ONE on-hand figure — the package
 * card and the sub-toggle both read it, so the page never says "8 on hand"
 * beside a sub-toggle's "5". (The renewal snapshot's `sessionsOnHand` counts
 * only the options the studio's package table recognises; the renewal says
 * which it left out, in its data gaps.)
 */
export function onHandTotal(client: Pick<Client, "mindbodyServices">): number {
  return sessionsOnHand(client).reduce((n, s) => n + s.remaining, 0);
}

/**
 * LEFT IN THE CONTRACT, AND EXTRA (AJ, Sep 26 2026): "How many left in their
 * contract is the correct number, but ... clients can be given sessions that
 * also plays a part, so a left in contract and then extra sessions works."
 *
 * Judy Daus read "36 LEFT · PIF" on the header and "48 on hand" on Account —
 * her paid-in-full option's 36 and a Session Comp's 12, added up in one place
 * and not the other. Each pricing option with sessions left is now one of:
 *
 *   extra     the studio's extra-sessions names (My Studio → Studio →
 *             Renewals; "Session Comp" by default): sessions she was given
 *   contract  the studio's package names, or a name that says what package
 *             it is (`parseTierFromName`: "96 Sessions - PIF", "48 Sessions -
 *             2X Week"), which reads a location's own spelling the default
 *             table does not have
 *   other     neither: never guessed into either (a "10 Pack", an intro
 *             offer), and named as such where there is room
 *
 * The profile works this out ONCE, with the home studio's table, and hands it
 * to the header and to Account, so the two never say different numbers again.
 */
export interface SessionsSplit {
  /** Sessions on her contract's pricing options. */
  contract: number;
  /** She holds a contract option at all, even one with none left. */
  hasContract: boolean;
  /**
   * Her contract arrives a payment at a time (a monthly option: 8 sessions
   * per 4-weekly payment). Then `contract` is what she holds NOW — on hand,
   * never "left in the contract", which counts the payments still to come
   * (the nightly renewal works that out). False when every contract option
   * holds its whole package up front: paid in full, or banked.
   */
  perPayment: boolean;
  /** Sessions she was given, on top of the contract. */
  extra: number;
  /** Sessions on options that are neither: not claimed as either. */
  other: number;
}

export function sessionsSplit(
  client: Pick<Client, "mindbodyServices">,
  index: Pick<PackageNameIndex, "tierFor" | "isExtraSessions">,
): SessionsSplit {
  const split: SessionsSplit = { contract: 0, hasContract: false, perPayment: false, extra: 0, other: 0 };
  for (const s of Object.values(client.mindbodyServices ?? {})) {
    if (!s) continue;
    const remaining = typeof s.remaining === "number" && s.remaining > 0 ? s.remaining : 0;
    if (index.isExtraSessions(s.name)) {
      split.extra += remaining;
      continue;
    }
    const tier = index.tierFor(s.name);
    const named = parseTierFromName(s.name);
    if (!tier && !named) {
      split.other += remaining;
      continue;
    }
    split.hasContract = true;
    split.contract += remaining;
    // The whole package up front, the renewal engine's own test: the option
    // holds at least the package's sessions (or its name says paid in full).
    const whole = named?.payment === "pif" || (!!tier && typeof s.count === "number" && s.count >= tier.sessions);
    if (!whole && remaining > 0) split.perPayment = true;
  }
  return split;
}

/**
 * The contract's words: "36 left in contract" when she holds the whole
 * package, "5 on hand in contract" when it comes a payment at a time. Null
 * with no contract option.
 */
export function contractWords(split: SessionsSplit): string | null {
  if (!split.hasContract) return null;
  return split.perPayment ? `${split.contract} on hand in contract` : `${split.contract} left in contract`;
}

/** Whether the split has anything to say: a contract option, or extras. */
export function splitSpeaks(split: SessionsSplit | null | undefined): split is SessionsSplit {
  return !!split && (split.hasContract || split.extra > 0);
}

/** "+12 extra" — the extras on their own, for a line or a pill. Null with none. */
export function extraWords(split: Pick<SessionsSplit, "extra">): string | null {
  return split.extra > 0 ? `+${split.extra} extra` : null;
}

/**
 * The package card's words. `pendingOverride` is the lock as the form holds
 * it (a staged lock shows before it is saved); the record's is Mindbody's
 * reading only when there is no lock. `pendingMark` is the auto-renewal box
 * as the form holds it, so a staged untick reads "Billing ends" before Save
 * (renewals/auto-renew.ts, renewalOf). The lock goes into that decision too:
 * a paid-in-full or banked-sessions lock claims no renewal ("Payments
 * finish"), staged or saved, so the card never says "Auto-renews" under
 * "paid in full".
 */
export function packageView(
  client: PackageClient,
  pendingOverride: ContractTierOverride | null,
  today: string,
  /** Left in the contract and extra (`sessionsSplit`); left out, the on-hand total speaks. */
  split?: SessionsSplit | null,
  pendingMark: AutoRenewMark | null = client.autoRenewMark ?? null,
): PackageView {
  const tier = resolveContractTier({ ...client, contractTierOverride: pendingOverride });
  const detected = resolveContractTier({ ...client, contractTierOverride: null });
  const r = renewalOf({ ...client, autoRenewMark: pendingMark, contractTierOverride: pendingOverride });

  const headline = tier.term ? PACKAGE_NAME[tier.term] : tier.label;
  const terms = tier.term
    ? joinDots([`${tier.term} months`, tier.payment && tier.payment !== "month-to-month" ? PAYMENT_LABEL[tier.payment] : null]) || null
    : null;

  // The count: the renewal's, else what Mindbody says she holds right now —
  // which is "on hand", never "left": a monthly client holds a few sessions
  // between payments.
  const onHand = onHandTotal(client);
  let left = "—";
  let leftWords = "sessions left: not known yet";
  let held: string | null = null;
  if (r && typeof r.sessionsLeft === "number") {
    left = `${r.sessionsLeft} left`;
    leftWords = r.sessionsLeftSource === "estimate" ? "sessions left (estimated)" : "sessions left";
    if (r.sessionsLeftSource === "estimate" && onHand > 0) held = `${onHand} on hand in Mindbody now`;
  } else if (!r && splitSpeaks(split)) {
    // No renewal worked out: left in the contract, and what she was given on
    // top (AJ, Sep 26) — the header's own pair.
    const beside = [
      split.extra > 0 ? `+${plural(split.extra, "extra session")}, on top of the contract` : null,
      split.other > 0 ? `${plural(split.other, "more session")} on options not matched to a package` : null,
    ];
    if (split.hasContract && !split.perPayment) {
      left = `${split.contract} left`;
      leftWords = "sessions left in the contract";
    } else if (split.hasContract) {
      // Monthly: what she holds now; the payments to come add more.
      left = `${split.contract} on hand`;
      leftWords = "sessions on hand in the contract; each payment adds more";
    } else {
      // Given sessions and no package: never "left" (a lone comp is not a package).
      left = `${split.extra} extra`;
      leftWords = "extra sessions, no package on file";
      beside[0] = null;
    }
    held = beside.filter(Boolean).join(" · ") || null;
  } else if (onHand > 0) {
    left = `${onHand} on hand`;
    leftWords = "sessions on hand in Mindbody";
  }

  // When it ends. A contract bills to a charge date; a package paid in full
  // (or banked sessions after billing ended) runs out at her pace — the old
  // chip's "runs out ~Apr 1", always an estimate, so it says so.
  const contractEnd = toDateSafe(currentContract(client)?.endDate as FirestoreDateLike);
  const contractEndKey = contractEnd ? mindbodyDayKey(contractEnd) : null;
  const banked = r?.paymentMode === "prepaid" || r?.paymentMode === "sessions-only";
  let when = "No end date on file";
  if (r?.chargeDate) {
    const est = r.chargeDateSource === "estimate" ? " (estimated)" : "";
    // The decided answer (renewals/auto-renew.ts), in every renewal screen's
    // words: "Auto-renews", "Billing ends", or neither when there is no
    // answer (renewals/sentences.ts, billingEndPhrase).
    when = `${cap(billingEndPhrase(r.autoRenews))} ${dayLabel(r.chargeDate, today)}${est}`;
  } else if (r?.runOutDate) {
    when = `Runs out around ${dayLabel(r.runOutDate, today)} (estimated)`;
  } else if (contractEnd) {
    // currentContract() is the latest one not cancelled — which may have ended.
    when = `${contractEndKey && contractEndKey < today ? "Contract ended" : "Contract ends"} ${formatMindbodyDate(contractEnd)}`;
  } else if ((r?.situation === "ended" || r?.situation === "lapsed") && r.focusDate) {
    // A used-up package paid in full has no contract to date it: the job's own end.
    when = `Ended ${dayLabel(r.focusDate, today)}`;
  } else if (banked) {
    when = "Run-out date not known yet";
  }

  const status = !r
    ? "Renewal not worked out yet — it appears after the nightly run."
    : r.situation === "on-track" && !r.renewalOnBooks
      ? null
      : situationSentence(r, today);
  const gap = r?.dataGaps?.length ? r.dataGaps[0] : null;

  return {
    tier,
    mindbodyReads:
      tier.source === "override" && detected.source !== "unknown" && detected.label !== tier.label ? detected.label : null,
    headline,
    terms,
    left,
    leftWords,
    held,
    payments: r && typeof r.paymentsLeft === "number" ? plural(r.paymentsLeft, "payment") + " to go" : null,
    when,
    status,
    pace: r ? paceSentence(r) : null,
    conversationDue: !!(r?.conversationDue && !r.renewalOnBooks),
    gap: gap && gap !== status ? gap : null,
    tone: tabTone(r?.situation),
    worked: !!r,
  };
}

/* ------------------------------------------------------------------ */
/* Auto-renewal: the box on the package card                           */
/* ------------------------------------------------------------------ */

/** The box's label. */
export const AUTO_RENEW_LABEL = "On auto-renewal";
/** The second answer, offered beside the box only when Journey can't tell (`pair`). */
export const AUTO_RENEW_NO_LABEL = "Not on auto-renewal";
/**
 * Clears a mark, so the inherited answer applies again. Named by what it
 * does: that answer may be the package's, the studio's, the standard, or
 * none at all, so the button never names one.
 */
export const AUTO_RENEW_CLEAR_LABEL = "Remove this mark";

export interface AutoRenewView {
  /**
   * pick   the box: this reader may mark her, and Mindbody hasn't said
   * line   the answer in words, no box: Mindbody has said, or this reader
   *        may not change the record
   * note   only a sentence: the box arrives after tonight's renewal run
   * null   nothing: no monthly contract with a charge date (paid in full,
   *        banked sessions, no package), or a paid-in-full or banked-sessions
   *        lock, staged or saved
   */
  kind: "pick" | "line" | "note" | null;
  /** Whether the box shows ticked: the decided answer, with the staged mark. */
  pressed: boolean;
  /** The decided answer with the staged mark; null = Journey can't tell. */
  answer: boolean | null;
  /**
   * Two answers, "On auto-renewal" and "Not on auto-renewal", instead of one
   * box: there is no inherited answer (Mindbody hasn't said, and the package
   * isn't matched), so an unticked box would read as "no" while saving
   * nothing. Each shows pressed only once it is the answer.
   */
  pair: boolean;
  /** The sentence under the box, or the line itself. */
  source: string | null;
  metas: string[];
  /** "Remove this mark" is offered: a mark for this contract is saved or staged. */
  canClear: boolean;
  /**
   * What "Remove this mark" stages: null, or — when the saved mark was made
   * on an earlier contract — that saved mark itself. The decision already
   * ignores it, so removing a tap only undoes the tap: the form is clean
   * again, and the record of the earlier contract's mark is kept.
   */
  clearTo: AutoRenewMark | null;
  /** The contract a tap marks. */
  contractId: string | null;
}

const NO_AUTO_RENEW_VIEW: AutoRenewView = {
  kind: null,
  pressed: false,
  answer: null,
  pair: false,
  source: null,
  metas: [],
  canClear: false,
  clearTo: null,
  contractId: null,
};

/** "Sep 25, 2026" — the studio's day of a mark's ISO time. */
function markDay(mark: AutoRenewMark): string {
  return formatStudioDate(mark.setAt, { month: "short", day: "numeric", year: "numeric" }, undefined, "");
}

/** "Marked by AJ · Sep 25, 2026", "Marked Sep 25, 2026". */
function markStamp(mark: AutoRenewMark): string {
  const who = mark.setByName?.trim();
  const day = markDay(mark);
  if (who) return joinDots([`Marked by ${who}`, day]);
  return day ? `Marked ${day}` : "Marked on the profile";
}

function sameMark(a: AutoRenewMark | null | undefined, b: AutoRenewMark | null | undefined): boolean {
  if (!a || !b) return (a ?? null) === (b ?? null);
  return a === b || (a.renews === b.renews && a.contractId === b.contractId && a.setAt === b.setAt);
}

/**
 * Every word of the package card's auto-renewal box (Sep 25 2026; AJ: "just
 * allow trainers to mark a check box on a profile if the client is on auto
 * renewal"). The box says what the decided answer is WITH the form's staged
 * mark (renewals/auto-renew.ts, renewalOf), and where it came from, so a
 * trainer ticks it only when the inherited answer is wrong for her.
 *
 * `client` is the saved record; `pendingMark` and `pendingOverride` are the
 * form's. Pure; account.test.ts holds every state.
 */
export function autoRenewView({
  client,
  pendingMark,
  pendingOverride,
  canEdit,
  pronouns: p,
  studioName,
}: {
  client: Partial<Pick<Client, "renewal" | "autoRenewMark" | "mindbodyContracts" | "contractTierOverride">>;
  pendingMark: AutoRenewMark | null;
  pendingOverride: ContractTierOverride | null;
  canEdit: boolean;
  pronouns: Pronouns;
  studioName: string | null | undefined;
}): AutoRenewView {
  // A lock that says paid in full or banked sessions: nothing bills, so
  // nothing renews, and the decision says none (auto-renew.ts, step 1). No
  // box to contradict it. Below, the form's lock is the one read, so a lock
  // staged to come off shows the answer it will have.
  if (lockSaysNothingBills(pendingOverride)) return NO_AUTO_RENEW_VIEW;
  const record = { ...client, contractTierOverride: pendingOverride };
  const saved = renewalOf(record);
  if (!saved || saved.paymentMode !== "monthly" || !saved.chargeDate || !saved.clientContractId) return NO_AUTO_RENEW_VIEW;
  const contractId = saved.clientContractId;
  const is = agree(p, "is", "are");
  const isNot = agree(p, "isn't", "aren't");
  const label = (renews: boolean) => (renews ? AUTO_RENEW_LABEL : AUTO_RENEW_NO_LABEL);
  const line = (text: string, pressed: boolean): AutoRenewView => ({
    kind: "line",
    pressed,
    answer: pressed,
    pair: false,
    source: text,
    metas: [],
    canClear: false,
    clearTo: null,
    contractId,
  });
  // Mindbody owns contracts: where it has said, the box is its answer, in words.
  const mindbodyLine = (renews: boolean) =>
    canEdit
      ? line(`${label(renews)} · Mindbody's contract says so. Change it in Mindbody.`, renews)
      : line(`${label(renews)} · ${autoRenewSourceWords("mindbody")}`, renews);

  // A snapshot from before this round: its flag was Mindbody's alone.
  if (!(typeof saved.version === "number" && saved.version >= 2)) {
    const mb = liveMindbodyFlag(client.mindbodyContracts, contractId) ?? (typeof saved.autoRenews === "boolean" ? saved.autoRenews : undefined);
    if (typeof mb === "boolean") return mindbodyLine(mb);
    if (!canEdit) return NO_AUTO_RENEW_VIEW;
    return {
      kind: "note",
      pressed: false,
      answer: null,
      pair: false,
      source: null,
      metas: ["Auto-renewal can be marked here after tonight's renewal run."],
      canClear: false,
      clearTo: null,
      contractId,
    };
  }

  const pending = renewalOf({ ...record, autoRenewMark: pendingMark }) ?? saved;
  if (pending.autoRenewsFrom === "mindbody" && typeof pending.autoRenews === "boolean") return mindbodyLine(pending.autoRenews);

  const savedMark = isAutoRenewMark(client.autoRenewMark) ? client.autoRenewMark : null;
  const savedHere = savedMark !== null && savedMark.contractId === contractId;

  if (!canEdit) {
    if (typeof saved.autoRenews !== "boolean") return NO_AUTO_RENEW_VIEW;
    const words =
      saved.autoRenewsFrom === "client" && savedHere
        ? markStamp(savedMark).replace(/^Marked/, "marked")
        : autoRenewSourceWords(saved.autoRenewsFrom);
    return line(joinDots([label(saved.autoRenews), words]), saved.autoRenews);
  }

  const pendingHere = markFor(pendingMark, contractId);
  const staged = !sameMark(pendingMark, savedMark);
  const studio = studioName?.trim() || null;
  const inherited = pending.autoRenewsInherited ?? null;
  const pkg = pending.packageLabel?.split(" · ")[0]?.trim() || "this package";
  const tickHint = `Untick if ${p.subject} ${isNot} on auto-renewal.`;
  const untickHint = `Tick if ${p.subject} ${is} on auto-renewal.`;
  const unmatched = "Mindbody hasn't said, and this contract isn't matched to a package in Renewal settings";
  // Where a cleared mark goes back to, in the Brief's and the Card's words
  // (sentences.ts): the package's, the studio's, the standard — or nothing.
  const backTo = autoRenewSourceWords(inherited?.from);

  let source: string;
  if (staged) {
    source = pendingHere
      ? "Tap Save changes on the bar to keep it."
      : inherited && backTo
        ? `Back to ${backTo} when you save.`
        : `Back to no answer when you save: ${unmatched}.`;
  } else if (savedHere) {
    source = `${markStamp(savedMark)}.`;
  } else if (!inherited) {
    source = `Journey can't tell: ${unmatched}. Tap one once you know whether ${p.subject} ${is} on auto-renewal.`;
  } else if (inherited.from === "package") {
    source = inherited.renews
      ? `${studio ?? "The studio"} set ${pkg} to renew automatically, so this starts ticked. ${tickHint}`
      : `${studio ?? "The studio"} set ${pkg} not to renew by itself, so this starts unticked. ${untickHint}`;
  } else if (inherited.from === "studio") {
    const whose = studio ? `${studio}'s` : "The studio's";
    source = inherited.renews
      ? `${whose} packages renew automatically, so this starts ticked. ${tickHint}`
      : `${whose} packages don't renew by themselves, so this starts unticked. ${untickHint}`;
  } else {
    // "default": the studio never answered, so the standard (ON) — never
    // credited to the studio as its own answer.
    source = inherited.renews
      ? `${studio ?? "The studio"} hasn't said whether its packages renew by themselves. The standard is yes, so this starts ticked. ${tickHint}`
      : `${studio ?? "The studio"} hasn't said whether its packages renew by themselves. The standard is no, so this starts unticked. ${untickHint}`;
  }

  const metas = [
    `This tells Journey's renewal screens what Mindbody is set to. It doesn't change ${p.possessive} billing: auto-renewal itself is changed in Mindbody.`,
  ];
  // A mark from an earlier contract is shown, never used (auto-renew.ts).
  if (savedMark && !savedHere && !pendingHere) {
    const who = savedMark.setByName?.trim();
    metas.push(`${who ? `${who}'s mark` : "The last mark"} was for the contract before this one.`);
  }
  // Saved, and the stored nightly snapshot still says otherwise: the lists
  // catch up tonight. "Saved" is the RECORD — its own lock, not the form's —
  // so a lock only staged to come off never claims a catch-up.
  if (!staged && (client.renewal?.autoRenews ?? null) !== (renewalOf(client)?.autoRenews ?? null)) {
    metas.push("The renewal lists catch up tonight.");
  }

  const answer = typeof pending.autoRenews === "boolean" ? pending.autoRenews : null;
  return {
    kind: "pick",
    pressed: answer === true,
    answer,
    pair: !inherited,
    source,
    metas,
    canClear: pendingHere,
    // Removing a tap over an earlier contract's saved mark puts that mark back.
    clearTo: client.autoRenewMark && !markFor(client.autoRenewMark, contractId) ? client.autoRenewMark : null,
    contractId,
  };
}

/* ------------------------------------------------------------------ */
/* The contract history, as tiles                                      */
/* ------------------------------------------------------------------ */

export interface TimelineTile {
  key: string;
  /** "Mar 2026 – Mar 2027" */
  when: string;
  name: string;
  /** The years before Journey: drawn dashed, first. */
  era: boolean;
  status: ContractTermRow["status"] | null;
  /** "Active", "Ended"… */
  statusText: string | null;
  /** "12 mo", "Paid in full", "Auto-renews", "Bought online". */
  pills: string[];
  /** "95 of 96 sessions left" — paid-in-full rows only. */
  sessions: string | null;
  /** The era's line. */
  meta: string | null;
}

export const STATUS_TEXT: Record<ContractTermRow["status"], string> = {
  upcoming: "Starts soon",
  active: "Active",
  ended: "Ended",
  cancelled: "Cancelled",
};

/** The era tile's "412 sessions in FileMaker", by where the prior record came from. */
const ERA_WHERE: Record<PriorHistorySource, string> = {
  mindbody: "counted from Mindbody",
  filemaker: "in FileMaker",
  paper: "on paper records",
  "trainer-estimate": "by a trainer's estimate",
  other: "recorded before Journey",
};

function eraTile(prior: PriorHistory | null, coverage: HistoryCoverage): TimelineTile | null {
  if (prior && Math.trunc(prior.sessions) > 0) {
    const through = dayKeyDate(prior.through) ? prior.through : null;
    const from = prior.from && dayKeyDate(prior.from) ? prior.from : null;
    const when = through ? (from ? `${monthYear(from)} – ${monthYear(through)}` : `Until ${monthYear(through)}`) : "Before Journey";
    return {
      key: "era",
      when,
      name: `${plural(Math.trunc(prior.sessions), "session")} ${ERA_WHERE[prior.source] ?? ERA_WHERE.other}`,
      era: true,
      status: null,
      statusText: null,
      pills: [],
      sessions: null,
      meta: "Before Journey",
    };
  }
  if (coverage === "complete") return null;
  return {
    key: "era",
    when: "Before Journey",
    name: "Not recorded here",
    era: true,
    status: null,
    statusText: null,
    pills: [],
    sessions: null,
    meta: COVERAGE_CAVEAT[coverage],
  };
}

/**
 * Every package term as a tile, oldest start first (a term whose start is
 * not synced goes last), after the years before Journey when there are any:
 * the prior record's sessions, or — with no record and a story Journey does
 * not hold whole — a "Before Journey" tile, so the list is never read as
 * her whole history. Month labels are Mindbody's UTC days.
 *
 * `lock` is the tier lock as the form holds it: under one that says paid in
 * full or banked sessions, nothing bills, so a running or coming contract's
 * tile never says "Auto-renews" beside the card's "Payments finish"
 * (renewals/auto-renew.ts, step 1). An ended contract's tile keeps
 * Mindbody's record of it.
 */
export function membershipTimeline(
  rows: readonly ContractTermRow[],
  prior: PriorHistory | null,
  coverage: HistoryCoverage,
  lock: ContractTierOverride | null = null,
): TimelineTile[] {
  const nothingBills = lockSaysNothingBills(lock);
  const era = eraTile(prior, coverage);
  const ordered = [...rows].sort((a, b) => {
    const at = a.start?.getTime() ?? null;
    const bt = b.start?.getTime() ?? null;
    if (at === null && bt === null) return a.key.localeCompare(b.key);
    if (at === null) return 1;
    if (bt === null) return -1;
    return at - bt || a.key.localeCompare(b.key);
  });
  const tiles = ordered.map((row): TimelineTile => {
    const start = mindbodyMonth(row.start) ?? "Start not synced";
    const end = mindbodyMonth(row.end) ?? (row.kind === "contract" ? "open-ended" : "no expiry");
    const s = row.sessions;
    return {
      key: row.key,
      when: `${start} – ${end}`,
      name: row.name,
      era: false,
      status: row.status,
      statusText: STATUS_TEXT[row.status],
      pills: [
        row.tier?.term ? `${row.tier.term} mo` : null,
        row.kind === "paid-in-full" ? "Paid in full" : null,
        row.autoRenews && !(nothingBills && (row.status === "active" || row.status === "upcoming")) ? "Auto-renews" : null,
        row.boughtOnline ? "Bought online" : null,
      ].filter((p): p is string => !!p),
      sessions:
        s && typeof s.count === "number"
          ? s.remaining === null
            ? plural(s.count, "session")
            : `${s.remaining} of ${plural(s.count, "session")} left`
          : null,
      meta: null,
    };
  });
  return era ? [era, ...tiles] : tiles;
}

/* ------------------------------------------------------------------ */
/* The sub-toggle's line                                               */
/* ------------------------------------------------------------------ */

/**
 * Account's line on the sub-toggle: "package ended", else how many sessions
 * are left when Mindbody's own figures say so ("95 sessions left"), else
 * what she holds right now ("8 on hand" — `onHandTotal`, the package card's
 * own figure). An ESTIMATE of what is left is never printed here — the page
 * says "(estimated)" beside it; a line this short cannot. Null when nothing
 * is known: no line rather than a guess.
 */
export function accountTabHint(
  client: Pick<Client, "mindbodyServices"> & Partial<Pick<Client, "renewal">>,
  /** Left in the contract and extra, when the profile worked it out (`sessionsSplit`). */
  split?: SessionsSplit | null,
): string | null {
  const r = client.renewal ?? null;
  if (r && (r.situation === "ended" || r.situation === "lapsed")) return "package ended";
  if (r && typeof r.sessionsLeft === "number" && r.sessionsLeftSource === "mindbody") {
    return `${plural(r.sessionsLeft, "session")} left`;
  }
  // No renewal to say what is left: the contract and the extras, the header's
  // own pair (AJ, Sep 26). Short for the portrait bar: "36 left +12 extra".
  if (!r && splitSpeaks(split)) {
    const extra = extraWords(split);
    if (!split.hasContract) return extra;
    const head = split.perPayment ? `${split.contract} on hand` : `${split.contract} left`;
    return extra ? `${head} ${extra}` : head;
  }
  const held = onHandTotal(client);
  return held > 0 ? `${held} on hand` : null;
}

/* ------------------------------------------------------------------ */
/* The Overview's Account slot                                         */
/* ------------------------------------------------------------------ */

export interface AccountGlance {
  /** Every line, in order: `who` then `membership`. */
  lines: string[];
  /** Who she is: age and birthday, the emergency contact, the waiver. */
  who: string[];
  /** Her membership: what is left, the package, where she trains. */
  membership: string[];
  foot: string;
}

/**
 * The few lines the Overview shows for Account: age and birthday, the
 * emergency contact, the waiver, the package, and where she trains. Each is
 * left out when it is not on file (the slot's door says the rest). `who` and
 * `membership` are the same lines split the way the slot draws its two
 * columns (client codex, phase 18); `lines` is both, in order.
 */
export function accountGlance(
  client: Client,
  studios: readonly Pick<Studio, "id" | "name">[],
  today: string,
  now: Date = new Date(),
): AccountGlance {
  const ab = ageAndBirthday(client.dateOfBirth, today);
  const gender = text(client.gender);
  const ageLine =
    ab && ab.age !== null
      ? ab.daysUntil === 0
        ? `${ab.age} today, ${ab.birthday}`
        : `${ab.age}, turns ${ab.turns} on ${ab.birthday}`
      : null;

  const emergencyName = text(client.emergencyContactName);
  const relationship = text(client.emergencyContactRelationship);
  // A client Mindbody does not hold has no waiver there to be "not synced":
  // the slot says what the page says — typed in Journey, not linked.
  const linked = isMindbodyLinked(client);
  const waiver = waiverState(client);
  // With her auto-renewal mark applied, so the slot says what the card says.
  const r = renewalOf(client);

  let renewal: string | null = null;
  if (r && (r.situation === "ended" || r.situation === "lapsed")) {
    renewal = chipText(r, today);
  } else if (r && typeof r.sessionsLeft === "number") {
    const est = r.sessionsLeftSource === "estimate" ? " (estimated)" : "";
    const renews = r.chargeDate ? `${billingEndPhrase(r.autoRenews)} ${dayLabel(r.chargeDate, today)}` : null;
    renewal = joinDots([`${plural(r.sessionsLeft, "session")} left${est}`, renews]);
  }

  const tier = resolveContractTier(client);
  const nameOf = (id: string) => studios.find((s) => s.id === id)?.name?.trim() || null;
  const homeId = recordStudioIdOf(client) ?? "";
  const home = homeId ? nameOf(homeId) : null;
  const also = (client.approvedCrossTrainStudioIds ?? [])
    .filter((id) => id !== homeId)
    .map(nameOf)
    .filter((n): n is string => !!n);

  const present = (list: Array<string | null>) => list.filter((l): l is string => !!l);
  const who = present([
    joinDots([ageLine, gender]) || null,
    emergencyName ? `Emergency: ${emergencyName}${relationship ? `, ${relationship}` : ""}` : null,
    linked || waiver.state !== "unknown"
      ? `Liability waiver ${waiver.label.charAt(0).toLowerCase()}${waiver.label.slice(1)}`
      : null,
  ]);
  const membership = present([
    renewal,
    tier.source === "unknown" ? null : tier.label,
    home ? `Home: ${home}${also.length ? ` · also trains at ${also.join(", ")}` : ""}` : null,
  ]);
  const lines = [...who, ...membership];

  if (!linked) return { lines, who, membership, foot: "Typed in Journey · not linked to Mindbody" };
  const synced = masterSyncLabel(client.mindbodyMasterSyncedAt, now);
  return {
    lines,
    who,
    membership,
    foot: `From Mindbody, ${synced.charAt(0).toLowerCase()}${synced.slice(1)} · the renewal is worked out nightly`,
  };
}

/* ------------------------------------------------------------------ */
/* The page's lede                                                     */
/* ------------------------------------------------------------------ */

/**
 * The Account page's opening lines, true for the client and the reader:
 * where her details come from (Mindbody, or typed into Journey for a client
 * Mindbody does not hold) and what this reader may change here — nothing,
 * for one who may not edit the record (a cross-train studio).
 */
export function accountLede(
  client: Partial<LinkFields> | null | undefined,
  canEdit: boolean,
  p: Pronouns,
): string {
  const linked = isMindbodyLinked(client);
  const opening = linked
    ? `${cap(p.possessive)} contact details as Mindbody knows them, then ${p.possessive} membership.`
    : `${cap(p.possessive)} contact details as typed into Journey, then ${p.possessive} membership.`;
  const how = !canEdit
    ? `Read only here: ${p.possessive} home studio keeps the record.`
    : linked
      ? // Auto-renewal is NOTED here, never changed: the box below says its
        // billing is changed in Mindbody (autoRenewView), so the lede must not
        // say otherwise.
        `The nickname, how ${p.subject} found us, where ${p.subject} can train and the tier lock are changed here, and whether ${p.subject} ${agree(p, "is", "are")} on auto-renewal is noted here for Journey's renewal screens; everything else changes in Mindbody and arrives with the next sync.`
      : `Mindbody does not hold ${p.object} yet, so ${p.possessive} details are typed here until ${p.subject} ${agree(p, "is", "are")} linked.`;
  return `${opening} ${how}`;
}
