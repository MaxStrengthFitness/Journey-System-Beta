/**
 * ACTIVE OR INACTIVE — one client's standing, and a leader's mark.
 *
 * The inactive round (Oct 1 2026; AJ: "manually set clients inactive", by
 * studio leaders). Drawn in two places, the same component in both:
 *
 *   - the client opened inside Operations (JourneyCase, under her journey);
 *   - her profile, Notes & Profile → Account (the codex's Account page).
 *
 * WHAT IT SAYS: marked inactive (by whom, on what day, the reason and the
 * note), inactive by herself (the studio's line), or active. A mark she has
 * visited since no longer holds, and it says so.
 *
 * WHAT A LEADER DOES HERE (`leadsHere`, which mirrors the rules'
 * `trainerLeads` with franchise owners and administrators): Mark inactive (a
 * reason from the pick list and an optional note, signed and dated: one
 * document, inactive-store.ts), change the reason, and Mark active again (the
 * mark taken back; her state is the rules' again). Everyone else reads it.
 * Typed words join the app's leave warning (useUnsavedChanges).
 *
 * Nothing here contacts anyone or touches Mindbody: Inactive is Journey's own
 * word for where she is, and a booking makes her active again by itself.
 */
import { useState } from "react";
import { useUnsavedChanges } from "../../unsaved-changes";
import { AdminButton, AdminField, AdminTextarea } from "../primitives";
import {
  EMPTY_INACTIVE_DRAFT,
  INACTIVE_LIMITS,
  INACTIVE_REASONS,
  INACTIVE_REASON_WORDS,
  inactiveDraftProblem,
  markHolds,
  markReasonWords,
  type InactiveDraft,
  type InactiveMark,
} from "./inactive";
import { markActiveAgain, markInactive } from "./inactive-store";
import { formatDateWords } from "../../../lib/studio-time";
import "../shell/ops.css";

export interface InactiveMarkProps {
  studioId: string;
  clientId: string;
  /** Her name as the screen shows it (first word used in sentences). */
  clientName: string;
  /** The leader's mark, when there is one. */
  mark: InactiveMark | null;
  /** The mark's read: a failed read is never "not marked". */
  read: "ready" | "loading" | "failed";
  /** Her last visit, when known: a mark she has visited since no longer holds. */
  lastVisit: string | null;
  /** Inactive by herself, in a sentence (the Journey's own words), or null when she isn't. */
  automatic: string | null;
  /** The signed-in person leads this studio (the rules' trainerLeads): may mark and take back. */
  leads: boolean;
  /** Who is marking, as the mark is signed (the Auth uid is the store's to read). */
  markerName: string;
  /** The studio's day, yyyy-mm-dd: the day a mark is dated. */
  today: string;
}

const dayWords = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return formatDateWords(new Date(Date.UTC(y, m - 1, d)), { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }, "en-US");
};

const firstOf = (name: string) => name.trim().split(/\s+/)[0] || "this client";

export function InactiveMarkPanel({ studioId, clientId, clientName, mark, read, lastVisit, automatic, leads, markerName, today }: InactiveMarkProps) {
  const first = firstOf(clientName);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<InactiveDraft>(EMPTY_INACTIVE_DRAFT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = open && (draft.reason !== (mark?.reason ?? null) || draft.note.trim() !== (mark?.note ?? ""));
  const close = () => {
    setOpen(false);
    setDraft(EMPTY_INACTIVE_DRAFT);
    setError(null);
  };
  useUnsavedChanges(dirty, `${first}'s inactive mark`, { onDiscard: close });

  const holds = mark ? markHolds(mark, lastVisit) : false;
  const begin = () => {
    setDraft(mark ? { reason: mark.reason, note: mark.note ?? "" } : EMPTY_INACTIVE_DRAFT);
    setError(null);
    setOpen(true);
  };
  const save = async () => {
    const problem = inactiveDraftProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await markInactive(studioId, clientId, draft, markerName, today);
      close();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't save the mark. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const takeBack = async () => {
    setBusy(true);
    setError(null);
    try {
      await markActiveAgain(studioId, clientId);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : `Couldn't mark ${first} active again. Check your connection and try again.`);
    } finally {
      setBusy(false);
    }
  };

  /* ---- what it says ---- */
  let said: string;
  if (read === "loading") said = `Reading whether ${first} is marked inactive…`;
  else if (read === "failed") said = `Whether a leader marked ${first} inactive couldn't be read just now.`;
  else if (mark && holds) said = `Marked inactive by ${mark.markedBy.name || "a leader"} on ${dayWords(mark.day)}: ${markReasonWords(mark)}.`;
  else if (mark) said = `Marked inactive on ${dayWords(mark.day)} (${markReasonWords(mark)}), but ${first} has visited since, so the mark no longer holds.`;
  else if (automatic) said = automatic;
  else said = "Active: not marked inactive.";

  return (
    <section className="ops-inactive" aria-label={`Is ${first} active?`}>
      <p className="ops-inactive__said">
        <b className="ops-inactive__k">{(mark && holds) || automatic ? "Inactive" : "Active or inactive"}</b> {said}
      </p>
      {mark && holds && <p className="ops-quiet">A booking makes {first} active again by itself. The history, notes and packages stay as they are.</p>}
      {!mark && automatic && <p className="ops-quiet">Inactive past the studio's line: a booking makes {first} active again. Nothing is deleted.</p>}

      {leads && read === "ready" && !open && (
        <div className="ops-inactive__acts">
          {mark ? (
            <>
              <AdminButton busy={busy} onClick={() => void takeBack()}>
                Mark active again
              </AdminButton>
              {holds && (
                <AdminButton variant="ghost" disabled={busy} onClick={begin}>
                  Change the reason
                </AdminButton>
              )}
            </>
          ) : (
            <AdminButton onClick={begin}>Mark inactive</AdminButton>
          )}
        </div>
      )}
      {!leads && read === "ready" && <p className="ops-quiet">Only a leader of this studio marks a client inactive or active again.</p>}

      {open && (
        <form
          className="ops-inactive__form"
          aria-label={mark ? `Change why ${first} is inactive` : `Mark ${first} inactive`}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <fieldset className="ops-inactive__reasons">
            <legend className="adm-label">Why</legend>
            {INACTIVE_REASONS.map((r) => (
              <button key={r} type="button" className="ops-inactive__reason" aria-pressed={draft.reason === r} onClick={() => setDraft((d) => ({ ...d, reason: r }))}>
                {INACTIVE_REASON_WORDS[r]}
              </button>
            ))}
          </fieldset>
          <AdminField label="Note" htmlFor={`inactive-note-${clientId}`} hint="Optional. The next leader to open this record should know.">
            <AdminTextarea
              id={`inactive-note-${clientId}`}
              rows={2}
              maxLength={INACTIVE_LIMITS.note}
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            />
          </AdminField>
          <p className="ops-quiet">
            Signed with your name and dated {dayWords(today)}. This takes {first} off the active lists and the Client Directory's All, and the nightly job stops asking Mindbody about the packages every month. Nothing is deleted, and a booking makes {first} active again.
          </p>
          <div className="ops-inactive__acts">
            <AdminButton type="submit" variant="primary" busy={busy} disabled={!draft.reason}>
              {mark ? "Save the reason" : "Mark inactive"}
            </AdminButton>
            <AdminButton variant="ghost" disabled={busy} onClick={close}>
              Not now
            </AdminButton>
          </div>
        </form>
      )}
      {error && (
        <p className="adm-hint adm-hint--error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
