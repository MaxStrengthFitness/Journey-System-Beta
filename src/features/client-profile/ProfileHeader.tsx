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
import { BadgeCheck, ChevronDown, ChevronLeft, Clock, Eye, NotebookPen, Play, RefreshCw, Trash2, AlertTriangle, User } from "lucide-react";
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

/**
 * One of the three facts on the header's quiet line: a small capital label,
 * then the value at 13px. One font, two sizes (AJ, Oct 2 2026: "a lot of
 * different fonts, a lot of different sizes of text"). A fact with a tap is
 * a 40px button.
 */
function Fact({
  label,
  children,
  onClick,
  ariaLabel,
  expanded,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  expanded?: boolean;
}) {
  const body = (
    <>
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 text-[13px] font-semibold text-slate-900 dark:text-slate-50">{children}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 min-h-10 -mx-1.5 px-1.5 rounded-lg text-left hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
      >
        {body}
      </button>
    );
  }
  return <span className="inline-flex items-center gap-1.5 min-h-10">{body}</span>;
}

/**
 * The membership card: each date beside the number it goes with (AJ, Oct 2
 * 2026: "how long has this client been a client since? how many sessions
 * do they have done? their contract ends when? how many do they have
 * left?"). Since beside completed, the contract's end beside remaining. A
 * count that is not known is a dash, never 0; late cancels sit beside the
 * count, never inside it.
 */
function MembershipCard({
  since,
  ends,
  completed,
  completedWord,
  lateCancels,
  remaining,
  renewal,
}: {
  since: ReactNode;
  ends: ReactNode;
  completed: number | null;
  completedWord: string;
  lateCancels: number | null;
  remaining: number | null;
  renewal?: RenewalTileState;
}) {
  const date = "min-w-0 text-[13px] font-medium text-muted-foreground [overflow-wrap:break-word]";
  const count = "text-right whitespace-nowrap text-[13px] font-medium text-muted-foreground";
  const num = "text-[17px] font-bold tabular-nums mr-1.5";
  const Tag = renewal ? "button" : "div";
  return (
    <Tag
      {...(renewal
        ? { type: "button" as const, onClick: renewal.onOpen, "aria-label": `Renewal: ${renewal.text}. Open the renewal card.` }
        : {})}
      data-testid="membership"
      className={cn(
        "cp-head__card [grid-area:card] mt-2 xl:mt-0 min-w-0 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 px-3.5 py-2 text-left",
        renewal && "min-h-10 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors",
      )}
    >
      <span className={date}>{since}</span>
      <span className={count}>
        <span className={cn(num, "text-[#F06C22]")} data-testid="sessions-completed">
          {completed === null ? "—" : completed}
        </span>
        {completedWord}
        {typeof lateCancels === "number" && lateCancels > 0 && (
          <span className="ml-1.5 text-[12px]" data-testid="late-cancels">
            {`· ${lateCancelCount(lateCancels)}`}
          </span>
        )}
      </span>
      <span className={date}>{ends}</span>
      <span className={count}>
        <span className={cn(num, "text-slate-900 dark:text-slate-50")} data-testid="sessions-remaining">
          {remaining === null ? "—" : remaining}
        </span>
        remaining
        {renewal?.attention && <span className={cn("inline-block ml-1.5 w-1.5 h-1.5 rounded-full bg-current align-middle", RENEWAL_TONE[renewal.tone])} aria-hidden="true" />}
      </span>
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
  // "Sep 17", with the year only when it is not this year: the facts line
  // holds three facts on one line (Oct 2 2026).
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

  const completedWord = sessionsQuotable ? "completed" : "in Journey";
  const toolBtn =
    "inline-flex items-center justify-center gap-1.5 h-10 min-w-10 px-3 text-[12px] font-semibold text-muted-foreground hover:text-foreground hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <header
      className={cn(
        // cp-head*: hooks for the phone layout (profile-nav.css, Journey Lite).
        "cp-head bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800/60 pb-3 mb-3 pt-1",
        /*
         * The membership card (AJ, Oct 2 2026). "When I first look at this, I
         * want to know the client I have, their main studio, their client
         * since and their contract end" - and the sessions sit beside the
         * dates they go with: since beside completed, the contract's end
         * beside remaining ("they're very related"). One font in two sizes;
         * the three facts on one quiet line; Note, Track and Sync one small
         * group under Start Session.
         *
         *   < (SA)  Sharon Ann Tesar                    [> START SESSION]
         *           Strongsville Ohio                   [Note | Track | Sync]
         *   [ Client since Feb 2026 (check)          93 completed ]
         *   [ Contract ends Aug 16, 2027             93 remaining ]
         *   LAST Sep 17 - 2 wk ago   NEXT Mon 11:00 AM - 7 booked   TOP TRAINER ...
         *
         * Landscape (xl) puts the card between the name and the buttons.
         */
        "grid gap-x-3 xl:gap-x-4 gap-y-1 items-center",
        "grid-cols-[auto_auto_minmax(0,1fr)_auto]",
        "[grid-template-areas:'back_avatar_name_start'_'back_avatar_meta_tools'_'card_card_card_card'_'facts_facts_facts_facts']",
        "xl:grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]",
        "xl:[grid-template-areas:'back_avatar_name_card_start'_'back_avatar_meta_card_tools'_'facts_facts_facts_facts_facts']",
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

      <Avatar size="xl" className="[grid-area:avatar] ring-2 ring-slate-200 dark:ring-slate-800 bg-slate-100 dark:bg-slate-800 shrink-0 size-14 xl:size-12 2xl:size-14">
        {client.photoUrl && <AvatarImage src={client.photoUrl} alt={displayName} />}
        <AvatarFallback className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-lg">
          {initials || <User className="w-7 h-7" />}
        </AvatarFallback>
      </Avatar>

      <h1
        // Names are never truncated (CLAUDE.md): a long one wraps, at a space.
        className="cp-head__name [grid-area:name] self-end min-w-0 xl:max-w-[260px] 2xl:max-w-[340px] text-[26px] md:text-[30px] xl:text-[28px] font-black tracking-tight leading-[1.05] text-foreground [overflow-wrap:break-word]"
        title={nick ? `${displayName} (legal name ${legalName})` : displayName}
      >
        {displayName}
      </h1>

      {/* The studio. Wraps, never an ellipsis: the studio is a name too. */}
      <div className="cp-head__meta [grid-area:meta] self-start min-w-0 xl:max-w-[260px] 2xl:max-w-[340px] flex items-center gap-2 flex-wrap">
        <BrandTiles size={6} gap={2} />
        <span className="min-w-0 text-[13px] font-medium leading-snug text-muted-foreground [overflow-wrap:break-word]">
          {studioName}
          {(client.experienceLevel || client.trainingPedigree) && (
            <span className="xl:hidden 2xl:inline"> · {client.experienceLevel || client.trainingPedigree}</span>
          )}
        </span>
        {hasFlags && (
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded px-2 py-0.5 border border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="w-3 h-3" />
            <span className="text-[11px] font-semibold">Clinical notes</span>
          </span>
        )}
      </div>

      {/* ---------- the membership card: each date beside its number ---------- */}
      <MembershipCard
        since={
          since ? (
            <span data-testid="since-line">
              {since.label} {since.month}
              <ConfirmedCheck confirmed={since.confirmed} what="her first day" testId="since-check" />
            </span>
          ) : null
        }
        ends={renewalWords ? <span data-testid="renewal-line">{renewalWords}</span> : null}
        completed={completedCount}
        completedWord={completedWord}
        lateCancels={lateCancels}
        remaining={remainingCount}
        renewal={renewal}
      />

      {/* ---------- the quiet tools: one small group under Start ---------- */}
      <div className="cp-head__tools [grid-area:tools] justify-self-end self-start xl:self-center flex items-stretch rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-x divide-slate-200 dark:divide-slate-800">
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
            className={cn(toolBtn, kaizen.isOn && "text-[#034a84] dark:text-[#7cc0ee] bg-[#0a548b]/10 dark:bg-[#4a9fd8]/15")}
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
            <DropdownMenuTrigger className="inline-flex items-center gap-2 h-12 px-4 sm:px-5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-display italic uppercase tracking-wider text-sm sm:text-base shadow-[0_10px_30px_-12px_rgba(245,158,11,.8)] transition-colors">
              <Clock className="w-4 h-4 animate-pulse" />
              <span className="hidden sm:inline">In progress</span>
              <span className="text-white/80 text-xs not-italic font-sans font-bold">({activeInProgressSession.trainerInitials})</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 rounded-2xl p-2 bg-card border-slate-200 dark:border-slate-800">
              <div className="px-3 py-2 mb-2 border-b border-slate-200 dark:border-slate-800">
                <p className="text-[11px] font-medium uppercase text-amber-500 tracking-widest">Active session detected</p>
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 mt-1" data-testid="session-started-line">
                  {sessionStartedLine(activeInProgressSession, trainers)}
                </p>
              </div>
              {sessionIsMine ? (
                <DropdownMenuItem onClick={onContinueSession} className="rounded-xl hover:bg-amber-50 dark:hover:bg-amber-500/20 cursor-pointer flex items-center gap-2 p-3 text-amber-700 dark:text-amber-500">
                  <Play className="w-4 h-4" />
                  <span className="font-bold uppercase text-xs">Continue session</span>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={onWatchSession} className="rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer flex items-center gap-2 p-3 text-slate-700 dark:text-slate-300">
                  <Eye className="w-4 h-4" />
                  <span className="font-bold uppercase text-xs">Watch session</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={onDiscardSession} className="rounded-xl hover:bg-red-50 dark:hover:bg-red-500/20 cursor-pointer flex items-center gap-2 p-3 text-red-600 dark:text-red-500">
                <Trash2 className="w-4 h-4" />
                <span className="font-bold uppercase text-xs">Discard session</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <button
            type="button"
            onClick={onStartSession}
            disabled={isCheckingActiveSession}
            className={cn(
              "cp-head__start group relative shrink-0 inline-flex items-center gap-3 h-12 pl-1.5 pr-3 sm:pr-5 rounded-2xl text-white",
              "bg-[linear-gradient(135deg,#ef5302_0%,#f36d21_100%)] ring-1 ring-white/25 ring-inset",
              "shadow-[0_14px_34px_-14px_rgba(239,83,2,.85)] hover:shadow-[0_18px_40px_-14px_rgba(239,83,2,.95)] hover:brightness-[1.04]",
              "active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-wait",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0a548b]",
            )}
          >
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-white/20 group-hover:bg-white/25 transition-colors">
              <Play className="w-4 h-4 fill-current translate-x-px" />
            </span>
            <span className="cp-head__startlabel hidden sm:flex flex-col items-start leading-none">
              <span className="font-display italic uppercase tracking-wider text-base">
                {isCheckingActiveSession ? "Checking…" : "Start session"}
              </span>
              {!isCheckingActiveSession && nextDate && daysUntil(nextDate) === "today" && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/85 mt-1">Booked today{nextTime ? ` · ${nextTime}` : ""}</span>
              )}
            </span>
          </button>
        )}
      </div>

      {/* ---------- the three facts, one quiet line ---------- */}
      <div className="cp-head__facts [grid-area:facts] mt-1 min-w-0 flex flex-wrap items-center gap-x-4">
        <Fact label="Last">
          {lastLabel ? (
            <>
              {lastLabel}
              {lastMs ? <span className="text-muted-foreground font-normal"> · {relativeDays(lastMs)}</span> : null}
            </>
          ) : (
            <span className="text-muted-foreground font-normal">No sessions yet</span>
          )}
        </Fact>
        <Fact label="Next">
          {nextLabel ? (
            <>
              <span className="break-words">{nextLabel}</span>
              <span className="text-muted-foreground font-normal"> · {bookedLabel(scheduledSessions.length)}</span>
            </>
          ) : (
            <span className="text-muted-foreground font-normal">Not scheduled</span>
          )}
        </Fact>
        {/* Tap for everyone who has trained this client and how often. */}
        <Fact
          label="Top trainer"
          onClick={trainerRows.length > 0 ? () => setShowTrainers((v) => !v) : undefined}
          ariaLabel={trainerRows.length > 0 ? "Show every trainer who has trained this client" : undefined}
          expanded={trainerRows.length > 0 ? showTrainers : undefined}
        >
          {topTrainer.top?.name ? (
            <>
              <span className="break-words">{topTrainer.top.name}</span>
              <span className="text-muted-foreground font-normal">
                {" · "}
                {topTrainer.source === "tally"
                  ? // Their own count only; the tap lists everyone (AJ, Oct 2 2026).
                    `${topTrainer.top.sessions} session${topTrainer.top.sessions === 1 ? "" : "s"}`
                  : topTrainer.backfilling
                    ? "counting…"
                    : "recent sessions"}
              </span>
              {trainerRows.length > 0 && (
                <ChevronDown className={cn("inline w-3.5 h-3.5 ml-1 text-muted-foreground transition-transform", showTrainers && "rotate-180")} aria-hidden />
              )}
            </>
          ) : (
            <span className="text-muted-foreground font-normal">Not yet</span>
          )}
        </Fact>
      </div>

      {/* Its own row under the facts: `col-span-full` with no named area
          lands it in a fresh implicit row, pushing everything below down. */}
      {showTrainers && trainerRows.length > 0 && (
        <div className="col-span-full mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2" role="region" aria-label="Trainers who have trained this client">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Trained by</span>
            <button type="button" className="text-[12px] font-semibold text-muted-foreground min-h-10 px-2" onClick={() => setShowTrainers(false)}>
              Close
            </button>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {trainerRows.map((t) => (
              <li key={t.key} className="flex items-center gap-3 py-1.5">
                <span className="flex-1 min-w-0 break-words text-[13px] font-semibold text-slate-800 dark:text-slate-100">{t.name}</span>
                <span className="w-24 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                  <span className="block h-full bg-[#F06C22]" style={{ width: `${Math.round(t.share * 100)}%` }} />
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
