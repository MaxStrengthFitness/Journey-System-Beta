import { auth } from "../../../firebase";
import { useToast } from "../../../contexts/ToastContext";
import { clockLabel } from "../../studio-tasks/task-wizard";
import type { Trainer } from "../../../types";
import { useReminderBell } from "./useReminderBell";

/**
 * The reminder watcher, as a component that draws nothing. AppContent mounts
 * it once beside the bell (Planner rework, Sep 2026): a reminder that comes
 * due rings the bell and says so in a toast, whichever screen is open.
 */
export function PlannerReminders({ authTrainer }: { authTrainer: Trainer | null }) {
  const uid = auth.currentUser?.uid ?? null;
  const { info } = useToast();
  useReminderBell(uid, authTrainer ? { name: authTrainer.fullName ?? "You" } : null, (r) =>
    info(`Reminder — ${r.template.title} (${clockLabel(r.template.timeOfDay ?? "")})`, 8000),
  );
  return null;
}
