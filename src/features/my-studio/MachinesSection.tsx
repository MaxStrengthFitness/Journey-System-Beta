import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { Dumbbell, Network, Sparkles, Upload } from "lucide-react";
import { auth, db } from "../../firebase";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { useToast } from "../../contexts/ToastContext";
import { useStudioMachines } from "../../hooks/useStudioMachines";
import { useStudioMachineSettings } from "../../hooks/useStudioMachineSettings";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import { studioDateKey } from "../../lib/studio-time";
import type { Trainer } from "../../types";
import type { MachineCatalogEntry, StudioMachineRosterEntry } from "../../types/machines";
import { StudioInventoryManager } from "../admin/machines/StudioInventoryManager";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminBadge, AdminButton, AdminEmpty, AdminNotice, AdminPanel, AdminRow, AdminRows, AdminTextarea } from "../admin/primitives";
import { adoptCatalogMachine, seedStandardSet } from "../admin/equipment/seed";
import { LocalSetupDialog } from "../admin/equipment/LocalSetupDialog";
import { UpkeepDialog } from "../admin/upkeep/UpkeepDialog";
import { useStudioUpkeep } from "../admin/upkeep/useStudioUpkeep";
import { DEFAULT_UPKEEP_POLICY, tallyUpkeep, worstStatus } from "../admin/upkeep/upkeepLog";
import { StudioSetupCard } from "../catalog/StudioSetupCard";
import { useStudioMachineNotes } from "../catalog/useStudioMachineNotes";
import { FloorNotes } from "../floor-notes/FloorNotes";
import type { earlierNotes } from "../floor-notes/floor-notes";
import { useFloorNotes, type FloorNotesRead } from "../floor-notes/useFloorNotes";
import { useStudioWiki } from "../wiki/useStudioWiki";
import { buildDatabase, planAdoption } from "../machine-db/database";
import { useSharedMachines } from "../machine-db/hooks";
import { adoptMachine } from "../machine-db/mutations";
import { writesForStudioPerRules } from "../learning/permissions";
import { ContextPanel } from "../relay/board/ContextPanel";
import { useRelayMaybe } from "../relay/board/RelayContext";
import { leadsHere } from "../relay/leads";
import { UnsavedChangesScope, useLeaveScope } from "../unsaved-changes";
import {
  buildSubmission,
  canOffer,
  canWithdraw,
  decisionSentence,
  standardGaps,
  submissionLabel,
  SUBMISSION_NOTE_MAX,
  type CatalogSubmissionDoc,
  type RosterSubmissionMarker,
} from "./floor";
// Every stylesheet this section draws with, imported here and not left to
// the shell: Operations → Floor mounts this section without My Studio's
// shell, so it cannot count on MyStudioView's imports (.pl__frame, .pl__body
// and the door's .cp from planner.css and relay.css, .ms__* from
// my-studio.css). css-imports.test.ts holds it.
import "../admin/admin.css";
import "../studio-tasks/studio-tasks.css";
import "../relay/planner.css";
import "../relay/board/relay.css";
import "./my-studio.css";

/**
 * MY STUDIO → MACHINES — the floor, and what the studio has done to it.
 *
 * Round: My Studio, Sep 2026. AJ (Sep 18): a new studio adopts the standard
 * set Max Strength recommends — usually the standard twenty — and "can always
 * add or remove machines from that"; over time it adopts machines the
 * standard added and removes ones it no longer has; it can create entirely
 * new machines or adopt already-created ones from the catalog; a leader can
 * submit a custom machine to corporate for the catalog; trainers view the
 * floor, the standard settings and the first-time set-up material, and
 * contribute notes to the machines on their floor.
 *
 *   New in the MSF standard    the standard machines this floor does not
 *                              have — adopted one at a time, or all at once
 *                              on an empty floor ("Adopt the MSF standard").
 *                              Never pushed: floor.ts / standardGaps.
 *   The floor                  the inventory manager (search, reorder, we
 *                              have this / we don't, out of service, a
 *                              custom machine) for leaders; the same list
 *                              read-only for trainers. Every row opens the
 *                              machine's door.
 *   The machine's door         the Context Panel beside the list: this
 *                              studio's standard settings (the Studio setup
 *                              card, the same one the Catalog page shows),
 *                              the floor's notes, local set-up on a Max
 *                              Strength machine, upkeep, and "Offer to the
 *                              MSF catalog" on the studio's own machines.
 *   Shared by other studios    machines other MSF studios built and listed;
 *                              a leader adopts one as a copy (machine-db).
 *
 * What this section does NOT do: it does not move the Catalog page. A
 * trainer standing at the Hip Adduction still opens it in Learning → Catalog
 * and finds the same settings card and notes box there; this is the same
 * card, reached from the floor list, so a leader can set twenty machines up
 * without walking the room. One implementation, two doors.
 */

export interface MachinesSectionProps {
  authTrainer?: Trainer | null;
  trainers?: Trainer[];
}

interface Door {
  machineId: string;
  /** What the door was opened for; "submit" opens the offer dialog too. */
  intent?: "open" | "submit";
}

export function MachinesSection({ authTrainer }: MachinesSectionProps) {
  const { activeStudio, activeStudioId } = useActiveStudio();
  // Inside My Studio the Relay shell says who leads; on Operations → Floor
  // (the same editor, a second door — Operations overhaul, Sep 2026) there
  // is no shell, so the answer comes from leadsHere directly.
  const relay = useRelayMaybe();
  const { success: toastSuccess, error: toastError } = useToast();
  const studioId = activeStudioId ?? null;
  const studioName = activeStudio?.name ?? "this studio";
  const canLead = relay ? relay.canLead : leadsHere(authTrainer ?? null, studioId);
  const canLogUpkeep = writesForStudioPerRules(authTrainer ?? null, studioId);

  const { rosterEntries, catalog, byId, loading } = useStudioMachines(studioId, {
    includeInactive: true,
    includeUnrostered: true,
  });
  const { settingsByMachineId } = useStudioMachineSettings(studioId);
  // The floor's notes (notes round, Oct 3 2026): read once for the studio,
  // with the two old stores they took over from, shown under the list.
  const { notesByMachineId } = useStudioMachineNotes(studioId);
  const floorNotes = useFloorNotes(studioId);
  const { overlayFor } = useStudioWiki(studioId);
  const { events: upkeepEvents } = useStudioUpkeep(studioId);
  const shared = useSharedMachines(true, studioId);
  const todayKey = studioDateKey(new Date()) ?? "";

  const gaps = useMemo(
    () => standardGaps(catalog as MachineCatalogEntry[], rosterEntries),
    [catalog, rosterEntries],
  );
  const entryById = useMemo(() => {
    const m = new Map<string, StudioMachineRosterEntry>();
    for (const e of rosterEntries) m.set(e.machineId, e);
    return m;
  }, [rosterEntries]);
  const noLongerStandard = useMemo(() => new Set(gaps.noLongerStandard.map((e) => e.machineId)), [gaps]);

  /* Flags drawn under a row in the inventory manager. */
  const flags = useMemo(() => {
    const out: Record<string, string> = {};
    for (const e of rosterEntries) {
      const marker = (e as { submission?: RosterSubmissionMarker }).submission;
      const label = submissionLabel(marker);
      if (label) out[e.machineId] = label;
    }
    for (const id of noLongerStandard) {
      out[id] = out[id] ? `${out[id]} · No longer in the MSF standard` : "No longer in the MSF standard — still yours to use";
    }
    return out;
  }, [rosterEntries, noLongerStandard]);

  const [door, setDoor] = useState<Door | null>(null);
  // The door holds typing (the floor's notes, the studio's settings), and its
  // own ways out would unmount it or swap its machine: the X, Escape, and a
  // tap on another machine in the list beside it. Each asks first (a leave
  // scope, unsaved-changes), as My Studio's sections and the bottom bar do.
  const doorScope = useLeaveScope();
  const [seeding, setSeeding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const floorEmpty = !loading && rosterEntries.length === 0;

  const adoptStandard = async () => {
    if (!studioId) return;
    setSeeding(true);
    try {
      const { added, alreadyPresent } = await seedStandardSet(studioId, catalog);
      toastSuccess(
        added > 0
          ? `${added} machines adopted. ${studioName} runs the MSF standard set — add or remove from here.`
          : alreadyPresent > 0
            ? `${studioName} already has every standard machine.`
            : "Nothing in the catalog qualifies for the standard set yet.",
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `studios/${studioId}/roster`);
    } finally {
      setSeeding(false);
    }
  };

  const adoptOne = async (machineId: string) => {
    if (!studioId) return;
    setBusy(machineId);
    try {
      await adoptCatalogMachine(studioId, machineId);
      toastSuccess(`${byId[machineId]?.name ?? machineId} is on ${studioName}'s floor.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `studios/${studioId}/roster/${machineId}`);
    } finally {
      setBusy(null);
    }
  };

  /* Shared machines, as the database sees them from this floor. */
  const sharedEntries = useMemo(() => {
    const floor = rosterEntries.map((e) => ({
      id: e.machineId,
      comparisonKey: (e as { basedOn?: string }).basedOn ?? e.machineId,
      adoptedFrom: (e as { adoptedFrom?: { studioId: string; machineId: string; studioName: string } }).adoptedFrom,
    }));
    return buildDatabase({ msf: [], shared: shared.machines, floor, studioId }).filter(
      (e) => e.origin === "studio" && e.sharedBy?.studioId !== studioId,
    );
  }, [shared.machines, rosterEntries, studioId]);

  const adoptShared = async (key: string) => {
    if (!studioId) return;
    const entry = sharedEntries.find((e) => e.key === key);
    if (!entry) return;
    const plan = planAdoption(entry, {
      studioId,
      studioName,
      floorSource: rosterEntries.length > 0 ? "roster" : "global",
      takenIds: new Set(rosterEntries.map((e) => e.machineId)),
      roster: rosterEntries.map((e) => ({
        machineId: e.machineId,
        status: e.status,
        adoptedFrom: (e as { adoptedFrom?: { studioId: string; machineId: string } }).adoptedFrom ?? null,
      })),
    });
    if (!plan.ok) {
      toastError(plan.reason);
      return;
    }
    setBusy(key);
    try {
      await adoptMachine(studioId, plan);
      toastSuccess(
        plan.reactivates
          ? `${entry.machine.name} is back on ${studioName}'s floor.`
          : `${entry.machine.name} added to ${studioName}'s floor, as your own copy.`,
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `studios/${studioId}/roster`);
    } finally {
      setBusy(null);
    }
  };

  if (!studioId) {
    return (
      <div className="pl__frame">
        <div className="pl__body adm ms__page">
          <AdminNotice tone="info">Choose a studio to see its floor.</AdminNotice>
        </div>
      </div>
    );
  }

  const doorEntry = door ? entryById.get(door.machineId) ?? null : null;
  const doorMachine = door ? byId[door.machineId] ?? null : null;
  const doorName = doorMachine?.name ?? doorEntry?.machineId ?? "";

  // Without My Studio's shell (Operations → Floor) nothing bounds this
  // frame's height, so the machine's door rides the page's own scroller
  // instead of sitting at the top or the foot of a long list, off-screen
  // (my-studio.css, .ms__frame--hosted).
  return (
    <div className={relay ? "pl__frame" : "pl__frame ms__frame--hosted"}>
      <div className="pl__body adm ms__page" role="tabpanel" id="ms-panel" aria-labelledby="ms-tab-machines">
        {/* ── New in the MSF standard ─────────────────────────────────── */}
        {!loading && gaps.newInStandard.length > 0 && (
          <AdminPanel
            title={floorEmpty ? "The MSF standard set" : "New in the MSF standard"}
            icon={<Sparkles className="w-3.5 h-3.5" />}
            subtitle={
              floorEmpty
                ? "Most locations run the same twenty machines. Adopt the standard set to start, then add or remove from there — nothing is ever pushed onto your floor."
                : "Machines the standard lists that this floor does not have. Take each one when you are ready; nothing is pushed onto your floor."
            }
            actions={
              canLead && floorEmpty ? (
                <AdminButton variant="primary" busy={seeding} onClick={() => void adoptStandard()}>
                  <Sparkles className="w-3.5 h-3.5" />
                  Adopt the MSF standard
                </AdminButton>
              ) : (
                <AdminBadge tone="neutral">
                  {gaps.newInStandard.length} not on the floor
                </AdminBadge>
              )
            }
            flush
          >
            <AdminRows>
              {gaps.newInStandard.map((c) => (
                <AdminRow
                  key={c.id}
                  name={c.name}
                  meta={c.movementPattern ? `${c.movementPattern}` : undefined}
                  trailing={
                    canLead ? (
                      <AdminButton size="sm" busy={busy === c.id} onClick={() => void adoptOne(c.id)}>
                        Adopt
                      </AdminButton>
                    ) : (
                      <AdminBadge tone="neutral">Not on the floor</AdminBadge>
                    )
                  }
                />
              ))}
            </AdminRows>
          </AdminPanel>
        )}

        {/* ── The floor ───────────────────────────────────────────────── */}
        <AdminPanel
          title="The floor"
          icon={<Dumbbell className="w-3.5 h-3.5" />}
          subtitle={
            canLead
              ? "What this location has, in the order trainers see it. Tap a machine for its settings, notes, local set-up and upkeep."
              : "What this location has, in the order you see it. Tap a machine for the studio's standard settings and the floor's notes."
          }
        >
          {floorEmpty && !canLead ? (
            <AdminEmpty title="No floor set up yet">
              A studio leader adopts the MSF standard set from here; until then the Catalog shows every MSF machine.
            </AdminEmpty>
          ) : (
            <StudioInventoryManager
              studioId={studioId}
              studioName={studioName}
              readOnly={!canLead}
              authorName={authTrainer?.fullName ?? null}
              flags={flags}
              onOpenMachine={(machineId) => {
                // The machine already open changes nothing, so it never asks.
                if (machineId === door?.machineId) return;
                doorScope.guard(() => setDoor({ machineId }));
              }}
              hideHeading
            />
          )}
        </AdminPanel>

        {/* ── Shared by other MSF studios ─────────────────────────────── */}
        <AdminPanel
          title="Shared by other MSF studios"
          icon={<Network className="w-3.5 h-3.5" />}
          subtitle="Machines other studios built and listed for everyone. Adopting one makes your own copy; the whole MSF catalog is under Learning → Catalog → All MSF machines."
          flush
        >
          {shared.error ? (
            <div className="p-4">
              <AdminNotice tone="warn">{shared.error}</AdminNotice>
            </div>
          ) : shared.loading ? (
            <p className="ms__quiet">Loading…</p>
          ) : sharedEntries.length === 0 ? (
            <p className="ms__quiet">No studio has shared a machine yet.</p>
          ) : (
            <AdminRows>
              {sharedEntries.map((e) => (
                <AdminRow
                  key={e.key}
                  name={e.machine.name}
                  meta={`From ${e.sharedBy?.studioName ?? "another studio"}`}
                  trailing={
                    e.floorMachineId ? (
                      <AdminBadge tone="ok">On your floor</AdminBadge>
                    ) : canLead ? (
                      <AdminButton size="sm" busy={busy === e.key} onClick={() => void adoptShared(e.key)}>
                        Add to {studioName}
                      </AdminButton>
                    ) : null
                  }
                />
              ))}
            </AdminRows>
          )}
        </AdminPanel>
      </div>

      <ContextPanel
        content={
          door && doorEntry
            ? {
                kicker:
                  doorEntry.source === "custom"
                    ? (doorEntry as { adoptedFrom?: { studioName: string } }).adoptedFrom
                      ? `Copied from ${(doorEntry as { adoptedFrom?: { studioName: string } }).adoptedFrom?.studioName}`
                      : `${studioName}'s own machine`
                    : noLongerStandard.has(doorEntry.machineId)
                      ? "MSF catalog · no longer in the standard"
                      : "MSF catalog",
                title: doorName,
                tall: true,
                body: (
                  <UnsavedChangesScope scope={doorScope}>
                    {/* Keyed by machine: each machine gets a fresh door, so a
                        Leave's discard never re-seeds onto the next one. */}
                    <MachineDoor
                      key={doorEntry.machineId}
                      studioId={studioId}
                      studioName={studioName}
                      entry={doorEntry}
                      machineName={doorName}
                      catalogName={
                        doorEntry.source === "catalog" ? (byId[doorEntry.machineId]?.name ?? doorName) : doorName
                      }
                      catalogEntry={doorEntry.source === "catalog" ? (catalog as MachineCatalogEntry[]).find((c) => c.id === (doorEntry as { basedOn?: string }).basedOn) ?? null : null}
                      setting={settingsByMachineId[doorEntry.machineId]}
                      floorRead={floorNotes}
                      earlier={{
                        studioNotes: notesByMachineId[doorEntry.machineId]?.notes
                          ? {
                              text: notesByMachineId[doorEntry.machineId].notes,
                              by: notesByMachineId[doorEntry.machineId].updatedBy?.name ?? null,
                              at: notesByMachineId[doorEntry.machineId].updatedAt,
                            }
                          : null,
                        catalogNote: (() => {
                          const o = overlayFor("machine", doorEntry.machineId);
                          return o
                            ? {
                                id: o.id,
                                blocks: o.blocks,
                                by: o.updatedByName ?? o.authorName ?? null,
                                at: o.updatedAt ?? o.createdAt,
                                shared: o.shared,
                                shareStatus: o.shareStatus,
                                shareReviewNote: o.shareReviewNote,
                              }
                            : null;
                        })(),
                        unitNote: doorEntry.studioNotes ?? null,
                      }}
                      shareKey={byId[doorEntry.machineId]?.comparisonKey || doorEntry.machineId}
                      upkeepEvents={upkeepEvents}
                      upkeepStatus={worstStatus(tallyUpkeep(upkeepEvents, doorEntry.machineId, todayKey), DEFAULT_UPKEEP_POLICY)}
                      canLead={canLead}
                      canLogUpkeep={canLogUpkeep}
                      authTrainer={authTrainer ?? null}
                      openOffer={door.intent === "submit"}
                    />
                  </UnsavedChangesScope>
                ),
              }
            : null
        }
        onClose={() => doorScope.guard(() => setDoor(null))}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The machine's door — everything the studio has said about one machine
 * ------------------------------------------------------------------ */

function MachineDoor({
  studioId,
  studioName,
  entry,
  machineName,
  catalogName,
  catalogEntry,
  setting,
  floorRead,
  earlier,
  shareKey,
  upkeepEvents,
  upkeepStatus,
  canLead,
  canLogUpkeep,
  authTrainer,
  openOffer,
}: {
  studioId: string;
  studioName: string;
  entry: StudioMachineRosterEntry;
  machineName: string;
  catalogName: string;
  catalogEntry: MachineCatalogEntry | null;
  setting: ReturnType<typeof useStudioMachineSettings>["settingsByMachineId"][string] | undefined;
  floorRead: FloorNotesRead;
  earlier: Parameters<typeof earlierNotes>[0];
  /** The lineage other studios find this machine's shared notes under. */
  shareKey: string;
  upkeepEvents: ReturnType<typeof useStudioUpkeep>["events"];
  upkeepStatus: ReturnType<typeof worstStatus>;
  canLead: boolean;
  canLogUpkeep: boolean;
  authTrainer: Trainer | null;
  openOffer: boolean;
}) {
  const [localSetup, setLocalSetup] = useState(false);
  const [upkeep, setUpkeep] = useState(false);
  const [offer, setOffer] = useState(openOffer);
  const uid = auth.currentUser?.uid ?? null;
  const marker = (entry as { submission?: RosterSubmissionMarker }).submission ?? null;
  const markerLabel = submissionLabel(marker);
  const ownMachine = entry.source === "custom" && !(entry as { adoptedFrom?: unknown }).adoptedFrom;

  return (
    <div className="adm ms__door">
      <section>
        <h3 className="ms__door-h">This studio's standard settings</h3>
        <p className="ms__door-sub">
          What trainers preset the machine to as they walk up. Trainers read these; leaders change them. The same card is on the machine's Catalog page.
        </p>
        <StudioSetupCard
          machineId={entry.machineId}
          machineName={machineName}
          studioId={studioId}
          setting={setting}
          canEdit={canLead}
          authorId={authTrainer?.id ?? null}
        />
      </section>

      <section>
        <h3 className="ms__door-h">The floor's notes</h3>
        <p className="ms__door-sub">
          Anyone at {studioName} can write here: the pad that sticks, the footstool, what to watch for. Each note keeps its
          date and its updates; close one when it's done and it stays in the history. The same list is on the machine's
          Catalog page.
        </p>
        <FloorNotes
          studioId={studioId}
          studioName={studioName}
          machineId={entry.machineId}
          machineName={machineName}
          read={floorRead}
          earlier={earlier}
          uid={uid}
          writerName={canLogUpkeep ? (authTrainer?.fullName ?? "A trainer") : null}
          canLead={canLead}
          shareKeys={[shareKey]}
        />
      </section>

      <section className="ms__door-actions">
        {/* A Max Strength machine's only: a studio's own machine, or a copy
            of another studio's, has no catalog machine to set up locally, and
            saving Local set-up on one took it off the floor (Sep 28 2026).
            Its name and set-up are Edit on the floor list. */}
        {canLead && entry.source === "catalog" && (
          <AdminButton variant="quiet" onClick={() => setLocalSetup(true)}>
            Local set-up
          </AdminButton>
        )}
        {canLogUpkeep && (
          <AdminButton variant="quiet" onClick={() => setUpkeep(true)}>
            Upkeep{upkeepStatus === "overdue" ? " · overdue" : upkeepStatus === "due" ? " · due" : ""}
          </AdminButton>
        )}
        {canLead && ownMachine && canOffer(marker) && (
          <AdminButton variant="quiet" onClick={() => setOffer(true)}>
            <Upload className="w-3.5 h-3.5" />
            {marker ? "Offer it again" : "Offer to the MSF catalog"}
          </AdminButton>
        )}
        {canLead && canWithdraw(marker) && marker && (
          <WithdrawOffer
            submissionId={marker.id}
            studioId={studioId}
            machineId={entry.machineId}
            machineName={machineName}
          />
        )}
      </section>
      {markerLabel && <AdminNotice tone={marker?.status === "declined" ? "warn" : "info"}>{markerLabel}</AdminNotice>}
      {marker && <DecisionNote submissionId={marker.id} status={marker.status} />}

      {localSetup && (
        <LocalSetupDialog
          studioId={studioId}
          machineId={entry.machineId}
          catalogName={catalogName}
          catalog={catalogEntry}
          entry={entry}
          onClose={() => setLocalSetup(false)}
        />
      )}
      {upkeep && (
        <UpkeepDialog
          studioId={studioId}
          machineId={entry.machineId}
          machineName={machineName}
          events={upkeepEvents}
          authTrainer={authTrainer}
          onClose={() => setUpkeep(false)}
        />
      )}
      {offer && (
        <OfferDialog
          studioId={studioId}
          studioName={studioName}
          entry={entry}
          machineName={machineName}
          authTrainer={authTrainer}
          onClose={() => setOffer(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Taking an offer back, and hearing what corporate said
 * ------------------------------------------------------------------ */

/**
 * WITHDRAW — a leader takes back an offer corporate has not decided on yet.
 *
 * The status and the rule for it already existed (`withdrawn`;
 * firestore.rules allows a studio's leader exactly the pending → withdrawn
 * transition, and only the `status` and `updatedAt` keys with it). Nothing
 * in the app ever wrote it, so an offer made by mistake sat in corporate's
 * queue until someone there passed on it.
 *
 * The write is deliberately those two keys and nothing else: adding a third
 * would be refused by the rule, silently, from the studio's side.
 */
function WithdrawOffer({
  submissionId,
  studioId,
  machineId,
  machineName,
}: {
  submissionId: string;
  studioId: string;
  machineId: string;
  machineName: string;
}) {
  const { success: toastSuccess } = useToast();
  const [busy, setBusy] = useState(false);

  const withdraw = async () => {
    setBusy(true);
    try {
      await updateDoc(doc(db, "catalogSubmissions", submissionId), {
        status: "withdrawn",
        updatedAt: serverTimestamp(),
      });
      // The marker is a convenience copy, as it is when the offer is made:
      // its failure leaves the withdrawal standing rather than undoing it.
      try {
        await setDoc(
          doc(db, "studios", studioId, "roster", machineId),
          { submission: { id: submissionId, status: "withdrawn" } satisfies RosterSubmissionMarker },
          { merge: true },
        );
      } catch (err) {
        console.warn("[my-studio] withdrawal marker failed:", err);
      }
      toastSuccess(`${machineName} is no longer offered. You can fix it and offer it again.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "catalogSubmissions");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminButton variant="quiet" busy={busy} disabled={busy} onClick={() => void withdraw()}>
      Take the offer back
    </AdminButton>
  );
}

/**
 * WHAT CORPORATE SAID — the decision note, on the studio's own floor.
 *
 * It was always written and a studio's leaders could always read it; it was
 * simply never shown. So a studio learned that corporate passed and never
 * learned why, which is the one thing that would let them fix the machine
 * and offer it again.
 *
 * One `getDoc` when the machine's door opens, not a listener: a decision is
 * made once and the door is already open on a tap.
 */
function DecisionNote({ submissionId, status }: { submissionId: string; status: RosterSubmissionMarker["status"] }) {
  const [sentence, setSentence] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "declined" && status !== "published") return;
    let alive = true;
    void (async () => {
      try {
        const snap = await getDoc(doc(db, "catalogSubmissions", submissionId));
        if (!alive || !snap.exists()) return;
        const data = snap.data() as CatalogSubmissionDoc;
        setSentence(decisionSentence(status, data.decisionNote));
      } catch {
        // A refused read means "unknown", never "there was no note" — so the
        // panel says nothing rather than implying corporate stayed silent.
      }
    })();
    return () => {
      alive = false;
    };
  }, [submissionId, status]);

  if (!sentence) return null;
  return <AdminNotice tone={status === "declined" ? "warn" : "ok"}>{sentence}</AdminNotice>;
}

/* ------------------------------------------------------------------ *
 * Offering a machine to the MSF catalog
 * ------------------------------------------------------------------ */

function OfferDialog({
  studioId,
  studioName,
  entry,
  machineName,
  authTrainer,
  onClose,
}: {
  studioId: string;
  studioName: string;
  entry: StudioMachineRosterEntry;
  machineName: string;
  authTrainer: Trainer | null;
  onClose: () => void;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      toastError("Sign in again before offering a machine.");
      return;
    }
    const built = buildSubmission({
      studioId,
      studioName,
      entry,
      author: { uid, name: authTrainer?.fullName ?? "A leader" },
      note,
    });
    if (built.ok === false) {
      toastError(built.reason);
      return;
    }
    setBusy(true);
    try {
      const ref = await addDoc(collection(db, "catalogSubmissions"), {
        ...built.doc,
        submittedAt: serverTimestamp(),
      });
      // The marker on the roster entry is what the floor shows; it is a
      // convenience copy, so a failure here leaves the submission standing.
      try {
        await setDoc(
          doc(db, "studios", studioId, "roster", entry.machineId),
          {
            submission: { id: ref.id, status: "pending" } satisfies RosterSubmissionMarker,
            updatedAt: serverTimestamp(),
            updatedBy: uid,
          },
          { merge: true },
        );
      } catch (err) {
        console.warn("[my-studio] submission marker failed:", err);
      }
      toastSuccess(`${machineName} offered to the MSF catalog. Corporate decides; nothing changes on your floor until it does.`);
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, "catalogSubmissions");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="uppercase tracking-tight">Offer {machineName} to the MSF catalog</DialogTitle>
        </DialogHeader>
        <div className="adm flex flex-col gap-3">
          <p className="ms__line ms__line--muted">
            Corporate reviews it. If it is published, {studioName} is moved onto the catalog version so every studio starts from the same machine, and your history comes with it.
          </p>
          <label className="flex flex-col gap-1">
            <span className="adm-label">
              A note for corporate (optional)
            </span>
            <AdminTextarea
              className="min-h-24"
              maxLength={SUBMISSION_NOTE_MAX}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why it earns a place in the catalog, and what it is most like."
            />
          </label>
          <div className="flex justify-end gap-2">
            <AdminButton variant="quiet" onClick={onClose}>
              Cancel
            </AdminButton>
            <AdminButton variant="primary" busy={busy} onClick={() => void send()}>
              <Upload className="w-3.5 h-3.5" />
              Offer it
            </AdminButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
