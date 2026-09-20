import React from "react";
import { ArrowLeft, BookOpen, Check, Dumbbell, Lock, Pencil, ShieldAlert } from "lucide-react";
import {
  AdminBadge,
  AdminButton,
  AdminHeader,
  AdminNotice,
  AdminPanel,
  AdminScreen,
  SaveBar,
} from "../../primitives";
import { sameValue } from "../../formState";
import { useDirtyForm } from "../../useDirtyForm";
import type { MachineDefinition } from "../../../../types/machines";
import {
  canEdit,
  scopeOverrides,
  tierOf,
  type EditScope,
} from "../../../../lib/machine-template";
import { SECTIONS, completeness, describeGaps, sectionStates } from "../completeness";
import { SECTION_BODIES, type SectionProps } from "./sections";
import "./editor.css";

/**
 * THE MACHINE EDITOR — one screen, three doors.
 *
 * Round: Machine authoring, Sep 2026. AJ asked for "a good layout on how to
 * build a machine up and how to edit a machine", shaped like the wiki page a
 * trainer reads.
 *
 * What it replaces: a Radix dialog at `sm:max-w-5xl` holding ~60 inputs and
 * 57 muscle chips in one scroll, with a sticky footer inside a fixed scroller
 * — the iOS case where the Save button disappears behind the keyboard. It was
 * also create-only for a studio: once a studio machine was saved there was no
 * way back into it at all, and a catalog machine's local copy could override
 * exactly one field, its name.
 *
 * The shape here is the machine's own page: a masthead, a section rail down
 * the side, the Academy template's eight sections in its own order, and the
 * clinical warnings pinned where they cannot be scrolled past. Each section
 * renders as prose or as inputs depending on who owns it, so a studio leader
 * reading Max Strength's cadence and an admin editing it are on one screen,
 * not two.
 *
 * SCOPE is the whole argument:
 *   catalog  an admin editing the standard. Everything editable, no standard
 *            to inherit from, and the write lands on machines/{id}.
 *   studio   a studio leader on their own copy. The method is read-only, the
 *            hardware is theirs, and the write is a DIFF against the catalog
 *            so an untouched field keeps inheriting corrections.
 *   admin    corporate inside a location. Same diff, no locks.
 */

export interface MachineEditorProps {
  /** What is being edited. For a studio copy, the RESOLVED definition. */
  value: MachineDefinition;
  /**
   * The Max Strength entry this is a copy of. Absent when editing the
   * standard itself, or a machine the catalog has never heard of.
   */
  standard?: MachineDefinition;
  scope: EditScope;
  /** Shown in the masthead — "Max Strength standard", "Solon's copy". */
  whose: string;
  /**
   * Write it. Receives ONLY the fields that changed, already filtered to what
   * this scope may write. Throwing keeps the edits and shows the message in
   * the save bar.
   */
  onSave: (patch: Partial<MachineDefinition>) => Promise<void>;
  onBack: () => void;
  /** What the back button says it goes to. */
  backLabel: string;
  /** The "This unit" card — serial, manufacturer, studio notes. Slotted. */
  unit?: React.ReactNode;
  /** True for a machine being created, so the save bar says so. */
  isNew?: boolean;
}

export function MachineEditor({
  value,
  standard,
  scope,
  whose,
  onSave,
  onBack,
  backLabel,
  unit,
  isNew,
}: MachineEditorProps) {
  // Stable identity or the form adopts on every render — useDirtyForm's own
  // warning, and the reason StudioDetailsForm memoises its external too.
  const external = React.useMemo(() => value, [value]);

  const form = useDirtyForm<MachineDefinition>(external, async (patch) => {
    // The last gate. The editor already hides what a studio may not touch, so
    // in normal use this removes nothing — which is the point of having it.
    await onSave(scopeOverrides(scope, patch));
  });

  const [reading, setReading] = React.useState(false);
  const [active, setActive] = React.useState(SECTIONS[0].id);
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  const draft = form.value;
  const states = React.useMemo(
    () => sectionStates(draft, scope),
    [draft, scope],
  );
  const whole = React.useMemo(() => completeness(draft, scope), [draft, scope]);

  const changed = React.useCallback(
    (key: keyof MachineDefinition) =>
      !!standard && !sameValue(draft[key], standard[key]),
    [draft, standard],
  );
  const revert = React.useCallback(
    (key: keyof MachineDefinition) => {
      if (!standard) return;
      form.setField(key, standard[key]);
    },
    [form, standard],
  );

  const goto = (id: string) => {
    setActive(id as typeof active);
    const el = bodyRef.current?.querySelector(`#machine-section-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const warnings = draft.clinicalWarnings ?? [];
  const neverToFailure = draft.execution?.neverToFailure;

  return (
    <AdminScreen className="adm-me">
      <AdminHeader
        icon={<Dumbbell className="w-5 h-5" />}
        title={draft.name || "New machine"}
        subtitle={`${whose} · ${
          whole.gaps.length === 0
            ? "Every section filled in"
            : describeGaps(whole.gaps, 2)
        }`}
        actions={
          <>
            <AdminButton variant="quiet" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" /> {backLabel}
            </AdminButton>
            {/* One screen, two ways to look at it. An admin authoring the
                standard needs to see what the floor will read, and the read
                view is the same code a studio gets on a locked section — so
                the two cannot drift apart. */}
            <AdminButton
              variant="quiet"
              onClick={() => setReading((r) => !r)}
              aria-pressed={reading}
            >
              {reading ? (
                <>
                  <Pencil className="w-4 h-4" /> Edit
                </>
              ) : (
                <>
                  <BookOpen className="w-4 h-4" /> Read it as a trainer
                </>
              )}
            </AdminButton>
          </>
        }
      />

      {scope === "studio" && standard && (
        <AdminNotice tone="info">
          This is your studio&apos;s copy. The setup, the body-type adjustments and
          the dials are yours — change them to match the machine in your room.
          The musculature, the cadence and the cues are Max Strength&apos;s, and
          every location reads the same ones. Anything you leave alone keeps
          following the standard, so a correction from head office still reaches
          you.
        </AdminNotice>
      )}

      {/* Pinned, never inside a foldable section. A warning behind a tap,
          mid-set, is a worse failure than a longer page — the same rule
          MachineArticle follows on the reading side. */}
      {(warnings.length > 0 || neverToFailure) && (
        <AdminNotice tone={neverToFailure ? "alert" : "warn"}>
          {neverToFailure && (
            <strong>
              Never to failure.{" "}
              {draft.execution?.safetyNotice || "Stop the set while it is still controlled."}
            </strong>
          )}
          {warnings.length > 0 && (
            <ul className="adm-me__warnlist">
              {warnings.slice(0, 4).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
              {warnings.length > 4 && <li>and {warnings.length - 4} more</li>}
            </ul>
          )}
        </AdminNotice>
      )}

      <div className="adm-me__body">
        <nav className="adm-me__rail" aria-label="Sections of this machine">
          {states.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`adm-me__railbtn${active === s.id ? " adm-me__railbtn--on" : ""}`}
              onClick={() => goto(s.id)}
            >
              <span
                className={`adm-me__dot${
                  s.locked
                    ? " adm-me__dot--locked"
                    : s.gaps.length === 0
                      ? " adm-me__dot--done"
                      : s.done === 0
                        ? " adm-me__dot--empty"
                        : " adm-me__dot--part"
                }`}
                aria-hidden
              />
              <span className="adm-me__railname">{s.title}</span>
              <span className="adm-me__railcount">
                {s.locked ? (
                  <Lock className="w-3 h-3" />
                ) : s.gaps.length === 0 ? (
                  <Check className="w-3 h-3" />
                ) : (
                  `${s.done}/${s.total}`
                )}
              </span>
            </button>
          ))}
        </nav>

        <div className="adm-me__main" ref={bodyRef}>
          {states.map((s) => {
            const Body = SECTION_BODIES[s.id];
            const sectionReadOnly = reading || s.locked;
            const props: SectionProps = {
              value: draft,
              standard,
              set: (key, v) => form.setField(key, v),
              readOnly: sectionReadOnly,
              changed,
              revert,
            };
            return (
              <AdminPanel
                key={s.id}
                title={s.title}
                subtitle={s.blurb}
                icon={s.locked ? <Lock className="w-4 h-4" /> : undefined}
                actions={
                  s.locked ? (
                    <AdminBadge tone="neutral">Set by Max Strength</AdminBadge>
                  ) : s.gaps.length > 0 ? (
                    <AdminBadge tone="warn">{describeGaps(s.gaps, 1)}</AdminBadge>
                  ) : (
                    <AdminBadge tone="ok">Filled in</AdminBadge>
                  )
                }
              >
                <div id={`machine-section-${s.id}`} className="adm-me__section">
                  <Body {...props} />
                </div>
              </AdminPanel>
            );
          })}

          {unit && (
            <AdminPanel
              title="This unit"
              subtitle="The physical machine in your room — and a note for the people who use it."
            >
              {unit}
            </AdminPanel>
          )}
        </div>
      </div>

      <div className="adm-me__savebar">
        <SaveBar
          status={form.status}
          error={form.error}
          onSave={() => void form.save()}
          onDiscard={form.discard}
          saveLabel={isNew ? "Create this machine" : "Save changes"}
          idle={
            whole.gaps.length > 0 ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5" /> {describeGaps(whole.gaps, 2)}
              </>
            ) : undefined
          }
        />
      </div>
    </AdminScreen>
  );
}

/**
 * Which fields this scope actually owns, for a caller that wants to say so
 * before opening the editor ("you can change the setup and the dials").
 */
export function editableFieldsFor(scope: EditScope): (keyof MachineDefinition)[] {
  return SECTIONS.flatMap((s) => s.fields).filter((f) => canEdit(scope, f) && tierOf(f) !== "method");
}
