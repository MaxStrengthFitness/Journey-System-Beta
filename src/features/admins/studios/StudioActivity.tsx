/**
 * A STUDIO'S ACTIVITY TAB — what was changed at this studio from the Admins
 * dashboard, who changed it, and when (the Activity record, Sep 28 2026).
 *
 * Read once when the tab opens, and again on Reload: the studio's entries,
 * newest first (activity where studioId == this studio; useActivity.ts). An
 * admin grant is the company's, so it is on Machinery → Activity, not here.
 */
import { useState } from "react";
import { History, RefreshCw } from "lucide-react";
import type { Studio } from "../../../types";
import { AdminButton, AdminPanel } from "../../admin/primitives";
import { ActivityList } from "../activity/ActivityList";
import { useActivity } from "../activity/useActivity";

export function StudioActivity({ studio, studios }: { studio: Studio; studios: readonly Studio[] }) {
  const [seq, setSeq] = useState(0);
  const studioId = studio.id ?? "";
  const read = useActivity(studioId ? { studioId } : null, seq);
  const name = studio.name || "this studio";

  return (
    <AdminPanel
      title="Activity"
      icon={<History className="w-3.5 h-3.5" />}
      subtitle={`What was changed at ${name} from here, by whom and when: its details and franchise, its opening, and its people's roles. Admin grants are on Machinery → Activity.`}
      actions={
        <AdminButton size="sm" onClick={() => setSeq((n) => n + 1)} busy={read.state === "loading"}>
          {read.state !== "loading" ? <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> : null}
          Reload
        </AdminButton>
      }
      flush
    >
      <ActivityList
        read={read}
        studios={studios}
        label={`Activity at ${name}`}
        empty={`Changes made at ${name} from the Admins dashboard are recorded here from Sep 28 2026 on. Nothing has been changed since.`}
        onRetry={() => setSeq((n) => n + 1)}
      />
    </AdminPanel>
  );
}
