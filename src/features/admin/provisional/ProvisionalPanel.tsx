/**
 * Minting temporary clients and trainers for one studio.
 *
 * Lives on the Studios screen because that is where someone provisioning a
 * pre-launch floor already is, and because a temporary profile is always
 * scoped to a studio — "temporary" is a statement about one location's
 * relationship with Mindbody, not a global mode.
 */

import React, { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { CloudOff, UserPlus } from "lucide-react";
import { db } from "../../../firebase";
import type { Client, Studio, Trainer } from "../../../types";
import { useToast } from "../../../contexts/ToastContext";
import {
  OperationType,
  handleFirestoreError,
} from "../../../lib/firestore-errors";
import {
  AdminBadge,
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminGrid,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminSelect,
} from "../primitives";
import {
  isProvisional,
  mintProvisionalClient,
  mintProvisionalTrainer,
  provisionalAgeDays,
  validateMint,
} from "./provisional";
import { PROVISIONAL_REASONS } from "./types";
import { ReconcileDialog } from "./ReconcileDialog";

type Kind = "client" | "trainer";

/** Past this many days a waiting temporary profile stops being a footnote. */
const STALE_DAYS = 14;

export interface ProvisionalPanelProps {
  studio: Studio;
  clients: Client[];
  trainers: Trainer[];
  authTrainer: Trainer;
  onCreated?: () => Promise<void> | void;
  onOpenReconcile?: () => void;
}

export function ProvisionalPanel({
  studio,
  clients,
  trainers,
  authTrainer,
  onCreated,
  onOpenReconcile,
}: ProvisionalPanelProps) {
  const { success: toastSuccess } = useToast();
  const [kind, setKind] = useState<Kind>("client");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<string>(PROVISIONAL_REASONS[0]);
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState<Client | null>(null);

  const studioId = studio.id ?? "";

  const waitingClients = useMemo(
    () => clients.filter((c) => c.homeStudioId === studioId && isProvisional(c)),
    [clients, studioId],
  );
  const waitingTrainers = useMemo(
    () =>
      trainers.filter(
        (t) => t.primaryHomeStudioId === studioId && isProvisional(t),
      ),
    [trainers, studioId],
  );
  const waiting = waitingClients.length + waitingTrainers.length;

  const existing = useMemo(
    () =>
      kind === "client"
        ? clients.map((c) => ({
            id: c.id,
            firstName: c.firstName,
            lastName: c.lastName,
            homeStudioId: c.homeStudioId,
          }))
        : trainers.map((t) => {
            const [f, ...rest] = (t.fullName || "").split(" ");
            return {
              id: t.id,
              firstName: f ?? "",
              lastName: rest.join(" "),
              homeStudioId: t.primaryHomeStudioId,
            };
          }),
    [kind, clients, trainers],
  );

  const problem = validateMint({ firstName, lastName, studioId }, existing);
  const touched = !!firstName.trim() || !!lastName.trim();

  const oldest = [...waitingClients, ...waitingTrainers]
    .map((r) => provisionalAgeDays(r) ?? 0)
    .reduce((a, b) => Math.max(a, b), 0);

  const create = async () => {
    if (problem) return;
    setSaving(true);
    try {
      const input = {
        firstName,
        lastName,
        studioId,
        reason,
        email,
        author: { id: authTrainer.id, name: authTrainer.fullName },
      };
      if (kind === "client") {
        await addDoc(collection(db, "clients"), {
          ...mintProvisionalClient(input),
          createdAt: serverTimestamp(),
        });
      } else {
        // addDoc, not setDoc at a uid — this person has no Firebase account
        // yet. pendingClaim (set by mintProvisionalTrainer) is what lets them
        // claim the document at first sign-in; without it they would sign in
        // and get a profile they cannot write.
        await addDoc(collection(db, "trainers"), {
          ...mintProvisionalTrainer(input),
          createdAt: serverTimestamp(),
        });
      }
      setFirstName("");
      setLastName("");
      setEmail("");
      toastSuccess(
        kind === "client"
          ? "Temporary client created. Reconcile them once Mindbody has the record."
          : "Temporary trainer created. They claim the profile when they first sign in.",
      );
      await onCreated?.();
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        kind === "client" ? "clients" : "trainers",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPanel
      title="Temporary profiles"
      icon={<CloudOff className="w-3.5 h-3.5" />}
      subtitle="For when Mindbody is down, not connected yet, or has not caught up with a new hire. These work everywhere a real profile works, and stay marked until someone reconciles them."
      actions={
        waiting > 0 && (
          <AdminBadge tone={oldest >= STALE_DAYS ? "alert" : "warn"}>
            {waiting} waiting
          </AdminBadge>
        )
      }
    >
      {oldest >= STALE_DAYS && (
        <div className="mb-3">
          <AdminNotice tone="alert">
            The oldest temporary profile here has been waiting {oldest} days.
            They do not merge themselves — every session logged against one is
            history that has to be moved by hand later.
            {onOpenReconcile && (
              <>
                {" "}
                <button
                  type="button"
                  className="underline font-bold"
                  onClick={onOpenReconcile}
                >
                  Reconcile now
                </button>
              </>
            )}
          </AdminNotice>
        </div>
      )}

      <AdminGrid>
        <AdminField label="Creating a">
          <AdminSelect
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="client">Client</option>
            <option value="trainer">Trainer</option>
          </AdminSelect>
        </AdminField>
        <AdminField label="Why" hint="Shown on the reconcile screen later.">
          <AdminSelect value={reason} onChange={(e) => setReason(e.target.value)}>
            {PROVISIONAL_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </AdminSelect>
        </AdminField>
        <AdminField label="First name" required>
          <AdminInput
            value={firstName}
            invalid={touched && problem?.code === "no-name"}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </AdminField>
        <AdminField label="Last name" required>
          <AdminInput
            value={lastName}
            invalid={touched && problem?.code === "no-name"}
            onChange={(e) => setLastName(e.target.value)}
          />
        </AdminField>
        <AdminField
          label="Email"
          wide
          hint={
            kind === "trainer"
              ? "The address they will sign in with. Matching on it is how the profile finds them."
              : "Optional — helps match them to the Mindbody record later."
          }
        >
          <AdminInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </AdminField>
      </AdminGrid>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <AdminButton
          variant="primary"
          busy={saving}
          disabled={!!problem}
          onClick={() => void create()}
        >
          <UserPlus className="w-3.5 h-3.5" />
          Create temporary {kind}
        </AdminButton>
        {touched && problem && (
          <span className="adm-hint adm-hint--error">{problem.message}</span>
        )}
      </div>

      {waiting > 0 && (
        <div className="mt-4">
          <AdminRows>
            {[
              ...waitingClients.map((c) => ({
                id: c.id!,
                name: `${c.firstName} ${c.lastName}`.trim(),
                kind: "Client",
                record: c,
              })),
              ...waitingTrainers.map((t) => ({
                id: t.id,
                name: t.fullName,
                kind: "Trainer",
                record: t,
              })),
            ].map((row) => {
              const age = provisionalAgeDays(row.record) ?? 0;
              return (
                <AdminRow
                  key={`${row.kind}-${row.id}`}
                  name={row.name}
                  meta={
                    <>
                      {row.kind} · {row.record.provisionalReason || "No reason given"}
                      {" · "}
                      {age === 0 ? "created today" : `${age} days waiting`}
                    </>
                  }
                  trailing={
                    row.kind === "Client" ? (
                      <AdminButton
                        variant="quiet"
                        size="sm"
                        onClick={() => setReconciling(row.record as Client)}
                      >
                        Reconcile
                      </AdminButton>
                    ) : (
                      <AdminBadge tone={age >= STALE_DAYS ? "alert" : "warn"}>
                        Claims at sign-in
                      </AdminBadge>
                    )
                  }
                />
              );
            })}
          </AdminRows>
        </div>
      )}

      {reconciling && (
        <ReconcileDialog
          temp={reconciling}
          clients={clients}
          onClose={() => setReconciling(null)}
          onMerged={onCreated}
        />
      )}

      {waiting === 0 && (
        <div className="mt-4">
          <AdminEmpty title="Nothing temporary here">
            Everyone at this studio came from Mindbody.
          </AdminEmpty>
        </div>
      )}
    </AdminPanel>
  );
}
