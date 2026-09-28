/**
 * THE OPEN-QUESTIONS TRAIL — a question about one client, asked of the team
 * on Relay, kept on her record from the first line to the answer.
 *
 * Relay room, Sep 28 2026. AJ's voice review: an open question is a
 * low-urgency coaching question about ONE client, from the team ("Nancy isn't
 * feeling her seated dip where she should and I couldn't get her to activate
 * it. Can anyone help?"). It wants an answer before she is next in, and once
 * it is solved the WHOLE exchange stays in her history: who opened it, who
 * took it over, how it was solved. AJ approved one stored link field, the
 * open question on her next briefing as a Heads up while it is open, and
 * building it in this round.
 *
 *   ASKING      the asker's own iPad writes the thread's root on her record
 *               first (client-notes/thread-write.ts `openQuestionThread`:
 *               kind "question", Heads up, their Auth uid as the author),
 *               then the ask on the board with the root's id
 *               (taskRequests.threadId, the one new field).
 *   REPLYING    the reply goes on the ask as it always did, and the same
 *               words onto the thread, as an update by the person replying.
 *   TAKING IT   a claim writes "Beregond took it on." onto the thread, by
 *               Beregond; handing it back writes that too.
 *   ANSWERING   the answer is the ask's resolution as it always was, an
 *               update "Answered: …" by the person answering, and then the
 *               thread closes (resolvedAt on the root, the threads model).
 *               Closed with no answer, the thread says so and closes.
 *   OPENING IT AGAIN  an Undo reopens the ask and the thread, and says so.
 *
 * Every line carries its real author because each person's own iPad writes
 * it (the journalEntries rule pins authorId to the signed-in uid). Nothing
 * here blocks the ask: the board write happens first and its failure is the
 * caller's to say; a record write that fails afterwards returns "failed",
 * the ask keeps what was written, and the caller says the record didn't take
 * it. No rules change and no new query: the ask knows its thread, and the
 * thread needs nothing from the ask.
 *
 * What it cannot do: closing the thread on the client's Notes page (any
 * trainer may, by the threads model) leaves the ask open on Relay, because
 * finding the ask from the record would take a new query. It is closed on
 * Relay like any ask.
 */
import type { JournalAuthor } from "../../hooks/useClientJournal";
import { addThreadUpdate, closeThread, openQuestionThread, reopenThread } from "../client-notes/thread-write";
import type { TaskAuthor } from "./mutations";
import {
  addRequestReply,
  createRequest,
  reopenRequest,
  resolveRequest,
  setRequestClaim,
  type CreateRequestInput,
  type TaskRequest,
} from "./requests";

/** What happened on the client's record: no trail on this ask, written, or the record didn't take it. */
export type TrailResult = "none" | "written" | "failed";

type TrailAsk = Pick<TaskRequest, "threadId" | "clientId" | "studioId">;

/** The thread root a question hangs from, rebuilt from the ask itself (no read). */
export function questionRootOf(r: TrailAsk) {
  if (!r.threadId || !r.clientId) return null;
  return {
    id: r.threadId,
    clientId: r.clientId,
    studioId: r.studioId ?? "",
    kind: "question" as const,
    category: null,
    machineId: null,
  };
}

/** Does this ask keep a trail on a client's record? */
export function hasTrail(r: TrailAsk): boolean {
  return questionRootOf(r) !== null;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Who writes a line on the record: the signed-in person's Auth uid (the rule
 * pins authorId to it; a trainer document id differs on older accounts), with
 * the name and initials a card shows. Null without a uid: nothing is written.
 */
export function journalAuthorOf(
  uid: string | null | undefined,
  name: string | null | undefined,
  initials?: string | null,
): JournalAuthor | null {
  if (!uid) return null;
  const fullName = (name ?? "").trim() || "A trainer";
  return { id: uid, initials: (initials || initialsOf(fullName)).toUpperCase(), fullName };
}

const firstName = (who: JournalAuthor) => who.fullName.trim().split(/\s+/)[0] || who.fullName;

/** One line on the question's thread, by the person doing it. Never throws. */
export async function trailLine(r: TrailAsk, who: JournalAuthor | null, body: string): Promise<TrailResult> {
  const root = questionRootOf(r);
  if (!root) return "none";
  if (!who || !body.trim()) return "failed";
  try {
    const id = await addThreadUpdate(root, who, body);
    return id ? "written" : "failed";
  } catch (err) {
    console.warn("[relay] question trail line failed:", err);
    return "failed";
  }
}

/** The answer onto the thread, then the thread closed. Never throws. */
export async function trailAnswer(r: TrailAsk, who: JournalAuthor | null, answer?: string | null): Promise<TrailResult> {
  const root = questionRootOf(r);
  if (!root) return "none";
  if (!who) return "failed";
  const text = (answer ?? "").trim();
  try {
    await addThreadUpdate(root, who, text ? `Answered: ${text}` : `${firstName(who)} closed it without an answer.`);
    await closeThread(root.id);
    return "written";
  } catch (err) {
    console.warn("[relay] question trail answer failed:", err);
    return "failed";
  }
}

/** Take an ask, or hand it back; a question's thread says who. The claim's failure throws. */
export async function claimAskWithTrail(p: {
  studioId: string;
  request: TaskRequest;
  author: TaskAuthor | null;
  claimed: boolean;
  who: JournalAuthor | null;
}): Promise<TrailResult> {
  await setRequestClaim({ studioId: p.studioId, requestId: p.request.id, author: p.author, claimed: p.claimed });
  if (!hasTrail(p.request)) return "none";
  const name = p.who ? firstName(p.who) : "Someone";
  return trailLine(p.request, p.who, p.claimed ? `${name} took it on.` : `${name} handed it back.`);
}

/** Close an ask with its answer; a question's thread gets the answer and closes. The close's failure throws. */
export async function answerAskWithTrail(p: {
  studioId: string;
  request: TaskRequest;
  author: TaskAuthor | null;
  answer?: string | null;
  who: JournalAuthor | null;
}): Promise<TrailResult> {
  const answer = (p.answer ?? "").trim();
  await resolveRequest({ studioId: p.studioId, requestId: p.request.id, author: p.author, resolution: answer || undefined });
  return trailAnswer(p.request, p.who, answer);
}

/** Open a closed ask again (an Undo); a question's thread opens again and says who. The reopen's failure throws. */
export async function reopenAskWithTrail(p: { studioId: string; request: TaskRequest; who: JournalAuthor | null }): Promise<TrailResult> {
  await reopenRequest(p.studioId, p.request.id);
  const root = questionRootOf(p.request);
  if (!root) return "none";
  if (!p.who) return "failed";
  try {
    await reopenThread(root.id);
    await addThreadUpdate(root, p.who, `${firstName(p.who)} opened it again.`);
    return "written";
  } catch (err) {
    console.warn("[relay] question trail reopen failed:", err);
    return "failed";
  }
}

/** A reply on the ask, and the same words on a question's thread. The reply's failure throws. */
export async function replyWithTrail(p: {
  studioId: string;
  request: TaskRequest;
  author: TaskAuthor;
  who: JournalAuthor | null;
  body: string;
}): Promise<TrailResult> {
  const text = p.body.trim();
  if (!text) return "none";
  await addRequestReply({ studioId: p.studioId, requestId: p.request.id, author: p.author, body: text });
  return trailLine(p.request, p.who, text);
}

export interface PostQuestionResult {
  /** The ask on the board, once it is posted. */
  requestId: string | null;
  /** The thread on her record, once it is written: kept for a retry, so a second root is never made. */
  rootId: string | null;
  /** What didn't take: her record (nothing was posted) or the board (her record has it). */
  failed: "record" | "board" | null;
}

/**
 * Ask the team a question about one client: her record's thread first, then
 * the ask carrying its id. A retry passes the root it already has. Never
 * throws: the result says what was written.
 */
export async function postQuestion(p: {
  input: Omit<CreateRequestInput, "threadId" | "clientId" | "kind">;
  client: { id: string };
  /** The whole question, as her record keeps it (the ask's title is its first line). */
  question: string;
  who: JournalAuthor | null;
  rootId?: string | null;
}): Promise<PostQuestionResult> {
  let rootId = p.rootId ?? null;
  if (!rootId) {
    if (!p.who) return { requestId: null, rootId: null, failed: "record" };
    try {
      rootId = await openQuestionThread(p.client, p.input.studioId, p.who, p.question);
    } catch (err) {
      console.warn("[relay] question's thread failed:", err);
      return { requestId: null, rootId: null, failed: "record" };
    }
    if (!rootId) return { requestId: null, rootId: null, failed: "record" };
  }
  try {
    const requestId = await createRequest({ ...p.input, kind: "question", clientId: p.client.id, threadId: rootId });
    return { requestId, rootId, failed: null };
  } catch (err) {
    console.warn("[relay] question's ask failed:", err);
    return { requestId: null, rootId, failed: "board" };
  }
}
