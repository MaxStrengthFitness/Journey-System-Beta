import type { HubAnnouncement, Trainer } from "../../types";
import { maySeeReadCount, readCountOf, readCountSentence } from "../admin/announcements/read-count";
import { useAnnouncementAcks } from "./useHubAnnouncements";

/**
 * "9 of 12 have read it" under a notice that asks (the Atlas answers, Oct 2
 * 2026). Drawn only for the poster, the studio's leaders, franchise owners
 * and administrators (admin/announcements/read-count.ts); for anyone else it
 * renders nothing and opens no read. One listener on the notice's own acks
 * record while it is on screen. Nobody is pinged.
 */
export function NoticeReadCount({
  announcement,
  trainers,
  viewer,
  uid,
  className,
}: {
  announcement: HubAnnouncement;
  trainers: readonly Trainer[];
  viewer: Trainer | null | undefined;
  uid: string | null | undefined;
  className?: string;
}) {
  const allowed = maySeeReadCount(viewer, uid, announcement);
  const acks = useAnnouncementAcks(announcement.id, allowed);
  if (!allowed || acks.status === "loading") return null;
  return (
    <span className={className} data-testid="notice-read-count">
      {readCountSentence(readCountOf(announcement, trainers, acks.status === "ready" ? acks.ids : null))}
    </span>
  );
}
