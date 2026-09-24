/**
 * HER WHY — what brought her in, in her words, and what else says so.
 *
 * Client codex, Sep 2026 (phase 14). The long scroll's "original why" was an
 * input box on a blue panel. It is now a read view: the why on her record
 * (`globalNotes`) as a 17px lede in curly quotes — quote marks already typed
 * round it are taken off first, so it never reads ““…”” — and Edit on demand,
 * which writes through the shell's ONE record form; the Save bar saves it.
 *
 * Under a hairline, the other places her why is written, each verbatim and
 * read only:
 *
 *   In Mindbody (long-term goal)   the client index, as Mindbody spells it
 *   At consultation                what she said at the consultation
 *   At sign-up (Mindbody notes)    the Goals lines of her Mindbody notes (the
 *                                  intake matcher fills these; Account is the
 *                                  one place a line is ever copied anywhere)
 *   Dreams (FORD)                  her newest standing Dreams detail, with a
 *                                  door to it — only once FORD answered for a
 *                                  reader it lets in. Loading, couldn't read
 *                                  and "kept by the home studio" are said as
 *                                  such, never "nothing in Dreams".
 */
import { ChevronRight, Heart, Link2 } from "lucide-react";
import type { ReactNode } from "react";
import type { Client } from "../../types";
import {
  Btn,
  CardHead,
  Chip,
  EditButton,
  EmptyLine,
  Lede,
  Meta,
  Source,
  TextArea,
  anchorProps,
  cap,
  cls,
  curly,
  useReadEdit,
  type CodexGo,
  type Pronouns,
} from "../client-codex/kit";
import type { RecordAnchor } from "../client-profile/profile-nav";
import { withoutOuterQuotes, type DreamsLink, type HerWhyLinks } from "./goals-page";
import "./goals.css";

export interface HerWhyCardProps {
  /** The why as the form holds it (globalNotes). */
  value: string;
  updateField: (key: keyof Client, value: unknown) => void;
  links: HerWhyLinks;
  canEdit: boolean;
  dirty: boolean;
  revision: number;
  pronouns: Pronouns;
  go: CodexGo;
  id?: RecordAnchor;
  className?: string;
}

/** The Dreams line's words, for each answer FORD can give. */
function dreamsWords(d: DreamsLink): string {
  switch (d.status) {
    case "ok":
      return d.text;
    case "none":
      return "Nothing in Dreams yet.";
    case "loading":
      return "Reading FORD…";
    case "failed":
      return "Couldn't read FORD just now.";
    case "home-only":
      return "FORD is kept by the home studio.";
  }
}

function LinkLine({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="gf-link">
      <Link2 className="gf-link__icon" size={14} aria-hidden="true" />
      <span className="gf-link__text">
        <span className="gf-link__key">{label}:</span> {children}
      </span>
      {action}
    </div>
  );
}

export function HerWhyCard({
  value,
  updateField,
  links,
  canEdit,
  dirty,
  revision,
  pronouns: p,
  go,
  id = "goals-why",
  className,
}: HerWhyCardProps) {
  const { open, toggle, setOpen } = useReadEdit({ canEdit, revision });
  const title = `${cap(p.possessive)} why`;
  const why = withoutOuterQuotes(value);
  const dreamsDoor = links.dreams.status === "ok" || links.dreams.status === "none";

  return (
    <section className={cls("cx-card", className)} data-editing={open ? "" : undefined} {...anchorProps(id)}>
      <CardHead
        eyebrow={title}
        icon={Heart}
        meta={dirty && !open ? <Chip tone="live">Unsaved</Chip> : null}
        actions={canEdit ? <EditButton open={open} onToggle={toggle} label={title} /> : null}
      />

      {open ? (
        <div className="gf-edit">
          <TextArea
            label={title}
            value={value}
            onChange={(v) => updateField("globalNotes", v)}
            rows={3}
            placeholder="e.g. “I want to be able to garden again without my back giving out.”"
            hint={`What actually brought ${p.object} in. In ${p.possessive} words, not yours.`}
          />
          <Meta>Nothing is saved until you tap Save changes on the bar at the bottom.</Meta>
        </div>
      ) : why ? (
        <>
          <Lede>{curly(why)}</Lede>
          <Source>{`${cap(p.possessive)} why, as it's written on ${p.possessive} record`}</Source>
        </>
      ) : (
        <EmptyLine action={canEdit ? { label: "Write it", onClick: () => setOpen(true) } : undefined}>
          {`Not written yet. What brought ${p.object} in, in ${p.possessive} words.`}
        </EmptyLine>
      )}

      <div className="gf-links">
        {links.longTermGoal ? <LinkLine label="In Mindbody (long-term goal)">{links.longTermGoal}</LinkLine> : null}
        {links.consultation ? <LinkLine label="At consultation">{curly(links.consultation)}</LinkLine> : null}
        {links.signUp.map((line, i) => (
          <LinkLine key={i} label="At sign-up (Mindbody notes)">
            {curly(line)}
          </LinkLine>
        ))}
        <LinkLine
          label="Dreams (FORD)"
          action={
            dreamsDoor ? (
              <Btn iconEnd={ChevronRight} aria-label="Open Dreams on FORD" onClick={() => go("ford", "ford-dreams")}>
                Open
              </Btn>
            ) : null
          }
        >
          {dreamsWords(links.dreams)}
        </LinkLine>
      </div>
    </section>
  );
}
