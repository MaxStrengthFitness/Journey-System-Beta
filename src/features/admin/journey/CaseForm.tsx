/**
 * THE CASE FORM — a leader opens a client's case and changes it; the owner
 * changes their own; everyone else reads (case-form.ts is the pure half).
 *
 * Operations room, wave 3 (Sep 29 2026; wave 2's item 6). It sits under
 * "Next step" and "Outcome" on the client page inside Operations
 * (JourneyCase.tsx), and it is the admin kit's form: dirty-tracked
 * (`useDirtyForm`, so the app's leave warning covers typed text), only the
 * diff written (`saveCase` → `casePatch`), a Save bar that never blocks. A
 * new case is written whole (`openCase`); the store's shape is never
 * touched here.
 *
 * WHAT IT NEVER DOES: contact anyone (every next step names a person, and
 * the hint says so), delete a case (an outcome closes it; a leader setting
 * it back to Open reopens it, `openedAt` kept), or change the owner from
 * the owner's own hand (the rules refuse it, so the control is read-only).
 */
import { useCallback, useMemo, useState } from "react";
import { AdminButton, AdminField, AdminInput, AdminSelect, AdminTextarea, SaveBar } from "../primitives";
import { useDirtyForm } from "../useDirtyForm";
import type { CaseView } from "./case";
import { CASE_LIMITS, CASE_OUTCOMES, OUTCOME_WORDS, draftOf, openCase, saveCase, type CaseDraft, type CaseOutcome, type StoredCase } from "./case-store";
import { draftAfter, dueWords, mayEditField, startingDraft, type CaseRights, type OwnerChoice } from "./case-form";

export interface CaseFormProps {
  studioId: string;
  clientId: string;
  clientName: string;
  /** Her stored case, or null when none is stored (the case on the page is then worked out). */
  stored: StoredCase | null;
  /** The case as the page worked it out or read it (case.ts): what a new case starts from. */
  view: CaseView;
  rights: CaseRights;
  /** Who may own a case here (case-form.ts `ownerChoices`, the stored owner kept). */
  choices: readonly OwnerChoice[];
}

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || "this client";

export function CaseForm({ studioId, clientId, clientName, stored, view, rights, choices }: CaseFormProps) {
  // A leader tapped "Open a case" where none is stored.
  const [opening, setOpening] = useState(false);
  const first = firstNameOf(clientName);

  // The committed draft: what the store holds, else what a new case starts
  // from. Keyed on its values so its identity is stable across renders (the
  // page re-renders on every snapshot) and useDirtyForm adopts only real change.
  const key = stored
    ? `s|${stored.owner.id}|${stored.owner.name}|${stored.nextStep}|${stored.dueOn ?? ""}|${stored.outcome}|${stored.reason ?? ""}`
    : `n|${view.owner.id ?? ""}|${view.owner.name}|${view.dueDay ?? ""}`;
  const committed = useMemo<CaseDraft>(
    () => (stored ? draftOf(stored) : startingDraft(view)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  // A stored case: only the diff, through the store's own patch.
  const onSave = useCallback(
    async (patch: Partial<CaseDraft>) => {
      if (!stored) return;
      await saveCase(studioId, clientId, committed, draftAfter(committed, patch));
    },
    [committed, stored, studioId, clientId],
  );

  const form = useDirtyForm<CaseDraft>(committed, onSave, { label: `${first}'s case` });
  const editing = stored ? rights.editing : rights.mayOpen && opening ? "all" : "none";

  // A new case is written whole, typed or not: the starting draft is a case
  // worth opening as it stands (her usual trainer, the rules' due day).
  const [openingNow, setOpeningNow] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const open = async () => {
    if (openingNow) return;
    setOpeningNow(true);
    setOpenError(null);
    try {
      await openCase(studioId, clientId, clientName, form.value);
      form.discard();
      setOpening(false);
    } catch (err) {
      setOpenError(err instanceof Error && err.message ? err.message : "Could not open the case. Check your connection and try again.");
    } finally {
      setOpeningNow(false);
    }
  };

  if (editing === "none") {
    if (!stored && rights.mayOpen) {
      return (
        <div className="ops-case__acts">
          <AdminButton onClick={() => setOpening(true)}>Open a case</AdminButton>
        </div>
      );
    }
    return null;
  }

  const may = (field: keyof CaseDraft) => mayEditField(editing, field);
  const ownerId = form.value.owner?.id ?? "";
  const setOwner = (id: string) => {
    const pick = choices.find((c) => c.id === id) ?? null;
    form.setField("owner", pick ? { id: pick.id, name: pick.name } : null);
  };
  const reasonWanted = form.value.outcome === "paused" || form.value.outcome === "lost";

  return (
    <form
      className="ops-case__form"
      aria-label={stored ? `${first}'s case` : `Open a case for ${first}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (stored) void form.save();
        else void open();
      }}
    >
      <p className="ops-quiet">
        {stored
          ? "The case as the team wrote it. Any change here counts as a step."
          : `Nothing is stored for ${first} yet: the case above is worked out by the rules. Open one to write down who is catching ${first} and what happens next.`}
      </p>
      <div className="ops-case__fields">
        <AdminField label="Owner" required htmlFor="case-owner" hint={may("owner") ? "Someone who works here. Their Relay lists the cases they own." : "Only a leader changes the owner."}>
          <AdminSelect id="case-owner" value={ownerId} disabled={!may("owner")} onChange={(e) => setOwner(e.target.value)} invalid={!ownerId}>
            <option value="">Choose who owns it</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </AdminSelect>
        </AdminField>
        <AdminField label="Due day" htmlFor="case-due" hint={form.value.dueOn ? `${dueWords(form.value.dueOn)}. After it, the case is the leader's.` : "No day set. Left empty, the case reads the rules' own."}>
          <AdminInput id="case-due" type="date" value={form.value.dueOn ?? ""} disabled={!may("dueOn")} onChange={(e) => form.setField("dueOn", e.target.value || null)} />
        </AdminField>
        <AdminField label="Next step" wide htmlFor="case-step" hint="A person does it; Journey never contacts anyone. Left empty, it reads the rules' own step.">
          <AdminTextarea
            id="case-step"
            value={form.value.nextStep}
            disabled={!may("nextStep")}
            maxLength={CASE_LIMITS.nextStep}
            rows={3}
            placeholder={view.nextStep}
            onChange={(e) => form.setField("nextStep", e.target.value)}
          />
        </AdminField>
        <AdminField label="Outcome" htmlFor="case-outcome" hint="Booked again closes it by itself when Journey sees a new booking; Paused and Lost are the team's words.">
          <AdminSelect id="case-outcome" value={form.value.outcome} disabled={!may("outcome")} onChange={(e) => form.setField("outcome", e.target.value as CaseOutcome)}>
            {CASE_OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_WORDS[o]}
              </option>
            ))}
          </AdminSelect>
        </AdminField>
        <AdminField label="Reason" htmlFor="case-reason" hint={reasonWanted ? "Why, in a line. The next person to open this case should know." : "Optional."}>
          <AdminInput
            id="case-reason"
            value={form.value.reason}
            disabled={!may("reason")}
            maxLength={CASE_LIMITS.reason}
            placeholder={reasonWanted ? "Moved away · Injured · Cost" : ""}
            onChange={(e) => form.setField("reason", e.target.value)}
          />
        </AdminField>
      </div>
      {stored ? (
        <SaveBar status={form.status} error={form.error} onSave={() => void form.save()} onDiscard={form.discard} saveLabel="Save the case" />
      ) : (
        <>
          {openError && (
            <p className="adm-hint adm-hint--error" role="alert">
              {openError}
            </p>
          )}
          <div className="ops-case__acts">
            <AdminButton variant="primary" busy={openingNow} disabled={!ownerId} onClick={() => void open()}>
              Open the case
            </AdminButton>
            <AdminButton
              variant="ghost"
              disabled={openingNow}
              onClick={() => {
                form.discard();
                setOpening(false);
              }}
            >
              Not now
            </AdminButton>
          </div>
        </>
      )}
    </form>
  );
}
