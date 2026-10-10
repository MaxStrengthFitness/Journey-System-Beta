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
 * Sep 20 2026 for scripts/purge-database.ts. That script went too, on Oct 10
 * 2026: it deleted clients, studios, networks and more on production behind
 * one flag. Clearing test data is scripts/reset-test-data.ts.
 *
 * "Restore standard machines" left on Sep 28 2026 (wave 2 of the Machine
 * Catalog room). AJ: "we dont need to restore standard machine button, a
 * machine just needs to be able to be marked as a standard machine, a task
 * only by admins". It wrote the generated file (data/machine-definitions.ts)
 * over the live catalog documents, merging, so it also undid every
 * correction an administrator had made in the catalog editor since. The
 * catalog is changed in the catalog editor now, and a machine is marked as
 * a standard machine on its own page there ("Standard machine"). The
 * generated file stays the seed and fallback it is everywhere else; nothing
 * writes it into the catalog any more.
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
} from "lucide-react";
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
      // The Functions SDK loads here, on the press, never with the app (R13).
      const { getApp } = await import("firebase/app");
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const call = httpsCallable(getFunctions(getApp(), "us-central1"), "backfillTrainerRollups");
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
        subtitle="Two tools that act on the whole app. Both are safe to run again."
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
        </AdminRows>
      </AdminPanel>

      {/*
        The "Wipe and re-initialize" hazard panel stood here until Sep 20 2026
        (Claude Experiment, phase A). It deleted every client, trainer,
        session, schedule, note and log from the browser, against production,
        behind one typed phrase. The reasoning is in AppContent.tsx where the
        handler was. Its first replacement, scripts/purge-database.ts, was
        removed on Oct 10 2026 (one flag stood between it and deleting
        production); clearing test data is scripts/reset-test-data.ts.

        The tools above are all recoverable, which is why the divider and the
        hazard styling left with the panel.
      */}
    </AdminScreen>
  );
}
