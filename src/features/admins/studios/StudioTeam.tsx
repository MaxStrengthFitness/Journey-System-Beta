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
 * Roles are changed on My Studio → Team or Operations → Staff & Roles, not
 * here; this page reads.
 */
import { useMemo } from "react";
import { Users } from "lucide-react";
import { ROLE_LABELS, type Client, type Studio, type Trainer } from "../../../types";
import { whoWorksHere } from "../../../lib/who-works-here";
import { AdminEmpty, AdminPanel } from "../../admin/primitives";
import { ProvisionalPanel } from "../../admin/provisional/ProvisionalPanel";
import { HqRow, HqRows, HqStatus } from "../kit";

function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}

export function StudioTeam({
  studio,
  trainers,
  clients,
  authTrainer,
  onCreated,
}: {
  studio: Studio;
  trainers: Trainer[];
  clients: Client[];
  authTrainer: Trainer;
  onCreated?: () => Promise<void> | void;
}) {
  const studioId = studio.id ?? "";
  const team = useMemo(
    () => whoWorksHere(trainers, studioId).slice().sort((a, b) => (a.fullName || "").localeCompare(b.fullName || "")),
    [trainers, studioId],
  );
  const owners = useMemo(() => trainers.filter((t) => (t.ownedStudioIds ?? []).includes(studioId)), [trainers, studioId]);

  return (
    <div className="flex flex-col gap-4">
      <AdminPanel
        title="Who works here"
        icon={<Users className="w-3.5 h-3.5" />}
        subtitle={
          owners.length
            ? `Owned by ${owners.map((o) => `${o.fullName} (${roleLabel(o.role)})`).join(", ")}. Roles are changed on My Studio → Team.`
            : "Roles are changed on My Studio → Team."
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
                context={roleLabel(t.role)}
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
              />
            ))}
          </HqRows>
        )}
      </AdminPanel>
      <ProvisionalPanel studio={studio} clients={clients} trainers={trainers} authTrainer={authTrainer} onCreated={onCreated} />
    </div>
  );
}
