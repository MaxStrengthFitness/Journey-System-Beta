/**
 * PROFILE HEADER — identity, four headline facts, one loud action.
 *
 * Row 1  ‹ avatar  NAME                                   [▶ START SESSION]
 *                 ▪▪▪ studio · client since · flags     [Track][Note][⟳]
 * Row 2  Top trainer │ Last session │ Next session │ Sessions completed · package
 *
 * Decisions (Sep 5 2026 round):
 *  - Top trainer is READ from the persisted tally (useTopTrainer), not
 *    counted from whatever page of history happens to be loaded.
 *  - "Sessions completed" lost its "/ 46 total" tail. The package sits
 *    beside it instead, in Mindbody blue when Mindbody supplied it.
 *  - Next session shows the weekday and the time — "see you Tuesday at
 *    two" is the sentence this tile exists to support.
 *  - Profile Details moved into the tab row; the header keeps exactly one
 *    button, so the eye has nowhere to go but Start Session.
 *  - (Sep 24 2026) The line under the count is the door to Sessions before
 *    Journey — see prior-history-door.ts.
 */
import { useState, type ReactNode } from "react";
import { BadgeCheck, ChevronLeft, Clock, Eye, History, NotebookPen, Play, RefreshCw, Trash2, UserCheck, AlertTriangle, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn, parseSessionDate } from "../../lib/utils";
import { formatStudioTime, studioDayKeyOf, toDate, zonedYMD } from "../../lib/studio-time";
import { clientSinceLabel } from "../../lib/client-since";
import type { HistoryCoverage } from "../../lib/prior-history";
import type { Client, ScheduleEntry, WorkoutSession } from "../../types";
import type { PackageSummary } from "./client-package";
import { remainingLabel } from "./client-package";
import type { TopTrainerState } from "./useTopTrainer";
import { tallyRows } from "../../lib/client-rollups";
import type { Trainer } from "../../types";
import { BrandTiles } from "./BrandTiles";
import { headerContractWords, headerRenewalWords } from "./header-renewal";
import { renewalOf } from "../renewals/auto-renew";
import { bookedLabel, nextSessionHeadline } from "./next-session-tile";
import { clientDisplayName, clientInitials, clientLegalName, goesByNickname } from "../../lib/client-name";
import { sessionCountLabel } from "../../lib/history-claims";
import { lateCancelCount } from "../../lib/late-cancels";
import { whoStartedIt } from "../session-record/watch";
import { contractWords, extraWords, splitSpeaks, type SessionsSplit } from "../client-admin/account";

export interface ActiveSessionLike {
  id?: string;
  trainerId?: string;
  trainerInitials?: string;
  startedByTrainerId?: string;
  startTime?: { toMillis?: () => number } | null;
  clientStartTime?: string;
}

/**
 * The Kaizen Roster toggle, passed in rather than wired here.
 *
 * Absent when there is no signed-in trainer to own a roster. The header stays
 * dumb: ClientProfileView owns the mutation, this owns the pixel.
 */
export interface KaizenToggleState {
  isOn: boolean;
  busy?: boolean;
  onToggle: () => void;
}

/**
 * The Master Sync button (client-profile audit, Sep 2026): the ONE place a
 * trainer refreshes a client from Mindbody. Passed in like the Kaizen toggle.
 */
export interface MasterSyncState {
  busy: boolean;
  onSync: () => void;
  /** "Synced 3 days ago" / "Never synced", for the title and the sub-label. */
  label: string;
  /** False when the client has no Mindbody ID — the button explains why. */
  available: boolean;
}

export interface ProfileHeaderProps {
  client: Client;
  studioName?: string | null;
  sessions: WorkoutSession[];
  scheduledSessions: ScheduleEntry[];
  /**
   * The client's completed-session total, or null while it is not known -
   * never a 0 standing in for "not counted yet" (Sep 24 2026).
   */
  completedCount: number | null;
  /**
   * Her late cancels, tallied BESIDE the count, never inside it (Atlas
   * answers, Oct 2 2026: "40 sessions · 2 late cancels"). Null or absent
   * while unknown: nothing is said.
   */
  lateCancels?: number | null;
  /**
   * The count may be read as her total (`canQuoteSessionNumber`,
   * lib/client-coverage.ts). When it is only what Journey has seen - a
   * migration client nobody has recorded a total for - the tile says
   * "Sessions in Journey" instead of passing it off as her lifetime.
   */
  sessionsQuotable?: boolean;
  /**
   * How much of her story Journey holds (`coverageOfClient`). "Client
   * since" counts her first session in Journey only when it is "complete"
   * with no prior record - the codex Story's rule - so a FileMaker client
   * whose only date is the day Journey met her reads "In Journey since",
   * the same words as the Story beneath. Absent reads as "unknown".
   */
  coverage?: HistoryCoverage;
  topTrainer: TopTrainerState;
  /** Everyone on the studio's list, to name the trainers in the tally. */
  trainers?: Trainer[];
  pkg: PackageSummary;
  /**
   * Left in the contract and extra, worked out once by the profile
   * (`sessionsSplit`, AJ Sep 26 2026) — Account prints the same pair. With no
   * renewal on the tile it takes the Mindbody pill's place: "36 left in
   * contract" and "+12 extra". Null or left out: the pill, as before.
   */
  sessionsSplit?: SessionsSplit | null;
  activeInProgressSession?: ActiveSessionLike | null;
  isCheckingActiveSession?: boolean;
  onBack: () => void;
  onStartSession: () => void;
  /**
   * The running session is this trainer's (lib/live-session.ts): the menu
   * offers Continue. Someone else's offers Watch, which opens it read-only
   * with Take over there (session record, Sep 26 2026). Unsaid, it is
   * treated as theirs to continue: the Active Session decides again anyway.
   */
  sessionIsMine?: boolean;
  onContinueSession: () => void;
  onWatchSession: () => void;
  onDiscardSession: () => void;
  kaizen?: KaizenToggleState;
  sync?: MasterSyncState;
  /**
   * Quick note (Operations overhaul, Sep 2026): opens the note box over the
   * profile, whatever tab it is on. AJ, Sep 19: a note took too many taps.
   */
  onQuickNote?: () => void;
  /**
   * The renewal line (Renewals round, Sep 2026), from the nightly snapshot.
   * When present, the package tile shows it and opens the Renewal card.
   */
  renewal?: RenewalTileState;
}

/** What the package tile says about the renewal, and where a tap goes. */
export interface RenewalTileState {
  /** "9 left · auto-renews Nov 14" — see features/renewals/sentences.ts. */
  text: string;
  tone: "ok" | "warn" | "alert" | "neutral";
  /** Something to talk about now: a conversation due, a charge coming, an ended package. */
  attention: boolean;
  onOpen: () => void;
}

const RENEWAL_TONE: Record<RenewalTileState["tone"], string> = {
  ok: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  alert: "text-rose-700 dark:text-rose-400",
  neutral: "text-muted-foreground",
};

const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function relativeDays(ms: number): string | null {
  if (!ms) return null;
  const days = Math.round((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} wk ago`;
  return `${Math.round(days / 30)} mo ago`;
}

function daysUntil(d: Date): string | null {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days > 1) return `in ${days} days`;
  return null;
}

/*
 * `clientSince` used to live here as a four-step fallback ending on
 * client.createdAt -- the day the JOURNEY document was made. On a roster
 * imported from Mindbody that last step fires for almost everyone, so the
 * card confidently reported a member of eleven years as joining last month.
 *
 * The rule now lives in lib/client-since.ts, consults the contract and
 * membership dates the commercial sync already writes, and returns its own
 * LABEL -- so a Journey-only date renders as "In Journey since" and cannot
 * pass itself off as a start date at the business. Journey's first session
 * is a Journey-only date too unless Journey holds her whole story, which is
 * why the header takes the coverage (Sep 24 2026).
 */

/* ------------------------------------------------------------------ */

function Stat({
  label,
  icon,
  children,
  sub,
  meter,
  className,
  onClick,
  ariaLabel,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  sub?: ReactNode;
  /**
   * Optional fuel gauge drawn on the tile's bottom edge. Absolute, so a
   * ratio becomes readable at a glance without costing the header a single
   * pixel of height — which the Journey grid below spends on machines.
   */
  meter?: { value: number; max: number; label?: string };
  className?: string;
  /** Makes the whole tile a button (≥ 40px tall, as every tappable thing is). */
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const pct =
    meter && meter.max > 0
      ? Math.max(0, Math.min(100, (meter.value / meter.max) * 100))
      : null;
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick, "aria-label": ariaLabel } : {})}
      className={cn(
        // A cell of the facts well (type and depth, phase 7): no fill of its
        // own, so the well shows through; the strip draws the dividers.
        "relative min-w-0 px-3 xl:px-2.5 py-[7px] flex flex-col justify-center gap-0.5",
        pct !== null && "pb-2.5",
        onClick && "text-left min-h-10 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors",
        className,
      )}
    >
      {/* A stat label: Geist 12/600 in the words' own capitalisation (it was
          10px capitals), the muted ink, 5.3:1 on the well. */}
      <span className="text-[12px] font-semibold text-muted-foreground leading-none">{label}</span>
      <span className="flex items-center gap-2 min-w-0 text-[14px] font-bold leading-tight text-slate-900 dark:text-slate-50">
        {/* `flex`, so the 16px icon is a box of its own height, centred on
            the line, and never makes the line taller than its words. */}
        {icon && <span className="flex shrink-0 text-slate-400 dark:text-slate-500 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
        <span className="min-w-0 flex items-center gap-2 [&>.truncate]:min-w-0">{children}</span>
      </span>
      {sub && <span className="text-[12px] font-medium leading-none text-slate-500 dark:text-slate-400 min-w-0 flex items-center [&>*]:min-w-0 [&>span:not(.inline-flex)]:truncate">{sub}</span>}
      {pct !== null && (
        <span
          className="absolute inset-x-0 bottom-0 h-1 bg-slate-200/80 dark:bg-slate-800 overflow-hidden"
          role="img"
          aria-label={meter!.label ?? `${meter!.value} of ${meter!.max}`}
        >
          <span
            className="block h-full bg-(--eq-hero) transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </span>
      )}
    </Tag>
  );
}

/**
 * A quiet check after a fact that can be confirmed (AJ, Oct 2 2026: "a
 * subtle green check ... a grey check if not verified"), in place of words
 * like "(from Mindbody)". Green once a person has confirmed it on Notes &
 * Profile → Account; grey while it is still the app's guess. What it means
 * is in its label and its title, never only in the colour.
 */
function ConfirmedCheck({ confirmed, what, testId }: { confirmed: boolean; what: string; testId: string }) {
  const words = confirmed ? `Confirmed: ${what}` : `Not confirmed yet: confirm ${what} on Notes & Profile, Account`;
  return (
    <BadgeCheck
      data-testid={testId}
      data-confirmed={confirmed ? "yes" : "no"}
      role="img"
      aria-label={words}
      className={cn(
        "inline-block align-[-2px] ml-1 w-3.5 h-3.5",
        confirmed ? "text-emerald-500 dark:text-emerald-400" : "text-slate-400 dark:text-slate-600",
      )}
    >
      <title>{words}</title>
    </BadgeCheck>
  );
}

/**
 * The sessions box, first in the row so it sits under "Client since ·
 * Contract ends", the dates it goes with (AJ, Oct 2 2026: "they're very
 * related"). It reads like the other three: a small label, the main line,
 * the second line - "93 completed", "93 remaining". A count that is not
 * known is a dash, never 0; late cancels sit beside the count, never in it.
 */
function SessionsTile({
  completedWord,
  completed,
  lateCancels,
  remaining,
  renewal,
}: {
  completedWord: string;
  completed: number | null;
  lateCancels: number | null;
  remaining: number | null;
  renewal?: RenewalTileState;
}) {
  const Tag = renewal ? "button" : "div";
  return (
    <Tag
      {...(renewal
        ? { type: "button" as const, onClick: renewal.onOpen, "aria-label": `Renewal: ${renewal.text}. Open the renewal card.` }
        : {})}
      data-testid="sessions-tile"
      className={cn(
        "relative min-w-0 px-3 xl:px-2.5 py-[7px] flex flex-col justify-center gap-0.5 text-left",
        renewal && "min-h-10 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors",
      )}
    >
      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground leading-none">
        Sessions
        {renewal?.attention && <span className={cn("w-1.5 h-1.5 rounded-full bg-current shrink-0", RENEWAL_TONE[renewal.tone])} aria-hidden="true" />}
      </span>
      <span className="text-[14px] font-bold leading-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
        {/* The headline figure: the display face, upright, 22/800 (type and
            depth, phase 7). Its line-height is 0.8 so the 22px figure sits
            in the 14px line without making the facts taller than they were:
            the profile's top has a height budget (AJ, Oct 2 2026: "the top
            of the profiles just feel so bulky"). The digits are drawn the
            same; only the box the line keeps for them is shorter. */}
        <span className="font-display text-[22px] font-extrabold leading-[0.8] text-(--eq-hero-text) tabular-nums" data-testid="sessions-completed">
          {completed === null ? "\u2014" : completed}
        </span>{" "}
        <span className="font-semibold">{completedWord}</span>
      </span>
      {/* Each part kept whole, and the late cancels take a line of their own
          when the cell is too narrow (the iPad mini in portrait). With no
          fill on the cells any more, one long line would be drawn over the
          next cell's words instead of hidden under its fill. */}
      <span className="flex flex-wrap gap-x-1 gap-y-1 text-[12px] font-medium leading-none text-slate-500 dark:text-slate-400">
        <span className="whitespace-nowrap">
          <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums" data-testid="sessions-remaining">
            {remaining === null ? "\u2014" : remaining}
          </span>{" "}
          remaining
        </span>
        {typeof lateCancels === "number" && lateCancels > 0 && (
          <>
            {" "}
            <span className="whitespace-nowrap" data-testid="late-cancels">{`\u00b7 ${lateCancelCount(lateCancels)}`}</span>
          </>
        )}
      </span>
    </Tag>
  );
}

/* ------------------------------------------------------------------ */

export function ProfileHeader({
  client,
  studioName,
  sessions,
  scheduledSessions,
  completedCount,
  lateCancels = null,
  sessionsQuotable = false,
  coverage = "unknown",
  topTrainer,
  trainers = [],
  pkg,
  sessionsSplit,
  activeInProgressSession,
  isCheckingActiveSession = false,
  onBack,
  onStartSession,
  onQuickNote,
  sessionIsMine = true,
  onContinueSession,
  onWatchSession,
  onDiscardSession,
  kaizen,
  sync,
  renewal,
}: ProfileHeaderProps) {
  const [showTrainers, setShowTrainers] = useState(false);
  const trainerRows = tallyRows(client.trainerTally, trainers);
  /* ---- last session ---- */
  const last = sessions.find((s) => s.status === "Completed") ?? sessions[0];
  const lastMs = last?.date ? parseSessionDate(last.date) : 0;
  // "Sep 17", with the year only when it is not this year (Oct 2 2026).
  const lastLabel = lastMs
    ? new Date(lastMs).toLocaleDateString([], {
        month: "short",
        day: "numeric",
        ...(new Date(lastMs).getFullYear() !== new Date().getFullYear() ? { year: "numeric" as const } : {}),
      })
    : null;

  /* ---- next session ---- */
  const next = scheduledSessions[0];
  const nextDate = next ? toDate(next.startTime) : null;
  const nextTime = nextDate ? formatStudioTime(nextDate, undefined, "") : "";
  /**
   * "Tuesday 12:30 PM". The month was noise — a next session is days away,
   * never months, and "see you Tuesday at half twelve" is the sentence this
   * tile exists to support. Inside two days the weekday gives way to the
   * word a trainer would actually say.
   */
  // The weekday is read on the STUDIO's clock, like the time printed beside
  // it. `getDay()` reads the viewer's, so a late-evening session opened from
  // a browser a few hours off Eastern showed the wrong weekday next to the
  // right time — exactly the hazard lib/studio-time exists to prevent.
  const nextYMD = nextDate ? zonedYMD(nextDate) : null;
  const nextWeekday =
    nextYMD !== null
      ? WEEKDAYS_LONG[new Date(Date.UTC(nextYMD.year, nextYMD.month - 1, nextYMD.day)).getUTCDay()]
      : null;
  const nextDay = nextDate
    ? daysUntil(nextDate) === "today"
      ? "Today"
      : daysUntil(nextDate) === "tomorrow"
        ? "Tomorrow"
        : nextWeekday
    : null;
  const nextLabel = nextSessionHeadline(nextDay, nextTime);

  /* ---- package ---- */
  // Remaining: what is left in her contract when the split knows it (the
  // extras beside it, never in it - AJ, Sep 26 2026), else the package's
  // own count, else unknown.
  const remainingCount: number | null = splitSpeaks(sessionsSplit)
    ? sessionsSplit.hasContract
      ? sessionsSplit.contract
      : null
    : pkg.remaining;
  const since = clientSinceLabel(client, { coverage });
  const renewalSnapshot = renewalOf(client);
  const renewalWords = renewalSnapshot
    ? headerRenewalWords(renewalSnapshot)
    : headerContractWords(client, studioDayKeyOf(new Date()) ?? "");
  // The badge promises medical detail, so it fires on medical detail — not on
  // a general note (client-profile audit: high-visibility alerts).
  const hasFlags = !!(
    (client.clinicalFlags && client.clinicalFlags.length > 0) ||
    client.medicalHistory?.trim() ||
    client.clinicalNotes?.trim()
  );
  const initials = clientInitials(client);
  const displayName = clientDisplayName(client);
  const legalName = clientLegalName(client);
  const nick = goesByNickname(client);

  // One of the three quiet tools, inside the raised group below. Words in the
  // tab voice, 14/600 in ink-2 (they were 12px muted), 12px in the one-band
  // landscape (xl), where the band is tight. Each tool presses in on its own;
  // only colours transition, never the shadow (type and depth, phase 7).
  // px-2.5 rather than 3: the bigger words would otherwise widen the group by
  // 15px and take it from the name and the "Client since" line beside it.
  const toolBtn =
    "inline-flex items-center justify-center gap-1.5 h-10 min-w-10 px-2.5 text-[14px] xl:text-[12px] font-semibold text-ink-d2 hover:text-foreground hover:bg-slate-50 dark:hover:bg-slate-700 active:shadow-(--press) transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <header
      className={cn(
        // cp-head*: hooks for the phone layout only (profile-nav.css, Journey Lite).
        //
        // A CARD (type and depth, phase 7, Oct 4 2026): the edge seen from
        // outside (`--edge` with the fill clipped to the padding box) and the
        // panel's lift, where it was a band with a line under it. Tight on
        // purpose, to a height budget: AJ, Oct 2 2026, "the top of the
        // profiles just feel so bulky". Its padding and margin (28px) are a
        // pixel less than the band's (29px), and the facts strip inside is a
        // little shorter, so the card is no taller than the band was and the
        // Journey grid keeps every machine row in landscape. Its shadow is
        // --panel-lift: the panel's --elev-2 and, in dark, the same top light
        // every codex panel below it has.
        "cp-head bg-card border border-(--edge) bg-clip-padding rounded-xl shadow-(--panel-lift) px-3.5 pt-2 pb-2.5 mb-2 xl:pt-2 xl:pb-2 xl:mb-2",
        // AJ, Oct 2 2026: "the first thing that should grab the eye is the
        // name of the client ... the top of the profiles just feel so bulky".
        // Track, Note, Sync and Start Session used to share the name's row,
        // so on a portrait iPad (744-1024px) the name was left ~150px and
        // broke one word a line, with the studio line under it in five.
        //
        // Portrait: the name has the row with Start Session alone; the
        // studio line sits under it, and the three quiet tools sit under
        // Start, beside it — two short rows, the name on one line.
        //   ‹ (SA)  Sharon Ann Tesar                  [▶ START SESSION]
        //           ▪▪▪ Strongsville Ohio · Client…   [Track][Note][⟳]
        //   [ the four facts ]
        // Landscape (xl): one band — identity, facts, tools, Start — which
        // hands the Journey grid ~90px more height, the difference between
        // 19 and 21 machines on screen.
        // The phone (under 600px) lays these same areas out in
        // profile-nav.css (cp-head, Journey Lite).
        "grid gap-x-3 xl:gap-x-4 gap-y-1 items-center",
        "grid-cols-[auto_auto_minmax(0,1fr)_auto]",
        "[grid-template-areas:'back_avatar_name_start'_'back_avatar_meta_tools'_'strip_strip_strip_strip']",
        "xl:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto]",
        "xl:[grid-template-areas:'back_avatar_name_strip_tools_start'_'back_avatar_meta_strip_tools_start']",
      )}
    >
      {/* ---------- identity ---------- */}
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to clients"
        className="[grid-area:back] -ml-2 shrink-0 h-10 w-10 rounded-full grid place-items-center text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-500 dark:hover:text-white dark:hover:bg-slate-800 transition-colors"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>

      {/* The avatar sits IN the card as a well (sunk, never a raised disc),
          its initials in the display face, upright (type and depth, phase 7;
          the kit's identity block). A photo covers the well. */}
      <Avatar size="xl" className="[grid-area:avatar] bg-(--well) shrink-0 size-14 xl:size-12 2xl:size-14">
        {client.photoUrl && <AvatarImage src={client.photoUrl} alt={displayName} />}
        <AvatarFallback className="bg-(--well) shadow-(--elev-0) text-ink-d2 font-display font-extrabold not-italic text-[22px] tracking-[0.02em]">
          {initials || <User className="w-7 h-7" />}
        </AvatarFallback>
      </Avatar>

      <h1
        // Names are never truncated (CLAUDE.md): a long one wraps, at a space,
        // and a single word too long for the line breaks rather than spills.
        // The client's name is a title (AJ's answer 1A, Oct 4 2026): the
        // display face, upright, 30/800, in the name's own capitalisation.
        // Saira Condensed is narrower than Geist 900 ("Sruthi Ramakrishnan"
        // is 228px against 321px at 30), so a name wraps less than it did.
        className="cp-head__name [grid-area:name] self-end min-w-0 xl:max-w-[240px] 2xl:max-w-[320px] font-display font-extrabold not-italic normal-case text-[30px] leading-[1.04] text-foreground [overflow-wrap:anywhere]"
        title={nick ? `${displayName} (legal name ${legalName})` : displayName}
      >
        {displayName}
      </h1>

      <div className="cp-head__meta [grid-area:meta] self-start min-w-0 xl:max-w-[240px] 2xl:max-w-[320px] flex flex-col gap-0.5">
        {/* Line 1: the studio. Line 2: since and the renewal (AJ, Oct 2
            2026: "the client's name, the studio, and then we'll read client
            since ... right after that, a renews on"). Both wrap, never an
            ellipsis: the studio is a name too ("Demo Mode"). */}
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <BrandTiles size={6} gap={2} />
          <span className="min-w-0 flex-1 text-[12px] font-semibold leading-snug text-muted-foreground [overflow-wrap:break-word]">
            {studioName}
            {(client.experienceLevel || client.trainingPedigree) && (
              <span className="xl:hidden 2xl:inline"> · {client.experienceLevel || client.trainingPedigree}</span>
            )}
          </span>
          {hasFlags && (
            // A chip: Geist 12/700 in its own capitalisation (it was 10px
            // capitals), on one line of its own height so the studio line
            // is no taller with it than without. Amber 700 on amber 50 is
            // 4.8:1 (amber 600 was 3.1:1, too faint for words).
            <span className="hidden sm:inline-flex xl:hidden 2xl:inline-flex items-center gap-1.5 rounded px-2 py-0.5 border border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 shrink-0">
              <AlertTriangle className="w-3 h-3" />
              <span className="text-[12px] font-bold leading-none">Clinical notes</span>
            </span>
          )}
        </div>
        {(since || renewalWords) && (
          // Two facts side by side, each kept whole; when the line is too
          // narrow the second starts its own line, with no dot left dangling.
          <span className="flex flex-wrap gap-x-3 min-w-0 text-[12px] font-medium leading-snug text-muted-foreground" data-testid="since-line">
            {since && (
              <span className="whitespace-nowrap">
                {since.label} {since.month}
                <ConfirmedCheck confirmed={since.confirmed} what="the first day" testId="since-check" />
              </span>
            )}
            {renewalWords && (
              <span className="whitespace-nowrap" data-testid="renewal-line">
                {renewalWords}
              </span>
            )}
          </span>
        )}
      </div>

      {/* ---------- the quiet tools: one small group under Start ----------
          One RAISED control on the 3:1 edge (AJ's answer 2A, Oct 4 2026): a
          fill a hair lighter than the card, the contact lift and a top
          light, on --input, which a control keeps (the old slate-200 edge
          was decorative, 1.2:1). The tools are split by soft dividers. */}
      <div className="cp-head__tools [grid-area:tools] justify-self-end self-start xl:self-center flex items-stretch rounded-[12px] border border-input bg-(--raised) shadow-(--raised-lift) overflow-hidden divide-x divide-(--divider)">
        {onQuickNote && (
          <button type="button" onClick={onQuickNote} title="Add a note — it goes to their Notes" aria-label="Add a note" className={toolBtn}>
            <NotebookPen className="w-4 h-4" aria-hidden />
            <span className="hidden sm:inline">Note</span>
          </button>
        )}
        {/*
          Kaizen Roster toggle. Deliberately quiet and deliberately BLUE: the
          red kaizen mark means "this rep needs work" in the session grid, and
          if the two ever share a colour a glance can no longer tell "I am
          tracking you" from "you are doing it wrong".
        */}
        {kaizen && (
          <button
            type="button"
            onClick={kaizen.onToggle}
            disabled={kaizen.busy}
            aria-pressed={kaizen.isOn}
            title={kaizen.isOn ? "On your Kaizen Roster — tap to remove" : "Add to your Kaizen Roster"}
            className={cn(toolBtn, kaizen.isOn && "text-(--eq-live-text) bg-(--eq-live-fill) hover:text-(--eq-live-text) hover:bg-(--eq-live-fill) dark:hover:bg-(--eq-live-fill)")}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="2,10 6,6 10,10" opacity={0.55} />
              <polyline points="6,13 10,9 14,13" />
            </svg>
            <span className="hidden sm:inline">{kaizen.isOn ? "Tracking" : "Track"}</span>
          </button>
        )}
        {sync && (
          <button
            type="button"
            onClick={sync.onSync}
            disabled={sync.busy || !sync.available}
            title={
              sync.available
                ? `Master Sync — refresh everything Mindbody knows about this client. ${sync.label}.`
                : "No Mindbody ID on this client, so there is nothing to sync from."
            }
            aria-label={sync.busy ? "Syncing with Mindbody" : `Sync with Mindbody. ${sync.label}`}
            className={toolBtn}
          >
            <RefreshCw className={cn("w-4 h-4", sync.busy && "animate-spin")} aria-hidden />
            <span className="hidden sm:inline">{sync.busy ? "Syncing" : "Sync"}</span>
            <span className="sr-only">{sync.label}</span>
          </button>
        )}
      </div>

      {/* ---------- the action. Hero orange appears nowhere else in the header. ---------- */}
      <div className="cp-head__cta [grid-area:start] justify-self-end flex items-center">
        {activeInProgressSession ? (
          <DropdownMenu>
            {/* Go's other state, so Go's words: the display face's slanted
                capitals at 800 and 17 (14 on a phone), 0.04em (type and
                depth, phase 7), and Go's depth (phase 8): the short glow and
                white top light of --go-lift instead of a 30px amber blur, a
                press down a pixel into an inset shadow, and the fill
                restated on hover (an iPad keeps hover after a tap). Only the
                fill and the move transition, never the shadow. */}
            <DropdownMenuTrigger className="inline-flex items-center gap-2 h-12 px-4 sm:px-5 rounded-2xl bg-amber-500 hover:bg-amber-500 text-white font-display italic uppercase font-extrabold tracking-[0.04em] text-[14px] sm:text-[17px] shadow-(--go-lift) active:translate-y-px active:shadow-(--press) transition-[background-color,transform]">
              <Clock className="w-4 h-4 animate-pulse" />
              <span className="hidden sm:inline">In progress</span>
              <span className="text-white/80 text-xs not-italic font-sans font-bold">({activeInProgressSession.trainerInitials})</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2 bg-card border-slate-200 dark:border-slate-800">
              {/* The menu's words in their own capitalisation (AJ's answer
                  1A): the head a 12/700 label, the line under it 12/600,
                  each item 14/700 (they were 11px and 12px capitals). The
                  head is amber 700 now: amber 500 at 11px was 2.2:1. */}
              <div className="px-3 py-2 mb-2 border-b border-slate-200 dark:border-slate-800">
                <p className="text-[12px] font-bold text-amber-700 dark:text-amber-400">Active session detected</p>
                <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200 mt-1" data-testid="session-started-line">
                  {sessionStartedLine(activeInProgressSession, trainers)}
                </p>
              </div>
              {sessionIsMine ? (
                <DropdownMenuItem onClick={onContinueSession} className="rounded-xl hover:bg-amber-50 dark:hover:bg-amber-500/20 cursor-pointer flex items-center gap-2 p-3 text-amber-700 dark:text-amber-500">
                  <Play className="w-4 h-4" />
                  <span className="font-bold text-[14px]">Continue session</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onWatchSession} className="rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-2 p-3 text-slate-700 dark:text-slate-300">
                  <Eye className="w-4 h-4" />
                  <span className="font-bold text-[14px]">Watch session</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onDiscardSession} className="rounded-xl hover:bg-red-50 dark:hover:bg-red-500/20 cursor-pointer flex items-center gap-2 p-3 text-red-600 dark:text-red-500">
                <Trash2 className="w-4 h-4" />
                <span className="font-bold text-[14px]">Discard session</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            type="button"
            onClick={onStartSession}
            disabled={isCheckingActiveSession}
            className={cn(
              // Start, as on the Hub (the Navy Frame, Oct 4 2026): the logo
              // orange with navy words, the fill restated on hover (an iPad
              // keeps hover after a tap). White on the old gradient was 2.99
              // to 3.55:1.
              //
              // Go (type and depth, phase 7, Oct 4 2026): a short orange glow
              // and a white top light (--go-lift: --glow-go and --go-light),
              // and a press that moves it down a pixel into an inset shadow.
              // Only the fill, the move and the fade transition, never the
              // shadow; the hover keeps the same lift.
              "cp-head__start group relative shrink-0 inline-flex items-center gap-3 h-12 xl:h-[52px] pl-1.5 pr-3 sm:pr-5 rounded-2xl text-(--eq-go-on)",
              "bg-(--eq-go) hover:bg-(--eq-go) shadow-(--go-lift)",
              "active:translate-y-px active:shadow-(--press) transition-[background-color,transform,opacity] disabled:opacity-60 disabled:cursor-wait",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-card focus-visible:ring-(--eq-focus-ring)",
            )}
          >
            <span className="grid place-items-center w-9 h-9 xl:w-10 xl:h-10 rounded-xl bg-white/20 group-hover:bg-white/25 transition-colors">
              <Play className="w-4 h-4 xl:w-[18px] xl:h-[18px] fill-current translate-x-px" />
            </span>
            <span className="cp-head__startlabel hidden sm:flex flex-col items-start leading-none">
              {/* Go's words, and Start session is Go (AJ's answer 1A): the
                  display face's slanted capitals at 800 and 17, 0.04em. It
                  asked for no weight before and drew 700. */}
              <span className="font-display italic uppercase font-extrabold tracking-[0.04em] text-[17px]">
                {isCheckingActiveSession ? "Checking…" : "Start session"}
              </span>
              {!isCheckingActiveSession && nextDate && daysUntil(nextDate) === "today" && (
                <span className="text-[12px] font-semibold text-(--eq-go-on) mt-1">Booked today{nextTime ? ` · ${nextTime}` : ""}</span>
              )}
            </span>
          </button>
        )}
      </div>

      {/* ---------- the four facts: ONE well ----------
          Type and depth, phase 7: the facts are information, so they sink
          into one well (--well and its inset shadow; never bg-muted, which
          goes lighter than the card in dark) with no outer border, where
          they were four boxes in an outlined strip. The cells have no fill;
          a soft divider (an inset line, which takes no room) parts them: on
          the left of every cell after the first, and on a phone, where the
          four sit two by two, on top of the second row as well. */}
      <div className="cp-head__strip [grid-area:strip] mt-2 xl:mt-0 min-w-0 grid grid-cols-2 sm:grid-cols-4 rounded-[12px] overflow-hidden bg-(--well) shadow-(--elev-0) [&>*+*]:shadow-[inset_1px_0_0_var(--divider)] max-sm:[&>:nth-child(3)]:shadow-[inset_0_1px_0_var(--divider)] max-sm:[&>:nth-child(4)]:shadow-[inset_1px_0_0_var(--divider),inset_0_1px_0_var(--divider)]">
        {/* Read left to right (AJ, Oct 2 2026): her sessions, under the
            dates they go with, then the last visit, the next one, and who
            trains her most. */}
        <SessionsTile
          completedWord={sessionsQuotable ? "completed" : "in Journey"}
          completed={completedCount}
          lateCancels={lateCancels}
          remaining={remainingCount}
          renewal={renewal}
        />

        <Stat label="Last session" icon={<History />} sub={lastMs ? relativeDays(lastMs) ?? undefined : undefined}>
          {lastLabel ?? <span className="text-muted-foreground font-medium">No sessions yet</span>}
        </Stat>

        {/* "Tomorrow 4:00 PM" read "Tomorro…" on a portrait iPad: the tile is
            ~180px, and the icon and the "2 booked" chip shared its one line.
            Now the headline has the line to itself and may wrap at the dot,
            the chip sits under it with the date, and there is no icon (the
            label already says what it is). */}
        <Stat
          label="Next session"
          sub={
            nextDate ? (
              <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground whitespace-nowrap">
                  {daysUntil(nextDate) && nextDay !== "Today" && nextDay !== "Tomorrow"
                    ? daysUntil(nextDate)
                    : `${MONTHS[nextDate.getMonth()]} ${nextDate.getDate()}`}
                </span>
                <span className="shrink-0 text-[12px] font-bold leading-none px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                  {bookedLabel(scheduledSessions.length)}
                </span>
              </span>
            ) : undefined
          }
        >
          {nextLabel ? (
            <span className="whitespace-normal break-words">{nextLabel}</span>
          ) : (
            <span className="text-muted-foreground font-medium italic">Not scheduled</span>
          )}
        </Stat>


        {/* Tap for everyone who has trained this client and how often
            (tracker round, Sep 2026 — "a feature we tried to get working"). */}
        <Stat
          label="Top trainer"
          icon={<UserCheck />}
          onClick={trainerRows.length > 0 ? () => setShowTrainers((v) => !v) : undefined}
          ariaLabel={trainerRows.length > 0 ? "Show every trainer who has trained this client" : undefined}
          sub={
            topTrainer.top
              ? topTrainer.source === "tally"
                ? // Their own count only; the tap lists everyone (AJ, Oct 2 2026).
                  `${topTrainer.top.sessions} session${topTrainer.top.sessions === 1 ? "" : "s"}`
                : topTrainer.backfilling
                  ? "Counting full history…"
                  : "From recent sessions"
              : undefined
          }
        >
          {topTrainer.top?.name ? <span className="break-words">{topTrainer.top.name}</span> : <span className="text-muted-foreground font-medium">Not yet</span>}
        </Stat>
      </div>

      {/* Its own row under the tiles. It used to sit in `[grid-area:strip]`
          - the same named area as the tile row - so the grid drew the two on
          top of each other and the list covered the tiles. `col-span-full`
          with no named area lands it in a fresh implicit row, in normal
          flow, pushing everything below it down. */}
      {showTrainers && trainerRows.length > 0 && (
        // Information inside the card, so a well like the facts above it; a
        // label over the list (14/700 in ink-2, it was 10px capitals) and a
        // Close that is a 40px target (it was 32).
        <div className="col-span-full mt-2 rounded-[12px] bg-(--well) shadow-(--elev-0) px-3 py-2" role="region" aria-label="Trainers who have trained this client">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[14px] font-bold text-ink-d2">Trained by</span>
            <button type="button" className="text-[14px] font-bold text-muted-foreground hover:text-foreground min-h-10 px-3 -mr-2" onClick={() => setShowTrainers(false)}>
              Close
            </button>
          </div>
          <ul className="divide-y divide-(--divider)">
            {trainerRows.map((t) => (
              <li key={t.key} className="flex items-center gap-3 py-1.5">
                <span className="flex-1 min-w-0 break-words text-[14px] font-semibold text-slate-800 dark:text-slate-100">{t.name}</span>
                <span className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <span className="block h-full bg-(--eq-hero)" style={{ width: `${Math.round(t.share * 100)}%` }} />
                </span>
                <span className="shrink-0 whitespace-nowrap text-right text-[12px] tabular-nums text-slate-600 dark:text-slate-300">
                  {t.sessions} session{t.sessions === 1 ? "" : "s"} · {Math.round(t.share * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}

/**
 * "Started by JC at 9:04 AM", with "· AJ took it over" once the session has
 * changed hands (session record, Sep 26 2026). The time is the studio's, and
 * any part that cannot be known is left out.
 */
function sessionStartedLine(session: ActiveSessionLike, trainers: readonly Trainer[]): string {
  const { starter, runner, changedHands } = whoStartedIt(session, trainers);
  const at = toDate((session.startTime as never) ?? null) ?? toDate(session.clientStartTime ?? null);
  const time = at ? formatStudioTime(at, undefined, "") : "";
  const started = `Started${starter ? ` by ${starter}` : ""}${time ? ` at ${time}` : ""}`;
  return changedHands && runner ? `${started} · ${runner} took it over` : started;
}
