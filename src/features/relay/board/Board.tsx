import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Crosshair,
  Hand,
  Laptop,
  MapPin,
  Megaphone,
  Shuffle,
  SprayCan,
  Undo2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../../../lib/utils";
import { useToast } from "../../../contexts/ToastContext";
import { notify } from "../../notifications";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import { setRequestFor, type TaskRequest } from "../../studio-tasks/requests";
import { claimAskWithTrail, journalAuthorOf, reopenAskWithTrail } from "../../studio-tasks/question-trail";
import { ASK_TILES, type AskTile } from "./ask";
import type { ClientTaskAction, TaskRow } from "../../studio-tasks/types";
import type { TaskActions } from "../../studio-tasks/useTaskActions";
import { studioRoster } from "../../studio-tasks/initiatives";
import { addDays, repeatPlanForward } from "../../studio-tasks/recurrence";
import { saveTaskTemplate } from "../../studio-tasks/mutations";
import { buildTracker } from "../tracker";
import { joinJob, leaveJob } from "../jobs/mutations";
import type { TeamJob } from "../jobs/types";
import { forgetOnSignOut } from "../../sign-out/memory";
import { useRelay } from "./RelayContext";
import { emptyPrompt, snoozedIds, unsnooze } from "./next-up";
import { SwipeRow } from "./SwipeRow";
import { FACES_SHOWN, NAME_SPANS, namedLine, whoFaces, type NameSpan, type WhoFace } from "./who";
import { shiftRings } from "./rings";
import { teamTodayLines } from "./team-today";
import { minutesToClock } from "./now-context";
import { floorLoad, laterToday, rightNow } from "./right-now";
import {
  DOOR_LABEL,
  DOOR_ORDER,
  deckFor,
  doorFaces,
  giverOf,
  postedToday,
  pressureOf,
  whereOf,
  whyNow,
  type BoardInput,
  type BoardItem,
  type BoardScored,
  type DoorId,
} from "./doors";
import { useCardActions } from "./card-actions";
import { untrack, useTracked } from "./tracked";
import { JustNow } from "./JustNow";
import {
  closeoutAt,
  closeoutItems,
  dayDraft,
  foldShiftCard,
  foldedAt,
  openingLines,
  shiftCardNow,
  unfoldShiftCard,
  type CloseoutItem,
} from "./shift-cards";
import { CloseOutCard, OpeningCard, ShiftCardsLine, type ShiftLinePart } from "./ShiftCards";
import "./board.css";

/**
 * THE BOARD — Relay's first tab, as AJ picked it (Relay room, Sep 28 2026;
 * the Redesign Blueprints' Mission Board + Journal, phase 2).
 *
 * AJ: "right now I just see a bunch of text scrambled all over the screen
 * with really no where for me to look … Trainers should be able to head here
 * and be pointed directly at the work they are looking for." So the Board
 * answers one question first: what should I do with the time I have?
 *
 *   Right now      one sentence with its proof, and the door it opens
 *                  (right-now.ts). Tap another door and the Board follows
 *                  you until "Back to Relay's pick" or your next gap.
 *   Opening, Close out  a small card under it at the start and the end of
 *                  your day (shift-cards.ts, phase 6): what's waiting, and
 *                  what's left to hand on.
 *   Five doors     Floor work · Desk work · Help a teammate · From
 *                  leadership · Mine, each saying how many and how long
 *                  (doors.ts).
 *   Dealt to you   the one job behind the open door that fits best, the
 *                  biggest words on the screen, with Take it and Not now;
 *                  two more that also fit, and Deal me another.
 *   Just now       the teammates' lines and the day's chores for the whole
 *                  studio, beside it (below it, upright).
 *   Later today    your next gaps and when Closing opens.
 *   Behind the door  everything that was on the Floor, unchanged, behind the
 *                  door it belongs to (the host draws it: `behind`).
 *
 * Nothing here writes on its own. Taking a job writes the claim it always
 * wrote; passing one over is this iPad's memory for the shift phase.
 */

const DOOR_ICON: Record<DoorId, LucideIcon> = {
  floor: SprayCan,
  desk: Laptop,
  help: Hand,
  lead: Megaphone,
  mine: UserRound,
};

/*
 * "Opens on From leadership only the first time a new initiative arrives"
 * (q4's default, and AJ's "sure"): the initiatives the Board has already
 * opened on, on this iPad. Module memory, per studio; forgotten at sign-out,
 * because it is a person's.
 */
const openedOn = new Map<string, Set<string>>();
forgetOnSignOut(() => openedOn.clear());

function seenInitiatives(studioId: string | null): Set<string> {
  if (!studioId) return new Set();
  return openedOn.get(studioId) ?? new Set();
}

function markInitiativeSeen(studioId: string | null, id: string): void {
  if (!studioId) return;
  const next = new Set(openedOn.get(studioId) ?? []);
  next.add(id);
  openedOn.set(studioId, next);
}

export interface BoardProps {
  rows: TaskRow[];
  jobs: TeamJob[];
  /** Every open request, initiatives included. */
  requests: TaskRequest[];
  actions: TaskActions;
  author: TaskAuthor | null;
  onOpenJob: (job: TeamJob) => void;
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
  /** The day's tasks are still loading. */
  loading: boolean;
  /** What sits behind each door: the Floor's own lanes, drawn by the host. */
  behind: (door: DoorId) => ReactNode;
  /** Asks closed recently, for the day so far on Close out. */
  resolved?: TaskRequest[];
  /** One of today's reads failed, so an empty list is unknown, never "nothing". */
  unknown?: boolean;
  /**
   * The top of the side column: Since you were in (./SinceYouWereIn.tsx),
   * drawn by the host, which holds the reads it needs (the second wave of
   * the Relay room, Sep 28 2026).
   */
  around?: ReactNode;
  /** Answers kept in the Playbook today, for Team today's "Asks answered" line. */
  keptToday?: number;
}

export function Board({
  rows,
  jobs,
  requests,
  actions,
  author,
  onOpenJob,
  onOpenClientTask,
  loading,
  behind,
  resolved = [],
  unknown = false,
  around,
  keptToday = 0,
}: BoardProps) {
  const relay = useRelay();
  const { now } = relay;
  const { success: toastSuccess, error: toastError } = useToast();
  const [snoozeTick, setSnoozeTick] = useState(0);
  const [userDoor, setUserDoor] = useState<DoorId | null>(null);
  const [pinned, setPinned] = useState<Partial<Record<DoorId, string>>>({});
  const scrollTo = useRef<string | null>(null);

  // Relay goes back to its own pick at the trainer's next gap.
  const gapKey = `${now.current?.id ?? ""}|${now.next?.id ?? ""}`;
  useEffect(() => {
    setUserDoor(null);
  }, [gapKey]);

  const me = useMemo(() => new Set([relay.uid, author?.id].filter(Boolean) as string[]), [relay.uid, author?.id]);
  // Who writes a line on a client's record when a question is handed back or opened again (the Auth uid).
  const writer = useMemo(
    () => journalAuthorOf(relay.uid, relay.authTrainer?.fullName ?? author?.name, relay.authTrainer?.initials),
    [relay.uid, relay.authTrainer?.fullName, relay.authTrainer?.initials, author?.name],
  );

  const lastSession = useMemo(() => {
    const ended = now.sessions.filter((s) => s.endMin <= now.nowMin && now.nowMin - s.endMin <= 60);
    return ended[ended.length - 1] ?? null;
  }, [now]);
  const lastMachineIds = useMemo(() => {
    if (!lastSession?.clientId) return [];
    return relay.sessions.find((x) => x.clientId === lastSession.clientId)?.sessionMachineIds ?? [];
  }, [relay.sessions, lastSession]);

  const input: BoardInput = useMemo(() => {
    void snoozeTick;
    return {
      rows,
      jobs,
      requests,
      trainerId: author?.id ?? null,
      uid: relay.uid,
      todayKey: now.todayKey,
      gapMinutes: now.gapMinutes,
      lastClientId: lastSession?.clientId ?? null,
      lastMachineIds,
      snoozed: snoozedIds(relay.studioId, now.todayKey, now.phase),
    };
  }, [rows, jobs, requests, author?.id, relay.uid, relay.studioId, now, lastSession, lastMachineIds, snoozeTick]);

  /* Right now. */
  const [seenAtMount] = useState(() => seenInitiatives(relay.studioId));
  const load = useMemo(() => floorLoad(relay.schedules, now.todayKey, now.nowMin), [relay.schedules, now.todayKey, now.nowMin]);
  const coverAsk = requests.find((r) => r.status === "open" && r.kind === "cover" && !r.claimedBy && !me.has(r.createdBy.id)) ?? null;
  const handedFrom = requests.filter((r) => r.status === "open" && r.forId && me.has(r.forId) && !r.claimedBy).map((r) => r.createdBy.name);
  const initiative =
    requests.find((r) => r.status === "open" && r.kind === "initiative" && postedToday(r, now.todayKey) && !seenAtMount.has(r.id)) ?? null;
  const pick = rightNow({
    now,
    load,
    studioName: relay.studioName,
    coverAsk: coverAsk ? { who: coverAsk.createdBy.name, title: coverAsk.title } : null,
    handedFrom,
    newInitiative: initiative ? { who: initiative.createdBy.name, title: initiative.title } : null,
  });
  // Opened on an initiative once: the next visit on this iPad moves on.
  useEffect(() => {
    if (pick.door === "lead" && initiative) markInitiativeSeen(relay.studioId, initiative.id);
  }, [pick.door, initiative, relay.studioId]);

  const door: DoorId = userDoor ?? pick.door ?? "floor";
  const faces = useMemo(() => doorFaces(input, now.phase === "closed" ? "closed" : now.phase), [input, now.phase]);

  /* The deck behind the open door. */
  const deck = useMemo(() => {
    const d = deckFor(door, input);
    const pin = pinned[door];
    if (!pin) return d;
    const i = d.findIndex((s) => s.item.id === pin);
    return i > 0 ? [d[i], ...d.slice(0, i), ...d.slice(i + 1)] : d;
  }, [door, input, pinned]);
  const dealt = deck[0] ?? null;
  const also = deck.slice(1, 3);

  const cardActions = useCardActions({
    actions,
    author,
    onOpenJob,
    onOpenClientTask,
    onShowInitiative: (r) => {
      setUserDoor("lead");
      scrollTo.current = `ask-card-${r.id}`;
    },
  });

  // Show an initiative's card behind From leadership, once it has drawn.
  useEffect(() => {
    if (!scrollTo.current) return;
    const el = document.getElementById(scrollTo.current);
    if (el) {
      el.scrollIntoView?.({ behavior: "smooth", block: "start" });
      scrollTo.current = null;
    }
  });

  const tracked = useTracked(relay.studioId, now.todayKey);

  const chooseDoor = (next: DoorId) => setUserDoor(next === pick.door ? null : next);

  /*
   * EVERY PASS-OVER AND EVERY SWIPE HAS AN UNDO (phase 3, "Cards and names").
   * One line at the foot of the Board for eight seconds: what just happened,
   * and Undo, 44px. Nothing else is asked.
   */
  const [undo, setUndo] = useState<{ key: number; label: string; run: () => Promise<unknown> | void } | null>(null);
  const offerUndo = (label: string, run: () => Promise<unknown> | void) => setUndo({ key: Date.now(), label, run });
  const clearUndo = useCallback(() => setUndo(null), []);

  const passOver = (s: BoardScored) => {
    cardActions.notNow(s.item);
    setPinned((p) => ({ ...p, [door]: undefined }));
    setSnoozeTick((t) => t + 1);
    offerUndo(`Passed over "${s.item.title}". Nothing was recorded.`, () => {
      if (relay.studioId) unsnooze(relay.studioId, now.todayKey, now.phase, s.item.id);
      setSnoozeTick((t) => t + 1);
    });
  };

  /** Done, from the card's own button or a swipe right, with its Undo. */
  const markDone = (s: BoardScored) => {
    const item = s.item;
    if (item.kind === "group") {
      const open = item.group.rows.filter((r) => r.status === "open");
      void actions.completeGroup(item.group);
      offerUndo(`${item.title}: marked done.`, async () => {
        for (const r of open) await actions.reopen(r);
      });
    } else if (item.kind === "client") {
      void actions.complete(item.row);
      // A task that needs a closing note asks for it first (its dialog): nothing was done yet.
      if (!item.row.template.requiresNote) offerUndo(`${item.title}: marked done.`, () => actions.reopen(item.row));
    } else if (item.kind === "ask") {
      cardActions.done(item);
      // Undo opens it again, and a question's thread on her record with it.
      offerUndo(`Closed "${item.title}".`, () =>
        relay.studioId ? reopenAskWithTrail({ studioId: relay.studioId, request: item.request, who: writer }) : undefined,
      );
    } else {
      cardActions.done(item);
    }
  };

  /*
   * WHO? (leaders only; AJ, q5: "leadership can just directly assign"). A face
   * puts that person's name on the job, for today, this week or two weeks on a
   * shift chore; an ask stands until it is done. It arrives already theirs;
   * the tick stays open to everyone.
   */
  const [span, setSpan] = useState<NameSpan>(1);
  const people = useMemo(() => studioRoster(relay.trainers, relay.studioId), [relay.trainers, relay.studioId]);
  const whoList = useMemo(
    () =>
      whoFaces({
        people,
        trainers: relay.trainers,
        schedules: relay.schedules,
        todayKey: now.todayKey,
        nowMin: now.nowMin,
        excludeIds: [relay.uid, author?.id],
      }),
    [people, relay.trainers, relay.schedules, now.todayKey, now.nowMin, relay.uid, author?.id],
  );
  const actor = relay.uid ? { id: relay.uid, name: relay.authTrainer?.fullName ?? author?.name ?? "A trainer" } : null;

  const nameIt = async (s: BoardScored, face: WhoFace) => {
    const person = { id: face.id, name: face.name };
    const item = s.item;
    if (item.kind === "group") {
      const open = item.group.rows.filter((r) => r.status === "open");
      const template = open[0]?.template;
      const planned = span > 1 && template && now.todayKey ? repeatPlanForward(open, template, now.todayKey, span) : open;
      await actions.assign(item.group, person, { planned, days: span });
      offerUndo(`${namedLine(face.name, span)}.`, () => actions.assign(item.group, null));
      return;
    }
    if (item.kind === "ask" && relay.studioId) {
      try {
        await setRequestFor({ studioId: relay.studioId, requestId: item.request.id, person });
        // The one bell a hand-off has always rung (Capture's), once.
        if (actor)
          await notify({
            to: face.id,
            actor,
            kind: "handoff",
            title: `${actor.name.split(" ")[0]} put your name on: ${item.request.title}`.slice(0, 200),
            studioId: relay.studioId,
            link: { view: "studio-tasks", id: "mine" },
          });
        toastSuccess(`${face.name.split(" ")[0]} has it. It's under Mine for them.`);
        offerUndo(`${face.name.split(" ")[0]} has it.`, () =>
          relay.studioId ? setRequestFor({ studioId: relay.studioId, requestId: item.request.id, person: null }) : undefined,
        );
      } catch (err) {
        console.warn("[relay] naming failed:", err);
        toastError("Could not put a name on that. Check your connection.");
      }
    }
  };

  /*
   * "I CAN'T" on work with your name on it: a leader's assignment arrives
   * already yours, with a way to say you can't. An ask goes back on the board
   * as an offer anyone can take; a team job lets you step off. A chore or a
   * client task keeps the leader's name (only a leader may change it, by the
   * rules), so it opens an ask to the team instead, for you to post.
   */
  const cantDo = async (s: BoardScored) => {
    const item = s.item;
    try {
      if (item.kind === "ask" && relay.studioId && item.request.forId) {
        const was = { id: item.request.forId, name: item.request.forName ?? author?.name ?? "You" };
        await setRequestFor({ studioId: relay.studioId, requestId: item.request.id, person: null });
        offerUndo("Back on the board, for anyone to take.", () =>
          relay.studioId ? setRequestFor({ studioId: relay.studioId, requestId: item.request.id, person: was }) : undefined,
        );
      } else if (item.kind === "job" && author) {
        await leaveJob(item.job, author);
        offerUndo(`You stepped off "${item.title}".`, () => joinJob(item.job, author));
      } else {
        relay.openCapture({
          destination: "floor",
          askKind: "help",
          text: `Can anyone take this? ${item.title}\nMy name is on it, and I can't get to it.`,
        });
      }
    } catch (err) {
      console.warn("[relay] can't-do failed:", err);
      toastError("Could not change that. Check your connection.");
    }
  };

  /*
   * OPENING AND CLOSE OUT (phase 6): two small cards at the top of the Board,
   * at the start and the end of the trainer's day, from the Tracker's own
   * lists (shift-cards.ts). "Got it" folds one for the day on this iPad.
   */
  const tracker = useMemo(
    () =>
      buildTracker({
        rows,
        templates: [],
        requests,
        resolved,
        jobs,
        followUps: [],
        uid: relay.uid,
        trainerId: author?.id ?? null,
        todayKey: now.todayKey,
        closingMin: now.hours.closing,
      }),
    [rows, requests, resolved, jobs, relay.uid, author?.id, now.todayKey, now.hours.closing],
  );
  const card = shiftCardNow(now);
  const [foldTick, setFoldTick] = useState(0);
  const [preview, setPreview] = useState(false);
  const folds = useMemo(() => {
    void foldTick;
    return {
      opening: foldedAt(relay.studioId, now.todayKey, "opening"),
      closeout: foldedAt(relay.studioId, now.todayKey, "closeout"),
    };
  }, [relay.studioId, now.todayKey, foldTick]);
  const fold = (which: "opening" | "closeout") => {
    foldShiftCard(relay.studioId, now.todayKey, which, now.nowMin);
    setFoldTick((t) => t + 1);
  };
  const unfold = (which: "opening" | "closeout") => {
    unfoldShiftCard(relay.studioId, now.todayKey, which);
    setFoldTick((t) => t + 1);
  };
  const opening = useMemo(
    () => (card === "opening" ? openingLines({ now, rows, requests, me, handed: tracker.handed.length }) : []),
    [card, now, rows, requests, me, tracker.handed.length],
  );
  const showOpening = card === "opening" && folds.opening === null && opening.length > 0;
  const closeAt = closeoutAt(now);
  const showCloseout = (card === "closeout" && folds.closeout === null) || (preview && card !== "closeout");
  const leftOpen = useMemo(() => closeoutItems(tracker, now.todayKey), [tracker, now.todayKey]);
  const draft = useMemo(() => dayDraft({ now, done: tracker.done }), [now, tracker.done]);

  const goFromOpening = (go: DoorId | "tracker") => {
    if (go === "tracker") relay.openRelayTab?.("mine");
    else chooseDoor(go);
  };

  /** Close out's hand-on: the write each kind has always had, with its Undo. */
  const handOn = async (item: CloseoutItem) => {
    const studioId = relay.studioId;
    try {
      if (item.kind === "handed-ask" && studioId) {
        const was = { id: item.request.forId ?? author?.id ?? "", name: item.request.forName ?? author?.name ?? "You" };
        await setRequestFor({ studioId, requestId: item.request.id, person: null });
        offerUndo("Back on the board, for anyone to take.", () => setRequestFor({ studioId, requestId: item.request.id, person: was }));
      } else if (item.kind === "taken-ask" && studioId && author) {
        await claimAskWithTrail({ studioId, request: item.request, author, claimed: false, who: writer });
        offerUndo(`Handed back "${item.title}".`, () =>
          claimAskWithTrail({ studioId, request: item.request, author, claimed: true, who: writer }),
        );
      } else if (item.kind === "job" && author) {
        await leaveJob(item.job, author);
        offerUndo(`You stepped off "${item.title}".`, () => joinJob(item.job, author));
      } else if (item.kind === "chore") {
        relay.openCapture({
          destination: "floor",
          askKind: "help",
          text: `Can anyone take this? ${item.title}\nMy name is on it, and I can't get to it today.`,
        });
      } else if (item.kind === "todo" && item.once && studioId && relay.uid) {
        const location = { scope: "personal" as const, studioId, ownerId: relay.uid };
        const template = item.row.template;
        const onDate = template.recurrence.onDate ?? now.todayKey;
        await saveTaskTemplate({
          location,
          template: { ...template, recurrence: { ...template.recurrence, onDate: addDays(now.todayKey, 1) } },
          author,
          isNew: false,
        });
        offerUndo(`Moved "${item.title}" to tomorrow.`, () =>
          saveTaskTemplate({ location, template: { ...template, recurrence: { ...template.recurrence, onDate } }, author, isNew: false }),
        );
      }
    } catch (err) {
      console.warn("[relay] close out failed:", err);
      toastError("Could not change that. Check your connection.");
    }
  };

  /* The line at the foot of Later today: when each card is, and a way back to it. */
  const lineParts: ShiftLinePart[] = [];
  if (folds.opening !== null) {
    lineParts.push({
      key: "opening",
      card: "opening",
      text: `Opening · done at ${minutesToClock(folds.opening)}`,
      action: "Show again",
      onAction: () => unfold("opening"),
    });
  }
  if (card === "closeout" && folds.closeout !== null) {
    lineParts.push({
      key: "closeout",
      card: "closeout",
      text: `Close out · done at ${minutesToClock(folds.closeout)}`,
      action: "Show again",
      onAction: () => unfold("closeout"),
    });
  } else if (card !== "closeout" && now.phase !== "closed" && closeAt > now.nowMin && !preview) {
    lineParts.push({
      key: "closeout",
      card: "closeout",
      text: `Close out · opens at ${minutesToClock(closeAt)}${now.sessions.length ? ", when your last session ends" : ""}`,
      action: "Preview",
      onAction: () => setPreview(true),
    });
  }

  const later = laterToday(now);
  const emptyFloor = emptyPrompt(now.gapMinutes, now.next?.clientName.split(" ")[0] ?? null);
  // Behind Mine: everything with this trainer's name on it, passed-over ones included.
  const mineDeck = useMemo(() => (door === "mine" ? deckFor("mine", { ...input, snoozed: new Set() }) : []), [door, input]);

  return (
    <div className="rbd">
      <div className="rbd-lens" role="status" aria-live="polite">
        <span className="rbd-lens__k">
          <Compass size={16} aria-hidden />
          Right now
        </span>
        <p className="rbd-lens__t">
          {userDoor ? (
            <>
              You opened <b>{DOOR_LABEL[userDoor]}</b>. <span className="rbd-mute">{pick.sentence}</span>
            </>
          ) : (
            pick.sentence
          )}
        </p>
        {userDoor && (
          <button type="button" className="rbd-link" onClick={() => setUserDoor(null)}>
            <Undo2 size={16} aria-hidden />
            Back to Relay's pick
          </button>
        )}
      </div>

      {showOpening && <OpeningCard lines={opening} onGo={goFromOpening} onFold={() => fold("opening")} />}
      {showCloseout && (
        <CloseOutCard
          items={leftOpen}
          draft={draft}
          opensAt={card === "closeout" ? null : minutesToClock(closeAt)}
          unknown={unknown}
          loading={loading}
          todayKey={now.todayKey}
          actions={actions}
          onHandOn={(item) => void handOn(item)}
          onFold={() => (card === "closeout" ? fold("closeout") : setPreview(false))}
        />
      )}

      <div className="rbd-doors" role="group" aria-label="Doors">
        {DOOR_ORDER.map((id) => {
          const f = faces[id];
          const Icon = DOOR_ICON[id];
          const open = door === id;
          return (
            <button
              key={id}
              type="button"
              className={cn("rbd-door", open && "rbd-door--open")}
              aria-pressed={open}
              onClick={() => chooseDoor(id)}
            >
              <span className="rbd-door__h">
                <span className="rbd-door__ic" aria-hidden>
                  <Icon size={16} />
                </span>
                <span className="rbd-door__label">{f.label}</span>
                {pick.door === id && (
                  <span className="rbd-door__pick" aria-label="Relay's pick">
                    <Compass size={15} aria-hidden />
                  </span>
                )}
              </span>
              <span className="rbd-door__n">
                <b>{f.count.split(" ")[0]}</b> {f.count.split(" ").slice(1).join(" ")}
                {f.range && <span className="rbd-mute"> · {f.range}</span>}
              </span>
              {f.sub && <span className={cn("rbd-door__sub", f.hot && "rbd-hot")}>{f.sub}</span>}
            </button>
          );
        })}
      </div>

      <div className="rbd-split">
        <section className="rbd-deal" aria-label="Dealt to you">
          <h2 className="rbd-h">
            Dealt to you
            {dealt && (
              <span className="rbd-h__sub">
                {dealt.fits === false
                  ? "longer than your gap"
                  : now.gapMinutes !== null && !now.current
                    ? `fits your ${now.gapMinutes} min`
                    : `the best fit behind ${DOOR_LABEL[door]}`}
              </span>
            )}
          </h2>
          {loading && !dealt ? (
            <p className="rbd-quiet">Looking at the floor…</p>
          ) : dealt ? (
            <DealtCard
              scored={dealt}
              door={door}
              rows={rows}
              actions={actions}
              tracking={tracked?.id === dealt.item.id}
              onTake={() => cardActions.take(dealt.item)}
              onNotNow={() => passOver(dealt)}
              onDone={closable(dealt.item) ? () => markDone(dealt) : undefined}
              onCant={door === "mine" ? () => void cantDo(dealt) : undefined}
              named={namedOn(dealt.item, me)}
              faces={relay.canLead && assignable(dealt.item) ? whoList : undefined}
              span={span}
              onSpan={setSpan}
              onName={(face) => void nameIt(dealt, face)}
              onStopTracking={() => untrack(relay.studioId, now.todayKey, dealt.item.id)}
            />
          ) : door === "floor" ? (
            <p className="rbd-empty">
              <b>{emptyFloor.title}</b> {emptyFloor.body}
            </p>
          ) : (
            <p className="rbd-empty">Nothing waiting behind {DOOR_LABEL[door]} right now. Try another door.</p>
          )}

          {(also.length > 0 || dealt) && (
            <div className="rbd-also">
              <h3 className="rbd-h rbd-h--small">Also fits</h3>
              <div className="rbd-also__row">
                {also.map((s) => (
                  <button
                    key={s.item.id}
                    type="button"
                    className="rbd-alt"
                    onClick={() => setPinned((p) => ({ ...p, [door]: s.item.id }))}
                  >
                    <span className="rbd-alt__t">
                      {s.item.title}
                      <span className="rbd-alt__s">{altLine(s)}</span>
                    </span>
                    <ChevronRight size={16} aria-hidden />
                  </button>
                ))}
                {dealt && (
                  <button type="button" className="rbd-alt rbd-alt--deal" onClick={() => passOver(dealt)}>
                    <span className="rbd-alt__t">
                      Deal me another
                      <span className="rbd-alt__s">{also.length ? "the next one that fits" : "nothing else fits right now"}</span>
                    </span>
                    <Shuffle size={16} aria-hidden />
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <aside className="rbd-notices" aria-label="Around the studio">
          {around}
          <JustNow studioId={relay.studioId} />
          <TeamToday rows={rows} answered={resolved} keptToday={keptToday} />
        </aside>

        {(later.length > 0 || lineParts.length > 0) && (
          <section className="rbd-later" aria-label="Later today">
            {later.length > 0 && (
              <>
                <h2 className="rbd-h">
                  Later today<span className="rbd-h__sub">fitted to your gaps</span>
                </h2>
                <ul className="rbd-later__list">
                  {later.map((r) => (
                    <li key={r.key} className="rbd-later__row">
                      <span className="rbd-later__time">{r.time}</span>
                      <span className="rbd-later__t">
                        {r.what}
                        {r.sub && <span className="rbd-later__s">{r.sub}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <ShiftCardsLine parts={lineParts} />
          </section>
        )}
      </div>

      <section className="rbd-behind" aria-label={`Behind ${DOOR_LABEL[door]}`}>
        <h2 className="rbd-h rbd-behind__h">Behind {DOOR_LABEL[door]}</h2>
        {door === "help" && relay.openAsk && (
          <div className="rbd-asks" role="group" aria-label="Ask the team">
            <span className="rbd-h rbd-h--small rbd-asks__h">Ask the team</span>
            <div className="rbd-asks__row">
              {ASK_TILES.map((t) => (
                <button key={t.id} type="button" className="rbd-ask" onClick={() => relay.openAsk?.({ tile: t.id as AskTile })}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {door === "mine" && (
          <div className="rbd-mine">
            {mineDeck.length === 0 ? (
              <p className="rbd-empty">Nothing on the board has your name on it right now.</p>
            ) : (
              <ul className="rbd-rows">
                {mineDeck.map((s) => (
                  <li key={s.item.id} className="rbd-row">
                    <span className="rbd-row__t">
                      {s.item.title}
                      <span className="rbd-row__s">
                        {giverOf(s.item).person ? `From ${giverOf(s.item).name.split(" ")[0]}` : "The studio"}
                        {pressureOf(s) ? ` · ${pressureOf(s)}` : ""}
                        {s.item.estMinutes != null ? ` · ~${s.item.estMinutes} min` : ""}
                      </span>
                    </span>
                    <span className="rbd-row__acts">
                      <button type="button" className="rbd-btn rbd-btn--primary" onClick={() => cardActions.take(s.item)}>
                        {primaryWord(s.item)}
                      </button>
                      <button type="button" className="rbd-btn" onClick={() => void cantDo(s)}>
                        I can't
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {relay.openRelayTab && (
              <button type="button" className="rbd-link" onClick={() => relay.openRelayTab?.("mine")}>
                Your own list, follow-ups and what's coming up are in the Tracker
                <ChevronRight size={16} aria-hidden />
              </button>
            )}
          </div>
        )}
        {behind(door)}
      </section>

      {undo && <UndoBar key={undo.key} label={undo.label} onUndo={() => void undo.run()} onGone={clearUndo} />}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * What a card offers, by kind
 * ------------------------------------------------------------------ */

/** Can the card close its job in one tap (Done, or a swipe right)? */
function closable(item: BoardItem): boolean {
  return item.kind === "group" || item.kind === "client" || item.kind === "ask";
}

/** Can a leader put a name on it? A shared chore, or an ask; never someone's private task. */
function assignable(item: BoardItem): boolean {
  if (item.kind === "group") return item.group.scope !== "personal";
  return item.kind === "ask";
}

/** Whose name is already on it (not yours): the card says so, a heads-up and never a lock. */
function namedOn(item: BoardItem, me: Set<string>): string | null {
  if (item.kind === "group" && item.group.assignedTo && !me.has(item.group.assignedTo.id)) return item.group.assignedTo.name;
  if (item.kind === "ask" && item.request.forId && !me.has(item.request.forId)) return item.request.forName ?? null;
  return null;
}

/* ------------------------------------------------------------------ *
 * Undo — one line at the foot of the Board
 * ------------------------------------------------------------------ */

const UNDO_MS = 8000;

export function UndoBar({ label, onUndo, onGone }: { label: string; onUndo: () => void; onGone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onGone, UNDO_MS);
    return () => clearTimeout(t);
  }, [onGone]);
  return (
    <div className="rbd-undo" role="status" aria-live="polite">
      <span className="rbd-undo__t">{label}</span>
      <button
        type="button"
        className="rbd-undo__btn"
        onClick={() => {
          onUndo();
          onGone();
        }}
      >
        <Undo2 size={16} aria-hidden />
        Undo
      </button>
    </div>
  );
}

/** "~8 min · 19 machines" — the small print under an Also fits row. */
function altLine(s: BoardScored): string {
  const parts: string[] = [];
  if (s.item.estMinutes != null) parts.push(`~${s.item.estMinutes} min`);
  const pressure = pressureOf(s);
  if (pressure) parts.push(pressure);
  else if (s.why.length) parts.push(s.why[0]);
  return parts.join(" · ") || whereOf(s.item);
}

/* ------------------------------------------------------------------ *
 * The dealt card
 * ------------------------------------------------------------------ */

function primaryWord(item: BoardItem): string {
  if (item.kind === "initiative") return "Log mine";
  if (item.kind === "ask" && item.request.kind === "cover") return "I can";
  if (item.kind === "ask" && item.request.kind === "question") return "Answer";
  return "Take it";
}

export function DealtCard({
  scored,
  door,
  rows,
  actions,
  tracking,
  onTake,
  onNotNow,
  onDone,
  onCant,
  named = null,
  faces,
  span = 1,
  onSpan,
  onName,
  onStopTracking,
}: {
  scored: BoardScored;
  door: DoorId;
  rows: TaskRow[];
  actions: TaskActions;
  tracking: boolean;
  onTake: () => void;
  onNotNow: () => void;
  /** Close it in one tap (and a swipe right); absent for work that closes elsewhere. */
  onDone?: () => void;
  /** Your name is on it and you can't: back to the board, or off the job. */
  onCant?: () => void;
  /** Whose name is on it already (not yours). */
  named?: string | null;
  /** The Who? faces: a leader's, on a job that takes a name. */
  faces?: WhoFace[];
  span?: NameSpan;
  onSpan?: (days: NameSpan) => void;
  onName?: (face: WhoFace) => void;
  onStopTracking: () => void;
}) {
  const relay = useRelay();
  const { item } = scored;
  const [menu, setMenu] = useState<"more" | "span" | null>(null);
  const giver = giverOf(item);
  const pressure = pressureOf(scored);
  const why = whyNow(scored.why);
  const DoorIcon = DOOR_ICON[door];

  // A shift chore's machines, every one of today's (the ticks are the ones
  // anyone makes on the shift strip: advisory, never owned).
  const parts =
    item.kind === "group"
      ? rows.filter((r) => r.kind !== "client" && r.templateId === item.group.templateId && r.shift === item.group.shift)
      : [];
  const clientName =
    item.kind === "ask" && item.request.clientId
      ? (() => {
          const c = relay.clients.find((x) => x.id === item.request.clientId);
          return c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : null;
        })()
      : item.kind === "client"
        ? item.row.clientName ?? null
        : null;

  const shown = (faces ?? []).slice(0, FACES_SHOWN);
  const rest = (faces ?? []).slice(FACES_SHOWN);

  return (
    <SwipeRow
      onSwipeRight={onDone}
      onSwipeLeft={onNotNow}
      rightLabel="Done"
      leftLabel="Not now"
      className="rbd-swipe"
      disabled={tracking}
    >
    <article className="rbd-dealt" aria-label={`Dealt to you: ${item.title}`}>
      <div className="rbd-dealt__top">
        <span className="rbd-giver">
          <span className="rbd-giver__face" aria-hidden>
            {giver.person ? initialsOf(giver.name) : <SprayCan size={15} />}
          </span>
          <span className="rbd-giver__name">{giver.name}</span>
        </span>
        {pressure && <span className="rbd-hot">{pressure}</span>}
        <span className="rbd-dealt__door">
          <DoorIcon size={14} aria-hidden />
          {DOOR_LABEL[door]}
        </span>
      </div>
      <h3 className="rbd-dealt__title">{item.title}</h3>
      <p className="rbd-dealt__meta">
        {item.estMinutes != null && (
          <span>
            <Clock size={15} aria-hidden /> ~{item.estMinutes} min
          </span>
        )}
        <span>
          <MapPin size={15} aria-hidden /> {whereOf(item)}
        </span>
        {clientName && (
          <span>
            <UserRound size={15} aria-hidden /> {clientName}
          </span>
        )}
        {item.kind === "group" && parts.length > 1 && (
          <span>
            <CalendarClock size={15} aria-hidden /> {parts.filter((r) => r.status !== "open").length} of {parts.length} done
          </span>
        )}
      </p>
      {why && (
        <p className="rbd-dealt__why">
          <b>Why now:</b> {why}
        </p>
      )}
      {scored.fits === false && relay.now.gapMinutes !== null && (
        <p className="rbd-dealt__foot">Longer than the {relay.now.gapMinutes} minutes before your next session.</p>
      )}
      {parts.length > 1 && (
        <div className="rbd-parts" role="group" aria-label="Its machines">
          {parts.map((r) => {
            const on = r.status !== "open";
            return (
              <button
                key={r.id}
                type="button"
                className={cn("rbd-part", on && "rbd-part--on")}
                aria-pressed={on}
                disabled={actions.busyIds.has(r.id)}
                onClick={() => void (on ? actions.reopen(r) : actions.complete(r))}
              >
                <span className="rbd-part__box" aria-hidden>
                  {on && <Check size={13} />}
                </span>
                <span className="rbd-part__t">{r.machineName ?? r.title}</span>
              </button>
            );
          })}
        </div>
      )}
      {named && (
        <p className="rbd-dealt__named">
          <b>{named.split(" ")[0]} has it</b> <span className="rbd-mute">(a heads-up, not a lock: anyone may still do it)</span>
        </p>
      )}
      {tracking ? (
        <div className="rbd-state">
          <Crosshair size={17} aria-hidden />
          <span>
            <b>You're on it.</b> It rides in the header on every tab until it's done.
          </span>
          <button type="button" className="rbd-link" onClick={onStopTracking}>
            Stop tracking
          </button>
        </div>
      ) : (
        <div className="rbd-acts">
          <button type="button" className="rbd-btn rbd-btn--primary" onClick={onTake}>
            {named ? "Help too" : primaryWord(item)}
          </button>
          <button type="button" className="rbd-btn" onClick={onNotNow}>
            Not now
          </button>
          {onDone && (
            <button type="button" className="rbd-btn" onClick={onDone}>
              <Check size={16} aria-hidden /> Done
            </button>
          )}
          {onCant && (
            <button type="button" className="rbd-btn" onClick={onCant}>
              I can't
            </button>
          )}
          <span className="rbd-acts__note">"Not now" leaves no trace. A swipe does the same, with an Undo.</span>
        </div>
      )}
      {faces && faces.length > 0 && onName && (
        <div className="rwho" role="group" aria-label="Who? Put a name on it">
          <span className="rwho__l">
            Who?
            <span className="rwho__hint">a name is a heads-up, not a lock</span>
          </span>
          <span className="rwho__faces">
            {shown.map((f) => (
              <button
                key={f.id}
                type="button"
                className="rwho__face"
                aria-label={`Put ${f.name} on it: ${f.reason}`}
                onClick={() => onName(f)}
              >
                <span className="rwho__av" aria-hidden>
                  {initialsOf(f.name)}
                </span>
                <span className="rwho__name">
                  {f.name.split(" ")[0]}
                  <span className="rwho__why">{f.reason}</span>
                </span>
              </button>
            ))}
            {rest.length > 0 && (
              <span className="rwho__wrap">
                <button
                  type="button"
                  className="rwho__more"
                  aria-haspopup="menu"
                  aria-expanded={menu === "more"}
                  aria-label={`Everyone else: ${rest.length} more`}
                  onClick={() => setMenu((m) => (m === "more" ? null : "more"))}
                >
                  +{rest.length}
                </button>
                {menu === "more" && (
                  <span className="rwho__pop" role="menu" aria-label="Everyone else">
                    {rest.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        role="menuitem"
                        className="rwho__pop-item"
                        onClick={() => {
                          setMenu(null);
                          onName(f);
                        }}
                      >
                        <span className="rwho__av" aria-hidden>
                          {initialsOf(f.name)}
                        </span>
                        <span className="rwho__name">
                          {f.name}
                          <span className="rwho__why">{f.reason}</span>
                        </span>
                      </button>
                    ))}
                  </span>
                )}
              </span>
            )}
            {item.kind === "group" && onSpan && (
              <span className="rwho__wrap">
                <button
                  type="button"
                  className="rwho__span"
                  aria-haspopup="menu"
                  aria-expanded={menu === "span"}
                  aria-label={`How long a name lasts: ${NAME_SPANS.find((s) => s.days === span)?.label}`}
                  onClick={() => setMenu((m) => (m === "span" ? null : "span"))}
                >
                  {NAME_SPANS.find((s) => s.days === span)?.label}
                  <ChevronDown size={16} aria-hidden />
                </button>
                {menu === "span" && (
                  <span className="rwho__pop" role="menu" aria-label="How long a name lasts">
                    {NAME_SPANS.map((s) => (
                      <button
                        key={s.days}
                        type="button"
                        role="menuitemradio"
                        aria-checked={s.days === span}
                        className="rwho__pop-item"
                        onClick={() => {
                          setMenu(null);
                          onSpan(s.days);
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                    <span className="rwho__pop-note" role="none">
                      Then it ends by itself. Nothing is locked.
                    </span>
                  </span>
                )}
              </span>
            )}
          </span>
        </div>
      )}
    </article>
    </SwipeRow>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ------------------------------------------------------------------ *
 * Team today — the day's chores for the whole studio, by chore
 * ------------------------------------------------------------------ */

/**
 * "Wipe-down round · 12 of 19", "Deep clean · nobody on it yet", "Opening
 * walk-through · all 12 done by 6:48 AM", "Asks answered · 2 today, 1 kept in
 * the Playbook". The studio's work today, one line a chore (team-today.ts;
 * by chore since the second wave of the Relay room, Sep 28 2026: it was three
 * lines by part of the day). A name only ever says who is on an open chore;
 * nobody is counted.
 */
export function TeamToday({ rows, answered = [], keptToday = 0 }: { rows: TaskRow[]; answered?: TaskRequest[]; keptToday?: number }) {
  const relay = useRelay();
  const { lines, more } = teamTodayLines({ rows, answered, keptToday, todayKey: relay.now.todayKey });
  if (lines.length === 0) return null;
  const closingLater = relay.now.nowMin < relay.now.hours.closing && shiftRings(rows).some((r) => r.phase === "closing" && r.total > 0);
  return (
    <section className="rbd-team" aria-label="Team today">
      <h3 className="rbd-h rbd-h--small">
        Team today<span className="rbd-h__sub">by chore</span>
      </h3>
      <ul className="rbd-team__list">
        {lines.map((l) => (
          <li key={l.key} className="rbd-team__row">
            <span className="rbd-team__t">
              {l.label}
              <span className="rbd-mute"> · {l.state}</span>
            </span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="rbd-team__more">{more === 1 ? "and 1 more chore" : `and ${more} more chores`}, behind Floor work.</p>}
      {closingLater && <p className="rbd-team__more">Closing chores open at {minutesToClock(relay.now.hours.closing)}.</p>}
    </section>
  );
}
