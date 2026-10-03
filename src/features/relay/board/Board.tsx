import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, Hand, UserRoundPlus, Undo2 } from "lucide-react";
import type { Client } from "../../../types";
import { useToast } from "../../../contexts/ToastContext";
import { notify } from "../../notifications";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import { setRequestFor, type TaskRequest } from "../../studio-tasks/requests";
import { journalAuthorOf, reopenAskWithTrail } from "../../studio-tasks/question-trail";
import type { ShiftGroup } from "../../studio-tasks/board";
import type { ClientTaskAction, StudioTaskCategory, TaskRow } from "../../studio-tasks/types";
import type { TaskActions } from "../../studio-tasks/useTaskActions";
import { RequestsLane } from "../../studio-tasks/RequestsLane";
import { studioRoster } from "../../studio-tasks/initiatives";
import { closeJob, leaveJob, joinJob, reopenJob } from "../jobs/mutations";
import type { TeamJob } from "../jobs/types";
import { useRelay } from "./RelayContext";
import { useCardActions } from "./card-actions";
import { whoFaces, type WhoFace } from "./who";
import { FocusBanner } from "./FocusBanner";
import { JustNow } from "./JustNow";
import { BoardCardView } from "./BoardCardView";
import {
  CARD_COLUMNS,
  CARD_PARTS,
  boardCards,
  cardsByColumn,
  partCount,
  partNow,
  waitingIn,
  type BoardCard,
  type CardPart,
} from "./cards";
import "./board.css";

/**
 * THE BOARD — Relay's first tab, rebuilt as the studio's day on one board
 * (the Relay Board rebuild, Oct 3 2026).
 *
 * AJ, Oct 3 2026: "this is replacing the laminated paper of a to-do list of
 * daily things to do at a studio. Right now, when I open this, I don't even
 * know what the heck to look at first ... I don't know what I can interact
 * with, what's not interactable, what's information." He picked, from three
 * directions and five card styles on a comparison page:
 *
 *   the board      the kamishibai board: the parts of the day across the top
 *                  (Opening · Between clients · Close · This week), one at a
 *                  time, in the bar joined under the header ("Tabs are the
 *                  header"); the columns are where the work happens (Floor ·
 *                  Desk · Clients · Team). It opens on the part it is now.
 *   the card       "Checkbox card": one card for every kind of work, with a
 *                  real box (./BoardCardView.tsx, the rules ./cards.ts).
 *   no pick        "No, the board is the plan": nothing is dealt, nothing
 *                  passed over; someone waiting sorts first in its column.
 *
 * Tapping a card's words opens the work beside the board (the Context
 * Panel): a chore's machines and "I'm on it", an ask whole (take it, answer,
 * the replies), an initiative's Log mine. A client task opens the client's
 * own flow; a team job its sheet. A leader puts a name on a chore or an ask
 * there ("leadership can just directly assign"); someone whose name is on
 * it says "I can't" there. Every tick, untick and pass-back has the
 * eight-second Undo. Since you were in rides in the header ("● 2 new"); Just
 * now is at the foot, with its hearts.
 *
 * Nothing here is stored of its own: every write is the one the work always
 * had (useTaskActions, the asks' trail, the jobs' mutations).
 */

export interface BoardProps {
  rows: TaskRow[];
  jobs: TeamJob[];
  /** Every open request, initiatives included. */
  requests: TaskRequest[];
  /** Asks closed recently: today's show as done. */
  resolved?: TaskRequest[];
  actions: TaskActions;
  author: TaskAuthor | null;
  onOpenJob: (job: TeamJob) => void;
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
  /** A leader puts a name on a chore (the host's AssignDialog). */
  onAssign?: (group: ShiftGroup) => void;
  /** The studio's own task categories: which chores are desk work. */
  categories?: StudioTaskCategory[];
  /** The studio's clients: renewal talks, and the asks' names. */
  clients?: Client[];
  /** The day's tasks are still loading. */
  loading: boolean;
  /** One of today's reads failed, so an empty board is unknown, never "nothing". */
  unknown?: boolean;
  /** What's new since you were in (./SinceYouWereIn.tsx as a pill), drawn in the header. */
  news?: ReactNode;
}

export function Board({
  rows,
  jobs,
  requests,
  resolved = [],
  actions,
  author,
  onOpenJob,
  onOpenClientTask,
  onAssign,
  categories,
  clients,
  loading,
  unknown = false,
  news,
}: BoardProps) {
  const relay = useRelay();
  const { now } = relay;
  const { success: toastSuccess, error: toastError } = useToast();
  const me = useMemo(() => new Set([relay.uid, author?.id].filter(Boolean) as string[]), [relay.uid, author?.id]);
  const writer = useMemo(
    () => journalAuthorOf(relay.uid, relay.authTrainer?.fullName ?? author?.name, relay.authTrainer?.initials),
    [relay.uid, relay.authTrainer?.fullName, relay.authTrainer?.initials, author?.name],
  );

  /* The cards, worked out once from what the Board already holds. */
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => setTick(Date.now()), [now.nowMin]);
  const cards = useMemo(
    () =>
      boardCards({
        rows,
        requests,
        resolved,
        jobs,
        clients: clients ?? relay.clients,
        studioId: relay.studioId,
        categories,
        uid: relay.uid,
        trainerId: author?.id ?? null,
        todayKey: now.todayKey,
        phase: now.phase,
        nowMs: tick,
      }),
    [rows, requests, resolved, jobs, clients, relay.clients, relay.studioId, categories, relay.uid, author?.id, now.todayKey, now.phase, tick],
  );

  /* The part of the day on show: the one it is now, until you pick another; a new phase brings it back. */
  const [part, setPart] = useState<CardPart>(() => partNow(now.phase));
  useEffect(() => setPart(partNow(now.phase)), [now.phase]);
  const columns = useMemo(() => cardsByColumn(cards, part), [cards, part]);
  const count = partCount(cards, part);
  const partLabel = CARD_PARTS.find((p) => p.id === part)?.label ?? "";

  /* Undo: one line at the foot of the Board, for eight seconds. */
  const [undo, setUndo] = useState<{ key: number; label: string; run: () => Promise<unknown> | void } | null>(null);
  const offerUndo = (label: string, run: () => Promise<unknown> | void) => setUndo({ key: Date.now(), label, run });
  const clearUndo = useCallback(() => setUndo(null), []);

  const cardActions = useCardActions({ actions, author, onOpenJob, onOpenClientTask });
  const failed = (err: unknown) => {
    console.warn("[relay] board write failed:", err);
    toastError("Could not change that. Check your connection.");
  };

  /* ---- the box ---- */

  const onBox = (card: BoardCard) => {
    const src = card.source;
    const done = card.state === "done";
    if (card.box === "open" && !done) return open(card);
    switch (src.kind) {
      case "group": {
        const g = src.group;
        if (done) {
          const closed = g.rows.filter((r) => r.status === "done");
          void Promise.all(closed.map((r) => actions.reopen(r))).catch(failed);
          offerUndo(`${card.title}: not done after all.`, () => Promise.all(closed.map((r) => actions.complete(r))));
        } else {
          const open = g.rows.filter((r) => r.status === "open");
          void actions.completeGroup(g);
          offerUndo(`${card.title}: done.`, () => Promise.all(open.map((r) => actions.reopen(r))));
        }
        return;
      }
      case "client": {
        const r = src.row;
        if (done) {
          void actions.reopen(r);
          offerUndo(`${card.title}: not done after all.`, () => actions.complete(r));
        } else {
          void actions.complete(r);
          // A task that needs a closing note asks for it first (its dialog): nothing was done yet.
          if (!r.template.requiresNote) offerUndo(`${card.title}: done.`, () => actions.reopen(r));
        }
        return;
      }
      case "ask": {
        const r = src.request;
        if (!relay.studioId) return;
        const studioId = relay.studioId;
        if (done) {
          void reopenAskWithTrail({ studioId, request: r, who: writer }).catch(failed);
          toastSuccess(`"${r.title}" is open again.`);
        } else {
          cardActions.done({ kind: "ask", id: card.id, request: r, title: r.title, estMinutes: null, origin: "floor" });
          offerUndo(`Closed "${r.title}".`, () => reopenAskWithTrail({ studioId, request: r, who: writer }));
        }
        return;
      }
      case "job": {
        const j = src.job;
        if (done) {
          void reopenJob(j).catch(failed);
          offerUndo(`${card.title}: open again.`, () => (author ? closeJob(j, author, "") : undefined));
        } else if (author) {
          void closeJob(j, author, "").catch(failed);
          offerUndo(`${card.title}: done.`, () => reopenJob(j));
        }
        return;
      }
      default:
        return open(card);
    }
  };

  /* ---- the words: the work, beside the board ---- */

  // The card whose work is open beside the board, so its panel follows the live documents.
  const [openId, setOpenId] = useState<string | null>(null);

  const people = useMemo(() => studioRoster(relay.trainers, relay.studioId), [relay.trainers, relay.studioId]);
  const faces = useMemo(
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

  /** A leader puts a name on an ask: it arrives already theirs, with one bell, as a hand-off always has. */
  const nameAsk = async (r: TaskRequest, face: WhoFace) => {
    if (!relay.studioId) return;
    const studioId = relay.studioId;
    try {
      await setRequestFor({ studioId, requestId: r.id, person: { id: face.id, name: face.name } });
      if (relay.uid) {
        await notify({
          to: face.id,
          actor: { id: relay.uid, name: relay.authTrainer?.fullName ?? author?.name ?? "A leader" },
          kind: "handoff",
          title: `${(relay.authTrainer?.fullName ?? author?.name ?? "A leader").split(" ")[0]} put your name on: ${r.title}`.slice(0, 200),
          studioId,
          link: { view: "studio-tasks", id: "mine" },
        });
      }
      toastSuccess(`${face.name.split(" ")[0]} has it.`);
      offerUndo(`${face.name.split(" ")[0]} has it.`, () => setRequestFor({ studioId, requestId: r.id, person: null }));
    } catch (err) {
      failed(err);
    }
  };

  /** "I can't" on work with your name on it: an ask goes back to the board, a job lets you step off, a chore asks the team. */
  const cantDo = async (card: BoardCard) => {
    const src = card.source;
    try {
      if (src.kind === "ask" && relay.studioId && src.request.forId) {
        const studioId = relay.studioId;
        const was = { id: src.request.forId, name: src.request.forName ?? author?.name ?? "You" };
        await setRequestFor({ studioId, requestId: src.request.id, person: null });
        offerUndo("Back on the board, for anyone to take.", () => setRequestFor({ studioId, requestId: src.request.id, person: was }));
      } else if (src.kind === "job" && author) {
        await leaveJob(src.job, author);
        offerUndo(`You stepped off "${card.title}".`, () => joinJob(src.job, author));
      } else {
        relay.openCapture({ destination: "floor", askKind: "help", text: `Can anyone take this? ${card.title}\nMy name is on it, and I can't get to it.` });
      }
      relay.closePanel();
    } catch (err) {
      failed(err);
    }
  };

  const panelFor = (card: BoardCard) => {
    const src = card.source;
    const kicker = `${CARD_PARTS.find((p) => p.id === card.part)?.label ?? ""} · ${CARD_COLUMNS.find((c) => c.id === card.column)?.label ?? ""}`;
    if (src.kind === "group") {
      const g = src.group;
      const mineClaim = Boolean(g.claimedBy && me.has(g.claimedBy.id));
      const assignedMe = Boolean(g.assignedTo && me.has(g.assignedTo.id));
      const openN = g.total - g.done;
      return {
        kicker,
        title: g.title,
        body: <GroupBody group={g} actions={actions} />,
        foot: (
          <div className="rbd-foot">
            {openN > 0 && (
              <button
                type="button"
                className="rbd-btn rbd-btn--primary"
                onClick={() => {
                  const open = g.rows.filter((r) => r.status === "open");
                  void actions.completeGroup(g);
                  offerUndo(`${g.title}: done.`, () => Promise.all(open.map((r) => actions.reopen(r))));
                  relay.closePanel();
                }}
              >
                <Check size={16} aria-hidden /> {openN === 1 ? "Done" : `Mark all ${openN} done`}
              </button>
            )}
            {openN > 0 && author && (
              <button type="button" className="rbd-btn" onClick={() => void actions.toggleClaimGroup(g)}>
                <Hand size={16} aria-hidden /> {mineClaim ? "Hand it back" : "I'm on it"}
              </button>
            )}
            {relay.canLead && onAssign && g.scope !== "personal" && openN > 0 && (
              <button type="button" className="rbd-btn" onClick={() => onAssign(g)}>
                <UserRoundPlus size={16} aria-hidden /> {g.assignedTo ? `${g.assignedTo.name.split(" ")[0]} has it · change` : "Put a name on it"}
              </button>
            )}
            {assignedMe && openN > 0 && (
              <button type="button" className="rbd-btn" onClick={() => void cantDo(card)}>
                I can't
              </button>
            )}
          </div>
        ),
      };
    }
    if (src.kind === "ask" || src.kind === "initiative") {
      const r = src.request;
      const named = src.kind === "ask" && r.forId && !me.has(r.forId) ? r.forName ?? null : null;
      return {
        kicker,
        title: r.title,
        tall: true,
        body: (
          <>
            <RequestsLane
              studioId={relay.studioId}
              author={author}
              currentUserId={author?.id ?? null}
              roster={people}
              clients={clients ?? relay.clients}
              onlyId={r.id}
            />
            {src.kind === "ask" && relay.canLead && card.state !== "done" && (
              <NameIt faces={faces} named={named} onName={(f) => void nameAsk(r, f)} />
            )}
          </>
        ),
        foot:
          src.kind === "ask" && r.forId && me.has(r.forId) && card.state !== "done" ? (
            <div className="rbd-foot">
              <button type="button" className="rbd-btn" onClick={() => void cantDo(card)}>
                I can't
              </button>
            </div>
          ) : undefined,
      };
    }
    return null;
  };

  function open(card: BoardCard) {
    const src = card.source;
    if (src.kind === "client") {
      const t = src.row.template.target;
      if (t.kind === "client" && t.clientId && onOpenClientTask) onOpenClientTask(t.clientId, t.action);
      return;
    }
    if (src.kind === "renewal") {
      if (src.client.id && onOpenClientTask) onOpenClientTask(src.client.id);
      return;
    }
    if (src.kind === "job") return onOpenJob(src.job);
    const content = panelFor(card);
    if (!content) return;
    setOpenId(card.id);
    relay.openPanel(content);
  }

  // The panel follows the live documents while it's open (a machine ticked, a claim taken).
  useEffect(() => {
    if (!openId) return;
    if (!relay.panel) {
      setOpenId(null);
      return;
    }
    const card = cards.find((c) => c.id === openId);
    const content = card ? panelFor(card) : null;
    if (content) relay.openPanel(content);
    // Only when the cards change: the panel's own content is what this sets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);
  useEffect(() => {
    if (openId && !relay.panel) setOpenId(null);
  }, [openId, relay.panel]);

  /* ---- the board ---- */

  const tabs = (
    <div className="pl__tabs rbt" role="tablist" aria-label="Parts of the day">
      {CARD_PARTS.map((p) => {
        const c = partCount(cards, p.id);
        const waiting = waitingIn(cards, p.id);
        const isNow = p.id === partNow(now.phase) && now.phase !== "closed";
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`rb-part-${p.id}`}
            aria-selected={part === p.id}
            aria-controls="rb-grid"
            className="pl__tab rbt__tab"
            onClick={() => setPart(p.id)}
          >
            {p.label}
            {isNow && <span className="rbt__now" aria-label="now" />}
            <span className="rbt__n">{c.total === 0 ? "0" : c.done === c.total ? "✓" : `${c.done}/${c.total}`}</span>
            {waiting > 0 && <span className="rbt__wait" aria-label={`${waiting} waiting`} />}
          </button>
        );
      })}
    </div>
  );

  const slots = relay.slots;
  const busy = (card: BoardCard) =>
    card.source.kind === "group"
      ? card.source.group.rows.some((r) => actions.busyIds.has(r.id))
      : card.source.kind === "client"
        ? actions.busyIds.has(card.source.row.id)
        : false;

  return (
    <div className="rbd">
      {slots?.subhead ? createPortal(tabs, slots.subhead) : tabs}
      {news && (slots?.news ? createPortal(news, slots.news) : <div className="rbd-news">{news}</div>)}

      <div className="rbd-status" role="status" aria-live="polite">
        <span>
          <b>{partLabel}</b> · {CARD_PARTS.find((p) => p.id === part)?.when}
        </span>
        {count.total > 0 && (
          <span className="rbd-status__n">
            {count.done} of {count.total} done
          </span>
        )}
      </div>
      {unknown && <p className="rbd-warn">Couldn't read all of today's work, so this may not be everything. It tries again on its own.</p>}

      {loading ? (
        <p className="rbd-quiet">Loading today…</p>
      ) : count.total === 0 && !unknown ? (
        <p className="rbd-empty">
          <b>Nothing for {partLabel === "This week" ? "the rest of the week" : partLabel.toLowerCase()}.</b>{" "}
          {relay.canLead ? "Add a studio task or a team job with +." : "Ask the team, or add something for yourself with +."}
        </p>
      ) : (
        <div className="rbg" id="rb-grid" role="tabpanel" aria-labelledby={`rb-part-${part}`}>
          {CARD_COLUMNS.map((col) => {
            const list = columns[col.id];
            return (
              <section key={col.id} className="rbg__col" aria-label={col.label}>
                <h2 className="rbd-h rbg__head">
                  {col.label}
                  {list.length > 0 && <span className="rbd-h__sub">{list.length}</span>}
                </h2>
                {list.length === 0 ? (
                  <p className="rbg__none">Nothing here</p>
                ) : (
                  list.map((c) => <BoardCardView key={c.id} card={c} busy={busy(c)} onBox={onBox} onOpen={open} />)
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="rbd-foot-notes">
        <FocusBanner />
        <JustNow studioId={relay.studioId} />
      </div>

      {undo && <UndoBar key={undo.key} label={undo.label} onUndo={() => void undo.run()} onGone={clearUndo} />}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * A chore's machines, each a tick anyone may make
 * ------------------------------------------------------------------ */

function GroupBody({ group, actions }: { group: ShiftGroup; actions: TaskActions }) {
  const named = group.assignedTo ? `${group.assignedTo.name.split(" ")[0]}'s today (a heads-up, not a lock: anyone may tick it).` : null;
  const on = group.claimedBy ? `${group.claimedBy.name.split(" ")[0]} is on it.` : group.claimedCount > 1 ? `${group.claimedCount} people are on it.` : null;
  return (
    <>
      {(named || on) && <p className="rbd-note">{[named, on].filter(Boolean).join(" ")}</p>}
      {group.rows.length > 1 ? (
        <ul className="rbd-parts" aria-label="Its parts">
          {group.rows.map((r) => {
            const done = r.status !== "open";
            return (
              <li key={r.id}>
                <button
                  type="button"
                  className="rbd-part"
                  aria-pressed={done}
                  disabled={actions.busyIds.has(r.id)}
                  onClick={() => void (done ? actions.reopen(r) : actions.complete(r))}
                >
                  <span className="rbd-part__box" aria-hidden>
                    {done && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className="rbd-part__t">{r.machineName ?? r.title}</span>
                  {r.instance?.completedBy && done && <span className="rbd-part__who">{r.instance.completedBy.name.split(" ")[0]}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        group.rows[0]?.template.detail && <p className="rbd-note">{group.rows[0].template.detail}</p>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * A leader's "Who?" on an ask (AJ, q5: "leadership can just directly assign")
 * ------------------------------------------------------------------ */

/** Faces shown before "+N more": a leader's whole small team fits. */
const FACES_SHOWN = 6;

function NameIt({ faces, named, onName }: { faces: WhoFace[]; named: string | null; onName: (face: WhoFace) => void }) {
  const [all, setAll] = useState(false);
  if (faces.length === 0) return null;
  const shown = all ? faces : faces.slice(0, FACES_SHOWN);
  return (
    <section className="rbd-who" aria-label="Put a name on it">
      <h3 className="rbd-h">
        Put a name on it
        <span className="rbd-h__sub">{named ? `${named.split(" ")[0]} has it now` : "a heads-up, not a lock"}</span>
      </h3>
      <div className="rbd-who__faces">
        {shown.map((f) => (
          <button key={f.id} type="button" className="rbd-who__face" aria-label={`Put ${f.name} on it: ${f.reason}`} onClick={() => onName(f)}>
            <span className="rbd-who__name">{f.name.split(" ")[0]}</span>
            <span className="rbd-who__why">{f.reason}</span>
          </button>
        ))}
        {!all && faces.length > FACES_SHOWN && (
          <button type="button" className="rbd-who__face" onClick={() => setAll(true)}>
            <span className="rbd-who__name">+{faces.length - FACES_SHOWN} more</span>
          </button>
        )}
      </div>
    </section>
  );
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
