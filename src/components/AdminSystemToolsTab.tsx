/**
 * ADMIN — SYSTEM TOOLS.
 *
 * Round: Settings tiers & Task Board, Sep 2026.
 *
 * These four actions used to hang off the trainer's Hub Settings. Deleting
 * that screen would have deleted their only trigger, so they land here rather
 * than disappearing — which matters most for the demo seeder: the studios are
 * migrating off Claris FileMaker and the cutover needs a demo mode, so quietly
 * losing the one button that creates demo data would have been the expensive
 * kind of tidy-up.
 *
 * Ordered least to most destructive, and the wipe is separated by a divider
 * and painted as a hazard. Three of these are recoverable; one is not.
 *
 * On the admin kit as of Sep 2026. This screen was written before the kit
 * existed and used shadcn's semantic tokens — bg-card, border-border,
 * text-foreground — which is a perfectly good system, just not the one the
 * other twelve tabs ended up on. Two coherent palettes on one screen still
 * read as an inconsistency.
 */

import React, { useState } from "react";
import {
  Calculator,
  Database,
  ListOrdered,
  RotateCcw,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";
import { useToast } from "../contexts/ToastContext";
import {
  AdminButton,
  AdminHeader,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminScreen,
} from "../features/admin/primitives";

export interface AdminSystemToolsTabProps {
  onSeedDemoClient?: () => void;
  onRestoreMachines?: () => void;
  onReorderTrainers?: () => void;
  onAppCleanse?: () => void;
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
  onSeedDemoClient,
  onRestoreMachines,
  onReorderTrainers,
  onAppCleanse,
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
        subtitle="Seed, restore and reset. The last one cannot be undone."
      />

      <AdminPanel title="Everyday" flush>
        <AdminRows>
        <ToolRow
          icon={UserPlus}
          title="Seed a demo client"
          detail="Creates a demo client with sessions and logs, for training staff and for walking through the app without touching a real record."
          action="Create"
          onClick={onSeedDemoClient}
        />
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
        A separate panel rather than a divider inside the one above. The wipe
        is not the fifth item on a list of tools; it is a different kind of
        act, and the gap between the two panels is what says so before anyone
        reads the warning.
      */}
      <AdminPanel
        title="Destructive"
        subtitle="Cannot be undone, and not limited to one studio."
        icon={<TriangleAlert className="w-4 h-4" />}
        className="adm-panel--hazard"
        flush
      >
        <AdminRows>
          <ToolRow
            icon={TriangleAlert}
            title="Wipe and re-initialize"
            detail="Permanently deletes every client, trainer, session, schedule, note and log, then re-creates the standard machines."
            action="Wipe"
            onClick={onAppCleanse}
            danger
          />
        </AdminRows>
      </AdminPanel>
    </AdminScreen>
  );
}
