import { useMemo, type ReactNode } from "react";
import { ListChecks } from "lucide-react";
import { auth, db } from "../../../firebase";
import { useToast } from "../../../contexts/ToastContext";
import { useMachineCatalog } from "../../../hooks/useMachineCatalog";
import { AdminBadge, AdminButton, AdminNotice, AdminPanel, SaveBar } from "../../admin/primitives";
import { useDirtyForm } from "../../admin/useDirtyForm";
import { dayOneLine } from "../start-part";
import {
  choiceForForm,
  choiceSourceLine,
  followingHeadOffice,
  noStudioDefaultLine,
  routineMachineName,
  seenCount,
  seesRoutine,
  withRoutineSeen,
  withStudioDefault,
} from "../starting-choice";
import { NO_CHOICE } from "../starting-read";
import type { StartingRoutine, StartingRoutineChoice } from "../starting-routines";
import { saveStartingChoice } from "../starting-store";
import { useStartingRoutines } from "../useStartingRoutines";
import "../../admin/admin.css";
import "./starting-routines.css";

/**
 * MY STUDIO → STUDIO → STARTING ROUTINES — which starting routines a studio's
 * trainers see on Start a plan, and the one it suggests when a client's
 * intake names nothing (the design round, Oct 8 2026).
 *
 * AJ: "studios will chose their own, admins will create the routines to pick
 * from in the app during beta", and his "3a": "A client whose intake names
 * nothing gets the studio's default starting routine." Head office makes the
 * routines (the routine template editor's "For new clients"); a studio's
 * leaders choose here, once, for everyone who works there. The choice is
 * `studios/{s}/config/startingRoutines` = `{ use, defaultId }`
 * (`starting-store.ts`): `use: null` follows head office's list, a list is
 * exactly the ones ticked (`starting-choice.ts` says what each tap does).
 *
 * The studio tier changes it; everyone else who works here reads it, in
 * words rather than locked boxes (a disabled box fades on an iPad, and which
 * ones are offered is the whole point of reading it), with a line saying who
 * changes it (AJ's voice review: "Leaders edit it; trainers can view it
 * read-only"). The form is `useDirtyForm`, so it joins the unsaved-changes
 * registry, and its blue Save writes the whole choice (the rules want both
 * fields) signed with the Auth uid; nothing is written before Save. What a
 * tick means is measured from what is saved, the form's own baseline, which
 * its Save moves; the first read does not move until the panel reads again.
 *
 * One read of the routines and one of the choice when the panel opens
 * (`useStartingRoutines`), no listener and no Mindbody call. Until both have
 * answered it says it is loading, and when either fails it says so and
 * offers no save: a read that hasn't answered is never "none". Before head
 * office has added any (the seed hasn't run), Start a plan offers the
 * Academy's eleven, built in code with the seed's own ids, and the panel
 * says so above them: a choice made among them still holds once they are
 * head office's.
 */
export interface StartingRoutinesPanelProps {
  studioId: string;
  studioName: string;
  /** The studio's leaders (leadsHere); everyone else reads. */
  canEdit: boolean;
}

const NONE: StartingRoutine[] = [];

export function StartingRoutinesPanel({ studioId, studioName, canEdit }: StartingRoutinesPanelProps) {
  const starting = useStartingRoutines(studioId);
  const { byId } = useMachineCatalog();
  const { success: toastSuccess } = useToast();

  const ready = starting.status === "ready" && starting.choice !== null;
  const routines = ready ? starting.routines : NONE;
  const routineIds = useMemo(() => routines.map((r) => r.id), [routines]);
  const external = useMemo<StartingRoutineChoice>(
    () => choiceForForm(starting.choice ?? NO_CHOICE, routineIds),
    [starting.choice, routineIds],
  );

  const form = useDirtyForm<StartingRoutineChoice>(
    external,
    async () => {
      // The whole choice, never the diff alone: the rules want both fields.
      await saveStartingChoice(db, studioId, form.value, auth.currentUser?.uid ?? "");
      toastSuccess(`Saved. Start a plan at ${studioName} offers the new list.`);
    },
    { label: `${studioName}'s starting routines` },
  );

  const nameOf = (id: string) => routineMachineName(id, byId[id]?.name);
  const choice = form.value;

  const panel = (body: ReactNode, footer?: ReactNode, actions?: ReactNode) => (
    <AdminPanel
      title="Starting routines"
      icon={<ListChecks className="w-3.5 h-3.5" />}
      subtitle={
        canEdit
          ? "Which starting routines Start a plan offers here, and the one it suggests when a client's intake names nothing."
          : "The starting routines Start a plan offers at this studio, and the one it suggests when a client's intake names nothing."
      }
      actions={actions}
      footer={footer}
    >
      {body}
    </AdminPanel>
  );

  if (starting.status === "loading") {
    return panel(
      <p className="srt__hint" role="status">
        Loading this studio's starting routines…
      </p>,
    );
  }

  if (!ready) {
    return panel(
      <div className="srt">
        <AdminNotice tone="warn">
          {canEdit
            ? "Couldn't read this studio's starting routines just now, so nothing here can be changed until they can be read."
            : "Couldn't read this studio's starting routines just now."}
        </AdminNotice>
        <div>
          <AdminButton onClick={starting.reload}>Try again</AdminButton>
        </div>
      </div>,
    );
  }

  const lostDefault = choice.defaultId !== null && !routineIds.includes(choice.defaultId);
  const radioName = `srt-default-${studioId}`;

  return panel(
    <div className="srt">
      {starting.fromCode ? (
        <AdminNotice tone="info">
          Head office hasn't added starting routines yet. Until then, Start a plan offers the Academy's eleven.
        </AdminNotice>
      ) : null}

      <div className="srt__part">
        <p className="srt-source">{choiceSourceLine(choice.use, studioName, canEdit)}</p>
        {canEdit && choice.use !== null ? (
          <div>
            <AdminButton size="sm" onClick={() => form.setFields(followingHeadOffice(choice))}>
              Follow head office's list again
            </AdminButton>
          </div>
        ) : null}
      </div>

      <ul className="srt-list" aria-label="Starting routines">
        {routines.map((r) => {
          const seen = seesRoutine(choice, r.id);
          const headOfficeDefault = r.isDefault && r.tier === "company";
          return (
            <li key={r.id} className="srt-row">
              <div className="srt-row__text">
                <span className="srt-row__name">{r.name}</span>
                <span className="srt-row__meta">{dayOneLine(r.dayOne, nameOf)}</span>
                {headOfficeDefault || r.tier === "studio" ? (
                  <span className="srt-row__tags">
                    {headOfficeDefault ? <AdminBadge tone="live">Head office's default</AdminBadge> : null}
                    {r.tier === "studio" ? <AdminBadge>{studioName}'s own</AdminBadge> : null}
                  </span>
                ) : null}
              </div>
              {canEdit ? (
                <div className="srt-row__controls">
                  <label className="srt-opt">
                    <input
                      type="checkbox"
                      checked={seen}
                      aria-label={`Our trainers see ${r.name}`}
                      onChange={(e) =>
                        form.setFields(withRoutineSeen(choice, r.id, e.target.checked, routineIds, form.baseline.use))
                      }
                    />
                    <span>Our trainers see this</span>
                  </label>
                  <label className="srt-opt">
                    <input
                      type="radio"
                      name={radioName}
                      checked={choice.defaultId === r.id}
                      aria-label={`${r.name} is ${studioName}'s default`}
                      onChange={() => form.setFields(withStudioDefault(choice, r.id, routineIds))}
                    />
                    <span>Default</span>
                  </label>
                </div>
              ) : (
                <div className="srt-row__controls srt-row__controls--read">
                  {seen ? (
                    <AdminBadge tone="live">Our trainers see this</AdminBadge>
                  ) : (
                    <AdminBadge>Not offered here</AdminBadge>
                  )}
                  {choice.defaultId === r.id ? <AdminBadge tone="live">Default</AdminBadge> : null}
                </div>
              )}
            </li>
          );
        })}
        {canEdit ? (
          <li className="srt-row srt-row--none">
            <label className="srt-opt">
              <input
                type="radio"
                name={radioName}
                checked={choice.defaultId === null}
                onChange={() => form.setFields(withStudioDefault(choice, null, routineIds))}
              />
              <span className="srt-opt__text">{noStudioDefaultLine(routines, choice)}</span>
            </label>
          </li>
        ) : choice.defaultId === null ? (
          <li className="srt-row srt-row--none">
            <p className="srt-read">{noStudioDefaultLine(routines, choice)}</p>
          </li>
        ) : null}
      </ul>

      {lostDefault ? (
        <p className="srt__hint" role="note">
          {canEdit
            ? "The default saved here isn't one head office offers any more. Pick another, or No default of our own."
            : "The default saved here isn't one head office offers any more."}
        </p>
      ) : null}
    </div>,
    canEdit ? (
      <SaveBar status={form.status} error={form.error} onSave={() => void form.save()} onDiscard={form.discard} />
    ) : (
      <div className="srt-foot">Only this studio's leaders change which starting routines its trainers see.</div>
    ),
    <AdminBadge>{seenCount(choice, routineIds)}</AdminBadge>,
  );
}
