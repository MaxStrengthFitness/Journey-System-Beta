import { useMemo, useState, type ReactNode } from "react";
import { BadgeCheck, BookOpenCheck, CheckCheck, CircleSlash, Flag, Heart, Megaphone, UserRoundPlus } from "lucide-react";
import { cn } from "../../../lib/utils";
import { useActiveStudio } from "../../../contexts/ActiveStudioContext";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { homeCutoverOf } from "../../../lib/client-coverage";
import { ROLE_LABELS, type UserRole } from "../../../types";
import { useHubAnnouncements } from "../../notifications/useHubAnnouncements";
import type { TaskRequest } from "../../studio-tasks/requests";
import type { TaskRow } from "../../studio-tasks/types";
import type { PlaybookEntry } from "../../studio-tasks/playbook";
import type { TeamJob } from "../jobs/types";
import { useRelay } from "./RelayContext";
import { useMachineCare } from "./machine-care-store";
import { tapNotice, tappedKeys, useLastSeen } from "./last-seen";
import {
  heartsLine,
  machineLine,
  millisOf,
  newClientLine,
  newClientsCaveat,
  newClientsThisWeek,
  sinceNotices,
  weekOf,
  whenWords,
  type SinceHeart,
  type SinceMachine,
  type SinceNotice,
} from "./since";
import "./board.css";

/**
 * SINCE YOU WERE IN — the notice board at the top of the Board's side column
 * (the second wave of the Relay room, Sep 28 2026). What changed at the
 * studio since this trainer last opened the Board: what leadership posted,
 * who is new this week, machines off the floor or flagged, answers the team
 * kept in the Playbook, and hearts on your own work (only you see those).
 *
 * The rules and every sentence are ./since.ts; the marker is ./last-seen.ts.
 * A filled dot is new since you were in; a tap marks one seen on this iPad;
 * Mark all read moves the marker. Everything here is read from what the app
 * already streams (the studio's clients and bookings, the notices, the floor,
 * the Playbook, the Board's own rows, jobs and asks), plus the one marker.
 * Nothing pings anyone.
 */
export interface SinceYouWereInProps {
  rows: TaskRow[];
  jobs: TeamJob[];
  /** Asks answered lately (useStudioRequests' recentlyResolved). */
  resolved: TaskRequest[];
  playbook: PlaybookEntry[];
  /** Extra actions on an announcement (the "I've read it" button). */
  announcementAction?: (announcement: { id: string; asksRead?: boolean; authorId?: string }) => ReactNode;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function SinceYouWereIn({ rows, jobs, resolved, playbook, announcementAction }: SinceYouWereInProps) {
  const relay = useRelay();
  const { studios } = useActiveStudio();
  const { announcements } = useHubAnnouncements(relay.authTrainer);
  const { machines: floor, rosterEntries } = useStudioMachines(relay.studioId);
  const care = useMachineCare(relay.studioId);
  const last = useLastSeen(relay.studioId, relay.uid);
  const [tick, setTick] = useState(0);
  const now = relay.now;

  const me = useMemo(() => new Set([relay.uid, relay.authTrainer?.id].filter(Boolean) as string[]), [relay.uid, relay.authTrainer?.id]);
  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of relay.trainers) if (t.id) m.set(t.id, t.fullName ?? "");
    return (id: string) => m.get(id) ?? "";
  }, [relay.trainers]);

  const newClients = useMemo(
    () =>
      newClientsThisWeek({
        todayKey: now.todayKey,
        nowMin: now.nowMin,
        week: weekOf(now.todayKey),
        clients: relay.clients,
        bookings: relay.schedules,
        roster: relay.rosterStatus ?? (relay.clients.length > 0 ? "ready" : "loading"),
        cutoverOf: (c) => homeCutoverOf(studios ?? [], c),
      }),
    [now.todayKey, now.nowMin, relay.clients, relay.schedules, relay.rosterStatus, studios],
  );

  const machines = useMemo<SinceMachine[]>(() => {
    const byId = new Map<string, SinceMachine>();
    const nameOfMachine = (id: string) => floor.find((m) => m.machineId === id)?.name ?? relay.machines.find((m) => m.id === id)?.name ?? "A machine";
    for (const e of rosterEntries) {
      if (e.status !== "maintenance") continue;
      byId.set(e.machineId, { machineId: e.machineId, name: nameOfMachine(e.machineId), source: "roster", at: millisOf(e.updatedAt), by: null, note: null });
    }
    for (const [id, c] of Object.entries(care.byMachineId)) {
      if (!c.flag) continue;
      const was = byId.get(id);
      byId.set(id, {
        machineId: id,
        name: was?.name ?? nameOfMachine(id),
        source: was ? "roster" : "flag",
        at: Math.max(was?.at ?? 0, c.flag.at || 0) || null,
        by: c.flag.by.name || null,
        note: c.flag.note || null,
      });
    }
    return [...byId.values()];
  }, [rosterEntries, care.byMachineId, floor, relay.machines]);

  const hearts = useMemo<SinceHeart[]>(() => {
    const out: SinceHeart[] = [];
    const from = (kudos: Record<string, true> | undefined) =>
      Object.keys(kudos ?? {})
        .filter((id) => !me.has(id))
        .map((id) => firstName(nameOf(id) || "A teammate"));
    for (const r of rows) {
      const inst = r.instance;
      if (!inst || inst.status !== "done" || !inst.completedBy || !me.has(inst.completedBy.id)) continue;
      const f = from(inst.kudos);
      if (f.length) out.push({ key: `row:${r.id}`, what: `“${r.machineName ? `${r.title}: ${r.machineName}` : r.title}”`, from: f, at: millisOf(inst.completedAt) });
    }
    for (const j of jobs) {
      if (j.status !== "done" || !j.completedBy || !me.has(j.completedBy.id)) continue;
      const f = from(j.kudos);
      if (f.length) out.push({ key: `job:${j.id}`, what: `“${j.title}”`, from: f, at: millisOf(j.completedAt) });
    }
    for (const r of resolved) {
      if (!r.resolvedBy || !me.has(r.resolvedBy.id)) continue;
      const f = from(r.kudos);
      if (f.length) out.push({ key: `ask:${r.id}`, what: `“${r.title}”`, from: f, at: millisOf(r.resolvedAt) });
    }
    return out;
  }, [rows, jobs, resolved, me, nameOf]);

  const { notices, newCount } = useMemo(() => {
    void tick;
    return sinceNotices({
      now: Date.now(),
      seenAt: last.seenAt,
      announcements: announcements.filter((a) => a.id).map((a) => ({ ...a, id: a.id! })),
      roleOf: (authorId) => {
        const t = relay.trainers.find((x) => x.id === authorId);
        return t?.role ? ROLE_LABELS[t.role as UserRole] ?? null : null;
      },
      newClients,
      machines,
      playbook,
      hearts,
      readKeys: tappedKeys(relay.studioId),
    });
  }, [tick, last.seenAt, announcements, relay.trainers, newClients, machines, playbook, hearts, relay.studioId]);

  return (
    <SinceBoard
      notices={notices}
      newCount={newCount}
      seenAt={last.seenAt}
      failed={last.failed}
      todayKey={now.todayKey}
      studioName={relay.studioName}
      me={me}
      onTap={(key) => {
        tapNotice(relay.studioId, key);
        setTick((t) => t + 1);
      }}
      onMarkAll={last.markAllRead}
      announcementAction={announcementAction}
    />
  );
}

/* ------------------------------------------------------------------ *
 * The board itself, drawn from props (mounted on its own in the tests)
 * ------------------------------------------------------------------ */

export function SinceBoard({
  notices,
  newCount,
  seenAt,
  failed,
  todayKey,
  studioName,
  me,
  onTap,
  onMarkAll,
  announcementAction,
}: {
  notices: SinceNotice[];
  newCount: number;
  seenAt: number | null | undefined;
  failed: boolean;
  todayKey: string;
  studioName: string;
  me: ReadonlySet<string>;
  onTap: (key: string) => void;
  onMarkAll: () => void;
  announcementAction?: SinceYouWereInProps["announcementAction"];
}) {
  const since = typeof seenAt === "number" ? whenWords(seenAt, todayKey) : seenAt === null ? "this week" : null;
  return (
    <section className="rsy" aria-label="Since you were in">
      <header className="rsy__head">
        <h2 className="rbd-h rsy__title">
          Since you were in
          {since && <span className="rbd-h__sub">{since}</span>}
        </h2>
        <span className={cn("rsy__count", newCount === 0 && "rsy__count--zero")}>{newCount ? `${newCount} new` : "All read"}</span>
      </header>
      {failed && <p className="rsy__quiet">Couldn't check when you were last in, so nothing is marked new.</p>}
      {notices.length === 0 ? (
        <p className="rsy__quiet">Nothing posted, kept or flagged at {studioName} that Relay can see.</p>
      ) : (
        <ul className="rsy__list">
          {notices.map((n) => (
            <li key={n.key} className={cn("rsy__item", n.isNew && "rsy__item--new")}>
              <button
                type="button"
                className="rsy__tap"
                aria-label={`${n.isNew ? "New" : "Seen"}: ${noticeLabel(n)}`}
                onClick={() => n.isNew && onTap(n.key)}
              >
                <span className="rsy__dot" aria-hidden />
                <span className="rsy__body">{noticeBody(n, todayKey, me)}</span>
              </button>
              {n.kind === "announcement" && announcementAction?.(n.announcement)}
            </li>
          ))}
        </ul>
      )}
      <div className="rsy__foot">
        <button type="button" className="rsy__all" onClick={onMarkAll} disabled={newCount === 0}>
          <CheckCheck size={16} aria-hidden />
          Mark all read
        </button>
      </div>
    </section>
  );
}

/** A notice in one line, for a screen reader's label. */
function noticeLabel(n: SinceNotice): string {
  switch (n.kind) {
    case "announcement":
      return `${n.announcement.authorName ?? "Leadership"}: ${n.announcement.title}`;
    case "new-clients":
      return "New to the studio this week";
    case "out-of-service":
      return `${n.machine.source === "roster" ? "Out of service" : "Flagged"}: ${n.machine.name}`;
    case "playbook":
      return `Kept in the Playbook: ${n.entry.title}`;
    case "hearts":
      return "Hearts sent to you";
  }
}

function noticeBody(n: SinceNotice, todayKey: string, me: ReadonlySet<string>): ReactNode {
  switch (n.kind) {
    case "announcement": {
      const a = n.announcement;
      return (
        <>
          <span className="rsy__k">
            <Megaphone size={14} aria-hidden />
            <span className="rsy__who">{a.authorName ?? "Leadership"}</span>
            <span className="rsy__seal">
              <BadgeCheck size={13} aria-hidden />
              {n.role ?? "Leadership"}
            </span>
            {n.at !== null && <span className="rsy__when">{whenWords(n.at, todayKey)}</span>}
          </span>
          <span className="rsy__t">{a.title}</span>
          {a.shortContent && <span className="rsy__s">{a.shortContent}</span>}
        </>
      );
    }
    case "new-clients": {
      const caveat = newClientsCaveat(n.clients);
      return (
        <>
          <span className="rsy__k">
            <UserRoundPlus size={14} aria-hidden />
            New to the studio this week
          </span>
          {n.clients.clients.length > 0 && (
            <span className="rsy__lines">
              {n.clients.clients.map((c) => (
                <span key={c.clientId} className="rsy__line">
                  {newClientLine(c, todayKey, me)}
                </span>
              ))}
            </span>
          )}
          {n.clients.state === "known" && n.clients.clients.length === 0 && n.clients.unsure === 0 && (
            <span className="rsy__s">Nobody's first visit falls this week.</span>
          )}
          {caveat && <span className="rsy__s rsy__s--unknown">{caveat}</span>}
        </>
      );
    }
    case "out-of-service": {
      const m = n.machine;
      return (
        <>
          <span className="rsy__k">
            {m.source === "roster" ? <CircleSlash size={14} aria-hidden /> : <Flag size={14} aria-hidden />}
            {m.source === "roster" ? "Out of service" : "Flagged"} · <span className="rsy__who">{m.name}</span>
          </span>
          {m.note && <span className="rsy__t">{m.note}</span>}
          <span className="rsy__s">{machineLine(m, todayKey)}</span>
        </>
      );
    }
    case "playbook":
      return (
        <>
          <span className="rsy__k">
            <BookOpenCheck size={14} aria-hidden />
            Kept in the Playbook
            {n.at !== null && <span className="rsy__when">{whenWords(n.at, todayKey)}</span>}
          </span>
          <span className="rsy__t">{n.entry.title}</span>
          {n.entry.authorName && <span className="rsy__s">Kept by {firstName(n.entry.authorName)}.</span>}
        </>
      );
    case "hearts":
      return (
        <>
          <span className="rsy__k">
            <Heart size={14} aria-hidden />
            To you
            <span className="rsy__when">only you see this</span>
          </span>
          <span className="rsy__t">{heartsLine(n.hearts)}</span>
        </>
      );
  }
}
