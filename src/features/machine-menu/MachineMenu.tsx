/**
 * THE MACHINE MENU — the frame: one card for a client on one machine.
 *
 * Tapping a machine's name on the Journey grid opens this, in an active
 * session and on the client profile (machine menu design §B, "The frame").
 * It replaces the session's machine sheet and the profile's machine window:
 * two frames (680px and 760px) with different cards in them become one.
 *
 *   - A centred Base UI Dialog whose DialogTitle is the header's machine and
 *     client names. `min(820px, 100vw − 60px)` wide (760px on an 820-wide
 *     iPad), `min(1080px, 100vw − 64px)` in landscape from 1000px, 88dvh
 *     tall; a full-width sheet with a 16px inset on a phone (machine-menu.css).
 *   - Nothing saves on Close, Escape or a tap on the backdrop: all three go
 *     through the unsaved gate. The body is a leave scope, so the question
 *     ("You have unsaved changes to Leg Press settings for Avery. Leave
 *     without saving?") is asked about the card's own drafts only — in a
 *     session the note draft is the tracker's and survives a close, so it is
 *     never asked about here.
 *   - The body is keyed `${clientId}_${machineId}`, so a draft never follows
 *     to the next machine or the next client.
 *   - Nothing is read until the first open (the catalog listener included).
 *     From then the frame stays mounted, so tapping machine after machine
 *     doesn't open the catalog listener again. The card's own reads (the
 *     setting changes, the floor's notes) are made each time it opens.
 *   - Imported statically, never loaded on demand: the session's warm-up
 *     covers it, and a deploy can't strand it mid-session.
 *   - QUICK SET-UP (the open session round, Oct 9 2026; AJ's "2a"): the Now
 *     Bar's Set up opens it with `focusDial` (the first empty dial's editor
 *     open, its field given the focus in place of the dialog's first
 *     button) and `closeOnSave` (Save closes it, and the toast keeps a
 *     ten-second Undo). The same card, the same blocks in the same order.
 */
import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useMachineCatalog } from "../../hooks/useMachineCatalog";
import { UnsavedChangesScope, useLeaveScope } from "../unsaved-changes";
import { MachineMenuBody } from "./MachineMenuBody";
import type { MachineMenuHost } from "./useMachineMenuData";
import "./machine-menu.css";

export interface MachineMenuProps {
  open: boolean;
  /** The machine to show. The card stays shut for a machine the door doesn't know. */
  machineId: string | null;
  /** Called once the card may close (the unsaved gate has agreed). */
  onClose: () => void;
  /** What the door hands the card (useMachineMenuData's `MachineMenuHost`). */
  host: MachineMenuHost;
  /** Open on the first empty dial's editor (the Now Bar's Set up). Either door may pass it. */
  focusDial?: boolean;
  /** Save closes the card, with a ten-second Undo in the toast (the Now Bar's Set up). */
  closeOnSave?: boolean;
}

/** Set up's first field takes the focus the dialog would give its first button; without one, the dialog's own. */
function firstDialField(): HTMLElement | true {
  return document.querySelector<HTMLElement>('.mm-dialog [data-block="settings"] [data-editor="field"] input') ?? true;
}

export function MachineMenu(props: MachineMenuProps) {
  // Mounted on the first open, kept thereafter (see "Nothing is read" above).
  const [armed, setArmed] = useState(props.open);
  useEffect(() => {
    if (props.open) setArmed(true);
  }, [props.open]);
  if (!armed && !props.open) return null;
  return <MenuFrame {...props} />;
}

function MenuFrame({ open, machineId, onClose, host, focusDial = false, closeOnSave = false }: MachineMenuProps) {
  const { byId: catalogById } = useMachineCatalog();
  const scope = useLeaveScope();
  const known = !!machineId && host.machines.some((m) => m.id === machineId);
  const close = useCallback(() => scope.guard(onClose), [scope, onClose]);

  return (
    <Dialog
      open={open && known}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="mm-dialog max-w-none sm:max-w-none p-0 gap-0 border-0 ring-0 bg-transparent shadow-none rounded-[20px]"
        initialFocus={focusDial ? firstDialField : undefined}
      >
        <UnsavedChangesScope scope={scope}>
          <MachineMenuBody
            key={`${host.clientId}_${machineId ?? ""}`}
            host={host}
            machineId={machineId}
            catalogById={catalogById}
            onClose={close}
            titleAs={DialogTitle}
            focusDial={focusDial}
            closeOnSave={closeOnSave}
          />
        </UnsavedChangesScope>
      </DialogContent>
    </Dialog>
  );
}
