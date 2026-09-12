import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ClipboardList,
  Dumbbell,
  GraduationCap,
  Layers,
  MessageSquareQuote,
  Plus,
  Type,
} from "lucide-react";
import {
  Infobox,
  InfoboxGroup,
  InfoboxRows,
  WikiArticle,
  WikiBadge,
  WikiBlocks,
  WikiContents,
  WikiEditor,
  WikiGroup,
  WikiIndexHeader,
  WikiLinkCard,
  WikiRow,
  WikiSearch,
  WikiSection,
  WikiSeeAlso,
  WikiShell,
  StudioWikiPanel,
  buildGlossaryMatcher,
  groupElementId,
  linkGlossary,
  useStudioWiki,
  saveStudioWikiDoc,
  retireStudioWikiDoc,
  searchStudioWiki,
  serialiseBlocks,
  readingMinutes,
  whenLabel,
  PAGE_SECTION_LABEL,
  type GlossaryTerm,
  type StudioWikiDoc,
  type WikiAccent,
  type WikiContentsCard,
  type WikiCrumb,
  type WikiSearchGroup,
} from "../wiki";
import { CommentsPanel } from "../comments";
import { useActiveStudio } from "../../ActiveStudioContext";
import { useToast } from "../../contexts/ToastContext";
import {
  ACADEMY_INDEX,
  useAcademyCards,
  useAcademyCues,
  useAcademyGlossary,
  useAcademyModule,
  useAcademyOverviews,
  useAcademyScripts,
  useTopicSearch,
} from "./useAcademyContent";
import {
  buildAcademyMachines,
  whatItHas,
  type AcademyMachine,
} from "./academy-machines";
import type { LearningRef } from "../learning/ref";

/**
 * THE MSF ACADEMY, as its own wiki.
 *
 * Round: Wiki Redesign Phase 3, Sep 2026. Reordered after a flow review the
 * same day. Replaces AcademyView's role as a pane inside the Catalog;
 * AcademyView itself stays on disk as the rollback.
 *
 * WHY IT IS A TAB
 * ---------------
 * AJ's call: the Catalog stays equipment operations, the Academy becomes its
 * own top-level screen. The risk that came with that choice is maintaining two
 * visual languages, so both are built on features/wiki and share one shell,
 * one breadcrumb, one search, one set of tokens. Two tabs, one product.
 *
 * FOUR GROUPS, ORDERED BY HOW MUCH TIME THE READER HAS
 * -----------------------------------------------------
 *   By machine        30 seconds, standing at it
 *   This studio       what WE decided, which no other location has
 *   Cueing & language 1 minute, mid-set — what to say, and what a word means
 *   Curriculum        the study path, 561 minutes of it
 *
 * The first cut of this screen led with the Curriculum, which put a nine-hour
 * reading course above a thirty-second lookup on a screen used mid-shift. The
 * old AcademyView's own header had already said why that is wrong: "a trainer
 * wanting the seat position for the Leg Press is not going to read a module on
 * progressive overload."
 *
 * ONE ROW PER MACHINE, NOT THREE
 * ------------------------------
 * The corpus documents roughly the same twenty machines three times over — 18
 * quick cards, 20 scripts, 19 deep dives. The first cut listed all three as
 * separate groups, so "Chest Press" appeared in three places on one page and a
 * trainer had to know which of card / script / deep dive matched what was in
 * their head. Fifty-seven rows to reach twenty machines.
 *
 * academy-machines.ts joins them. The card is the front door — shortest, and
 * written to be read standing at the machine — and the script and deep dive
 * are links on it. That module also fixes something worse: ten of the eighteen
 * card `title` fields are abbreviations rather than names, so the first cut
 * rendered a row called "Pd". Names now come from the app's own machine
 * database, which is also what the Catalog shows.
 *
 * THE INDEX LISTS EVERYTHING
 * --------------------------
 * Same call as the Catalog index: the contents cards SCROLL to a group, they
 * do not filter, and every entry is already on the page. The old Academy put
 * five tabs above the content, so the thing you wanted was usually behind a
 * tab you had to guess at.
 */

/* One accent per group for the life of the screen, so the contents card, the
   group header and the article eyebrow always agree. Assigned rather than
   derived: Academy content has no movement pattern to read a colour from, and
   a colour that shifts between visits teaches nothing. */
const GROUP_ACCENT = {
  machines: "push",
  studio: "hips",
  language: "posterior",
  curriculum: "pull",
} as const satisfies Record<string, WikiAccent>;

/** The module that condenses modules 1–4. The curriculum numbers it last. */
const SUMMARY_MODULE_ID = "summary";

type Route =
  | { kind: "index" }
  | { kind: "module"; moduleId: string }
  | { kind: "topic"; moduleId: string; topicId: string }
  | { kind: "card"; cardId: string }
  | { kind: "script"; scriptId: string }
  | { kind: "overview"; overviewId: string }
  | { kind: "cueing" }
  | { kind: "glossary" }
  | { kind: "page"; pageId: string }
  | { kind: "newPage" }
  | { kind: "search" };

/**
 * A way in from outside this screen. Two forms:
 *
 *   { machineId, focus }  from a Catalog machine page: open that machine's card
 *                         or script, and offer a crumb back to the machine.
 *   { ref }               from anywhere else (search, the bell, a note, an
 *                         announcement): open exactly that page. See
 *                         features/learning/ref.ts.
 */
export interface AcademyJump {
  machineId?: string;
  focus?: "card" | "script";
  /** The machine's name, for the "back to the machine" crumb. */
  fromLabel?: string;
  ref?: LearningRef;
  /** Open the index scrolled to one of its four groups (the front page's tiles). */
  group?: AcademyGroupKey;
  /** Open the page editor, for someone allowed to write pages. */
  newPage?: boolean;
}

export type AcademyGroupKey = "machines" | "studio" | "language" | "curriculum";

/** The module a topic belongs to, from the index that ships with the app. */
function moduleOfTopic(topicId: string): string | null {
  for (const m of ACADEMY_INDEX.modules) {
    if (m.topics.some((t) => t.id === topicId)) return m.id;
  }
  return null;
}

/**
 * Where a Learning ref lands in this screen. Null for a machine ref, which is
 * the Catalog's to open, and for a topic whose module cannot be found — the
 * index is a better landing than a page that can never load.
 */
function routeForRef(ref: LearningRef): Route | null {
  switch (ref.kind) {
    case "academy-card":
      return { kind: "card", cardId: ref.id };
    case "academy-script":
      return { kind: "script", scriptId: ref.id };
    case "academy-overview":
      return { kind: "overview", overviewId: ref.id };
    case "academy-module":
      return { kind: "module", moduleId: ref.id };
    case "academy-topic": {
      const moduleId = ref.moduleId ?? moduleOfTopic(ref.id);
      return moduleId ? { kind: "topic", moduleId, topicId: ref.id } : null;
    }
    case "academy-cueing":
      return { kind: "cueing" };
    case "academy-glossary":
      return { kind: "glossary" };
    case "studio-page":
      return { kind: "page", pageId: ref.id };
    default:
      return null;
  }
}

export interface AcademyWikiViewProps {
  /** Arrived from a machine page in the Catalog. Resolved once content loads. */
  jump?: AcademyJump | null;
  /** Called once the jump has been consumed, so a re-render cannot re-apply it. */
  onClearJump?: () => void;
  /** Cross-link back into the Catalog. Switches tab; owned by AppContent. */
  onOpenMachine?: (machineId: string) => void;
  /** Studio leaders and above may author pages. Overlays are open to everyone. */
  canManagePages?: boolean;
  author?: { id: string; name: string } | null;
}

export function AcademyWikiView({
  jump,
  onClearJump,
  onOpenMachine,
  canManagePages,
  author,
}: AcademyWikiViewProps) {
  const { activeStudioId, activeStudio } = useActiveStudio();
  const { error: toastError, success: toastSuccess } = useToast();

  const [route, setRoute] = useState<Route>({ kind: "index" });
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  /** Set when we arrived from a machine, so the crumb can offer the way back. */
  const [cameFrom, setCameFrom] = useState<AcademyJump | null>(null);

  /*
   * Cards, scripts, overviews and the glossary load on entry rather than per
   * screen, because the INDEX needs all four to list and count them. Four
   * chunks, cached for the session. Module prose still loads only when a
   * module is opened — that is the megabyte.
   */
  const cards = useAcademyCards(true);
  const scripts = useAcademyScripts(true);
  const overviews = useAcademyOverviews(true);
  const glossary = useAcademyGlossary(true);
  const cues = useAcademyCues(route.kind === "cueing");
  const runTopicSearch = useTopicSearch();

  const { docs: studioDocs, overlayFor, pages } = useStudioWiki(activeStudioId);

  const moduleId =
    route.kind === "module" || route.kind === "topic" ? route.moduleId : null;
  const { content, loading: moduleLoading, failed: moduleFailed } =
    useAcademyModule(moduleId);

  /* ── the machine join ──────────────────────────────────────────── */

  const machines = useMemo(
    () => buildAcademyMachines(cards, scripts, overviews),
    [cards, scripts, overviews],
  );

  /** Reverse lookups, so an open document knows which machine it is about. */
  const byDoc = useMemo(() => {
    const card = new Map<string, AcademyMachine>();
    const script = new Map<string, AcademyMachine>();
    const overview = new Map<string, AcademyMachine>();
    for (const m of machines) {
      if (m.cardId) card.set(m.cardId, m);
      if (m.scriptId) script.set(m.scriptId, m);
      if (m.overviewId) overview.set(m.overviewId, m);
    }
    return { card, script, overview };
  }, [machines]);

  /** The machine the current route is about, if it is about one at all. */
  const routeMachine: AcademyMachine | null =
    route.kind === "card"
      ? (byDoc.card.get(route.cardId) ?? null)
      : route.kind === "script"
        ? (byDoc.script.get(route.scriptId) ?? null)
        : route.kind === "overview"
          ? (byDoc.overview.get(route.overviewId) ?? null)
          : null;

  /* ── glossary linking ──────────────────────────────────────────── */

  /*
   * Compiled ONCE per glossary, not per paragraph. A 200-term alternation
   * rebuilt for each of 400 blocks while a 6,400-word module renders is real,
   * measurable jank on an iPad. See glossary-links.tsx.
   */
  const matcher = useMemo(() => buildGlossaryMatcher(glossary), [glossary]);
  const [openTerm, setOpenTerm] = useState<GlossaryTerm | null>(null);
  const renderText = useMemo(
    () => (text: string) => linkGlossary(text, matcher, setOpenTerm),
    [matcher],
  );

  /* ── arriving from a machine, or from a link ───────────────────── */

  /** A glossary term to open once the glossary chunk has arrived. */
  const [pendingTerm, setPendingTerm] = useState<string | null>(null);
  /** An index group to scroll to once the index has rendered. */
  const [pendingGroup, setPendingGroup] = useState<AcademyGroupKey | null>(null);

  useEffect(() => {
    if (!pendingGroup || route.kind !== "index") return;
    const target = groupElementId(pendingGroup);
    // Cleared INSIDE the frame: clearing it here would re-render, run this
    // effect's cleanup and cancel the frame before it ever fired.
    const frame = requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ block: "start" });
      setPendingGroup(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [pendingGroup, route]);

  useEffect(() => {
    if (!jump) return;

    if (jump.group) {
      setRoute({ kind: "index" });
      setCameFrom(null);
      setPendingGroup(jump.group);
      onClearJump?.();
      return;
    }

    if (jump.newPage) {
      if (canManagePages && author) {
        setEditingPageId(null);
        setRoute({ kind: "newPage" });
      }
      onClearJump?.();
      return;
    }

    // A link to one exact page. No chunk needs to be waiting for this: each
    // page shows its own loading state, and a page that has since moved says
    // so (see "gone" below) rather than spinning.
    if (jump.ref) {
      const next = routeForRef(jump.ref);
      setRoute(next ?? { kind: "index" });
      setCameFrom(null);
      if (jump.ref.kind === "academy-glossary" && jump.ref.id) {
        setPendingTerm(jump.ref.id);
      }
      onClearJump?.();
      return;
    }

    // Wait for the chunks rather than giving up: the jump arrives with the tab
    // switch, and the JSON is still in flight for the first few hundred ms.
    if (!cards || !scripts) return;

    if (!jump.machineId) {
      onClearJump?.();
      return;
    }
    const entry = machines.find((m) => m.machineId === jump.machineId) ?? null;
    if (jump.focus === "script" && entry?.scriptId) {
      setRoute({ kind: "script", scriptId: entry.scriptId });
    } else if (entry?.cardId) {
      setRoute({ kind: "card", cardId: entry.cardId });
    } else if (entry?.scriptId) {
      // Two machines have no card — the Lateral Raise and the Triceps
      // Extension — and both have a full script, so going there beats landing
      // on an index the trainer did not ask for.
      setRoute({ kind: "script", scriptId: entry.scriptId });
    } else {
      setRoute({ kind: "index" });
    }
    setCameFrom(jump);
    onClearJump?.();
  }, [jump, cards, scripts, machines, onClearJump, canManagePages, author]);

  useEffect(() => {
    if (!pendingTerm || !glossary) return;
    const wanted = pendingTerm.toLowerCase();
    setOpenTerm(glossary.find((g) => g.term.toLowerCase() === wanted) ?? null);
    setPendingTerm(null);
  }, [pendingTerm, glossary]);

  /* ── helpers ───────────────────────────────────────────────────── */

  const openIndex = () => {
    setRoute({ kind: "index" });
    setCameFrom(null);
  };

  /** A machine row opens its shortest document. */
  const openMachineDoc = (entry: AcademyMachine) => {
    if (entry.cardId) setRoute({ kind: "card", cardId: entry.cardId });
    else if (entry.scriptId) setRoute({ kind: "script", scriptId: entry.scriptId });
    else if (entry.overviewId)
      setRoute({ kind: "overview", overviewId: entry.overviewId });
  };

  /**
   * The trail's root.
   *
   * The "back to the machine" crumb is DERIVED from the current route rather
   * than held in state: it shows only while the reader is still on a document
   * about the machine they arrived from. Holding it in state meant that
   * arriving from the Chest Press, then searching, then opening a curriculum
   * topic left a stale "Chest Press ›" on a page that had nothing to do with
   * it.
   */
  const rootCrumbs = (): WikiCrumb[] => {
    const crumbs: WikiCrumb[] = [];
    if (
      cameFrom?.machineId &&
      onOpenMachine &&
      routeMachine &&
      routeMachine.machineId === cameFrom.machineId
    ) {
      const machineId = cameFrom.machineId;
      crumbs.push({
        label: cameFrom.fromLabel ?? routeMachine.name,
        onClick: () => onOpenMachine(machineId),
      });
    }
    crumbs.push({ label: "Academy", onClick: openIndex });
    return crumbs;
  };

  /** Links to this machine's other two documents, plus its Catalog page. */
  const machineSeeAlso = (entry: AcademyMachine | null, exclude: Route["kind"]) => {
    if (!entry) return null;
    const links = [
      entry.cardId && exclude !== "card" ? (
        <WikiLinkCard
          key="card"
          icon={<ClipboardList size={16} aria-hidden />}
          title="Quick reference card"
          detail="The short version, written to be read standing at the machine."
          onClick={() => setRoute({ kind: "card", cardId: entry.cardId as string })}
        />
      ) : null,
      entry.scriptId && exclude !== "script" ? (
        <WikiLinkCard
          key="script"
          icon={<MessageSquareQuote size={16} aria-hidden />}
          title="Full spoken script"
          detail="Word for word, setup through the last rep."
          onClick={() =>
            setRoute({ kind: "script", scriptId: entry.scriptId as string })
          }
        />
      ) : null,
      entry.overviewId && exclude !== "overview" ? (
        <WikiLinkCard
          key="overview"
          icon={<Layers size={16} aria-hidden />}
          title="Deep dive"
          detail="The complete write-up — everything a practitioner holds before training anyone on it."
          onClick={() =>
            setRoute({ kind: "overview", overviewId: entry.overviewId as string })
          }
        />
      ) : null,
      onOpenMachine ? (
        <WikiLinkCard
          key="machine"
          icon={<Dumbbell size={16} aria-hidden />}
          title={`${entry.name} in the Catalog`}
          detail="Anatomy, specs, clinical warnings and this studio's setup."
          onClick={() => onOpenMachine(entry.machineId)}
        />
      ) : null,
    ].filter(Boolean);

    if (links.length === 0) return null;
    return <WikiSeeAlso title={`More on the ${entry.name}`}>{links}</WikiSeeAlso>;
  };

  const savePage = async (values: {
    title: string;
    summary: string;
    body: string;
    section?: "method" | "equipment" | "operations" | "other";
    tags: string[];
  }) => {
    if (!activeStudioId || !author) {
      toastError("No active studio selected — pick a studio before saving.");
      return;
    }
    setBusy(true);
    try {
      const id = await saveStudioWikiDoc(
        activeStudioId,
        { kind: "page", ...values },
        author,
        editingPageId ?? undefined,
      );
      setEditingPageId(null);
      setRoute({ kind: "page", pageId: id });
      toastSuccess("Page saved.");
    } catch (err) {
      console.error("Failed to save studio wiki page:", err);
      toastError("Could not save that page. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const retirePage = async (pageId: string) => {
    if (!activeStudioId || !author) return;
    setBusy(true);
    try {
      await retireStudioWikiDoc(activeStudioId, pageId, author.id);
      setEditingPageId(null);
      openIndex();
      toastSuccess("Retired. It is out of the index but not deleted.");
    } catch (err) {
      console.error("Failed to retire studio wiki page:", err);
      toastError("Could not retire that page. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  /** The glossary definition, shown inline wherever a linked term is tapped. */
  const termPanel = openTerm ? (
    <div className="wk__termcard" role="status">
      <p className="wk__termcard-term">{openTerm.term}</p>
      <p className="wk__termcard-def">{openTerm.definition}</p>
      <button
        type="button"
        className="wk__btn wk__btn--quiet"
        onClick={() => setOpenTerm(null)}
      >
        Close
      </button>
    </div>
  ) : null;

  /* ── search ────────────────────────────────────────────────────── */

  if (route.kind === "search") {
    const q = query.trim().toLowerCase();
    const topicHits = runTopicSearch(query);
    const machineHits = q
      ? machines.filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            (m.abbr ?? "").toLowerCase().includes(q),
        )
      : [];
    const glossaryHits = q
      ? (glossary ?? []).filter((g) => g.term.toLowerCase().includes(q))
      : [];
    const pageHits = searchStudioWiki(studioDocs, query, { kind: "page" });

    const groups: WikiSearchGroup[] = [
      {
        key: "machines",
        label: "Machines",
        items: machineHits.map((m) => ({
          id: m.machineId,
          title: m.name,
          meta: whatItHas(m),
          accent: GROUP_ACCENT.machines,
        })),
      },
      {
        key: "studio",
        label: `${activeStudio?.name ?? "This studio"}’s pages`,
        items: pageHits.map((h) => ({
          id: h.doc.id,
          title: h.doc.title,
          meta: h.doc.section ? PAGE_SECTION_LABEL[h.doc.section] : "Studio page",
          accent: GROUP_ACCENT.studio,
        })),
      },
      {
        key: "glossary",
        label: "Glossary",
        items: glossaryHits.map((g) => ({
          id: g.term,
          title: g.term,
          meta: "Definition",
          accent: GROUP_ACCENT.language,
        })),
      },
      {
        key: "topics",
        label: "Curriculum",
        items: topicHits.map((h) => ({
          id: `${h.moduleId}::${h.topicId}`,
          title: h.title,
          meta: h.moduleTitle,
          accent: GROUP_ACCENT.curriculum,
        })),
      },
    ];

    return (
      <WikiSearch
        value={query}
        onChange={setQuery}
        onClose={openIndex}
        onPick={(id, groupKey) => {
          setQuery("");
          if (groupKey === "machines") {
            const entry = machines.find((m) => m.machineId === id);
            if (entry) openMachineDoc(entry);
          } else if (groupKey === "studio") {
            setRoute({ kind: "page", pageId: id });
          } else if (groupKey === "glossary") {
            setOpenTerm((glossary ?? []).find((g) => g.term === id) ?? null);
            setRoute({ kind: "glossary" });
          } else if (groupKey === "topics") {
            const [m, t] = id.split("::");
            setRoute({ kind: "topic", moduleId: m, topicId: t });
          }
        }}
        groups={groups}
        placeholder="Search the Academy…"
        idle={
          <p className="wk__empty">
            Searches machines, this studio’s pages, the glossary and every topic
            title. Full-text search of the modules is deliberately not here — it
            would mean downloading the whole corpus to look inside it.
          </p>
        }
      />
    );
  }

  /* ── a studio page ─────────────────────────────────────────────── */

  if (route.kind === "newPage" || (route.kind === "page" && editingPageId)) {
    const existing =
      route.kind === "page"
        ? (pages.find((p) => p.id === route.pageId) ?? null)
        : null;
    return (
      <WikiShell
        crumbs={[...rootCrumbs(), { label: existing ? "Edit page" : "New page" }]}
      >
        <WikiArticle
          accent={GROUP_ACCENT.studio}
          eyebrow={activeStudio?.name ?? "This studio"}
          title={existing ? `Edit “${existing.title}”` : "New page"}
          lede="Pages are this studio's own. They sit alongside the Academy's material, never on top of it."
        >
          <WikiEditor
            kind="page"
            busy={busy}
            saveLabel={existing ? "Save changes" : "Publish page"}
            initial={
              existing
                ? {
                    title: existing.title,
                    summary: existing.summary ?? "",
                    body: serialiseBlocks(existing.blocks),
                    section: existing.section,
                    tags: existing.tags,
                  }
                : undefined
            }
            onSave={(v) => savePage(v)}
            onCancel={() => {
              setEditingPageId(null);
              if (route.kind === "newPage") openIndex();
            }}
            onRetire={existing ? () => retirePage(existing.id) : undefined}
          />
        </WikiArticle>
      </WikiShell>
    );
  }

  if (route.kind === "page") {
    const page = pages.find((p) => p.id === route.pageId) ?? null;
    if (!page) {
      return (
        <WikiShell crumbs={[...rootCrumbs(), { label: "Page" }]}>
          <div className="wk__placeholder">
            <p className="wk__placeholder-title">That page is gone</p>
            <p className="wk__placeholder-body">
              It was retired, or it belongs to a different studio.
            </p>
          </div>
        </WikiShell>
      );
    }
    const updated = whenLabel(page.updatedAt ?? page.createdAt);
    return (
      <WikiShell
        crumbs={[
          ...rootCrumbs(),
          { label: activeStudio?.name ?? "This studio", onClick: openIndex },
          { label: page.title },
        ]}
        onOpenSearch={() => setRoute({ kind: "search" })}
        actions={
          canManagePages && author ? (
            <button
              type="button"
              className="wk__searchbtn"
              onClick={() => setEditingPageId(page.id)}
            >
              Edit
            </button>
          ) : undefined
        }
      >
        <WikiArticle
          accent={GROUP_ACCENT.studio}
          eyebrow={page.section ? PAGE_SECTION_LABEL[page.section] : "Studio page"}
          title={page.title}
          lede={page.summary}
          badges={
            <>
              <WikiBadge tone="accent">
                {activeStudio?.name ?? "This studio"}
              </WikiBadge>
              {page.tags.map((t) => (
                <WikiBadge tone="neutral" key={t}>
                  {t}
                </WikiBadge>
              ))}
            </>
          }
          aside={
            <Infobox title="At a glance">
              <InfoboxGroup label="This page">
                <InfoboxRows
                  rows={[
                    {
                      label: "Section",
                      value: page.section ? PAGE_SECTION_LABEL[page.section] : "—",
                    },
                    { label: "Written by", value: page.authorName || "—" },
                    { label: "Updated", value: updated || "—" },
                    { label: "Read", value: `${readingMinutes(page.blocks)} min` },
                  ]}
                />
              </InfoboxGroup>
            </Infobox>
          }
        >
          <WikiSection title="Page" icon={<Building2 size={13} aria-hidden />}>
            <WikiBlocks blocks={page.blocks} renderText={renderText} />
          </WikiSection>
          {termPanel}
          {page.machineIds.length > 0 && onOpenMachine && (
            <WikiSeeAlso title="Machines this applies to">
              <div className="wk__chips">
                {page.machineIds.map((id) => {
                  const entry = machines.find((m) => m.machineId === id);
                  return (
                    <button
                      key={id}
                      type="button"
                      className="wk__chip"
                      onClick={() => onOpenMachine(id)}
                    >
                      <Dumbbell size={13} aria-hidden />
                      {entry?.name ?? id}
                    </button>
                  );
                })}
              </div>
            </WikiSeeAlso>
          )}

          <CommentsPanel
            target={{ kind: "studio-page", id: page.id, studioId: page.studioId || activeStudioId || "" }}
            title={page.title}
          />
        </WikiArticle>
      </WikiShell>
    );
  }

  /* ── a topic ───────────────────────────────────────────────────── */

  if (route.kind === "topic") {
    const topic = content?.topics.find((t) => t.id === route.topicId) ?? null;
    const mod = ACADEMY_INDEX.modules.find((m) => m.id === route.moduleId);
    const crumbs: WikiCrumb[] = [
      ...rootCrumbs(),
      {
        label: mod?.title ?? "Module",
        onClick: () => setRoute({ kind: "module", moduleId: route.moduleId }),
      },
      { label: topic?.title ?? "Topic" },
    ];

    return (
      <WikiShell crumbs={crumbs} onOpenSearch={() => setRoute({ kind: "search" })}>
        {!topic && !mod ? (
          <GonePage onIndex={openIndex} />
        ) : !topic && content?.id === route.moduleId && !moduleLoading ? (
          <GonePage onIndex={openIndex} />
        ) : !topic ? (
          <div className="wk__placeholder">
            <p className="wk__placeholder-title">
              {moduleFailed ? "This module could not be loaded" : "Loading…"}
            </p>
            <p className="wk__placeholder-body">
              {moduleFailed
                ? "Check your connection and try again."
                : "Fetching the text for this module."}
            </p>
          </div>
        ) : (
          <WikiArticle
            accent={GROUP_ACCENT.curriculum}
            eyebrow={topic.moduleLabel ?? content?.title ?? "Curriculum"}
            title={topic.title}
            aside={
              <Infobox title="At a glance">
                <InfoboxGroup label="This topic">
                  <InfoboxRows
                    rows={[
                      { label: "Module", value: mod?.title ?? "—" },
                      { label: "Read", value: `${topic.readingMinutes} min` },
                      { label: "Words", value: String(topic.words) },
                    ]}
                  />
                </InfoboxGroup>
              </Infobox>
            }
          >
            <WikiSection title="Topic" icon={<GraduationCap size={13} aria-hidden />}>
              <WikiBlocks blocks={topic.blocks} renderText={renderText} />
            </WikiSection>
            {termPanel}
            <StudioWikiPanel
              studioId={activeStudioId}
              studioName={activeStudio?.name}
              targetType="topic"
              targetId={topic.id}
              targetName={topic.title}
              overlay={overlayFor("topic", topic.id)}
              author={author ?? null}
              placeholder="How this reads on our floor — the bit trainers here always get wrong, or what we say instead."
            />
            {topic.source && (
              <p className="wk__source">
                Source: <code>{topic.source}</code>
              </p>
            )}

            <CommentsPanel
              target={{ kind: "academy-topic", id: topic.id, moduleId: route.moduleId }}
              title={topic.title}
            />
          </WikiArticle>
        )}
      </WikiShell>
    );
  }

  /* ── a module's topic list ─────────────────────────────────────── */

  if (route.kind === "module") {
    const mod = ACADEMY_INDEX.modules.find((m) => m.id === route.moduleId);
    if (!mod) {
      return (
        <WikiShell crumbs={[...rootCrumbs(), { label: "Module" }]}>
          <GonePage onIndex={openIndex} />
        </WikiShell>
      );
    }
    return (
      <WikiShell
        crumbs={[...rootCrumbs(), { label: mod?.title ?? "Module" }]}
        onOpenSearch={() => setRoute({ kind: "search" })}
      >
        <WikiIndexHeader
          title={mod?.title ?? "Module"}
          subtitle={mod?.blurb}
          stats={[
            { label: "Topics", value: mod?.topics.length ?? 0 },
            {
              label: "Minutes",
              value: mod?.topics.reduce((n, t) => n + t.readingMinutes, 0) ?? 0,
            },
          ]}
        />
        {moduleFailed ? (
          <p className="wk__empty">
            This module could not be loaded. Check your connection and try again.
          </p>
        ) : moduleLoading || !content ? (
          <p className="wk__empty">Loading…</p>
        ) : (
          <WikiGroup
            id="wk-group-topics"
            label="Topics, in teaching order"
            accent={GROUP_ACCENT.curriculum}
            count={content.topics.length}
          >
            {content.topics.map((t) => (
              <WikiRow
                key={t.id}
                title={t.title}
                meta={`${t.readingMinutes} min`}
                onClick={() =>
                  setRoute({
                    kind: "topic",
                    moduleId: route.moduleId,
                    topicId: t.id,
                  })
                }
              />
            ))}
          </WikiGroup>
        )}
      </WikiShell>
    );
  }

  /* ── a quick card ──────────────────────────────────────────────── */

  if (route.kind === "card") {
    const card = cards?.find((c) => c.id === route.cardId) ?? null;
    const entry = routeMachine;
    return (
      <WikiShell
        crumbs={[...rootCrumbs(), { label: entry?.name ?? "Card" }]}
        onOpenSearch={() => setRoute({ kind: "search" })}
      >
        {!card ? (
          cards ? <GonePage onIndex={openIndex} /> : <p className="wk__empty">Loading…</p>
        ) : (
          <WikiArticle
            accent={GROUP_ACCENT.machines}
            eyebrow="Quick reference"
            /* The app's canonical name, never card.title — ten of the
               eighteen are abbreviations. See academy-machines.ts. */
            title={entry?.name ?? card.abbr}
            lede="Written to be read standing at the machine. The deep dive has the full write-up."
            aside={
              <Infobox title="At a glance">
                <InfoboxGroup label="This card">
                  <InfoboxRows
                    rows={[
                      { label: "Academy", value: card.abbr },
                      { label: "Workout", value: entry?.workout ?? "—" },
                      { label: "Sections", value: String(card.sections.length) },
                      { label: "Words", value: String(card.words) },
                    ]}
                  />
                </InfoboxGroup>
              </Infobox>
            }
          >
            {card.sections.map((s) => (
              <WikiSection
                key={s.heading}
                title={s.heading}
                icon={<ClipboardList size={13} aria-hidden />}
              >
                <WikiBlocks
                  blocks={s.items.map((text) => ({ kind: "bullet", text }))}
                  renderText={renderText}
                />
              </WikiSection>
            ))}
            {termPanel}

            <StudioWikiPanel
              studioId={activeStudioId}
              studioName={activeStudio?.name}
              targetType="card"
              targetId={card.id}
              targetName={entry?.name ?? card.abbr}
              overlay={overlayFor("card", card.id)}
              author={author ?? null}
              placeholder="What we do differently on this machine — a setting, a cue, a client type to watch."
            />

            {machineSeeAlso(entry, "card")}

            <CommentsPanel target={{ kind: "academy-card", id: card.id }} title={entry?.name ?? card.abbr} />
          </WikiArticle>
        )}
      </WikiShell>
    );
  }

  /* ── a spoken script ───────────────────────────────────────────── */

  if (route.kind === "script") {
    const script = scripts?.find((s) => s.id === route.scriptId) ?? null;
    const entry = routeMachine;
    return (
      <WikiShell
        crumbs={[...rootCrumbs(), { label: entry?.name ?? "Script" }]}
        onOpenSearch={() => setRoute({ kind: "search" })}
      >
        {!script ? (
          scripts ? <GonePage onIndex={openIndex} /> : <p className="wk__empty">Loading…</p>
        ) : (
          <WikiArticle
            accent={GROUP_ACCENT.machines}
            eyebrow={`${script.workout} · spoken script`}
            title={entry?.name ?? script.abbr}
            lede="Lines in quotes and colour are said out loud. Everything else is what you do or watch for."
            aside={
              <Infobox title="At a glance">
                <InfoboxGroup label="This script">
                  <InfoboxRows
                    rows={[
                      { label: "Academy", value: script.abbr },
                      { label: "Workout", value: script.workout },
                      { label: "Beats", value: String(script.beats.length) },
                      { label: "Lines", value: String(script.lines) },
                    ]}
                  />
                </InfoboxGroup>
              </Infobox>
            }
          >
            {script.beats.map((b) => (
              <WikiSection
                key={b.beat}
                title={b.beat}
                icon={<MessageSquareQuote size={13} aria-hidden />}
              >
                <div className="wk__script">
                  {b.lines.map((l, i) =>
                    l.spoken ? (
                      <p className="wk__said" key={`${i}-said`}>
                        {l.text}
                      </p>
                    ) : (
                      <p className="wk__do" key={`${i}-do`}>
                        {renderText(l.text)}
                      </p>
                    ),
                  )}
                </div>
              </WikiSection>
            ))}
            {termPanel}

            <StudioWikiPanel
              studioId={activeStudioId}
              studioName={activeStudio?.name}
              targetType="script"
              targetId={script.id}
              targetName={entry?.name ?? script.abbr}
              overlay={overlayFor("script", script.id)}
              author={author ?? null}
              placeholder="Wording we've found lands better here, or a beat we add."
            />

            {machineSeeAlso(entry, "script")}

            <CommentsPanel target={{ kind: "academy-script", id: script.id }} title={entry?.name ?? script.abbr} />
          </WikiArticle>
        )}
      </WikiShell>
    );
  }

  /* ── a deep dive ───────────────────────────────────────────────── */

  if (route.kind === "overview") {
    const overview = overviews?.find((o) => o.id === route.overviewId) ?? null;
    const entry = routeMachine;
    return (
      <WikiShell
        crumbs={[...rootCrumbs(), { label: entry?.name ?? overview?.title ?? "Deep dive" }]}
        onOpenSearch={() => setRoute({ kind: "search" })}
      >
        {!overview ? (
          overviews ? <GonePage onIndex={openIndex} /> : <p className="wk__empty">Loading…</p>
        ) : (
          <WikiArticle
            accent={GROUP_ACCENT.machines}
            eyebrow="Deep dive"
            title={entry?.name ?? overview.title}
            lede="Everything a practitioner is expected to hold before training anyone on it."
            aside={
              <Infobox title="At a glance">
                <InfoboxGroup label="This write-up">
                  <InfoboxRows
                    rows={[
                      { label: "Academy", value: overview.title },
                      { label: "Read", value: `${overview.readingMinutes} min` },
                      { label: "Words", value: String(overview.words) },
                    ]}
                  />
                </InfoboxGroup>
              </Infobox>
            }
          >
            <WikiSection title="Write-up" icon={<Layers size={13} aria-hidden />}>
              <WikiBlocks blocks={overview.blocks} renderText={renderText} />
            </WikiSection>
            {termPanel}
            <StudioWikiPanel
              studioId={activeStudioId}
              studioName={activeStudio?.name}
              targetType="overview"
              targetId={overview.id}
              targetName={entry?.name ?? overview.title}
              overlay={overlayFor("overview", overview.id)}
              author={author ?? null}
            />
            {machineSeeAlso(entry, "overview")}

            <CommentsPanel target={{ kind: "academy-overview", id: overview.id }} title={entry?.name ?? overview.title} />
          </WikiArticle>
        )}
      </WikiShell>
    );
  }

  /* ── the cueing phrasebook ─────────────────────────────────────── */

  if (route.kind === "cueing") {
    return (
      <WikiShell
        crumbs={[...rootCrumbs(), { label: "Cueing phrasebook" }]}
        onOpenSearch={() => setRoute({ kind: "search" })}
      >
        <WikiArticle
          accent={GROUP_ACCENT.language}
          eyebrow="Cueing & language"
          title="Cueing phrasebook"
          lede="What to say, and when. The phrases are grouped by the moment in the set they belong to."
        >
          {!cues ? (
            <p className="wk__empty">Loading…</p>
          ) : (
            cues.map((m) => (
              <WikiSection
                key={m.moment}
                title={m.moment}
                icon={<MessageSquareQuote size={13} aria-hidden />}
              >
                <WikiBlocks
                  blocks={m.notes.map((text) => ({ kind: "para", text }))}
                  renderText={renderText}
                />
                <ul className="wk__cues">
                  {m.phrases.map((p, i) => (
                    <li key={`${i}-${p.slice(0, 10)}`}>{p}</li>
                  ))}
                </ul>
              </WikiSection>
            ))
          )}
          {termPanel}
        </WikiArticle>
      </WikiShell>
    );
  }

  /* ── the glossary ──────────────────────────────────────────────── */

  if (route.kind === "glossary") {
    return (
      <WikiShell
        crumbs={[...rootCrumbs(), { label: "Glossary" }]}
        onOpenSearch={() => setRoute({ kind: "search" })}
      >
        <WikiArticle
          accent={GROUP_ACCENT.language}
          eyebrow="Cueing & language"
          title="Glossary"
          lede="The Academy is explicit that these exact terms are the ones to use. They are linked wherever they appear in the text."
        >
          {!glossary ? (
            <p className="wk__empty">Loading…</p>
          ) : (
            <WikiSection title="Terms" icon={<Type size={13} aria-hidden />}>
              <dl className="wk__glossary">
                {glossary.map((e) => (
                  <div
                    className={`wk__glossary-row${openTerm?.term === e.term ? " wk__glossary-row--open" : ""}`}
                    key={e.term}
                  >
                    <dt>{e.term}</dt>
                    <dd>{e.definition}</dd>
                  </div>
                ))}
              </dl>
            </WikiSection>
          )}
        </WikiArticle>
      </WikiShell>
    );
  }

  /* ── the index ─────────────────────────────────────────────────── */

  const topicCount = ACADEMY_INDEX.modules.reduce(
    (n, m) => n + m.topics.length,
    0,
  );
  const machineCount = machines.length || ACADEMY_INDEX.cardCount;
  const studioName = activeStudio?.name ?? "This studio";

  const contents: WikiContentsCard[] = [
    {
      key: "machines",
      label: "By machine",
      accent: GROUP_ACCENT.machines,
      count: machineCount,
      countLabel: `${machineCount} machines`,
      target: groupElementId("machines"),
    },
  ];
  /* Only when there is something in it. A studio leader with no pages yet had
     an empty box as the first thing on the screen. "New page" lives in the
     top bar, which is where it was always reachable from. */
  if (pages.length > 0) {
    contents.push({
      key: "studio",
      label: studioName,
      accent: GROUP_ACCENT.studio,
      count: pages.length,
      countLabel: `${pages.length} page${pages.length === 1 ? "" : "s"}`,
      target: groupElementId("studio"),
    });
  }
  contents.push(
    {
      key: "language",
      label: "Cueing & language",
      accent: GROUP_ACCENT.language,
      count: 2,
      countLabel: `${ACADEMY_INDEX.glossaryCount} terms`,
      target: groupElementId("language"),
    },
    {
      key: "curriculum",
      label: "Curriculum",
      accent: GROUP_ACCENT.curriculum,
      count: ACADEMY_INDEX.modules.length,
      countLabel: `${ACADEMY_INDEX.modules.length} modules`,
      target: groupElementId("curriculum"),
    },
  );

  return (
    <WikiShell
      crumbs={[{ label: "Academy" }]}
      onOpenSearch={() => setRoute({ kind: "search" })}
      actions={
        canManagePages && author ? (
          <button
            type="button"
            className="wk__searchbtn"
            onClick={() => {
              setEditingPageId(null);
              setRoute({ kind: "newPage" });
            }}
          >
            <Plus size={14} aria-hidden />
            <span className="wk__searchbtn-label">New page</span>
          </button>
        ) : undefined
      }
    >
      <WikiIndexHeader
        title="MSF Academy"
        subtitle={`The studio's own method, in the app — ${machineCount} machines, ${ACADEMY_INDEX.modules.length} modules, ${topicCount} topics, and whatever ${studioName} has added.`}
        stats={[
          { label: "Machines", value: machineCount },
          { label: "Topics", value: topicCount },
          { label: "Glossary terms", value: ACADEMY_INDEX.glossaryCount },
          {
            label: `${studioName}'s pages`,
            value: pages.length,
            tone: pages.length > 0 ? "ok" : undefined,
          },
        ]}
      />

      <WikiContents cards={contents} label="Contents" />

      {/* 1. Thirty seconds, standing at it. */}
      <WikiGroup
        id={groupElementId("machines")}
        label="By machine"
        accent={GROUP_ACCENT.machines}
        count={machineCount}
        note="Everything the Academy documents about each machine. The card is the short version; the script and the deep dive are linked on it."
      >
        {machines.length === 0 ? (
          <p className="wk__empty">Loading the machine cards…</p>
        ) : (
          machines.map((m) => (
            <WikiRow
              key={m.machineId}
              title={m.name}
              meta={whatItHas(m)}
              onClick={() => openMachineDoc(m)}
              badges={
                overlayFor("card", m.cardId ?? "") ||
                overlayFor("script", m.scriptId ?? "") ? (
                  <WikiBadge tone="accent">Studio note</WikiBadge>
                ) : undefined
              }
            />
          ))
        )}
      </WikiGroup>

      {/* 2. What WE decided. Absent entirely when there is nothing in it. */}
      {pages.length > 0 && (
        <WikiGroup
          id={groupElementId("studio")}
          label={`${studioName} — written here`}
          accent={GROUP_ACCENT.studio}
          count={pages.length}
        >
          {pages.map((p) => (
            <WikiRow
              key={p.id}
              title={p.title}
              meta={p.section ? PAGE_SECTION_LABEL[p.section] : "Studio page"}
              onClick={() => setRoute({ kind: "page", pageId: p.id })}
              badges={<StudioPageBadges page={p} />}
            />
          ))}
        </WikiGroup>
      )}

      {/* 3. One minute, mid-set. */}
      <WikiGroup
        id={groupElementId("language")}
        label="Cueing & language"
        accent={GROUP_ACCENT.language}
        count={2}
      >
        <WikiRow
          title="Cueing phrasebook"
          meta="What to say, grouped by the moment in the set"
          onClick={() => setRoute({ kind: "cueing" })}
        />
        <WikiRow
          title="Glossary"
          meta={`${ACADEMY_INDEX.glossaryCount} terms · linked throughout the text`}
          onClick={() => setRoute({ kind: "glossary" })}
        />
      </WikiGroup>

      {/* 4. The study path. Last because it is the one nobody opens mid-set. */}
      <WikiGroup
        id={groupElementId("curriculum")}
        label="Curriculum — in teaching order"
        accent={GROUP_ACCENT.curriculum}
        count={ACADEMY_INDEX.modules.length}
        note={
          <>
            New here? Module 13, the{" "}
            <button
              type="button"
              onClick={() =>
                setRoute({ kind: "module", moduleId: SUMMARY_MODULE_ID })
              }
            >
              Executive Summary
            </button>
            , condenses modules 1–4. The numbering is the Academy's own, so the
            fastest way in is filed last.
          </>
        }
      >
        {ACADEMY_INDEX.modules.map((m) => (
          <WikiRow
            key={m.id}
            title={`${m.n}. ${m.title}`}
            meta={`${m.topics.length} topic${m.topics.length === 1 ? "" : "s"} · ${m.topics.reduce((n, t) => n + t.readingMinutes, 0)} min`}
            onClick={() => setRoute({ kind: "module", moduleId: m.id })}
          />
        ))}
      </WikiGroup>
    </WikiShell>
  );
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

/**
 * A link that points at a page this build of the Academy does not have.
 *
 * Academy ids are slugs of the source documents' file names, so a rebuilt
 * corpus can rename one. Before Learning links existed nothing stored those
 * ids; now notes, announcements and comments do. Such a link says so, rather
 * than showing "Loading…" for ever.
 */
function GonePage({ onIndex }: { onIndex: () => void }) {
  return (
    <div className="wk__placeholder">
      <p className="wk__placeholder-title">This page has moved</p>
      <p className="wk__placeholder-body">
        The Academy has been updated, and this link points at a page that no
        longer exists under that name. Search for it, or browse the index.
      </p>
      <button type="button" className="wk__btn" onClick={onIndex}>
        Academy index
      </button>
    </div>
  );
}

function StudioPageBadges({ page }: { page: StudioWikiDoc }) {
  if (page.tags.length === 0) return null;
  return (
    <>
      {page.tags.slice(0, 2).map((t) => (
        <WikiBadge tone="neutral" key={t}>
          {t}
        </WikiBadge>
      ))}
    </>
  );
}
