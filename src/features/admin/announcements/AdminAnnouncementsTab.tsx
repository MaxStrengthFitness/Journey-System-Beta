/**
 * Announcements, admin side.
 *
 * Round: Admin Overhaul, Round 2 Phase 1 (Section 8).
 *
 * Replaces AdminHubAnnouncements (419 lines). The form, the validation, the
 * write and the live list all moved into the shared composer, because the
 * franchise screen had its own copy of each and the two disagreed - see
 * announcements/audience.ts. What is left here is what is genuinely
 * admin-specific: an admin may address anyone, so the scope menu offers all
 * three, and the list shows every live notice rather than only this admin's.
 *
 * WHY THE LIST STREAMS RATHER THAN FETCHING ONCE
 * ----------------------------------------------
 * The old screen called getDocs in a mount effect, so taking a notice down on
 * one tablet left it looking live on every other one until someone reloaded.
 * Two managers each pressing "Take down" on the same stale row is a small
 * thing, but it is the kind of small thing that teaches people the screen
 * lies. The collection is tiny and short-lived by construction - everything
 * in it expires within a month - so a listener is cheap here in a way it
 * would not be on clients or sessions.
 */

import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { Megaphone } from "lucide-react";
import { db } from "../../../firebase";
import type {
  FranchiseNetwork,
  HubAnnouncement,
  Studio,
  Trainer,
} from "../../../types";
import { AdminHeader, AdminScreen } from "../primitives";
import { AnnouncementComposer } from "./AnnouncementComposer";
import { millis, type NetworkOption } from "./audience";

interface Props {
  authTrainer: Trainer;
  studios: Studio[];
  networks: FranchiseNetwork[];
}

export function AdminAnnouncementsTab({
  authTrainer,
  studios,
  networks,
}: Props) {
  const [all, setAll] = useState<HubAnnouncement[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, "hub_announcements")),
      (snap) => {
        setAll(
          snap.docs.map((d) => ({ ...(d.data() as HubAnnouncement), id: d.id })),
        );
      },
      (err) => console.error("Error streaming hub announcements:", err),
    );
    return () => unsub();
  }, []);

  /**
   * Expiry is applied here as well as in the reader. A lapsed notice is off
   * every trainer's bell already, so leaving it in a list headed "Live now"
   * would invite an admin to take down something that is not up.
   */
  const live = useMemo(() => {
    const now = Date.now();
    return all
      .filter((a) => a.isActive !== false)
      .filter((a) => {
        const expires = millis(a.expiresAt);
        return expires === 0 || expires >= now;
      })
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  }, [all]);

  const networkOptions: NetworkOption[] = useMemo(
    () =>
      networks.map((n) => ({
        id: n.id,
        name: n.name,
        studioIds: n.studioIds ?? [],
      })),
    [networks],
  );

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Megaphone className="w-5 h-5" />}
        title="Announcements"
        subtitle="Everything posted here lands in the alerts bell, for whoever it is addressed to."
      />
      <AnnouncementComposer
        author={{ id: authTrainer.id, fullName: authTrainer.fullName }}
        studios={studios}
        networks={networkOptions}
        scopes={["universal", "network", "studio"]}
        published={live}
        title="Post an announcement"
        subtitle="Pick the audience before you write. It is the part people get wrong."
      />
    </AdminScreen>
  );
}
