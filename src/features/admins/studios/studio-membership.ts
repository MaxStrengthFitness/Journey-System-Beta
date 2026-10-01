/**
 * WHICH STUDIOS A PERSON WORKS AT — giving someone a second studio, and
 * taking them off a studio's team, from the Admins dashboard.
 * PURE: no React, no Firestore (StudiosDialog.tsx writes).
 *
 * The gap (Oct 1 2026, the scale re-read): a trainer can work at more than
 * their home studio — `accessibleStudioIds` ("also works at", a floater) and
 * `activeGuestStudioIds` (a guest) on trainers/{id}, which
 * src/lib/who-works-here.ts and the rules' trainerWorksAt both read — but no
 * screen could set either list once the account existed, and nothing took a
 * person off a studio's team. docs/rounds/2026-10-01-second-studio.md.
 *
 * The one picture this file keeps: the studios a person works at besides
 * home, each either "also works here" or "a guest here". From that:
 *
 *   ADD a studio      it goes into `accessibleStudioIds` ("also works at").
 *   REMOVE a studio   it comes out of `accessibleStudioIds`, out of
 *                     `activeGuestStudioIds`, and out of `managedStudioIds`
 *                     (the grant: helping run a studio you no longer work at
 *                     would leave the door open behind you). That is "Take off
 *                     this studio's team", and the same thing as removing it
 *                     from the list.
 *
 * Never touched: the home studio (`primaryHomeStudioId`, and its own entry in
 * `accessibleStudioIds`, which approval writes there), `ownedStudioIds` (an
 * owner runs the business without being on the floor's team), the role, the
 * trainer record itself and everything they did — sessions, notes, weeks
 * stay where they are. The home studio can't be taken away here: a person
 * always has one. They are given another first, on Operations → Setup →
 * People & access, and then the old one can be taken off.
 *
 * Demo Mode is never offered (the realm rule, features/demo-mode/access.ts).
 */
import { isDemoStudioId } from "../../demo-mode/is-demo";
import type { ActivityInput } from "../activity/activity";

/** The trainer document as this file reads it. */
export interface MemberLike {
  id?: string;
  fullName?: string | null;
  primaryHomeStudioId?: string | null;
  accessibleStudioIds?: readonly string[] | null;
  activeGuestStudioIds?: readonly string[] | null;
  managedStudioIds?: readonly string[] | null;
}

export interface StudioLike {
  id?: string;
  name?: string | null;
  isDemo?: boolean;
}

export type MembershipKind = "also" | "guest";

export interface Membership {
  studioId: string;
  kind: MembershipKind;
}

const clean = (list: readonly string[] | null | undefined): string[] => [...new Set((list ?? []).filter((s) => typeof s === "string" && s.trim()))];

/** The studios they work at besides home, "also works here" before "a guest here" when both. In the stored order. */
export function memberships(t: MemberLike): Membership[] {
  const home = t.primaryHomeStudioId ?? "";
  const out: Membership[] = [];
  const seen = new Set<string>([home]);
  for (const id of clean(t.accessibleStudioIds)) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ studioId: id, kind: "also" });
  }
  for (const id of clean(t.activeGuestStudioIds)) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ studioId: id, kind: "guest" });
  }
  return out;
}

function isDemo(s: StudioLike): boolean {
  return s.isDemo === true || isDemoStudioId(s.id);
}

/** The studios the picker may offer: every real studio, less home and those already on the list, by name. */
export function addableStudios<S extends StudioLike>(t: MemberLike, studios: readonly S[], current: readonly string[]): S[] {
  const taken = new Set<string>([t.primaryHomeStudioId ?? "", ...current]);
  return studios
    .filter((s) => s.id && !taken.has(s.id) && !isDemo(s))
    .slice()
    .sort((a, b) => (a.name || a.id || "").localeCompare(b.name || b.id || ""));
}

/** Why a studio can't be taken off: it is their home. Null when it can. */
export function whyNotRemovable(t: MemberLike, studioId: string): "home" | null {
  return studioId && studioId === t.primaryHomeStudioId ? "home" : null;
}

export type ListField = "accessibleStudioIds" | "activeGuestStudioIds" | "managedStudioIds";

/** One list that changes: what goes in, what comes out, and the whole list after. */
export interface FieldChange {
  field: ListField;
  add: string[];
  remove: string[];
  next: string[];
}

export interface MembershipPlan {
  added: string[];
  removed: string[];
  /** Only the lists that change — nothing else is written (the admin README: only the diff). */
  changes: FieldChange[];
}

/**
 * What saving would write: `next` is the studios besides home the person
 * should work at. The home studio is never added or removed here, even if a
 * caller passes it. A list that comes out the same is not in `changes`.
 */
export function membershipPlan(t: MemberLike, next: readonly string[]): MembershipPlan {
  const home = t.primaryHomeStudioId ?? "";
  const before = memberships(t).map((m) => m.studioId);
  const wanted = clean(next).filter((id) => id !== home);
  const added = wanted.filter((id) => !before.includes(id));
  const removed = before.filter((id) => !wanted.includes(id));

  const changes: FieldChange[] = [];
  const change = (field: ListField, current: string[], add: string[], remove: string[]) => {
    const realAdd = add.filter((id) => !current.includes(id));
    const realRemove = remove.filter((id) => current.includes(id));
    if (realAdd.length === 0 && realRemove.length === 0) return;
    const after = [...current.filter((id) => !realRemove.includes(id)), ...realAdd];
    changes.push({ field, add: realAdd, remove: realRemove, next: after });
  };
  change("accessibleStudioIds", clean(t.accessibleStudioIds), added, removed);
  change("activeGuestStudioIds", clean(t.activeGuestStudioIds), [], removed);
  change("managedStudioIds", clean(t.managedStudioIds), [], removed);
  return { added, removed, changes };
}

/** Take one studio off: the plan, or null when it is their home (or not on their list). */
export function takeOffPlan(t: MemberLike, studioId: string): MembershipPlan | null {
  if (whyNotRemovable(t, studioId)) return null;
  const current = memberships(t).map((m) => m.studioId);
  if (!current.includes(studioId)) return null;
  return membershipPlan(
    t,
    current.filter((id) => id !== studioId),
  );
}

const nameOf = (studios: readonly StudioLike[], id: string) => studios.find((s) => s.id === id)?.name || id;

/** "Solon, Westlake", the list a person reads in the record; "home studio only" when empty. */
function listWords(t: MemberLike, ids: readonly string[], studios: readonly StudioLike[]): string {
  return ids.length ? ids.map((id) => nameOf(studios, id)).join(", ") : "home studio only";
}

/**
 * The Activity entries for a save: one per studio added or taken off, at
 * THAT studio, so its own leaders read it in their Activity. An
 * `assisted-change` every time — it is a person's place at a studio, not an
 * admin grant.
 */
export function membershipRecords(input: {
  person: MemberLike;
  plan: MembershipPlan;
  studios: readonly StudioLike[];
  byName: string;
}): ActivityInput[] {
  const { person, plan, studios, byName } = input;
  const who = (person.fullName ?? "").trim() || "someone";
  const before = memberships(person).map((m) => m.studioId);
  const after = [...before.filter((id) => !plan.removed.includes(id)), ...plan.added];
  const values = {
    before: { "Also works at": listWords(person, before, studios) },
    after: { "Also works at": listWords(person, after, studios) },
  };
  return [
    ...plan.added.map((id) => ({
      kind: "assisted-change" as const,
      what: `Added ${who} to ${nameOf(studios, id)}'s team: also works there.`,
      studioId: id,
      ...values,
      byName,
    })),
    ...plan.removed.map((id) => ({
      kind: "assisted-change" as const,
      what: `Took ${who} off ${nameOf(studios, id)}'s team.`,
      studioId: id,
      ...values,
      byName,
    })),
  ];
}

/** What will happen, in sentences, before it is saved (the confirmation rules: say what happens). */
export function membershipConsequences(input: { person: MemberLike; plan: MembershipPlan; studios: readonly StudioLike[] }): string[] {
  const { person, plan, studios } = input;
  const who = (person.fullName ?? "").trim() || "They";
  const out: string[] = [];
  if (plan.added.length) {
    out.push(`${who} joins the team at ${plan.added.map((id) => nameOf(studios, id)).join(" and ")}: they can choose it on the studio picker and are listed on its Team.`);
  }
  if (plan.removed.length) {
    const names = plan.removed.map((id) => nameOf(studios, id)).join(" and ");
    const grant = plan.changes.find((c) => c.field === "managedStudioIds");
    out.push(
      `${who} comes off the team at ${names}${grant ? ", and no longer helps run it" : ""}. Nothing they did there is deleted: their sessions, notes and history stay.`,
    );
  }
  if (out.length) {
    out.push("It reaches their iPad the next time they sign in or Journey reloads.");
    out.push("It's recorded in each studio's Activity, with your name.");
  }
  return out;
}

/** Said in place of the button when this studio is their home. */
export function homeStudioLine(person: MemberLike, studios: readonly StudioLike[]): string {
  const who = (person.fullName ?? "").trim() || "This person";
  const home = person.primaryHomeStudioId ? nameOf(studios, person.primaryHomeStudioId) : "this studio";
  return `${home} is ${who}'s home studio, so it can't be taken away here: everyone has one. Give them another home studio first on Operations → Setup → People & access, then take ${home} off here.`;
}
