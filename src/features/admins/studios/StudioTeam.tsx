/**
 * A STUDIO'S TEAM, on its page in Admins.
 *
 * "Everyone who works there" (AJ, Sep 27 2026) is src/lib/who-works-here.ts,
 * the one answer every list of a team asks: home, also works here, or a
 * guest, active and not replaced. The studio's owners are said on a line of
 * their own — an owner runs the business without being on the floor's team.
 * Temporary profiles (people not in Mindbody yet) are the studio's to make
 * and reconcile, below.
 *
 * Change role (the Admins room's second wave, Sep 28 2026): an administrator
 * may change anyone's role here, a System Administrator included — "admins
 * can promote other admins" (AJ, Sep 19) — and every change is recorded in
 * the Activity record with who made it (role-change.ts, RoleDialog.tsx).
 * Nobody changes their own role here. A studio's own leaders change their
 * team's roles on My Studio → Team, within the studio tier.
 *
 * Studios (Oct 1 2026, docs/rounds/2026-10-01-second-studio.md): beside
 * Change role, where a person also works — give them a second studio, or take
 * them off this studio's team (StudiosDialog.tsx, studio-membership.ts). The
 * home studio is never taken away here; the dialog says what to do instead.
 */
import { useMemo, useState } from "react";
import { deleteField, doc, updateDoc } from "firebase/firestore";
import { UserX, Users } from "lucide-react";
import { db } from "../../../firebase";
import type { Client, Studio, Trainer } from "../../../types";
import { whoWorksHere } from "../../../lib/who-works-here";
import { AdminButton, AdminEmpty, AdminNotice, AdminPanel } from "../../admin/primitives";
import { isSwitchedOff, switchedOffWhat } from "../../sign-out/account-off";
import { logActivity } from "../activity/log-activity";
import { ProvisionalPanel } from "../../admin/provisional/ProvisionalPanel";
import { HqRow, HqRows, HqStatus } from "../kit";
import { roleLabel } from "./role-change";
import { RoleDialog } from "./RoleDialog";
import { StudiosDialog } from "./StudiosDialog";

export function StudioTeam({
  studio,
  studios = [],
  trainers,
  clients,
  authTrainer,
  onCreated,
  onRolesChanged,
}: {
  studio: Studio;
  /** Every studio, for the Studios picker and the names in it. */
  studios?: readonly Studio[];
  trainers: Trainer[];
  clients: Client[];
  authTrainer: Trainer;
  onCreated?: () => Promise<void> | void;
  /** A role was changed: the dashboard reads the people again. */
  onRolesChanged?: () => Promise<void> | void;
}) {
  const studioId = studio.id ?? "";
  const [changing, setChanging] = useState<Trainer | null>(null);
  const [placing, setPlacing] = useState<Trainer | null>(null);
  const team = useMemo(
    () => whoWorksHere(trainers, studioId).slice().sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")),
    [trainers, studioId],
  );
  const owners = useMemo(() => trainers.filter((t) => (t.ownedStudioIds ?? []).includes(studioId)), [trainers, studioId]);
  const isMe = (t: Trainer) => t.id === authTrainer.id;
  // Former trainers whose accounts were switched off here (Oct 2 2026): off
  // every team list (who-works-here.ts), so listed here to be switched back on.
  const switchedOff = useMemo(
    () =>
      trainers
        .filter((t) => isSwitchedOff(t) && !t.supersededByUid)
        .filter((t) => t.primaryHomeStudioId === studioId || (t.accessibleStudioIds ?? []).includes(studioId))
        .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")),
    [trainers, studioId],
  );
  const [switchingOn, setSwitchingOn] = useState<string | null>(null);
  const [switchOnError, setSwitchOnError] = useState<string | null>(null);
  const switchOn = async (t: Trainer) => {
    setSwitchingOn(t.id);
    setSwitchOnError(null);
    try {
      await updateDoc(doc(db, "trainers", t.id), {
        isActive: true,
        switchedOffAt: deleteField(),
        switchedOffBy: deleteField(),
      });
      await logActivity({
        kind: "assisted-change",
        what: switchedOffWhat(t.fullName || "", false),
        studioId,
        before: { Account: "Switched off" },
        after: { Account: "On" },
        byName: authTrainer.fullName,
      });
      await onRolesChanged?.();
    } catch (err) {
      setSwitchOnError(`Couldn't switch ${t.fullName || "the account"} back on: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSwitchingOn(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <AdminPanel
        title="Who works here"
        icon={<Users className="w-3.5 h-3.5" />}
        subtitle={
          owners.length
            ? `Owned by ${owners.map((o) => `${o.fullName} (${roleLabel(o.role)})`).join(", ")}. Change role records who changed it, in the Activity record. The studio's leaders change their team's roles on My Studio → Team.`
            : "Change role records who changed it, in the Activity record. The studio's leaders change their team's roles on My Studio → Team."
        }
        flush
      >
        {team.length === 0 ? (
          <div className="p-4">
            <AdminEmpty title="Nobody works here yet">A studio leader comes first; they let the rest of the team in from My Studio → Team.</AdminEmpty>
          </div>
        ) : (
          <HqRows label={`Who works at ${studio.name}`}>
            {team.map((t) => (
              <HqRow
                key={t.id}
                name={t.fullName || "Unnamed person"}
                context={isMe(t) ? `${roleLabel(t.role)} · you` : roleLabel(t.role)}
                say={
                  <>
                    <span>
                      {t.primaryHomeStudioId === studioId
                        ? "Home studio"
                        : (t.accessibleStudioIds ?? []).includes(studioId)
                          ? "Also works here"
                          : "A guest here"}
                    </span>
                    {t.mindbodyStaffId ? (
                      <HqStatus tone="ok">Linked to Mindbody staff</HqStatus>
                    ) : (
                      <HqStatus tone="idle">Not linked to Mindbody staff</HqStatus>
                    )}
                  </>
                }
                action={
                  <>
                    <AdminButton size="sm" onClick={() => setPlacing(t)} aria-label={`Studios: ${t.fullName || "this person"}`}>
                      Studios
                    </AdminButton>
                    {isMe(t) ? null : (
                      <AdminButton size="sm" onClick={() => setChanging(t)} aria-label={`Change role: ${t.fullName || "this person"}`}>
                        Change role
                      </AdminButton>
                    )}
                  </>
                }
              />
            ))}
          </HqRows>
        )}
      </AdminPanel>
      {switchedOff.length > 0 ? (
        <AdminPanel
          title="Accounts switched off"
          icon={<UserX className="w-3.5 h-3.5" />}
          subtitle="Former trainers. Journey refuses them; their past sessions keep their name."
          flush
        >
          <HqRows label={`Accounts switched off at ${studio.name}`}>
            {switchedOff.map((t) => (
              <HqRow
                key={t.id}
                name={t.fullName || "Unnamed person"}
                context={roleLabel(t.role)}
                say={
                  <HqStatus tone="idle">
                    {t.switchedOffBy?.name
                      ? `Switched off by ${t.switchedOffBy.name}${t.switchedOffAt ? `, ${t.switchedOffAt.slice(0, 10)}` : ""}`
                      : "Switched off"}
                  </HqStatus>
                }
                action={
                  <AdminButton
                    size="sm"
                    busy={switchingOn === t.id}
                    disabled={switchingOn !== null}
                    onClick={() => void switchOn(t)}
                    aria-label={`Switch ${t.fullName || "this person"}'s account back on`}
                  >
                    Switch back on
                  </AdminButton>
                }
              />
            ))}
          </HqRows>
          {switchOnError ? (
            <div className="p-3">
              <AdminNotice tone="alert">{switchOnError}</AdminNotice>
            </div>
          ) : null}
        </AdminPanel>
      ) : null}
      <ProvisionalPanel studio={studio} clients={clients} trainers={trainers} authTrainer={authTrainer} onCreated={onCreated} />
      <RoleDialog
        person={changing}
        studioId={studioId}
        studioName={studio.name}
        byName={authTrainer.fullName}
        onClose={() => setChanging(null)}
        onSaved={onRolesChanged}
      />
      <StudiosDialog
        person={placing}
        studio={studio}
        studios={studios.length ? studios : [studio]}
        byName={authTrainer.fullName}
        onClose={() => setPlacing(null)}
        onSaved={onRolesChanged}
      />
    </div>
  );
}
