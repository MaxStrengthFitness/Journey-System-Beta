import { useCallback, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { cn } from "../../../lib/utils";
import { notify } from "../../notifications";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import { resolveRequest, setRequestClaim, type TaskRequest } from "../../studio-tasks/requests";
import type { ClientTaskAction } from "../../studio-tasks/types";
import type { TaskActions } from "../../studio-tasks/useTaskActions";
import type { ShiftGroup } from "../../studio-tasks/board";
import type { TeamJob } from "../jobs/types";
import { useRelay } from "./RelayContext";
import { snooze } from "./next-up";
import { trackItem } from "./tracked";
import type { BoardItem } from "./doors";

/**
 * WHAT A CARD'S BUTTONS DO — the Board's dealt card and the rows under it
 * (Relay room, Sep 28 2026). These were Next up's (NextUpQueue, Sep 16),
 * which the Board replaced; the writes are the same ones, word for word.
 *
 *   Take it     a shift chore opens beside the board with its machines to
 *               tick, and your name goes on it (an advisory claim: anyone may
 *               still tick); a client task opens the client's flow; an ask is
 *               claimed and opens with a Done at its foot; a team job opens
 *               its sheet. Whatever you take rides in the header's Tracking
 *               chip until it is done (tracked.ts). An initiative is
 *               everyone's, so it is never claimed: Take it shows the
 *               initiative's card, where "Log mine" is.
 *   Done        closes it (a group's open machines, a client task, an ask).
 *   Not now     passes it over for the rest of this shift phase, on this
 *               iPad. Nothing is written and nobody sees it.
 *
 * No card is ever owned: a claim is a heads-up, never a lock.
 */
export interface CardActionsArgs {
  actions: TaskActions;
  author: TaskAuthor | null;
  onOpenJob: (job: TeamJob) => void;
  onOpenClientTask?: (clientId: string, action?: ClientTaskAction) => void;
  /** Show an initiative's card (behind From leadership), where "Log mine" is. */
  onShowInitiative?: (request: TaskRequest) => void;
}

export interface CardActions {
  take: (item: BoardItem) => void;
  done: (item: BoardItem) => void;
  notNow: (item: BoardItem) => void;
}

export function useCardActions({ actions, author, onOpenJob, onOpenClientTask, onShowInitiative }: CardActionsArgs): CardActions {
  const relay = useRelay();
  const { success: toastSuccess, error: toastError } = useToast();

  const claimAsk = useCallback(
    async (r: TaskRequest) => {
      if (!relay.studioId || !author) return;
      if (r.claimedBy?.id === author.id) return;
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
    },
    [relay.studioId, author, toastError],
  );

  const closeAsk = useCallback(
    async (r: TaskRequest, note: string) => {
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
    },
    [relay, author, toastSuccess, toastError],
  );

  const openAsk = useCallback(
    (r: TaskRequest) => {
      void claimAsk(r);
      relay.openPanel({
        kicker: r.forId ? "Handed to you" : "An ask on the board",
        title: r.title,
        body: <AskDetail request={r} />,
        foot: <AskFoot request={r} onClose={closeAsk} />,
      });
    },
    [claimAsk, closeAsk, relay],
  );

  const openGroup = useCallback(
    (g: ShiftGroup) => {
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
    },
    [relay, actions, author],
  );

  const take = useCallback(
    (item: BoardItem) => {
      if (item.kind === "initiative") {
        onShowInitiative?.(item.request);
        return;
      }
      // Taking it puts it in the header's Tracking chip until it is done
      // (tracked.ts); the Board keeps the count current.
      trackItem(relay.studioId, relay.now.todayKey, { id: item.id, title: item.title, done: null, total: null });
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
    },
    [relay.studioId, relay.now.todayKey, openGroup, openAsk, onOpenJob, onOpenClientTask, onShowInitiative],
  );

  const done = useCallback(
    (item: BoardItem) => {
      switch (item.kind) {
        case "group":
          return void actions.completeGroup(item.group);
        case "client":
          return void actions.complete(item.row);
        case "ask":
          return void closeAsk(item.request, "");
        case "job":
          return onOpenJob(item.job);
        case "initiative":
          return onShowInitiative?.(item.request);
      }
    },
    [actions, closeAsk, onOpenJob, onShowInitiative],
  );

  const notNow = useCallback(
    (item: BoardItem) => {
      if (!relay.studioId) return;
      snooze(relay.studioId, relay.now.todayKey, relay.now.phase, item.id);
    },
    [relay.studioId, relay.now.todayKey, relay.now.phase],
  );

  return { take, done, notNow };
}

/* ------------------------------------------------------------------ *
 * Panel bodies (the Context Panel beside the board)
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
      <p className="rk-hint">Replies and the whole thread are under Help a teammate.</p>
    </>
  );
}

function AskFoot({ request, onClose }: { request: TaskRequest; onClose: (r: TaskRequest, note: string) => Promise<void> }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="nu__foot">
      <input className="rk-input" placeholder="A closing note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
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
