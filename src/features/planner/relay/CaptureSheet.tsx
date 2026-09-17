import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  Repeat,
  Timer,
  UserRound,
  Zap,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "../../../contexts/ToastContext";
import { useStudioMachines } from "../../../hooks/useStudioMachines";
import { cn } from "../../../lib/utils";
import { notify } from "../../notifications/mutations";
import { studioRoster } from "../../studio-tasks/initiatives";
import { saveTaskTemplate, type TaskAuthor } from "../../studio-tasks/mutations";
import { addDays } from "../../studio-tasks/recurrence";
import { createRequest, REQUEST_KIND_HINT, REQUEST_KIND_LABEL } from "../../studio-tasks/requests";
import { SHIFT_LABEL, TASK_SHIFTS, type TaskShift } from "../../studio-tasks/types";
import { ClientPicker } from "../ClientPicker";
import { PeoplePicker, Seg, Toggle, type Person } from "../kit";
import { postTeamJob } from "../jobs/mutations";
import { useRelay } from "./RelayContext";
import {
  ASK_KINDS,
  CATEGORY_CHOICES,
  DESTINATION_LABEL,
  DURATION_CHOICES,
  REMIND_CHOICES,
  blankCapture,
  captureProblems,
  captureSentence,
  repeatChipLabel,
  titleOf,
  toJobDraft,
  toRequest,
  toTemplate,
  weekdayOfKey,
  whenChipLabel,
  type CaptureDestination,
  type CapturePreset,
  type CaptureProblem,
  type CaptureState,
} from "./capture";
import "../kit.css";

/**
 * CAPTURE — the sheet. One field, one destination, chips for the rest.
 *
 * Round: Relay, Sep 2026. The pure half (what each destination writes, the
 * sentence, validation) is capture.ts; this is the surface. Every picker
 * opens INLINE under the chip row rather than as a second sheet, because a
 * sheet on a sheet on an iPad is where fingers go to die.
 *
 * Who may write what follows the rules: a trainer's Floor capture is an ask
 * on the board and their Someone capture is a hand-off (a request that
 * carries a name and rings a bell); a leader of this studio is also offered
 * "Studio task" (a recurring template) and "Team job" (parts, people).
 */
type Picker = "machine" | "client" | "when" | "repeat" | "duration" | null;

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

export function CaptureSheet({
  open,
  preset,
  onOpenChange,
}: {
  open: boolean;
  preset: CapturePreset | null;
  onOpenChange: (open: boolean) => void;
}) {
  const relay = useRelay();
  const { success: toastSuccess } = useToast();
  const [state, setState] = useState<CaptureState>(() => blankCapture(preset ?? {}));
  const [picker, setPicker] = useState<Picker>(null);
  const [more, setMore] = useState(false);
  const [problems, setProblems] = useState<CaptureProblem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // A fresh draft each time the sheet opens, seeded by whoever opened it.
  useEffect(() => {
    if (!open) return;
    setState(blankCapture(preset ?? {}));
    // A reminder preset arrives with a time: open the When picker so the
    // bell choices are in view without a tap.
    setPicker(preset?.time ? "when" : null);
    setMore(false);
    setProblems([]);
    setError(null);
    const t = setTimeout(() => textRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, preset]);

  const todayKey = relay.now.todayKey;
  const { machines } = useStudioMachines(open ? relay.studioId : null, { bridgeWhenRosterEmpty: true });
  const machineName = useMemo(() => {
    const m = new Map(machines.map((x) => [x.machineId, x.name] as const));
    return (id: string) => m.get(id) ?? "";
  }, [machines]);
  const people: Person[] = useMemo(
    () => studioRoster(relay.trainers, relay.studioId).filter((p) => p.id !== relay.uid && p.id !== relay.authTrainer?.id),
    [relay.trainers, relay.studioId, relay.uid, relay.authTrainer?.id],
  );

  const edit = (patch: Partial<CaptureState>) => setState((s) => ({ ...s, ...patch }));
  const problemFor = (f: CaptureProblem["field"]) => problems.find((p) => p.field === f)?.message;
  const sentence = captureSentence(state, { todayKey, studioName: relay.studioName, machineName });

  const destinations: CaptureDestination[] = ["me", "floor", "someone"];

  const submit = async () => {
    const issues = captureProblems(state, { todayKey });
    setProblems(issues);
    if (issues.length) return;
    const uid = relay.uid;
    const name = relay.authTrainer?.fullName ?? "A trainer";
    if (!uid || !relay.studioId) {
      setError("Sign in and pick a studio first.");
      return;
    }
    const author: TaskAuthor = { id: uid, name };
    setBusy(true);
    setError(null);
    try {
      if (state.destination === "me") {
        const template = toTemplate(state, { studioId: relay.studioId, ownerId: uid, todayKey });
        await saveTaskTemplate({
          location: { scope: "personal", studioId: relay.studioId, ownerId: uid },
          template,
          author,
          isNew: true,
        });
        toastSuccess(template.remindMinutesBefore != null ? "On your list — your bell is set." : "On your list.");
      } else if (state.destination === "floor" && state.floorForm === "task" && relay.canLead) {
        const template = toTemplate(state, { studioId: relay.studioId, ownerId: uid, todayKey });
        await saveTaskTemplate({
          location: { scope: "studio", studioId: relay.studioId },
          template,
          author,
          isNew: true,
        });
        toastSuccess("On the Floor — it's on the shift now.");
      } else if (state.destination === "someone" && state.someoneForm === "job" && relay.canLead) {
        const draft = toJobDraft(state, { clients: relay.clients });
        await postTeamJob({ studioId: relay.studioId, draft, author, machineName });
        toastSuccess("Posted — they've been told.");
      } else {
        const input = toRequest(state, { studioId: relay.studioId, author, todayKey });
        const id = await createRequest(input);
        if (input.forId && input.forName) {
          await notify({
            to: input.forId,
            actor: author,
            kind: "handoff",
            title: `${name.split(" ")[0]} handed you: ${titleOf(state.text)}`,
            body: input.dueOn ? `By ${input.dueOn}` : undefined,
            studioId: relay.studioId,
            link: { view: "studio-tasks", id: "mine" },
          });
          toastSuccess(`Handed to ${input.forName.split(" ")[0]} — it's on their list.`);
        } else {
          toastSuccess("On the Floor.");
        }
        void id;
      }
      onOpenChange(false);
    } catch (err) {
      console.warn("[relay] capture failed:", err);
      setError("Could not save that. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const togglePicker = (p: Picker) => setPicker((cur) => (cur === p ? null : p));
  const machineChip =
    state.machineIds === "all"
      ? "Every machine"
      : Array.isArray(state.machineIds)
        ? state.machineIds.length === 1
          ? machineName(state.machineIds[0]) || "1 machine"
          : `${state.machineIds.length} machines`
        : "Machine";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pk-sheet cs sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pk-title">
            <Zap size={18} aria-hidden />
            Capture
          </DialogTitle>
        </DialogHeader>

        <div className="pk-body cs__body">
          {error && (
            <p className="pk-problem" role="alert">
              {error}
            </p>
          )}

          <label className="pk-field">
            <span className="sr-only">What is it</span>
            <textarea
              ref={textRef}
              className="pk-textarea cs__text"
              rows={2}
              value={state.text}
              placeholder="What is it? A second line is the detail."
              maxLength={2200}
              onChange={(e) => edit({ text: e.target.value })}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
              }}
            />
            {problemFor("text") && <p className="pk-problem">{problemFor("text")}</p>}
          </label>

          <div className="pk-field">
            <span className="pk-label">For</span>
            <Seg
              value={state.destination}
              options={destinations.map((d) => ({ value: d, label: DESTINATION_LABEL[d] }))}
              onChange={(destination) => edit({ destination })}
              label="Who it's for"
            />
          </div>

          {state.destination === "floor" && (
            <div className="pk-field">
              {relay.canLead && (
                <Seg
                  value={state.floorForm}
                  options={[
                    { value: "ask", label: "An ask on the board" },
                    { value: "task", label: "A studio task" },
                  ]}
                  onChange={(floorForm) => edit({ floorForm })}
                  label="Ask or task"
                />
              )}
              {state.floorForm === "ask" && (
                <div className="pk-chips" role="group" aria-label="What kind of ask">
                  {ASK_KINDS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="pk-chip"
                      aria-pressed={state.askKind === k}
                      title={REQUEST_KIND_HINT[k]}
                      onClick={() => edit({ askKind: k })}
                    >
                      {REQUEST_KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {state.destination === "someone" && (
            <div className="pk-field">
              {relay.canLead && (
                <Seg
                  value={state.someoneForm}
                  options={[
                    { value: "handoff", label: "Hand it to one person" },
                    { value: "job", label: "A team job with parts" },
                  ]}
                  onChange={(someoneForm) => edit({ someoneForm })}
                  label="Hand-off or job"
                />
              )}
              <PeoplePicker
                people={people}
                selected={state.people}
                onChange={(next) => edit({ people: state.someoneForm === "handoff" ? next.slice(-1) : next })}
                meId={relay.uid}
                label={state.someoneForm === "handoff" ? "Who" : "Who's on it"}
                max={state.someoneForm === "handoff" ? 1 : 30}
              />
              {problemFor("people") && <p className="pk-problem">{problemFor("people")}</p>}
              {state.someoneForm === "job" && (
                <>
                  <label className="pk-field">
                    <span className="pk-label">Parts to tick off (optional, one per line)</span>
                    <textarea
                      className="pk-textarea"
                      rows={3}
                      value={state.partLines}
                      onChange={(e) => edit({ partLines: e.target.value })}
                      placeholder={"Mirrors\nBathrooms\nFront desk"}
                    />
                  </label>
                  <Toggle
                    checked={state.openToAll}
                    onChange={(openToAll) => edit({ openToAll })}
                    title="Anyone else can join"
                    body="Shows as up for grabs too, not only to the names on it."
                  />
                </>
              )}
            </div>
          )}

          {/* The chips: what it is about, when, how often, how long. */}
          <div className="pk-chips cs__chips" role="group" aria-label="Details">
            <button type="button" className="pk-chip" aria-pressed={picker === "machine" || state.machineIds !== null} onClick={() => togglePicker("machine")}>
              <Dumbbell size={13} aria-hidden /> {machineChip}
            </button>
            <button type="button" className="pk-chip" aria-pressed={picker === "client" || state.client !== null} onClick={() => togglePicker("client")}>
              <UserRound size={13} aria-hidden /> {state.client?.name ?? "Client"}
            </button>
            <button type="button" className="pk-chip" aria-pressed={picker === "when" || Boolean(state.date || state.time || state.shift !== "any")} onClick={() => togglePicker("when")}>
              <CalendarDays size={13} aria-hidden /> {whenChipLabel(state, todayKey)}
            </button>
            {(state.destination === "me" || (state.destination === "floor" && state.floorForm === "task")) && (
              <button type="button" className="pk-chip" aria-pressed={picker === "repeat" || state.repeat !== "once"} onClick={() => togglePicker("repeat")}>
                <Repeat size={13} aria-hidden /> {repeatChipLabel(state)}
              </button>
            )}
            <button type="button" className="pk-chip" aria-pressed={picker === "duration" || state.estMinutes !== null} onClick={() => togglePicker("duration")}>
              <Timer size={13} aria-hidden /> {state.estMinutes ? `~${state.estMinutes} min` : "~min"}
            </button>
          </div>

          {picker === "machine" && (
            <div className="cs__picker">
              <div className="pk-chips">
                <button type="button" className="pk-chip" aria-pressed={state.machineIds === "all"} onClick={() => edit({ machineIds: state.machineIds === "all" ? null : "all" })}>
                  Every machine
                </button>
                <button type="button" className="pk-chip" onClick={() => { edit({ machineIds: null }); setPicker(null); }}>
                  No machine
                </button>
              </div>
              <div className="pk-chips pk-chips--scroll" role="group" aria-label="Machines">
                {machines.map((m) => {
                  const on = Array.isArray(state.machineIds) && state.machineIds.includes(m.machineId);
                  return (
                    <button
                      key={m.machineId}
                      type="button"
                      className="pk-chip"
                      aria-pressed={on}
                      onClick={() => {
                        const cur = Array.isArray(state.machineIds) ? state.machineIds : [];
                        const next = on ? cur.filter((id) => id !== m.machineId) : [...cur, m.machineId];
                        edit({ machineIds: next.length ? next : null });
                      }}
                    >
                      {m.name}
                    </button>
                  );
                })}
                {machines.length === 0 && <p className="pk-hint">No equipment is set up for this studio yet.</p>}
              </div>
              {problemFor("machines") && <p className="pk-problem">{problemFor("machines")}</p>}
            </div>
          )}

          {picker === "client" && (
            <div className="cs__picker">
              <ClientPicker
                roster={relay.clients}
                picked={state.client ? [state.client] : []}
                onChange={(next) => {
                  const last = next[next.length - 1] ?? null;
                  edit({ client: last });
                  if (last) setPicker(null);
                }}
                authTrainer={relay.authTrainer}
                activeStudioId={relay.studioId}
                max={1}
              />
            </div>
          )}

          {picker === "when" && (
            <div className="cs__picker">
              <div className="pk-chips" role="group" aria-label="Which day">
                {[
                  { key: null, label: "Today" },
                  { key: addDays(todayKey, 1), label: "Tomorrow" },
                  { key: addDays(todayKey, 7), label: "In a week" },
                ].map((d) => (
                  <button key={String(d.key)} type="button" className="pk-chip" aria-pressed={state.date === d.key} onClick={() => edit({ date: d.key })}>
                    {d.label}
                  </button>
                ))}
                <input
                  type="date"
                  className="pk-input tw-day"
                  aria-label="Pick a date"
                  min={todayKey}
                  value={state.date ?? ""}
                  onChange={(e) => edit({ date: e.target.value || null })}
                />
              </div>
              {problemFor("date") && <p className="pk-problem">{problemFor("date")}</p>}
              <Seg<TaskShift>
                value={state.shift}
                options={TASK_SHIFTS.map((s) => ({ value: s, label: SHIFT_LABEL[s] }))}
                onChange={(shift) => edit({ shift })}
                label="Which part of the day"
              />
              <div className="tw-time">
                <label className="pk-field">
                  <span className="pk-label">At a set time (optional)</span>
                  <input
                    type="time"
                    className="pk-input tw-narrow"
                    value={state.time ?? ""}
                    onChange={(e) => edit({ time: e.target.value || null, remindMinutesBefore: e.target.value ? state.remindMinutesBefore : null })}
                  />
                </label>
                {state.time && (
                  <button type="button" className="pk-chip" onClick={() => edit({ time: null, remindMinutesBefore: null })}>
                    Clear
                  </button>
                )}
              </div>
              {problemFor("time") && <p className="pk-problem">{problemFor("time")}</p>}
              {state.destination === "me" && state.time && (
                <div className="pk-field">
                  <span className="pk-label">
                    <Bell size={11} aria-hidden /> Your bell
                  </span>
                  <div className="pk-chips">
                    {REMIND_CHOICES.map((c) => (
                      <button key={String(c.value)} type="button" className="pk-chip" aria-pressed={state.remindMinutesBefore === c.value} onClick={() => edit({ remindMinutesBefore: c.value })}>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <p className="pk-hint">Rings on this iPad while the app is open. Nothing is pushed to a phone.</p>
                </div>
              )}
              {problemFor("remind") && <p className="pk-problem">{problemFor("remind")}</p>}
            </div>
          )}

          {picker === "repeat" && (
            <div className="cs__picker">
              <Seg
                value={state.repeat}
                options={[
                  { value: "once", label: "Once" },
                  { value: "daily", label: "Every day" },
                  { value: "weekly", label: "Some days" },
                  { value: "monthly", label: "Monthly" },
                ]}
                onChange={(repeat) =>
                  edit({
                    repeat,
                    daysOfWeek: repeat === "weekly" && state.daysOfWeek.length === 0 ? [weekdayOfKey(todayKey)] : state.daysOfWeek,
                  })
                }
                label="How often"
              />
              {state.repeat === "weekly" && (
                <div className="pk-chips" role="group" aria-label="Which days">
                  {DAYS.map((d, i) => {
                    const on = state.daysOfWeek.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        className="pk-chip tw-day"
                        aria-pressed={on}
                        aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][i]}
                        onClick={() => edit({ daysOfWeek: on ? state.daysOfWeek.filter((x) => x !== i) : [...state.daysOfWeek, i] })}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              )}
              {state.repeat === "monthly" && <p className="pk-hint">On the same day of the month as the date chosen (today unless you pick one).</p>}
              {problemFor("days") && <p className="pk-problem">{problemFor("days")}</p>}
            </div>
          )}

          {picker === "duration" && (
            <div className="cs__picker">
              <div className="pk-chips" role="group" aria-label="About how long">
                {DURATION_CHOICES.map((m) => (
                  <button key={m} type="button" className="pk-chip" aria-pressed={state.estMinutes === m} onClick={() => edit({ estMinutes: state.estMinutes === m ? null : m })}>
                    ~{m} min
                  </button>
                ))}
              </div>
              <p className="pk-hint">So Next up can offer it when there's room for it before your next session.</p>
            </div>
          )}

          <button type="button" className="cs__more" aria-expanded={more} onClick={() => setMore((v) => !v)}>
            {more ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />} More
            <span className="cs__more-hint">category · closing note · tell me when done{state.destination === "me" ? " · growth" : ""}</span>
          </button>

          {more && (
            <div className="cs__picker">
              <label className="pk-field">
                <span className="pk-label">Category</span>
                <select className="pk-select" value={state.category ?? ""} onChange={(e) => edit({ category: e.target.value || null })}>
                  <option value="">Choose for me</option>
                  {CATEGORY_CHOICES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <Toggle checked={state.requiresNote} onChange={(requiresNote) => edit({ requiresNote })} title="Needs a closing note" body="Whoever closes it says what they found." />
              {state.destination !== "me" && (
                <Toggle checked={state.notifyOnDone} onChange={(notifyOnDone) => edit({ notifyOnDone })} title="Tell me when it's done" body="Your bell rings once when someone closes it." />
              )}
              {state.destination === "me" && (
                <Toggle checked={state.growth} onChange={(growth) => edit({ growth })} title="File under Growth" body="Your own development, kept out of Today." />
              )}
            </div>
          )}

          <p className="pk-summary cs__sentence" aria-live="polite">
            {sentence}
          </p>
        </div>

        <div className="pk-foot">
          <button type="button" className="pl__btn" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={cn("pl__btn pl__btn--primary cs__go", titleOf(state.text) && "cs__go--ready")} onClick={() => void submit()} disabled={busy}>
            {busy ? "Saving…" : "Relay it"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
