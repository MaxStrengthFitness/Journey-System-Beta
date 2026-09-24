/**
 * Which progress report the report screen opens, and for which client.
 *
 * The bug this exists for (Sep 24 2026): AppContent kept the chosen report's
 * id in a bare `selectedReportId`, and only the report's own Back button
 * cleared it. A trainer who left a report any other way — the bottom bar,
 * another client, the bell, a Relay task — left the id behind, and the next
 * "New report", "Start Now" or Relay "Progress report" task opened that OLD
 * report under the CURRENT client's name. Saving wrote back to the old
 * document.
 *
 * Three rules, so no single one has to be remembered by every caller:
 *
 * 1. **A chosen report is pinned to the client it was chosen for.** Asked
 *    for a different client, `reportToOpen` answers "a new one".
 * 2. **Leaving the report screen forgets the choice**, however the trainer
 *    left. The ways out are every `setCurrentView` in the app; the one place
 *    that sees them all is an effect on the view.
 * 3. **Every way in says what it wants.** `openReport(id)` for a filed
 *    report, `newReport()` for everything else — never "whatever was there".
 *
 * The report editor refuses a report whose `clientId` is not the client on
 * screen as well (ClientProgressReportView), so a mistake here shows a plain
 * message rather than writing to someone else's report.
 */
import { useEffect, useState } from "react";
import type { View } from "../../types";

export interface ReportSelection {
  /** The client whose record the report was opened from. */
  clientId: string;
  reportId: string;
}

export const REPORT_VIEW: View = "progress-report";

/**
 * The filed report to open for `clientId`, or `undefined` for a new one. A
 * report chosen for another client is never the answer.
 */
export function reportToOpen(
  selection: ReportSelection | null,
  clientId: string | null,
): string | undefined {
  if (!selection || !clientId) return undefined;
  return selection.clientId === clientId ? selection.reportId : undefined;
}

/**
 * The editor's React key: a different client or a different report is a
 * different editor, so none of the last one's state (its client, its loaded
 * report, its auto-populated numbers) can carry over.
 */
export function reportEditorKey(clientId: string, reportId: string | undefined): string {
  return `${clientId}:${reportId ?? "new"}`;
}

export function useReportSelection({
  view,
  clientId,
  showReport,
}: {
  view: View;
  clientId: string | null;
  /** Takes the app to the report screen. */
  showReport: () => void;
}) {
  const [selection, setSelection] = useState<ReportSelection | null>(null);

  // Rule 2. An effect rather than a clear at each exit: there are dozens of
  // exits and only one of them is the report's own Back button.
  useEffect(() => {
    if (view !== REPORT_VIEW) setSelection(null);
  }, [view]);

  return {
    existingReportId: reportToOpen(selection, clientId),
    /** Open a filed report of the client on screen. */
    openReport(reportId: string) {
      setSelection(clientId ? { clientId, reportId } : null);
      showReport();
    },
    /** Start a new report for the client on screen. */
    newReport() {
      setSelection(null);
      showReport();
    },
  };
}
