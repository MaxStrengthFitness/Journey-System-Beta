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
 */
import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import type { Client, Studio, Trainer } from "../../../types";
import { whoWorksHere } from "../../../lib/who-works-here";
import { AdminButton, AdminEmpty, AdminPanel } from "../../admin/primitives";
import { ProvisionalPanel } from "../../admin/provisional/ProvisionalPanel";
import { HqRow, HqRows, HqStatus } from "../kit";
import { roleLabel } from "./role-change";
import { RoleDialog } from "./RoleDialog";

export function StudioTeam({
  studio,
  trainers,
  clients,
  authTrainer,
  onCreated,
  onRolesChanged,
}: {
  studio: Studio;
  trainers: Trainer[];
  clients: Client[];
  authTrainer: Trainer;
  onCreated?: () => Promise<void> | void;
  /** A role was changed: the dashboard reads the people again. */
  onRolesChanged?: () => Promise<void> | void;
}) {
  const studioId = studio.id ?? "";
  const [changing, setChanging] = useState<Trainer | null>(null);
  const team = useMemo(
    () => whoWorksHere(trainers, studioId).slice().sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")),
    [trainers, studioId],
  );
  const owners = useMemo(() => trainers.filter((t) => (t.ownedStudioIds ?? []).includes(studioId)), [trainers, studioId]);
  const isMe = (t: Trainer) => t.id === authTrainer.id;

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
                  isMe(t) ? undefined : (
                    <AdminButton size="sm" onClick={() => setChanging(t)} aria-label={`Change ${t.fullName || "this person"}'s role`}>
                      Change role
                    </AdminButton>
                  )
                }
              />
            ))}
          </HqRows>
        )}
      </AdminPanel>
      <ProvisionalPanel studio={studio} clients={clients} trainers={trainers} authTrainer={authTrainer} onCreated={onCreated} />
      <RoleDialog
        person={changing}
        studioId={studioId}
        studioName={studio.name}
        byName={authTrainer.fullName}
        onClose={() => setChanging(null)}
        onSaved={onRolesChanged}
      />
    </div>
  );
}
