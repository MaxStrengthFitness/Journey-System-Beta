/**
 * The floating lane: ad-hoc asks and low-priority studio comms.
 *
 * Round: Settings tiers & Task Board, Sep 2026. Expiry + reactions Sep 6.
 *
 * SITS ABOVE THE CHECKLIST, NOT MIXED INTO IT
 * -------------------------------------------
 * A shift-cover ask is time-sensitive in a way that "take out the trash" is
 * not. Interleaving the two by timestamp would bury "can anyone take my 5pm?"
 * under three opening duties, which is exactly how it gets missed and how
 * people go back to texting each other instead.
 *
 * COLLAPSED BY DEFAULT ONCE EVERYTHING IS ANSWERED
 * ------------------------------------------------
 * The lane earns its place at the top only while something needs a person. An
 * empty lane renders as a single line with the composer, so the checklist -
 * which is what most trainers open this screen for - is still the first thing
 * under the thumb.
 *
 * WHY A SHELF LIFE AND ONE-TAP REPLIES (Sep 6)
 * --------------------------------------------
 * Both exist to stop the lane rotting, which is the failure mode of every
 * board like it. Requests that stopped mattering hours ago keep occupying the
 * top of the screen until the lane becomes something people scroll past - and
 * once it is scrolled past, the cover request that DID matter is missed and
 * everyone goes back to the group text. An expiry lets a request retire
 * itself; a preset reaction makes acknowledging one cost a single tap instead
 * of open-thread-type-send, which is the other half of the same problem.
 */

import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Clock,
  HandHelping,
  HelpCircle,
  Megaphone,
  MessageSquare,
  Repeat,
  Send,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import {
  addRequestReply,
  createRequest,
  EXPIRY_LABEL,
  expiryMillis,
  reactionSummary,
  REQUEST_KIND_HINT,
  REQUEST_KIND_LABEL,
  REQUEST_REACTIONS,
  resolveRequest,
  setRequestClaim,
  toggleRequestReaction,
  type ExpiryChoice,
  type RequestKind,
  type TaskRequest,
} from "./requests";
import { useRequestReplies, useStudioRequests } from "./useStudioRequests";
import { buildBoard, type BoardTopic } from "./board";
import { studioDateKey } from "../../lib/studio-time";
import { ResolveDialog } from "./ResolveDialog";
import { resolveAndMaybeKeep, outcomeMessage } from "./resolve-flow";
import { notify } from "../notifications";
import type { TaskAuthor } from "./mutations";
import type { Client } from "../../types";
import { InitiativeRollup } from "./InitiativeRollup";
import { SubmitInitiativeDialog } from "./SubmitInitiativeDialog";
import { saveSubmission, fetchSubmissions } from "./playbook-mutations";
import type { SubmissionEntry } from "./initiatives";

const KIND_ICON: Record<RequestKind, typeof MessageSquare> = {
  cover: Repeat,
  question: HelpCircle,
  "heads-up": Megaphone,
  help: HandHelping,
  initiative: Target,
  other: MessageSquare,
};

/*
 * "initiative" is deliberately NOT in the composer's kind picker.
 * A trainer posting "everyone do five assessments" is not a thing that should
 * be one tap away on the floor, and an initiative needs a target that this
 * quick composer has no room to ask for. Managers post them from Manage.
 */
const KINDS: RequestKind[] = ["cover", "question", "heads-up", "help", "other"];
const EXPIRIES: ExpiryChoice[] = ["none", "today", "3d", "1w"];

function ago(v: unknown): string {
  const ms = (v as { toMillis?: () => number } | undefined)?.toMillis?.();
  if (!ms) return "just now";
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * How long this has left, phrased as a deadline rather than a timestamp.
 *
 * "3h left" answers the question someone actually has standing in front of
 * the board; "expires 17:00" makes them do the subtraction, and they will not.
 */
function timeLeft(v: unknown): string | null {
  const ms = expiryMillis(v);
  if (!ms) return null;
  const mins = Math.round((ms - Date.now()) / 60000);
  if (mins <= 0) return "expired";
  if (mins < 60) return `${mins}m left`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h left`;
  return `${Math.round(hrs / 24)}d left`;
}

export interface RequestsLaneProps {
  studioId: string | null;
  author: TaskAuthor | null;
  /** Auth uid, for "is this mine". */
  currentUserId?: string | null;
  /**
   * Topic chip from the hub. Ordering and filtering come from board.ts so the
   * hub's chips and this lane cannot disagree about what "Clients" means.
   */
  topic?: BoardTopic;
  /** Narrow to what I wrote or claimed. */
  mineOnly?: boolean;
  /**
   * The studio's trainers, for the initiative roll-up's denominator. Absent
   * means initiative cards render without one rather than with a wrong one.
   */
  roster?: { id: string; name: string }[];
  /** For the initiative submit picker. */
  clients?: Client[];
}

export function RequestsLane({
  studioId,
  author,
  currentUserId,
  topic = "all",
  mineOnly,
  roster,
  clients,
}: RequestsLaneProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const { open: rawRequests } = useStudioRequests(studioId);

  /*
   * The lane used to render whatever order the snapshot arrived in. buildBoard
   * ranks by HEAT -- cover first, then anything expiring, then unclaimed
   * before claimed -- so the card that needs a person is the card at the top.
   * Filtering lives here too, so the hub's chips drive one implementation.
   */
  const todayKey = studioDateKey(new Date()) ?? "";
  const cards = useMemo(
    () =>
      buildBoard(rawRequests, {
        todayKey,
        trainerId: currentUserId ?? author?.id ?? null,
        topic,
        mineOnly,
      }),
    [rawRequests, todayKey, currentUserId, author?.id, topic, mineOnly],
  );
  const openRequests = useMemo(() => cards.map((c) => c.request), [cards]);

  const [composing, setComposing] = useState(false);
  const [kind, setKind] = useState<RequestKind>("cover");
  const [expiry, setExpiry] = useState<ExpiryChoice>("none");
  const [title, setTitle] = useState("");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    if (!studioId || !author) {
      toastError("No active studio.");
      return;
    }
    setBusy(true);
    try {
      await fn();
      toastSuccess(ok);
    } catch (err) {
      console.error("Request write failed:", err);
      toastError("Could not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    if (!title.trim() || !studioId || !author) return;
    await run(
      () => createRequest({ studioId, author, kind, title, expiry }),
      "Posted to the board.",
    );
    setTitle("");
    setExpiry("none");
    setComposing(false);
  };

  const claim = async (r: TaskRequest) => {
    const mine = r.claimedBy?.id === author?.id;
    await run(async () => {
      await setRequestClaim({
        studioId: studioId!,
        requestId: r.id,
        author,
        claimed: !mine,
      });
      if (!mine) {
        // Best-effort by design - notify() swallows its own failures, so a
        // claim never fails because the bell did.
        await notify({
          to: r.createdBy.id,
          actor: author,
          kind: "request-claimed",
          title: `${author?.name} picked up "${r.title}"`,
          studioId: studioId!,
          link: { view: "studio-tasks" },
        });
      }
    }, mine ? "Handed back." : "You've got it.");
  };

  /*
   * Resolving used to call resolveRequest with NO resolution text, so the
   * answer somebody had just worked out was discarded the moment the thread
   * closed. That is the whole reason the studio kept solving the same problem
   * twice, and the reason the playbook had nothing to feed on.
   *
   * Now it opens a dialog that asks what the answer was, and -- once there is
   * enough of one to be worth keeping -- offers to put it in the playbook.
   */
  const [resolving, setResolving] = useState<TaskRequest | null>(null);

  /*
   * The initiative a trainer is logging against, plus what they already
   * logged. Fetched on open rather than watched for every card: nine live
   * listeners for a dialog that is open for twenty seconds is a lot of
   * snapshot traffic for a screen that already runs three.
   */
  const [logging, setLogging] = useState<TaskRequest | null>(null);
  const [myEntries, setMyEntries] = useState<SubmissionEntry[]>([]);
  const [savingLog, setSavingLog] = useState(false);
  const [loadingLogId, setLoadingLogId] = useState<string | null>(null);

  /*
   * FETCH BEFORE OPENING, not after.
   *
   * The dialog seeds its draft from `entries` once, on mount, which is right —
   * it must not yank names out from under a trainer mid-pick. But that means
   * opening it first and filling entries in later shows an empty picker to
   * someone who logged three clients yesterday, and they re-pick all three.
   * So the read happens first and the button shows that it is working.
   */
  const openLog = async (r: TaskRequest) => {
    if (!studioId || !author?.id) return;
    setLoadingLogId(r.id);
    try {
      const subs = await fetchSubmissions(studioId, r.id);
      setMyEntries(subs.find((sx) => sx.trainerId === author.id)?.entries ?? []);
    } catch (err) {
      // Not fatal — open empty rather than blocking the log entirely, and say
      // so, because silently losing yesterday's picks is the confusing case.
      console.error("Could not load your initiative entries:", err);
      setMyEntries([]);
      toastError("Could not load what you logged before. Starting fresh.");
    } finally {
      setLoadingLogId(null);
      setLogging(r);
    }
  };

  const saveLog = async (entries: SubmissionEntry[]) => {
    if (!studioId || !author?.id || !logging) return;
    setSavingLog(true);
    try {
      await saveSubmission(
        studioId,
        logging.id,
        { id: author.id, name: author.name },
        entries,
      );
      toastSuccess(
        entries.length === 0
          ? "Cleared your entries."
          : `Logged ${entries.length}.`,
      );
      setLogging(null);
    } catch (err) {
      console.error("Initiative submission failed:", err);
      toastError("Could not log that. Check your connection.");
    } finally {
      setSavingLog(false);
    }
  };

  const submitResolve = async (args: {
    resolution: string;
    playbook: Parameters<typeof resolveAndMaybeKeep>[0]["playbook"];
  }) => {
    const r = resolving;
    if (!r || !studioId) return;
    setBusy(true);
    try {
      const outcome = await resolveAndMaybeKeep({
        studioId,
        request: r,
        author,
        resolution: args.resolution,
        playbook: args.playbook,
      });
      const msg = outcomeMessage(outcome);
      if (msg.tone === "success") toastSuccess(msg.text);
      else toastError(msg.text);

      await notify({
        to: r.createdBy.id,
        actor: author,
        kind: "request-resolved",
        title: `${author?.name} closed "${r.title}"`,
        studioId,
        link: { view: "studio-tasks" },
      });
      setResolving(null);
    } catch (err) {
      console.error("Resolve failed:", err);
      toastError("Could not close that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (r: TaskRequest) => {
    setResolving(r);
  };

  /**
   * Reactions do not toast and do not notify.
   *
   * A nod is not an event. Sending the author a bell every time somebody taps
   * "Got it" would put five notifications behind one heads-up, which is the
   * exact volume problem notify.ts's four filters exist to prevent - and a
   * toast for your own tap tells you what you can already see.
   */
  const react = async (r: TaskRequest, id: (typeof REQUEST_REACTIONS)[number]["id"]) => {
    if (!studioId || !author) return;
    const on = !r.reactions?.[id]?.[author.id];
    try {
      await toggleRequestReaction({
        studioId,
        requestId: r.id,
        reaction: id,
        author,
        on,
      });
    } catch (err) {
      console.error("Reaction failed:", err);
    }
  };

  return (
    <section className="stq" aria-label="Studio requests">
      <header className="stq__head">
        <MessageSquare size={14} aria-hidden />
        <h2 className="stq__title">Requests</h2>
        {openRequests.length > 0 && (
          <span className="stq__count">{openRequests.length}</span>
        )}
        <button
          type="button"
          className="stq__new"
          onClick={() => setComposing((v) => !v)}
          aria-expanded={composing}
        >
          {composing ? <X size={13} aria-hidden /> : <Send size={13} aria-hidden />}
          {composing ? "Cancel" : "Ask the studio"}
        </button>
      </header>

      {composing && (
        <div className="stq__composer">
          <div className="stq__kinds" role="group" aria-label="Kind of request">
            {KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  className="stq__kind"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  title={REQUEST_KIND_HINT[k]}
                >
                  <Icon size={13} aria-hidden />
                  {REQUEST_KIND_LABEL[k]}
                </button>
              );
            })}
          </div>

          {/* No expiry stays the default and stays FIRST: most asks have no
              honest deadline, and a picker that defaults to one would put a
              made-up shelf life on every request on the board. */}
          <div className="stq__kinds" role="group" aria-label="How long this stands">
            <span className="stq__expiry-label">
              <Clock size={12} aria-hidden /> Stands for
            </span>
            {EXPIRIES.map((e) => (
              <button
                key={e}
                type="button"
                className="stq__kind"
                aria-pressed={expiry === e}
                onClick={() => setExpiry(e)}
              >
                {EXPIRY_LABEL[e]}
              </button>
            ))}
          </div>

          <div className="stq__row">
            <input
              className="stq__input"
              value={title}
              placeholder={REQUEST_KIND_HINT[kind]}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void post();
                }
              }}
              aria-label="What do you need?"
            />
            <button
              type="button"
              className="stq__post"
              onClick={() => void post()}
              disabled={!title.trim() || busy}
            >
              <Send size={13} aria-hidden />
              Post
            </button>
          </div>
        </div>
      )}

      {openRequests.length === 0 ? (
        !composing && (
          <p className="stq__empty">
            Nothing floating. Post here to ask for cover, flag something, or
            get another trainer's read on a client.
          </p>
        )
      ) : (
        <ul className="stq__list">
          {openRequests.map((r) => {
            const Icon = KIND_ICON[r.kind] ?? MessageSquare;
            const mine = r.claimedBy?.id === author?.id;
            const isAuthor = r.createdBy.id === author?.id;
            const left = timeLeft(r.expiresAt);
            const reactions = reactionSummary(r);
            return (
              <li
                key={r.id}
                className="stq__item"
                data-urgent={r.priority === "urgent" || undefined}
              >
                <div className="stq__item-main">
                  <span className="stq__icon" aria-hidden>
                    <Icon size={14} />
                  </span>
                  <span className="stq__item-text">
                    <span className="stq__item-title">{r.title}</span>
                    <span className="stq__item-sub">
                      {r.createdBy.name} · {ago(r.createdAt)}
                      {r.replyCount > 0
                        ? ` · ${r.replyCount} repl${r.replyCount === 1 ? "y" : "ies"}`
                        : ""}
                      {r.claimedBy ? ` · ${r.claimedBy.name} has this` : ""}
                      {left && (
                        <span className="stq__ttl">
                          <Clock size={10} aria-hidden />
                          {left}
                        </span>
                      )}
                    </span>
                  </span>

                  {/*
                    An initiative is not claimable — it is addressed to
                    everyone, and "Claim" on a thing nine people all have to do
                    would mean the opposite of what it means everywhere else on
                    this board. The primary action is logging your own share.
                  */}
                  {r.kind === "initiative" ? (
                    <button
                      type="button"
                      className="stq__act"
                      onClick={() => void openLog(r)}
                      disabled={busy || !author?.id || loadingLogId === r.id}
                    >
                      <Target size={12} aria-hidden />
                      {loadingLogId === r.id ? "Opening…" : "Log mine"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="stq__act"
                      onClick={() => void claim(r)}
                      disabled={busy}
                      aria-pressed={Boolean(mine)}
                    >
                      <Sparkles size={12} aria-hidden />
                      {mine ? "Drop" : r.claimedBy ? "Take over" : "Claim"}
                    </button>
                  )}

                  {isAuthor && (
                    <button
                      type="button"
                      className="stq__act"
                      onClick={() => void resolve(r)}
                      disabled={busy}
                    >
                      <Check size={12} aria-hidden />
                      Close
                    </button>
                  )}

                  <button
                    type="button"
                    className="stq__act"
                    onClick={() => setThreadId(threadId === r.id ? null : r.id)}
                    aria-expanded={threadId === r.id}
                  >
                    <ChevronDown size={12} aria-hidden />
                    Reply
                  </button>
                </div>

                {/*
                  The roll-up sits on the card rather than behind a tap,
                  because for an initiative it IS the content. A card that
                  says only "five assessments each" and hides who has done
                  them is the version of this feature that gets ignored.
                */}
                {r.kind === "initiative" && roster && (
                  <InitiativeRollup
                    studioId={studioId}
                    requestId={r.id}
                    target={r.target}
                    roster={roster}
                    currentUserId={currentUserId ?? author?.id ?? null}
                  />
                )}

                {/* One row, always visible, never behind a menu. A reaction
                    that costs a tap to reveal costs the same as typing. */}
                <div className="stq__reacts" role="group" aria-label="Quick reply">
                  {REQUEST_REACTIONS.map((preset) => {
                    const bucket = r.reactions?.[preset.id];
                    const count = bucket ? Object.keys(bucket).length : 0;
                    const active = Boolean(author && bucket?.[author.id]);
                    const who = reactions
                      .find((x) => x.id === preset.id)
                      ?.names.filter(Boolean)
                      .join(", ");
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className="stq__react"
                        aria-pressed={active}
                        title={who || preset.label}
                        onClick={() => void react(r, preset.id)}
                        disabled={!author}
                      >
                        {preset.label}
                        {count > 0 && (
                          <span className="stq__react-n">{count}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {threadId === r.id && (
                  <RequestThread
                    studioId={studioId}
                    request={r}
                    author={author}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {resolving && (
        <ResolveDialog
          open={!!resolving}
          onOpenChange={(v) => !v && setResolving(null)}
          request={resolving}
          saving={busy}
          onResolve={submitResolve}
        />
      )}

      {/*
        Mounted only while open, and keyed on the request, so the picker's
        internal draft starts from THIS initiative's existing entries rather
        than whatever was left in state from the last one.
      */}
      {logging && (
        <SubmitInitiativeDialog
          key={logging.id}
          open
          onOpenChange={(v) => !v && setLogging(null)}
          target={logging.target}
          title={logging.title}
          clients={clients ?? []}
          entries={myEntries}
          saving={savingLog}
          onSave={saveLog}
        />
      )}
    </section>
  );
}

/**
 * One request's replies.
 *
 * Mounted only while the thread is open, which is the point: a board showing
 * twelve requests holds zero reply listeners until somebody taps one.
 */
function RequestThread({
  studioId,
  request,
  author,
}: {
  studioId: string | null;
  request: TaskRequest;
  author: TaskAuthor | null;
}) {
  const { replies } = useRequestReplies(studioId, request.id);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!body.trim() || !studioId || !author) return;
    setBusy(true);
    try {
      await addRequestReply({
        studioId,
        requestId: request.id,
        author,
        body,
      });
      await notify({
        to: request.createdBy.id,
        actor: author,
        kind: "request-replied",
        title: `${author.name} replied to "${request.title}"`,
        body,
        studioId,
        link: { view: "studio-tasks" },
      });
      setBody("");
    } catch (err) {
      console.error("Reply failed:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stq__thread">
      {request.detail && <p className="stq__detail">{request.detail}</p>}
      {replies.length > 0 && (
        <ul className="stq__replies">
          {replies.map((rep) => (
            <li key={rep.id} className="stq__reply">
              <span className="stq__reply-who">{rep.author.name}</span>
              <span className="stq__reply-body">{rep.body}</span>
              <span className="stq__reply-when">{ago(rep.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="stq__row">
        <input
          className="stq__input"
          value={body}
          placeholder="Reply…"
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void send();
            }
          }}
          aria-label={`Reply to ${request.title}`}
        />
        <button
          type="button"
          className="stq__post"
          onClick={() => void send()}
          disabled={!body.trim() || busy}
        >
          <Send size={13} aria-hidden />
        </button>
      </div>
    </div>
  );
}
