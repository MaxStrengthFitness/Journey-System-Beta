/**
 * ADMINS → THE MACHINERY → MINDBODY SYNC — every studio's pull at once,
 * worst first.
 *
 * Round: the Admins room (Sep 28 2026; AJ's default for q10). Each studio
 * keeps its own Mindbody panel on Operations → Mindbody — pull the schedule
 * now, the sync's settings, the event log. This page is the other half: the
 * whole company in one list, read from the studio documents and their sync
 * leases (sync-check.ts), plus Mindbody's own record of whether its webhook
 * is on (`system/mindbodyWebhook`, written nightly; lib/webhook-watch.ts).
 *
 * "Check again" reads those documents again. Nothing here asks Mindbody
 * anything, and nothing runs on a timer: the ages are as of the check,
 * which the page says.
 */
import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { RefreshCw } from "lucide-react";
import { db } from "../../../firebase";
import type { Studio } from "../../../types";
import { watchLine, type WebhookWatch } from "../../../lib/webhook-watch";
import { formatStudioTime } from "../../../lib/studio-time";
import { AdminButton, AdminHeader, AdminNotice, AdminScreen } from "../../admin/primitives";
import { HqRow, HqRows, HqStatus } from "../kit";
import { syncRows, syncSummary, type LeaseRead } from "./sync-check";

const WATCH_TONE = { ok: "ok", info: "info", warn: "warn", alert: "alert" } as const;

export function SyncCheck({
  studios,
  leases,
  checkedAt,
  onCheckAgain,
  onOpenStudio,
}: {
  studios: Studio[];
  leases: Record<string, LeaseRead>;
  checkedAt: number | null;
  onCheckAgain: () => void;
  onOpenStudio: (studioId: string) => void;
}) {
  const [watch, setWatch] = useState<{ state: "loading" | "ok" | "failed"; value: WebhookWatch | null }>({ state: "loading", value: null });

  // Mindbody's own record of its webhook subscription, read with each check.
  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "system", "mindbodyWebhook"))
      .then((snap) => {
        if (!cancelled) setWatch({ state: "ok", value: snap.exists() ? (snap.data() as WebhookWatch) : null });
      })
      .catch(() => {
        if (!cancelled) setWatch({ state: "failed", value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [checkedAt]);

  const now = checkedAt ?? Date.now();
  const rows = useMemo(() => syncRows(studios, leases, now), [studios, leases, now]);
  const line = watch.state === "ok" ? watchLine(watch.value, now) : null;

  return (
    <AdminScreen>
      <AdminHeader
        icon={<RefreshCw className="w-5 h-5" />}
        title="Mindbody sync"
        subtitle="Every studio's pull from Mindbody, worst first. Each studio keeps its own Mindbody panel on Operations → Mindbody, where the schedule is pulled by hand and the event log is read."
        actions={
          <AdminButton onClick={onCheckAgain}>
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Check again
          </AdminButton>
        }
      />

      <p className="hq-standing" role="status">
        {syncSummary(rows)}{" "}
        {checkedAt ? `Checked at ${formatStudioTime(checkedAt)}.` : "Checking now."}
      </p>

      {watch.state === "failed" ? (
        <AdminNotice tone="info">Couldn&apos;t read whether Mindbody&apos;s webhook is on just now.</AdminNotice>
      ) : line ? (
        <AdminNotice tone={WATCH_TONE[line.tone]}>{line.text}</AdminNotice>
      ) : null}

      <HqRows label="Every studio, worst first">
        {rows.map((r) => (
          <HqRow
            key={r.studioId}
            name={r.name}
            context={r.where ?? undefined}
            openLabel={`Open ${r.name}'s Mindbody`}
            onOpen={() => onOpenStudio(r.studioId)}
            say={
              <>
                <HqStatus tone={r.tone}>{r.word}</HqStatus>
                <span>{r.detail}</span>
              </>
            }
          />
        ))}
      </HqRows>

      <p className="hq-standing">
        A pull runs while an iPad at a studio has Journey open in the studio&apos;s hours: today and tomorrow every 30
        minutes unless the studio set its own, and the whole month once each morning. Couldn&apos;t check means the
        record couldn&apos;t be read, which is not the same as a pull failing.
      </p>
    </AdminScreen>
  );
}
