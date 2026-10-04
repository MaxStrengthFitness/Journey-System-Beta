import { useCallback, useState } from "react";
import { Check, ExternalLink } from "lucide-react";
import { useToast } from "../../../contexts/ToastContext";
import { notify } from "../../notifications";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import type { TaskRequest } from "../../studio-tasks/requests";
import { answerAskWithTrail, hasTrail, journalAuthorOf } from "../../studio-tasks/question-trail";
import { useRelay } from "./RelayContext";

/**
 * CLOSING AN ASK — the one write the Board's box and the Tracker's Done make
 * on an ask (Relay room, Sep 28 2026; trimmed to it in the Relay Board
 * rebuild, Oct 3 2026, when the dealt card's Take it and Not now went: the
 * board is the plan, and nothing is dealt or passed over).
 *
 * A question about a client (phase 7, the open-questions trail) is answered
 * rather than closed: the answer and its line on her record are written by
 * the person doing it (studio-tasks/question-trail.ts). A notification's
 * actor is the Auth uid, which the rules pin it to.
 */
export function useCloseAsk(author: TaskAuthor | null): (r: TaskRequest, note: string) => Promise<void> {
  const relay = useRelay();
  const { success: toastSuccess, error: toastError } = useToast();
  const uid = relay.uid;
  const writerName = relay.authTrainer?.fullName ?? author?.name ?? null;
  const writerInitials = relay.authTrainer?.initials ?? null;
  return useCallback(
    async (r: TaskRequest, note: string) => {
      if (!relay.studioId || !author) return;
      try {
        const who = journalAuthorOf(uid, writerName, writerInitials);
        const trail = await answerAskWithTrail({ studioId: relay.studioId, request: r, author, answer: note, who });
        await notify({
          to: r.createdBy.id,
          actor: uid ? { id: uid, name: author.name } : null,
          kind: "request-resolved",
          title: `${author.name} ${r.kind === "question" ? "answered" : "closed"} "${r.title}"`,
          body: note.trim() || undefined,
          studioId: relay.studioId,
          link: { view: "studio-tasks" },
        });
        const her = clientFirstName(relay.clients, r);
        if (trail === "failed") toastError(`Answered on the Board, but ${her}'s record didn't take it, so it still shows there as open.`);
        else if (hasTrail(r)) toastSuccess(`Answered. It's on ${her}'s record, and the question there is closed.`);
        else toastSuccess("Closed — they'll see your note on their card.");
        relay.closePanel();
      } catch (err) {
        console.warn("[relay] close failed:", err);
        toastError("Could not close that. Check your connection.");
      }
    },
    [relay, author, uid, writerName, writerInitials, toastSuccess, toastError],
  );
}

/* ------------------------------------------------------------------ *
 * Panel bodies (the Context Panel beside the board)
 * ------------------------------------------------------------------ */

/** The first name of the client an ask is about, for a sentence; "the client" when it isn't known. */
export function clientFirstName(clients: readonly { id?: string; firstName?: string }[], r: Pick<TaskRequest, "clientId">): string {
  const c = r.clientId ? clients.find((x) => x.id === r.clientId) : null;
  return (c?.firstName ?? "").trim() || "the client";
}

export function AskDetail({ request: r }: { request: TaskRequest }) {
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
      {hasTrail(r) && (
        <p className="rk-hint">
          The question is on {client?.firstName ?? "the client"}'s record: who took it and the answer go there too, and the answer closes it.
        </p>
      )}
      <p className="rk-hint">Replies and the whole thread are on its card on the Board.</p>
    </>
  );
}

/**
 * The panel's foot: Done with an optional closing note, or, on a question,
 * the answer (a question closed with no words says so on her record, so the
 * button waits for the answer here; Done elsewhere still closes it).
 */
export function AskFoot({
  request,
  onClose,
  onTake,
}: {
  request: TaskRequest;
  onClose: (r: TaskRequest, note: string) => Promise<void>;
  /** Claims it: offered when it was opened to read and isn't yours yet (Oct 2 2026). */
  onTake?: () => Promise<void> | void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [taken, setTaken] = useState(false);
  const question = request.kind === "question";
  return (
    <div className="nu__foot">
      {onTake && !taken && (
        <button
          type="button"
          className="pl__btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onTake();
              setTaken(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          Take it
        </button>
      )}
      {question ? (
        <textarea
          className="rk-textarea"
          rows={2}
          aria-label="Your answer"
          placeholder="Your answer: what worked, so the next trainer knows"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
        />
      ) : (
        <input className="rk-input" placeholder="A closing note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      )}
      <button
        type="button"
        className="pl__btn pl__btn--primary"
        disabled={busy || (question && !note.trim())}
        onClick={async () => {
          setBusy(true);
          try {
            await onClose(request, note);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Check size={14} aria-hidden /> {question ? "Answer" : "Done"}
      </button>
    </div>
  );
}
