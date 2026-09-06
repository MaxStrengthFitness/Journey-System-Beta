/**
 * Mindbody, one screen.
 *
 * Round: Admin Overhaul, Round 2 Phase 2 (Sections 10-12).
 *
 * Replaces two tabs. "Mindbody" was a fixture mockup - Downtown Studio,
 * trainer Marina, a shift roster of invented appointments, approve buttons
 * wired to console.log - and "Integrations" held the real controls. The spec
 * asked for the hub to go and the rest to become a diagnostic dashboard.
 * Limbo stays where it is, as its own screen, because it is a work queue
 * rather than a diagnosis.
 *
 * THE ORDER OF THE SCREEN IS THE ORDER OF THE QUESTIONS
 * ----------------------------------------------------
 * Something is wrong with Mindbody. In order:
 *
 *   1. Is the service up?           the health panel, one sentence
 *   2. Which studio is affected?    the audit, problems sorted to the top
 *   3. What is this studio doing?   sync state and the manual controls
 *   4. What did it actually say?    the event log
 *
 * The old screens led with API parameters and the webhook URL, which is what
 * you need on the day you set it up and never again.
 *
 * TWO BUTTONS THAT LIED
 * ---------------------
 * "Test Connect" ran a one-second setTimeout and then reported success or
 * failure from the CACHED health document. It made no request. A person
 * pressing it after changing a Site ID got a confident answer about the old
 * one. It is gone; "Check now" below does the request the mockup's buried
 * control actually did - POST /api/mindbody/locations with this studio's Site
 * ID - and reports what came back.
 *
 * The event log invented an entry reading "System initialized. Waiting for
 * MindBody webhook events..." whenever the collection was empty, which is a
 * fabricated log line in a panel whose entire purpose is to be trustworthy.
 * An empty log now says it is empty.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Copy,
  RefreshCw,
  Terminal,
  Webhook,
  Zap,
} from "lucide-react";
import { db } from "../../../firebase";
import type { Client, Studio, Trainer } from "../../../types";
import { useToast } from "../../../contexts/ToastContext";
import { useMindbodyHealth } from "../../../contexts/MindbodyHealthContext";
import { syncMindbodySchedules } from "../../../lib/mindbody-api-sync";
import firebaseConfig from "../../../../firebase-applet-config.json";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminGrid,
  AdminHeader,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminReadOnly,
  AdminScreen,
  AdminSelect,
  AdminStatTile,
  AdminTiles,
} from "../primitives";
import {
  auditStudios,
  formatAge,
  normaliseLog,
  orderLogs,
  summariseEstate,
  summariseHealth,
  type LogLine,
  type StudioDiagnosis,
} from "./diagnostics";

interface Props {
  studios: Studio[];
  trainers: Trainer[];
  clients: Client[];
  activeStudioId: string | null;
}

const LINK_TONE = {
  linked: "ok",
  offline: "neutral",
  misconfigured: "alert",
} as const;

const SYNC_TONE = {
  current: "ok",
  lagging: "warn",
  stalled: "alert",
  manual: "neutral",
  "n/a": "neutral",
} as const;

const SYNC_WORD = {
  current: "Up to date",
  lagging: "Behind",
  stalled: "Stalled",
  manual: "Manual",
  "n/a": "—",
} as const;

const INTERVALS = [5, 15, 30, 60, 120, 240];

export function AdminMindbodyTab({
  studios,
  trainers,
  clients,
  activeStudioId,
}: Props) {
  const { success: toastSuccess, error: toastError } = useToast();
  const health = useMindbodyHealth();

  /**
   * One clock for the whole screen, ticking every 30 seconds. Every age on
   * this page therefore agrees with every other one; deriving each from its
   * own Date.now() lets "last sync 5 minutes ago" sit next to "last event 4
   * minutes ago" for the same instant.
   */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const [selectedId, setSelectedId] = useState<string | null>(activeStudioId);
  const selected = studios.find((s) => s.id === (selectedId ?? activeStudioId));

  const rows = useMemo(
    () => auditStudios(studios, trainers, now),
    [studios, trainers, now],
  );
  const estate = useMemo(() => summariseEstate(rows), [rows]);
  const service = useMemo(() => summariseHealth(health, now), [health, now]);
  const selectedRow = rows.find((r) => r.studioId === selected?.id) ?? null;

  /* ---------------- live connection check ---------------- */

  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const checkConnection = async () => {
    if (!selected?.mindbodySiteId) {
      setCheckResult({
        ok: false,
        text: `${selected?.name ?? "This studio"} has no Mindbody Site ID, so there is nothing to check.`,
      });
      return;
    }
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch("/api/mindbody/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: String(selected.mindbodySiteId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mindbody did not answer.");
      const count = (data.locations || []).length;
      setCheckResult({
        ok: true,
        text: `Site ${selected.mindbodySiteId} answered with ${count} location${count === 1 ? "" : "s"}.`,
      });
    } catch (e: unknown) {
      setCheckResult({
        ok: false,
        text: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setChecking(false);
    }
  };

  /* ---------------- webhook ---------------- */

  const webhookUrl = `https://us-central1-${firebaseConfig.projectId}.cloudfunctions.net/mindbodyWebhook`;
  const [testingWebhook, setTestingWebhook] = useState(false);

  const testWebhook = async () => {
    if (!selected?.mindbodySiteId) {
      toastError("Set a Mindbody Site ID on this studio first.");
      return;
    }
    setTestingWebhook(true);
    try {
      const res = await fetch("/api/mindbody/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId: selected.mindbodySiteId }),
      });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();
      if (data.success) {
        toastSuccess("Test event sent. It should appear in the log below.");
      } else {
        toastError(`The webhook returned ${data.statusCode}.`);
      }
    } catch (e: unknown) {
      toastError(
        `Could not fire a test event: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setTestingWebhook(false);
    }
  };

  /* ---------------- sync settings and manual pull ---------------- */

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const futureStr = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(() => futureStr(30));
  const [syncing, setSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<{
    added: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const patchStudio = async (patch: Partial<Studio>) => {
    if (!selected?.id) return;
    try {
      await updateDoc(doc(db, "studios", selected.id), patch);
    } catch (e: unknown) {
      toastError(
        `Could not save: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  };

  const runSync = async () => {
    if (!selected?.mindbodySiteId) {
      toastError("Set a Mindbody Site ID on this studio first.");
      return;
    }
    setSyncing(true);
    setSyncStats(null);
    try {
      const result = await syncMindbodySchedules(
        selected.mindbodySiteId,
        trainers,
        clients,
        studios,
        null,
        startDate,
        endDate,
        selected.id,
        selected.mindbodyLocationId,
      );
      setSyncStats(result);
      if (result.errors.length > 0) {
        toastError(explainSyncError(result.errors[0], selected.mindbodySiteId));
      } else {
        toastSuccess(
          `Done. ${result.added} added, ${result.updated} updated, ${result.skipped} unchanged.`,
        );
      }
    } catch (e: unknown) {
      toastError(
        explainSyncError(
          e instanceof Error ? e.message : String(e),
          selected.mindbodySiteId,
        ),
      );
    } finally {
      setSyncing(false);
    }
  };

  /* ---------------- event log ---------------- */

  const [logs, setLogs] = useState<LogLine[]>([]);
  useEffect(() => {
    const id = selected?.id;
    if (!id) {
      setLogs([]);
      return;
    }
    const unsub = onSnapshot(
      query(
        collection(db, "mindbodyEventLog"),
        where("studioId", "==", id),
        orderBy("processedAt", "desc"),
        limit(25),
      ),
      (snap) => {
        setLogs(
          orderLogs(
            snap.docs.map((d, i) => normaliseLog({ id: d.id, ...d.data() }, i)),
          ),
        );
      },
      (err) => {
        console.error("Failed to stream Mindbody event log:", err);
        setLogs([]);
      },
    );
    return () => unsub();
  }, [selected?.id]);

  /* ---------------- render ---------------- */

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Zap className="w-5 h-5" />}
        title="Mindbody"
        subtitle="Whether it is working, which studio is affected, and what it actually said."
        actions={
          <AdminButton onClick={checkConnection} busy={checking}>
            <RefreshCw className="w-3.5 h-3.5" />
            Check now
          </AdminButton>
        }
      />

      {/* 1. Is the service up? */}
      <AdminNotice
        tone={
          service.status === "healthy"
            ? "ok"
            : service.status === "offline"
              ? "info"
              : service.status === "error"
                ? "alert"
                : "warn"
        }
      >
        {service.status === "healthy" ? (
          <CheckCircle2 className="w-4 h-4 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 shrink-0" />
        )}
        <div>
          <div>{service.headline}</div>
          {service.faults.length > 1 && (
            <ul className="adm-problems">
              {service.faults.slice(1).map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
        </div>
      </AdminNotice>

      {checkResult && (
        <AdminNotice tone={checkResult.ok ? "ok" : "alert"}>
          {checkResult.text}
        </AdminNotice>
      )}

      <AdminTiles>
        <AdminStatTile label="Studios linked" value={estate.linked} />
        <AdminStatTile
          label="Missing a Site ID"
          value={estate.misconfigured}
          tone={estate.misconfigured > 0 ? "alert" : undefined}
          foot="Not marked offline, so this is unintended"
        />
        <AdminStatTile
          label="Sync stalled"
          value={estate.stalled}
          tone={estate.stalled > 0 ? "alert" : undefined}
        />
        <AdminStatTile
          label="Deliberately offline"
          value={estate.offline}
          foot="Working as configured"
        />
        <AdminStatTile
          label="Parked events"
          value={health.dlqDepth}
          tone={health.dlqDepth > 0 ? "attention" : undefined}
          foot="Failed processing, awaiting a retry"
        />
      </AdminTiles>

      {/* 2. Which studio is affected? */}
      <AdminPanel
        title="Studios"
        subtitle={
          estate.needsAttention.length === 0
            ? "Nothing needs attention."
            : `${estate.needsAttention.length} of ${estate.total} need attention, listed first.`
        }
        flush
      >
        {rows.length === 0 ? (
          <AdminEmpty title="No studios yet">
            Create one on the Studios screen.
          </AdminEmpty>
        ) : (
          <ul className="adm-mb-list">
            {rows.map((r) => (
              <StudioLine
                key={r.studioId}
                row={r}
                selected={r.studioId === selected?.id}
                onSelect={() => setSelectedId(r.studioId)}
              />
            ))}
          </ul>
        )}
      </AdminPanel>

      {/* 3. What is this studio doing? */}
      {selected && selectedRow && (
        <AdminPanel
          title={selected.name}
          subtitle="Settings and manual controls apply to this studio only."
          icon={<Activity className="w-4 h-4" />}
        >
          <AdminGrid>
            <AdminField label="Mindbody Site ID">
              <AdminReadOnly>{selectedRow.siteId ?? "Not set"}</AdminReadOnly>
            </AdminField>
            <AdminField label="Location ID">
              <AdminReadOnly>
                {selectedRow.locationId ?? "Not set"}
              </AdminReadOnly>
            </AdminField>
            <AdminField
              label="Last sync"
              hint={
                selectedRow.consecutiveFailures > 0
                  ? `${selectedRow.consecutiveFailures} failed in a row`
                  : undefined
              }
            >
              <AdminReadOnly>
                {formatAge(selectedRow.minutesSinceSync)}
                {selectedRow.minutesSinceSync !== null ? " ago" : ""}
              </AdminReadOnly>
            </AdminField>
            <AdminField label="Staff linked to Mindbody">
              <AdminReadOnly>
                {selectedRow.linkedStaff} of {selectedRow.staffTotal}
              </AdminReadOnly>
            </AdminField>

            <AdminField
              label="Automatic sync"
              htmlFor="mb-auto"
              hint="Off means the schedule only refreshes when someone pulls it."
            >
              <AdminSelect
                id="mb-auto"
                value={selected.autoSyncEnabled === false ? "off" : "on"}
                onChange={(e) =>
                  patchStudio({ autoSyncEnabled: e.target.value === "on" })
                }
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </AdminSelect>
            </AdminField>
            <AdminField label="Every" htmlFor="mb-interval">
              <AdminSelect
                id="mb-interval"
                value={String(selectedRow.intervalMinutes)}
                disabled={selected.autoSyncEnabled === false}
                onChange={(e) =>
                  patchStudio({
                    syncIntervalMinutes: parseInt(e.target.value, 10),
                  })
                }
              >
                {INTERVALS.map((m) => (
                  <option key={m} value={m}>
                    {m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? "" : "s"}`}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>

            <AdminField label="Pull from" htmlFor="mb-from">
              <AdminInput
                id="mb-from"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </AdminField>
            <AdminField label="Pull to" htmlFor="mb-to">
              <AdminInput
                id="mb-to"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </AdminField>
          </AdminGrid>

          {selectedRow.problem && (
            <AdminNotice tone="warn">{selectedRow.problem}</AdminNotice>
          )}

          {syncStats && (
            <AdminNotice tone={syncStats.errors.length ? "warn" : "ok"}>
              {syncStats.added} added, {syncStats.updated} updated,{" "}
              {syncStats.skipped} unchanged
              {syncStats.errors.length
                ? ` — ${syncStats.errors.length} error${syncStats.errors.length === 1 ? "" : "s"}: ${syncStats.errors[0]}`
                : "."}
            </AdminNotice>
          )}

          <div className="adm-mb-actions">
            <AdminButton
              variant="primary"
              busy={syncing}
              onClick={runSync}
              disabled={!selectedRow.siteId}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Pull the schedule now
            </AdminButton>
            <AdminButton
              busy={testingWebhook}
              onClick={testWebhook}
              disabled={!selectedRow.siteId}
            >
              <Webhook className="w-3.5 h-3.5" />
              Send a test event
            </AdminButton>
            <AdminButton
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
                toastSuccess("Webhook URL copied.");
              }}
            >
              <Copy className="w-3.5 h-3.5" />
              Copy webhook URL
            </AdminButton>
          </div>
        </AdminPanel>
      )}

      {/* 4. What did it actually say? */}
      <AdminPanel
        title="Event log"
        subtitle={
          selected
            ? `The last 25 events for ${selected.name}.`
            : "Pick a studio above."
        }
        icon={<Terminal className="w-4 h-4" />}
        flush
      >
        {logs.length === 0 ? (
          <AdminEmpty title="No events recorded">
            Nothing has arrived from Mindbody for this studio. If that is a
            surprise, send a test event above and watch this panel.
          </AdminEmpty>
        ) : (
          <ul className="adm-log">
            {logs.map((l) => (
              <li key={l.id} className={`adm-log__line adm-log__line--${l.level}`}>
                <span className="adm-log__time">
                  {l.at
                    ? new Date(l.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })
                    : "—"}
                </span>
                <span className="adm-log__msg">{l.message}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
    </AdminScreen>
  );
}

/**
 * The one Mindbody error worth translating. "YOU DO NOT HAVE ACCESS TO
 * SITEID" means the developer key has not been authorised for that site in
 * the Mindbody portal - an action nobody would guess from the raw string,
 * and one that has to happen outside this app.
 */
function explainSyncError(message: string, siteId: string | number): string {
  if (message.includes("YOU DO NOT HAVE ACCESS TO SITEID")) {
    return `Mindbody has not authorised this API key for Site ID ${siteId}. Approve it in the Mindbody Developer Portal, then try again.`;
  }
  return `Sync failed: ${message}`;
}

function StudioLine({
  row,
  selected,
  onSelect,
}: {
  row: StudioDiagnosis;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`adm-mb-row${selected ? " adm-mb-row--on" : ""}`}
      >
        <span className="adm-mb-row__name">{row.name}</span>
        <span className="adm-mb-row__badges">
          <AdminBadge tone={LINK_TONE[row.link]}>
            {row.link === "linked"
              ? `Site ${row.siteId}`
              : row.link === "offline"
                ? "Offline by choice"
                : "No Site ID"}
          </AdminBadge>
          {row.link === "linked" && (
            <AdminBadge tone={SYNC_TONE[row.sync]}>
              {SYNC_WORD[row.sync]}
            </AdminBadge>
          )}
        </span>
        {row.problem && <span className="adm-mb-row__why">{row.problem}</span>}
      </button>
    </li>
  );
}
