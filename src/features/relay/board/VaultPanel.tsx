import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { Building2, Lock, Plus, ShieldAlert } from "lucide-react";
import { db } from "../../../firebase";
import { useToast } from "../../../contexts/ToastContext";
import { cn } from "../../../lib/utils";
import { Seg } from "../kit";
import { useRelay } from "./RelayContext";
import { VAULT_KIND_LABEL, blankVaultDraft, sortVault, vaultFields, vaultFromDoc, vaultProblem, type VaultDraft, type VaultEntry, type VaultKind } from "./vault";

/**
 * THE VAULT — leadership notes on the Team tab. Model in vault.ts.
 * Read and written only by the studio's leaders (firestore.rules).
 */
function vaultRef(studioId: string) {
  return collection(db, "studios", studioId, "vault");
}

export function useVault(studioId: string | null): { entries: VaultEntry[]; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ entries: VaultEntry[]; loading: boolean; error: string | null }>({ entries: [], loading: Boolean(studioId), error: null });
  useEffect(() => {
    if (!studioId) {
      setState({ entries: [], loading: false, error: null });
      return;
    }
    setState({ entries: [], loading: true, error: null });
    return onSnapshot(
      vaultRef(studioId),
      (snap) => setState({ entries: sortVault(snap.docs.map((d) => vaultFromDoc(d.id, d.data() as Record<string, unknown>))), loading: false, error: null }),
      (err) => {
        console.warn("[relay] vault read failed:", err);
        setState({ entries: [], loading: false, error: "The vault is for this studio's leaders." });
      },
    );
  }, [studioId]);
  return state;
}

export function VaultPanel() {
  const relay = useRelay();
  const { success: toastSuccess, error: toastError } = useToast();
  const { entries, loading, error } = useVault(relay.studioId);
  const [kind, setKind] = useState<VaultKind>("incident");
  const [draft, setDraft] = useState<VaultDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const shown = useMemo(() => entries.filter((e) => e.kind === kind), [entries, kind]);

  const save = async () => {
    if (!draft || !relay.studioId || !relay.uid) return;
    const p = vaultProblem(draft);
    setProblem(p);
    if (p) return;
    setBusy(true);
    try {
      await addDoc(vaultRef(relay.studioId), {
        ...vaultFields(draft, relay.studioId, { id: relay.uid, name: relay.authTrainer?.fullName ?? "A leader" }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setDraft(null);
      toastSuccess(draft.kind === "incident" ? "Logged in the vault." : "Partner saved.");
    } catch (err) {
      console.warn("[relay] vault write failed:", err);
      toastError("Could not save that. Only this studio's leaders can write here.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (e: VaultEntry, status: "open" | "closed") => {
    if (!relay.studioId) return;
    try {
      await updateDoc(doc(vaultRef(relay.studioId), e.id), { status, updatedAt: serverTimestamp() });
    } catch (err) {
      console.warn("[relay] vault status failed:", err);
      toastError("Could not update that.");
    }
  };

  return (
    <section className="tc vault" aria-labelledby="tc-vault">
      <header className="rl-h">
        <h3 className="rl-h__title" id="tc-vault">
          <Lock size={13} aria-hidden /> The vault
        </h3>
        <span className="rl-h__sub">leaders of this studio only · incidents and partners</span>
      </header>
      <div className="vault__bar">
        <Seg<VaultKind>
          value={kind}
          options={[
            { value: "incident", label: `Incidents${entries.filter((e) => e.kind === "incident" && e.status === "open").length ? ` · ${entries.filter((e) => e.kind === "incident" && e.status === "open").length} open` : ""}` },
            { value: "partner", label: `Partners${entries.filter((e) => e.kind === "partner").length ? ` · ${entries.filter((e) => e.kind === "partner").length}` : ""}` },
          ]}
          onChange={(k) => {
            setKind(k);
            setDraft(null);
          }}
          label="Incidents or partners"
        />
        <button type="button" className="pl__btn pl__btn--primary" onClick={() => setDraft(blankVaultDraft(kind, relay.now.todayKey))} disabled={Boolean(draft)}>
          <Plus size={14} aria-hidden /> {kind === "incident" ? "Log an incident" : "Add a partner"}
        </button>
      </div>

      {draft && (
        <div className="vault__form">
          <label className="pk-field">
            <span className="pk-label">{draft.kind === "incident" ? "What happened" : "Business or person"}</span>
            <input className="pk-input" value={draft.title} maxLength={160} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
          </label>
          {draft.kind === "incident" && (
            <label className="pk-field">
              <span className="pk-label">On</span>
              <input type="date" className="pk-input tw-day" value={draft.onDate ?? ""} onChange={(e) => setDraft({ ...draft, onDate: e.target.value || null })} />
            </label>
          )}
          <label className="pk-field">
            <span className="pk-label">{draft.kind === "incident" ? "Who was involved" : "Contact, referral code"}</span>
            <input className="pk-input" value={draft.people} maxLength={500} onChange={(e) => setDraft({ ...draft, people: e.target.value })} placeholder={draft.kind === "incident" ? "Names — staff or clients" : "Name, phone, code"} />
          </label>
          <label className="pk-field">
            <span className="pk-label">{draft.kind === "incident" ? "What happened, what was done, what follows" : "The arrangement"}</span>
            <textarea className="pk-textarea" rows={4} value={draft.body} maxLength={5000} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </label>
          {problem && <p className="pk-problem">{problem}</p>}
          <div className="pk-foot">
            <button type="button" className="pl__btn" onClick={() => setDraft(null)} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="pl__btn pl__btn--primary" onClick={() => void save()} disabled={busy}>
              {busy ? "Saving…" : "Save to the vault"}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p className="pk-empty">{error}</p>
      ) : loading ? (
        <p className="pk-empty">Opening the vault…</p>
      ) : shown.length === 0 ? (
        <p className="pk-empty">{kind === "incident" ? "No incidents logged." : "No partners yet — local businesses, referral codes, clients who run their own."}</p>
      ) : (
        <ul className="vault__list">
          {shown.map((e) => (
            <li key={e.id} className={cn("vault__item", e.status === "closed" && "vault__item--closed")}>
              <span className="vault__kind">{e.kind === "incident" ? <ShieldAlert size={13} aria-hidden /> : <Building2 size={13} aria-hidden />}</span>
              <div className="vault__main">
                <span className="vault__title">{e.title}</span>
                <span className="vault__meta">
                  {e.onDate ? `${e.onDate} · ` : ""}
                  {e.people || (e.kind === "incident" ? "nobody named" : "")}
                  {e.kind === "incident" ? ` · ${e.status === "open" ? "follow-up open" : "closed"}` : ""}
                  {e.createdBy.name ? ` · ${e.createdBy.name.split(" ")[0]}` : ""}
                </span>
                {e.body && <p className="vault__body">{e.body}</p>}
              </div>
              {e.kind === "incident" && (
                <button type="button" className="pl__btn" onClick={() => void setStatus(e, e.status === "open" ? "closed" : "open")}>
                  {e.status === "open" ? "Close" : "Reopen"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="pk-hint">{VAULT_KIND_LABEL.incident}s and {VAULT_KIND_LABEL.partner.toLowerCase()}s are read by this studio's leaders, franchise owners and administrators only — never by the floor, never on a client's record.</p>
    </section>
  );
}
