/**
 * GOING ABOVE AND BEYOND — this client's gestures, from Idea to Planned to
 * Done, with who is doing each.
 *
 * The point of FORD is not the filing cabinet; it is the anniversary dinner
 * somebody actually paid for (README). So the page ends with what the team
 * intends to DO, and the same two moves the Delight queue offers: "I'll do
 * it" takes an idea (the signed-in person becomes its owner, by Auth uid) and
 * "Mark done" asks what actually happened — the sentence worth reading a year
 * from now. Both write through `setGestureStatus`, the one writer the Delight
 * queue uses too, so the two can never disagree.
 *
 * Ownership is a name someone takes, never one handed out. Owners' names are
 * written in full and never cut. Nothing here contacts anyone: people do the
 * gesture, the app only remembers it.
 */
import { useState } from "react";
import { Gift, Plus } from "lucide-react";
import { Btn, Card, Chip, TextInput, curly, type ChipTone } from "../../client-codex/kit";
import { GESTURE_STATUS_LABEL, shortDate, type FordEntry, type FordGestureStatus } from "../types";
import { setGestureStatus } from "../ford-write";
import type { ClientGestures } from "../page-model";

/** How many finished gestures show before "Show all N finished". */
export const FINISHED_SHOWN = 2;

const STATUS_TONE: Record<FordGestureStatus, ChipTone> = {
  idea: "neutral",
  planned: "neutral",
  done: "ok",
  declined: "neutral",
};

function metaOf(entry: FordEntry, now: Date): string {
  const opp = entry.opportunity!;
  if (opp.status === "idea") {
    return [entry.authorName?.trim(), shortDate(entry.occurredAt, now)].filter(Boolean).join(" · ");
  }
  const owner = opp.ownerName?.trim() || "No one has taken it yet";
  if (opp.status === "planned") {
    const forDay = shortDate(opp.plannedFor, now);
    return forDay ? `${owner} · for ${forDay}` : owner;
  }
  const at = shortDate(opp.doneAt, now) ?? shortDate(entry.updatedAt, now);
  return at ? `${owner} · ${at}` : owner;
}

function GestureRow({
  entry,
  now,
  clientId,
  me,
  onOpen,
}: {
  entry: FordEntry;
  now: Date;
  clientId: string;
  /** The signed-in person (Auth uid); null for a reader who may not write FORD. */
  me: { id: string; name: string } | null;
  onOpen: ((entry: FordEntry) => void) | null;
}) {
  const opp = entry.opportunity!;
  const [closing, setClosing] = useState(false);
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const move = async (status: FordGestureStatus, extras: Parameters<typeof setGestureStatus>[4]) => {
    setBusy(true);
    setFailed(false);
    const ok = await setGestureStatus(clientId, entry.id, opp, status, extras);
    setBusy(false);
    if (ok) setClosing(false);
    else setFailed(true);
  };

  const text = onOpen ? (
    <button type="button" className="fordpg-by__text" onClick={() => onOpen(entry)}>
      {opp.idea}
    </button>
  ) : (
    <span className="fordpg-by__text">{opp.idea}</span>
  );

  let action = null;
  if (me && opp.status === "idea") {
    action = (
      <Btn disabled={busy} onClick={() => void move("planned", { owner: me })}>
        I'll do it
      </Btn>
    );
  } else if (me && opp.status === "planned" && !closing) {
    action = (
      <Btn disabled={busy} onClick={() => setClosing(true)}>
        Mark done
      </Btn>
    );
  }

  return (
    <li className="fordpg-by" data-status={opp.status}>
      <span className="fordpg-by__status">
        <Chip tone={STATUS_TONE[opp.status]}>{GESTURE_STATUS_LABEL[opp.status]}</Chip>
      </span>
      <span className="fordpg-by__main">
        {text}
        <span className="fordpg-by__meta">{metaOf(entry, now)}</span>
        {opp.status === "done" && opp.outcome ? <span className="fordpg-by__outcome">{curly(opp.outcome)}</span> : null}
        {failed ? (
          <span className="fordpg-by__meta" role="alert">
            Not saved — still here, try again.
          </span>
        ) : null}
      </span>
      {action ? <span className="fordpg-by__act">{action}</span> : null}
      {closing && me ? (
        <div className="fordpg-by__close">
          <TextInput
            label="What actually happened?"
            value={outcome}
            placeholder="What actually happened? Worth a sentence."
            onChange={setOutcome}
          />
          <div className="fordpg-by__close-acts">
            <Btn
              variant="solid"
              disabled={busy}
              onClick={() => void move("done", { outcome, owner: opp.ownerTrainerId ? undefined : me })}
            >
              Done
            </Btn>
            <Btn variant="quiet" disabled={busy} onClick={() => setClosing(false)}>
              Not yet
            </Btn>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function AboveAndBeyond({
  gestures,
  known,
  now,
  clientId,
  me,
  onAddIdea,
  onOpen,
}: {
  gestures: ClientGestures;
  /** FORD answered. When it did not, an empty list is unknown, not "no ideas". */
  known: boolean;
  now: Date;
  clientId: string;
  /** The signed-in person (Auth uid, full name); null for a reader who may not write FORD. */
  me: { id: string; name: string } | null;
  /** A new detail with its gesture open; null for a reader who may not write FORD. */
  onAddIdea: (() => void) | null;
  onOpen: ((entry: FordEntry) => void) | null;
}) {
  const [allFinished, setAllFinished] = useState(false);
  const { open, finished } = gestures;
  const shownFinished = allFinished ? finished : finished.slice(0, FINISHED_SHOWN);
  const empty = open.length === 0 && finished.length === 0;

  return (
    <Card
      id="ford-beyond"
      eyebrow="Going above and beyond"
      icon={Gift}
      meta="Leaders see these across the studio in Operations → Delight queue"
      actions={
        onAddIdea ? (
          <Btn variant="live" icon={Plus} onClick={onAddIdea}>
            Add an idea
          </Btn>
        ) : null
      }
    >
      {empty ? (
        <p className="fordpg-quiet">
          {known
            ? "No ideas yet. When something deserves more than a question, add an idea."
            : "The ideas couldn't be read just now, so this isn't the same as none."}
        </p>
      ) : (
        <ul className="fordpg-beyond">
          {[...open, ...shownFinished].map((entry) => (
            <GestureRow key={entry.id} entry={entry} now={now} clientId={clientId} me={me} onOpen={onOpen} />
          ))}
        </ul>
      )}
      {finished.length > FINISHED_SHOWN ? (
        <div>
          <Btn variant="quiet" aria-expanded={allFinished} onClick={() => setAllFinished((v) => !v)}>
            {allFinished ? "Show fewer" : `Show all ${finished.length} finished`}
          </Btn>
        </div>
      ) : null}
    </Card>
  );
}
