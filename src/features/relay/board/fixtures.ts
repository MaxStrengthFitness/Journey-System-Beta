/**
 * Test fixtures for Relay's Board, Tracker and Ask sheet (Relay room, Sep 28
 * 2026). Example people are Lord of the Rings names and never the
 * Fellowship: trainers Ioreth (the signed-in trainer), Beregond, Mablung,
 * Damrod; the head trainer Imrahil; the studio leader Glorfindel.
 *
 * Only tests import this file.
 */
import type { ScheduleEntry, Trainer } from "../../../types";
import type { TaskRequest } from "../../studio-tasks/requests";
import type { TaskRow, TaskTemplate } from "../../studio-tasks/types";
import type { TeamJob } from "../jobs/types";

export const TODAY = "2026-09-28";

export const IORETH = { id: "t-ioreth", name: "Ioreth Healer" };
export const BEREGOND = { id: "t-beregond", name: "Beregond Guard" };
export const MABLUNG = { id: "t-mablung", name: "Mablung Ranger" };
export const IMRAHIL = { id: "t-imrahil", name: "Imrahil Prince" };
export const GLORFINDEL = { id: "t-glorfindel", name: "Glorfindel Elf" };

export function trainerDoc(p: { id: string; name: string }, role = "LifeTransformer", extra: Partial<Trainer> = {}): Trainer {
  return { id: p.id, fullName: p.name, role, primaryHomeStudioId: "s1", accessibleStudioIds: ["s1"], ...extra } as Trainer;
}

export function template(id: string, extra: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    id,
    studioId: "s1",
    scope: "studio",
    title: id,
    kind: "machine",
    category: "cleaning",
    target: { kind: "machine", machineIds: "all" },
    recurrence: { type: "daily", shifts: ["any"] },
    active: true,
    ...extra,
  };
}

export function row(t: TaskTemplate, machineId: string | undefined, status: "open" | "done" = "open", extra: Partial<TaskRow> = {}): TaskRow {
  return {
    id: `${t.id}__${TODAY}__any${machineId ? `__${machineId}` : ""}`,
    templateId: t.id,
    localDate: TODAY,
    shift: "any",
    machineId,
    title: t.title,
    category: t.category,
    kind: t.kind,
    template: t,
    instance: status === "done" ? ({ status: "done" } as never) : null,
    status,
    ...extra,
  };
}

export function ask(id: string, extra: Partial<TaskRequest> = {}): TaskRequest {
  return {
    id,
    studioId: "s1",
    kind: "todo",
    title: id,
    createdBy: MABLUNG,
    status: "open",
    replyCount: 0,
    priority: "low",
    ...extra,
  } as TaskRequest;
}

export function job(id: string, extra: Partial<TeamJob> = {}): TeamJob {
  return {
    id,
    studioId: "s1",
    title: id,
    detail: "",
    category: "ops",
    about: { kind: "facility" },
    assignees: [],
    assigneeIds: [],
    openToAll: true,
    parts: {},
    dueOn: null,
    requiresNote: false,
    notifyOnDone: false,
    status: "open",
    closingNote: null,
    completedBy: null,
    createdBy: GLORFINDEL,
    ...extra,
  } as TeamJob;
}

/** A booking at the studio today, in the studio's (Eastern) time. */
export function booking(id: string, trainer: { id: string; name: string }, clientName: string, hhmm: string, minutes = 30): ScheduleEntry {
  const [h, m] = hhmm.split(":").map(Number);
  const start = new Date(`${TODAY}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-04:00`);
  const end = new Date(start.getTime() + minutes * 60_000);
  return {
    id,
    trainerId: trainer.id,
    trainerName: trainer.name,
    clientName,
    clientId: `c-${id}`,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    status: "Scheduled",
    studioId: "s1",
  } as unknown as ScheduleEntry;
}
