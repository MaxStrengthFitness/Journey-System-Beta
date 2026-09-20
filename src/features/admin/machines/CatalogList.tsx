import { useMemo, useState } from "react";
import {
  collectionGroup,
  doc,
  getCountFromServer,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { Archive, Check, Pencil, Plus, RotateCcw, ShieldAlert } from "lucide-react";
import { auth, db } from "../../../firebase";
import { useToast } from "../../../contexts/ToastContext";
import { resolveMachineOrder } from "../../../data/machine-display-order";
import type { MachineCatalogEntry } from "../../../types/machines";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
  ConfirmDialog,
} from "../primitives";
import { isStandardSetMachine } from "../studios/registry";
import { completeness, describeGaps } from "./completeness";
import { definitionOf } from "./definition-defaults";

/**
 * THE CATALOG LIST.
 *
 * Round: Machine authoring, Sep 2026. AJ: "how the machines look in that
 * catalog for the admin dashboard looks kind of bad."
 *
 * It was. Four things, all visible at once:
 *
 *  - Two headings. AdminMachinesTab rendered "Machine catalog" and a
 *    subtitle, then this rendered its own <h2>Machines</h2> and another
 *    paragraph, forty pixels apart.
 *  - Two design systems. The header and the submissions queue were `adm`
 *    hairline rows; the machine list under them was shadcn <Card>s with a
 *    ring and a radius, one tall card per machine for a single line of text.
 *  - The raw Firestore id on every row, in a mono badge, beside the name.
 *  - A meta line that was mostly wrong and an order that was effectively
 *    random, both for the same reason: the documents were legacy-shaped, so
 *    movementPattern was missing (every row read "Upper Body: Horizontal
 *    Push") and defaultOrder was missing (all twenty tied at 999 and fell
 *    back to Firestore snapshot order).
 *
 * Now it is one adm row per machine at 48px, ordered by the display order the
 * rest of the app uses, and each row says what that machine is still missing.
 * That last part is the real change: twenty identical rows gave a manager no
 * way to see that the leg press had no baseline without opening it.
 */

export function CatalogList({
  catalog,
  canEdit,
  onOpen,
  onNew,
}: {
  catalog: MachineCatalogEntry[];
  canEdit: boolean;
  onOpen: (m: MachineCatalogEntry) => void;
  onNew: () => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [search, setSearch] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [askRetire, setAskRetire] = useState<{
    machine: MachineCatalogEntry;
    inUse: number;
  } | null>(null);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((m) => (showRetired ? true : m.status !== "retired"))
      .filter(
        (m) => !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
      )
      .map((m) => {
        const def = definitionOf(m);
        return { machine: m, state: completeness(def), def };
      })
      // The order the floor walks them, not whatever Firestore returned.
      // resolveMachineOrder falls back to DEFAULT_MACHINE_DISPLAY_ORDER, which
      // is why a legacy document with no defaultOrder still lands in place.
      .sort(
        (a, b) =>
          resolveMachineOrder(a.machine.id, a.machine.defaultOrder) -
          resolveMachineOrder(b.machine.id, b.machine.defaultOrder),
      );
  }, [catalog, search, showRetired]);

  const unfinished = rows.filter((r) => r.state.gaps.length > 0).length;

  const setStatus = async (m: MachineCatalogEntry, status: "active" | "retired") => {
    setBusy(m.id);
    try {
      await updateDoc(doc(db, "machines", m.id), {
        status,
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid ?? null,
      });
      toastSuccess(status === "active" ? `${m.name} restored.` : `${m.name} retired.`);
    } catch (err) {
      console.error(err);
      toastError("Could not change status.");
    } finally {
      setBusy(null);
    }
  };

  const handleRetire = async (m: MachineCatalogEntry) => {
    if (m.status === "retired") {
      await setStatus(m, "active");
      return;
    }
    setBusy(m.id);
    let inUse = -1;
    try {
      const snap = await getCountFromServer(
        query(collectionGroup(db, "roster"), where("basedOn", "==", m.id)),
      );
      inUse = snap.data().count;
    } catch {
      // Index still building — ask anyway, without the count.
      inUse = -1;
    }
    setBusy(null);
    setAskRetire({ machine: m, inUse });
  };

  const toggleStandardSet = async (m: MachineCatalogEntry) => {
    try {
      await updateDoc(doc(db, "machines", m.id), {
        // isStandardSetMachine treats an ABSENT flag as in-the-set, so a
        // legacy document with no flag must be written false to come out, not
        // toggled off an undefined. The old switch read `checked={m.inStandardSet}`
        // and showed OFF for all twenty while the seeder treated them as ON.
        inStandardSet: !isStandardSetMachine(m),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid ?? null,
      });
    } catch (err) {
      console.error(err);
      toastError("Could not update the standard set.");
    }
  };

  const retireBody = (inUse: number) =>
    (inUse > 0
      ? `${inUse} studio floor${inUse === 1 ? "" : "s"} still ${
          inUse === 1 ? "has" : "have"
        } it. `
      : inUse === 0
        ? "No studio floor has it today. "
        : "How many floors have it could not be counted just now. ") +
    "Retiring takes it out of the standard a new floor starts with and marks it retired in All MSF machines, where no floor can add it; a floor that already has it keeps it, and every set ever logged on it stays. Restore brings it back.";

  return (
    <AdminPanel
      title="Every machine"
      subtitle={
        unfinished > 0
          ? `${catalog.length} in the catalog. ${unfinished} still ${
              unfinished === 1 ? "has a gap" : "have gaps"
            } a trainer would notice.`
          : `${catalog.length} in the catalog, all filled in.`
      }
      actions={
        canEdit ? (
          <AdminButton variant="hero" onClick={onNew}>
            <Plus className="w-4 h-4" /> New machine
          </AdminButton>
        ) : undefined
      }
      flush
    >
      <div className="adm-panel__body">
        <div className="adm-grid">
          <div className="adm-field adm-field--wide">
            <label className="adm-label" htmlFor="catalog-search">
              Find a machine
            </label>
            <AdminInput
              id="catalog-search"
              value={search}
              placeholder="Leg press, lumbar, neck"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="adm-field">
            <span className="adm-label">Retired machines</span>
            <AdminButton
              variant="quiet"
              onClick={() => setShowRetired((v) => !v)}
              aria-pressed={showRetired}
            >
              {showRetired ? "Hide retired" : "Show retired"}
            </AdminButton>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <AdminEmpty title="Nothing matches that">
          Try a shorter search, or turn on retired machines.
        </AdminEmpty>
      ) : (
        <AdminRows>
          {rows.map(({ machine: m, state }) => {
            const inSet = isStandardSetMachine(m);
            const meta = [
              m.movementPattern,
              m.executionPosture,
              m.execution?.concentricSeconds
                ? `${m.execution.concentricSeconds}s up, ${m.execution.eccentricSeconds}s down`
                : null,
              m.execution?.requiresHandoff ? "handoff" : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <AdminRow
                key={m.id}
                leading={
                  <span className="adm-me__order">
                    {resolveMachineOrder(m.id, m.defaultOrder)}
                  </span>
                }
                name={
                  <>
                    {m.name}
                    {m.status === "retired" && (
                      <AdminBadge tone="neutral">Retired</AdminBadge>
                    )}
                    {m.status === "draft" && <AdminBadge tone="warn">Draft</AdminBadge>}
                    {m.execution?.neverToFailure && (
                      <AdminBadge tone="alert" icon={<ShieldAlert className="w-3 h-3" />}>
                        Never to failure
                      </AdminBadge>
                    )}
                  </>
                }
                meta={
                  <>
                    {meta || "No movement pattern set"}
                    {state.gaps.length > 0 && (
                      <>
                        {" — "}
                        <span className="adm-me__needs">{describeGaps(state.gaps, 2)}</span>
                      </>
                    )}
                  </>
                }
                trailing={
                  canEdit ? (
                    <div className="adm-me__rowacts">
                      <AdminButton
                        variant={inSet ? "quiet" : "ghost"}
                        size="sm"
                        onClick={() => void toggleStandardSet(m)}
                        aria-pressed={inSet}
                      >
                        {inSet ? <Check className="w-3.5 h-3.5" /> : null}
                        {inSet ? "In the standard" : "Not in the standard"}
                      </AdminButton>
                      <AdminButton variant="primary" size="sm" onClick={() => onOpen(m)}>
                        <Pencil className="w-3.5 h-3.5" /> Open
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        size="sm"
                        busy={busy === m.id}
                        onClick={() => void handleRetire(m)}
                      >
                        {m.status === "retired" ? (
                          <>
                            <RotateCcw className="w-3.5 h-3.5" /> Restore
                          </>
                        ) : (
                          <>
                            <Archive className="w-3.5 h-3.5" /> Retire
                          </>
                        )}
                      </AdminButton>
                    </div>
                  ) : (
                    <AdminBadge tone={inSet ? "ok" : "neutral"}>
                      {inSet ? "In the standard" : "Not in the standard"}
                    </AdminBadge>
                  )
                }
              />
            );
          })}
        </AdminRows>
      )}

      {unfinished > 0 && canEdit && (
        <div className="adm-panel__body">
          <AdminNotice tone="info">
            A gap is not a bug — it is a machine nobody has finished describing.
            Open one and the section rail says which part is missing.
          </AdminNotice>
        </div>
      )}

      <ConfirmDialog
        open={!!askRetire}
        title={askRetire ? `Retire ${askRetire.machine.name}?` : ""}
        body={askRetire ? retireBody(askRetire.inUse) : undefined}
        confirmLabel="Retire it"
        destructive
        onConfirm={() => {
          if (askRetire) void setStatus(askRetire.machine, "retired");
          setAskRetire(null);
        }}
        onCancel={() => setAskRetire(null)}
      />
    </AdminPanel>
  );
}
