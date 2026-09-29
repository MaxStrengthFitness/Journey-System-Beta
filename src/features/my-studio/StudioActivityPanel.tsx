/**
 * MY STUDIO → STUDIO → ACTIVITY — what was changed at this studio from the
 * Admins dashboard, for the people who run it. Read-only.
 *
 * The Admins room's third wave (Sep 29 2026). The second wave's Activity
 * record (`activity/{id}`, features/admins/activity) is signed by the
 * administrator who made the change, and its rules let a studio's leaders
 * read their own studio's entries — an assisted change to the details, a
 * role changed on the team, the studio's stage. Until now they had no
 * screen for it. This panel is that screen: the newest fifty, newest first,
 * one bounded listener (useStudioActivityLive), the same quiet rows the
 * Admins dashboard draws (ActivityList: no marks, no colour, AJ's q8).
 *
 * Shown only to the studio tier (leadsHere, the rules' own answer), because
 * the rules refuse everyone else's read and a refused read would draw
 * "couldn't read" for a trainer to whom the record was never open. Nothing
 * here writes: logActivity() in the Admins room is the one writer.
 */
import { History } from "lucide-react";
import { AdminPanel } from "../admin/primitives";
import { ActivityList } from "../admins/activity/ActivityList";
import { useStudioActivityLive } from "../admins/activity/useStudioActivityLive";
import { useState } from "react";
import "../admin/admin.css";

export function StudioActivityPanel({ studioId, studioName }: { studioId: string; studioName: string }) {
  const [seq, setSeq] = useState(0);
  const read = useStudioActivityLive(studioId, seq);
  return (
    <AdminPanel
      title="Activity"
      icon={<History className="w-3.5 h-3.5" />}
      subtitle={`What head office changed at ${studioName} from the Admins dashboard, newest first, signed by whoever made the change. Nothing here is edited: it is a record to read.`}
      flush
    >
      <ActivityList
        read={read}
        studios={[]}
        label={`${studioName}'s Activity record`}
        empty={`Changes made at ${studioName} from the Admins dashboard are recorded here from Sep 28 2026 on. None yet.`}
        onRetry={() => setSeq((n) => n + 1)}
      />
    </AdminPanel>
  );
}
