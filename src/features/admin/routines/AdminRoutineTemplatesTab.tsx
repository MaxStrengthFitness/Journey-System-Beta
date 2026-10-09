import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, serverTimestamp, writeBatch,
} from "firebase/firestore";
import {
  Building2, ClipboardList, Globe2, Pencil, Plus, Trash2, Upload,
} from "lucide-react";
import { auth, db } from "../../../firebase";
import { RoutinePreset, RoutinePresetTier, Studio, Trainer } from "../../../types";
import { useMachineCatalog } from "../../../hooks/useMachineCatalog";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { canAuthorTier, normalizeRoutinePreset } from "../../../lib/routine-templates";
import { useToast } from "../../../contexts/ToastContext";
import { useUnsavedChanges } from "../../unsaved-changes";
import { otherDefaults, startListLine, startPartForSave, startPartProblem, withPendingWord } from "../../routine-plan/start-part";
import { RoutineTemplateForm, emptyRoutineTemplate } from "./RoutineTemplateForm";
import { editorDraftOf, isEmptyEdit, templateChanged, templateEdit } from "./template-save";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminHeader,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminScreen,
  AdminSelect,
  ConfirmDialog,
} from "../primitives";
import "../admin.css";

/**
 * ROUTINE TEMPLATES — the admin hub's programming section.
 *
 * Round: Routine Template Builder, Sep 2026.
 *
 * Deliberately shaped like AdminMachinesTab, because it is the same two-layer
 * model and staff should only have to learn it once:
 *
 *   Company Standards   every studio sees these. Admin-write only.
 *   Studio Templates    what ONE location adds for itself. That studio's
 *                       owner/leader, or an admin.
 *
 * The third tier -- presets a trainer saved ad-hoc from the routine drawer --
 * is shown read-only at the bottom of Studio Templates. Leaders could not
 * see those at all before, which meant the thing trainers actually reach for
 * was invisible to the people responsible for standards. A leader can
 * promote a good one into a studio template in one tap.
 *
 * STARTING ROUTINES (the design round, Oct 8 2026; AJ: "studios will chose
 * their own, admins will create the routines to pick from in the app during
 * beta"). A template switched on under "For new clients" is a starting
 * routine: the editor holds its day one, the words that suggest it and, on a
 * company template, head office's default, and its card here says so
 * ("Starting routine · day one: Leg Press · Compound Row"). Saving one as
 * head office's default takes the flag off any other company template IN THE
 * SAME BATCH, so there is never more than one. One switched off keeps its
 * part beside the template (`startParked`), so switching it back on brings
 * back what the editor couldn't put back itself: a seeded routine's steps,
 * its source and its kind.
 *
 * An edit writes only what changed, each field whole, through `update`
 * (`template-save.ts` says why: a merge left a word taken out, or a default
 * switched off, in the database). The open editor joins the unsaved-changes
 * registry, a word typed but not added included, and its own close asks
 * first; Save puts a typed word in rather than dropping it.
 */

type SubTab = "company" | "studio";

export function AdminRoutineTemplatesTab({
  studios,
  activeStudioId = null,
  authTrainer,
}: {
  studios: Studio[];
  /** The Operations scope's studio (Operations round): the default for the studio tier. */
  activeStudioId?: string | null;
  authTrainer?: Trainer | null;
  isAdmin?: boolean;
}) {
  const { catalog } = useMachineCatalog();
  const { success: toastSuccess, error: toastError } = useToast();

  const canCompany = canAuthorTier(authTrainer, "company");
  const canStudio = canAuthorTier(authTrainer, "studio");

  const [subTab, setSubTab] = useState<SubTab>(canCompany ? "company" : "studio");
  const [presets, setPresets] = useState<RoutinePreset[]>([]);
  const [draft, setDraft] = useState<RoutinePreset | null>(null);
  /** The template as the editor opened it: what the draft is compared with, and the edit's diff measured from. */
  const [opened, setOpened] = useState<RoutinePreset | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** A word that suggests the routine, typed in the editor but not added yet. */
  const [pendingWord, setPendingWord] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** The template whose delete is waiting on a second tap (fix pile, Sep 2026: it committed on one). */
  const [deleting, setDeleting] = useState<RoutinePreset | null>(null);

  // Live, unfiltered: the tiers are split in memory rather than with three
  // separate queries, because the collection is small and one listener keeps
  // the tiers consistent with each other.
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "routinePresets"),
      (snap) =>
        setPresets(
          snap.docs.map((d) => normalizeRoutinePreset({ id: d.id, ...d.data() })),
        ),
      (err) => handleFirestoreError(err, OperationType.GET, "routine templates"),
    );
    return () => unsub();
  }, []);

  const sortedStudios = useMemo(
    () => [...studios].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [studios],
  );

  const [pickedStudioId, setPickedStudioId] = useState<string | null>(null);
  const home = authTrainer?.primaryHomeStudioId;
  const fallbackStudioId =
    (activeStudioId && sortedStudios.some((s) => s.id === activeStudioId) ? activeStudioId : null) ??
    (home && sortedStudios.some((s) => s.id === home) ? home : null) ??
    sortedStudios[0]?.id ??
    null;
  const studioId = pickedStudioId ?? fallbackStudioId;

  const companyTemplates = useMemo(
    () => presets.filter((p) => p.tier === "company").sort(byName),
    [presets],
  );
  const studioTemplates = useMemo(
    () =>
      presets
        .filter((p) => p.tier === "studio" && p.studioId === studioId)
        .sort(byName),
    [presets, studioId],
  );
  const trainerPresets = useMemo(
    () =>
      presets
        .filter((p) => p.tier === "trainer" && p.studioId === studioId)
        .sort(byName),
    [presets, studioId],
  );

  const openNew = (tier: RoutinePresetTier) => {
    const blank: RoutinePreset = {
      ...emptyRoutineTemplate(),
      tier,
      scope: tier === "company" ? "global" : (studioId ?? ""),
      studioId: tier === "company" ? undefined : (studioId ?? undefined),
    };
    setEditingId(null);
    setOpened(blank);
    setDraft(blank);
  };

  const openEdit = (p: RoutinePreset) => {
    const shown = editorDraftOf(normalizeRoutinePreset(p));
    setEditingId(p.id ?? null);
    setOpened(shown);
    setDraft(shown);
  };

  const close = () => { setDraft(null); setOpened(null); setEditingId(null); setPendingWord(""); };

  /**
   * Typing in the editor that isn't saved: a new template counts once
   * anything is in it, and so does a word typed but not added.
   */
  const dirty =
    !!draft && !!opened && (templateChanged(draft, opened) || (!!draft.start && pendingWord.trim() !== ""));
  const leave = useUnsavedChanges(
    dirty,
    editingId ? `the template "${opened?.name || "without a name"}"` : "the new template",
    { onDiscard: close },
  );

  /** Head office's starting default now, when it is a template other than the one open. */
  const otherDefault = draft?.tier === "company" ? otherDefaults(presets, editingId)[0] ?? null : null;

  const handleSave = async () => {
    if (!draft || !opened) return;
    // A word typed but not added goes in with the save, never dropped.
    let toSave = draft;
    if (draft.start && pendingWord.trim()) {
      const folded = withPendingWord(draft.start, pendingWord);
      if (folded.problem) { toastError(folded.problem); return; }
      toSave = { ...draft, start: folded.start };
    }
    const name = toSave.name.trim();
    if (!name) { toastError("Give the template a name first."); return; }
    if (toSave.machineIds.length === 0) {
      toastError("A template needs at least one machine.");
      return;
    }
    const tier = toSave.tier ?? "company";
    if (tier === "studio" && !toSave.studioId) {
      toastError("Pick a studio for this template first.");
      return;
    }
    const startProblem = startPartProblem(toSave.start, toSave.machineIds);
    if (startProblem) { toastError(startProblem); return; }
    const start = startPartForSave(toSave.start, { machineIds: toSave.machineIds, tier });
    let switchedOff = false;

    setSaving(true);
    try {
      const uid = auth.currentUser?.uid ?? null;
      const who = {
        tier,
        scope: tier === "company" ? "global" : toSave.studioId!,
        // Omitted, not null, for company templates: the rules read
        // studioId through .get(...,'') and an absent field is the honest
        // representation of "this belongs to no single studio".
        ...(tier === "studio" ? { studioId: toSave.studioId } : {}),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      };

      const batch = writeBatch(db);
      if (editingId) {
        // Only what changed, each field whole (template-save.ts). A part
        // switched off is kept beside the template, and one switched back
        // on takes the kept copy with it.
        const edit = templateEdit(toSave, opened);
        if (isEmptyEdit(edit)) { close(); return; }
        switchedOff = edit.removeStart;
        batch.update(doc(db, "routinePresets", editingId), {
          ...edit.fields,
          ...(edit.removeStart ? { start: deleteField() } : null),
          ...(edit.park ? { startParked: edit.park } : null),
          ...(edit.unpark ? { startParked: deleteField() } : null),
          ...who,
        });
      } else {
        batch.set(doc(collection(db, "routinePresets")), {
          name,
          description: toSave.description?.trim() ?? "",
          machineIds: toSave.machineIds,
          machineNotes: toSave.machineNotes ?? {},
          ...(start ? { start } : null),
          ...who,
          createdAt: serverTimestamp(),
          createdBy: uid,
          createdByName: authTrainer?.fullName ?? "Admin",
        });
      }
      // Head office's default is one template: saving this one as it takes
      // the flag off any other, in the same batch.
      const replaced = start?.default === true ? otherDefaults(presets, editingId) : [];
      for (const other of replaced) {
        batch.update(doc(db, "routinePresets", other.id!), {
          "start.default": deleteField(),
          updatedAt: serverTimestamp(),
          updatedBy: uid,
        });
      }
      await batch.commit();
      toastSuccess(
        replaced.length > 0
          ? `"${name}" saved. It is head office's starting default now, in place of ${replaced.map((p) => `"${p.name}"`).join(" and ")}.`
          : switchedOff
            ? `"${name}" saved. Start a plan no longer offers it.`
            : `"${name}" saved.`,
      );
      close();
    } catch (err) {
      console.error(err);
      toastError(
        tier === "company"
          ? "Could not save. Company standards are admin-only."
          : "Could not save. Studio templates need studio owner or leader access.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: RoutinePreset) => {
    if (!p.id) return;
    setBusyId(p.id);
    try {
      await deleteDoc(doc(db, "routinePresets", p.id));
      toastSuccess(`"${p.name}" deleted.`);
    } catch (err) {
      console.error(err);
      toastError("Could not delete that template.");
    } finally {
      setBusyId(null);
    }
  };

  /** Copy a trainer's ad-hoc preset up into a studio template. */
  const handlePromote = async (p: RoutinePreset) => {
    if (!studioId) return;
    setBusyId(p.id ?? null);
    try {
      await addDoc(collection(db, "routinePresets"), {
        name: p.name,
        description: p.description ?? "",
        machineIds: p.machineIds,
        machineNotes: p.machineNotes ?? {},
        tier: "studio",
        scope: studioId,
        studioId,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid ?? null,
        createdByName: authTrainer?.fullName ?? "Admin",
      });
      toastSuccess(`"${p.name}" promoted to a studio template.`);
    } catch (err) {
      console.error(err);
      toastError("Could not promote that preset.");
    } finally {
      setBusyId(null);
    }
  };

  const nameFor = (id: string) =>
    catalog.find((m) => m.id === id)?.name ?? id;

  const subTabs: Array<{ id: SubTab; label: string; icon: React.ReactNode }> = [
    { id: "company", label: "Company Standards", icon: <Globe2 className="h-4 w-4" /> },
    { id: "studio", label: "Studio Templates", icon: <Building2 className="h-4 w-4" /> },
  ];

  const list = subTab === "company" ? companyTemplates : studioTemplates;
  const canEditHere = subTab === "company" ? canCompany : canStudio;

  return (
    <AdminScreen>
      <AdminHeader
        icon={<ClipboardList className="w-5 h-5" />}
        title="Routine templates"
        subtitle={
          subTab === "company"
            ? "The house standard. Every studio sees these, and they are what a trainer reaches for first."
            : "Templates for this location only. Its owner or leader can add them; admins can edit any studio's."
        }
        actions={
          <AdminButton
            variant="hero"
            disabled={!canEditHere || (subTab === "studio" && !studioId)}
            onClick={() => openNew(subTab === "company" ? "company" : "studio")}
          >
            <Plus className="h-3.5 w-3.5" />
            New {subTab === "company" ? "company standard" : "studio template"}
          </AdminButton>
        }
      />

      <div className="adm-subnav">
        <div className="adm-segmented" role="tablist">
          {subTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={subTab === t.id}
              className="adm-seg"
              onClick={() => setSubTab(t.id)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {subTab === "studio" && sortedStudios.length > 0 && (
          <AdminField label="Studio" htmlFor="rt-studio">
            <AdminSelect
              id="rt-studio"
              value={studioId ?? ""}
              onChange={(e) => setPickedStudioId(e.target.value)}
            >
              {sortedStudios.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </AdminSelect>
          </AdminField>
        )}
      </div>

      {list.length === 0 ? (
        <AdminEmpty
          title={`No ${subTab === "company" ? "company standards" : "templates for this studio"} yet`}
        >
          {canEditHere
            ? "Create one above."
            : "An admin can add them for this studio."}
        </AdminEmpty>
      ) : (
        <div className="adm-cards">
          {list.map((p) => {
            const startLine = startListLine(p, nameFor);
            const isDefault = p.tier === "company" && startLine !== null && p.start?.default === true;
            return (
            <AdminPanel key={p.id} className="adm-tpl">
              <div className="adm-tpl__body">
                <h4 className="adm-tpl__name">{p.name}</h4>
                {p.description && (
                  <p className="adm-tpl__desc">{p.description}</p>
                )}
                {startLine && <p className="adm-tpl__start">{startLine}</p>}
                {isDefault && (
                  <span>
                    <AdminBadge tone="live">Head office's default</AdminBadge>
                  </span>
                )}
                <ol className="adm-tpl__seq">
                  {p.machineIds.map((id, i) => (
                    <li key={id}>
                      <span className="adm-tpl__n">{i + 1}</span>
                      {nameFor(id)}
                      {p.machineNotes?.[id] && (
                        <span className="adm-tpl__note">Note</span>
                      )}
                    </li>
                  ))}
                </ol>
                <div className="adm-tpl__actions">
                  <AdminButton
                    size="sm"
                    disabled={!canEditHere}
                    onClick={() => openEdit(p)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    variant="danger"
                    busy={busyId === p.id}
                    disabled={!canEditHere || busyId === p.id}
                    aria-label={`Delete ${p.name}`}
                    onClick={() => setDeleting(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </AdminButton>
                </div>
              </div>
            </AdminPanel>
            );
          })}
        </div>
      )}

      {/* Trainer-saved presets, read-only, with promotion. */}
      {subTab === "studio" && trainerPresets.length > 0 && (
        <AdminPanel
          title="Saved by trainers at this studio"
          subtitle="Ad-hoc presets trainers saved themselves. Promoting one makes it an official studio template; the trainer's original is left alone."
          flush
        >
          <AdminRows>
            {trainerPresets.map((p) => (
              <AdminRow
                key={p.id}
                name={p.name}
                meta={`${p.machineIds.length} machines · ${p.createdByName ?? "a trainer"}`}
                trailing={
                <AdminButton
                  size="sm"
                  busy={busyId === p.id}
                  disabled={!canStudio || busyId === p.id}
                  onClick={() => handlePromote(p)}
                >
                  <Upload className="h-3.5 w-3.5" /> Promote
                </AdminButton>
                }
              />
            ))}
          </AdminRows>
        </AdminPanel>
      )}

      {/* Its own close asks first when something is typed (the unsaved-changes registry). */}
      <Dialog open={!!draft} onOpenChange={(o) => !o && leave.guard(close)}>
        <DialogContent className="max-h-[92dvh] sm:max-w-5xl lg:max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? `Edit ${draft?.name || "template"}` : "New template"}
            </DialogTitle>
          </DialogHeader>
          {draft && (
            <>
              <RoutineTemplateForm
                value={draft}
                onChange={setDraft}
                catalog={catalog}
                otherDefaultName={otherDefault?.name ?? null}
                pendingWord={pendingWord}
                onPendingWordChange={setPendingWord}
              />
              <div className="adm adm-dialog__actions">
                <AdminButton variant="ghost" onClick={() => leave.guard(close)}>
                  Cancel
                </AdminButton>
                {/* A Save is blue (the Navy Frame's follow-up, Oct 4 2026): orange is only now and go. */}
                <AdminButton
                  variant="primary"
                  onClick={handleSave}
                  busy={saving}
                  disabled={saving || (!!editingId && !dirty)}
                >
                  {editingId ? "Save changes" : "Create template"}
                </AdminButton>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `Delete "${deleting.name}"?` : ""}
        body={
          deleting && startListLine(deleting, nameFor) !== null
            ? subTab === "company"
              ? "Every studio loses this standard, and Start a plan stops offering it as a starting routine. Plans already started from it, and routines built from it, are not touched."
              : "This studio loses the template, and Start a plan stops offering it as a starting routine. Plans already started from it, and routines built from it, are not touched."
            : subTab === "company"
              ? "Every studio loses this standard. Routines already built from it on clients' records are not touched."
              : "This studio loses the template. Routines already built from it on clients' records are not touched."
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const p = deleting;
          setDeleting(null);
          if (p) void handleDelete(p);
        }}
      />
    </AdminScreen>
  );
}

const byName = (a: RoutinePreset, b: RoutinePreset) =>
  (a.name || "").localeCompare(b.name || "");
