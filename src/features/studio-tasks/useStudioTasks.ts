import { useEffect, useMemo, useState } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { studioDateKey } from "../../lib/studio-time";
import { useStudioMachines } from "../../hooks/useStudioMachines";
import {
  instancesRef,
  personalInstancesRef,
  personalTemplatesRef,
  templatesRef,
} from "./mutations";
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

export interface UseStudioTasksOptions {
  /**
   * Auth uid of the signed-in trainer, for their PERSONAL list.
   * Must be the Firebase Auth uid, not the trainer document id: the two are
   * the same for trainers created through Auth but not necessarily for older
   * ones, and the uid is what trainers/{id}/task* is keyed and ruled on.
   * Null means studio tasks only.
   */
  ownerId?: string | null;
  /** Studio-local 'YYYY-MM-DD'. Defaults to today in the studio's timezone. */
  dateKey?: string;
  /** For naming client tasks. Optional — the id renders if absent. */
  clientNames?: Record<string, string>;
}

export function useStudioTasks(
  studioId: string | null,
  opts: UseStudioTasksOptions = {},
): UseStudioTasksResult {
  const { ownerId = null, dateKey, clientNames } = opts;
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

  // The trainer's own list. Separate collections, not a filtered read of the
  // shared one — see TaskScope in types.ts for why that is the whole point.
  const [personalTemplates, setPersonalTemplates] = useState<TaskTemplate[]>(
    [],
  );
  const [personalInstances, setPersonalInstances] = useState<
    Record<string, TaskInstance>
  >({});
  const [personalLoaded, setPersonalLoaded] = useState(true);

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

  useEffect(() => {
    if (!ownerId) {
      setPersonalTemplates([]);
      return;
    }
    const unsub = onSnapshot(
      personalTemplatesRef(ownerId),
      (snap) => {
        setPersonalTemplates(
          snap.docs.map(
            (d) =>
              ({
                ...d.data(),
                id: d.id,
                scope: "personal",
                ownerId,
              }) as TaskTemplate,
          ),
        );
      },
      (err) => {
        console.error("Error loading personal task templates:", err);
        setPersonalTemplates([]);
      },
    );
    return () => unsub();
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId || !day) {
      setPersonalInstances({});
      setPersonalLoaded(true);
      return;
    }
    setPersonalLoaded(false);
    const unsub = onSnapshot(
      query(personalInstancesRef(ownerId), where("localDate", "==", day)),
      (snap) => {
        const map: Record<string, TaskInstance> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { ...(d.data() as Omit<TaskInstance, "id">), id: d.id };
        });
        setPersonalInstances(map);
        setPersonalLoaded(true);
      },
      (err) => {
        console.error("Error loading personal task instances:", err);
        setPersonalInstances({});
        setPersonalLoaded(true);
      },
    );
    return () => unsub();
  }, [ownerId, day]);

  /**
   * Both tiers, one list. A personal task is filtered to the studio it was
   * created at: ownership is by trainer, visibility is by location, so
   * "restock the towels" does not follow a trainer across town.
   *
   * Instance ids embed their template id and template ids are random, so the
   * two maps cannot collide.
   */
  const allTemplates = useMemo(
    () => [
      ...templates,
      ...personalTemplates.filter((t) => !t.studioId || t.studioId === studioId),
    ],
    [templates, personalTemplates, studioId],
  );

  const allInstances = useMemo(
    () => ({ ...instances, ...personalInstances }),
    [instances, personalInstances],
  );

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
    const byId = new Map(allTemplates.map((t) => [t.id, t]));

    return planDay(allTemplates, day, machineIds).map((planned) => {
      const instance = allInstances[planned.id] ?? null;
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
  }, [allTemplates, day, machineIds, allInstances, machineNames, clientNames]);

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
    templates: allTemplates,
    dateKey: day,
    loading: !templatesLoaded || !instancesLoaded || !personalLoaded,
    counts,
    machineCount: machineIds.length,
  };
}
