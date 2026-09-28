/**
 * WAITING FOR REVIEW — the place held open for the review queue.
 *
 * AJ, Sep 28 2026: "sharing with all MSF studios should submit to admins
 * first for review, we can review in admin dashboard". That queue is built
 * beside this room (features/machine-db/) and mounted here, in place of this
 * placeholder, by the one line in AdminsDashboardView that renders it.
 * Until then the page says what it is for, and where the queue that already
 * exists — machines studios offer the catalog — is decided today.
 */
import { GitPullRequest } from "lucide-react";
import { AdminHeader, AdminScreen } from "../admin/primitives";
import "./admins.css";

export function ReviewQueuePlaceholder({ onOpenMachines }: { onOpenMachines?: () => void }) {
  return (
    <AdminScreen>
      <AdminHeader
        icon={<GitPullRequest className="w-5 h-5" />}
        title="Waiting for review"
        subtitle="What studios share with every MSF studio, read by an administrator before other studios see it."
      />
      <div className="hq-held" role="status">
        <p className="hq-held__title">This queue isn&apos;t in this version of Journey yet.</p>
        <p className="hq-held__text">
          When it is, a machine or a note a studio shares with all MSF studios will wait here until an administrator
          has read it. Nothing is sent to anyone: the studio sees the outcome in the app.
        </p>
        <p className="hq-held__text">
          Machines a studio offers to the MSF catalog are decided today under The MSF standard, Machines, in
          &ldquo;Submitted by studios&rdquo;.
        </p>
        {onOpenMachines ? (
          <div>
            <button type="button" className="hq-chip" onClick={onOpenMachines}>
              Open Machines
            </button>
          </div>
        ) : null}
      </div>
    </AdminScreen>
  );
}
