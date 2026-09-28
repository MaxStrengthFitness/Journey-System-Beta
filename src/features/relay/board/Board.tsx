import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarClock,
  Check,
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
import type { TaskAuthor } from "../../studio-tasks/mutations";
import type { TaskRequest } from "../../studio-tasks/requests";
import type { ClientTaskAction, TaskRow } from "../../studio-tasks/types";
import type { TaskActions } from "../../studio-tasks/useTaskActions";
import type { TeamJob } from "../jobs/types";
import { forgetOnSignOut } from "../../sign-out/memory";
import { useRelay } from "./RelayContext";
import { emptyPrompt, snoozedIds } from "./next-up";
import { RING_LABEL, RING_PHASES, shiftRings } from "./rings";
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
}

export function Board({ rows, jobs, requests, actions, author, onOpenJob, onOpenClientTask, loading, behind }: BoardProps) {
  const relay = useRelay();
  const { now } = relay;
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
  const passOver = (s: BoardScored) => {
    cardActions.notNow(s.item);
    setPinned((p) => ({ ...p, [door]: undefined }));
    setSnoozeTick((t) => t + 1);
  };

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
          <JustNow studioId={relay.studioId} />
          <TeamToday rows={rows} />
        </aside>

        {later.length > 0 && (
          <section className="rbd-later" aria-label="Later today">
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
          </section>
        )}
      </div>

      <section className="rbd-behind" aria-label={`Behind ${DOOR_LABEL[door]}`}>
        <h2 className="rbd-h rbd-behind__h">Behind {DOOR_LABEL[door]}</h2>
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
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {relay.openRelayTab && (
              <button type="button" className="rbd-link" onClick={() => relay.openRelayTab?.("mine")}>
                Your own list, follow-ups and what's coming up are on Mine
                <ChevronRight size={16} aria-hidden />
              </button>
            )}
          </div>
        )}
        {behind(door)}
      </section>
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
  onStopTracking,
}: {
  scored: BoardScored;
  door: DoorId;
  rows: TaskRow[];
  actions: TaskActions;
  tracking: boolean;
  onTake: () => void;
  onNotNow: () => void;
  onStopTracking: () => void;
}) {
  const relay = useRelay();
  const { item } = scored;
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

  return (
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
            {primaryWord(item)}
          </button>
          <button type="button" className="rbd-btn" onClick={onNotNow}>
            Not now
          </button>
          <span className="rbd-acts__note">"Not now" leaves no trace.</span>
        </div>
      )}
    </article>
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
 * "Opening chores · 12 of 12 done". The rings the Floor used to draw, as
 * three lines: the studio's recurring work for each part of the day, never
 * a person's count.
 */
export function TeamToday({ rows }: { rows: TaskRow[] }) {
  const relay = useRelay();
  const rings = shiftRings(rows);
  if (rings.every((r) => r.total === 0)) return null;
  const opensAt = (phase: string) =>
    phase === "closing" && relay.now.nowMin < relay.now.hours.closing ? ` · opens at ${minutesToClock(relay.now.hours.closing)}` : "";
  return (
    <section className="rbd-team" aria-label="Team today">
      <h3 className="rbd-h rbd-h--small">
        Team today<span className="rbd-h__sub">by chore</span>
      </h3>
      <ul className="rbd-team__list">
        {RING_PHASES.map((phase) => {
          const r = rings.find((x) => x.phase === phase)!;
          if (r.total === 0) return null;
          return (
            <li key={phase} className="rbd-team__row">
              <span className="rbd-team__t">
                {RING_LABEL[phase]} chores
                <span className="rbd-mute">
                  {" "}
                  · {r.closed ? `all ${r.total} done` : `${r.done} of ${r.total}`}
                  {!r.closed && opensAt(phase)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
