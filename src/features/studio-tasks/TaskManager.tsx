import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "../../contexts/ToastContext";
import type { Client } from "../../types";
import { taskLocationOf, taskScopeOf } from "./types";
import type { TaskScope } from "./types";
import { useStudioMachines } from "../../hooks/useStudioMachines";
import { useStudioTaskCategories } from "./useStudioTaskCategories";
import { studioDateKey } from "../../lib/studio-time";
import { TaskWizard } from "./TaskWizard";
import { firstStep, normaliseTime, problemsFor, taskSentence, type WizardStep } from "./task-wizard";
import {
  deleteTaskTemplate,
  newTemplateId,
  saveTaskTemplate,
  setTaskTemplateActive,
} from "./mutations";
import { categoryLabel, type TaskTemplate } from "./types";

/**
 * The manager's side of the to-do list.
 *
 * Round: Studio To-Do, Sep 2026.
 *
 * Deliberately unambiguous rather than fast. Since the Planner rework (Sep
 * 2026) the form is a three-step wizard (./TaskWizard.tsx, rules in
 * ./task-wizard.ts): What, When, Rules — ending on a sentence that says what
 * saving will do. Opened with `openWith` it is a single-purpose dialog
 * (Cancel and Save close it); opened bare it is the list first.
 *
 * Retiring is the default; hard delete is behind a second tap and warns, since
 * completed instances reference the template and deleting it orphans the
 * history of every time the task was done.
 */
function blank(
  studioId: string,
  scope: TaskScope,
  ownerId: string | null,
): TaskTemplate {
  return {
    id: "",
    studioId,
    scope,
    ...(scope === "personal" && ownerId ? { ownerId } : {}),
    title: "",
    kind: "machine",
    category: "cleaning",
    target: { kind: "machine", machineIds: "all" },
    recurrence: { type: "daily", shifts: ["any"] },
    active: true,
  };
}

export interface TaskManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studioId: string | null;
  /** May this trainer author the SHARED studio list? Personal is always on. */
  canManageStudio: boolean;
  /** Firebase Auth uid — the path and the tenancy for personal tasks. */
  ownerId: string | null;
  templates: TaskTemplate[];
  author?: { id: string; name: string } | null;
  clients?: Client[];
  /**
   * What to show the moment the dialog opens.
   *
   * Manage now owns studio task authoring (Sep 6), and "New studio task"
   * there should land on the form, not on a list the manager was just looking
   * at. Applied on the transition into open rather than on every render, so a
   * manager who backs out to the list is not shoved forward again.
   */
  openWith?:
    | { mode: "new"; scope: TaskScope; preset?: Partial<TaskTemplate> }
    | { mode: "edit"; template: TaskTemplate }
    | null;
}

export function TaskManager({
  open,
  onOpenChange,
  studioId,
  canManageStudio,
  ownerId,
  templates,
  author,
  clients,
  openWith = null,
}: TaskManagerProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  // Bridged for the same reason as useStudioTasks: an unbridged empty roster
  // renders this picker as a bordered box with nothing in it, which reads as
  // a broken button rather than as missing data.
  const { machines } = useStudioMachines(studioId, {
    bridgeWhenRosterEmpty: true,
  });
  // The studio's own labels, merged over the four built-ins. A studio that has
  // never opened a category editor still gets a sensible list rather than an
  // empty picker.
  const { categories } = useStudioTaskCategories(studioId);
  const [draft, setDraft] = useState<TaskTemplate | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [step, setStep] = useState<WizardStep>("what");
  const [showProblems, setShowProblems] = useState(false);
  const todayKey = studioDateKey(new Date()) ?? "";

  // A trainer without manage rights opens this dialog to write their OWN
  // list, so they must not be shown - or be able to open - the shared studio
  // templates. Filtering the list is the guard; the rules are the backstop.
  const visibleTemplates = useMemo(
    () =>
      canManageStudio
        ? templates
        : templates.filter((t) => taskScopeOf(t) === "personal"),
    [templates, canManageStudio],
  );

  const sorted = useMemo(
    () =>
      [...visibleTemplates].sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          (a.order ?? 999) - (b.order ?? 999) ||
          a.title.localeCompare(b.title),
      ),
    [templates],
  );

  const startNew = (scope: TaskScope, preset?: Partial<TaskTemplate>) => {
    if (!studioId) return;
    if (scope === "studio" && !canManageStudio) return;
    if (scope === "personal" && !ownerId) return;
    setDraft({ ...blank(studioId, scope, ownerId), ...(preset ?? {}) });
    setIsNew(true);
    setConfirmDelete(false);
    setShowProblems(false);
    // A preset has already answered What's shape; the title is still needed.
    setStep(firstStep(true));
  };

  const startEdit = (t: TaskTemplate) => {
    setDraft({ ...t });
    setIsNew(false);
    setConfirmDelete(false);
    setShowProblems(false);
    setStep(firstStep(false));
  };

  const close = () => {
    setDraft(null);
    setConfirmDelete(false);
  };
  // Opened for one task (New task, Edit), finishing closes the dialog;
  // opened on the list, it goes back to the list.
  const finish = () => (openWith ? onOpenChange(false) : close());

  // Fires on the false -> true edge only. `openWith` is read here rather than
  // in a render branch so that backing out of the form with the chevron
  // returns to the list instead of immediately re-entering the draft.
  useEffect(() => {
    if (!open) {
      setDraft(null);
      setConfirmDelete(false);
      return;
    }
    if (!openWith) return;
    if (openWith.mode === "edit") startEdit(openWith.template);
    else startNew(openWith.scope, openWith.preset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    if (!draft || !studioId) return;
    if (problemsFor(draft).length) {
      setShowProblems(true);
      return;
    }
    setBusy(true);
    try {
      const id = draft.id || newTemplateId(draft.title);
      await saveTaskTemplate({
        location: taskLocationOf(draft, studioId),
        template: {
          ...draft,
          id,
          title: draft.title.trim(),
          timeOfDay: normaliseTime(draft.timeOfDay) ?? undefined,
          // A reminder is a personal thing; a studio task never carries one.
          remindMinutesBefore:
            taskScopeOf(draft) === "personal" && normaliseTime(draft.timeOfDay)
              ? draft.remindMinutesBefore ?? null
              : null,
          order: draft.order ?? sorted.length + 1,
        },
        author: author ?? null,
        isNew,
      });
      toastSuccess(
        isNew
          ? typeof draft.remindMinutesBefore === "number" && taskScopeOf(draft) === "personal"
            ? "Added — your bell will remind you."
            : "Task added."
          : "Task saved.",
      );
      finish();
    } catch (err) {
      console.error("Failed to save task template:", err);
      toastError("Could not save the task. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (t: TaskTemplate) => {
    if (!studioId) return;
    try {
      await setTaskTemplateActive({
        location: taskLocationOf(t, studioId),
        templateId: t.id,
        active: !t.active,
        author: author ?? null,
      });
      toastSuccess(t.active ? "Task retired." : "Task restored.");
    } catch {
      toastError("Could not change the task.");
    }
  };

  const hardDelete = async () => {
    if (!draft || !studioId || !draft.id) return;
    setBusy(true);
    try {
      await deleteTaskTemplate(taskLocationOf(draft, studioId), draft.id);
      toastSuccess("Task deleted.");
      finish();
    } catch {
      toastError("Could not delete the task.");
    } finally {
      setBusy(false);
    }
  };

  const machineName = (id: string) => machines.find((m) => m.machineId === id)?.name ?? "";
  const clientName = (id: string) => {
    const c = (clients ?? []).find((x) => x.id === id);
    return c ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() : "";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pk-sheet sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pk-title">
            {draft && !openWith && (
              <button type="button" className="st__row-action" onClick={close} aria-label="Back to the task list">
                <ChevronLeft size={18} aria-hidden />
              </button>
            )}
            {draft
              ? isNew
                ? taskScopeOf(draft) === "personal"
                  ? typeof draft.remindMinutesBefore === "number"
                    ? "New reminder"
                    : "New task for you"
                  : "New studio task"
                : taskScopeOf(draft) === "personal"
                  ? "Edit your task"
                  : "Edit studio task"
              : canManageStudio
                ? "Standing tasks"
                : "All your tasks"}
          </DialogTitle>
          {!draft && (
            <p className="pk-lede">
              {canManageStudio
                ? "The duties this studio is held to, and your own. Trainers see the studio's on the Studio tab on the days they fall due."
                : "Everything on your own list, including the ones that aren't due today. Only you see these."}
            </p>
          )}
        </DialogHeader>

        {!draft && (
          <>
            <div className="pk-body">
              {sorted.length === 0 ? (
                <p className="pk-empty">Nothing yet.</p>
              ) : (
                <ul className="tw-list">
                  {sorted.map((t) => (
                    <li key={t.id} className={`tw-item${t.active ? "" : " tw-item--retired"}`}>
                      <button type="button" className="tw-item__open" onClick={() => startEdit(t)}>
                        <span className="tw-item__title">
                          {t.title}
                          {canManageStudio && taskScopeOf(t) === "personal" && (
                            <span className="pk-tag">Just you</span>
                          )}
                          {!t.active && <span className="pk-tag">Retired</span>}
                        </span>
                        <span className="tw-item__sub">
                          {categoryLabel(t.category, categories)} ·{" "}
                          {taskSentence(t, { todayKey, machineName, clientName }).split(". ")[0]}
                        </span>
                      </button>
                      <button type="button" className="pl__btn" onClick={() => toggleActive(t)}>
                        {t.active ? "Retire" : "Restore"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="pk-foot">
              <button
                type="button"
                className="pl__btn"
                onClick={() => startNew("personal")}
                disabled={!studioId || !ownerId}
              >
                <Plus size={14} aria-hidden /> Task for me
              </button>
              {canManageStudio && (
                <button
                  type="button"
                  className="pl__btn pl__btn--primary"
                  onClick={() => startNew("studio")}
                  disabled={!studioId}
                >
                  <Plus size={14} aria-hidden /> Studio task
                </button>
              )}
            </div>
          </>
        )}

        {draft && (
          <TaskWizard
            draft={draft}
            onChange={setDraft}
            isNew={isNew}
            step={step}
            onStep={setStep}
            showProblems={showProblems}
            onShowProblems={() => setShowProblems(true)}
            machines={machines}
            categories={categories}
            clients={clients ?? []}
            todayKey={todayKey}
            busy={busy}
            onSave={save}
            onCancel={finish}
            confirmDelete={confirmDelete}
            onDelete={() => (confirmDelete ? hardDelete() : setConfirmDelete(true))}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
