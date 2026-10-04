/**
 * THE ASK SHEET — asking the team, the pure half (Relay room, Sep 28 2026;
 * the redesign's phase 7, AJ's pick).
 *
 * Capture asked for the sentence first and the destination second, which
 * was right for a trainer's own to-do and wrong for asking the team: an ask
 * is a KIND of need, and each kind wants different facts. So asking has its
 * own sheet with six typed tiles, each asking only for what it needs, and it
 * is started from where the need is (the header's Ask, a session on the day
 * strip, a client's task, the Help a teammate door). The header's + stays
 * for your own to-dos.
 *
 *   Cover me             a session I can't take: the client, the day, and
 *                        anything to know. Kind "cover", on the board as
 *                        urgent. The session's TIME is said in the title's
 *                        words ("Cover Hamfast Gamgee at 4:00 PM") and, since
 *                        the second wave (Sep 28 2026, AJ: "all yes"), KEPT:
 *                        `coverAt`, the start in ms, beside its day
 *                        (./cover.ts). The Board sorts cover asks by it, and
 *                        the ask comes down when the session starts.
 *   A hand on the floor  now or at a time, where, and what for. Kind "help",
 *                        gone at the end of the day.
 *   Hand this off        a job to a teammate. A leader names the person (it
 *                        arrives already theirs, AJ's q5: "leadership can
 *                        just directly assign"); a trainer offers it on the
 *                        board, where anyone can take it.
 *   A question           for the team (a leader may put one person's name on
 *                        it). About a client, it opens the open-questions
 *                        trail on her record (studio-tasks/question-trail.ts).
 *   Something's broken   the machine and what's wrong: the Floor Map's flag
 *                        (the write it always made, and the leader's bell it
 *                        always rang). Whether it can still be used is said
 *                        in the flag's words; nothing new is stored.
 *   Other                anything else. Kind "other".
 *
 * Every ask is in the app only. Nothing texts, emails or pushes; the one
 * bell an ask rings is the one a hand-off always rang, for the person named.
 *
 * Pure: no React, no Firestore, no clock of its own.
 */
import type { TaskAuthor } from "../../studio-tasks/mutations";
import type { CreateRequestInput } from "../../studio-tasks/requests";
import { dayWords } from "../jobs/jobs";
import { clock12 } from "./capture";
import { coverInstant } from "./cover";

export type AskTile = "cover" | "hand" | "handoff" | "question" | "broken" | "other";

export const ASK_TILES: readonly { id: AskTile; label: string; sub: string }[] = [
  { id: "cover", label: "Cover me", sub: "a session I can't take" },
  { id: "hand", label: "A hand on the floor", sub: "now or at a time" },
  { id: "handoff", label: "Hand this off", sub: "a job to a teammate" },
  { id: "question", label: "A question", sub: "for the team, or about a client" },
  { id: "broken", label: "Something's broken", sub: "machine or kit" },
  { id: "other", label: "Other", sub: "anything else" },
];

export const ASK_TILE_LABEL: Record<AskTile, string> = Object.fromEntries(ASK_TILES.map((t) => [t.id, t.label])) as Record<AskTile, string>;

export interface AskPerson {
  id: string;
  name: string;
}

export interface AskDraft {
  tile: AskTile | null;
  /** The words: the question, what it is, what's wrong, what for, anything to know. */
  text: string;
  client: AskPerson | null;
  /** Cover: the session's day, null for today. */
  date: string | null;
  /** Cover: the session's time ("16:00"), said in the title only. A hand: when, if not now. */
  time: string | null;
  /** A hand: now, or at a time. */
  when: "now" | "at";
  machineId: string | null;
  machineName: string | null;
  /** A leader's hand-off or question to one person. */
  person: AskPerson | null;
  /** Something's broken: can it still be used? */
  usable: boolean;
  /** Cover: the session's length, from the booking. */
  estMinutes: number | null;
}

export type AskPreset = Partial<AskDraft>;

export function blankAsk(preset: AskPreset = {}): AskDraft {
  return {
    tile: null,
    text: "",
    client: null,
    date: null,
    time: null,
    when: "now",
    machineId: null,
    machineName: null,
    person: null,
    usable: true,
    estMinutes: null,
    ...preset,
  };
}

/**
 * "I need cover" on a session still to come (the day strip): Cover me with
 * the client, the session's time and its length filled in. A booking whose
 * client isn't known by id carries the name in the words instead.
 */
export function coverPresetOf(s: { clientId: string | null; clientName: string; startMin: number; endMin: number }): AskPreset {
  const hh = String(Math.floor(s.startMin / 60)).padStart(2, "0");
  const mm = String(s.startMin % 60).padStart(2, "0");
  return {
    tile: "cover",
    client: s.clientId ? { id: s.clientId, name: s.clientName } : null,
    text: s.clientId ? "" : s.clientName,
    time: `${hh}:${mm}`,
    estMinutes: s.endMin > s.startMin ? s.endMin - s.startMin : null,
  };
}

/** Anything typed or picked beyond the tile: what the leave warning protects. */
export function askDirty(d: AskDraft): boolean {
  return Boolean(d.text.trim() || d.client || d.machineId || d.person || d.time);
}

const firstLine = (text: string) => text.trim().split("\n")[0]?.trim().slice(0, 200) ?? "";
const restLines = (text: string) => text.trim().split("\n").slice(1).join("\n").trim().slice(0, 2000);
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export interface AskProblem {
  field: "text" | "machine" | "client";
  message: string;
}

/** What the ask still needs before it can go. Nothing else is required. */
export function askProblems(d: AskDraft): AskProblem[] {
  const out: AskProblem[] = [];
  switch (d.tile) {
    case "cover":
      if (!d.client && !d.text.trim()) out.push({ field: "client", message: "Pick the client, or say whose session it is." });
      break;
    case "handoff":
      if (!d.text.trim()) out.push({ field: "text", message: "Say what it is." });
      break;
    case "question":
      if (!d.text.trim()) out.push({ field: "text", message: "Ask your question first." });
      break;
    case "broken":
      if (!d.machineId) out.push({ field: "machine", message: "Pick the machine." });
      if (!d.text.trim()) out.push({ field: "text", message: "Say what's wrong." });
      break;
    case "other":
      if (!d.text.trim()) out.push({ field: "text", message: "Say what it is." });
      break;
    default:
      break;
  }
  return out;
}

/** "at 4:00 PM", "on Tuesday at 4:00 PM", "on Tuesday", or "". */
function whenWords(d: AskDraft, todayKey: string): string {
  const day = d.date && d.date !== todayKey ? ` ${dayOn(d.date, todayKey)}` : "";
  const at = d.time ? ` at ${clock12(d.time)}` : "";
  return `${day}${at}`;
}

function dayOn(date: string, todayKey: string): string {
  const w = dayWords(date, todayKey);
  return w === "tomorrow" ? "tomorrow" : `on ${w}`;
}

/** The ask's title, as the board shows it. */
export function askTitle(d: AskDraft, todayKey: string): string {
  switch (d.tile) {
    case "cover": {
      if (d.client) return `Cover ${d.client.name}${whenWords(d, todayKey)}`.slice(0, 200);
      return `Cover: ${firstLine(d.text)}${whenWords(d, todayKey)}`.slice(0, 200);
    }
    case "hand": {
      const when = d.when === "at" && d.time ? `at ${clock12(d.time)}` : "now";
      const where = d.machineName ? ` at the ${d.machineName}` : " on the floor";
      return `A hand ${when}${where}`;
    }
    case "broken":
      return d.machineName ? `${d.machineName}: ${firstLine(d.text)}`.slice(0, 200) : firstLine(d.text);
    default:
      return firstLine(d.text);
  }
}

/** The ask's detail: what the title leaves out. */
export function askDetail(d: AskDraft): string {
  switch (d.tile) {
    case "cover":
      // With a client picked, every line is the detail; without one the first line was the title.
      return d.client ? d.text.trim().slice(0, 2000) : restLines(d.text);
    case "hand":
      return d.text.trim().slice(0, 2000);
    default:
      return restLines(d.text);
  }
}

/** The words a broken machine's flag carries: what's wrong, and whether it can still be used. */
export function flagNote(d: AskDraft): string {
  const text = d.text.trim();
  return d.usable ? text : `Don't use it until it's fixed. ${text}`.trim();
}

/** Does this ask name one person (a leader's)? */
export function namesSomeone(d: AskDraft, canLead: boolean): boolean {
  return canLead && Boolean(d.person) && (d.tile === "handoff" || d.tile === "question");
}

/**
 * The ask the board keeps, for every tile but Something's broken (which is
 * the Floor Map's flag). A question about a client is posted by
 * question-trail's `postQuestion` from this same input, so the trail adds
 * its thread and nothing else changes.
 */
export function toAskRequest(
  d: AskDraft,
  ctx: { studioId: string; author: TaskAuthor; todayKey: string; canLead: boolean; tz?: string },
): CreateRequestInput {
  const title = askTitle(d, ctx.todayKey);
  const detail = askDetail(d) || undefined;
  const base = { studioId: ctx.studioId, author: ctx.author, title, detail };
  const named = namesSomeone(d, ctx.canLead) && d.person ? { forId: d.person.id, forName: d.person.name } : {};
  switch (d.tile) {
    case "cover": {
      const day = d.date ?? ctx.todayKey;
      // The session's start, kept (the second wave): the ask sorts by it and
      // comes down when the session starts. With no time, a cover for today
      // stops mattering when the studio's day ends, as before.
      const coverAt = coverInstant(day, d.time, ctx.tz);
      return {
        ...base,
        kind: "cover",
        clientId: d.client?.id,
        sessionDate: day,
        dueOn: day,
        estMinutes: d.estMinutes ?? undefined,
        priority: "urgent",
        ...(coverAt !== null ? { coverAt, expiresAtMs: coverAt } : { expiry: day === ctx.todayKey ? "today" : "none" }),
      };
    }
    case "hand":
      return { ...base, kind: "help", machineId: d.machineId ?? undefined, priority: "normal", expiry: "today" };
    case "handoff":
      return named.forId
        ? { ...base, ...named, kind: "handoff", clientId: d.client?.id, priority: "normal", expiry: "none" }
        : { ...base, kind: "todo", clientId: d.client?.id, priority: "low", expiry: "none" };
    case "question":
      return { ...base, ...named, kind: "question", clientId: d.client?.id, priority: "low", expiry: "none" };
    default:
      return { ...base, kind: "other", priority: "low", expiry: "none" };
  }
}

/** Where the ask goes, in one sentence, before it is posted. */
export function askGoesTo(d: AskDraft, ctx: { studioName: string; canLead: boolean; leaderName?: string | null }): string {
  const board = `The Board at ${ctx.studioName}, under Help a teammate`;
  switch (d.tile) {
    case "cover":
      return `${board}: anyone free can take it.`;
    case "hand":
      return `${board}, for the rest of today.`;
    case "handoff":
      return namesSomeone(d, ctx.canLead) && d.person
        ? `${firstName(d.person.name)}'s list, under Handed to you. It's theirs, with a way to say they can't, and it rings their bell once.`
        : `${board}, as an offer anyone can take.`;
    case "question": {
      const who =
        namesSomeone(d, ctx.canLead) && d.person
          ? `${firstName(d.person.name)}'s list, under Handed to you (it rings their bell once).`
          : `Everyone at ${ctx.studioName}, under Help a teammate.`;
      const trail = d.client
        ? ` It opens a thread on ${firstName(d.client.name)}'s record: the next briefing reads it out while it's open, and the answer stays there.`
        : "";
      return `${who}${trail}`;
    }
    case "broken":
      return `The Floor Map, flagged on the ${d.machineName ?? "machine"}, and ${ctx.leaderName ? `${firstName(ctx.leaderName)}'s` : "the studio leader's"} bell.`;
    case "other":
      return `${board}.`;
    default:
      return "Pick one. Each asks only for what it needs.";
  }
}

/** Does posting this ring anyone's bell? (A hand-off or a question named to a person, or a flag.) */
export function ringsABell(d: AskDraft, canLead: boolean): boolean {
  return d.tile === "broken" || namesSomeone(d, canLead);
}
