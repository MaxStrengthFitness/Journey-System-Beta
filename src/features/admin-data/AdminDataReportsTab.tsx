/**
 * ADMIN — EXPORTS.
 *
 * Data out and data in, on one screen, because an admin looking for one is
 * looking near the other. Rebuilt on the admin kit in the Sep 2026 overhaul,
 * and two things changed beyond the styling.
 *
 * The per-client PROGRESS export is gone. A progress report is a coaching
 * document about one person; generating eighty of them from a date picker is
 * how a client's report ends up written by somebody who has never met them.
 * It now starts from the client's own profile, where the coach who knows them
 * is standing. (It was also the most expensive control here — an unbounded
 * exerciseLogs range query across the whole studio.)
 *
 * The legacy importer stays, because it works and studios need it, but it is
 * described honestly: it handles one file at a time while the client schema
 * migration is pending, and the full migration — the one that moves a client
 * with eighty-plus historical sessions — is not this. That gets its own
 * placeholder rather than being quietly implied by the button that exists.
 */

import React, { useRef } from "react";
import {
  Database,
  Download,
  FileSpreadsheet,
  HardDriveUpload,
  Users,
} from "lucide-react";
import { Client, Machine, Studio, Trainer } from "../../types";
import {
  AdminBadge,
  AdminButton,
  AdminField,
  AdminGrid,
  AdminHeader,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminScreen,
} from "../admin/primitives";
import { useStudioExports } from "./useStudioExports";
import { useLegacyImport } from "./useLegacyImport";

export interface AdminDataReportsTabProps {
  trainers: Trainer[];
  clients: Client[];
  studios: Studio[];
  machines: Machine[];
  activeStudioId: string | null;
  authTrainer: Trainer | null;
}

function ExportCard({
  icon: Icon,
  title,
  description,
  onDownload,
  busy,
}: {
  icon: typeof Download;
  title: string;
  description: string;
  onDownload: () => void;
  busy: boolean;
}) {
  return (
    <div className="adm-tile" style={{ gap: 8 }}>
      <span className="adm-tile__label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon className="w-3.5 h-3.5" />
        {title}
      </span>
      <p className="adm-hint" style={{ flex: 1, margin: 0 }}>
        {description}
      </p>
      <AdminButton variant="primary" busy={busy} onClick={onDownload}>
        <Download className="w-3.5 h-3.5" />
        {busy ? "Building" : "Download CSV"}
      </AdminButton>
    </div>
  );
}

export function AdminDataReportsTab({
  trainers,
  clients,
  studios,
  machines,
  activeStudioId,
  authTrainer,
}: AdminDataReportsTabProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  const {
    exportStartDate,
    setExportStartDate,
    exportEndDate,
    setExportEndDate,
    isExportingPayroll,
    isExportingAttendance,
    handleExportPayroll,
    handleExportAttendance,
  } = useStudioExports({ trainers, clients, studios, activeStudioId });

  const { isLegacyImporting, legacyStats, legacyError, handleLegacyFileUpload } =
    useLegacyImport({ machines, activeStudioId, authTrainer });

  const studioName =
    studios.find((s) => s.id === activeStudioId)?.name ?? "all studios";

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Download className="w-5 h-5" />}
        title="Exports"
        subtitle={`Business reporting for ${studioName}. Anything about one client starts from that client's profile.`}
      />

      <AdminPanel
        title="Date range"
        subtitle="Applies to both exports below."
      >
        <AdminGrid>
          <AdminField label="Start date">
            <AdminInput
              type="date"
              value={exportStartDate}
              onChange={(e) => setExportStartDate(e.target.value)}
            />
          </AdminField>
          <AdminField label="End date">
            <AdminInput
              type="date"
              value={exportEndDate}
              onChange={(e) => setExportEndDate(e.target.value)}
            />
          </AdminField>
        </AdminGrid>

        <div className="adm-tiles" style={{ marginTop: 14 }}>
          <ExportCard
            icon={FileSpreadsheet}
            title="Trainer & payroll"
            description="Every completed session in the range with trainer, studio, client, date and type — the sheet payroll is actually built from."
            onDownload={handleExportPayroll}
            busy={isExportingPayroll}
          />
          <ExportCard
            icon={Users}
            title="Client attendance"
            description="Historical check-ins, completed sessions and no-shows, one row per session."
            onDownload={handleExportAttendance}
            busy={isExportingAttendance}
          />
        </div>

        <div style={{ marginTop: 14 }}>
          <AdminNotice tone="info">
            Progress reports are no longer generated from here. Open the client
            and start one from their profile — the report is a coaching document
            about that person, and the coach who knows them should be the one
            writing it.
          </AdminNotice>
        </div>
      </AdminPanel>

      <AdminPanel
        title="Legacy import"
        icon={<Database className="w-3.5 h-3.5" />}
        subtitle="Historical FileMaker client logs, one file at a time."
        actions={<AdminBadge tone="warn">Limited</AdminBadge>}
      >
        <AdminNotice tone="warn">
          This writes clients, sessions and exercise logs straight into{" "}
          <b>{studioName}</b>. The client schema migration is still pending, so
          import one file and check the result before running another.
        </AdminNotice>

        <input
          ref={fileInput}
          type="file"
          accept=".csv"
          onChange={handleLegacyFileUpload}
          disabled={isLegacyImporting}
          className="hidden"
        />
        <div style={{ marginTop: 12 }}>
          <AdminButton
            variant="quiet"
            busy={isLegacyImporting}
            onClick={() => fileInput.current?.click()}
          >
            <Database className="w-3.5 h-3.5" />
            {isLegacyImporting ? "Processing" : "Choose a CSV"}
          </AdminButton>
        </div>

        {legacyStats && (
          <div className="adm-tiles" style={{ marginTop: 14 }}>
            {[
              ["Clients", legacyStats.clients],
              ["Sessions", legacyStats.sessions],
              ["Logs", legacyStats.logs],
              ["Failed", legacyStats.failed],
            ].map(([label, n]) => (
              <div key={String(label)} className="adm-tile">
                <span className="adm-tile__label">{label}</span>
                <span
                  className={
                    label === "Failed" && Number(n) > 0
                      ? "adm-tile__value adm-tile__value--alert"
                      : "adm-tile__value"
                  }
                >
                  {n}
                </span>
              </div>
            ))}
          </div>
        )}

        {legacyError && (
          <div style={{ marginTop: 12 }}>
            <AdminNotice tone="alert">{legacyError}</AdminNotice>
          </div>
        )}
      </AdminPanel>

      <AdminPanel
        title="Full historical migration"
        icon={<HardDriveUpload className="w-3.5 h-3.5" />}
        subtitle="Moving a whole studio off FileMaker in one pass."
        actions={<AdminBadge tone="hero">Coming soon</AdminBadge>}
      >
        <p className="adm-hint" style={{ margin: 0, fontSize: "13px" }}>
          The importer above takes one file at a time and is meant for a handful
          of clients. What is coming is the other thing: a whole roster at once,
          including clients carrying eighty or more historical sessions, with a
          dry run you can read before anything is written and a report of what
          matched and what did not.
        </p>
        <div style={{ marginTop: 12 }}>
          <AdminNotice tone="info">
            It waits on the client schema migration, because a bulk import that
            writes into a schema still being changed is a bulk import you have
            to undo. Nothing here is blocked in the meantime — the one-file
            importer above works today.
          </AdminNotice>
        </div>
      </AdminPanel>
    </AdminScreen>
  );
}
