/**
 * OTHER NAMES FIND KNOWS — head office's own, on the machine's page in the
 * catalog editor.
 *
 * Wave 2 of the Machine Catalog room (AJ's "all yes", Sep 28 2026, to
 * "aliases head office can edit"). Find already knows every name the code
 * holds for a movement (features/catalog/names.ts: the Academy's, the
 * floors', FileMaker's, the codes); this is where an administrator adds the
 * names the floor actually uses that no table had — a studio's nickname, a
 * maker's name for the machine. Stored as `aliases: string[]` on the catalog
 * document, merged by names.ts into Find's table and Learning's search.
 *
 * A name is added or taken off at once (arrayUnion / arrayRemove), apart
 * from the definition's save bar: it is not part of what the machine IS.
 * A name that says nothing new, or that another movement already goes by,
 * is refused before it is saved (`aliasProblem`), in words. What is typed
 * joins the unsaved-changes guard until it is added.
 *
 * Only for the twenty movements: a catalog machine that is none of them is
 * found by its own name, and this card isn't drawn for it. Administrators
 * only; everyone else reads the names.
 */
import { useMemo, useState } from "react";
import { arrayRemove, arrayUnion, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Tags } from "lucide-react";
import { auth, db } from "../../../firebase";
import { useToast } from "../../../contexts/ToastContext";
import { useOptionalActiveStudio } from "../../../contexts/ActiveStudioContext";
import { useMachineCatalog } from "../../../hooks/useMachineCatalog";
import type { MachineCatalogEntry } from "../../../types/machines";
import { useUnsavedChanges } from "../../unsaved-changes";
import { canonicalMachineId } from "../../catalog/machine-identity";
import {
  ALIAS_MAX_LENGTH,
  ALIASES_MAX,
  MOVEMENTS,
  aliasProblem,
  aliasesByMovement,
  headOfficeAliasesOf,
  movementsWithAliases,
  tidyAlias,
} from "../../catalog/names";
import { AdminBadge, AdminButton, AdminInput, AdminPanel } from "../primitives";

/** The movement a catalog document is, or null when it is none of the twenty. */
export function movementIdOfCatalogMachine(machine: Pick<MachineCatalogEntry, "id">): string | null {
  const id = canonicalMachineId(machine.id);
  return MOVEMENTS[id] ? id : null;
}

export function MachineAliases({ machine, canEdit }: { machine: MachineCatalogEntry; canEdit?: boolean }) {
  const ctx = useOptionalActiveStudio();
  const allowed = canEdit ?? ctx?.isAdmin ?? false;
  const movementId = movementIdOfCatalogMachine(machine);
  const { catalog } = useMachineCatalog();
  const { success: toastSuccess, error: toastError } = useToast();
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Every movement's names as Find has them, head office's included: what a
  // new name is checked against, so it can't mean another movement.
  const table = useMemo(() => movementsWithAliases(aliasesByMovement(catalog)), [catalog]);
  const own = headOfficeAliasesOf(machine);
  useUnsavedChanges(allowed && typed.trim() !== "", `a name for ${machine.name || "this machine"}`, {
    onDiscard: () => setTyped(""),
  });

  if (!movementId) return null;
  const code = MOVEMENTS[movementId];
  // The code's own names, as Find already reads them (head office's aside).
  const known = [code.name, ...code.codes, ...(code.floorName ? [code.floorName] : []), ...code.aliases].filter(
    (n, i, all) => all.findIndex((x) => x.toLowerCase() === n.toLowerCase()) === i,
  );

  const stamp = () => ({ updatedAt: serverTimestamp(), updatedBy: auth.currentUser?.uid ?? null });

  const add = async () => {
    const name = tidyAlias(typed);
    const why =
      own.length >= ALIASES_MAX ? `A machine carries at most ${ALIASES_MAX} of head office's names.` : aliasProblem(name, movementId, table);
    if (why) {
      setProblem(why);
      return;
    }
    setBusy("__add__");
    try {
      await updateDoc(doc(db, "machines", machine.id), { aliases: arrayUnion(name), ...stamp() });
      setTyped("");
      setProblem(null);
      toastSuccess(`Find knows “${name}” for ${code.name} now, on every floor.`);
    } catch (err) {
      console.error("[catalog] add a name:", err);
      toastError("Could not add the name. Catalog writes are administrators'.");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (name: string) => {
    setBusy(name);
    try {
      await updateDoc(doc(db, "machines", machine.id), { aliases: arrayRemove(name), ...stamp() });
      toastSuccess(`“${name}” is off ${code.name}.`);
    } catch (err) {
      console.error("[catalog] take a name off:", err);
      toastError("Could not take the name off. Catalog writes are administrators'.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminPanel
      title="Other names"
      icon={<Tags className="w-4 h-4" />}
      subtitle={`Find opens ${code.name} by every name it goes by, on every floor.`}
    >
      <div className="flex flex-col gap-3" data-testid="machine-aliases">
        <div className="flex flex-col gap-1.5">
          <span className="adm-label">From the Academy, the floors and FileMaker</span>
          <div className="flex flex-wrap gap-1.5">
            {known.map((n) => (
              <AdminBadge key={n} tone="neutral">
                {n}
              </AdminBadge>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="adm-label">Head office&apos;s</span>
          {own.length === 0 ? (
            <p className="adm-row__meta">None yet.</p>
          ) : (
            <ul className="adm-rows overflow-hidden rounded-[10px] border border-[var(--adm-border)]">
              {own.map((n) => (
                <li key={n} className="flex min-h-10 flex-wrap items-center justify-between gap-2 px-3.5 py-1.5">
                  <span className="adm-row__name break-words">{n}</span>
                  {allowed && (
                    <AdminButton
                      size="sm"
                      variant="ghost"
                      aria-label={`Take “${n}” off`}
                      busy={busy === n}
                      onClick={() => void remove(n)}
                    >
                      {busy !== n && "Take off"}
                    </AdminButton>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {allowed && (
          <div className="flex flex-col gap-1.5">
            <label className="adm-label" htmlFor={`alias-${machine.id}`}>
              Add a name
            </label>
            <div className="flex flex-wrap gap-2">
              <AdminInput
                id={`alias-${machine.id}`}
                className="min-w-0 flex-1"
                value={typed}
                maxLength={ALIAS_MAX_LENGTH}
                placeholder="As a trainer would say it"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                invalid={Boolean(problem)}
                onChange={(e) => {
                  setTyped(e.target.value);
                  if (problem) setProblem(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void add();
                  }
                }}
              />
              <AdminButton variant="primary" busy={busy === "__add__"} disabled={typed.trim() === ""} onClick={() => void add()}>
                Add
              </AdminButton>
            </div>
            {problem && <p className="adm-hint adm-hint--error">{problem}</p>}
          </div>
        )}
      </div>
    </AdminPanel>
  );
}
