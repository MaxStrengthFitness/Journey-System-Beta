import {
  Activity,
  Settings2,
  Target,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { ClinicalWarnings } from "./ClinicalWarnings";
import { Section } from "./Section";
import { StudioNotesCard } from "./StudioNotesCard";
import type { CatalogMachine } from "./types";

/**
 * Everything known about the selected machine.
 *
 * ONE component for both layouts. The view this replaces carried two nearly
 * identical copies of this markup — one in the landscape aside, one in the
 * portrait overlay — which had already drifted: different colour values for the
 * same token, a line-clamp on one clinical note and not the other, and a
 * max-h-[50vh] scroll box on the portrait copy alone. Fixing anything meant
 * finding both.
 *
 * Nothing in here scrolls. The pane that hosts it does, in split mode; in stack
 * mode the catalog root does. That is the whole of the nested-scrolling fix.
 */
export interface MachineDetailProps {
  machine: CatalogMachine;
  studioId: string | null;
  studioName?: string;
  author?: { id: string; name: string } | null;
}

export function MachineDetail({
  machine,
  studioId,
  studioName,
  author,
}: MachineDetailProps) {
  const specs = [
    {
      label: "Class",
      icon: <Activity size={12} aria-hidden />,
      value: machine.kinematicClassification || "—",
    },
    {
      label: "Posture",
      icon: <Target size={12} aria-hidden />,
      value: machine.executionPosture || "—",
    },
    {
      label: "Setup",
      icon: <Settings2 size={12} aria-hidden />,
      value: machine.setupGap || "—",
    },
    {
      label: "Handoff",
      icon: <Users size={12} aria-hidden />,
      value: machine.requiresHandoff ? "Required" : "None",
    },
  ];

  const hasMusculature =
    machine.targetMuscles.length > 0 || machine.synergists.length > 0;

  return (
    <div className="cat__detail">
      <header className="cat__detail-head">
        <span className="cat__eyebrow">{machine.movementPattern}</span>
        <h2 className="cat__title">{machine.name}</h2>
        {machine.clinicalNote && (
          <p className="cat__note">{machine.clinicalNote}</p>
        )}
      </header>

      <div className="cat__detail-body">
        <div className="cat__specs">
          {specs.map((s) => (
            <div className="cat__spec" key={s.label}>
              <div className="cat__spec-label">
                {s.icon}
                {s.label}
              </div>
              <div className="cat__spec-value">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Never collapsible — see ClinicalWarnings.tsx. */}
        <ClinicalWarnings warnings={machine.clinicalWarnings} />

        {machine.setup || machine.setupCues.length > 0 ? (
          <Section
            id="setup"
            title="Setup notes"
            icon={<Wrench size={14} aria-hidden />}
            count={machine.setupCues.length}
            defaultOpen
          >
            {machine.setup && <p className="cat__prose">{machine.setup}</p>}
            {machine.setupCues.length > 0 && (
              <ul className="cat__cues">
                {machine.setupCues.map((cue, i) => (
                  <li key={i}>{cue}</li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        {machine.execution || machine.executionCues.length > 0 ? (
          <Section
            id="execution"
            title="Execution"
            icon={<Activity size={14} aria-hidden />}
            count={machine.executionCues.length}
            defaultOpen
          >
            {machine.execution && (
              <p className="cat__prose">{machine.execution}</p>
            )}
            {machine.executionCues.length > 0 && (
              <ul className="cat__cues">
                {machine.executionCues.map((cue, i) => (
                  <li key={i}>{cue}</li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        {hasMusculature && (
          <Section
            id="musculature"
            title="Musculature"
            icon={<Target size={14} aria-hidden />}
            count={machine.targetMuscles.length + machine.synergists.length}
          >
            <div className="cat__muscles">
              {machine.targetMuscles.map((m, i) => (
                <div className="cat__muscle cat__muscle--primary" key={`t${i}`}>
                  <span className="cat__muscle-dot" aria-hidden />
                  <span>{m}</span>
                  <span className="cat__muscle-role">Primary</span>
                </div>
              ))}
              {machine.synergists.map((m, i) => (
                <div
                  className="cat__muscle cat__muscle--synergist"
                  key={`s${i}`}
                >
                  <span className="cat__muscle-dot" aria-hidden />
                  <span>{m}</span>
                  <span className="cat__muscle-role">Synergist</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {machine.contraindicatedFor.length > 0 && (
          <Section
            id="contraindications"
            title="Contraindicated for"
            icon={<Users size={14} aria-hidden />}
            count={machine.contraindicatedFor.length}
          >
            <ul className="cat__cues">
              {machine.contraindicatedFor.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </Section>
        )}

        <Section
          id="studio-notes"
          title="Studio notes"
          icon={<UserCog size={14} aria-hidden />}
          defaultOpen={Boolean(machine.studioNotes)}
        >
          <StudioNotesCard
            machineId={machine.id}
            studioId={studioId}
            studioName={studioName}
            value={machine.studioNotes}
            author={author}
          />
        </Section>
      </div>
    </div>
  );
}
