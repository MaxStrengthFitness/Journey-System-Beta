/**
 * features/comments — this studio's comments at the foot of Learning pages,
 * with @tags that ring the tagged person's bell. See ./README.md.
 */

export { CommentsPanel } from "./CommentsPanel";
export { CommentsProvider, useCommentsContext, type CommentsContextValue } from "./CommentsContext";
export { mentionablePeople, type MentionPerson } from "./comments";
