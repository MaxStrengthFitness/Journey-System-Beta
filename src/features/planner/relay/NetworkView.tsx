import { useEffect, useMemo, useState } from "react";
import { collection, doc, getCountFromServer, query, serverTimestamp, Timestamp, updateDoc, where } from "firebase/firestore";
import { Globe, Sparkles, Target, Trophy } from "lucide-react";
import { db } from "../../../firebase";
import { useActiveStudio } from "../../../contexts/ActiveStudioContext";
import { useToast } from "../../../contexts/ToastContext";
import { addDays } from "../../studio-tasks/recurrence";
import { createRequest } from "../../studio-tasks/requests";
import { CLIENT_ACTION_LABEL, type ClientTaskAction } from "../../studio-tasks/types";
import { dueChoices } from "../jobs/jobs";
import { useRelay } from "./RelayContext";

/**
 * NETWORK — franchise owners, founders and administrators.
 *
 * Round: Relay, Sep 2026. AJ's document: owners "send out specific goals for
 * studios and franchises to complete, fostering company-wide initiatives
 * and friendly competitions", and "direct organizational focus toward
 * specific protocol mastery series". Three things, then:
 *
 *   Focus       the quarter's mastery series and machine, on the network
 *               document (networks/{id}.relayFocus); every studio's Floor
 *               shows it as a quiet banner
 *   Initiatives one ask, fanned out as an ordinary initiative at every studio
 *               the person can reach, so each Team tab sees it as its own
 *   Studios     a ranking of STUDIOS (never people): new clients this month
 *               and loops closed this week, from count queries — one read
 *               per studio per number, nothing listened to
 */
interface StudioStat {
  id: string;
  name: string;
  newClients: number | null;
  loopsClosed: number | null;
}

function monthStart(todayKey: string): Date {
  return new Date(`${todayKey.slice(0, 7)}-01T00:00:00`);
}

function useStudioStats(studios: { id: string; name: string }[], todayKey: string): { stats: StudioStat[]; loading: boolean } {
  const [stats, setStats] = useState<StudioStat[]>([]);
  const [loading, setLoading] = useState(false);
  const key = studios.map((s) => s.id).join("|");
  useEffect(() => {
    if (!key) {
      setStats([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const since = Timestamp.fromDate(monthStart(todayKey));
    const weekAgo = addDays(todayKey, -6);
    Promise.all(
      studios.map(async (s): Promise<StudioStat> => {
        const [clients, loops] = await Promise.all([
          getCountFromServer(query(collection(db, "clients"), where("homeStudioId", "==", s.id), where("createdAt", ">=", since)))
            .then((r) => r.data().count)
            .catch(() => null),
          getCountFromServer(query(collection(db, "studios", s.id, "taskInstances"), where("status", "==", "done"), where("localDate", ">=", weekAgo)))
            .then((r) => r.data().count)
            .catch(() => null),
        ]);
        return { id: s.id, name: s.name, newClients: clients, loopsClosed: loops };
      }),
    )
      .then((list) => {
        if (!cancelled) setStats(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, todayKey]);
  return { stats, loading };
}

export interface RelayFocus {
  mastery: string;
  machine: string;
  note: string;
  setBy?: { id: string; name: string };
  setAt?: unknown;
}

export function focusOf(network: { relayFocus?: unknown } | null | undefined): RelayFocus | null {
  const raw = network?.relayFocus as Partial<RelayFocus> | undefined;
  if (!raw || (!raw.mastery && !raw.machine && !raw.note)) return null;
  return { mastery: raw.mastery ?? "", machine: raw.machine ?? "", note: raw.note ?? "", setBy: raw.setBy, setAt: raw.setAt };
}

export function NetworkView() {
  const relay = useRelay();
  const { availableStudios, network } = useActiveStudio();
  const { success: toastSuccess, error: toastError } = useToast();
  const studios = useMemo(() => availableStudios.filter((s) => s.id).map((s) => ({ id: s.id!, name: s.name })), [availableStudios]);
  const { stats, loading } = useStudioStats(studios, relay.now.todayKey);
  const focus = focusOf(network as { relayFocus?: unknown } | null);

  /* Focus */
  const [mastery, setMastery] = useState(focus?.mastery ?? "");
  const [machine, setMachine] = useState(focus?.machine ?? "");
  const [note, setNote] = useState(focus?.note ?? "");
  const [savingFocus, setSavingFocus] = useState(false);
  const focusDirty = mastery !== (focus?.mastery ?? "") || machine !== (focus?.machine ?? "") || note !== (focus?.note ?? "");
  const saveFocus = async () => {
    if (!network?.id || !relay.uid) return;
    setSavingFocus(true);
    try {
      await updateDoc(doc(db, "networks", network.id), {
        relayFocus: { mastery: mastery.trim().slice(0, 120), machine: machine.trim().slice(0, 120), note: note.trim().slice(0, 500), setBy: { id: relay.uid, name: relay.authTrainer?.fullName ?? "" }, setAt: serverTimestamp() },
      });
      toastSuccess("Focus set — every Floor shows it.");
    } catch (err) {
      console.warn("[relay] focus save failed:", err);
      toastError("Could not save the focus.");
    } finally {
      setSavingFocus(false);
    }
  };

  /* Initiatives */
  const [title, setTitle] = useState("");
  const [action, setAction] = useState<ClientTaskAction>("assessment");
  const [perTrainer, setPerTrainer] = useState(5);
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const launch = async () => {
    if (!relay.uid || !title.trim()) return;
    const author = { id: relay.uid, name: relay.authTrainer?.fullName ?? "The network" };
    setPosting(true);
    let ok = 0;
    for (const s of studios) {
      try {
        await createRequest({ studioId: s.id, author, kind: "initiative", title: title.trim(), detail: `A network initiative for every studio.`, target: { action, perTrainer: perTrainer || undefined, dueOn: dueOn ?? undefined }, priority: "normal", expiry: "none" });
        ok += 1;
      } catch (err) {
        console.warn(`[relay] initiative at ${s.id} failed:`, err);
      }
    }
    setPosting(false);
    if (ok === studios.length) {
      toastSuccess(`Launched at ${ok} ${ok === 1 ? "studio" : "studios"}.`);
      setTitle("");
    } else toastError(`Posted at ${ok} of ${studios.length} studios — check the rest.`);
  };

  const ranked = (k: "newClients" | "loopsClosed") => [...stats].sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1));

  return (
    <div className="st">
      <div className="st__scroll touch-pane pl__scroll">
        <div className="pl__panel-head">
          <div className="pl__panel-titles">
            <h2 className="pl__h2">The network</h2>
            <p className="pl__sub">
              {studios.length} {studios.length === 1 ? "studio" : "studios"}
              {network?.name ? ` · ${network.name}` : ""}. Studios are ranked here; people never are.
            </p>
          </div>
        </div>

        <section className="tc" aria-labelledby="nw-focus">
          <header className="rl-h">
            <h3 className="rl-h__title" id="nw-focus">
              <Sparkles size={13} aria-hidden /> Focus this quarter
            </h3>
            <span className="rl-h__sub">shown on every studio's Floor</span>
          </header>
          {!network?.id ? (
            <p className="pk-empty">This studio isn't in a network yet, so there is nowhere to keep a shared focus.</p>
          ) : (
            <div className="vault__form">
              <div className="pk-row">
                <label className="pk-field">
                  <span className="pk-label">Mastery series</span>
                  <input className="pk-input" value={mastery} maxLength={120} placeholder="Hip hinge" onChange={(e) => setMastery(e.target.value)} />
                </label>
                <label className="pk-field">
                  <span className="pk-label">Machine to try</span>
                  <input className="pk-input" value={machine} maxLength={120} placeholder="Leg Curl" onChange={(e) => setMachine(e.target.value)} />
                </label>
              </div>
              <label className="pk-field">
                <span className="pk-label">A line for the floor</span>
                <input className="pk-input" value={note} maxLength={500} placeholder="Five clients on the leg curl by October." onChange={(e) => setNote(e.target.value)} />
              </label>
              <div className="pl__panel-actions">
                <button type="button" className="pl__btn pl__btn--primary" disabled={!focusDirty || savingFocus} onClick={() => void saveFocus()}>
                  {savingFocus ? "Saving…" : "Set the focus"}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="tc" aria-labelledby="nw-init">
          <header className="rl-h">
            <h3 className="rl-h__title" id="nw-init">
              <Target size={13} aria-hidden /> Launch an initiative
            </h3>
            <span className="rl-h__sub">one ask, posted at every studio</span>
          </header>
          <div className="vault__form">
            <label className="pk-field">
              <span className="pk-label">What</span>
              <input className="pk-input" value={title} maxLength={200} placeholder="50 InBody scans per studio" onChange={(e) => setTitle(e.target.value)} />
            </label>
            <div className="pk-field">
              <span className="pk-label">Which flow</span>
              <div className="pk-chips">
                {(["assessment", "progress-report", "inbody", "custom"] as ClientTaskAction[]).map((a) => (
                  <button key={a} type="button" className="pk-chip" aria-pressed={action === a} onClick={() => setAction(a)}>
                    {CLIENT_ACTION_LABEL[a]}
                  </button>
                ))}
              </div>
            </div>
            <div className="pk-row">
              <div className="pk-field">
                <span className="pk-label">Each trainer</span>
                <div className="pk-chips">
                  {[0, 3, 5, 8, 10].map((n) => (
                    <button key={n} type="button" className="pk-chip" aria-pressed={perTrainer === n} onClick={() => setPerTrainer(n)}>
                      {n === 0 ? "No number" : n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pk-field">
                <span className="pk-label">By when</span>
                <div className="pk-chips">
                  <button type="button" className="pk-chip" aria-pressed={dueOn === null} onClick={() => setDueOn(null)}>
                    No date
                  </button>
                  {dueChoices(relay.now.todayKey).map((c) => (
                    <button key={c.label} type="button" className="pk-chip" aria-pressed={dueOn === c.dateKey} onClick={() => setDueOn(c.dateKey)}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="pl__panel-actions">
              <button type="button" className="pl__btn pl__btn--primary" disabled={posting || !title.trim() || studios.length === 0} onClick={() => void launch()}>
                {posting ? "Launching…" : `Launch at ${studios.length} ${studios.length === 1 ? "studio" : "studios"}`}
              </button>
            </div>
          </div>
        </section>

        <section className="tc" aria-labelledby="nw-board">
          <header className="rl-h">
            <h3 className="rl-h__title" id="nw-board">
              <Trophy size={13} aria-hidden /> Studios
            </h3>
            <span className="rl-h__sub">{loading ? "counting…" : "new in Journey this month · loops closed this week"}</span>
          </header>
          {stats.length === 0 ? (
            <p className="pk-empty">{loading ? "Counting…" : "No studios to compare."}</p>
          ) : (
            <div className="nw__boards">
              <ol className="nw__board" aria-label="New clients this month">
                <li className="nw__board-title">New this month</li>
                {ranked("newClients").map((s, i) => (
                  <li key={s.id} className="nw__row">
                    <span className="nw__rank">{i + 1}</span>
                    <span className="nw__name">{s.name}</span>
                    <span className="nw__n">{s.newClients ?? "—"}</span>
                  </li>
                ))}
              </ol>
              <ol className="nw__board" aria-label="Loops closed this week">
                <li className="nw__board-title">Loops closed, 7 days</li>
                {ranked("loopsClosed").map((s, i) => (
                  <li key={s.id} className="nw__row">
                    <span className="nw__rank">{i + 1}</span>
                    <span className="nw__name">{s.name}</span>
                    <span className="nw__n">{s.loopsClosed ?? "—"}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <p className="pk-hint">
            <Globe size={11} aria-hidden /> A dash means the count couldn't be read — the loops number needs the taskInstances index (status, localDate) to have finished building.
          </p>
        </section>
      </div>
    </div>
  );
}
