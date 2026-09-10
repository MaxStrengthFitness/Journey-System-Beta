/**
 * features/wiki — the shared shell the Catalog and the Academy both sit on.
 *
 * Round: Wiki Redesign, Sep 2026.
 *
 * Nothing in the presentation layer here knows what a machine is. That is the
 * point: the Catalog and the Academy are two different subjects, and the brief
 * was that they should read as one product without being one screen. Anything
 * that needs the word "machine" belongs in features/catalog; anything that
 * needs "topic" belongs in features/academy.
 *
 * The exception is the studio-content layer (studio-wiki*, StudioWikiPanel),
 * which is deliberately generic: a studio's note on a machine and a studio's
 * note on an Academy topic are the same document in the same collection, and
 * splitting them would give the reader two different answers to the same
 * question — "does OUR studio do this differently?"
 *
 * Importing from this barrel also pulls in wiki.css (and, through it,
 * wiki.tokens.css), so a consumer never has to remember two imports.
 */

import "./wiki.css";

export { WikiShell, type WikiCrumb, type WikiShellProps } from "./WikiShell";

// The Learning tab's Catalog | Academy switch. AppContent imports this from
// "./features/wiki/sections" directly, NOT from this barrel: the barrel pulls
// the whole wiki (and wiki.css) into the first download.
export {
  WikiSectionsProvider,
  useWikiSections,
  type WikiSectionTab,
  type WikiSectionsValue,
} from "./sections";

export {
  WikiArticle,
  WikiSection,
  WikiFoldable,
  WikiProse,
  WikiCues,
  WikiBlocks,
  WikiBadge,
  type WikiArticleProps,
  type WikiBadgeTone,
} from "./WikiArticle";

export {
  Infobox,
  InfoboxGroup,
  InfoboxRows,
  InfoboxMuscles,
  type InfoboxProps,
} from "./Infobox";

export {
  WikiIndexHeader,
  WikiContents,
  WikiGroup,
  WikiRow,
  type WikiStat,
  type WikiContentsCard,
  type WikiRowProps,
} from "./WikiIndex";

export {
  WikiSeeAlso,
  WikiLinkCard,
  WikiChips,
  type WikiChip,
  type WikiLinkCardProps,
} from "./WikiLinks";

export {
  WikiSearch,
  type WikiSearchGroup,
  type WikiSearchItem,
  type WikiSearchProps,
} from "./WikiSearch";

export {
  ACCENTS,
  ACCENT_ICON,
  ACADEMY_ACCENT,
  accentVar,
  accentFillVar,
  accentStyle,
  accentForPattern,
  accentForAcademyCategory,
  accentForGroupKey,
  groupElementId,
  type WikiAccent,
  type WikiIcon,
} from "./categories";

export {
  buildGlossaryMatcher,
  linkGlossary,
  type GlossaryMatcher,
  type GlossaryTerm,
} from "./glossary-links";

/* ── the studio's own content ─────────────────────────────────────── */

export {
  PAGE_SECTIONS,
  PAGE_SECTION_LABEL,
  WIKI_BLOCK_MAX,
  WIKI_BODY_MAX,
  WIKI_SUMMARY_MAX,
  WIKI_TITLE_MAX,
  isOverlayFor,
  pagesInSection,
  parseBlocks,
  readingMinutes,
  searchStudioWiki,
  serialiseBlocks,
  targetDocId,
  validateDraft,
  whenLabel,
  type StudioWikiDoc,
  type StudioWikiDraft,
  type StudioWikiHit,
  type WikiBlock,
  type WikiBlockKind,
  type WikiDocKind,
  type WikiDraftProblem,
  type WikiPageSection,
  type WikiTargetType,
} from "./studio-wiki";

export { useStudioWiki, type UseStudioWikiResult } from "./useStudioWiki";

export {
  saveStudioWikiDoc,
  retireStudioWikiDoc,
  restoreStudioWikiDoc,
} from "./studio-wiki-mutations";

export {
  WikiEditor,
  type WikiEditorProps,
  type WikiEditorValues,
} from "./WikiEditor";

export {
  StudioWikiPanel,
  type StudioWikiPanelProps,
} from "./StudioWikiPanel";
