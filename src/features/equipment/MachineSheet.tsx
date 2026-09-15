import { WatchOutCard } from "./WatchOutCard";
import { machineWatchOuts } from "../../lib/clinical-watchouts";
import { useMemo, useState } from "react";
import { Sparkles, TriangleAlert, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useMachineCatalog } from "../../hooks/useMachineCatalog";
import { useActiveStudio } from "../../ActiveStudioContext";
import type { Client, ClientMachineSetting, Machine } from "../../types";
import { toEquipmentMachines } from "./adapters";
import { SettingsCard } from "./SettingsCard";
import { MachineNotes } from "./MachineNotes";
import { SetupGuide } from "./SetupGuide";
import { ChangeHistory } from "./ChangeHistory";
import type { JournalContext, MutationAuthor } from "./mutations";

/**
 * THE MACHINE SHEET — one place, mid-session, for everything about one
 * machine and one client.
 *
 * What it replaces: the Active Session used to have TWO modals. Tapping a
 * machine cell opened "Machine Settings" (dials + an optional reason).
 * A separate small icon on the same row opened "Machine Notes". They were
 * different shapes, different widths, wrote through different code paths,
 * and — the actual problem — a trainer standing at a machine had to know
 * WHICH of two near-identical targets held the thing they wanted. With a
 * client waiting, that is a guess, and a wrong guess costs two taps.
 *
 * So: one target (the machine's name), one sheet, everything stacked in the
 * order a trainer needs it.
 *
 *   1. WHAT COULD HURT SOMEONE.  Any note flagged high-importance is
 *      hoisted to the top, above the fold, before a single dial. "Hip pain
 *      if she goes too fast" was previously two taps deep inside the modal
 *      a trainer was LESS likely to open. Safety information does not wait
 *      behind a scroll.
 *   2. THE NOTES.  The list, plus a box to add one, plus the flag. First,
 *      because the audit's answer to "why do you open this?" was "to add a
 *      note about this machine for this client" (tracker round, Sep 2026).
 *   3. THE DIALS.  Gap, Back Pad, Seat — with the studio standard ghosted
 *      in each empty field, and a reason box that is required only when a
 *      value actually changed. On a machine the client has never performed
 *      the set-up guide opens above them (`firstTime`).
 *   4. SET-UP GUIDE and CHANGE HISTORY, both collapsed. Reference, not
 *      workflow — but "why did someone move this last month" is answerable
 *      without leaving the session, which it was not before.
 *
 * It was a BOTTOM SHEET on a thumbs-first argument (a large iPad held in
 * two hands). AJ tried it on the floor (fix round, Sep 2026) and saw a
 * pop-up pushed to the bottom of the screen; it is now a CENTRED dialog in
 * both orientations, scrolling inside when the content is taller than the
 * screen. The name stuck.
 *
 * Every write goes through `features/equipment/mutations.ts` — the same
 * functions the Equipment tab calls. That is what makes the promise in the
 * spec true rather than aspirational: a setting changed here lands in
 * `clientMachineSettings`, in `machines/{id}/settingHistory` with its
 * reason, and in the client's Journal, so it is already on the client's
 * Equipment tab by the time the trainer walks back to the desk. The old
 * in-session dialog wrote its own third copy to a `machineSettingChanges`
 * collection that nothing in the app has ever read.
 */

export interface MachineSheetProps {
  open: boolean;
  machine: Machine | null;
  client: Client | null;
  clientId: string;
  clientSettings: Record<string, ClientMachineSetting>;
  author: MutationAuthor | null;
  sessionId?: string | null;
  onClose: () => void;
  onError?: (message: string) => void;
  /** Toast-worthy confirmation, so the sheet can stay open after a save. */
  onSaved?: (message: string) => void;
  /**
   * The client has never performed this machine. The set-up guide opens by
   * default and a banner says so — "if a machine is not yet performed by a
   * client, reference our catalog notes so we set them up properly the
   * first time" (audit, Sep 13 2026).
   */
  firstTime?: boolean;
}

export function MachineSheet({
  open,
  machine,
  client,
  clientId,
  clientSettings,
  author,
  sessionId,
  onClose,
  onError,
  onSaved,
  firstTime = false,
}: MachineSheetProps) {
  const { byId: catalogById } = useMachineCatalog();
  const { activeStudio, activeStudioId } = useActiveStudio();
  const [flash, setFlash] = useState<string | null>(null);

  const equipment = useMemo(() => {
    if (!machine?.id) return null;
    return (
      toEquipmentMachines({
        machines: [machine],
        clientSettings,
        allLogs: [],
        catalogById,
        studioMachineSettings: activeStudio?.machineSettings,
      })[0] ?? null
    );
  }, [machine, clientSettings, catalogById, activeStudio]);

  /* Notes written from here file as "in_session", so the Journal can say
     where a note came from without the trainer having to type it. */
  const journal: JournalContext = useMemo(
    () => ({
      studioId: activeStudioId || activeStudio?.id || "",
      origin: "in_session",
      sessionId: sessionId ?? null,
    }),
    [activeStudioId, activeStudio, sessionId],
  );

  const alerts = useMemo(
    () => (equipment?.notes || []).filter((n) => n.isImportant),
    [equipment],
  );

  const announce = (message: string) => {
    setFlash(message);
    onSaved?.(message);
    window.setTimeout(() => setFlash((f) => (f === message ? null : f)), 4000);
  };

  if (!equipment) return null;

  const who = [client?.height, client?.gender].filter(Boolean).join(", ");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setFlash(null);
          onClose();
        }
      }}
    >
      {/* Centred in the viewport (fix round, Sep 2026). It was a bottom
          sheet - `top-auto bottom-0 translate-y-0` on top of the dialog's
          centred geometry - and on the iPad that read as "pushed to the
          bottom of the screen". The dialog's own top-1/2 / left-1/2 /
          -translate-1/2 now does the centring in both orientations. Capped
          at 88dvh so the grid always shows around it, and the body scrolls
          when the content is taller than that. */}
      <DialogContent
        showCloseButton={false}
        className="max-w-none sm:max-w-[680px] w-[calc(100%-2rem)] max-h-[88dvh] rounded-[22px] p-0 border-0 bg-transparent shadow-none"
      >
        <div className="eq eq-sheet">
          <header className="eq-sheet__head">
            <div className="eq-sheet__id">
              <h2 className="eq-sheet__name">{equipment.name}</h2>
              <p className="eq-sheet__who">
                {client ? `${client.firstName} ${client.lastName}` : "Client"}
                {who ? ` · ${who}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="eq-sheet__close"
              onClick={onClose}
              aria-label="Close machine sheet"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </header>

          <div className="eq-sheet__body">
            {/* 1. Above the fold, above the dials, above everything. */}
            {alerts.length > 0 && (
              <section className="eq-sheet__alerts" aria-label="High importance notes">
                <span className="eq-sheet__alerts-kicker">
                  <TriangleAlert size={12} strokeWidth={2.8} aria-hidden />
                  High importance
                </span>
                {alerts.map((n) => (
                  <p key={n.id} className="eq-sheet__alert">
                    {n.content}
                    <i>
                      {n.authorName}
                      {n.timestamp ? ` · ${new Date(n.timestamp).toLocaleDateString()}` : ""}
                    </i>
                  </p>
                ))}
              </section>
            )}

            {/* Clinical watch-outs the studio's matrix names for this
                machine — one line each, only when the client has one. */}
            <WatchOutCard watchOuts={machineWatchOuts(client?.clinicalFlags, equipment)} compact />

            {flash && (
              <p className="eq-sheet__flash" role="status">
                {flash}
              </p>
            )}

            {/* First time on this machine: the catalog's set-up guide comes
                up open, ABOVE the dials, so the first set-up is done from
                the studio's own notes rather than from memory. */}
            {firstTime && (
              <section className="eq-sheet__first" aria-label="First time on this machine">
                <span className="eq-sheet__first-kicker">
                  <Sparkles size={12} strokeWidth={2.6} aria-hidden />
                  First time on this machine
                </span>
                <p className="eq-sheet__first-body">
                  {client?.firstName || "This client"} has no history here yet. Set up from the guide
                  {equipment.guide ? " below" : " (none on file for this machine yet)"}, then save the settings so the next trainer has them.
                </p>
              </section>
            )}
            {firstTime && equipment.guide && <SetupGuide guide={equipment.guide} defaultOpen />}

            {/* 2. The notes — the sheet's primary job: "form breaking at a
                point, something I noticed, feeling it somewhere they
                shouldn't". Above the dials, which change far less often. */}
            <MachineNotes
              machine={equipment}
              clientId={clientId}
              author={author}
              journal={journal}
              flagLabel="High importance"
              onSaved={announce}
              onError={onError}
            />

            {/* 3. The dials, with the reason box the audit trail needs. */}
            <SettingsCard
              machine={equipment}
              clientId={clientId}
              author={author}
              journal={journal}
              onSaved={(result) =>
                announce(
                  `Saved to ${client?.firstName || "the client"}'s profile — ${result.summary}. Logged to their Equipment tab.`,
                )
              }
              onError={onError}
              clientHeight={client?.height ?? null}
              clientGender={client?.gender ?? null}
            />

            {/* 4. Reference, folded away. */}
            {!firstTime && equipment.guide && <SetupGuide guide={equipment.guide} />}
            <ChangeHistory machineId={equipment.id} clientId={clientId} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
