/**
 * LIFE — the FORD hub on the client profile.
 *
 * This replaces the old "Lifestyle" dossier section, which held seven
 * dropdowns and a journal rail that could never render anything (nothing in
 * the app ever set `profileSection: "lifestyle"`, so the filter always came
 * back empty). It was the least-read section on the most-read screen.
 *
 * WHAT IS ON IT, IN THE ORDER IT MATTERS
 * --------------------------------------
 *   1. COMING UP. Dated details from today forward. The only part of this
 *      screen that is a to-do list, so it goes first: a graduation eight days
 *      out is worth more than a beautifully filed fact.
 *   2. THE UNFILED TRAY. Details caught on the floor with no pillar yet. One
 *      tap files each one. Framed as tidying, never as an error — an untagged
 *      capture means a trainer kept their eyes on the client, which is the
 *      behaviour we want.
 *   3. THE FOUR PILLARS. Two up on a landscape iPad, stacked in portrait.
 *      Standing facts at the top of each, reading as a short paragraph;
 *      dated moments beneath, newest first.
 *
 * The training-load fields that used to live in Lifestyle (activity level,
 * recovery, experience, training pedigree) are NOT here. They are programming
 * inputs, not personal detail, and they moved to the Body section where the
 * rest of the load picture lives. Occupation moved into its pillar, and lead
 * source / referred by moved to Admin, where acquisition data belongs.
 */

import { useMemo, useState } from "react";
import { Plus, CalendarClock, Inbox, Gift, Pin, Info } from "lucide-react";
import type { Client, Machine } from "../../types";
import {
  FORD_META,
  type FordEntry,
  type FordPillar,
} from "./types";
import { useClientFord } from "./useClientFord";
import {
  archiveFordEntry,
  createFordEntry,
  fordStudioIdOf,
  tagFordEntry,
  updateFordEntry,
  type FordAuthor,
} from "./ford-write";
import { fordCanAdd, fordReadNotice } from "./read-status";
import { FordDetailDialog, type FordDetailValues } from "./FordDetailDialog";
import { FordMark, GestureChip, WhenChip, attribution, pillarPrompt } from "./ui";
import "./ford.css";

export interface FordSectionProps {
  client: Client;
  author: FordAuthor;
  /** Kept for parity with the other profile sections; unused today. */
  machines?: Machine[];
}

export function FordSection({ client, author }: FordSectionProps) {
  // The studio the read filters on is the studio a new detail is stamped
  // with, so a detail saved here always comes back in the list.
  const studioId = fordStudioIdOf(client);
  const { buckets, untagged, upcoming, isLoading, status } = useClientFord({
    clientId: client.id,
    client,
  });
  // "Nothing here yet" is a claim, and it is only true once FORD answered.
  // Refused (a cross-train visitor) or failed reads say so instead.
  const ready = status === "ready";
  const notice = fordReadNotice(status, studioId);
  // The database refuses a visitor's write, and one stamped with no studio,
  // so don't offer either.
  const canAdd = fordCanAdd(status, studioId);

  const [editing, setEditing] = useState<FordEntry | null>(null);
  const [adding, setAdding] = useState<FordPillar | null | "new">(null);

  const firstName = client.firstName || "them";
  const dialogOpen = editing !== null || adding !== null;

  const save = async (values: FordDetailValues) => {
    if (editing) {
      await updateFordEntry(client.id, editing.id, values);
      return;
    }
    await createFordEntry(client.id, studioId, author, {
      ...values,
      origin: "profile",
    });
  };

  const closeDialog = () => {
    setEditing(null);
    setAdding(null);
  };

  const total = useMemo(
    () => buckets.reduce((n, b) => n + b.pinned.length + b.moments.length, 0),
    [buckets],
  );

  return (
    <div className="ford-hub">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--ford-ink-muted)] leading-snug">
            The four things worth knowing about a person: their{" "}
            <strong className="text-[var(--ford-ink-2)]">family</strong>, their{" "}
            <strong className="text-[var(--ford-ink-2)]">occupation</strong>,
            what they do for{" "}
            <strong className="text-[var(--ford-ink-2)]">recreation</strong>,
            and what they{" "}
            <strong className="text-[var(--ford-ink-2)]">dream</strong> about.
            Catch it once, and anyone on the team can pick up the conversation.
          </p>
        </div>
        <button
          type="button"
          className="ford-btn ford-btn--primary"
          onClick={() => setAdding("new")}
          disabled={!canAdd}
        >
          <Plus size={15} />
          Add a detail
        </button>
      </div>

      {notice ? (
        <p className="ford-notice" role="status" data-testid="ford-read-notice">
          <Info size={16} aria-hidden className="shrink-0" />
          <span>{notice}</span>
        </p>
      ) : null}

      {/* ---- 1. COMING UP ---- */}
      {upcoming.length > 0 ? (
        <section className="ford-upnext" aria-label="Coming up">
          <div className="ford-upnext__head">
            <CalendarClock size={14} />
            Coming up
          </div>
          {upcoming.slice(0, 5).map(({ entry }) => (
            <button
              key={entry.id}
              type="button"
              className="ford-upnext__row"
              onClick={() => setEditing(entry)}
            >
              <FordMark pillar={entry.pillar} size={32} />
              <span className="ford-upnext__body">
                <span className="ford-upnext__text">{entry.body}</span>
                <span className="ford-upnext__meta">
                  {entry.opportunity
                    ? entry.opportunity.idea
                    : "No gesture planned yet"}
                </span>
              </span>
              <GestureChip entry={entry} />
              <WhenChip date={entry.eventDate} recurrence={entry.recurrence} />
            </button>
          ))}
        </section>
      ) : null}

      {/* ---- 2. THE UNFILED TRAY ---- */}
      {untagged.length > 0 ? (
        <section className="ford-tray" aria-label="Details not filed yet">
          <Inbox size={16} className="text-[var(--ford-unfiled)] shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="ford-tray__count">{untagged.length}</span>{" "}
            {untagged.length === 1 ? "detail" : "details"} caught on the floor,
            not filed yet.
            <ul className="ford-tray__list">
              {untagged.slice(0, 4).map((entry) => (
                <li key={entry.id} className="ford-tray__item">
                  <span className="ford-tray__quote">“{entry.body}”</span>
                  <span className="ford-tray__letters">
                    {(Object.keys(FORD_META) as FordPillar[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`ford-letter ford-letter--${p}`}
                        onClick={() => void tagFordEntry(client.id, entry.id, p)}
                        aria-label={`File under ${FORD_META[p].label}`}
                        title={FORD_META[p].label}
                      >
                        <span className="ford-letter__glyph">
                          {FORD_META[p].letter}
                        </span>
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ---- 3. THE FOUR PILLARS ---- */}
      <div className="ford-grid">
        {buckets.map((bucket) => {
          const meta = FORD_META[bucket.pillar];
          const count = bucket.pinned.length + bucket.moments.length;
          const empty = count === 0;

          return (
            <section
              key={bucket.pillar}
              className="ford-pillar"
              aria-label={meta.label}
            >
              <header className="ford-pillar__head">
                <FordMark pillar={bucket.pillar} />
                <div className="min-w-0">
                  <span className="ford-pillar__name">{meta.label}</span>
                  <span className="ford-pillar__blurb">{meta.blurb}</span>
                </div>
                <span className="ford-pillar__count">{count || ""}</span>
                <button
                  type="button"
                  className="ford-icon-btn"
                  onClick={() => setAdding(bucket.pillar)}
                  aria-label={`Add a ${meta.label} detail`}
                  disabled={!canAdd}
                >
                  <Plus size={17} />
                </button>
              </header>

              <div className="ford-pillar__body">
                {empty ? (
                  <p className="ford-empty">
                    {ready
                      ? "Nothing here yet."
                      : isLoading
                        ? "Loading…"
                        : status === "denied"
                          ? "Kept by the home studio."
                          : studioId
                            ? "Not loaded."
                            : "No home studio on file."}
                    {ready ? (
                      <span className="ford-empty__prompt">
                        Try: “{pillarPrompt(bucket.pillar)}”
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <>
                    {bucket.pinned.length > 0 ? (
                      <ul className="ford-facts">
                        {bucket.pinned.map((entry) => (
                          <li key={entry.id} className="ford-fact">
                            <button
                              type="button"
                              className="ford-fact__text"
                              onClick={() => setEditing(entry)}
                            >
                              {entry.body}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <ul className="ford-moments">
                      {bucket.moments.slice(0, 6).map((entry) => (
                        <li key={entry.id} className="ford-moment">
                          <div className="ford-moment__body">
                            <button
                              type="button"
                              className="ford-moment__text"
                              onClick={() => setEditing(entry)}
                            >
                              {entry.body}
                            </button>
                            <div className="ford-moment__meta">
                              <span>{attribution(entry)}</span>
                              <WhenChip
                                date={entry.eventDate}
                                recurrence={entry.recurrence}
                              />
                              <GestureChip entry={entry} />
                            </div>
                          </div>
                          {!entry.isLegacy ? (
                            <div className="ford-moment__actions">
                              <button
                                type="button"
                                className="ford-icon-btn"
                                title="Make it a standing fact"
                                aria-label="Make it a standing fact"
                                onClick={() =>
                                  void updateFordEntry(client.id, entry.id, {
                                    isPinned: true,
                                  })
                                }
                              >
                                <Pin size={15} />
                              </button>
                              <button
                                type="button"
                                className={`ford-icon-btn${entry.opportunity ? " ford-icon-btn--on" : ""}`}
                                title="Do something about it"
                                aria-label="Do something about it"
                                onClick={() => setEditing(entry)}
                              >
                                <Gift size={15} />
                              </button>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {total === 0 && untagged.length === 0 && ready ? (
        <p className="ford-empty">
          Nothing on {firstName} yet. The fastest way to fill this in is not
          this screen — it is the <strong>Remember this</strong> button on the
          Active Session, mid-conversation, while they are telling you.
        </p>
      ) : null}

      <FordDetailDialog
        open={dialogOpen}
        entry={editing}
        defaultPillar={adding && adding !== "new" ? adding : null}
        clientFirstName={firstName}
        author={author}
        onClose={closeDialog}
        onSave={save}
        onArchive={async (entry) => {
          await archiveFordEntry(client.id, entry.id);
        }}
      />
    </div>
  );
}
