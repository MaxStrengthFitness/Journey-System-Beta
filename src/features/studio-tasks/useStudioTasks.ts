import { useEffect, useMemo, useState } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { studioDateKey } from "../../lib/studio-time";
import { useStudioMachines } from "../../hooks/useStudioMachines";
import { instancesRef, templatesRef } from "./mutations";
import { planDay } from "./recurrence";
import type { TaskInstance, TaskRow, TaskTemplate } from "./types";

/**
 * One studio day's task list, ready to render.
 *
 * Round: Studio To-Do, Sep 2026.
 *
 * The day's rows are DERIVED (planDay) and joined to whatever instance
 * documents exist. A row with no document is an open task — see mutations.ts
 * for why nothing is written until someone acts.
 *
 * `dateKey` is computed with lib/studio-time, never from the device clock. A
 * trainer whose iPad is in another timezone would otherwise cross midnight at
 * the wrong moment and see the list appear to reset at random.
 */
export interface UseStudioTasksResult {
  rows: TaskRow[];
  templates: TaskTemplate[];
  dateKey: string;
  loading: boolean;
  counts: { total: number; done: number; flagged: number };
  /** Machines the day plan expanded over. 0 means machine tasks make no rows. */
  machineCount: number;
}

export function useStudioTasks(
  studioId: string | null,
  /** Studio-local 'YYYY-MM-DD'. Defaults to today in the studio's timezone. */
  dateKey?: string,
  /** For naming client tasks. Optional — the id renders if absent. */
  clientNames?: Record<string, string>,
): UseStudioTasksResult {
  const day = dateKey ?? studioDateKey(new Date()) ?? "";

  // Bridged: before the roster backfill runs studios/{id}/roster is empty, and
  // an unbridged read here makes every machine task silently produce no rows.
  const { machines } = useStudioMachines(studioId, {
    bridgeWhenRosterEmpty: true,
  });
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [instances, setInstances] = useState<Record<string, TaskInstance>>({});
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [instancesLoaded, setInstancesLoaded] = useState(false);

  useEffect(() => {
    if (!studioId) {
      setTemplates([]);
      setTemplatesLoaded(true);
      return;
    }
    setTemplatesLoaded(false);
    const unsub = onSnapshot(
      templatesRef(studioId),
      (snap) => {
        setTemplates(
          snap.docs.map(
            (d) => ({ ...d.data(), id: d.id, studioId }) as TaskTemplate,
          ),
        );
        setTemplatesLoaded(true);
      },
      (err) => {
        console.error("Error loading studio task templates:", err);
        setTemplates([]);
        setTemplatesLoaded(true);
      },
    );
    return () => unsub();
  }, [studioId]);

  useEffect(() => {
    if (!studioId || !day) {
      setInstances({});
      setInstancesLoaded(true);
      return;
    }
    setInstancesLoaded(false);
    // Equality on a single field — covered by Firestore's automatic index, so
    // this needs no composite index to deploy.
    const unsub = onSnapshot(
      query(instancesRef(studioId), where("localDate", "==", day)),
      (snap) => {
        const map: Record<string, TaskInstance> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { ...(d.data() as Omit<TaskInstance, "id">), id: d.id };
        });
        setInstances(map);
        setInstancesLoaded(true);
      },
      (err) => {
        console.error("Error loading studio task instances:", err);
        setInstances({});
        setInstancesLoaded(true);
      },
    );
    return () => unsub();
  }, [studioId, day]);

  const machineIds = useMemo(
    () => machines.map((m) => m.machineId),
    [machines],
  );
  const machineNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of machines) map[m.machineId] = m.name;
    return map;
  }, [machines]);

  const rows = useMemo<TaskRow[]>(() => {
    if (!day) return [];
    const byId = new Map(templates.map((t) => [t.id, t]));

    return planDay(templates, day, machineIds).map((planned) => {
      const instance = instances[planned.id] ?? null;
      const template = byId.get(planned.templateId) as TaskTemplate;
      const clientId =
        template?.target.kind === "client" ? template.target.clientId : undefined;

      return {
        ...planned,
        template,
        instance,
        status: instance?.status ?? "open",
        machineName: planned.machineId
          ? (machineNames[planned.machineId] ?? planned.machineId)
          : undefined,
        clientName: clientId ? clientNames?.[clientId] : undefined,
      };
    });
  }, [templates, day, machineIds, instances, machineNames, clientNames]);

  const counts = useMemo(() => {
    let done = 0;
    let flagged = 0;
    for (const r of rows) {
      if (r.status === "done" || r.status === "skipped") done += 1;
      if (r.instance?.flagged) flagged += 1;
    }
    return { total: rows.length, done, flagged };
  }, [rows]);

  return {
    rows,
    templates,
    dateKey: day,
    loading: !templatesLoaded || !instancesLoaded,
    counts,
    machineCount: machineIds.length,
  };
}
