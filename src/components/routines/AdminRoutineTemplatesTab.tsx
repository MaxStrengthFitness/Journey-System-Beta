import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc,
} from "firebase/firestore";
import {
  Building2, ClipboardList, Globe2, Pencil, Plus, Trash2, Upload,
} from "lucide-react";
import { auth, db } from "../../firebase";
import { RoutinePreset, RoutinePresetTier, Studio, Trainer } from "../../types";
import { useMachineCatalog } from "../../hooks/useMachineCatalog";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import { canAuthorTier, normalizeRoutinePreset } from "../../lib/routine-templates";
import { useToast } from "../../contexts/ToastContext";
import { RoutineTemplateForm, emptyRoutineTemplate } from "./RoutineTemplateForm";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminHeader,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminScreen,
  AdminSelect,
} from "../../features/admin/primitives";

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
 */

type SubTab = "company" | "studio";

export function AdminRoutineTemplatesTab({
  studios,
  authTrainer,
}: {
  studios: Studio[];
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    setEditingId(null);
    setDraft({
      ...emptyRoutineTemplate(),
      tier,
      scope: tier === "company" ? "global" : (studioId ?? ""),
      studioId: tier === "company" ? undefined : (studioId ?? undefined),
    });
  };

  const openEdit = (p: RoutinePreset) => {
    setEditingId(p.id ?? null);
    setDraft(normalizeRoutinePreset(p));
  };

  const close = () => { setDraft(null); setEditingId(null); };

  const handleSave = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    if (!name) { toastError("Give the template a name first."); return; }
    if (draft.machineIds.length === 0) {
      toastError("A template needs at least one machine.");
      return;
    }
    const tier = draft.tier ?? "company";
    if (tier === "studio" && !draft.studioId) {
      toastError("Pick a studio for this template first.");
      return;
    }

    setSaving(true);
    try {
      const uid = auth.currentUser?.uid ?? null;
      const base = {
        name,
        description: draft.description?.trim() ?? "",
        machineIds: draft.machineIds,
        machineNotes: draft.machineNotes ?? {},
        tier,
        scope: tier === "company" ? "global" : draft.studioId!,
        // Omitted, not null, for company templates: the rules read
        // studioId through .get(...,'') and an absent field is the honest
        // representation of "this belongs to no single studio".
        ...(tier === "studio" ? { studioId: draft.studioId } : {}),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      };

      if (editingId) {
        await setDoc(doc(db, "routinePresets", editingId), base, { merge: true });
      } else {
        await addDoc(collection(db, "routinePresets"), {
          ...base,
          createdAt: serverTimestamp(),
          createdBy: uid,
          createdByName: authTrainer?.fullName ?? "Admin",
        });
      }
      toastSuccess(`"${name}" saved.`);
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
          {list.map((p) => (
            <AdminPanel key={p.id} className="adm-tpl">
              <div className="adm-tpl__body">
                <h4 className="adm-tpl__name">{p.name}</h4>
                {p.description && (
                  <p className="adm-tpl__desc">{p.description}</p>
                )}
                <ol className="adm-tpl__seq">
                  {p.machineIds.map((id, i) => (
                    <li key={id}>
                      <span className="adm-tpl__n">{i + 1}</span>
                      {nameFor(id)}
                      {p.machineNotes?.[id] && (
                        <span className="adm-tpl__note">note</span>
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
                    onClick={() => handleDelete(p)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </AdminButton>
                </div>
              </div>
            </AdminPanel>
          ))}
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

      <Dialog open={!!draft} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[92dvh] sm:max-w-5xl lg:max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="uppercase tracking-tight">
              {editingId ? `Edit ${draft?.name || "template"}` : "New template"}
            </DialogTitle>
          </DialogHeader>
          {draft && (
            <>
              <RoutineTemplateForm
                value={draft}
                onChange={setDraft}
                catalog={catalog}
              />
              <div className="adm adm-dialog__actions">
                <AdminButton variant="ghost" onClick={close}>
                  Cancel
                </AdminButton>
                <AdminButton
                  variant="hero"
                  onClick={handleSave}
                  busy={saving}
                  disabled={saving}
                >
                  {editingId ? "Save changes" : "Create template"}
                </AdminButton>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AdminScreen>
  );
}

const byName = (a: RoutinePreset, b: RoutinePreset) =>
  (a.name || "").localeCompare(b.name || "");
