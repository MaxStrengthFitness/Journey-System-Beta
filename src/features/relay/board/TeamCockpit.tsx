import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Clock, Flag, Hand, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "../../../contexts/ToastContext";
import { cn } from "../../../lib/utils";
import { createRequest, type TaskRequest } from "../../studio-tasks/requests";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import { CLIENT_ACTION_LABEL, type ClientTaskAction } from "../../studio-tasks/types";
import { dueChoices, jobTiming } from "../jobs/jobs";
import { postTeamJob } from "../jobs/mutations";
import type { TeamJob } from "../jobs/types";
import { PeoplePicker, Seg, Toggle, type Person } from "../kit";
import { useRelay } from "./RelayContext";
import { COHORT_DEFAULT_ASK, COHORT_HINT, COHORT_LABEL, COHORT_ORDER, cohortsOf, type CohortKey, type CohortMember } from "./cohorts";
import { entryIsTrainers, minutesToClock, mySessionsToday } from "./now-context";
import { useMachineCare } from "./machine-care-store";

/**
 * THE TEAM COCKPIT — what a leader sees first on the Team tab.
 *
 * Round: Relay, Sep 2026. The old Team tab was a report ("Behind: Nobody",
 * a 7×7 grid of empty boxes). A leader deciding who gets the deep clean
 * needs to see the floor: who is in today and how loaded, which cohorts
 * need action this month, and the three things that will embarrass the
 * studio if nobody acts. Everything here reads what the tab already holds
 * or what AppContent already loads (the schedule, the roster).
 */

/* ------------------------------------------------------------------ *
 * Who's in today
 * ------------------------------------------------------------------ */

export function WhosInToday({ roster, jobs }: { roster: Person[]; jobs: TeamJob[] }) {
  const relay = useRelay();
  const todayKey = relay.now.todayKey;
  const people = useMemo(() => {
    return roster
      .map((p) => {
        const trainer = relay.trainers.find((t) => t.id === p.id);
        const sessions = trainer ? mySessionsToday(relay.schedules, trainer, todayKey) : [];
        const first = sessions[0]?.startMin ?? null;
        const last = sessions.length ? sessions[sessions.length - 1].endMin : null;
        const handed = jobs.filter((j) => j.status === "open" && j.assigneeIds.includes(p.id)).length;
        const done = jobs.filter((j) => j.status === "done" && j.completedBy?.id === p.id && j.closedOn === todayKey).length;
        return { person: p, sessions: sessions.length, first, last, handed, done };
      })
      .sort((a, b) => (b.sessions > 0 ? 1 : 0) - (a.sessions > 0 ? 1 : 0) || (a.first ?? 9999) - (b.first ?? 9999) || a.person.name.localeCompare(b.person.name));
  }, [roster, relay.trainers, relay.schedules, todayKey, jobs]);
  const max = Math.max(1, ...people.map((p) => p.sessions));

  return (
    <section className="tc" aria-labelledby="tc-in">
      <header className="rl-h">
        <h3 className="rl-h__title" id="tc-in">
          <Users size={13} aria-hidden /> Who's in today
        </h3>
        <span className="rl-h__sub">from the schedule · tap a name to hand them a job</span>
      </header>
      {people.length === 0 ? (
        <p className="pk-empty">Nobody has this studio as their home studio yet.</p>
      ) : (
        <ul className="tc__list">
          {people.map((p) => (
            <li key={p.person.id} className={cn("tc__row", p.sessions === 0 && "tc__row--off")}>
              <span className="tc__name">
                <span className="tc__dot" aria-hidden />
                {p.person.name}
              </span>
              <span className="tc__hours">{p.sessions ? `${minutesToClock(p.first!)}–${minutesToClock(p.last!)}` : "off today"}</span>
              <span className="tc__bar" aria-label={`${p.sessions} sessions`}>
                <span className="tc__bar-fill" style={{ width: `${Math.round((p.sessions / max) * 100)}%` }} />
              </span>
              <span className="tc__count">{p.sessions} {p.sessions === 1 ? "session" : "sessions"}</span>
              <span className="tc__jobs">
                {p.handed} handed{p.done ? ` · ✓ ${p.done}` : ""}
              </span>
              <button
                type="button"
                className="pl__btn"
                onClick={() => relay.openCapture({ destination: "someone", someoneForm: "job", people: [p.person], openToAll: false })}
              >
                <Hand size={13} aria-hidden /> Hand a job
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * This month — the cohorts
 * ------------------------------------------------------------------ */

export function CohortPanel({ roster }: { roster: Person[] }) {
  const relay = useRelay();
  const cohorts = useMemo(() => cohortsOf(relay.clients, relay.studioId, relay.now.todayKey), [relay.clients, relay.studioId, relay.now.todayKey]);
  const [routing, setRouting] = useState<CohortKey | null>(null);
  const [showing, setShowing] = useState<CohortKey | null>(null);

  return (
    <section className="tc" aria-labelledby="tc-month">
      <header className="rl-h">
        <h3 className="rl-h__title" id="tc-month">
          <Clock size={13} aria-hidden /> This month
        </h3>
        <span className="rl-h__sub">cohorts from the roster · route one to the team</span>
      </header>
      <ul className="tc__cohorts">
        {COHORT_ORDER.map((key) => {
          const members = cohorts[key];
          return (
            <li key={key} className="tc__cohort">
              <button type="button" className="tc__cohort-main" aria-expanded={showing === key} onClick={() => setShowing((s) => (s === key ? null : key))}>
                <span className="tc__cohort-count">{members.length}</span>
                <span className="tc__cohort-text">
                  <span className="tc__cohort-label">{COHORT_LABEL[key]}</span>
                  <span className="tc__cohort-hint">{COHORT_HINT[key]}</span>
                </span>
              </button>
              <button type="button" className="pl__btn pl__btn--primary" disabled={members.length === 0} onClick={() => setRouting(key)}>
                Route to team <ArrowRight size={13} aria-hidden />
              </button>
              {showing === key && members.length > 0 && (
                <ul className="tc__members">
                  {members.slice(0, 40).map((m) => (
                    <li key={m.id}>
                      <button type="button" className="tc__member" onClick={() => relay.onOpenClientTask?.(m.id)}>
                        <span>{m.name}</span>
                        <span className="tc__member-why">{m.why}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <RouteToTeamSheet cohort={routing} members={routing ? cohorts[routing] : []} roster={roster} onOpenChange={(o) => !o && setRouting(null)} />
    </section>
  );
}

function RouteToTeamSheet({ cohort, members, roster, onOpenChange }: { cohort: CohortKey | null; members: CohortMember[]; roster: Person[]; onOpenChange: (o: boolean) => void }) {
  const relay = useRelay();
  const { success: toastSuccess, error: toastError } = useToast();
  const [title, setTitle] = useState("");
  const [action, setAction] = useState<ClientTaskAction>("custom");
  const [how, setHow] = useState<"job" | "initiative">("job");
  const [people, setPeople] = useState<Person[]>([]);
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [perTrainer, setPerTrainer] = useState<number>(0);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [seeded, setSeeded] = useState<CohortKey | null>(null);
  const todayKey = relay.now.todayKey;

  if (cohort && seeded !== cohort) {
    setSeeded(cohort);
    setTitle(COHORT_DEFAULT_ASK[cohort].title);
    setAction(COHORT_DEFAULT_ASK[cohort].action);
    setPeople([]);
    setDueOn(null);
    setHow("job");
    setPerTrainer(0);
  }

  const submit = async () => {
    if (!cohort || !relay.studioId || !relay.uid) return;
    const author: TaskAuthor = { id: relay.uid, name: relay.authTrainer?.fullName ?? "A leader" };
    setBusy(true);
    try {
      if (how === "job") {
        await postTeamJob({
          studioId: relay.studioId,
          draft: {
            title: title.trim() || COHORT_LABEL[cohort],
            detail: `${COHORT_LABEL[cohort]} — ${members.length} clients. ${COHORT_HINT[cohort]}`,
            category: "client-service",
            about: { kind: "client", clientIds: members.map((m) => m.id), clientNames: Object.fromEntries(members.map((m) => [m.id, m.name])) },
            assignees: people,
            openToAll: people.length === 0,
            partLabels: [],
            dueOn,
            requiresNote: false,
            notifyOnDone: notify,
          },
          author,
          machineName: () => "",
        });
        toastSuccess(`Posted — one part per client, ${members.length} in all.`);
      } else {
        await createRequest({
          studioId: relay.studioId,
          author,
          kind: "initiative",
          title: title.trim() || COHORT_LABEL[cohort],
          detail: `${COHORT_LABEL[cohort]}: ${members.map((m) => m.name).slice(0, 20).join(", ")}${members.length > 20 ? ` and ${members.length - 20} more` : ""}`,
          target: { action, perTrainer: perTrainer || undefined, dueOn: dueOn ?? undefined },
          priority: "normal",
          expiry: "none",
        });
        toastSuccess("Posted as an initiative — trainers submit who they covered.");
      }
      onOpenChange(false);
    } catch (err) {
      console.warn("[relay] route to team failed:", err);
      toastError("Could not post that. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={cohort !== null} onOpenChange={onOpenChange}>
      <DialogContent className="pk-sheet sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="pk-title">
            <ArrowRight size={18} aria-hidden /> Route to the team
          </DialogTitle>
          {cohort && (
            <p className="pk-lede">
              {COHORT_LABEL[cohort]} · {members.length} {members.length === 1 ? "client" : "clients"}
            </p>
          )}
        </DialogHeader>
        <div className="pk-body">
          <label className="pk-field">
            <span className="pk-label">What to do for each of them</span>
            <input className="pk-input" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <div className="pk-field">
            <span className="pk-label">Which flow it opens</span>
            <div className="pk-chips" role="group" aria-label="Which flow">
              {(["progress-report", "assessment", "inbody", "custom"] as ClientTaskAction[]).map((a) => (
                <button key={a} type="button" className="pk-chip" aria-pressed={action === a} onClick={() => setAction(a)}>
                  {CLIENT_ACTION_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
          <Seg<"job" | "initiative">
            value={how}
            options={[
              { value: "job", label: "A team job, one part per client" },
              { value: "initiative", label: "An initiative, a count each" },
            ]}
            onChange={setHow}
            label="How"
          />
          {how === "job" ? (
            <PeoplePicker people={roster} selected={people} onChange={setPeople} meId={relay.uid} label="Who's on it (or leave it up for grabs)" max={30} />
          ) : (
            <div className="pk-field">
              <span className="pk-label">How many each</span>
              <div className="pk-chips">
                {[0, 3, 5, 8, 10].map((n) => (
                  <button key={n} type="button" className="pk-chip" aria-pressed={perTrainer === n} onClick={() => setPerTrainer(n)}>
                    {n === 0 ? "No number" : n}
                  </button>
                ))}
              </div>
              {perTrainer > 0 && <p className="pk-hint">That is {perTrainer * roster.length} across {roster.length} trainers.</p>}
            </div>
          )}
          <div className="pk-field">
            <span className="pk-label">By when</span>
            <div className="pk-chips">
              <button type="button" className="pk-chip" aria-pressed={dueOn === null} onClick={() => setDueOn(null)}>
                No date
              </button>
              {dueChoices(todayKey).map((c) => (
                <button key={c.label} type="button" className="pk-chip" aria-pressed={dueOn === c.dateKey} onClick={() => setDueOn(c.dateKey)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {how === "job" && <Toggle checked={notify} onChange={setNotify} title="Tell me when it's finished" body="Your bell rings once when the last part is ticked." />}
        </div>
        <div className="pk-foot">
          <button type="button" className="pl__btn" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="pl__btn pl__btn--primary" onClick={() => void submit()} disabled={busy || members.length === 0}>
            {busy ? "Posting…" : "Post to the team"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ *
 * Open loops
 * ------------------------------------------------------------------ */

const STALE_ASK_MS = 24 * 60 * 60 * 1000;

function millisOf(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | Date | undefined;
  if (t instanceof Date) return t.getTime();
  return typeof (t as { toMillis?: () => number })?.toMillis === "function" ? (t as { toMillis: () => number }).toMillis() : null;
}

export function OpenLoops({ requests, jobs, machineNames }: { requests: TaskRequest[]; jobs: TeamJob[]; machineNames: (id: string) => string }) {
  const relay = useRelay();
  const care = useMachineCare(relay.studioId);
  const now = Date.now();
  const unanswered = requests.filter((r) => r.status === "open" && !r.claimedBy && r.kind !== "initiative" && (millisOf(r.createdAt) ?? now) < now - STALE_ASK_MS);
  const flagged = Object.values(care.byMachineId).filter((c) => c.flag);
  const overdue = jobs.filter((j) => j.status === "open" && jobTiming(j, relay.now.todayKey) === "overdue");
  const total = unanswered.length + flagged.length + overdue.length;

  return (
    <section className="tc" aria-labelledby="tc-loops">
      <header className="rl-h">
        <h3 className="rl-h__title" id="tc-loops">
          <AlertTriangle size={13} aria-hidden /> Open loops
        </h3>
        <span className="rl-h__sub">{total === 0 ? "nothing hanging" : `${total} to close`}</span>
      </header>
      {total === 0 ? (
        <p className="pk-empty">Every ask has a name on it, nothing is flagged, no job is overdue.</p>
      ) : (
        <ul className="tc__loops">
          {unanswered.map((r) => (
            <li key={r.id} className="tc__loop">
              <span className="tc__loop-kind">Unanswered ask</span>
              <span className="tc__loop-title">{r.title}</span>
              <span className="tc__loop-sub">from {r.createdBy.name.split(" ")[0]}</span>
              <button type="button" className="pl__btn" onClick={() => relay.openCapture({ destination: "someone", text: r.title })}>
                <Hand size={13} aria-hidden /> Hand it
              </button>
            </li>
          ))}
          {flagged.map((c) => (
            <li key={c.machineId} className="tc__loop">
              <span className="tc__loop-kind">
                <Flag size={11} aria-hidden /> Flagged machine
              </span>
              <span className="tc__loop-title">{machineNames(c.machineId) || c.machineId}</span>
              <span className="tc__loop-sub">
                {c.flag!.note} — {c.flag!.by.name.split(" ")[0]}
              </span>
              <button type="button" className="pl__btn" onClick={() => relay.openCapture({ destination: "someone", text: `${machineNames(c.machineId) || c.machineId}: ${c.flag!.note}`, machineIds: [c.machineId] })}>
                <Hand size={13} aria-hidden /> Hand it
              </button>
            </li>
          ))}
          {overdue.map((j) => (
            <li key={j.id} className="tc__loop">
              <span className="tc__loop-kind">Overdue job</span>
              <span className="tc__loop-title">{j.title}</span>
              <span className="tc__loop-sub">was due {j.dueOn}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* The studio's day and its deep-clean interval used to be edited here
   (StandardsHours). They are My Studio → Studio's now (My Studio round,
   Sep 2026, features/my-studio/StudioSection), on the same dirty-tracked save
   bar as the rest of the studio's record. */

// Re-exported for the Team tab's own use of the schedule matcher.
export { entryIsTrainers };
