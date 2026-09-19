/**
 * THE MSF STANDARD SET — a first-class view on the Catalog tab.
 *
 * Operations round, Sep 2026. The set was a switch per card in a long list;
 * a founder deciding what a new studio starts with could not see the set as
 * a set, nor put it in order. Here it is: the machines in the order a new
 * floor starts in, move up / move down, take one out, put one in — and the
 * sentence that matters: nothing here reaches a floor by itself. A floor
 * adopts (My Studio → Machines → New in the MSF standard). Writes are
 * administrators' (the rules); everyone else reads.
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, ListOrdered, Minus, Plus } from "lucide-react";
import { doc, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { auth, db } from "../../../firebase";
import { useMachineCatalog } from "../../../hooks/useMachineCatalog";
import { useToast } from "../../../contexts/ToastContext";
import type { MachineCatalogEntry } from "../../../types/machines";
import { AdminBadge, AdminButton, AdminEmpty, AdminNotice, AdminPanel, ConfirmDialog } from "../primitives";
import { outsideStandard, reorderPlan, standardSet } from "./standard-set";

export function StandardSetPanel({ canEdit }: { canEdit: boolean }) {
  const { catalog, loading } = useMachineCatalog();
  const { success: toastSuccess, error: toastError } = useToast();
  const set = standardSet(catalog);
  const outside = outsideStandard(catalog);
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<MachineCatalogEntry | null>(null);

  const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid ?? null });

  const move = async (index: number, to: number) => {
    const writes = reorderPlan(set, index, to);
    if (writes.length === 0) return;
    setBusy(set[index].id);
    try {
      const batch = writeBatch(db);
      for (const w of writes) batch.update(doc(db, "machines", w.id), { defaultOrder: w.defaultOrder, ...stamp() });
      await batch.commit();
    } catch (err) {
      console.error(err);
      toastError("Could not reorder the standard set.");
    } finally {
      setBusy(null);
    }
  };

  const setMembership = async (m: MachineCatalogEntry, inStandardSet: boolean) => {
    setBusy(m.id);
    try {
      await updateDoc(doc(db, "machines", m.id), { inStandardSet, ...stamp() });
      toastSuccess(inStandardSet ? `${m.name} is in the standard set. Floors are offered it under "New in the MSF standard".` : `${m.name} is out of the standard set. Floors that have it keep it.`);
    } catch (err) {
      console.error(err);
      toastError("Could not change the standard set. Catalog writes are administrators'.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminPanel
      title="The MSF standard set"
      icon={<ListOrdered className="w-4 h-4" />}
      subtitle={`${set.length} machine${set.length === 1 ? "" : "s"}, in the order a new floor starts in. A floor adopts this set — nothing here is pushed to a studio, and taking a machine out never removes it from a floor that has it.`}
      flush
    >
      {loading ? (
        <div className="p-4">
          <AdminEmpty title="Reading the catalog…" />
        </div>
      ) : set.length === 0 ? (
        <div className="p-4">
          <AdminEmpty title="No standard set yet">Put machines in from the list below; new floors will start with them.</AdminEmpty>
        </div>
      ) : (
        <ol className="adm-std__list">
          {set.map((m, i) => (
            <li key={m.id} className="adm-std__row">
              <span className="adm-std__pos">{i + 1}</span>
              <span className="adm-std__main">
                <span className="adm-std__name">{m.name}</span>
                <span className="adm-std__meta">{m.id}</span>
              </span>
              {canEdit && (
                <span className="adm-std__actions">
                  <AdminButton size="sm" variant="quiet" iconOnly aria-label={`Move ${m.name} up`} disabled={i === 0 || busy !== null} onClick={() => move(i, i - 1)}>
                    <ArrowUp className="w-4 h-4" />
                  </AdminButton>
                  <AdminButton size="sm" variant="quiet" iconOnly aria-label={`Move ${m.name} down`} disabled={i === set.length - 1 || busy !== null} onClick={() => move(i, i + 1)}>
                    <ArrowDown className="w-4 h-4" />
                  </AdminButton>
                  <AdminButton size="sm" variant="quiet" busy={busy === m.id} onClick={() => setRemoving(m)}>
                    <Minus className="w-3.5 h-3.5" /> Take out
                  </AdminButton>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {!loading && (
        <div className="adm-std__outside">
          <div className="adm-std__outside-head">
            <span className="adm-std__outside-title">In the catalog, not in the standard</span>
            <AdminBadge tone="neutral">{outside.length}</AdminBadge>
          </div>
          {outside.length === 0 ? (
            <p className="adm-std__none">Every active machine is in the standard set.</p>
          ) : (
            <ul className="adm-std__list">
              {outside.map((m) => (
                <li key={m.id} className="adm-std__row">
                  <span className="adm-std__pos" aria-hidden="true">·</span>
                  <span className="adm-std__main">
                    <span className="adm-std__name">{m.name}</span>
                    <span className="adm-std__meta">{m.id} — studios adopt it one by one from All MSF machines</span>
                  </span>
                  {canEdit && (
                    <span className="adm-std__actions">
                      <AdminButton size="sm" variant="quiet" busy={busy === m.id} onClick={() => void setMembership(m, true)}>
                        <Plus className="w-3.5 h-3.5" /> Put in
                      </AdminButton>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!canEdit && (
        <div className="p-3">
          <AdminNotice tone="info">The standard set is set by administrators. A studio takes it from My Studio → Machines.</AdminNotice>
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Take ${removing.name} out of the standard set?` : ""}
        body={'New floors will not start with it, and existing floors will see it under "No longer in the standard" — but no floor loses it, and every set ever logged on it stays.'}
        confirmLabel="Take it out"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const m = removing;
          setRemoving(null);
          if (m) await setMembership(m, false);
        }}
      />
    </AdminPanel>
  );
}
