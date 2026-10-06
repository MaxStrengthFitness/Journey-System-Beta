import { useState, type ReactNode } from "react";
import {
  Activity,
  BookOpen,
  ClipboardList,
  Factory,
  History,
  Layers,
  MessageSquareQuote,
  OctagonAlert,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  Target,
  TrendingUp,
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
import { CATEGORY_LABEL, abbr as academyAbbr, categoryOf } from "../routine-builder/academy";
import { presetLine, type FlagLine, type Preset } from "./floor-index";
import { modelName, type MachineModel } from "./models";
import { floorNameHidesMovement, movementOf } from "./names";
import { outOfServiceLineOf } from "./out-of-service";
import type { CatalogMachine, RemovedSafetyShown } from "./types";
import "./catalog.css";

/** A line Find opened this page on: which part of the page, and the sentence. */
export interface FoundOnPage {
  section: string;
  text: string;
}

/**
 * The line above a machine's name (Catalog R1, the names). A unit keeps its
 * floor name as the title; the line above says which Academy movement it is
 * and its code — "LUMB · LUMBAR EXTENSION" over "LUMBAR" — or, when the floor
 * name already says the movement, the code and the Academy family ("LP ·
 * LOWER BODY" over "LEG PRESS"). A machine with no lineage keeps the movement
 * pattern it always showed.
 */
export function eyebrowFor(machine: CatalogMachine): string {
  const movement = movementOf(machine);
  if (!movement) return machine.movementPattern || "Equipment";
  const code = movement.code ?? academyAbbr(movement.id);
  if (floorNameHidesMovement(machine.name, movement.name)) {
    return [code, movement.name].filter(Boolean).join(" · ");
  }
  const family = categoryOf(movement.id);
  return [code, family ? CATEGORY_LABEL[family] : machine.movementPattern].filter(Boolean).join(" · ");
}

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
 *   on the page      the infobox, the never-to-failure rule, clinical
 *                    warnings, setup, execution, contraindications, the
 *                    studio's playbook. You opened this page to read these.
 *   folded away      how it's used, studio setup, studio notes. Tools you
 *                    occasionally operate, and each one is an editor.
 *
 * Two things are deliberately NOT collapsible under any circumstances:
 * clinical warnings (a warning behind a tap, mid-set, is a worse failure than
 * a longer page) and the musculature, which now lives in the infobox where it
 * sits beside the figure that draws it.
 *
 * The Upkeep foldable (cleaning, and a flag that never cleared) went in the
 * Machine Catalog round (Sep 28 2026): cleaning lives in Relay, and the
 * page reads Relay's flag (`flag`).
 *
 * THE COMPOSITION IS SLOTTED, NOT MOUNTED
 * ---------------------------------------
 * `playbook`, `studioSetup` and `figure` arrive as nodes from
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
  /** Find opened this page on a line inside it: said at the top of the page. */
  found?: FoundOnPage;
  /** The anatomy figure. See MachineFigure. */
  figure: ReactNode;
  /** Machines a trainer would look at next. Same pattern, then same category. */
  related: WikiChip[];
  onOpenMachine: (id: string) => void;
  academy?: MachineAcademyLinks;

  /**
   * Relay's flag on this unit (studios/{s}/machineCare, read only), said at the
   * top of the page in the caution plum. Null or absent: not flagged, or the
   * page is not a floor's (All MSF machines). Since the Machine Catalog round
   * (Sep 28 2026) the Catalog reads flags from Relay alone and counts no
   * cleaning of its own; the Upkeep card that did went with it.
   */
  flag?: FlagLine | null;
  /** This unit's preset — where its dials sit — for a floor's page. */
  preset?: Preset;
  /**
   * Which maker's model this unit is, for a floor's page (wave 2, Catalog
   * R4): a "Model" line in the box. Null or absent: nothing (never a guess).
   */
  model?: MachineModel | null;
  /**
   * A movement's models, for its page in All MSF machines (wave 2, Catalog
   * R4): a MovementModels, drawn under "Models" only when the host has any.
   */
  models?: ReactNode;

  /** Slotted cards, owned by features/studio-tasks. See the note above. */
  playbook?: ReactNode;
  studioSetup?: ReactNode;
  /**
   * The studio's notes on this machine — the floor's dated list since the
   * notes round (Oct 3 2026), which took over the studio's one wiki note
   * here and the Studio notes box that sat folded at the foot of the page.
   * Slotted rather than mounted for the same reason as the rest: it is
   * backed by one snapshot over the studio's notes, read once by the host.
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
  /** This studio's comments on the machine, at the foot of the page. */
  comments?: ReactNode;
  /**
   * How this machine is used across every MSF studio — a MachineTrendsPanel,
   * from features/machine-trends. Folded away and closed by default: it is a
   * look-up, not part of reading the page, and closed means the weekly
   * document is never read for a trainer who does not ask for it.
   */
  trends?: ReactNode;
  /**
   * What changed on the standard — a MachineChangeLog (catalog wave 3, Sep
   * 29 2026). Folded and closed by default like trends, and for the same
   * reason: the log is read when the fold is opened, never for a trainer who
   * did not ask. A studio's own machine has no standard, so no log.
   */
  changes?: ReactNode;

  /** Which foldables are open, persisted per section by the host. */
  isOpen: (id: string, fallback: boolean) => boolean;
  setOpen: (id: string, open: boolean) => void;
}

export function MachineArticle({
  machine,
  found,
  figure,
  related,
  onOpenMachine,
  academy,
  flag,
  preset,
  model,
  models,
  playbook,
  studioSetup,
  studioWiki,
  network,
  notice,
  extraBadges,
  comments,
  trends,
  changes,
  isOpen,
  setOpen,
}: MachineArticleProps) {
  const accent = accentForPattern(machine.movementPattern);

  const fold = (id: string, fallback: boolean) => ({
    open: isOpen(id, fallback),
    onToggle: (next: boolean) => setOpen(id, next),
  });

  /* The Academy's code used to be a sixth row here. It is on the line above
     the title now (eyebrowFor), beside the movement's name, so the box says
     it once (Catalog R1: AJ asked for less text). */
  const facts = [
    // A floor's page leads with where this unit's dials sit (Catalog R2).
    ...(preset
      ? [{ label: "Preset", icon: <SlidersHorizontal size={11} aria-hidden />, value: presetLine(preset) }]
      : []),
    // Which maker's model the unit is (wave 2, Catalog R4), where it is known.
    ...(model ? [{ label: "Model", icon: <Factory size={11} aria-hidden />, value: modelName(model) }] : []),
    { label: "Class", icon: <Activity size={11} aria-hidden />, value: machine.kinematicClassification },
    { label: "Posture", icon: <Target size={11} aria-hidden />, value: machine.executionPosture },
    { label: "Setup", icon: <Settings2 size={11} aria-hidden />, value: machine.setupGap },
    { label: "Handoff", icon: <Users size={11} aria-hidden />, value: machine.requiresHandoff ? "Required" : "None" },
    { label: "Region", icon: <Layers size={11} aria-hidden />, value: machine.anatomicalRegion },
  ];

  const foundLine = found ? (
    <p className="mcat-found" role="status">
      <span className="mcat-found__where">Found on this page · {found.section}</span>
      <span className="mcat-found__text">{found.text}</span>
    </p>
  ) : null;

  /* Out of service, whole: why, who said so and when, and where it goes back
     in (wave 2, Sep 28 2026). Only on a unit that IS out of service; one set
     out of service before reasons existed keeps just its badge. */
  const oos =
    machine.rosterStatus === "maintenance" && machine.outOfService
      ? outOfServiceLineOf(machine.outOfService)
      : null;
  const oosLine = oos ? (
    <p className="mcat-oos" role="status">
      <span className="mcat-oos__who">
        Out of service · {oos.who}
        {oos.when ? ` · ${oos.when}` : ""}
      </span>
      <span className="mcat-oos__note">{oos.reason}</span>
      <span className="mcat-oos__where">Back in service is on My Studio → Machines.</span>
    </p>
  ) : null;

  /* Relay's flag, whole: who, when and what, and where it is cleared. */
  const flagLine = flag ? (
    <p className="mcat-flag" role="status">
      <span className="mcat-flag__who">
        Flagged by {flag.who}
        {flag.when ? ` · ${flag.when}` : ""}
      </span>
      {flag.note && <span className="mcat-flag__note">{flag.note}</span>}
      <span className="mcat-flag__where">Cleared on My Studio → Relay.</span>
    </p>
  ) : null;

  const hasSetup = Boolean(machine.setup) || machine.setupCues.length > 0;
  const hasExecution = Boolean(machine.execution) || machine.executionCues.length > 0;
  const hasAcademy = Boolean(
    academy && (academy.onOpenCard || academy.onOpenScript || academy.onOpenOverview),
  );

  return (
    <WikiArticle
      eyebrow={eyebrowFor(machine)}
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
          {/* A flag is a caution: the app's plum, as "Out of service" is.
              Crimson is a Critical note's and a set's that needs work. */}
          {flag && <WikiBadge tone="warn">Flagged</WikiBadge>}
        </>
      }
      notice={
        foundLine || oosLine || flagLine || notice ? (
          <>
            {foundLine}
            {oosLine}
            {flagLine}
            {notice}
          </>
        ) : undefined
      }
      aside={
        <Infobox title="At a glance" figure={figure}>
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
      {/* The Academy's never-to-failure rule, first and never folded: it is a
          stop rule, not a tip (Catalog R2). Its reason is the Academy's own
          sentence; an unexplained prohibition gets ignored (the-floor.md). */}
      {machine.neverToFailure && (
        <section className="mcat-ntf" aria-labelledby="mcat-ntf-head">
          <h2 className="mcat-ntf__head" id="mcat-ntf-head">
            <OctagonAlert size={14} aria-hidden />
            Never to failure
          </h2>
          <p className="mcat-ntf__text">
            {machine.safetyNotice || "The Academy says never to take this machine to failure."}
          </p>
        </section>
      )}

      <ClinicalWarnings
        warnings={machine.clinicalWarnings}
        removed={removedOn(machine, "clinicalWarnings")}
      />

      {/* The catalog's other safety lines this unit does without (stop
          rules, watch-outs, sequencing, alignment checkpoints): crossed out
          and faded with the studio's reason, never hidden (Oct 2 2026). */}
      {removedElsewhere(machine).length > 0 && (
        <section className="mcat-removed" aria-labelledby="mcat-removed-head">
          <h2 className="mcat-removed__head" id="mcat-removed-head">
            Max Strength&apos;s safety lines this unit does without
          </h2>
          <RemovedLines lines={removedElsewhere(machine)} withList />
        </section>
      )}

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

      {(machine.contraindicatedFor.length > 0 || removedOn(machine, "contraindicatedFor").length > 0) && (
        /* On the page, not folded. This is who should NOT be on the machine;
           it belongs with the warnings, not with the tools. A line the studio
           took off its copy stays, crossed out, with the studio's reason. */
        <WikiSection
          id="contraindications"
          title="Contraindicated for"
          icon={<Users size={13} aria-hidden />}
        >
          {machine.contraindicatedFor.length > 0 && <WikiCues items={machine.contraindicatedFor} />}
          <RemovedLines lines={removedOn(machine, "contraindicatedFor")} />
        </WikiSection>
      )}

      {/* A movement's models (wave 2, Catalog R4): each maker's machine for
          it, on its All MSF page, once the model records exist. */}
      {models && (
        <WikiSection id="models" title="Models" icon={<Factory size={13} aria-hidden />}>
          {models}
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
              detail="Muscles, setup, posture, turnarounds."
              onClick={academy.onOpenCard}
            />
          )}
          {academy?.onOpenScript && (
            <WikiLinkCard
              accent={accent}
              icon={<MessageSquareQuote size={16} aria-hidden />}
              title="Full spoken script"
              detail="Word for word, setup to the last rep."
              onClick={academy.onOpenScript}
            />
          )}
          {academy?.onOpenOverview && (
            <WikiLinkCard
              accent={accent}
              icon={<Layers size={16} aria-hidden />}
              title="Deep dive"
              detail="The complete write-up."
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

      {trends && (
        <WikiFoldable
          id="trends"
          title="How it's used"
          icon={<TrendingUp size={13} aria-hidden />}
          {...fold("trends", false)}
        >
          {trends}
        </WikiFoldable>
      )}

      {changes && (
        <WikiFoldable
          id="changes"
          title="What changed"
          icon={<History size={13} aria-hidden />}
          {...fold("changes", false)}
        >
          {changes}
        </WikiFoldable>
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

      {comments}
    </WikiArticle>
  );
}

/* ------------------------------------------------------------------ *
 * Clinical warnings
 * ------------------------------------------------------------------ */

const MAX_VISIBLE = 4;

/**
 * Never collapsible, and never inside a <WikiSection> either — it gets its own
 * caution card (plum) directly under the header so it reads before anything
 * else.
 *
 * The one concession to length: past MAX_VISIBLE the rest disclose behind a
 * count. The FIRST ones are never hidden, so the trade is "some warnings need
 * a tap" rather than "the warning section needs a tap".
 */
/* ── a safety line a studio took off its copy (Oct 2 2026) ─────────── */

/** The lists the page draws as lists of their own; the rest share one block. */
const DRAWN_IN_PLACE = new Set(["clinicalWarnings", "contraindicatedFor"]);

const SAFETY_LIST_NAME: Record<string, string> = {
  clinicalWarnings: "Clinical warning",
  contraindicatedFor: "Contraindicated for",
  sequencingContraindications: "Sequencing",
  alignmentCheckpoints: "Alignment checkpoint",
  stopRules: "Stop rule",
  watchOuts: "Watch-out",
};

function removedOn(machine: CatalogMachine, field: string): RemovedSafetyShown[] {
  return (machine.removedSafety ?? []).filter((r) => r.field === field);
}

function removedElsewhere(machine: CatalogMachine): RemovedSafetyShown[] {
  return (machine.removedSafety ?? []).filter((r) => !DRAWN_IN_PLACE.has(r.field));
}

/** "4 Oct 2026", from an ISO time; "" when it can't be read. */
function removedWhen(at: string): string {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "America/New_York" });
}

/**
 * Max Strength's line, struck through in the faded ink, and under it the
 * studio's reason and who took it off. Shown, never hidden: a trainer reading
 * this unit sees what the standard says and why this floor does otherwise.
 */
export function RemovedLines({ lines, withList = false }: { lines: RemovedSafetyShown[]; withList?: boolean }) {
  if (lines.length === 0) return null;
  return (
    <ul className="mcat-removed__list">
      {lines.map((r) => {
        const when = removedWhen(r.at);
        const who = [r.by, when].filter(Boolean).join(", ");
        return (
          <li key={`${r.field}|${r.line}`} className="mcat-removed__item" data-testid="removed-safety-line">
            {withList && <span className="mcat-removed__list-name">{SAFETY_LIST_NAME[r.field] ?? "Safety line"}</span>}
            <s className="mcat-removed__line">{r.line}</s>
            <span className="mcat-removed__why">
              Taken off this unit: {r.reason}
              {who ? ` (${who})` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ClinicalWarnings({ warnings, removed = [] }: { warnings: string[]; removed?: RemovedSafetyShown[] }) {
  const [expanded, setExpanded] = useState(false);
  if (warnings.length === 0 && removed.length === 0) return null;

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
      {/* Never folded away with the rest: a line this unit does without is
          the one a trainer most needs to see is missing. */}
      <RemovedLines lines={removed} />
    </section>
  );
}
