import { useState, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  ClipboardList,
  Layers,
  MessageSquareQuote,
  Settings2,
  ShieldAlert,
  Sparkles,
  Target,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import {
  Infobox,
  InfoboxGroup,
  InfoboxMuscles,
  InfoboxRows,
  WikiArticle,
  WikiBadge,
  WikiChips,
  WikiCues,
  WikiFoldable,
  WikiLinkCard,
  WikiProse,
  WikiSection,
  WikiSeeAlso,
  accentForPattern,
  type WikiChip,
} from "../wiki";
import { abbr as academyAbbr } from "../routine-builder/academy";
import type { UpkeepStatus } from "../admin/upkeep/upkeepLog";
import type { CatalogMachine } from "./types";

/**
 * A MACHINE PAGE.
 *
 * Round: Wiki Redesign, Sep 2026. Replaces MachineDetail.
 *
 * WHAT CHANGED, AND WHY
 * ---------------------
 * MachineDetail put NINE collapsible sections in a column. Every one of them
 * could be shut, and `useSectionState` remembered that across machines — so a
 * trainer who closed "Execution" once saw an empty-looking page on all
 * twenty-two machines forever. A stack of closed drawers is the shape of a
 * settings screen, which is precisely why this screen "didn't match" the Hub
 * and the client profile.
 *
 * The rule here is READING versus DOING:
 *
 *   on the page      the infobox, clinical warnings, setup, execution,
 *                    contraindications, the studio's playbook. You opened
 *                    this page to read these.
 *   folded away      upkeep, studio setup, studio notes. Tools you
 *                    occasionally operate, and each one is an editor.
 *
 * Two things are deliberately NOT collapsible under any circumstances:
 * clinical warnings (a warning behind a tap, mid-set, is a worse failure than
 * a longer page) and the musculature, which now lives in the infobox where it
 * sits beside the figure that draws it.
 *
 * THE COMPOSITION IS SLOTTED, NOT MOUNTED
 * ---------------------------------------
 * `upkeep`, `playbook`, `studioSetup` and `figure` arrive as nodes from
 * CatalogWikiView for the same reason they did before: each is backed by a
 * Firestore snapshot over the whole studio, and mounting them here would tear
 * down and rebuild those listeners on every tap in the index.
 */

export interface MachineAcademyLinks {
  /** The quick reference card, if the corpus has one for this machine. */
  onOpenCard?: () => void;
  /** The full spoken script, word for word. */
  onOpenScript?: () => void;
  /** The comprehensive equipment write-up. */
  onOpenOverview?: () => void;
}

export interface MachineArticleProps {
  machine: CatalogMachine;
  /** The anatomy figure. See MachineFigure. */
  figure: ReactNode;
  /** Machines a trainer would look at next. Same pattern, then same category. */
  related: WikiChip[];
  onOpenMachine: (id: string) => void;
  academy?: MachineAcademyLinks;

  isFlagged?: boolean;
  upkeepStatus?: UpkeepStatus;

  /** Slotted cards, owned by features/studio-tasks. See the note above. */
  upkeep?: ReactNode;
  playbook?: ReactNode;
  studioSetup?: ReactNode;
  studioNotes?: ReactNode;
  /**
   * This studio's own wiki note on this machine — a StudioWikiPanel. Slotted
   * rather than mounted for the same reason as the rest: it is backed by one
   * snapshot over the studio's whole wiki collection, read once by the host.
   */
  studioWiki?: ReactNode;
  /**
   * What other MSF studios shared about this machine — a NetworkNotes, from
   * features/machine-db. Directly after this studio's own note, which is the
   * same kind of writing from nearer home.
   */
  network?: ReactNode;
  /**
   * A card above everything else: in the MSF machine database, whether this
   * studio has the machine and the way to add it; on a studio's own machine,
   * the switch that lists it in the database.
   */
  notice?: ReactNode;
  /** Badges the host adds — "Shared by Solon", "On your floor". */
  extraBadges?: ReactNode;

  /** Which foldables are open, persisted per section by the host. */
  isOpen: (id: string, fallback: boolean) => boolean;
  setOpen: (id: string, open: boolean) => void;
}

export function MachineArticle({
  machine,
  figure,
  related,
  onOpenMachine,
  academy,
  isFlagged,
  upkeepStatus,
  upkeep,
  playbook,
  studioSetup,
  studioNotes,
  studioWiki,
  network,
  notice,
  extraBadges,
  isOpen,
  setOpen,
}: MachineArticleProps) {
  const accent = accentForPattern(machine.movementPattern);
  const code = academyAbbr(machine.id);

  const fold = (id: string, fallback: boolean) => ({
    open: isOpen(id, fallback),
    onToggle: (next: boolean) => setOpen(id, next),
  });

  const facts = [
    { label: "Class", icon: <Activity size={11} aria-hidden />, value: machine.kinematicClassification },
    { label: "Posture", icon: <Target size={11} aria-hidden />, value: machine.executionPosture },
    { label: "Setup", icon: <Settings2 size={11} aria-hidden />, value: machine.setupGap },
    { label: "Handoff", icon: <Users size={11} aria-hidden />, value: machine.requiresHandoff ? "Required" : "None" },
    { label: "Region", icon: <Layers size={11} aria-hidden />, value: machine.anatomicalRegion },
  ];
  /* The Academy's own two- or three-letter code for this machine ("ADD, SD,
     CR, TR, OH" is how a sequence is written in the curriculum). Only shown
     when the corpus actually has one, because an invented code would be read
     as authoritative. */
  if (code) {
    facts.push({ label: "Academy", icon: <BookOpen size={11} aria-hidden />, value: code });
  }

  const hasSetup = Boolean(machine.setup) || machine.setupCues.length > 0;
  const hasExecution = Boolean(machine.execution) || machine.executionCues.length > 0;
  const hasAcademy = Boolean(
    academy && (academy.onOpenCard || academy.onOpenScript || academy.onOpenOverview),
  );

  return (
    <WikiArticle
      eyebrow={machine.movementPattern || "Equipment"}
      accent={accent}
      title={machine.name}
      lede={machine.clinicalNote || undefined}
      badges={
        <>
          {machine.isStudioCustom && (
            <WikiBadge tone="neutral">
              {machine.adoptedFrom ? `Copied from ${machine.adoptedFrom.studioName}` : "Added by this studio"}
            </WikiBadge>
          )}
          {machine.shared && <WikiBadge tone="live">Shared with all MSF studios</WikiBadge>}
          {extraBadges}
          {machine.rosterStatus === "maintenance" && <WikiBadge tone="warn">Out of service</WikiBadge>}
          {machine.rosterStatus === "inactive" && <WikiBadge tone="neutral">Inactive</WikiBadge>}
          {isFlagged && <WikiBadge tone="alert">Flagged by a trainer</WikiBadge>}
          {(upkeepStatus === "due" || upkeepStatus === "overdue") && (
            <WikiBadge tone="warn">
              {upkeepStatus === "overdue" ? "Cleaning overdue" : "Cleaning due"}
            </WikiBadge>
          )}
        </>
      }
      notice={notice}
      aside={
        <Infobox
          title="At a glance"
          figure={figure}
          footer={
            isFlagged || upkeepStatus === "overdue" || upkeepStatus === "due" ? (
              <>
                {isFlagged && <WikiBadge tone="alert">Flagged — see Upkeep</WikiBadge>}
                {(upkeepStatus === "due" || upkeepStatus === "overdue") && (
                  <WikiBadge tone="warn">
                    {upkeepStatus === "overdue" ? "Overdue" : "Due"}
                  </WikiBadge>
                )}
              </>
            ) : undefined
          }
        >
          <InfoboxGroup label="Specification">
            <InfoboxRows rows={facts} />
          </InfoboxGroup>

          {(machine.targetMuscles.length > 0 || machine.synergists.length > 0) && (
            <InfoboxGroup label="Musculature">
              <InfoboxMuscles
                primary={machine.targetMuscles}
                synergists={machine.synergists}
              />
            </InfoboxGroup>
          )}
        </Infobox>
      }
    >
      <ClinicalWarnings warnings={machine.clinicalWarnings} />

      {hasSetup && (
        <WikiSection id="setup" title="Setup" icon={<Wrench size={13} aria-hidden />}>
          {machine.setup && <WikiProse>{machine.setup}</WikiProse>}
          <WikiCues items={machine.setupCues} />
        </WikiSection>
      )}

      {hasExecution && (
        <WikiSection id="execution" title="Execution" icon={<Activity size={13} aria-hidden />}>
          {machine.execution && <WikiProse>{machine.execution}</WikiProse>}
          <WikiCues items={machine.executionCues} />
        </WikiSection>
      )}

      {machine.contraindicatedFor.length > 0 && (
        /* On the page, not folded. This is who should NOT be on the machine;
           it belongs with the warnings, not with the tools. */
        <WikiSection
          id="contraindications"
          title="Contraindicated for"
          icon={<Users size={13} aria-hidden />}
        >
          <WikiCues items={machine.contraindicatedFor} />
        </WikiSection>
      )}

      {/* Only rendered when the studio has actually written something about
          this machine — an empty "Playbook" is a standing reproach that
          teaches trainers the section is never worth opening. */}
      {playbook && (
        <WikiSection
          id="playbook"
          title="From this studio's playbook"
          icon={<BookOpen size={13} aria-hidden />}
          note="What worked here before, written by the trainers who found it."
        >
          {playbook}
        </WikiSection>
      )}

      {/*
        On the page, never folded, and directly under the shipped material it
        annotates. A studio's "ours sits two notches lower than the card says"
        is the single most consequential sentence on this screen, and putting
        it behind a disclosure control would be the same mistake the nine
        collapsibles were.
      */}
      {studioWiki}

      {network}

      {hasAcademy && (
        <WikiSeeAlso title="In the MSF Academy">
          {academy?.onOpenCard && (
            <WikiLinkCard
              accent={accent}
              icon={<ClipboardList size={16} aria-hidden />}
              title="Quick reference card"
              detail="Written to be read standing at the machine — target muscles, setup, posture, turnarounds."
              onClick={academy.onOpenCard}
            />
          )}
          {academy?.onOpenScript && (
            <WikiLinkCard
              accent={accent}
              icon={<MessageSquareQuote size={16} aria-hidden />}
              title="Full spoken script"
              detail="Word for word, setup through the last rep."
              onClick={academy.onOpenScript}
            />
          )}
          {academy?.onOpenOverview && (
            <WikiLinkCard
              accent={accent}
              icon={<Layers size={16} aria-hidden />}
              title="Deep dive"
              detail="The complete write-up — everything a practitioner holds before training anyone on it."
              onClick={academy.onOpenOverview}
            />
          )}
        </WikiSeeAlso>
      )}

      {related.length > 0 && (
        <WikiSeeAlso title="Related machines">
          <WikiChips items={related} onPick={onOpenMachine} />
        </WikiSeeAlso>
      )}

      {studioSetup && (
        <WikiFoldable
          id="studio-setup"
          title="Studio setup"
          icon={<Settings2 size={13} aria-hidden />}
          {...fold("studio-setup", false)}
        >
          {studioSetup}
        </WikiFoldable>
      )}

      {upkeep && (
        <WikiFoldable
          id="upkeep"
          title="Upkeep"
          icon={<Sparkles size={13} aria-hidden />}
          meta={isFlagged ? "Flagged" : undefined}
          /* Opens itself when something is wrong, and only then. */
          {...fold("upkeep", Boolean(isFlagged) || upkeepStatus === "overdue")}
        >
          {upkeep}
        </WikiFoldable>
      )}

      {studioNotes && (
        <WikiFoldable
          id="studio-notes"
          title="Studio notes"
          icon={<UserCog size={13} aria-hidden />}
          {...fold("studio-notes", Boolean(machine.studioNotes))}
        >
          {studioNotes}
        </WikiFoldable>
      )}
    </WikiArticle>
  );
}

/* ------------------------------------------------------------------ *
 * Clinical warnings
 * ------------------------------------------------------------------ */

const MAX_VISIBLE = 4;

/**
 * Never collapsible, and never inside a <WikiSection> either — it gets its own
 * amber card directly under the header so it reads before anything else.
 *
 * The one concession to length: past MAX_VISIBLE the rest disclose behind a
 * count. The FIRST ones are never hidden, so the trade is "some warnings need
 * a tap" rather than "the warning section needs a tap".
 */
function ClinicalWarnings({ warnings }: { warnings: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (warnings.length === 0) return null;

  const visible = expanded ? warnings : warnings.slice(0, MAX_VISIBLE);
  const hidden = warnings.length - visible.length;

  return (
    <section className="wk__warnings" aria-labelledby="wk-warnings-head">
      <h2 className="wk__warnings-head" id="wk-warnings-head">
        <ShieldAlert size={14} aria-hidden />
        Clinical warnings
      </h2>
      <ul className="wk__warnings-list">
        {visible.map((w, i) => (
          <li key={`${i}-${w.slice(0, 12)}`}>{w}</li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="wk__warnings-more"
          onClick={() => setExpanded(true)}
        >
          Show {hidden} more
        </button>
      )}
      {expanded && warnings.length > MAX_VISIBLE && (
        <button
          type="button"
          className="wk__warnings-more"
          onClick={() => setExpanded(false)}
        >
          Show fewer
        </button>
      )}
    </section>
  );
}
