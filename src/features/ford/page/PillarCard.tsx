/**
 * ONE PILLAR — Family, Occupation, Recreation or Dreams. Every pillar card is
 * built the same way, so a trainer learns one and reads all four:
 *
 *   head       the letter mark, the name, FORD's own one-line blurb, and the
 *              actions — Edit / Done (Occupation and Recreation, whose bands
 *              are record fields) and Add (a new detail under this pillar)
 *   band       what the record already knows (bands.tsx)
 *   facts      every standing fact, oldest first — a paragraph that grew
 *   items      FORD's moments and the older life notes filed here, newest
 *              first; three, then "Show all"
 *   Pulse      what the Pulse says about this part of life, side by side
 *   gap        "Nothing on file yet." — only once FORD and the older notes
 *              have both answered, and there is nothing
 *   Ask next   the question worth asking next time
 *
 * No count chip on the head: a count reads as a score. A detail opens in the
 * dialog (its pin and its gesture live there); an older note is read only —
 * it is a journal note, kept where it was written.
 */
import { useState, type ReactNode } from "react";
import { Activity, Plus } from "lucide-react";
import { Btn, EditButton, FordMark, anchorProps, cls, inTime } from "../../client-codex/kit";
import { FORD_META, GESTURE_STATUS_LABEL, type FordEntry, type FordPillar } from "../types";
import { attribution } from "../ui";
import { detailWhen, olderNoteMeta, shortDate, type PillarItem, type PillarList } from "../page-model";
import type { PulseLink } from "../pulse-links";
import type { NoteThread } from "../../client-notes/threads";

/** How many moments and older notes show before "Show all". */
export const PILLAR_ITEMS_SHOWN = 3;

/** What the FORD half of a card can say: FORD answered, is still loading, or could not be read. */
export type PillarFordState = "ready" | "loading" | "unread";

/** "Jess Moreno · Mar 11 · in 5 weeks · Idea: a good-luck card". */
function DetailMeta({ entry, now }: { entry: FordEntry; now: Date }) {
  const who = entry.isLegacy ? attribution(entry) : [entry.authorName?.trim(), shortDate(entry.occurredAt, now)].filter(Boolean).join(" · ");
  const when = detailWhen(entry, now);
  const opp = entry.opportunity;
  return (
    <span className="fordpg-item__meta">
      {who}
      {when ? (
        <>
          {who ? " · " : ""}
          <span className="fordpg-when" data-urgency={when.urgency}>
            {inTime(when.days)}
          </span>
          {when.annual ? " · every year" : ""}
        </>
      ) : null}
      {opp?.idea ? `${who || when ? " · " : ""}${GESTURE_STATUS_LABEL[opp.status]}: ${opp.idea}` : ""}
    </span>
  );
}

/** An older journal life note: read only, with its updates one tap away. */
export function OlderNoteItem({ thread, now }: { thread: NoteThread; now: Date }) {
  const [open, setOpen] = useState(false);
  const n = thread.updates.length;
  return (
    <div className="fordpg-item" data-kind="older-note">
      <span className="fordpg-item__text">{thread.root.body}</span>
      <span className="fordpg-item__meta">{olderNoteMeta(thread)}</span>
      {n > 0 ? (
        <>
          {open ? (
            <ul className="fordpg-updates">
              {thread.updates.map((u) => (
                <li key={u.id}>
                  <span className="fordpg-item__text">{u.body}</span>
                  <span className="fordpg-item__meta">
                    {[u.authorName?.trim(), shortDate(u.occurredAt, now)].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <Btn variant="quiet" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              {open ? "Hide the updates" : n === 1 ? "Show 1 update" : `Show ${n} updates`}
            </Btn>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Item({
  item,
  now,
  onOpen,
}: {
  item: PillarItem;
  now: Date;
  onOpen: ((entry: FordEntry) => void) | null;
}) {
  if (item.kind === "older-note") return <OlderNoteItem thread={item.thread} now={now} />;
  const { entry } = item;
  const body = (
    <>
      <span className="fordpg-item__text">{entry.body}</span>
      <DetailMeta entry={entry} now={now} />
    </>
  );
  return onOpen ? (
    <button type="button" className="fordpg-item" data-kind="detail" onClick={() => onOpen(entry)}>
      {body}
    </button>
  ) : (
    <div className="fordpg-item" data-kind="detail">
      {body}
    </div>
  );
}

export function PillarCard({
  pillar,
  band,
  edit,
  list,
  fordState,
  olderKnown,
  pulseLinks,
  askLine,
  now,
  onOpen,
  onAdd,
}: {
  pillar: FordPillar;
  band: ReactNode;
  /** Edit / Done for a band of record fields; absent when the band is read only or the reader may not edit. */
  edit?: { open: boolean; onToggle: () => void } | null;
  list: PillarList;
  fordState: PillarFordState;
  /** The older life notes answered, so an empty pillar may say so. */
  olderKnown: boolean;
  pulseLinks: readonly PulseLink[];
  askLine: ReactNode;
  now: Date;
  /** Opens a FORD detail; null for a reader who may not write FORD (the details are then read only). */
  onOpen: ((entry: FordEntry) => void) | null;
  /** A new detail under this pillar; null when this reader may not write FORD. */
  onAdd: (() => void) | null;
}) {
  const [all, setAll] = useState(false);
  const meta = FORD_META[pillar];
  const items = all ? list.items : list.items.slice(0, PILLAR_ITEMS_SHOWN);
  const empty = list.total === 0;

  return (
    <section className={cls("cx-card", "fordpg-pillar")} aria-labelledby={`fordpg-${pillar}-name`} {...anchorProps(`ford-${pillar}`)}>
      <div className="fordpg-pl-head">
        <FordMark pillar={pillar} size={40} />
        <div className="fordpg-pl-name">
          <h3 className="fordpg-pl-name__label" id={`fordpg-${pillar}-name`}>
            {meta.label}
          </h3>
          <span className="fordpg-pl-name__blurb">{meta.blurb}</span>
        </div>
        {edit || onAdd ? (
          <div className="fordpg-pl-acts">
            {edit ? <EditButton open={edit.open} onToggle={edit.onToggle} label={meta.label} /> : null}
            {onAdd ? (
              <Btn icon={Plus} aria-label={`Add a ${meta.label} detail`} onClick={onAdd}>
                Add
              </Btn>
            ) : null}
          </div>
        ) : null}
      </div>

      {band}

      <div className="fordpg-pl-body">
        {list.pinned.length > 0 ? (
          <ul className="fordpg-facts">
            {list.pinned.map((entry) => (
              <li key={entry.id}>
                {onOpen ? (
                  <button type="button" className="fordpg-fact" onClick={() => onOpen(entry)}>
                    {entry.body}
                  </button>
                ) : (
                  <span className="fordpg-fact">{entry.body}</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}

        {items.map((item) => (
          <Item key={item.key} item={item} now={now} onOpen={onOpen} />
        ))}
        {list.items.length > PILLAR_ITEMS_SHOWN ? (
          <div>
            <Btn variant="quiet" aria-expanded={all} onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer" : `Show all ${list.items.length}`}
            </Btn>
          </div>
        ) : null}

        {fordState === "loading" ? <p className="fordpg-quiet">Loading…</p> : null}
        {empty && fordState === "ready" && olderKnown ? <p className="fordpg-gap">Nothing on file yet.</p> : null}

        {pulseLinks.map((link) => (
          <p key={link.key} className="fordpg-pulse">
            <Activity size={14} aria-hidden="true" className="fordpg-pulse__icon" />
            <span>{link.sentence}</span>
          </p>
        ))}

        {askLine}
      </div>
    </section>
  );
}
