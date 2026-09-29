/**
 * ONE OF MY CASES, EDITED — the small sheet under the Tracker's Follow-ups
 * (Relay's third wave, Sep 29 2026). Exactly the four fields the rules let
 * the owner change: the next step, the due day, the outcome and its reason.
 * The owner, the client's name and when it opened are the leader's, and are
 * shown, not offered.
 *
 * Saving sends only what changed (`saveCase` → `casePatch`), stamped with
 * the Auth uid and the server's time. Nothing pings anyone. Typing here
 * registers with the unsaved-changes gate, so leaving mid-edit asks first.
 */
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "../../contexts/ToastContext";
import { useUnsavedChanges } from "../unsaved-changes";
import {
  CASE_LIMITS,
  CASE_OUTCOMES,
  OUTCOME_WORDS,
  casePatch,
  draftOf,
  draftProblem,
  saveCase,
  type CaseDraft,
  type CaseOutcome,
  type StoredCase,
} from "../admin/journey/case-store";
import { caseFirstName, caseWhenWords } from "./my-cases";
import "./kit.css";

export interface MyCaseEditorProps {
  studioId: string | null;
  theCase: StoredCase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todayKey: string;
  onOpenClient?: (clientId: string) => void;
}

const blank = (): CaseDraft => ({ owner: null, nextStep: "", dueOn: null, outcome: "open", reason: "" });

export function MyCaseEditor({ studioId, theCase, open, onOpenChange, todayKey, onOpenClient }: MyCaseEditorProps) {
  const { success: toastSuccess } = useToast();
  const [draft, setDraft] = useState<CaseDraft>(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh draft each time the sheet opens on a case.
  useEffect(() => {
    if (!open) return;
    setDraft(theCase ? draftOf(theCase) : blank());
    setError(null);
  }, [open, theCase]);

  const before = theCase ? draftOf(theCase) : blank();
  const dirty = open && Boolean(theCase) && Object.keys(casePatch(before, draft)).length > 0;
  const who = theCase ? caseFirstName(theCase) : "this client";
  const leave = useUnsavedChanges(dirty, `${who}'s case`, { onDiscard: () => setDraft(before) });
  const close = () => leave.guard(() => onOpenChange(false));

  const edit = (patch: Partial<CaseDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const problem = draftProblem(draft);

  const save = async () => {
    if (!studioId || !theCase) return;
    setBusy(true);
    setError(null);
    try {
      await saveCase(studioId, theCase.clientId, before, draft);
      leave.release();
      toastSuccess(draft.outcome === "open" ? `Saved ${who}'s case.` : `${who}'s case is ${OUTCOME_WORDS[draft.outcome].toLowerCase()}. It's off your list.`);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="rk-sheet sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="rk-title">{theCase ? `${theCase.clientName}'s case` : "A case"}</DialogTitle>
          {theCase && (
            <p className="rk-lede">
              Yours to catch. {caseWhenWords(theCase.dueOn, todayKey)}. Only the leader who opened it changes who owns it.
            </p>
          )}
        </DialogHeader>
        {!theCase ? (
          <p className="rk-hint">This case is no longer on your list.</p>
        ) : (
          <>
            <div className="rk-body">
              {error && (
                <p className="rk-problem" role="alert">
                  {error}
                </p>
              )}
              <div className="rk-field">
                <label className="rk-label" htmlFor="mc-step">
                  Next step
                </label>
                <textarea
                  id="mc-step"
                  className="rk-textarea"
                  rows={3}
                  maxLength={CASE_LIMITS.nextStep}
                  placeholder="What you'll do next — “ask about her knee after Thursday's session”"
                  value={draft.nextStep}
                  onChange={(e) => edit({ nextStep: e.target.value })}
                />
              </div>
              <div className="rk-row">
                <div className="rk-field">
                  <label className="rk-label" htmlFor="mc-due">
                    Due day
                  </label>
                  <input
                    id="mc-due"
                    className="rk-input"
                    type="date"
                    value={draft.dueOn ?? ""}
                    onChange={(e) => edit({ dueOn: e.target.value || null })}
                  />
                </div>
              </div>
              <div className="rk-field">
                <span className="rk-label" id="mc-outcome">
                  Outcome
                </span>
                <div className="rk-seg" role="group" aria-labelledby="mc-outcome">
                  {CASE_OUTCOMES.map((o: CaseOutcome) => (
                    <button key={o} type="button" aria-pressed={draft.outcome === o} onClick={() => edit({ outcome: o })}>
                      {OUTCOME_WORDS[o]}
                    </button>
                  ))}
                </div>
                <p className="rk-hint">Anything but Open closes it and takes it off your list. The leader sees the outcome on Operations.</p>
              </div>
              {draft.outcome !== "open" && (
                <div className="rk-field">
                  <label className="rk-label" htmlFor="mc-reason">
                    Why
                  </label>
                  <input
                    id="mc-reason"
                    className="rk-input"
                    maxLength={CASE_LIMITS.reason}
                    placeholder="In a few words"
                    value={draft.reason}
                    onChange={(e) => edit({ reason: e.target.value })}
                  />
                </div>
              )}
              {problem && dirty && <p className="rk-problem">{problem}</p>}
            </div>
            <div className="rk-foot">
              <div className="rk-foot__left">
                {onOpenClient && (
                  <button type="button" className="pl__btn" onClick={() => onOpenClient(theCase.clientId)}>
                    Open {who}
                  </button>
                )}
              </div>
              <button type="button" className="pl__btn" onClick={close} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="pl__btn pl__btn--primary" onClick={() => void save()} disabled={busy || !dirty || Boolean(problem)}>
                <Check size={15} aria-hidden />
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
