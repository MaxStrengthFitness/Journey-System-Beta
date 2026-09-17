import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { studioDayKeyOf } from "../../../lib/studio-time";
import { notificationsRef } from "../../notifications/mutations";
import { personalInstancesRef, personalTemplatesRef } from "../../studio-tasks/mutations";
import { addDays } from "../../studio-tasks/recurrence";
import { clockLabel } from "../../studio-tasks/task-wizard";
import type { TaskInstance, TaskTemplate } from "../../studio-tasks/types";
import { dueReminders, nextRing, reminderBody, type DueReminder } from "./reminders";

/**
 * A trainer's own task list, live — templates only. One listener on their
 * private path; used by the reminder watcher and the calendar's strip.
 */
export function usePersonalTemplates(uid: string | null | undefined): { templates: TaskTemplate[]; ready: boolean } {
  const [state, setState] = useState<{ templates: TaskTemplate[]; ready: boolean }>({ templates: [], ready: false });
  useEffect(() => {
    if (!uid) {
      setState({ templates: [], ready: true });
      return;
    }
    return onSnapshot(
      personalTemplatesRef(uid),
      (snap) =>
        setState({
          templates: snap.docs.map((d) => ({ ...(d.data() as object), id: d.id, scope: "personal", ownerId: uid }) as TaskTemplate),
          ready: true,
        }),
      (err) => {
        console.warn("[reminders] templates read failed:", err);
        setState({ templates: [], ready: true });
      },
    );
  }, [uid]);
  return state;
}

/** Reminders already rung on this device, per signed-in person. */
const rungHere = new Map<string, Set<string>>();

/**
 * THE REMINDER WATCHER — rings a trainer's own bell when one of their
 * reminders comes due. Mounted once, app-wide, while someone is signed in.
 *
 * Round: Planner rework, Sep 2026. See ./reminders.ts for the rules and the
 * stated limit (it rings while the app is open somewhere).
 *
 * Reads: the private task list (one listener) and yesterday-to-tomorrow's
 * private instances (one listener, `localDate in [...]` — a single-field
 * filter, no index to deploy), so a task already ticked stays quiet.
 *
 * Writes: one notification per reminder per day, at a deterministic id and
 * only when that document does not exist yet, so two iPads signed in as the
 * same trainer ring it once. The notifications rule allows it: the actor is
 * the signed-in person and the document is created unread.
 */
export function useReminderBell(
  uid: string | null | undefined,
  me: { name: string } | null,
  onRing?: (r: DueReminder) => void,
): void {
  const { templates, ready } = usePersonalTemplates(uid);
  const [instances, setInstances] = useState<Record<string, TaskInstance>>({});
  const [tick, setTick] = useState(0);
  const todayKey = studioDayKeyOf(new Date()) ?? "";
  const onRingRef = useRef(onRing);
  onRingRef.current = onRing;

  const hasAny = useMemo(() => templates.some((t) => typeof t.remindMinutesBefore === "number"), [templates]);

  useEffect(() => {
    if (!uid || !todayKey || !hasAny) {
      setInstances({});
      return;
    }
    return onSnapshot(
      query(personalInstancesRef(uid), where("localDate", "in", [addDays(todayKey, -1), todayKey, addDays(todayKey, 1)])),
      (snap) => {
        const map: Record<string, TaskInstance> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { ...(d.data() as Omit<TaskInstance, "id">), id: d.id };
        });
        setInstances(map);
      },
      (err) => console.warn("[reminders] instances read failed:", err),
    );
  }, [uid, todayKey, hasAny]);

  // Wake at the next ring (capped at a minute, so a sleeping iPad that wakes
  // late catches up quickly), and whenever the app comes back to the front.
  useEffect(() => {
    if (!hasAny) return;
    const next = nextRing(templates, new Date());
    const wait = next ? Math.min(60_000, Math.max(1_000, next.getTime() - Date.now() + 500)) : 60_000;
    const t = setTimeout(() => setTick((n) => n + 1), wait);
    const onVisible = () => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [templates, hasAny, tick]);

  useEffect(() => {
    if (!uid || !ready || !hasAny) return;
    let rung = rungHere.get(uid);
    if (!rung) {
      rung = new Set();
      rungHere.set(uid, rung);
    }
    const due = dueReminders({ templates, instances, now: new Date(), rung });
    for (const r of due) {
      rung.add(r.id);
      void ring(uid, me?.name ?? "You", r, todayKey).then((rang) => {
        if (rang) onRingRef.current?.(r);
      });
    }
  }, [uid, ready, hasAny, templates, instances, tick, me?.name, todayKey]);
}

async function ring(uid: string, name: string, r: DueReminder, todayKey: string): Promise<boolean> {
  try {
    const ref = doc(notificationsRef(uid), r.id);
    const existing = await getDoc(ref);
    if (existing.exists()) return false;
    await setDoc(ref, {
      kind: "reminder",
      title: `Reminder: ${r.template.title}`.slice(0, 200),
      body: reminderBody(r, todayKey, clockLabel).slice(0, 500),
      studioId: r.template.studioId ?? "",
      link: { view: "studio-tasks", id: "mine" },
      actor: { id: uid, name },
      createdAt: serverTimestamp(),
      readAt: null,
    });
    return true;
  } catch (err) {
    // Best-effort, like every notification: a failed ring must never break
    // the screen the trainer is on.
    console.warn("[reminders] could not ring:", err);
    return false;
  }
}
