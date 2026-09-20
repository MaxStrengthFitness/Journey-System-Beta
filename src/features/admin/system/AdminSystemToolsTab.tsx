/**
 * ADMIN — SYSTEM TOOLS.
 *
 * Round: Settings tiers & Task Board, Sep 2026.
 *
 * These actions used to hang off the trainer's Hub Settings. Deleting that
 * screen would have deleted their only trigger, so they land here rather than
 * disappearing.
 *
 * Ordered least to most destructive. Every tool on this screen is now
 * recoverable: the one that was not — "Wipe and re-initialize" — left on
 * Sep 20 2026 for scripts/purge-database.ts, where a dry run is possible.
 *
 * On the admin kit as of Sep 2026. This screen was written before the kit
 * existed and used shadcn's semantic tokens — bg-card, border-border,
 * text-foreground — which is a perfectly good system, just not the one the
 * other twelve tabs ended up on. Two coherent palettes on one screen still
 * read as an inconsistency.
 */

import { useState } from "react";
import {
  Calculator,
  Database,
  ListOrdered,
  RotateCcw,
} from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../firebase";
import { useToast } from "../../../contexts/ToastContext";
import {
  AdminButton,
  AdminHeader,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminScreen,
} from "../primitives";

export interface AdminSystemToolsTabProps {
  onRestoreMachines?: () => void;
  onReorderTrainers?: () => void;
}

function ToolRow({
  icon: Icon,
  title,
  detail,
  action,
  onClick,
  danger,
}: {
  icon: typeof Database;
  title: string;
  detail: string;
  action: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <AdminRow
      className={danger ? "adm-tool adm-tool--danger" : "adm-tool"}
      leading={
        <span className="adm-tool__icon">
          <Icon className="w-4 h-4" aria-hidden />
        </span>
      }
      name={title}
      meta={detail}
      trailing={
        <AdminButton
          variant={danger ? "danger" : "quiet"}
          onClick={onClick}
          disabled={!onClick}
        >
          {action}
        </AdminButton>
      }
    />
  );
}

export function AdminSystemToolsTab({
  onRestoreMachines,
  onReorderTrainers,
}: AdminSystemToolsTabProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [rebuilding, setRebuilding] = useState(false);

  /**
   * Counts every completed session once and writes each trainer's totals.
   *
   * Needed because the write-time counter only sees sessions completed after
   * it was deployed; everything before that -- including the Claris FileMaker
   * import -- has to be counted in one pass. Authoritative and idempotent: it
   * SETS each total from a full scan rather than adding, so running it twice
   * gives the same answer.
   *
   * Reads every session document once, so it is a button rather than
   * something that happens on app load, and it belongs outside studio hours:
   * a session completed mid-scan can be counted by both the scan and the
   * trigger, which a re-run then corrects.
   */
  const handleRebuildRollups = async () => {
    setRebuilding(true);
    try {
      const call = httpsCallable(functions, "backfillTrainerRollups");
      const result: any = await call({});
      const data = result?.data || {};
      toastSuccess(
        `Counted ${data.sessionsCounted ?? 0} sessions across ${data.trainers ?? 0} trainers` +
          (data.sessionsUnresolved
            ? ` · ${data.sessionsUnresolved} could not be credited to anyone`
            : ""),
      );
    } catch (err: any) {
      toastError(err?.message || "Couldn't rebuild trainer rollups.");
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Database className="w-5 h-5" />}
        title="System tools"
        subtitle="Restore and reset. The last one cannot be undone."
      />

      <AdminPanel title="Everyday" flush>
        <AdminRows>
        <ToolRow
          icon={ListOrdered}
          title="Reorder trainers"
          detail="Sets the order trainers appear in across the roster, calendars and pickers."
          action="Reorder"
          onClick={onReorderTrainers}
        />
        <ToolRow
          icon={Calculator}
          title="Rebuild trainer rollups"
          detail="Counts every completed session and writes each trainer's totals. Run once after deploying, then only if the numbers ever look wrong — it reads every session, so keep it outside studio hours."
          action={rebuilding ? "Counting…" : "Rebuild"}
          onClick={rebuilding ? undefined : handleRebuildRollups}
        />
        <ToolRow
          icon={RotateCcw}
          title="Restore standard machines"
          detail="Re-writes the 20 standard machine definitions to factory defaults. Merges rather than replaces, so studio-specific settings survive."
          action="Restore"
          onClick={onRestoreMachines}
        />
        </AdminRows>
      </AdminPanel>

      {/*
        The "Wipe and re-initialize" hazard panel stood here until Sep 20 2026
        (Claude Experiment, phase A). It deleted every client, trainer,
        session, schedule, note and log from the browser, against production,
        behind one typed phrase. The reasoning is in AppContent.tsx where the
        handler was; the replacement is scripts/purge-database.ts, behind the
        service account, where a dry run is possible and a half-finished
        delete can be resumed.

        The three tools above are all recoverable, which is why the divider
        and the hazard styling left with the panel.
      */}
    </AdminScreen>
  );
}
