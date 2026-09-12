/**
 * IN-APP NOTIFICATIONS — a bell, not an inbox in someone's email.
 *
 * Round: Settings tiers & Task Board, Sep 2026.
 *
 * WHY IN-APP ONLY
 * ---------------
 * The brief asks for "an automated alert" when a task the trainer created is
 * completed. Delivering that as email or SMS would walk straight into the Sep 4
 * decision to keep the notification worker and both reminder cron jobs
 * commented out of render.yaml: nothing in this app contacts a trainer or a
 * client yet, and no provider has been chosen.
 *
 * It is also the right call regardless of that freeze. A studio runs 30-40
 * task completions a day. Emailing a receipt for each would train the manager
 * to filter the whole channel within a week, which costs you the alerts that
 * actually matter. A bell badge that clears when it is read is the correct
 * weight for "someone did the thing you asked".
 *
 * WHY THE PATH IS PER-TRAINER
 * ---------------------------
 * trainers/{uid}/notifications, not one collection with a recipientId field.
 * Same argument as TaskScope in ../studio-tasks/types.ts: Firestore cannot
 * enforce "only your own rows" on a LIST unless every query carries a matching
 * constraint, so privacy would depend on every future query being written
 * correctly and one unconstrained read added later would leak every trainer's
 * notifications at once. A path makes the rule `request.auth.uid == trainerId`
 * and leaves nothing for a future caller to remember.
 */

import type { StoredLearningRef } from "../learning/ref";

export type NotificationKind =
  | "task-completed"
  /* A head trainer put your name on something. The one notification here that
     is about work you have NOT done yet, which is why it is not filtered by
     the volume rules in studio-tasks/notify.ts — being assigned is always
     news, and it happens a handful of times a week rather than forty. */
  | "task-assigned"
  | "request-claimed"
  | "request-replied"
  | "request-resolved"
  | "machine-flagged";

/** Where tapping the notification should land. */
export interface NotificationLink {
  /** A value from the app's View union. */
  view: string;
  /** Whatever that view needs to select — a request id, a client id. */
  id?: string;
  /**
   * A page in Learning (Learning + Planner round, Sep 2026). When present it
   * wins over `view`/`id`: it names the exact page, where `view` can only name
   * a screen. See features/learning/ref.ts.
   */
  learning?: StoredLearningRef;
}

/** trainers/{trainerId}/notifications/{notificationId} */
export interface TrainerNotification {
  id: string;
  kind: NotificationKind;

  /** One line, already written for a human. No client-side templating. */
  title: string;
  body?: string;

  studioId: string;
  link?: NotificationLink;

  /**
   * Who caused it. Stamped from request.auth.uid and validated in
   * firestore.rules, so a notification cannot be attributed to someone who
   * did not send it.
   */
  actor: { id: string; name: string };

  createdAt?: unknown;
  readAt?: unknown | null;
}
