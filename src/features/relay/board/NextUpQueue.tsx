import { useMemo, useState } from "react";
import { ArrowRight, Check, Dumbbell, ExternalLink, Hand, MoreHorizontal, UserRound, X } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { cn } from "../../../lib/utils";
import { notify } from "../../notifications";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import { resolveRequest, setRequestClaim, type TaskRequest } from "../../studio-tasks/requests";
import type { ClientTaskAction, TaskRow } from "../../studio-tasks/types";
import type { TaskActions } from "../../studio-tasks/useTaskActions";
import type { ShiftGroup } from "../../studio-tasks/board";
import type { TeamJob } from "../jobs/types";
import { useRelay } from "./RelayContext";
import { SwipeRow } from "./SwipeRow";
import { emptyPrompt, nextUp, snooze, snoozedIds, type NextUpItem, type NextUpScored } from "./next-up";

/**
 * NEXT UP — the three cards at the top of the Floor.
 *
 * Round: Relay, Sep 2026. The ranking is next-up.ts (pure, tested); this is
 * the cards. Each has one button — DO IT — whose meaning follows the kind:
 * a shift group opens in the Context Panel with its rows to tick; a client
 * task opens the client's flow; an ask is claimed and opened in the panel
 * with a Done at its foot; a team job opens its sheet. Swipe right is Done,
 * swipe left is Not me (snoozed to the next shift phase, nothing written),
 * long-press is the quick menu.
 *
 * No card is ever owned: "Do it" writes a claim, which the rules call
 * advisory, and anyone may still close the work.
 */
export interface NextUpQueueProps {
  rows: TaskRow[];
  jobs: TeamJob[];
  requests: TaskRequest[];
  actions: TaskActions;
  author: TaskAuthor | null;
  onOpenJob: (job: TeamJob) => void;
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
  loading: boolean;
}

export function NextUpQueue({ rows, jobs, requests, actions, author, onOpenJob, onOpenClientTask, loading }: NextUpQueueProps) {
  const relay = useRelay();
  const { success: toastSuccess, error: toastError } = useToast();
  const [snoozeTick, setSnoozeTick] = useState(0);

  const lastSession = useMemo(() => {
    // The session that just ended, if one ended in the last hour.
    const ended = relay.now.sessions.filter((s) => s.endMin <= relay.now.nowMin && relay.now.nowMin - s.endMin <= 60);
    return ended[ended.length - 1] ?? null;
  }, [relay.now]);
  const lastMachineIds = useMemo(() => {
    if (!lastSession?.clientId) return [];
    const s = relay.sessions.find((x) => x.clientId === lastSession.clientId);
    return s?.sessionMachineIds ?? [];
  }, [relay.sessions, lastSession]);

  const scored: NextUpScored[] = useMemo(() => {
    void snoozeTick;
    return nextUp({
      rows,
      jobs,
      requests,
      trainerId: author?.id ?? null,
      uid: relay.uid,
      todayKey: relay.now.todayKey,
      gapMinutes: relay.now.gapMinutes,
      lastClientId: lastSession?.clientId ?? null,
      lastMachineIds,
      snoozed: snoozedIds(relay.studioId, relay.now.todayKey, relay.now.phase),
    });
  }, [rows, jobs, requests, author?.id, relay.uid, relay.now, relay.studioId, lastSession, lastMachineIds, snoozeTick]);

  const notMe = (item: NextUpItem) => {
    if (!relay.studioId) return;
    snooze(relay.studioId, relay.now.todayKey, relay.now.phase, item.id);
    setSnoozeTick((v) => v + 1);
  };

  const claimAsk = async (r: TaskRequest) => {
    if (!relay.studioId || !author) return;
    const already = r.claimedBy?.id === author.id;
    if (already) return;
    try {
      await setRequestClaim({ studioId: relay.studioId, requestId: r.id, author, claimed: true });
      await notify({
        to: r.createdBy.id,
        actor: author,
        kind: "request-claimed",
        title: `${author.name} picked up "${r.title}"`,
        studioId: relay.studioId,
        link: { view: "studio-tasks" },
      });
    } catch (err) {
      console.warn("[relay] claim failed:", err);
      toastError("Could not claim that. Check your connection.");
    }
  };

  const closeAsk = async (r: TaskRequest, note: string) => {
    if (!relay.studioId || !author) return;
    try {
      await resolveRequest({ studioId: relay.studioId, requestId: r.id, author, resolution: note.trim() || undefined });
      await notify({
        to: r.createdBy.id,
        actor: author,
        kind: "request-resolved",
        title: `${author.name} closed "${r.title}"`,
        body: note.trim() || undefined,
        studioId: relay.studioId,
        link: { view: "studio-tasks" },
      });
      toastSuccess("Closed — they'll see your note on their card.");
      relay.closePanel();
    } catch (err) {
      console.warn("[relay] close failed:", err);
      toastError("Could not close that. Check your connection.");
    }
  };

  const openAsk = (r: TaskRequest) => {
    void claimAsk(r);
    relay.openPanel({
      kicker: r.forId ? "Handed to you" : "On the Floor",
      title: r.title,
      body: <AskDetail request={r} />,
      foot: <AskFoot request={r} onClose={closeAsk} />,
    });
  };

  const openGroup = (g: ShiftGroup) => {
    relay.openPanel({
      kicker: "The shift",
      title: g.title,
      body: <GroupDetail group={g} actions={actions} />,
      foot: (
        <button
          type="button"
          className="pl__btn pl__btn--primary"
          onClick={() => {
            void actions.completeGroup(g);
            relay.closePanel();
          }}
        >
          <Check size={14} aria-hidden /> Mark all {g.total - g.done}
        </button>
      ),
    });
    if (author && !g.claimedBy) void actions.toggleClaimGroup(g);
  };

  const doIt = (s: NextUpScored) => {
    const { item } = s;
    switch (item.kind) {
      case "group":
        return openGroup(item.group);
      case "client": {
        const t = item.row.template.target;
        if (t.kind === "client" && t.clientId && onOpenClientTask) onOpenClientTask(t.clientId, t.action);
        return;
      }
      case "ask":
        return openAsk(item.request);
      case "job":
        return onOpenJob(item.job);
    }
  };

  const done = (s: NextUpScored) => {
    const { item } = s;
    switch (item.kind) {
      case "group":
        return void actions.completeGroup(item.group);
      case "client":
        return void actions.complete(item.row);
      case "ask":
        return void closeAsk(item.request, "");
      case "job":
        return onOpenJob(item.job);
    }
  };

  const prompt = emptyPrompt(relay.now.gapMinutes, relay.now.next?.clientName.split(" ")[0] ?? null);

  return (
    <section className="nu" aria-label="Next up">
      <header className="rl-h">
        <h2 className="rl-h__title">Next up</h2>
        <span className="rl-h__sub">
          {relay.now.gapMinutes === null ? "for you" : `fits your ${relay.now.gapMinutes} min`}
        </span>
      </header>
      {loading && scored.length === 0 ? (
        <p className="sh__loading">Looking at the Floor…</p>
      ) : scored.length === 0 ? (
        <div className="rl-prompt">
          <span className="rl-prompt__text">
            <span className="rl-prompt__title">{prompt.title}</span>
            {prompt.body}
          </span>
          <button type="button" className="pl__btn" onClick={() => relay.openCapture({ destination: "floor" })}>
            Capture
          </button>
        </div>
      ) : (
        <ul className="nu__list">
          {scored.map((s) => (
            <li key={s.item.id}>
              <NextUpCard scored={s} onDo={() => doIt(s)} onDone={() => done(s)} onNotMe={() => notMe(s.item)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function entityOf(item: NextUpItem): { icon: typeof Dumbbell; label: string } | null {
  switch (item.kind) {
    case "group":
      return item.group.rows[0]?.template.kind === "machine"
        ? { icon: Dumbbell, label: item.group.total > 1 ? `${item.group.total} machines` : (item.group.rows[0].machineName ?? "Machine") }
        : null;
    case "client":
      return item.row.clientName ? { icon: UserRound, label: item.row.clientName } : null;
    case "ask":
      return item.request.clientId ? { icon: UserRound, label: "A client" } : item.request.machineId ? { icon: Dumbbell, label: "A machine" } : null;
    case "job":
      return item.job.about.kind === "client"
        ? { icon: UserRound, label: Object.values(item.job.about.clientNames).slice(0, 2).join(", ") }
        : item.job.about.kind === "machine"
          ? { icon: Dumbbell, label: `${item.job.about.machineIds.length || "Every"} machine${item.job.about.machineIds.length === 1 ? "" : "s"}` }
          : null;
  }
}

function NextUpCard({ scored, onDo, onDone, onNotMe }: { scored: NextUpScored; onDo: () => void; onDone: () => void; onNotMe: () => void }) {
  const relay = useRelay();
  const [menu, setMenu] = useState(false);
  const { item, why, fits } = scored;
  const entity = entityOf(item);
  const progress = item.kind === "group" ? `${item.group.done} of ${item.group.total}` : null;
  const verb = item.kind === "client" || item.kind === "job" ? "Open" : "Do it";

  return (
    <SwipeRow
      onSwipeRight={onDone}
      onSwipeLeft={onNotMe}
      onLongPress={() => setMenu(true)}
      rightLabel={item.kind === "job" ? "Open" : "Done"}
      className="nu__row"
    >
      <article className={cn("nu__card", `nu__card--${item.origin}`)}>
        <div className="nu__main">
          <div className="nu__top">
            <span className={cn("rl-origin", `rl-origin--${item.origin}`)}>{item.origin === "mine" ? "Handed to you" : "Floor"}</span>
            {item.estMinutes != null && (
              <span className={cn("rl-dur", fits === true && "rl-dur--fits", fits === false && "rl-dur--tight")}>~{item.estMinutes} min</span>
            )}
          </div>
          <h3 className="nu__title">{item.title}</h3>
          <p className="nu__meta">
            {entity && (
              <span className="nu__entity">
                <entity.icon size={12} aria-hidden /> {entity.label}
              </span>
            )}
            {progress && <span>{progress} done</span>}
            {why.length > 0 && <span className="nu__why">{why.join(" · ")}</span>}
          </p>
        </div>
        <div className="nu__actions">
          <button type="button" className="nu__do" onClick={onDo}>
            {verb} <ArrowRight size={14} aria-hidden />
          </button>
          <button type="button" className="nu__more" aria-label="More" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <MoreHorizontal size={16} aria-hidden />
          </button>
        </div>
        {menu && (
          <div className="nu__menu" role="menu">
            <button type="button" role="menuitem" onClick={() => { setMenu(false); onDo(); }}>
              <ArrowRight size={13} aria-hidden /> {verb}
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); relay.openCapture({ destination: "someone", text: item.title }); }}>
              <Hand size={13} aria-hidden /> Hand to…
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); relay.openCapture({ destination: "me", text: item.title, estMinutes: item.estMinutes }); }}>
              <UserRound size={13} aria-hidden /> Save to Mine
            </button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); onNotMe(); }}>
              <X size={13} aria-hidden /> Not me
            </button>
          </div>
        )}
      </article>
    </SwipeRow>
  );
}

/* ------------------------------------------------------------------ *
 * Panel bodies
 * ------------------------------------------------------------------ */

function AskDetail({ request: r }: { request: TaskRequest }) {
  const relay = useRelay();
  const client = r.clientId ? relay.clients.find((c) => c.id === r.clientId) : null;
  return (
    <>
      <p className="nu__by">
        Asked by <strong>{r.createdBy.name}</strong>
        {r.dueOn && <> · wanted by {r.dueOn}</>}
        {r.claimedBy && <> · {r.claimedBy.name} is on it</>}
      </p>
      {r.detail && <p className="nu__detail">{r.detail}</p>}
      {client && relay.onOpenClientTask && (
        <button type="button" className="pl__btn" onClick={() => relay.onOpenClientTask?.(client.id)}>
          <ExternalLink size={13} aria-hidden /> {client.firstName} {client.lastName}
        </button>
      )}
      <p className="pk-hint">Comments and the full thread are on the board below.</p>
    </>
  );
}

function AskFoot({ request, onClose }: { request: TaskRequest; onClose: (r: TaskRequest, note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="nu__foot">
      <input className="pk-input" placeholder="A closing note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      <button
        type="button"
        className="pl__btn pl__btn--primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onClose(request, note);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Check size={14} aria-hidden /> Done
      </button>
    </div>
  );
}

function GroupDetail({ group, actions }: { group: ShiftGroup; actions: TaskActions }) {
  return (
    <ul className="nu__rows">
      {group.rows.map((r) => {
        const on = r.status !== "open";
        return (
          <li key={r.id}>
            <button
              type="button"
              className={cn("nu__rowtick", on && "nu__rowtick--on")}
              aria-pressed={on}
              disabled={actions.busyIds.has(r.id)}
              onClick={() => void (on ? actions.reopen(r) : actions.complete(r))}
            >
              <span className="nu__tick" aria-hidden>{on && <Check size={12} />}</span>
              <span>{r.machineName ?? r.title}</span>
              {r.instance?.completedBy && <span className="nu__who">{r.instance.completedBy.name.split(" ")[0]}</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
