/**
 * IN ONE LINE — the sentence at the top of the FORD page (`one-line.ts`).
 *
 * "Retired hygienist, pickleball regular, walking the Camino with Tom in
 * May." The one sentence a new trainer should read first. It is the TEAM's:
 * anyone at her home studio may rewrite it, it saves the moment Save is
 * tapped (it is FORD, not a record field, so the Save bar has nothing to do
 * with it), and the line under it says who wrote it last. Previous versions
 * are not kept — last writer wins, and says so.
 *
 * WHAT IT SAYS, BY STATE. The line is FORD text, so:
 *   - ready: the line, or "No line yet." and a way to write one;
 *   - loading: "Loading…";
 *   - failed: that it couldn't be read — never "No line yet", and no editor:
 *     saving blind would replace a line nobody on this iPad can see (a detail
 *     is added beside the others; the line is REPLACED, so a failed read
 *     stops it where it does not stop "Add");
 *   - refused (a cross-train visitor, or nobody may read FORD here): the
 *     panel is not drawn at all — the page's notice already says whose FORD
 *     it is.
 *
 * Saving an empty box clears the line. A save that fails keeps the words and
 * says so — and says which kind of failure it was: "try again" only when
 * trying again can work. A FIRST line refused by the rules is almost always
 * a client who moved home studio, whose old line (stamped with the earlier
 * studio) is in the way where this studio can neither see nor replace it
 * (`OneLineSaveResult` in ford-write.ts); that says so, and who can clear it.
 * The input stops at 120 characters, and a paste is cut there too. "Saved"
 * shows for a moment, and goes at once if the line changes under it.
 */
import { useEffect, useState } from "react";
import { Quote as QuoteIcon, PenLine } from "lucide-react";
import { Btn, Card, Meta, TextInput } from "../../client-codex/kit";
import type { OneLineSaveResult } from "../ford-write";
import type { FordEntry } from "../types";
import type { FordPageStatus } from "../page-model";
import { ONE_LINE_MAX, normaliseOneLine, oneLineMeta, oneLineView } from "../one-line";

/** How long "Saved" stays up after a save, in milliseconds. */
export const ONE_LINE_SAVED_MS = 2500;

/** What the panel says when a first line was refused (`blocked`). */
export const ONE_LINE_BLOCKED =
  "Not saved. This client may still have a line from an earlier home studio, which this studio can't see or replace, so trying again won't help. An administrator can clear it, and then the line can be written here.";

export function OneLinePanel({
  oneLine,
  status,
  now,
  onSave,
}: {
  /** The line the tab's one FORD stream delivered (`useClientFord().oneLine`). */
  oneLine: FordEntry | null;
  status: FordPageStatus;
  now: Date;
  /**
   * Saves the line (`saveFordOneLine`); anything but "saved" means nothing
   * was written. Null for a reader who may not write FORD: the line is then
   * read only.
   */
  onSave: ((text: string, existing: FordEntry | null) => Promise<OneLineSaveResult>) | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<OneLineSaveResult | null>(null);
  /** The words the last save wrote: "Saved" belongs to them and no others. */
  const [savedText, setSavedText] = useState<string | null>(null);

  // "Saved" is a moment, not a state: it goes after a short while.
  useEffect(() => {
    if (result !== "saved") return;
    const t = window.setTimeout(() => setResult(null), ONE_LINE_SAVED_MS);
    return () => window.clearTimeout(t);
  }, [result]);

  if (status === "off" || status === "denied") return null;

  const view = status === "ready" ? oneLineView(oneLine) : null;
  // A line is only rewritten over one this iPad has read.
  const canWrite = onSave !== null && status === "ready";

  const open = () => {
    setDraft(view?.text ?? "");
    setResult(null);
    setEditing(true);
  };

  const save = async () => {
    if (!onSave || busy) return;
    setBusy(true);
    setResult(null);
    let outcome: OneLineSaveResult = "failed";
    try {
      outcome = await onSave(draft, oneLine);
    } catch {
      outcome = "failed";
    }
    setBusy(false);
    if (outcome === "saved") {
      setEditing(false);
      setSavedText(normaliseOneLine(draft));
    }
    setResult(outcome);
  };

  // Another trainer's rewrite arriving while "Saved" is up takes it down: it
  // would otherwise sit under words this iPad did not save.
  const showSaved = result === "saved" && !editing && (view === null || view.text === savedText);

  let body;
  if (editing && canWrite) {
    body = (
      <div className="fordpg-line__edit">
        <TextInput
          // Not "In one line" again: the card's eyebrow already says that.
          label="The sentence"
          value={draft}
          maxLength={ONE_LINE_MAX}
          placeholder={`e.g. "Retired hygienist, pickleball regular, walking the Camino in May"`}
          hint="One sentence, up to 120 characters. Anyone on the team can rewrite it, and it saves straight away."
          onChange={setDraft}
          disabled={busy}
        />
        <div className="fordpg-line__acts">
          <Btn variant="solid" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </Btn>
          <Btn
            variant="quiet"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setResult(null);
            }}
          >
            Cancel
          </Btn>
        </div>
        {result === "failed" ? (
          <p className="fordpg-line__note" role="alert">
            Not saved — still here, try again.
          </p>
        ) : result === "blocked" ? (
          <p className="fordpg-line__note" role="alert">
            {ONE_LINE_BLOCKED}
          </p>
        ) : null}
      </div>
    );
  } else if (status === "loading") {
    body = <p className="fordpg-quiet">Loading…</p>;
  } else if (status === "failed") {
    body = (
      <p className="fordpg-quiet">The line couldn't be read just now, so this isn't the same as no line.</p>
    );
  } else if (view) {
    body = (
      <>
        <p className="fordpg-line__text">{view.text}</p>
        <Meta>{oneLineMeta(view, now)}</Meta>
      </>
    );
  } else {
    body = <p className="fordpg-quiet">No line yet. The one sentence a new trainer should read first.</p>;
  }

  return (
    <Card
      id="ford-one-line"
      eyebrow="In one line"
      icon={QuoteIcon}
      actions={
        canWrite && !editing ? (
          <Btn icon={PenLine} onClick={open} aria-label={view ? "Edit the line" : undefined}>
            {view ? "Edit" : "Write the line"}
          </Btn>
        ) : null
      }
    >
      {body}
      {showSaved ? (
        <p className="fordpg-line__note" role="status">
          Saved
        </p>
      ) : null}
    </Card>
  );
}
