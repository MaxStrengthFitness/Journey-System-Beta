import { useRef, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { RoutinePresetTier } from "../../../types";
import { AdminButton } from "../../admin/primitives";
import type { RoutinePresetStart } from "../starting-routines";
import {
  dayOneLine,
  dayOneOf,
  newStartPart,
  startingSourceWords,
  withDayOneToggled,
  withDefault,
  withMatchWord,
  withoutMatchWord,
} from "../start-part";
import "../../admin/admin.css";
import "./starting-routines.css";

/**
 * THE TEMPLATE EDITOR'S "FOR NEW CLIENTS" PART (the design round, Oct 8 2026).
 *
 * AJ: "studios will chose their own, admins will create the routines to pick
 * from in the app during beta". A routine template switched on here is a
 * starting routine: Start a plan offers it for a client starting out at the
 * studio. Three things make one, each said in the words a studio uses:
 * - Day one: the template's machines, each a row a tap marks (at least one);
 * - the words in an intake or a Health note that make it the match;
 * - head office's default, on a company routine only (at most one: the tab's
 *   save takes the flag off any other in the same batch).
 * Where a seeded routine came from is shown, never edited.
 *
 * Controlled: `start` is the template draft's `start` part (undefined while
 * the switch is off) and every change goes back through `onChange`. Switching
 * off and on again in the same sitting brings back what was marked, so a
 * stray tap loses nothing, and a routine switched off in an earlier sitting
 * comes back as it was (`parked`, the part the save kept beside it). The
 * word being typed is the editor's too (`word`), so a word typed but not
 * added counts as unsaved and goes in with Save. Nothing here writes; the
 * editor's Save does.
 *
 * The switch changes where trainers meet the template, and says so: on, it
 * leaves the Edit routine drawer for Start a plan (`drawerTemplates`); off,
 * it is an ordinary template in the drawer again. A studio that keeps its own
 * list of starting routines offers a new one only once a leader ticks it on
 * My Studio → Studio → Starting routines, so that is said too.
 */
export interface StartPartEditorProps {
  start: RoutinePresetStart | undefined;
  onChange: (next: RoutinePresetStart | undefined) => void;
  /** The template's machines, in its order (catalog ids). */
  machineIds: readonly string[];
  /** A machine's name, as the editor's builder says it. */
  nameOf: (id: string) => string;
  /** Head office's default is a company routine's alone. */
  tier: RoutinePresetTier;
  /** The company routine that is head office's default now, when it is another one. */
  otherDefaultName?: string | null;
  /** The part kept from when this template was switched off (`startParked`): what switching it on brings back. */
  parked?: RoutinePresetStart;
  /** The word being typed, not added yet: the editor's, so it counts as unsaved and goes in with Save. */
  word: string;
  onWordChange: (word: string) => void;
}

export function StartPartEditor({
  start,
  onChange,
  machineIds,
  nameOf,
  tier,
  otherDefaultName,
  parked,
  word,
  onWordChange,
}: StartPartEditorProps) {
  const kept = useRef<RoutinePresetStart | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);

  const on = start !== undefined;
  const dayOne = dayOneOf(start, machineIds);
  const source = startingSourceWords((start ?? parked)?.source);

  const toggle = (next: boolean) => {
    if (next) {
      onChange(kept.current ?? parked ?? newStartPart());
    } else {
      kept.current = start;
      onWordChange("");
      setProblem(null);
      onChange(undefined);
    }
  };

  const addWord = () => {
    if (!start) return;
    const result = withMatchWord(start, word);
    setProblem(result.problem);
    if (!result.problem) {
      onChange(result.start);
      onWordChange("");
    }
  };

  return (
    <section className="adm srt" aria-label="For new clients">
      <div className="srt__part">
        <h3 className="srt__title">For new clients</h3>
        <label className="srt-switch">
          <Switch checked={on} onCheckedChange={(v) => toggle(v === true)} aria-label="Offer as a starting routine" />
          <span>Offer as a starting routine</span>
        </label>
        <p className="srt__hint">
          {on
            ? "Start a plan offers it for a client starting out at the studio: day one first, then the rest of the template in its order. While it is on, it is not in the Edit routine drawer."
            : parked
              ? "Switch it back on and Start a plan offers it again just as it was, day one, words and all. While it is off, it is an ordinary template in the Edit routine drawer."
              : "Switch it on to offer this template on Start a plan, for a client starting out at the studio. It then leaves the Edit routine drawer."}
        </p>
        {on ? (
          <p className="srt__hint">
            {tier === "company"
              ? "A studio that keeps its own list of starting routines offers it once a leader there ticks it on My Studio → Studio → Starting routines."
              : "If this studio keeps its own list of starting routines, a leader ticks it on My Studio → Studio → Starting routines as well."}
          </p>
        ) : null}
        {source ? <p className="srt-source">{source}</p> : null}
      </div>

      {on && start ? (
        <>
          <div className="srt__part" role="group" aria-label="Day one">
            <p className="srt__label">Day one</p>
            <p className="srt__hint">Tap the machines a first session runs. At least one.</p>
            {machineIds.length === 0 ? (
              <p className="srt-line srt-line--wants">Add machines to the template above first.</p>
            ) : (
              <>
                <div className="srt-picks">
                  {machineIds.map((id, i) => {
                    const picked = dayOne.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className="srt-pick"
                        aria-pressed={picked}
                        onClick={() => onChange(withDayOneToggled(start, id, machineIds))}
                      >
                        <span className="srt-pick__n">{i + 1}</span>
                        <span className="srt-pick__name">{nameOf(id)}</span>
                        {picked ? <Check className="srt-pick__mark" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
                <p className={dayOne.length > 0 ? "srt-line" : "srt-line srt-line--wants"} aria-live="polite">
                  {dayOneLine(dayOne, nameOf)}
                </p>
              </>
            )}
          </div>

          <div className="srt__part" role="group" aria-label="Words that suggest it">
            <p className="srt__label">Words that suggest it</p>
            <p className="srt__hint">
              When a client's intake or a Health note says one of these, Start a plan suggests this routine first. Whole
              words, in any case: "low back", "sciatica".
            </p>
            {(start.matchWords ?? []).length > 0 ? (
              <div className="srt-words">
                {(start.matchWords ?? []).map((w) => (
                  <button
                    key={w}
                    type="button"
                    className="srt-word"
                    aria-label={`Take out ${w}`}
                    onClick={() => onChange(withoutMatchWord(start, w))}
                  >
                    {w}
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                ))}
              </div>
            ) : null}
            <div className="srt-add">
              <Input
                className="srt-add__input h-10"
                value={word}
                aria-label="A word that suggests it"
                placeholder="low back"
                onChange={(e) => {
                  onWordChange(e.target.value);
                  if (problem) setProblem(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addWord();
                  }
                }}
              />
              <AdminButton onClick={addWord}>
                <Plus className="h-3.5 w-3.5" /> Add word
              </AdminButton>
            </div>
            {problem ? (
              <p className="srt__hint" role="alert">
                {problem}
              </p>
            ) : null}
          </div>

          {tier === "company" ? (
            <div className="srt__part">
              <label className="srt-switch">
                <Switch
                  checked={start.default === true}
                  onCheckedChange={(v) => onChange(withDefault(start, v === true))}
                  aria-label="Head office's default"
                />
                <span>Head office's default</span>
              </label>
              <p className="srt__hint">
                {start.default === true && otherDefaultName
                  ? `Saving this one as the default takes it off ${otherDefaultName}. There is only ever one.`
                  : otherDefaultName
                    ? `Now: ${otherDefaultName}. Start a plan suggests the default when the intake names nothing and the studio has no default of its own.`
                    : "Start a plan suggests the default when the intake names nothing and the studio has no default of its own. There is only ever one."}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
