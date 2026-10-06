/**
 * ADD FROM MSF — the MSF machines not on this floor, one tap each.
 *
 * Wave 2 of the Machine Catalog room (Catalog R5): the floor editor's way to
 * put a machine on the floor. The standard's machines first (what most
 * floors run), then the rest of the catalog, then the ones this studio
 * switched off, which come back with their local set-up. Adopted, never
 * pushed: nothing here reaches a floor until its leader taps Add.
 *
 * It used to be the floor list itself: every catalog machine the studio did
 * not have sat in the list, dimmed, with "We have this". The floor list is
 * the floor now, and what could join it is here.
 */
import { Plus, Sparkles, X } from "lucide-react";
import type { Addable, AddableFromMsf } from "./floor-editor";
import { AdminButton, AdminEmpty } from "../primitives";
import "../admin.css";

export function AddFromMsfDialog({
  studioName,
  addable,
  busy,
  onAdd,
  onAddStandard,
  onClose,
}: {
  studioName: string;
  addable: AddableFromMsf;
  /** The machine being added ("__standard__" for all of the standard), or null. */
  busy: string | null;
  onAdd: (machineId: string) => void;
  /** Every standard machine not on the floor, in one tap. */
  onAddStandard: () => void;
  onClose: () => void;
}) {
  const nothing = addable.standard.length + addable.others.length + addable.switchedOff.length === 0;

  const group = (title: string, items: Addable[], label: (a: Addable) => string) =>
    items.length === 0 ? null : (
      <section className="flex flex-col gap-1.5" aria-label={title}>
        <h4 className="adm-label">{title}</h4>
        <ul className="adm-rows overflow-hidden rounded-[10px] border border-[var(--adm-border)]">
          {items.map((a) => (
            <li key={a.machineId} className="flex min-h-10 flex-wrap items-center justify-between gap-2 px-3.5 py-1.5">
              <span className="adm-row__name break-words">{a.name}</span>
              <AdminButton size="sm" variant="quiet" busy={busy === a.machineId} disabled={busy !== null} onClick={() => onAdd(a.machineId)}>
                {busy !== a.machineId && (
                  <>
                    <Plus className="h-3.5 w-3.5" aria-hidden /> {label(a)}
                  </>
                )}
              </AdminButton>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div
      className="adm-scrim adm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && busy === null) onClose();
      }}
    >
      <div className="adm-dialog" role="dialog" aria-modal="true" aria-label="Add from MSF" style={{ maxWidth: 560 }}>
        <div className="adm-dialog__body">
          <h3 className="adm-dialog__title">Add from MSF</h3>
          <p className="adm-dialog__text">
            MSF machines that aren&apos;t on {studioName}&apos;s floor, and the machines {studioName} took off it. A machine you
            add follows the MSF standard until you set it up for {studioName}, and joins the end of your walking order.
          </p>
          {nothing ? (
            <AdminEmpty title={`Every MSF machine is on ${studioName}'s floor`}>
              A machine the catalog doesn&apos;t have is New machine, on the floor list.
            </AdminEmpty>
          ) : (
            <div className="flex flex-col gap-4">
              {addable.standard.length > 1 && (
                <div>
                  <AdminButton variant="primary" busy={busy === "__standard__"} disabled={busy !== null} onClick={onAddStandard}>
                    {busy !== "__standard__" && <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                    Add all {addable.standard.length} from the MSF standard
                  </AdminButton>
                </div>
              )}
              {group("In the MSF standard", addable.standard, () => "Add")}
              {group("Also in the MSF catalog", addable.others, () => "Add")}
              {group(`Switched off at ${studioName}`, addable.switchedOff, () => "Put it back")}
            </div>
          )}
        </div>
        <div className="adm-dialog__foot">
          <AdminButton variant="ghost" onClick={onClose} disabled={busy !== null}>
            <X className="h-3.5 w-3.5" aria-hidden /> Close
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
