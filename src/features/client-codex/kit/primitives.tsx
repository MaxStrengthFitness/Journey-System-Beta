/**
 * THE CODEX KIT — the pieces every Notes & Profile page is built from.
 *
 * Client codex, Sep 2026. The record tab stopped being one long scroll of
 * hosted screens, each with its own card, button and chip, and became seven
 * pages (Overview · Notes · FORD · Body & Pulse · Goals & Focus · Story ·
 * Account). They share one look so a trainer learns it once: this file, its
 * stylesheet (kit.css) and the tokens (../codex.tokens.css).
 *
 * The contract, checked by scale.test.ts against the actual files:
 *  - Text is 11 / 12 / 14 / 17 / 30px and nothing else.
 *  - Colours are the app's tokens, never a raw value.
 *  - Nothing is clipped. Names, labels and meta wrap; no ellipsis anywhere.
 *  - Nothing tappable is under 40px; every button is a real <button>.
 *  - Crimson appears only for Critical (LoudChip), an absolute
 *    contraindication (Chip tone "alert") and the critical line. Plum is Heads
 *    up and a caution. Hero orange is not in the kit at all: it is Start
 *    Session's, and FORD's "now" date.
 *
 * Where things go: a page is `<Page>` (its head, the ‹ › neighbours and the
 * Next card around its content). Inside, a titled panel is `<Card>`, an
 * Overview tile is `<Slot>`, a label/value list is `<FactList>`, a list of
 * openable lines is `<Rows>`. Record editors sit behind `<ReadEdit>` and
 * write through the shell's one Save bar (`<SaveBar>`).
 *
 * Anchors: a card a door may land on takes `id={anchor}` — the anchor must be
 * in RECORD_ANCHORS (profile-nav.ts) — and the kit adds `data-cx-anchor`, which
 * gives it the scroll margin that clears the sticky sub-toggle.
 */
import type { ComponentProps, ReactNode } from "react";
import { ChevronLeft, ChevronRight, Inbox, type LucideIcon } from "lucide-react";
import {
  RECORD_PAGES,
  neighbours,
  type RecordAnchor,
  type RecordPage,
} from "../../client-profile/profile-nav";
import { IMPORTANCE_META, type JournalImportance } from "../../../types/journal";
import { LOUDNESS_TONE } from "../../rating/Loudness";
import { FORD_META, type FordPillar } from "../../ford/types";
import { curly } from "./text";
import "../../equipment/equipment.tokens.css";
import "../../ford/ford.tokens.css";
import "../codex.tokens.css";
import "./kit.css";

/** How a page moves the trainer: to a page, and optionally a card on it. */
export type CodexGo = (page: RecordPage, anchor?: RecordAnchor) => void;

export const cls = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(" ");

/**
 * The attributes that make an element a place a door can land on. Spread it
 * on any element that is not a kit Card: `<div {...anchorProps("ford-beyond")}>`.
 */
export function anchorProps(anchor: RecordAnchor | null | undefined): { id?: string; "data-cx-anchor"?: string } {
  return anchor ? { id: anchor, "data-cx-anchor": anchor } : {};
}

function pageLabelOf(page: RecordPage): string {
  return RECORD_PAGES.find((p) => p.id === page)?.label ?? page;
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export type BtnVariant = "default" | "solid" | "live" | "quiet";

export interface BtnProps extends ComponentProps<"button"> {
  /** default: a plain button · solid: THE action (brand blue, never orange) ·
   *  live: an inviting secondary · quiet: a text-weight action. */
  variant?: BtnVariant;
  icon?: LucideIcon;
  /** An icon after the words ("FORD ›"). */
  iconEnd?: LucideIcon;
}

/** The one button. 40px or taller, 14px words, wraps rather than clips. */
export function Btn({ variant = "default", icon: Icon, iconEnd: IconEnd, className, children, type = "button", ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={cls("cx-btn", className)}
      data-variant={variant === "default" ? undefined : variant}
      {...rest}
    >
      {Icon ? <Icon className="cx-btn__icon" size={16} aria-hidden="true" /> : null}
      {children}
      {IconEnd ? <IconEnd className="cx-btn__icon" size={16} aria-hidden="true" /> : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/** The small uppercase label over a card or slot. 11px. */
export function Eyebrow({
  icon: Icon,
  as: Tag = "span",
  className,
  children,
}: {
  icon?: LucideIcon;
  as?: "span" | "p" | "h3" | "h4";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag className={cls("cx-eyebrow", className)}>
      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
      {children}
    </Tag>
  );
}

/** Secondary facts beside a line: who, when. 12px. */
export function Meta({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cls("cx-meta", className)}>{children}</span>;
}

/** The one sentence a panel leads with. 17px. */
export function Lede({ as: Tag = "p", className, children }: { as?: "p" | "span"; className?: string; children: ReactNode }) {
  return <Tag className={cls("cx-lede", className)}>{children}</Tag>;
}

/**
 * Words the page QUOTES rather than says — a watch-out from the clinical
 * list, a Pulse statement, a note — in curly quotes, verbatim. Takes a string
 * so nothing can be reworded on the way in.
 */
export function Quote({ as: Tag = "p", className, children }: { as?: "p" | "span"; className?: string; children: string }) {
  return <Tag className={cls("cx-quote", className)}>{curly(children)}</Tag>;
}

/** Where a panel's facts come from: "From Mindbody · synced today". 12px. */
export function Source({ as: Tag = "p", className, children }: { as?: "p" | "span"; className?: string; children: ReactNode }) {
  return <Tag className={cls("cx-source", className)}>{children}</Tag>;
}

/** A heading inside a page, with an optional quiet aside. 17px. */
export function SectionHead({
  as: Tag = "h3",
  id,
  aside,
  children,
}: {
  as?: "h3" | "h4";
  id?: RecordAnchor;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Tag className="cx-section-head" {...anchorProps(id)}>
      {children}
      {aside ? <span className="cx-section-head__aside">{aside}</span> : null}
    </Tag>
  );
}

/** A number that IS the fact ("461"). 30px. Never a score. */
export function BigNumber({ className, children }: { className?: string; children: ReactNode }) {
  return <span className={cls("cx-big", className)}>{children}</span>;
}

/**
 * The line a panel shows when it has nothing — a sentence that says so, and
 * optionally the one thing to do about it. Never used for "couldn't load":
 * a failed read is unknown, not empty, and says so in its own words.
 */
export function EmptyLine({
  action,
  children,
}: {
  action?: { label: string; onClick: () => void; disabled?: boolean };
  children: ReactNode;
}) {
  return (
    <div className="cx-empty">
      <span className="cx-empty__text">{children}</span>
      {action ? (
        <Btn variant="live" onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </Btn>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

/**
 * neutral · alert (crimson: an absolute contraindication, and nothing else) ·
 * warn (plum: a caution) · live (blue: something that changes the set-up) ·
 * ok (green: done, reached) · new (dashed: just added, not yet looked at).
 */
export type ChipTone = "neutral" | "alert" | "warn" | "live" | "ok" | "new";

/** A short label. 12px; it wraps, so a long condition name is never cut. Not tappable. */
export function Chip({
  tone = "neutral",
  icon: Icon,
  title,
  className,
  children,
}: {
  tone?: ChipTone;
  icon?: LucideIcon;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cls("cx-chip", className)} data-tone={tone === "neutral" ? undefined : tone} title={title}>
      {Icon ? <Icon size={13} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

/** A row of chips that wraps. */
export function Chips({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cls("cx-chips", className)}>{children}</div>;
}

/** A chip you can tap: 40px tall, blue. `pressed` makes it a toggle. */
export function ChipButton({
  pressed,
  icon: Icon,
  className,
  children,
  type = "button",
  ...rest
}: ComponentProps<"button"> & { pressed?: boolean; icon?: LucideIcon }) {
  return (
    <button type={type} className={cls("cx-chip-btn", className)} aria-pressed={pressed} {...rest}>
      {Icon ? <Icon size={14} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

/**
 * How loud a note is, shown with the words and colours of the one Loudness
 * control (LOUDNESS_TONE): Note quiet, Heads up plum, Critical crimson. An
 * importance the app does not know reads as a plain Note.
 */
export function LoudChip({ importance }: { importance: JournalImportance | null | undefined }) {
  const level: JournalImportance =
    importance === "elevated" || importance === "critical" ? importance : "standard";
  return (
    <span className="cx-loud" data-tone={LOUDNESS_TONE[level]}>
      {IMPORTANCE_META[level].short}
    </span>
  );
}

/**
 * FORD's letter mark — F, O, R or D in its pillar's tint, identity only
 * (never a status colour: FORD colours by urgency). A detail not filed yet
 * gets the inbox glyph. Decorative unless `labelled`.
 */
export function FordMark({
  pillar,
  size = 30,
  labelled = false,
}: {
  pillar: FordPillar | null;
  size?: 22 | 30 | 40;
  labelled?: boolean;
}) {
  const meta = pillar ? FORD_META[pillar] : null;
  const label = meta?.label ?? "Not filed yet";
  const a11y = labelled
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
  return (
    <span className="cx-mark" data-pillar={pillar ?? "unfiled"} data-size={size} title={label} {...a11y}>
      {meta ? meta.letter : <Inbox size={Math.round(size / 2)} strokeWidth={2.5} aria-hidden="true" />}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Panels                                                              */
/* ------------------------------------------------------------------ */

/** A card's head row: eyebrow (the card's heading), meta, then its actions. */
export function CardHead({
  eyebrow,
  icon,
  meta,
  actions,
  level = 3,
}: {
  eyebrow?: string;
  icon?: LucideIcon;
  meta?: ReactNode;
  actions?: ReactNode;
  /** The heading level of the eyebrow: 3 under a page title, 4 inside a section. */
  level?: 3 | 4;
}) {
  return (
    <div className="cx-card-head">
      {eyebrow ? (
        <Eyebrow as={level === 4 ? "h4" : "h3"} icon={icon}>
          {eyebrow}
        </Eyebrow>
      ) : null}
      {meta ? <Meta>{meta}</Meta> : null}
      {actions ? <div className="cx-card-head__actions">{actions}</div> : null}
    </div>
  );
}

export interface CardProps {
  eyebrow?: string;
  icon?: LucideIcon;
  meta?: ReactNode;
  actions?: ReactNode;
  /** The footer line: where this panel's facts come from. */
  source?: ReactNode;
  /**
   * The frame for a component that draws its own inner cards: spacing only,
   * no border or padding, so borders never double.
   */
  host?: boolean;
  /** An anchor from RECORD_ANCHORS, when a door may land on this card. */
  id?: RecordAnchor;
  as?: "section" | "div";
  className?: string;
  children?: ReactNode;
}

/** THE panel. One style everywhere: surface, hairline, 14px corners. */
export function Card({ eyebrow, icon, meta, actions, source, host = false, id, as: Tag = "section", className, children }: CardProps) {
  return (
    <Tag className={cls("cx-card", className)} data-host={host ? "" : undefined} {...anchorProps(id)}>
      {eyebrow || meta || actions ? <CardHead eyebrow={eyebrow} icon={icon} meta={meta} actions={actions} /> : null}
      {children}
      {source ? <Source>{source}</Source> : null}
    </Tag>
  );
}

interface SlotBase {
  eyebrow: string;
  icon?: LucideIcon;
  footer?: ReactNode;
  id?: RecordAnchor;
  className?: string;
  children?: ReactNode;
}

export type SlotProps =
  | (SlotBase & {
      /** The whole slot is one button — so its content must hold no other
       *  control, and must be phrasing content (spans), not blocks. */
      as: "button";
      go: () => void;
      /** The affordance in its corner. Defaults to "Open". */
      openLabel?: string;
    })
  | (SlotBase & {
      as?: "section";
      /** The section's own door, top right: a Btn such as "Open FORD". */
      open?: ReactNode;
    });

/**
 * An Overview tile: eyebrow, a few lines, a source footer. Either the whole
 * tile is a door (`as="button"`, 120px or taller) or it is a section whose
 * rows are doors of their own.
 */
export function Slot(props: SlotProps) {
  const { eyebrow, icon, footer, id, className, children } = props;
  if (props.as === "button") {
    return (
      <button type="button" className={cls("cx-slot", className)} data-as="button" onClick={props.go} {...anchorProps(id)}>
        <span className="cx-slot__head">
          <Eyebrow icon={icon}>{eyebrow}</Eyebrow>
          <span className="cx-grow" />
          <span className="cx-slot__open">
            {props.openLabel ?? "Open"}
            <ChevronRight size={14} aria-hidden="true" />
          </span>
        </span>
        <span className="cx-slot__body">{children}</span>
        {footer ? <span className="cx-slot__foot">{footer}</span> : null}
      </button>
    );
  }
  return (
    <section className={cls("cx-slot", className)} {...anchorProps(id)}>
      <div className="cx-slot__head">
        <Eyebrow as="h3" icon={icon}>
          {eyebrow}
        </Eyebrow>
        <span className="cx-grow" />
        {props.open}
      </div>
      <div className="cx-slot__body">{children}</div>
      {footer ? <div className="cx-slot__foot">{footer}</div> : null}
    </section>
  );
}

/** Label | value pairs. One column when the panel is narrower than 480px. */
export function FactList({ className, children }: { className?: string; children: ReactNode }) {
  return <dl className={cls("cx-facts", className)}>{children}</dl>;
}

export function Fact({ label, source, children }: { label: string; source?: ReactNode; children: ReactNode }) {
  return (
    <div className="cx-fact">
      <dt className="cx-fact__label">{label}</dt>
      <dd className="cx-fact__value">
        {children}
        {source ? <span className="cx-source">{source}</span> : null}
      </dd>
    </div>
  );
}

/** A list of lines; each `Row` may open something. */
export function Rows({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cls("cx-rows", className)}>{children}</div>;
}

/**
 * One line of a list: a label column (a chip, a date), the text, and meta on
 * the right — stacked under the text when the list is narrow. A button when
 * it opens something, 44px or taller.
 */
export function Row({
  label,
  meta,
  onClick,
  id,
  className,
  children,
}: {
  label?: ReactNode;
  meta?: ReactNode;
  onClick?: () => void;
  id?: RecordAnchor;
  className?: string;
  children: ReactNode;
}) {
  const inner = (
    <>
      {label !== undefined ? <span className="cx-row__label">{label}</span> : null}
      <span className="cx-row__text">{children}</span>
      {meta ? <span className="cx-row__meta">{meta}</span> : null}
    </>
  );
  const shared = {
    className: cls("cx-row", className),
    "data-nolabel": label === undefined ? "" : undefined,
    ...anchorProps(id),
  };
  return onClick ? (
    <button type="button" data-as="button" onClick={onClick} {...shared}>
      {inner}
    </button>
  ) : (
    <div {...shared}>{inner}</div>
  );
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

/**
 * A page's head: the title (30px, focusable so the shell can move focus to it
 * after a Next tap), the lede, the page's own actions, and the ‹ › neighbour
 * buttons, which drop onto their own row when the page is narrow.
 */
export function PageHead({
  title,
  lede,
  actions,
  prev,
  next,
  go,
}: {
  title: string;
  lede: ReactNode;
  actions?: ReactNode;
  prev: RecordPage | null;
  next: RecordPage;
  go: CodexGo;
}) {
  return (
    <header className="cx-page-head">
      <div className="cx-page-head__text">
        <h2 className="cx-page-title" tabIndex={-1} data-cx-page-title="">
          {title}
        </h2>
        <p className="cx-page-lede">{lede}</p>
      </div>
      {actions ? <div className="cx-page-head__actions">{actions}</div> : null}
      <nav className="cx-page-head__nav" aria-label="Pages">
        {prev ? (
          <Btn icon={ChevronLeft} aria-label={`Previous page: ${pageLabelOf(prev)}`} onClick={() => go(prev)}>
            {pageLabelOf(prev)}
          </Btn>
        ) : null}
        <Btn iconEnd={ChevronRight} aria-label={`Next page: ${pageLabelOf(next)}`} onClick={() => go(next)}>
          {pageLabelOf(next)}
        </Btn>
      </nav>
    </header>
  );
}

/**
 * The card at the bottom of a page that walks on to the next one. The whole
 * card is one button. From Account it reads "Done" and goes back to the
 * Overview.
 */
export function NextCard({ to, done, go }: { to: RecordPage; done: boolean; go: CodexGo }) {
  const page = RECORD_PAGES.find((p) => p.id === to);
  return (
    <button type="button" className="cx-next" onClick={() => go(to)}>
      <span className="cx-next__text">
        <span className="cx-eyebrow">{done ? "Done" : "Next"}</span>
        <span className="cx-next__label">{page?.label ?? to}</span>
        {page?.blurb ? <span className="cx-next__blurb">{page.blurb}</span> : null}
      </span>
      <ChevronRight className="cx-next__icon" size={24} aria-hidden="true" />
    </button>
  );
}

/**
 * A whole page: its head (with the neighbours worked out from its id), its
 * content, and the Next card. The Overview is not a Page — it has no head,
 * no neighbours and no Next card.
 */
export function Page({
  id,
  title,
  lede,
  actions,
  go,
  children,
}: {
  id: RecordPage;
  title: string;
  lede: ReactNode;
  actions?: ReactNode;
  go: CodexGo;
  children?: ReactNode;
}) {
  const { prev, next, nextIsDone } = neighbours(id);
  return (
    <div className="cx-page-body" data-cx-page={id}>
      <PageHead title={title} lede={lede} actions={actions} prev={prev} next={next} go={go} />
      {children}
      <NextCard to={next} done={nextIsDone} go={go} />
    </div>
  );
}
