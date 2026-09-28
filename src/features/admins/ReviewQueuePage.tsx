/**
 * STANDARD → WAITING FOR REVIEW — what studios offer to every MSF studio,
 * read by an administrator first.
 *
 * AJ, Sep 28 2026: sharing with all MSF studios "should submit to admins
 * first for review, we can review in admin dashboard". The queue itself is
 * features/machine-db/ShareReviewPanel (a studio's note on a machine, a
 * playbook tip, or a machine the studio made), mounted here in the place this
 * room held open for it. Machines a studio offers to the MSF CATALOG — to
 * become the standard itself — are a different question, decided under
 * Machines in "Submitted by studios"; the page points there.
 */
import { GitPullRequest } from "lucide-react";
import type { Studio, Trainer } from "../../types";
import { AdminHeader, AdminScreen } from "../admin/primitives";
import { ShareReviewPanel } from "../machine-db/ShareReviewPanel";
import "./admins.css";

export function ReviewQueuePage({
  studios,
  trainers,
  onOpenMachines,
}: {
  studios: Pick<Studio, "id" | "name">[];
  trainers: Trainer[];
  onOpenMachines?: () => void;
}) {
  return (
    <AdminScreen>
      <AdminHeader
        icon={<GitPullRequest className="w-5 h-5" />}
        title="Waiting for review"
        subtitle="What studios share with every MSF studio, read by an administrator before other studios see it."
      />
      <ShareReviewPanel studios={studios} trainers={trainers} title="Offered to every studio" />
      <div className="hq-held" role="note">
        <p className="hq-held__text">
          Machines a studio offers to the MSF catalog, to become the standard itself, are decided under The MSF
          standard, Machines, in &ldquo;Submitted by studios&rdquo;.
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
