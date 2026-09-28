/**
 * ADMINS → MACHINERY → ACTIVITY — the company's record of what was changed
 * from the Admins dashboard, and who the administrators are.
 *
 * Round: the Admins room's second wave (Sep 28 2026, AJ "all yes" to the
 * Activity record). Two parts:
 *
 *   The administrators   everyone with the whole Admins dashboard, read from
 *                        the people the dashboard already holds (no query),
 *                        each with Change role — never your own. Making
 *                        someone an administrator starts from Search: they
 *                        open on their studio's Team, where Change role is.
 *   The record           every entry, newest first, filtered by kind (one
 *                        query per filter: activity where kind in [...],
 *                        useActivity.ts). Read when the page opens, again on
 *                        Reload and on a filter change; no listener.
 *
 * Nothing is sent to anyone, and nothing is marked on the thing changed (AJ,
 * q8): the record is a place to read.
 */
import { useMemo, useState } from "react";
import { History, RefreshCw, ShieldCheck } from "lucide-react";
import type { Studio, Trainer } from "../../../types";
import { AdminButton, AdminEmpty, AdminHeader, AdminPanel, AdminScreen } from "../../admin/primitives";
import { isDemoStudio } from "../../demo-mode/is-demo";
import { HqRow, HqRows } from "../kit";
import { isAdministratorRole, roleLabel } from "../studios/role-change";
import { RoleDialog } from "../studios/RoleDialog";
import { ACTIVITY_FILTERS, type ActivityFilter } from "./activity";
import { ActivityList } from "./ActivityList";
import { useActivity } from "./useActivity";

export interface ActivityPageProps {
  studios: Studio[];
  trainers: Trainer[];
  authTrainer: Trainer;
  /** A role was changed here: the dashboard reads the people again. */
  onRolesChanged?: () => void | Promise<void>;
}

/** The administrators, by name: active, not replaced, and not Demo Mode's seeded people. */
export function administratorsOf(trainers: readonly Trainer[], studios: readonly Studio[]): Trainer[] {
  const demoIds = new Set(studios.filter((s) => isDemoStudio(s)).map((s) => s.id));
  return trainers
    .filter((t) => isAdministratorRole(t.role))
    .filter((t) => {
      const extra = t as Trainer & { isActive?: boolean; isDemo?: boolean };
      return extra.isActive !== false && !t.supersededByUid && extra.isDemo !== true && !demoIds.has(t.primaryHomeStudioId);
    })
    .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
}

export function ActivityPage({ studios, trainers, authTrainer, onRolesChanged }: ActivityPageProps) {
  const [filter, setFilter] = useState<ActivityFilter["id"]>("all");
  const [seq, setSeq] = useState(0);
  const [changing, setChanging] = useState<Trainer | null>(null);
  const kinds = (ACTIVITY_FILTERS.find((f) => f.id === filter) ?? ACTIVITY_FILTERS[0]).kinds;
  const read = useActivity({ kinds }, seq);
  const admins = useMemo(() => administratorsOf(trainers, studios), [trainers, studios]);
  const studioName = (id: string | undefined) => studios.find((s) => s.id === id)?.name;

  return (
    <AdminScreen>
      <AdminHeader
        icon={<History className="w-5 h-5" />}
        title="Activity"
        subtitle="Who changed what from the Admins dashboard, and when: admin grants, the standard and the studio defaults, studios opening, and changes made at a studio. Nothing is sent to anyone."
        actions={
          <AdminButton onClick={() => setSeq((n) => n + 1)} busy={read.state === "loading"}>
            {read.state !== "loading" ? <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> : null}
            Reload
          </AdminButton>
        }
      />

      <AdminPanel
        title="Administrators"
        icon={<ShieldCheck className="w-3.5 h-3.5" />}
        subtitle="Everyone with the whole Admins dashboard. To make someone an administrator, find them with Search: they open on their studio's Team, where Change role is. Every grant is recorded below."
        flush
      >
        {admins.length === 0 ? (
          <div className="p-4">
            <AdminEmpty title="No administrators are listed">The people list may still be loading.</AdminEmpty>
          </div>
        ) : (
          <HqRows label="Administrators">
            {admins.map((t) => {
              const me = t.id === authTrainer.id;
              const home = studioName(t.primaryHomeStudioId);
              return (
                <HqRow
                  key={t.id}
                  name={t.fullName || "Unnamed person"}
                  context={me ? `${roleLabel(t.role)} · you` : roleLabel(t.role)}
                  say={<span>{home ? `Home studio: ${home}` : "No home studio in the list"}</span>}
                  action={
                    me ? undefined : (
                      <AdminButton size="sm" onClick={() => setChanging(t)} aria-label={`Change ${t.fullName || "this person"}'s role`}>
                        Change role
                      </AdminButton>
                    )
                  }
                />
              );
            })}
          </HqRows>
        )}
      </AdminPanel>

      <div className="hq-chips" role="group" aria-label="Show the record by kind">
        {ACTIVITY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`hq-chip${filter === f.id ? " hq-chip--on" : ""}`}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <AdminPanel title="The record" subtitle="Newest first. Each entry is signed by the person who made the change." flush>
        <ActivityList
          read={read}
          studios={studios}
          showStudio
          label="The Activity record"
          empty="Changes made from the Admins dashboard are recorded here from Sep 28 2026 on. None of this kind yet."
          onRetry={() => setSeq((n) => n + 1)}
        />
      </AdminPanel>

      <RoleDialog
        person={changing}
        studioId={null}
        byName={authTrainer.fullName}
        onClose={() => setChanging(null)}
        onSaved={async () => {
          await onRolesChanged?.();
          setSeq((n) => n + 1);
        }}
      />
    </AdminScreen>
  );
}
