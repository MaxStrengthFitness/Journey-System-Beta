/**
 * THE NETWORK'S TWO ACTIONS — on Operations → All my studios.
 *
 * Voice-review round, Sep 27 2026. These were My Studio → Relay → Network;
 * AJ moved the network into Operations and dropped its ranking of studios
 * (network-actions.ts says why). What a franchise owner or the company does
 * here:
 *
 *   Focus this quarter   one editor per network the reader may set, on the
 *                        house form (useDirtyForm + SaveBar): only the lines
 *                        that changed are written, a focus that arrives after
 *                        the page opened is taken up rather than wiped, and a
 *                        half-typed line asks before the page is left. Every
 *                        Floor in the network shows it (relay/board/
 *                        FocusBanner).
 *   Launch an initiative one ask at every studio in the reader's "All my
 *                        studios" (never Demo Mode's, by the realm rule in
 *                        scope.ts), after a confirmation that names each
 *                        studio. A studio the launch missed is named, and
 *                        Launch again posts there only.
 *
 * Shown to the people who saw Relay → Network: franchise owners and the
 * company (mayActForNetwork). OverviewPage mounts it under "All my studios",
 * and for such a reader who can see only one studio (no "All my studios" to
 * choose), under that studio's Overview, so nobody who had it lost it.
 */
import { useCallback, useMemo, useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Sparkles, Target } from "lucide-react";
import { db } from "../../../firebase";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";
import { useUnsavedChanges } from "../../unsaved-changes";
import { dueChoices } from "../../relay/jobs/jobs";
import { createRequest } from "../../studio-tasks/requests";
import { CLIENT_ACTION_LABEL, type ClientTaskAction } from "../../studio-tasks/types";
import {
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminGrid,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminSelect,
  ConfirmDialog,
  SaveBar,
} from "../primitives";
import { useDirtyForm } from "../useDirtyForm";
import {
  FOCUS_LIMITS,
  LAUNCH_FLOWS,
  PER_TRAINER_CHOICES,
  focusFields,
  focusWrite,
  focusableNetworks,
  launchOutcome,
  launchRequest,
  mayActForNetwork,
  studioList,
  type FocusFields,
  type LaunchDraft,
} from "./network-actions";

export interface NetworkActionsProps {
  trainer: Trainer | null | undefined;
  /** The Auth uid: the rules pin `createdBy.id` to it. */
  uid: string | null;
  /** The studios a launch posts at: the reader's "All my studios". */
  studios: Studio[];
  networks: FranchiseNetwork[];
  /** The studio's day, for "By when". */
  todayKey: string;
}

export function NetworkActions({ trainer, uid, studios, networks, todayKey }: NetworkActionsProps) {
  if (!trainer || !mayActForNetwork(trainer)) return null;
  const studioIds = studios.map((s) => s.id).filter((id): id is string => Boolean(id));
  const focusable = focusableNetworks(trainer, networks, studioIds);
  const by = { id: uid ?? trainer.authUid ?? trainer.id, name: trainer.fullName ?? "" };
  return (
    <>
      {focusable.length === 0 ? (
        <AdminPanel title="Focus this quarter" subtitle="Shown on every Floor in the network, as a quiet line." icon={<Sparkles className="w-4 h-4" />}>
          <AdminEmpty title="No network yet">None of these studios is in a network of yours, so there is nowhere to keep a shared focus.</AdminEmpty>
        </AdminPanel>
      ) : (
        focusable.map((n) => <FocusEditor key={n.id} network={n} by={by} title={focusable.length > 1 ? `Focus this quarter · ${n.name}` : "Focus this quarter"} />)
      )}
      <LaunchPanel studios={studios.filter((s) => s.id)} author={by} todayKey={todayKey} />
    </>
  );
}

function FocusEditor({ network, by, title }: { network: FranchiseNetwork; by: { id: string; name: string }; title: string }) {
  const rf = network.relayFocus;
  const external = useMemo<FocusFields>(
    () => focusFields({ relayFocus: { mastery: rf?.mastery, machine: rf?.machine, note: rf?.note } }),
    [rf?.mastery, rf?.machine, rf?.note],
  );
  const { id: byId, name: byName } = by;
  const onSave = useCallback(
    async (patch: Partial<FocusFields>) => {
      const write = focusWrite(patch, { id: byId, name: byName }, serverTimestamp());
      if (Object.keys(write).length === 0) return;
      await updateDoc(doc(db, "networks", network.id), write);
    },
    [network.id, byId, byName],
  );
  const form = useDirtyForm<FocusFields>(external, onSave, { label: `the focus for ${network.name}` });
  const idp = `nw-focus-${network.id}`;
  const setBy = rf?.setBy?.name;
  const anySet = Boolean(external.mastery || external.machine || external.note);

  return (
    <AdminPanel
      title={title}
      subtitle={`Shown on every Floor in ${network.name}, as a quiet line.`}
      icon={<Sparkles className="w-4 h-4" />}
      footer={
        <SaveBar
          status={form.status}
          error={form.error}
          onSave={() => void form.save()}
          onDiscard={form.discard}
          saveLabel="Set the focus"
          idle={anySet ? (setBy ? `Set by ${setBy}.` : "Set.") : "No focus yet: the Floors show nothing."}
        />
      }
    >
      <AdminGrid>
        <AdminField label="Mastery series" htmlFor={`${idp}-mastery`}>
          <AdminInput id={`${idp}-mastery`} value={form.value.mastery} maxLength={FOCUS_LIMITS.mastery} placeholder="Hip hinge" onChange={(e) => form.setField("mastery", e.target.value)} />
        </AdminField>
        <AdminField label="Machine to try" htmlFor={`${idp}-machine`}>
          <AdminInput id={`${idp}-machine`} value={form.value.machine} maxLength={FOCUS_LIMITS.machine} placeholder="Leg Curl" onChange={(e) => form.setField("machine", e.target.value)} />
        </AdminField>
        <AdminField label="A line for the floor" htmlFor={`${idp}-note`} wide>
          <AdminInput
            id={`${idp}-note`}
            value={form.value.note}
            maxLength={FOCUS_LIMITS.note}
            placeholder="Five clients on the leg curl by October."
            onChange={(e) => form.setField("note", e.target.value)}
          />
        </AdminField>
      </AdminGrid>
    </AdminPanel>
  );
}

const EMPTY_DRAFT: LaunchDraft = { title: "", action: "assessment", perTrainer: 5, dueOn: null };

function LaunchPanel({ studios, author, todayKey }: { studios: Studio[]; author: { id: string; name: string }; todayKey: string }) {
  const [draft, setDraft] = useState<LaunchDraft>(EMPTY_DRAFT);
  /** The studios the last launch of THIS draft missed; null means every studio is still to post at. */
  const [missed, setMissed] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [posting, setPosting] = useState(false);
  const [outcome, setOutcome] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const choices = useMemo(() => dueChoices(todayKey), [todayKey]);

  const targets = missed ? studios.filter((s) => missed.includes(s.id!)) : studios;
  const typed = draft.title.trim() !== "";
  useUnsavedChanges(typed && !posting, "the initiative you are writing");

  const edit = (patch: Partial<LaunchDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    // A changed ask is a new launch: every studio again.
    setMissed(null);
    setOutcome(null);
  };

  const launch = async () => {
    setPosting(true);
    const failed: Studio[] = [];
    for (const s of targets) {
      try {
        await createRequest(launchRequest(draft, s.id!, author));
      } catch (err) {
        console.warn(`[network] initiative at ${s.id} failed:`, err);
        failed.push(s);
      }
    }
    setPosting(false);
    setConfirming(false);
    setOutcome(launchOutcome(studios.length, failed.map((s) => s.name)));
    if (failed.length === 0) {
      setDraft(EMPTY_DRAFT);
      setMissed(null);
    } else {
      setMissed(failed.map((s) => s.id!));
    }
  };

  const names = studioList(targets.map((s) => s.name));
  const count = `${targets.length} ${targets.length === 1 ? "studio" : "studios"}`;

  return (
    <AdminPanel title="Launch an initiative" subtitle="One ask, posted at every one of your studios. Trainers log who they covered." icon={<Target className="w-4 h-4" />}>
      <div className="flex flex-col gap-3">
        <AdminGrid>
          <AdminField label="What" htmlFor="nw-launch-title" wide>
            <AdminInput id="nw-launch-title" value={draft.title} maxLength={200} placeholder="50 InBody scans per studio" onChange={(e) => edit({ title: e.target.value })} />
          </AdminField>
          <AdminField label="Which flow" htmlFor="nw-launch-flow">
            <AdminSelect id="nw-launch-flow" value={draft.action} onChange={(e) => edit({ action: e.target.value as ClientTaskAction })}>
              {LAUNCH_FLOWS.map((a) => (
                <option key={a} value={a}>
                  {CLIENT_ACTION_LABEL[a]}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label="Each trainer" htmlFor="nw-launch-count">
            <AdminSelect id="nw-launch-count" value={String(draft.perTrainer)} onChange={(e) => edit({ perTrainer: Number(e.target.value) })}>
              {PER_TRAINER_CHOICES.map((n) => (
                <option key={n} value={String(n)}>
                  {n === 0 ? "No number" : n}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
          <AdminField label="By when" htmlFor="nw-launch-due">
            <AdminSelect id="nw-launch-due" value={draft.dueOn ?? ""} onChange={(e) => edit({ dueOn: e.target.value || null })}>
              <option value="">No date</option>
              {choices.map((c) => (
                <option key={c.label} value={c.dateKey}>
                  {c.label}
                </option>
              ))}
            </AdminSelect>
          </AdminField>
        </AdminGrid>

        {studios.length === 0 ? <AdminEmpty title="No studios">There is no studio to post at from here.</AdminEmpty> : <p className="adm-hint">Posts at {names}.</p>}

        {outcome && <AdminNotice tone={outcome.tone}>{outcome.text}</AdminNotice>}

        <div className="adm-panel__actions">
          <AdminButton variant="primary" disabled={!typed || targets.length === 0 || posting} onClick={() => setConfirming(true)}>
            {missed ? `Launch again at ${count}` : `Launch at ${count}`}
          </AdminButton>
        </div>

        <ConfirmDialog
          open={confirming}
          title={`Post this at ${count}?`}
          body={`"${draft.title.trim()}" goes to ${names}, as an initiative on each studio's Floor. Nothing here takes it back once it is posted.`}
          confirmLabel="Post it"
          busy={posting}
          onConfirm={() => void launch()}
          onCancel={() => setConfirming(false)}
        />
      </div>
    </AdminPanel>
  );
}
