import { useMemo } from "react";
import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  Database,
  GraduationCap,
  MessageSquareQuote,
  Plus,
  Search,
  Sparkles,
  Type,
} from "lucide-react";
import type { Machine } from "../../types";
import { useActiveStudio } from "../../ActiveStudioContext";
import {
  ACCENT_ICON,
  PAGE_SECTION_LABEL,
  WikiBadge,
  WikiGroup,
  WikiLinkCard,
  WikiRow,
  WikiShell,
  accentStyle,
  useStudioWiki,
} from "../wiki";
import { useCatalogMachines } from "../catalog/useCatalogMachines";
import { dayKey, upkeepByMachine, upkeepEventsFrom } from "../catalog/grouping";
import { useMachineUpkeep } from "../studio-tasks/useMachineUpkeep";
import { ACADEMY_INDEX } from "../academy/useAcademyContent";
import type { AcademyGroupKey } from "../academy/AcademyWikiView";
import {
  academyFacts,
  floorStatus,
  homeCategoryTiles,
  plural,
  readingTime,
  recentPages,
} from "./home";
import type { LearningRef } from "./ref";

/**
 * THE LEARNING FRONT PAGE.
 *
 * Round: Learning + Planner, Sep 2026. The decisions are in ./home.ts; this
 * file only lays them out.
 *
 * Top to bottom, in the order a reference site answers questions:
 *   search            the reader who knows what they want
 *   the catalog       every category, every machine in it, visible at once
 *   the Academy       its four ways in, and where a newcomer should start
 *   written here      what this studio has added
 *
 * Every machine name on this page is a link to its article, so the front
 * page is also the fastest route to any machine: one tap, no index between.
 */

export interface LearningHomeProps {
  /** The global machine list, for a studio whose roster is still empty. */
  machines: Machine[];
  canWritePages: boolean;
  onOpen: (ref: LearningRef) => void;
  onOpenSearch: () => void;
  onOpenCatalog: (groupKey?: string) => void;
  /** The Catalog's other scope: every MSF machine (features/machine-db). */
  onOpenDatabase?: () => void;
  onOpenAcademy: (group?: AcademyGroupKey) => void;
  onNewPage: () => void;
}

export function LearningHome({
  machines,
  canWritePages,
  onOpen,
  onOpenSearch,
  onOpenCatalog,
  onOpenDatabase,
  onOpenAcademy,
  onNewPage,
}: LearningHomeProps) {
  const { activeStudioId, activeStudio } = useActiveStudio();
  const studioName = activeStudio?.name ?? "This studio";

  const { machines: catalog } = useCatalogMachines(activeStudioId, machines);
  const { byMachineId: upkeepById } = useMachineUpkeep(activeStudioId);
  const { pages } = useStudioWiki(activeStudioId);

  const tiles = useMemo(() => homeCategoryTiles(catalog), [catalog]);
  const status = useMemo(() => {
    const statusById = upkeepByMachine(catalog, upkeepEventsFrom(upkeepById), dayKey());
    const flagged = new Set(
      Object.keys(upkeepById).filter((id) => upkeepById[id]?.flagged),
    );
    return floorStatus(catalog, statusById, flagged);
  }, [catalog, upkeepById]);
  const facts = useMemo(() => academyFacts(ACADEMY_INDEX), []);
  const recent = useMemo(() => recentPages(pages, 5), [pages]);

  return (
    <WikiShell crumbs={[{ label: "Overview" }]}>
      {/* ── the masthead's big brother: what this is, and search ───── */}
      <section className="lh__hero" aria-labelledby="lh-title">
        <p className="lh__eyebrow">Max Strength Fitness</p>
        <h1 className="lh__title" id="lh-title">
          MSF Learning
        </h1>
        <p className="lh__lede">
          The reference for every machine on {studioName}'s floor and every page
          of the MSF Academy — and for what {studioName} has written for itself.
        </p>

        <button type="button" className="lh__search" onClick={onOpenSearch}>
          <Search size={17} aria-hidden />
          <span className="lh__search-label">
            Search machines, muscles, topics or terms
          </span>
          <span className="lh__search-eg" aria-hidden>
            CP · glute · turnaround
          </span>
        </button>

        <ul className="lh__facts" aria-label="What is in Learning">
          <li>
            <strong>{catalog.length}</strong> {catalog.length === 1 ? "machine" : "machines"} at{" "}
            {studioName}
          </li>
          <li>
            <strong>{facts.modules}</strong> Academy modules
          </li>
          <li>
            <strong>{facts.topics}</strong> topics · {readingTime(facts.minutes)}
          </li>
          <li>
            <strong>{facts.glossary}</strong> glossary terms
          </li>
          <li>
            <strong>{pages.length}</strong> {pages.length === 1 ? "page" : "pages"} written here
          </li>
        </ul>
      </section>

      {/* ── the catalog: every category with its machines showing ────── */}
      <section className="lh__section" aria-labelledby="lh-catalog">
        <header className="lh__section-head">
          <div className="lh__section-titles">
            <p className="lh__kicker">Catalog</p>
            <h2 className="lh__h2" id="lh-catalog">
              Machines at {studioName}
            </h2>
          </div>
          <button type="button" className="lh__more" onClick={() => onOpenCatalog()}>
            Open the catalog
            <ChevronRight size={15} aria-hidden />
          </button>
        </header>

        {(status.flagged > 0 || status.outOfService > 0 || status.due > 0) && (
          <button
            type="button"
            className="lh__status"
            onClick={() => onOpenCatalog()}
            aria-label="Machines that need attention — open the catalog"
          >
            <span className="lh__status-label">On the floor today</span>
            {status.flagged > 0 && (
              <WikiBadge tone="alert">{plural(status.flagged, "flagged", "flagged")}</WikiBadge>
            )}
            {status.outOfService > 0 && (
              <WikiBadge tone="warn">{status.outOfService} out of service</WikiBadge>
            )}
            {status.due > 0 && (
              <WikiBadge tone="warn">{status.due} due for cleaning</WikiBadge>
            )}
          </button>
        )}

        {tiles.length === 0 ? (
          <p className="wk__empty">
            No machines at {studioName} yet. A studio leader adds them from Hub →
            Machine Settings.
          </p>
        ) : (
          <div className="lh__tiles">
            {tiles.map((t) => {
              const Icon = ACCENT_ICON[t.accent];
              return (
                <article className="lh__tile" key={t.key} style={accentStyle(t.accent)}>
                  <button
                    type="button"
                    className="lh__tile-head"
                    onClick={() => onOpenCatalog(t.key)}
                  >
                    <span className="wk__cat-icon">
                      <Icon size={18} aria-hidden />
                    </span>
                    <span className="lh__tile-titles">
                      <span className="lh__tile-label">{t.label}</span>
                      <span className="lh__tile-count">{plural(t.machines.length, "machine")}</span>
                    </span>
                    <ChevronRight size={16} className="lh__tile-go" aria-hidden />
                  </button>
                  <ul className="lh__tile-list">
                    {t.machines.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          className="lh__machine"
                          onClick={() => onOpen({ kind: "machine", id: m.id })}
                        >
                          <span className="wk__row-code" aria-hidden>
                            {m.code ?? "—"}
                          </span>
                          <span className="lh__machine-name">{m.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        )}

        {onOpenDatabase && (
          <div className="lh__links lh__links--one">
            <WikiLinkCard
              accent="other"
              icon={<Database size={16} aria-hidden />}
              title="All MSF machines"
              detail={`Every machine in the MSF catalog, and the ones studios have made and shared — with what other studios wrote about each. Add one to ${studioName}'s floor from its page.`}
              onClick={onOpenDatabase}
            />
          </div>
        )}
      </section>

      {/* ── the Academy: its ways in, and where to start ─────────────── */}
      <section className="lh__section" aria-labelledby="lh-academy">
        <header className="lh__section-head">
          <div className="lh__section-titles">
            <p className="lh__kicker">Academy</p>
            <h2 className="lh__h2" id="lh-academy">
              The MSF method
            </h2>
          </div>
          <button type="button" className="lh__more" onClick={() => onOpenAcademy()}>
            Open the Academy
            <ChevronRight size={15} aria-hidden />
          </button>
        </header>

        <div className="lh__links">
          <WikiLinkCard
            accent="push"
            icon={<ClipboardList size={16} aria-hidden />}
            title="By machine"
            detail={`${plural(facts.cards, "quick card")} and ${plural(facts.scripts, "spoken script")} — the thirty-second version, standing at the machine.`}
            onClick={() => onOpenAcademy("machines")}
          />
          <WikiLinkCard
            accent="pull"
            icon={<GraduationCap size={16} aria-hidden />}
            title="Curriculum"
            detail={`${plural(facts.modules, "module")}, ${plural(facts.topics, "topic")} — ${readingTime(facts.minutes)} of reading, in teaching order.`}
            onClick={() => onOpenAcademy("curriculum")}
          />
          <WikiLinkCard
            accent="posterior"
            icon={<MessageSquareQuote size={16} aria-hidden />}
            title="Cueing phrasebook"
            detail="What to say, grouped by the moment in the set."
            onClick={() => onOpen({ kind: "academy-cueing" })}
          />
          <WikiLinkCard
            accent="posterior"
            icon={<Type size={16} aria-hidden />}
            title="Glossary"
            detail={`${plural(facts.glossary, "term")} — the exact words the Academy asks trainers to use.`}
            onClick={() => onOpen({ kind: "academy-glossary" })}
          />
        </div>

        <button
          type="button"
          className="lh__start"
          onClick={() => onOpen({ kind: "academy-module", id: "summary" })}
        >
          <Sparkles size={16} aria-hidden />
          <span>
            <strong>New here? Start with the Executive Summary.</strong> It condenses
            the first four modules; the Academy's own numbering files it last.
          </span>
          <ChevronRight size={16} aria-hidden />
        </button>
      </section>

      {/* ── what this studio has written ─────────────────────────────── */}
      <section className="lh__section" aria-labelledby="lh-studio">
        <header className="lh__section-head">
          <div className="lh__section-titles">
            <p className="lh__kicker">{studioName}</p>
            <h2 className="lh__h2" id="lh-studio">
              Written here
            </h2>
          </div>
          {canWritePages && (
            <button type="button" className="lh__more" onClick={onNewPage}>
              <Plus size={15} aria-hidden />
              New page
            </button>
          )}
        </header>

        {recent.length === 0 ? (
          <p className="wk__empty">
            Nothing written at {studioName} yet. Studio leaders can add pages — the
            studio's own way of doing things, kept beside the Academy, never on top
            of it. Any trainer can add a studio note to a machine or an Academy page.
          </p>
        ) : (
          <WikiGroup
            id="lh-group-studio"
            label={`Most recently changed`}
            accent="hips"
            count={pages.length}
          >
            {recent.map((p) => (
              <WikiRow
                key={p.id}
                title={p.title}
                meta={p.section ? PAGE_SECTION_LABEL[p.section] : "Studio page"}
                onClick={() =>
                  activeStudioId &&
                  onOpen({ kind: "studio-page", id: p.id, studioId: activeStudioId })
                }
              />
            ))}
            {pages.length > recent.length && (
              <WikiRow
                title={`All ${plural(pages.length, "page")}`}
                meta="On the Academy's index"
                onClick={() => onOpenAcademy("studio")}
              />
            )}
          </WikiGroup>
        )}
      </section>

      <p className="lh__foot">
        <BookOpen size={13} aria-hidden /> The Academy text is the same at every MSF
        studio. Studio notes and pages are {studioName}'s own.
      </p>
    </WikiShell>
  );
}
