/**
 * ONE STUDIO'S PAGE IN ADMINS — Setup · Mindbody · Floor · Team · Activity.
 *
 * Round: the Admins room (Sep 28 2026). Everything the All locations screen
 * held about the selected studio, on the studio's own page:
 *
 *   Setup      where it stands, in two sentences; its details (the SAME form
 *              My Studio → Studio uses, so the two can never disagree about a
 *              field); its franchise; and at the foot, the danger zone
 *   Mindbody   its link, in words, and where the controls for it are
 *   Floor      its machines (the one floor editor, the equipment panel)
 *   Team       who works there, its owners, its temporary profiles, and
 *              Change role (the second wave)
 *   Activity   what was changed here from the Admins dashboard, by whom and
 *              when (the second wave: the Activity record, AJ "all yes")
 *
 * Every change made on this page is recorded in the Activity record once it
 * has landed (studio-records.ts, role-change.ts): its details, its franchise,
 * a role. Not built, and why: See as (a front-end refactor of the studio
 * screens, flagged in the design).
 *
 * Switching tabs asks the leave question first: Setup holds a form.
 */
import { useState, type ReactNode } from "react";
import { ArrowLeft, Dumbbell, History, Link2, ListChecks, RefreshCw, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client, FranchiseNetwork, Studio, Trainer } from "../../../types";
import { useToast } from "../../../contexts/ToastContext";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { UnsavedChangesScope, useLeaveScope } from "../../unsaved-changes";
import { AdminButton, AdminField, AdminHeader, AdminNotice, AdminPanel, AdminScreen, AdminSelect } from "../../admin/primitives";
import { StudioDetailsForm } from "../../admin/studios/StudioDetailsForm";
import { deleteStudio, moveStudioToNetwork, saveStudioDetails } from "../../admin/studios/registry-writes";
import { StudioEquipmentPanel } from "../../admin/equipment/StudioEquipmentPanel";
import { HqStatus } from "../kit";
import { logActivity } from "../activity/log-activity";
import { standingOf } from "./stages";
import { StudioTeam } from "./StudioTeam";
import { StudioActivity } from "./StudioActivity";
import { DeleteStudioDialog } from "./DeleteStudioDialog";
import { detailsRecord, franchiseRecord } from "./studio-records";
import { clientsLine, useStudioClientCounts } from "./useStudioClientCounts";

export type StudioTab = "setup" | "mindbody" | "floor" | "team" | "activity";

const TABS: { id: StudioTab; label: string; icon: ReactNode }[] = [
  { id: "setup", label: "Setup", icon: <ListChecks aria-hidden="true" /> },
  { id: "mindbody", label: "Mindbody", icon: <RefreshCw aria-hidden="true" /> },
  { id: "floor", label: "Floor", icon: <Dumbbell aria-hidden="true" /> },
  { id: "team", label: "Team", icon: <Users aria-hidden="true" /> },
  { id: "activity", label: "Activity", icon: <History aria-hidden="true" /> },
];

type Refresh = (c: "studios" | "networks" | "trainers") => Promise<void>;

export interface StudioPageProps {
  studio: Studio;
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  clients: Client[];
  authTrainer: Trainer;
  isAdmin: boolean;
  initialTab?: StudioTab;
  onBack: () => void;
  onDeleted: () => void;
  onRefresh?: Refresh;
  /** The studio's sync, in words, from the lease the dashboard read (the sync check). */
  sync?: ReactNode;
  /** Opens Admins → Mindbody sync. */
  onOpenSync?: () => void;
}

export function StudioPage({
  studio,
  studios,
  networks,
  trainers,
  clients,
  authTrainer,
  isAdmin,
  initialTab = "setup",
  onBack,
  onDeleted,
  onRefresh,
  sync,
  onOpenSync,
}: StudioPageProps) {
  const { success: toastSuccess } = useToast();
  const [tab, setTab] = useState<StudioTab>(initialTab);
  const tabsScope = useLeaveScope();
  const [asking, setAsking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const standing = standingOf(studio, studios, networks);
  const counts = useStudioClientCounts([studio]);
  const network = networks.find((n) => n.id === studio.networkId) ?? null;
  const studioId = studio.id ?? "";

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteStudio(networks, studioId);
      await onRefresh?.("networks");
      await onRefresh?.("studios");
      toastSuccess(`${studio.name} deleted, and taken out of every franchise that listed it.`);
      setAsking(false);
      onDeleted();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `studios/${studioId}`);
    } finally {
      setDeleting(false);
    }
  };

  const changeNetwork = async (networkId: string | null) => {
    const record = franchiseRecord(studio, networks, networkId);
    try {
      await moveStudioToNetwork(studio, networks, networkId);
      if (record) void logActivity({ kind: "assisted-change", studioId, ...record, byName: authTrainer.fullName });
      await onRefresh?.("networks");
      await onRefresh?.("studios");
      toastSuccess(networkId ? "Studio moved." : "Studio is now independent.");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "networks");
    }
  };

  return (
    <AdminScreen>
      <div>
        <AdminButton variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> All studios
        </AdminButton>
      </div>
      <AdminHeader
        title={studio.name || "Unnamed studio"}
        subtitle={`${standing.context} · ${standing.cutover} · ${clientsLine(counts[studioId])}`}
      />

      <div className="hq-tabs" role="tablist" aria-label={`${studio.name} pages`}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={cn("hq-tab", tab === t.id && "hq-tab--on")}
            onClick={() => t.id !== tab && tabsScope.guard(() => setTab(t.id))}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <UnsavedChangesScope scope={tabsScope}>
        {tab === "setup" && (
          <div className="flex flex-col gap-4">
            <AdminPanel title="Where it stands">
              <div className="flex flex-col gap-2">
                <HqStatus tone={standing.linkTone}>{standing.link}</HqStatus>
                <p className="hq-standing">
                  {standing.cutover}.{" "}
                  {standing.stage === "no-cutover"
                    ? "Until a cutover date is set, every client here reads as unknown and gets the cautious wording."
                    : standing.stage === "needs-mindbody"
                      ? "Fill in the Mindbody details below, or mark the studio offline if that is on purpose."
                      : null}
                </p>
              </div>
            </AdminPanel>

            <StudioDetailsForm
              key={studioId}
              studio={studio}
              studios={studios}
              onSave={async (patch) => {
                const record = detailsRecord(studio, patch);
                await saveStudioDetails(studioId, patch);
                if (record) void logActivity({ kind: "assisted-change", studioId, ...record, byName: authTrainer.fullName });
                await onRefresh?.("studios");
              }}
            />

            <AdminPanel
              title="Franchise"
              icon={<Link2 className="w-3.5 h-3.5" />}
              subtitle="Which franchise this studio belongs to. Changing it rewrites both sides of the link."
            >
              <AdminField label="Franchise" htmlFor="studio-network">
                <AdminSelect id="studio-network" value={studio.networkId ?? ""} onChange={(e) => void changeNetwork(e.target.value || null)}>
                  <option value="">Independent — no franchise</option>
                  {networks.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                      {n.state ? ` · ${n.state}` : ""}
                    </option>
                  ))}
                </AdminSelect>
              </AdminField>
              {network && !(network.studioIds || []).includes(studioId) && (
                <div className="mt-3">
                  <AdminNotice tone="warn">
                    {network.name} does not list this studio. The repair on Studios → Franchises puts both sides back in agreement.
                  </AdminNotice>
                </div>
              )}
            </AdminPanel>

            {isAdmin && (
              <AdminPanel title="Danger zone" icon={<Trash2 className="w-3.5 h-3.5" />}>
                <div className="flex flex-col gap-3">
                  <p className="hq-standing">
                    Deleting takes {studio.name} out of every franchise that lists it, then deletes it. Its clients, sessions
                    and bookings are not deleted, and will have no studio to belong to. It can&apos;t be undone, so it asks
                    you to type the studio&apos;s name.
                  </p>
                  <div>
                    <AdminButton variant="danger" onClick={() => setAsking(true)}>
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Delete {studio.name}…
                    </AdminButton>
                  </div>
                </div>
              </AdminPanel>
            )}
          </div>
        )}

        {tab === "mindbody" && (
          <div className="flex flex-col gap-4">
            <AdminPanel title="Mindbody link" icon={<RefreshCw className="w-3.5 h-3.5" />}>
              <div className="flex flex-col gap-2">
                <HqStatus tone={standing.linkTone}>{standing.link}</HqStatus>
                {sync ?? null}
                <p className="hq-standing">
                  The Site ID and location are changed under Setup, and the save waits until Mindbody has answered for a
                  new Site ID. Pulling the schedule now, the sync&apos;s settings and the event log are on Operations →
                  Mindbody, with the app in {studio.name}.
                </p>
              </div>
            </AdminPanel>
            {onOpenSync ? (
              <div>
                <AdminButton onClick={onOpenSync}>
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Every studio&apos;s sync
                </AdminButton>
              </div>
            ) : null}
          </div>
        )}

        {tab === "floor" && <StudioEquipmentPanel studio={studio} authTrainer={authTrainer} />}

        {tab === "team" && (
          <StudioTeam
            studio={studio}
            trainers={trainers}
            clients={clients}
            authTrainer={authTrainer}
            onCreated={async () => {
              await onRefresh?.("trainers");
            }}
            onRolesChanged={async () => {
              await onRefresh?.("trainers");
            }}
          />
        )}

        {tab === "activity" && <StudioActivity studio={studio} studios={studios} />}
      </UnsavedChangesScope>

      <DeleteStudioDialog
        open={asking}
        studioName={studio.name}
        busy={deleting}
        onCancel={() => setAsking(false)}
        onConfirm={() => void remove()}
      />
    </AdminScreen>
  );
}
