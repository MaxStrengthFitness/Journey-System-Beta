import { useMemo, useState } from "react";
import { CircleUserRound, TriangleAlert, UserPlus } from "lucide-react";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import type { Client, Trainer } from "../../types";
import { ROLE_LABELS } from "../../types";
import { AdminBadge, AdminEmpty, AdminInput, AdminNotice, AdminPanel, AdminRows } from "../admin/primitives";
import { STATE_BADGE, STUDIO_TIER_ROLES, StaffEditor } from "../admin/staff/StaffEditor";
import { useStaffRoster } from "../admin/staff/useStaffRoster";
import { ProvisionalPanel } from "../admin/provisional/ProvisionalPanel";
import { TeamPanel } from "../relay/team/TeamPanel";
import { StandingWeeksPanel } from "../standing-week/StandingWeeksPanel";
import "../admin/admin.css";

/**
 * MY STUDIO → TEAM — people and standards.
 *
 * Voice-review round, Sep 27 2026: Team's purpose was unclear because it
 * also answered the Hub's and Operations' questions. AJ: "Execute the people
 * and standards pivot." Team is the people who work here (each person's
 * week, this studio's staff and who is waiting to be let in) and what the
 * studio holds them to (the standing duties, the loops left open, the
 * vault). relay/team/TeamPanel.tsx says what went and where.
 *
 * Standing weeks come first (the same round): each trainer's usual week,
 * proposed on My Profile and agreed here, and the next seven days' bookings
 * checked against the agreed weeks — the free slots a leader can fill
 * (standing-week/StandingWeeksPanel.tsx).
 *
 * Round: My Studio, Sep 2026. The people and the standards (relay/team/
 * TeamPanel — what used to be Relay's Team tab) are the top half. The bottom
 * half is what the studio's leaders could not do from anywhere before: Staff
 * & Roles was owners-and-administrators only, so a head trainer could not
 * let their own new hire in. AJ (Sep 18):
 *
 *   · whenever a person requests to log in, a leader should be able to
 *     grant them access, and link them to an existing Mindbody profile if
 *     there is one — ideally everyone using the app is in Mindbody
 *   · a studio leader hands out trainer, head trainer and the "can manage
 *     this studio" grant — never owner or admin
 *   · temporary profiles (someone not in Mindbody yet) are the studio's to
 *     make, and to reconcile later
 *
 * Same code as Operations → Staff & Roles (useStaffRoster, StaffEditor), with
 * the studio tier's limits passed in: approvals land at THIS studio, the
 * roles on offer stop at studio leader, and the grant is for this studio.
 * Since the voice review follow-up (Sep 27 2026) this is the studio tier's
 * ONE editor: Staff & Roles shows them the list read-only, with a door here
 * (AJ: "yes"); only owners and administrators edit there.
 *
 * Who is on Team: everyone who works here (AJ, Sep 27 2026) — home, a
 * studio they also work at, or a guest — one rule for People, the
 * initiatives and the standing weeks (lib/who-works-here.ts). The staff
 * list below is a different list, not a wider one: it ADDS the studio's
 * owners, everyone Mindbody lists, everyone waiting to be let in and the
 * placeholders the others leave out, and it LEAVES OUT guests — a guest's
 * account and role are their home studio's to edit (admin/staff/roster.ts,
 * listedAt).
 */

export interface TeamSectionProps {
  authTrainer?: Trainer | null;
  clients?: Client[];
  trainers?: Trainer[];
  onOpenClient?: (clientId: string) => void;
}

const NONE: never[] = [];

export function TeamSection({ authTrainer, clients, trainers, onOpenClient }: TeamSectionProps) {
  const { activeStudio, activeStudioId } = useActiveStudio();
  /*
   * The staff roster is read ONCE, here, so the top of Team can say who is
   * waiting to be let in (voice-review round, Sep 27 2026). A new hire used
   * to depend on a leader scrolling past every other panel to the staff list.
   */
  const roster = useStaffRoster({ trainers: trainers ?? NONE, studio: activeStudio ?? null, studioId: activeStudioId ?? null });
  const waiting = roster.rows.filter((r) => r.state === "awaiting-approval").length;
  return (
    <div className="ms__team">
      {waiting > 0 && (
        <div className="adm ms__waiting">
          <AdminNotice tone="warn">
            {waiting === 1 ? "One person is" : `${waiting} people are`} waiting to be let in.{" "}
            <button
              type="button"
              className="ms__waiting-go"
              onClick={() => document.getElementById("team-staff")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              Let them in
            </button>
          </AdminNotice>
        </div>
      )}
      {activeStudio && (
        <div className="adm ms__weeks">
          <StandingWeeksPanel studio={activeStudio} authTrainer={authTrainer ?? null} trainers={trainers ?? NONE} clients={clients ?? NONE} />
        </div>
      )}
      <TeamPanel authTrainer={authTrainer} clients={clients} trainers={trainers} onOpenClient={onOpenClient} />
      <StaffPanel authTrainer={authTrainer ?? null} clients={clients ?? NONE} trainers={trainers ?? NONE} roster={roster} />
    </div>
  );
}

function StaffPanel({
  authTrainer,
  clients,
  trainers,
  roster,
}: {
  authTrainer: Trainer | null;
  clients: Client[];
  trainers: Trainer[];
  roster: ReturnType<typeof useStaffRoster>;
}) {
  const { activeStudio, activeStudioId, studios } = useActiveStudio();
  const studioId = activeStudioId ?? null;
  const studioName = activeStudio?.name ?? "this studio";
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { rows, summary, staffStatus } = roster;

  /*
   * A request that named another studio is that studio's to answer; one
   * that named this studio, or none, is shown here. buildStaffRoster does
   * that filtering, for both kinds of request, so the rows arrive scoped.
   */
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => !q || `${r.name} ${r.email ?? ""}`.toLowerCase().includes(q));
  }, [rows, search]);

  // Everyone waiting, whatever the search box holds: the badge used to count
  // only the rows that matched the search.
  const waiting = rows.filter((r) => r.state === "awaiting-approval").length;
  const selected = visible.find((r) => r.key === selectedKey) ?? null;

  if (!studioId || !activeStudio) return null;

  return (
    <div className="adm ms__staff" id="team-staff">
      <AdminPanel
        title={`${studioName}'s staff`}
        icon={<CircleUserRound className="w-3.5 h-3.5" />}
        subtitle="Mindbody decides who is on the schedule. Letting someone in here is what gives them an account and a role — and links them to their Mindbody profile when there is one."
        actions={
          <span className="flex items-center gap-2">
            {waiting > 0 && (
              <AdminBadge tone="hero">
                <UserPlus className="w-3 h-3 inline mr-1" />
                {waiting} waiting
              </AdminBadge>
            )}
            <AdminInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              style={{ width: 160 }}
            />
          </span>
        }
        flush
      >
        {staffStatus && (
          <div className="p-3">
            <AdminNotice tone="info">{staffStatus}</AdminNotice>
          </div>
        )}
        {summary.duplicates > 0 && (
          <div className="p-3 pt-0">
            <AdminNotice tone="alert">
              {summary.duplicates} {summary.duplicates === 1 ? "person has" : "people have"} two accounts. Tap them to see which — an administrator sorts it out.
            </AdminNotice>
          </div>
        )}
        {visible.length === 0 ? (
          <div className="p-4">
            <AdminEmpty title="Nobody to show">{search ? "No match for that search." : `No staff at ${studioName} yet.`}</AdminEmpty>
          </div>
        ) : (
          <AdminRows>
            {visible.map((row) => {
              const badge = STATE_BADGE[row.state];
              return (
                <button
                  key={row.key}
                  type="button"
                  className="adm-row adm-row--tappable"
                  onClick={() => setSelectedKey(row.key === selectedKey ? null : row.key)}
                  aria-current={row.key === selectedKey ? "true" : undefined}
                >
                  <span className="adm-row__main">
                    <span className="adm-row__name">
                      {row.name}
                      {row.duplicateTrainerIds && (
                        <TriangleAlert className="w-3.5 h-3.5 inline ml-1.5" style={{ color: "var(--adm-alert)" }} />
                      )}
                    </span>
                    <span className="adm-row__meta">
                      {row.email || "no email"}
                      {row.role ? ` · ${ROLE_LABELS[row.role] ?? row.role}` : ""}
                      {studioId && row.trainer?.managedStudioIds?.includes(studioId) ? " · helps run the studio" : ""}
                    </span>
                  </span>
                  <AdminBadge tone={badge.tone}>{badge.label}</AdminBadge>
                </button>
              );
            })}
          </AdminRows>
        )}
      </AdminPanel>

      {selected && (
        <StaffEditor
          key={selected.key}
          row={selected}
          studios={studios ?? []}
          activeStudioId={studioId}
          assignableRoles={STUDIO_TIER_ROLES}
          canChangeRole
          lockHomeStudio
          grantStudioId={studioId}
          onDone={() => setSelectedKey(null)}
        />
      )}

      {authTrainer && (
        <ProvisionalPanel studio={activeStudio} clients={clients} trainers={trainers} authTrainer={authTrainer} />
      )}
    </div>
  );
}
