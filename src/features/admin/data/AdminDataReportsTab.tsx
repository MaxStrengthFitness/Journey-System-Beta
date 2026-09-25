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
 * The one-file legacy importer is gone from this screen (Operations round,
 * Sep 2026 — audit item 11.5). It created clients by exact name with no home
 * studio, so an imported client was invisible to every studio-scoped screen,
 * and it never raised `priorHistory.importedCount`, so every count it fed
 * was wrong (docs/business/migration-and-prior-history.md). The real
 * migration — a whole roster at once, a dry run first — is the `scripts/`
 * importer on the roadmap, and until it exists this screen says so rather
 * than offering a button that makes a mess.
 */

import {
  Download,
  FileSpreadsheet,
  HardDriveUpload,
  Users,
} from "lucide-react";
import { Client, Studio, Trainer } from "../../../types";
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
} from "../primitives";
import { useStudioExports } from "./useStudioExports";

export interface AdminDataReportsTabProps {
  trainers: Trainer[];
  clients: Client[];
  studios: Studio[];
  activeStudioId: string | null;
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
  activeStudioId,
}: AdminDataReportsTabProps) {
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
            title="Sessions by trainer"
            description="Every completed session in the range with trainer, studio, client, date and type. The totals are on Operations → Hours; this is the sheet behind them, for anything done outside the app."
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
        title="Full historical migration"
        icon={<HardDriveUpload className="w-3.5 h-3.5" />}
        subtitle="Moving a whole studio off FileMaker in one pass."
        actions={<AdminBadge tone="hero">Coming soon</AdminBadge>}
      >
        <p className="adm-hint" style={{ margin: 0, fontSize: "13px" }}>
          What is coming: a whole roster at once, including clients carrying
          eighty or more historical sessions, with a dry run you can read
          before anything is written and a report of what matched and what did
          not. It runs from the PC as a script, not from a button here.
        </p>
        <div style={{ marginTop: 12 }}>
          <AdminNotice tone="info">
            The old one-file CSV importer that sat here is gone: it created
            clients with no home studio, so they were invisible to every studio
            screen, and it never told the client's record how many sessions it
            had imported. Until the migration exists, a client's pre-Journey
            history is <b>Sessions before Journey</b> on their profile (tap the
            line under Completed sessions), and a single past session is
            logged from the client's History tab.
          </AdminNotice>
        </div>
      </AdminPanel>
    </AdminScreen>
  );
}
