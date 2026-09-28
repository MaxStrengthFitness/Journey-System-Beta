import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Ellipsis,
  Forward,
  HandHelping,
  Lock,
  MessageCircleQuestion,
  Send,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActiveStudio } from "../../../contexts/ActiveStudioContext";
import { useToast } from "../../../contexts/ToastContext";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { notify } from "../../notifications/mutations";
import { studioRoster } from "../../studio-tasks/initiatives";
import type { TaskAuthor } from "../../studio-tasks/mutations";
import { createRequest } from "../../studio-tasks/requests";
import { addDays } from "../../studio-tasks/recurrence";
import { journalAuthorOf, postQuestion } from "../../studio-tasks/question-trail";
import { useUnsavedChanges } from "../../unsaved-changes";
import { ClientPicker } from "../ClientPicker";
import { PeoplePicker, Seg } from "../kit";
import { useRelay } from "./RelayContext";
import { flagMachine } from "./machine-care-store";
import {
  ASK_TILES,
  ASK_TILE_LABEL,
  askDirty,
  askGoesTo,
  askProblems,
  blankAsk,
  flagNote,
  namesSomeone,
  ringsABell,
  toAskRequest,
  type AskDraft,
  type AskPreset,
  type AskProblem,
  type AskTile,
} from "./ask";
import "../kit.css";
import "./ask.css";

/**
 * THE ASK SHEET — "Ask the team", six typed tiles (Relay room, Sep 28 2026;
 * the redesign's phase 7). The rules and every sentence are ./ask.ts; this is
 * the surface. It opens from the header's Ask, from a session on the day
 * strip ("I need cover"), from a client's task ("Ask about this client") and
 * from the tiles behind Help a teammate, each with its tile, client, day or
 * time already filled in.
 *
 * Typing is protected: while anything is typed or picked the sheet is on the
 * leave warning's list, and closing it asks first. A failed post says so and
 * keeps everything; a question whose thread reached her record but whose ask
 * didn't reach the board keeps that thread for the retry, so her record
 * never gets it twice.
 */

const TILE_ICON: Record<AskTile, LucideIcon> = {
  cover: CalendarClock,
  hand: HandHelping,
  handoff: Forward,
  question: MessageCircleQuestion,
  broken: Wrench,
  other: Ellipsis,
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function AskSheet({
  open,
  preset,
  onOpenChange,
}: {
  open: boolean;
  preset: AskPreset | null;
  onOpenChange: (open: boolean) => void;
}) {
  const relay = useRelay();
  const { activeStudio } = useActiveStudio();
  const { success: toastSuccess } = useToast();
  const [draft, setDraft] = useState<AskDraft>(() => blankAsk(preset ?? {}));
  const [problems, setProblems] = useState<AskProblem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** A question's thread already on her record (a retry after the board failed). */
  const [rootId, setRootId] = useState<string | null>(null);
  /** A leader's question for one person rather than the team. */
  const [forOne, setForOne] = useState(false);

  // A fresh ask each time the sheet opens, seeded by whoever opened it.
  useEffect(() => {
    if (!open) return;
    setDraft(blankAsk(preset ?? {}));
    setProblems([]);
    setError(null);
    setRootId(null);
    setForOne(Boolean(preset?.person));
  }, [open, preset]);

  const leave = useUnsavedChanges(open && askDirty(draft), "your ask", {
    onDiscard: () => setDraft(blankAsk()),
  });
  const close = () => leave.guard(() => onOpenChange(false));

  const todayKey = relay.now.todayKey;
  const wantsMachines = open && (draft.tile === "hand" || draft.tile === "broken");
  const { machines } = useStudioMachines(wantsMachines ? relay.studioId : null, { bridgeWhenRosterEmpty: true });
  const people = useMemo(
    () => studioRoster(relay.trainers, relay.studioId).filter((p) => p.id !== relay.uid && p.id !== relay.authTrainer?.id),
    [relay.trainers, relay.studioId, relay.uid, relay.authTrainer?.id],
  );
  const leaderId = activeStudio?.headTrainerId ?? null;
  const leaderName = leaderId ? (relay.trainers.find((t) => t.id === leaderId)?.fullName ?? null) : null;

  const edit = (patch: Partial<AskDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const problemFor = (f: AskProblem["field"]) => problems.find((p) => p.field === f)?.message;
  const pick = (tile: AskTile) => {
    setProblems([]);
    setError(null);
    edit({ tile });
  };

  const submit = async () => {
    if (!draft.tile) return;
    const issues = askProblems(draft);
    setProblems(issues);
    if (issues.length) return;
    if (draft.tile === "question" && forOne && !draft.person) {
      setError("Pick who the question is for, or send it to the team.");
      return;
    }
    const uid = relay.uid;
    const studioId = relay.studioId;
    if (!uid || !studioId) {
      setError("Sign in and pick a studio first.");
      return;
    }
    const name = relay.authTrainer?.fullName ?? "A trainer";
    // The Auth uid: the rules pin a notification's actor and a note's author to it.
    const author: TaskAuthor = { id: uid, name };
    setBusy(true);
    setError(null);
    try {
      if (draft.tile === "broken") {
        const machineName = draft.machineName ?? "machine";
        await flagMachine({ studioId, machineId: draft.machineId!, machineName, note: flagNote(draft), author, leaderId });
        toastSuccess(`Flagged the ${machineName}. It shows on the Floor Map, and leaders see it under Open loops.`);
      } else {
        const input = toAskRequest(draft, { studioId, author, todayKey, canLead: relay.canLead });
        if (draft.tile === "question" && draft.client) {
          const { kind: _kind, clientId: _clientId, ...rest } = input;
          void _kind;
          void _clientId;
          const out = await postQuestion({
            input: rest,
            client: draft.client,
            question: draft.text,
            who: journalAuthorOf(uid, name, relay.authTrainer?.initials),
            rootId,
          });
          const her = firstName(draft.client.name);
          if (out.failed === "record") {
            setError(`${her}'s record didn't take the question, so nothing was posted. Check your connection and try again.`);
            return;
          }
          if (out.failed === "board") {
            setRootId(out.rootId);
            setError(`It's on ${her}'s record, but the Board didn't take the ask. Post again: her record won't get it twice.`);
            return;
          }
        } else {
          await createRequest(input);
        }
        if (namesSomeone(draft, relay.canLead) && input.forId) {
          await notify({
            to: input.forId,
            actor: author,
            kind: "handoff",
            title: `${firstName(name)} ${draft.tile === "question" ? "asked you" : "handed you"}: ${input.title}`.slice(0, 200),
            studioId,
            link: { view: "studio-tasks", id: "mine" },
          });
          toastSuccess(`${firstName(input.forName ?? "They")} has it. It's on their list, and their bell rang once.`);
        } else if (draft.tile === "question" && draft.client) {
          toastSuccess(`Asked. It's on the Board, and on ${firstName(draft.client.name)}'s record until it's answered.`);
        } else {
          toastSuccess("On the Board, under Help a teammate. Nobody was messaged.");
        }
      }
      leave.release();
      onOpenChange(false);
    } catch (err) {
      console.warn("[relay] ask failed:", err);
      setError("Could not post that. Check your connection and try again. Nothing you typed is lost.");
    } finally {
      setBusy(false);
    }
  };

  const tile = draft.tile;
  const goesTo = askGoesTo(draft, { studioName: relay.studioName, canLead: relay.canLead, leaderName });
  const Icon = tile ? TILE_ICON[tile] : null;

  const machineChips = (required: boolean) => (
    <div className="rk-field">
      <span className="rk-label">{required ? "Machine" : "Where"}</span>
      <div className="rk-chips rk-chips--scroll" role="group" aria-label={required ? "Which machine" : "Where on the floor"}>
        {!required && (
          <button type="button" className="rk-chip" aria-pressed={!draft.machineId} onClick={() => edit({ machineId: null, machineName: null })}>
            Anywhere on the floor
          </button>
        )}
        {machines.map((m) => (
          <button
            key={m.machineId}
            type="button"
            className="rk-chip"
            aria-pressed={draft.machineId === m.machineId}
            onClick={() => edit({ machineId: m.machineId, machineName: m.name })}
          >
            {m.name}
          </button>
        ))}
      </div>
      {machines.length === 0 && <p className="rk-hint">No equipment is set up for this studio yet.</p>}
      {problemFor("machine") && <p className="rk-problem">{problemFor("machine")}</p>}
    </div>
  );

  const words = (label: string, placeholder: string, rows = 3) => (
    <label className="rk-field">
      <span className="rk-label">{label}</span>
      <textarea
        className="rk-textarea"
        rows={rows}
        value={draft.text}
        placeholder={placeholder}
        maxLength={2200}
        onChange={(e) => edit({ text: e.target.value })}
      />
      {problemFor("text") && <p className="rk-problem">{problemFor("text")}</p>}
    </label>
  );

  const clientField = (label: string) => (
    <div className="rk-field">
      <span className="rk-label">{label}</span>
      {draft.client ? (
        <div className="rk-chips">
          <button type="button" className="rk-chip" aria-pressed onClick={() => edit({ client: null })} aria-label={`Remove ${draft.client.name}`}>
            {draft.client.name}
            <X size={14} aria-hidden />
          </button>
        </div>
      ) : (
        <ClientPicker
          roster={relay.clients}
          picked={[]}
          onChange={(next) => edit({ client: next[next.length - 1] ?? null })}
          authTrainer={relay.authTrainer}
          activeStudioId={relay.studioId}
          max={1}
        />
      )}
      {problemFor("client") && <p className="rk-problem">{problemFor("client")}</p>}
    </div>
  );

  const personField = (label: string) =>
    relay.canLead ? (
      <div className="rk-field">
        <span className="rk-label">{label}</span>
        <PeoplePicker
          people={people}
          selected={draft.person ? [draft.person] : []}
          onChange={(next) => edit({ person: next[next.length - 1] ?? null })}
          meId={relay.uid}
          label={label}
        />
        <p className="rk-hint">
          {draft.person ? `It arrives as ${firstName(draft.person.name)}'s, with a way to say they can't.` : "Nobody picked: it goes on the Board for anyone."}
        </p>
      </div>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="rk-sheet rak sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="rk-title">
            <Send size={18} aria-hidden />
            Ask the team
          </DialogTitle>
        </DialogHeader>

        <div className="rk-body">
          {error && (
            <p className="rk-problem" role="alert">
              {error}
            </p>
          )}
          <p className="rak-q" id="rak-q">
            What do you need?
          </p>
          <div className="rak-tiles" role="group" aria-labelledby="rak-q">
            {ASK_TILES.map((t) => {
              const TileIcon = TILE_ICON[t.id];
              return (
                <button key={t.id} type="button" className="rak-tile" aria-pressed={tile === t.id} onClick={() => pick(t.id)}>
                  <span className="rak-tile__ic" aria-hidden>
                    <TileIcon size={18} />
                  </span>
                  <span className="rak-tile__t">{t.label}</span>
                  <span className="rak-tile__s">{t.sub}</span>
                </button>
              );
            })}
          </div>

          {!tile && <p className="rk-hint">Pick one. Each asks only for what it needs.</p>}

          {tile && Icon && (
            <section className="rak-form" aria-label={ASK_TILE_LABEL[tile]}>
              <h3 className="rak-form__h">
                <Icon size={16} aria-hidden />
                {ASK_TILE_LABEL[tile]}
              </h3>

              {tile === "cover" && (
                <>
                  {clientField("Client")}
                  <div className="rk-field">
                    <span className="rk-label">When</span>
                    <div className="rk-chips" role="group" aria-label="Which day">
                      {[
                        { key: null, label: "Today" },
                        { key: addDays(todayKey, 1), label: "Tomorrow" },
                      ].map((d) => (
                        <button key={String(d.key)} type="button" className="rk-chip" aria-pressed={draft.date === d.key} onClick={() => edit({ date: d.key })}>
                          {d.label}
                        </button>
                      ))}
                      <input
                        type="date"
                        className="rk-input rak-when"
                        aria-label="Another day"
                        min={todayKey}
                        value={draft.date ?? ""}
                        onChange={(e) => edit({ date: e.target.value || null })}
                      />
                      <input
                        type="time"
                        className="rk-input rak-when"
                        aria-label="The session's time"
                        value={draft.time ?? ""}
                        onChange={(e) => edit({ time: e.target.value || null })}
                      />
                    </div>
                    <p className="rk-hint">The time goes in the ask's words ("at 4:00 PM").</p>
                  </div>
                  {words("Anything to know?", "Starts on the Leg Press; his knee is sore today.", 2)}
                </>
              )}

              {tile === "hand" && (
                <>
                  <div className="rk-field">
                    <span className="rk-label">When</span>
                    <Seg
                      value={draft.when}
                      options={[
                        { value: "now", label: "Now" },
                        { value: "at", label: "At a time" },
                      ]}
                      onChange={(when) => edit({ when })}
                      label="When"
                    />
                    {draft.when === "at" && (
                      <input
                        type="time"
                        className="rk-input rak-when"
                        aria-label="What time"
                        value={draft.time ?? ""}
                        onChange={(e) => edit({ time: e.target.value || null })}
                      />
                    )}
                  </div>
                  {machineChips(false)}
                  {words("What for?", "A second person for a transfer onto the machine.", 2)}
                </>
              )}

              {tile === "handoff" && (
                <>
                  {words("What", "Hugo Bracegirdle's progress report. A second line is a line for them.")}
                  {draft.client && clientField("Client")}
                  {personField("To")}
                </>
              )}

              {tile === "question" && (
                <>
                  {words("Your question", "Nancy isn't feeling her seated dip where she should. Can anyone help?")}
                  {clientField("About a client (optional)")}
                  {relay.canLead && (
                    <div className="rk-field">
                      <span className="rk-label">For</span>
                      <Seg
                        value={forOne ? "one" : "team"}
                        options={[
                          { value: "team", label: "The team" },
                          { value: "one", label: "One person" },
                        ]}
                        onChange={(v) => {
                          setForOne(v === "one");
                          if (v === "team") edit({ person: null });
                        }}
                        label="Who it's for"
                      />
                      {forOne && personField("Who")}
                    </div>
                  )}
                </>
              )}

              {tile === "broken" && (
                <>
                  {machineChips(true)}
                  {words("What's wrong?", "The seat catch slips on notch 4.", 2)}
                  <div className="rk-field">
                    <span className="rk-label">Can it still be used?</span>
                    <Seg
                      value={draft.usable ? "yes" : "no"}
                      options={[
                        { value: "yes", label: "Still usable" },
                        { value: "no", label: "Don't use it" },
                      ]}
                      onChange={(v) => edit({ usable: v === "yes" })}
                      label="Can it still be used"
                    />
                  </div>
                </>
              )}

              {tile === "other" && words("What is it?", "Anything the team can help with.")}
            </section>
          )}

          {tile && (
            <div className="rak-goes" aria-live="polite">
              <p className="rak-goes__t">
                <b>Goes to:</b> {goesTo}
              </p>
              <p className="rak-goes__private">
                <Lock size={14} aria-hidden />
                {ringsABell(draft, relay.canLead) ? "In the app only. The one bell is said above." : "In the app only. Nobody is messaged."}
              </p>
            </div>
          )}
        </div>

        <div className="rk-foot">
          <button type="button" className="pl__btn" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="pl__btn pl__btn--primary" onClick={() => void submit()} disabled={busy || !tile}>
            <Send size={14} aria-hidden />
            {busy ? "Posting…" : draft.tile === "broken" ? "Flag it" : "Post the ask"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
