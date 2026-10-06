/**
 * This trainer's bell.
 *
 * Round: Settings tiers & Task Board, Sep 2026.
 *
 * Reads only the signed-in trainer's own subcollection, which is also the only
 * thing firestore.rules will allow.
 *
 * TWO SMALL READS, NOT THE WHOLE HISTORY (the speed round, Oct 5 2026, R16).
 * It listened to every notification the person had ever had, sorted them on
 * the iPad and showed fifty. Nothing deletes a notification, and a reminder
 * rings one a day, so that read only grew. Now:
 *
 *  - the list: the newest fifty, by the server (`createdAt` desc, limit 50);
 *  - the badge: the unread ones (`readAt == null`), newest first, at most
 *    UNREAD_READ_LIMIT. Every writer sets `readAt: null` explicitly
 *    (mutations.ts `notify`, relay/reminders/useReminderBell.ts `ring`), and
 *    the create rule refuses one that doesn't, so an equality on null finds
 *    every unread one. A badge counted from the newest fifty alone would say
 *    50 when there are 80, which is why it is its own read.
 *
 * A read that fails keeps what it had and says `failed`: never "nothing new".
 */

import { useEffect, useState } from "react";
import { limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { notificationsRef } from "./mutations";
import type { TrainerNotification } from "./types";

/** The bell's list: the newest this many. */
export const NOTIFICATIONS_SHOWN = 50;
/** The badge counts at most this many unread; past it the sheet says "100+". */
export const UNREAD_READ_LIMIT = 100;

function rows(snap: { docs: { id: string; data: () => unknown }[] }): TrainerNotification[] {
  return snap.docs.map((d) => ({ ...(d.data() as Omit<TrainerNotification, "id">), id: d.id }));
}

export function useNotifications(trainerId: string | null | undefined) {
  const [notifications, setNotifications] = useState<TrainerNotification[]>([]);
  const [unread, setUnread] = useState<TrainerNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setNotifications([]);
    setUnread([]);
    setFailed(false);
    if (!trainerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = notificationsRef(trainerId);
    const stopList = onSnapshot(
      query(ref, orderBy("createdAt", "desc"), limit(NOTIFICATIONS_SHOWN)),
      (snap) => {
        setNotifications(rows(snap));
        setLoading(false);
      },
      (err) => {
        console.error("Error loading notifications:", err);
        setFailed(true);
        setLoading(false);
      },
    );
    const stopUnread = onSnapshot(
      query(ref, where("readAt", "==", null), orderBy("createdAt", "desc"), limit(UNREAD_READ_LIMIT)),
      (snap) => setUnread(rows(snap)),
      (err) => {
        console.error("Error counting unread notifications:", err);
        setFailed(true);
      },
    );
    return () => {
      stopList();
      stopUnread();
    };
  }, [trainerId]);

  return {
    notifications,
    /** The unread ones (newest first, at most UNREAD_READ_LIMIT): Mark all read marks these. */
    unread,
    unreadCount: unread.length,
    /** True when there may be more unread than the count says. */
    unreadCapped: unread.length >= UNREAD_READ_LIMIT,
    loading,
    failed,
  };
}
