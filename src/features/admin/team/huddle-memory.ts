/**
 * WHAT A LEADER PUT ON TODAY'S HUDDLE — module memory, forgotten at sign-out.
 *
 * The redesign's Operations room, phase 6 (Sep 28 2026). Recognise on Team →
 * This week "sends nothing: it goes to the huddle" (the blueprint). So the
 * line is kept here, per studio and studio day, for the huddle started from
 * Today to read. Nothing is written to Firestore and nobody is told: a
 * restart forgets it, a new day starts empty, and a sign-out forgets it
 * (features/sign-out), so the next person on a shared iPad never sees the
 * leader-before's huddle.
 */
import { useSyncExternalStore } from "react";
import { forgetOnSignOut } from "../../sign-out/memory";

const EMPTY: readonly string[] = [];
let lines = new Map<string, readonly string[]>();
const listeners = new Set<() => void>();

const keyOf = (studioId: string, day: string) => `${studioId}:${day}`;
const emit = () => listeners.forEach((l) => l());

forgetOnSignOut(() => {
  lines = new Map();
  emit();
});

export function huddleLines(studioId: string, day: string): readonly string[] {
  return lines.get(keyOf(studioId, day)) ?? EMPTY;
}

/** Puts the line on the day's huddle, or takes it off; true when it is now on. */
export function toggleHuddleLine(studioId: string, day: string, line: string): boolean {
  const key = keyOf(studioId, day);
  const now = lines.get(key) ?? EMPTY;
  const on = !now.includes(line);
  const next = new Map(lines);
  next.set(key, on ? [...now, line] : now.filter((l) => l !== line));
  lines = next;
  emit();
  return on;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The day's huddle lines, kept current as Team adds and removes them. */
export function useHuddleLines(studioId: string, day: string): readonly string[] {
  return useSyncExternalStore(
    subscribe,
    () => huddleLines(studioId, day),
    () => EMPTY,
  );
}

/** For tests. */
export function resetHuddleMemory(): void {
  lines = new Map();
  emit();
}
