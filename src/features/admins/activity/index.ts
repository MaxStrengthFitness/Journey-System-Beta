/**
 * The Activity record (Sep 28 2026): who changed what from the Admins
 * dashboard, and when. Other features record their admin actions here:
 *
 *   import { logActivity } from "../admins/activity";
 *   void logActivity({ kind: "standard-edit", what: "Rewrote Leg Press's key cues.", byName: authTrainer.fullName });
 *
 * See activity.ts for what an entry is, and ../README.md.
 */
export { logActivity } from "./log-activity";
export {
  ACTIVITY_KINDS,
  KIND_WORDS,
  type ActivityEntry,
  type ActivityInput,
  type ActivityKind,
  type ActivityValue,
  type ActivityValues,
} from "./activity";
