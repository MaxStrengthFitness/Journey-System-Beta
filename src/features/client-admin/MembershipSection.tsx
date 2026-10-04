/**
 * MEMBERSHIP — what she has bought, what is left, and where she can train.
 *
 * Client codex, Sep 2026 (phase 16). This was the long scroll's contract
 * panel (ContractPanel, the client-profile audit's Admin section), restyled
 * onto the codex kit with the same logic and the same writes:
 *
 *   The package            what she is on (the tier, where that came from,
 *                          and the coach's LOCK), what is left (the nightly
 *                          renewal snapshot, read as it is), and the
 *                          contract history as tiles, oldest first — the
 *                          years before Journey first, dashed
 *   Where she can train    home, whether this iPad's studio has cleared her,
 *                          and the studios a leader approves her at
 *   On file with Mindbody  the waiver (three states), her status — with the
 *                          prospect and inactive flags Master Sync writes,
 *                          which nothing read until now — since when, and
 *                          Mindbody's own visit count
 *   How she found us       lead source and who referred her: the coach's
 *                          text, out of the fine print and onto the page
 *   The fine print         folded: the contract's number, sessions on hand,
 *                          memberships, Mindbody's other indexes, the sync
 *                          stamps, and the Migration Hub
 *
 * EVERY WRITE IS THE RECORD FORM'S: the lock (`contractTierOverride`, named
 * with the Auth uid — the same object ContractPanel built), the auto-renewal
 * box (`autoRenewMark`, Sep 25 2026: the same kind of stamped object, bound
 * to the contract it was ticked on — renewals/auto-renew.ts; every word of
 * it is account.ts autoRenewView), the cross-train studios, the lead source
 * and the referral. Done only closes an editor and
 * the Save bar saves ("Account · Membership", "· Where they can train",
 * "· How they found us"). `renewal` is the nightly job's and is never
 * written; nothing here syncs (the header's Master Sync is the one sync).
 *
 * A reader who may not change the record (codexAccess().canEdit false) sees
 * every fact — the client document is readable to a cross-train studio — and
 * no Lock, no auto-renewal box (its answer in words instead), no studio
 * toggle, no Edit and no Migration Hub, so the rules never
 * refuse a button the page offered.
 *
 * Colour: a renewal's tone is the package card's left edge (`tabTone`):
 * green on track, plum a caution — an ended package included, never crimson.
 * "Time for the renewal conversation" is brand blue, never hero orange.
 */
import { useMemo } from "react";
import {
  CalendarCheck,
  Check,
  CalendarClock,
  CheckSquare,
  ChevronDown,
  FileCheck,
  Lock,
  MapPin,
  Package,
  RefreshCw,
  ScrollText,
  Square,
  Undo2,
  Unlock,
  Upload,
  UserPlus,
} from "lucide-react";
import type { AutoRenewMark, Client, ContractTierOverride, Studio } from "../../types";
import { markAfterTap } from "../renewals/auto-renew";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { mindbodyIdOf } from "../../lib/mindbody-id";
import { formatMindbodyDate, toDateSafe, type FirestoreDateLike } from "../../lib/mindbody-dates";
import { priorHistoryOf, type HistoryCoverage } from "../../lib/prior-history";
import { masterSyncLabel } from "../client-profile/sync-label";
import {
  BigNumber,
  Btn,
  Card,
  CardHead,
  Chip,
  Chips,
  EmptyLine,
  Eyebrow,
  Fact,
  FactList,
  Meta,
  Pick,
  ReadEdit,
  SectionHead,
  Source,
  TextInput,
  agree,
  anchorProps,
  cap,
  joinDots,
  useReadEdit,
  type ChipTone,
  type Pronouns,
} from "../client-codex/kit";
import type { RecordForm } from "../client-codex/useRecordForm";
import { recordStudioIdOf } from "../client-codex/access";
import {
  PACKAGE_NAME,
  buildContractHistory,
  crossStudioClearance,
  crossTrainChoices,
  currentContract,
  sessionsOnHand,
  type CommitmentTerm,
  type ContractTermRow,
  type PaymentKind,
} from "./contract";
import {
  AUTO_RENEW_CLEAR_LABEL,
  AUTO_RENEW_LABEL,
  AUTO_RENEW_NO_LABEL,
  autoRenewView,
  firstDayView,
  isMindbodyLinked,
  membershipTimeline,
  onFileFacts,
  packageView,
  tierSourceLine,
  type SessionsSplit,
} from "./account";
import "./client-admin.css";

export interface MembershipSectionProps {
  client: Client;
  form: Pick<RecordForm, "formData" | "updateField" | "isDirty" | "revision">;
  /** The studios this reader may see (the cross-train list names them). */
  studios: readonly Studio[];
  /** Who is signed in — the Auth uid names a lock, as the old record's did. */
  author: { id: string; name: string } | null;
  /** How much of her story Journey holds: the "Before Journey" tile. */
  coverage: HistoryCoverage;
  /** May change the client record (codexAccess().canEdit). */
  canEdit: boolean;
  pronouns: Pronouns;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
  /** The Migration Hub (OCR import); the profile switches to Journey, where imports land. */
  onOpenMigrationHub?: () => void;
  /**
   * Left in the contract and extra (`sessionsSplit`), worked out ONCE by the
   * profile so the package card and the header say the same pair. Null or
   * left out: the on-hand total speaks, as before.
   */
  split?: SessionsSplit | null;
  /** For "synced 2 days ago"; the real clock when left out. */
  now?: Date;
}

const TERM_CHOICES: { term: CommitmentTerm | null; payment: PaymentKind; label: string }[] = [
  { term: 6, payment: "monthly", label: "6 mo · monthly" },
  { term: 12, payment: "monthly", label: "12 mo · monthly" },
  { term: 18, payment: "monthly", label: "18 mo · monthly" },
  { term: 6, payment: "pif", label: "6 mo · paid in full" },
  { term: 12, payment: "pif", label: "12 mo · paid in full" },
  { term: 18, payment: "pif", label: "18 mo · paid in full" },
  { term: null, payment: "month-to-month", label: "Month-to-month" },
];

const STATUS_TONE: Record<ContractTermRow["status"], ChipTone> = {
  upcoming: "live",
  active: "ok",
  ended: "neutral",
  cancelled: "neutral",
};

type FormPart = MembershipSectionProps["form"];

/* ------------------------------------------------------------------ */
/* The package                                                         */
/* ------------------------------------------------------------------ */

function PackageCard({
  client,
  form,
  author,
  coverage,
  canEdit,
  today,
  split,
  pronouns,
  studioName,
}: Pick<MembershipSectionProps, "client" | "author" | "coverage" | "canEdit" | "today" | "split" | "pronouns"> & {
  form: FormPart;
  /** The client's home studio, named in the auto-renewal box's sentences. */
  studioName: string | null;
}) {
  const { formData, updateField, isDirty, revision } = form;
  const picker = useReadEdit({ canEdit, revision });

  // The form holds the unsaved lock (null once it is taken off), the client the saved one.
  const pendingOverride: ContractTierOverride | null =
    "contractTierOverride" in formData ? formData.contractTierOverride ?? null : client.contractTierOverride ?? null;
  // The same for the auto-renewal mark (null once "Remove this mark" is
  // tapped, or the saved mark back when that one was an earlier contract's).
  const pendingMark: AutoRenewMark | null =
    "autoRenewMark" in formData ? formData.autoRenewMark ?? null : client.autoRenewMark ?? null;
  const view = useMemo(
    () => packageView(client, pendingOverride, today, split, pendingMark),
    [client, pendingOverride, today, split, pendingMark],
  );
  const renew = useMemo(
    () => autoRenewView({ client, pendingMark, pendingOverride, canEdit, pronouns, studioName }),
    [client, pendingMark, pendingOverride, canEdit, pronouns, studioName],
  );
  const rows = useMemo(() => buildContractHistory(client, today), [client, today]);
  const tiles = useMemo(
    () => membershipTimeline(rows, priorHistoryOf(client), coverage, pendingOverride),
    [rows, client, coverage, pendingOverride],
  );
  const dirty = isDirty("contractTierOverride") || isDirty("autoRenewMark");

  // The box flips the answer; each of the pair (Journey can't tell) sets its own.
  const tapAutoRenew = (want: boolean) => {
    if (renew.kind !== "pick" || !renew.contractId) return;
    updateField(
      "autoRenewMark",
      markAfterTap({
        want,
        saved: client.autoRenewMark,
        contractId: renew.contractId,
        author,
        now: new Date(),
      }),
    );
  };

  const lock = (term: CommitmentTerm | null, payment: PaymentKind) => {
    const next: ContractTierOverride = {
      term,
      payment,
      setAt: new Date().toISOString(),
      ...(author?.id ? { setById: author.id } : {}),
      ...(author?.name ? { setByName: author.name } : {}),
    };
    updateField("contractTierOverride", next);
    picker.setOpen(false);
  };
  const unlock = () => {
    updateField("contractTierOverride", null);
    picker.setOpen(false);
  };

  const { tier } = view;
  const mbId = mindbodyIdOf(client);

  return (
    <section className="cx-card cadm-pkg" data-tone={view.tone === "neutral" ? undefined : view.tone} aria-label="The package">
      <CardHead
        eyebrow="The package"
        icon={Package}
        meta={dirty ? <Chip tone="live">Unsaved</Chip> : null}
        actions={
          canEdit ? (
            <>
              <Btn
                icon={Lock}
                variant={picker.open ? "live" : "default"}
                aria-expanded={picker.open}
                onClick={picker.toggle}
              >
                {tier.source === "override" ? "Change lock" : "Lock the tier"}
              </Btn>
              {pendingOverride ? (
                <Btn variant="quiet" icon={Unlock} onClick={unlock}>
                  Use Mindbody's
                </Btn>
              ) : null}
            </>
          ) : null
        }
      />

      {picker.open ? (
        <div className="cadm-picker" role="group" aria-label="Lock the contract tier">
          <div className="cadm-picker__list">
            {TERM_CHOICES.map((c) => {
              const on = pendingOverride?.payment === c.payment && (pendingOverride?.term ?? null) === c.term;
              return (
                <Pick
                  key={c.label}
                  pressed={on}
                  hint={c.term ? PACKAGE_NAME[c.term] : undefined}
                  onClick={() => lock(c.term, c.payment)}
                >
                  {c.label}
                </Pick>
              );
            })}
          </div>
          <Meta>A lock wins over Mindbody until it is taken off. Tap Save changes on the bar to keep it.</Meta>
        </div>
      ) : null}

      <div className="cadm-pkg__cols">
        <div className="cadm-pkg__col" role="group" aria-label={`Tier: ${tier.label}`}>
          <BigNumber>{view.headline}</BigNumber>
          {view.terms ? <span className="cadm-pkg__words">{view.terms}</span> : null}
          <Source>{tierSourceLine(tier)}</Source>
          {view.mindbodyReads ? <Meta>{`Mindbody reads as: ${view.mindbodyReads}`}</Meta> : null}
        </div>
        <div className="cadm-pkg__col" role="group" aria-label="What is left">
          <BigNumber>{view.left}</BigNumber>
          <span className="cadm-pkg__words">{view.leftWords}</span>
          {view.held ? <span className="cadm-pkg__words">{view.held}</span> : null}
          {view.payments ? <span className="cadm-pkg__words">{view.payments}</span> : null}
          <span className="cadm-pkg__words">{view.when}</span>
          {view.worked ? <Source>Worked out each night · Operations → Renewals</Source> : null}
        </div>
      </div>

      {renew.kind ? (
        <div className="cadm-renew" role="group" aria-label="Auto-renewal">
          {renew.kind === "pick" ? (
            <div className="cadm-renew__row">
              <Pick pressed={renew.pressed} onClick={() => tapAutoRenew(renew.pair ? true : !renew.pressed)}>
                {renew.pressed ? <CheckSquare size={18} aria-hidden="true" /> : <Square size={18} aria-hidden="true" />}
                {AUTO_RENEW_LABEL}
              </Pick>
              {renew.pair ? (
                // Journey can't tell: "no" is an answer to give, never what an
                // unticked box is taken to mean.
                <Pick pressed={renew.answer === false} onClick={() => tapAutoRenew(false)}>
                  {renew.answer === false ? (
                    <CheckSquare size={18} aria-hidden="true" />
                  ) : (
                    <Square size={18} aria-hidden="true" />
                  )}
                  {AUTO_RENEW_NO_LABEL}
                </Pick>
              ) : null}
              {renew.canClear ? (
                <Btn variant="quiet" icon={Undo2} onClick={() => updateField("autoRenewMark", renew.clearTo)}>
                  {AUTO_RENEW_CLEAR_LABEL}
                </Btn>
              ) : null}
            </div>
          ) : null}
          {renew.kind === "line" ? (
            <p className="cadm-line" data-testid="auto-renew-line">
              <RefreshCw size={16} aria-hidden="true" />
              <span>{renew.source}</span>
            </p>
          ) : null}
          {renew.kind === "pick" && renew.source ? <Source>{renew.source}</Source> : null}
          {renew.metas.map((m) => (
            <Meta key={m}>{m}</Meta>
          ))}
        </div>
      ) : null}

      {view.status ? (
        <p className="cadm-line">
          <CalendarClock size={16} aria-hidden="true" />
          <span>{view.status}</span>
        </p>
      ) : null}
      {view.pace ? <Meta>{view.pace}</Meta> : null}
      {view.conversationDue ? (
        <p className="cadm-due">Time for the renewal conversation — a progress report now lands before the decision.</p>
      ) : null}
      {view.gap ? <Meta>{view.gap}</Meta> : null}

      <Eyebrow as="h4" icon={ScrollText}>
        Contract history
      </Eyebrow>
      {tiles.length > 0 ? (
        <ol className="cadm-tl" data-testid="contract-timeline">
          {tiles.map((t) => (
            <li key={t.key} className="cadm-tl__tile" data-era={t.era ? "" : undefined} data-status={t.status ?? undefined}>
              <span className="cadm-tl__when">{t.when}</span>
              <span className="cadm-tl__name">{t.name}</span>
              {t.statusText || t.pills.length > 0 ? (
                <Chips>
                  {t.status && t.statusText ? <Chip tone={STATUS_TONE[t.status]}>{t.statusText}</Chip> : null}
                  {t.pills.map((pill) => (
                    <Chip key={pill}>{pill}</Chip>
                  ))}
                </Chips>
              ) : null}
              {t.sessions ? <span className="cadm-tl__meta">{t.sessions}</span> : null}
              {t.meta ? <span className="cadm-tl__meta">{t.meta}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {rows.length === 0 ? (
        <Meta>
          {`No contracts or paid-in-full packages on file${mbId ? " — Sync at the top of the profile pulls them." : "."}`}
        </Meta>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Where she can train                                                 */
/* ------------------------------------------------------------------ */

function TrainAtCard({
  client,
  form,
  studios,
  canEdit,
  pronouns: p,
}: Pick<MembershipSectionProps, "client" | "studios" | "canEdit" | "pronouns"> & { form: FormPart }) {
  const { activeStudioId } = useActiveStudio();
  const { formData, updateField, isDirty } = form;
  const homeId = recordStudioIdOf(client);
  // No studios yet (still loading, or the read failed) is unknown, never
  // "none": the card says the names are not loaded rather than "No other
  // studios to approve" over a raw studio id.
  const loaded = studios.length > 0;
  const homeName = homeId ? studios.find((s) => s.id === homeId)?.name?.trim() || null : null;
  const home = homeName ?? (homeId ? (loaded ? "A studio not listed here" : "Studio names not loaded yet") : null);
  const approved: string[] = formData.approvedCrossTrainStudioIds ?? client.approvedCrossTrainStudioIds ?? [];
  const clearance = crossStudioClearance(
    { homeStudioId: homeId ?? "", approvedCrossTrainStudioIds: approved },
    activeStudioId,
  );
  const hereName = studios.find((s) => s.id === activeStudioId)?.name;
  /* Only studios in the client's realm are offered, and only they may be
     toggled: a demo client never gets a real studio id, nor the reverse. */
  const choices = crossTrainChoices([...studios], { ...client, homeStudioId: homeId ?? undefined });
  const toggle = (id: string) => {
    if (!choices.some((s) => s.id === id)) return;
    updateField(
      "approvedCrossTrainStudioIds",
      approved.includes(id) ? approved.filter((s) => s !== id) : [...approved, id],
    );
  };
  const approvedNames = approved
    .filter((id) => id !== homeId)
    .map((id) => studios.find((s) => s.id === id)?.name?.trim())
    .filter((n): n is string => !!n);
  const unnamed = approved.filter((id) => id !== homeId).length - approvedNames.length;
  const title = `Where ${p.subject} can train`;

  return (
    <Card
      eyebrow={title}
      icon={MapPin}
      id="account-train-at"
      meta={isDirty("approvedCrossTrainStudioIds") ? <Chip tone="live">Unsaved</Chip> : null}
      source={canEdit && choices.length > 0 ? "Tap a studio to approve cross-training there; Save changes on the bar keeps it." : null}
    >
      <FactList>
        <Fact label="Home">{homeName ?? <span className="cadm-missing">{home ?? "Not set"}</span>}</Fact>
        <Fact label="Also at">
          {canEdit ? (
            choices.length === 0 ? (
              <span className="cadm-missing">{loaded ? "No other studios to approve." : "Studio names not loaded yet."}</span>
            ) : (
              <span className="cadm-picks" role="group" aria-label={`${cap(p.subject)} may also train at`}>
                {choices.map((s) => (
                  <Pick key={s.id} pressed={approved.includes(s.id!)} onClick={() => toggle(s.id!)}>
                    {s.name}
                  </Pick>
                ))}
              </span>
            )
          ) : approvedNames.length > 0 || unnamed > 0 ? (
            joinDots([approvedNames.join(", "), unnamed > 0 ? `${unnamed} other studio${unnamed === 1 ? "" : "s"}` : null])
          ) : (
            <span className="cadm-missing">None</span>
          )}
        </Fact>
      </FactList>
      {clearance === "approved" && hereName ? (
        <div>
          <Chip tone="ok">{`Cleared to train at ${hereName}`}</Chip>
        </div>
      ) : clearance === "not-approved" && hereName ? (
        <div>
          <Chip tone="warn">{`NOT yet cleared to train at ${hereName}`}</Chip>
        </div>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* On file with Mindbody                                               */
/* ------------------------------------------------------------------ */

function OnFileCard({ client, pronouns: p }: { client: Client; pronouns: Pronouns }) {
  const facts = onFileFacts(client);
  // A client Mindbody does not hold has nothing there to sync: say that once,
  // rather than "Not synced yet" four times over a Sync that cannot help.
  if (!isMindbodyLinked(client) && facts.every((f) => f.empty)) {
    return (
      <Card eyebrow="On file with Mindbody" icon={FileCheck} id="account-on-file">
        <EmptyLine>{`Not linked to Mindbody, so Mindbody has nothing on file for ${p.object} yet.`}</EmptyLine>
      </Card>
    );
  }
  return (
    <Card eyebrow="On file with Mindbody" icon={FileCheck} id="account-on-file">
      <FactList>
        {facts.map((f) => (
          <Fact key={f.key} label={f.label} source={f.source}>
            {f.key === "waiver" && !f.empty ? (
              <span>
                <Chip tone={f.tone === "neutral" ? "neutral" : f.tone}>{f.value}</Chip>
              </span>
            ) : (
              <span className={f.empty ? "cadm-missing" : undefined}>{f.value}</span>
            )}
          </Fact>
        ))}
      </FactList>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Her first day at the studio                                         */
/* ------------------------------------------------------------------ */

/**
 * The one place her first day is set (Sep 29 2026). Every other date is a
 * guess from the record; this is what a person knows. It writes
 * `firstStudioDay` through the ONE form, so the Save bar names it
 * ("Account · First day at the studio"), and "Client since", the codex
 * Story and Operations → Month's anniversaries all read it first.
 */
function FirstDayCard({
  client,
  form,
  coverage,
  canEdit,
  pronouns: p,
}: Pick<MembershipSectionProps, "client" | "coverage" | "canEdit" | "pronouns"> & { form: FormPart }) {
  const { formData, updateField, isDirty, revision } = form;
  const raw = formData.firstStudioDay;
  const value = typeof raw === "string" ? raw : "";
  const view = firstDayView({ ...client, firstStudioDay: value || null }, coverage);
  const guess = view.guess;
  const read = view.words ? (
    <FactList>
      <Fact label="First day" source="Set by a person; anniversaries count from this day.">
        {view.words}
      </Fact>
    </FactList>
  ) : guess?.confirmed ? (
    // Journey holds her whole story: her first session IS her first day
    // (Oct 2 2026: "a new client's first Journey session sets it").
    <FactList>
      <Fact label="First day" source={`From ${guess.from}; Journey holds ${p.possessive} whole story, so anniversaries count from it.`}>
        {guess.words}
      </Fact>
    </FactList>
  ) : (
    <>
      <FactList>
        <Fact
          label="First day"
          source={guess ? `From ${guess.from}. Anniversaries wait until a trainer confirms it.` : "The app has no date to go on yet."}
        >
          <span className="cadm-missing">{guess ? `${guess.words} (from Mindbody, not yet confirmed)` : "Not set"}</span>
        </Fact>
      </FactList>
      {canEdit && guess?.day ? (
        // One tap: Mindbody's day becomes the confirmed first day, through
        // the one form, so the Save bar names it like any other edit.
        <Btn
          variant="solid"
          icon={Check}
          data-action="first-day-confirm"
          aria-label={`Confirm ${p.possessive} first day: ${guess.words}`}
          onClick={() => updateField("firstStudioDay", guess.day)}
        >
          Confirm {guess.words}
        </Btn>
      ) : null}
    </>
  );
  return (
    <ReadEdit
      label="First day at the studio"
      icon={CalendarCheck}
      canEdit={canEdit}
      dirty={isDirty("firstStudioDay")}
      revision={revision}
      id="account-first-day"
      read={read}
      edit={
        <div className="cadm-edit">
          <div className="cadm-edit__grid">
            <TextInput
              label={`The day ${p.subject} first trained here`}
              type="date"
              value={value}
              onChange={(v) => updateField("firstStudioDay", v || null)}
              hint={view.guess ? `The app's guess is ${view.guess.words} (${view.guess.from}). The day ${p.subject} first trained here is usually earlier.` : "Anniversaries count from this day."}
            />
          </div>
          <Meta>Nothing is saved until you tap Save changes on the bar at the bottom.</Meta>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* How she found us                                                    */
/* ------------------------------------------------------------------ */

const REFERRED_HINT = "Mindbody fills this only when it's blank; an edit here is never overwritten.";

function FoundUsCard({
  form,
  canEdit,
  pronouns: p,
}: Pick<MembershipSectionProps, "canEdit" | "pronouns"> & { form: FormPart }) {
  const { formData, updateField, isDirty, revision } = form;
  const value = (key: "leadSource" | "referredBy") => {
    const v = formData[key];
    return typeof v === "string" ? v : "";
  };
  const shown = (key: "leadSource" | "referredBy") =>
    value(key).trim() ? value(key).trim() : <span className="cadm-missing">Not recorded</span>;
  return (
    <ReadEdit
      label={`How ${p.subject} found us`}
      icon={UserPlus}
      canEdit={canEdit}
      dirty={isDirty("leadSource", "referredBy")}
      revision={revision}
      id="account-found-us"
      read={
        <FactList>
          <Fact label="Lead source">{shown("leadSource")}</Fact>
          <Fact label="Referred by" source={REFERRED_HINT}>
            {shown("referredBy")}
          </Fact>
        </FactList>
      }
      edit={
        <div className="cadm-edit">
          <div className="cadm-edit__grid">
            <TextInput label="Lead source" value={value("leadSource")} onChange={(v) => updateField("leadSource", v)} />
            <TextInput
              label="Referred by"
              value={value("referredBy")}
              onChange={(v) => updateField("referredBy", v)}
              hint={REFERRED_HINT}
            />
          </div>
          <Meta>Nothing is saved until you tap Save changes on the bar at the bottom.</Meta>
        </div>
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* The fine print                                                      */
/* ------------------------------------------------------------------ */

function FinePrint({
  client,
  canEdit,
  pronouns: p,
  onOpenMigrationHub,
  now,
}: Pick<MembershipSectionProps, "client" | "canEdit" | "pronouns" | "onOpenMigrationHub" | "now">) {
  const contract = currentContract(client);
  const onHand = sessionsOnHand(client);
  const memberships = Object.values(client.mindbodyMemberships || {})
    .filter((m) => m.status === "Active")
    .map((m) => m.membershipName || `#${m.membershipId}`);
  // Mindbody's long-term goal is Goals & Focus's (her why); the rest are here.
  const indexes = Object.entries(client.mindbodyIndexes || {}).filter(
    ([k]) => k !== "LongtermGoal" && k !== "LongTermGoal",
  );
  // A server timestamp, not a Mindbody day: the iPad's local date.
  const pulled = toDateSafe(client.mindbodyCommercialSyncedAt as FirestoreDateLike)?.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const hub = canEdit && onOpenMigrationHub;

  return (
    <details className="cx-card cadm-fine" {...anchorProps("account-fine-print")}>
      <summary className="cadm-fine__summary">
        <span className="cx-eyebrow">Fine print</span>
        <span className="cadm-fine__what">
          {`contract numbers, sessions on hand, sync stamps${hub ? ", tools" : ""}`}
        </span>
        <ChevronDown className="cadm-fine__chev" size={18} aria-hidden="true" />
      </summary>
      <FactList>
        {contract ? (
          <Fact label="Contract">
            {joinDots([
              `#${String(contract.clientContractId)}`,
              contract.agreementDate ? `signed ${formatMindbodyDate(contract.agreementDate)}` : null,
              contract.soldByStaffName ? `sold by ${contract.soldByStaffName}` : null,
              contract.autopayStatus ? `autopay ${contract.autopayStatus.toLowerCase()}` : null,
            ])}
          </Fact>
        ) : null}
        <Fact label="On hand">
          {onHand.length === 0 ? (
            <span className="cadm-missing">None reported</span>
          ) : (
            <span className="cadm-lines">
              {onHand.map((s) => (
                <span key={s.key}>{`${s.name}: ${s.remaining}${s.count != null ? ` of ${s.count}` : ""}`}</span>
              ))}
            </span>
          )}
        </Fact>
        {memberships.length > 0 ? (
          <Fact label="Memberships">
            <span className="cadm-lines">
              {memberships.map((m, i) => (
                <span key={`${m}-${i}`}>{m}</span>
              ))}
            </span>
          </Fact>
        ) : null}
        {indexes.length > 0 ? (
          <Fact label="Mindbody indexes">
            <span className="cadm-lines">
              {indexes.map(([k, v]) => (
                <span key={k}>{`${k}: ${v}`}</span>
              ))}
            </span>
          </Fact>
        ) : null}
        <Fact label="Last pull" source="Contracts, pricing options and memberships, read from Mindbody.">
          {pulled ?? <span className="cadm-missing">Never</span>}
        </Fact>
        {isMindbodyLinked(client) ? (
          <Fact label="Last read" source={`When Journey last read ${p.object} from Mindbody. Sync is at the top of the profile.`}>
            {masterSyncLabel(client.mindbodyMasterSyncedAt, now)}
          </Fact>
        ) : (
          <Fact label="Last read">
            <span className="cadm-missing">Not linked to Mindbody</span>
          </Fact>
        )}
        {hub ? (
          <Fact
            label="Tools"
            source={`Imports past sessions from paper charts. The profile switches to Journey, where they land.`}
          >
            <span>
              <Btn icon={Upload} onClick={onOpenMigrationHub}>
                Migration Hub (OCR)
              </Btn>
            </span>
          </Fact>
        ) : null}
      </FactList>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* The section                                                         */
/* ------------------------------------------------------------------ */

export function MembershipSection(props: MembershipSectionProps) {
  const { client, form, studios, author, coverage, canEdit, pronouns: p, today, onOpenMigrationHub, split, now } = props;
  const homeId = recordStudioIdOf(client);
  const homeStudioName = (homeId ? studios.find((s) => s.id === homeId)?.name?.trim() : null) || null;
  return (
    <>
      <SectionHead
        id="account-membership"
        aside={`what ${p.subject} ${agree(p, "has", "have")} bought, what is left, and where ${p.subject} can train`}
      >
        Membership
      </SectionHead>
      <div className="cadm-row cadm-row--membership">
        <PackageCard
          client={client}
          form={form}
          author={author}
          coverage={coverage}
          canEdit={canEdit}
          today={today}
          split={split}
          pronouns={p}
          studioName={homeStudioName}
        />
        <div className="cadm-side">
          <TrainAtCard client={client} form={form} studios={studios} canEdit={canEdit} pronouns={p} />
          <OnFileCard client={client} pronouns={p} />
          <FirstDayCard client={client} form={form} coverage={coverage} canEdit={canEdit} pronouns={p} />
          <FoundUsCard form={form} canEdit={canEdit} pronouns={p} />
        </div>
      </div>
      <FinePrint client={client} canEdit={canEdit} pronouns={p} onOpenMigrationHub={onOpenMigrationHub} now={now} />
    </>
  );
}
