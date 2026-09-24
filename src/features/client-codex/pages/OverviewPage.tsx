/**
 * THE OVERVIEW — the codex's front page, where the tab always opens (AJ's
 * decision 1).
 *
 * Client codex, Sep 2026 (phase 18; the shell's interim version was the Notes
 * band and one door per page). Six slots, as the approved mockup has them:
 *
 *   Notes            the counts and the three loudest open notes, "Write a
 *                    note" and "All N notes" — a section: each row is a door
 *                    to its thread on Notes
 *   Who she is       FORD: the In one line, the four pillars (each a door to
 *                    its card), Coming up and Above and beyond — a section
 *   Body & Pulse     her build against the machines, the flags, the first
 *                    "every set" watch-out QUOTED, what she says in the Pulse
 *   Goals & Focus    her why, what she is working toward, the newest focus,
 *                    how to coach her
 *   Story            since when, and the three newest moments
 *   Account          age and birthday, emergency, the waiver · what is left,
 *                    the package, where she trains
 *
 * The last four are each ONE button (the whole slot is the door), so they
 * hold no other control and only phrasing content.
 *
 * Every word is worked out in `overview-model.ts` from the selectors the page
 * behind each slot already uses — read its header for the rules. ZERO READS:
 * everything is the tab's one load (`CodexData`). Nothing here is a score, a
 * read that failed says so in its own sentence (never "none"), FORD text is
 * shown only to a reader the FORD rule lets in and only once FORD answered,
 * and the client's name is the header's, never repeated here.
 *
 * No PageHead, no neighbours, no Next card: the Overview is not a Page. Its
 * slots carry no anchors (the registry is the pages' cards).
 *
 * Portrait first (codex.css): one column on a 744pt iPad held upright; from
 * 720px of page width (820, 834 and the 13-inch upright) FORD 7 / Body 5 and
 * Goals 7 / Story 5, Account across in two columns; from 1040px, which is
 * landscape, FORD 8 / Body 4.
 */
import { Fragment, useMemo } from "react";
import { BookOpen, ChevronRight, Heart, HeartPulse, NotebookPen, PenLine, ShieldCheck, Target } from "lucide-react";
import { LoadingMark } from "../../../components/LoadingMark";
import { isRecordAnchor, noteAnchor } from "../../client-profile/profile-nav";
import { Btn, Chip, EmptyLine, Eyebrow, FordMark, Lede, LoudChip, Meta, Row, Rows, Slot, curly } from "../kit";
import { fordEyebrow, overviewModel } from "../overview-model";
import type { CodexPageProps } from "../codex-data";

export function OverviewPage({ data, go }: CodexPageProps) {
  const model = useMemo(
    () =>
      overviewModel({
        client: data.client,
        today: data.today,
        access: data.access,
        pronouns: data.pronouns,
        machines: data.machines,
        notes: data.notes,
        journal: data.journal,
        ford: data.ford,
        fordStatus: data.fordStatus,
        pulse: data.pulse,
        story: data.story,
        studios: data.availableStudios,
      }),
    [data],
  );
  const { notes, ford, body, goals, story, account } = model;

  const openThread = (threadId: string) => {
    const anchor = noteAnchor(threadId);
    go("notes", isRecordAnchor(anchor) ? anchor : undefined);
  };

  return (
    <div className="cx-ov" data-cx-page="overview">
      {/* ---- Notes ---------------------------------------------------- */}
      <Slot
        className="cx-ov-notes"
        eyebrow="Notes"
        icon={NotebookPen}
        open={
          <>
            <Btn variant="live" icon={PenLine} onClick={() => go("notes", "notes-compose")}>
              Write a note
            </Btn>
            <Btn iconEnd={ChevronRight} onClick={() => go("notes")}>
              {notes.allLabel}
            </Btn>
          </>
        }
      >
        {notes.none ? (
          <EmptyLine>{notes.line}</EmptyLine>
        ) : notes.state === "failed" ? (
          <p className="cx-ov-notice" data-testid="ov-notes-notice">
            {notes.line}
          </p>
        ) : notes.state === "loading" ? (
          <div className="cx-ov-wait">
            <LoadingMark size="sm" label="" />
            <Meta>{notes.line}</Meta>
          </div>
        ) : (
          <>
            <Meta>{notes.line}</Meta>
            {notes.rows.length > 0 ? (
              <Rows>
                {notes.rows.map((r) => (
                  <Row
                    key={r.threadId}
                    label={<LoudChip importance={r.importance} />}
                    meta={r.meta}
                    onClick={() => openThread(r.threadId)}
                  >
                    {r.machine ? <span className="cx-ov-note__machine">{r.machine}: </span> : null}
                    {r.text}
                  </Row>
                ))}
              </Rows>
            ) : notes.nothingOpen ? (
              <Meta>{notes.nothingOpen}</Meta>
            ) : null}
          </>
        )}
      </Slot>

      {/* ---- FORD ------------------------------------------------------ */}
      <Slot
        className="cx-ov-ford"
        eyebrow={fordEyebrow(data.pronouns)}
        icon={Heart}
        open={
          <Btn variant="quiet" iconEnd={ChevronRight} onClick={() => go("ford")}>
            Open FORD
          </Btn>
        }
      >
        {ford.notice && ford.state === "loading" ? (
          <div className="cx-ov-wait">
            <LoadingMark size="sm" label="" />
            <p className="cx-ov-notice" data-testid="ov-ford-notice">
              {ford.notice}
            </p>
          </div>
        ) : ford.notice ? (
          <p className="cx-ov-notice" data-testid="ov-ford-notice">
            {ford.notice}
          </p>
        ) : null}
        {ford.line ? (
          <div className="cx-ov-line">
            <Lede as="span" className="cx-ov-line__text">
              <span data-testid="ov-one-line">{ford.line.text}</span>
            </Lede>
            <Meta>{ford.line.meta}</Meta>
          </div>
        ) : ford.lineMissing ? (
          <div className="cx-ov-line" data-missing="">
            <span className="cx-ov-quiet">{ford.lineMissing}</span>
            {ford.writeLine ? (
              <Btn variant="live" icon={PenLine} onClick={() => go("ford", "ford-one-line")}>
                Write one
              </Btn>
            ) : null}
          </div>
        ) : null}

        {ford.tiles.length > 0 ? (
          <div className="cx-ov-pillars">
            {ford.tiles.map((t) => (
              <button
                key={t.pillar}
                type="button"
                className="cx-ov-pillar"
                data-pillar={t.pillar}
                onClick={() => go("ford", `ford-${t.pillar}`)}
              >
                <span className="cx-ov-pillar__head">
                  <FordMark pillar={t.pillar} size={30} />
                  {t.label}
                </span>
                {t.lead ? <span className="cx-ov-pillar__lead">{t.lead}</span> : null}
                {t.empty ? <span className="cx-ov-pillar__empty">{t.empty}</span> : null}
                {t.ask ? <span className="cx-ov-pillar__ask">{t.ask}</span> : null}
                {t.meta ? <span className="cx-ov-pillar__meta">{t.meta}</span> : null}
              </button>
            ))}
          </div>
        ) : null}

        {ford.dates && ford.gestures ? (
          <div className="cx-ov-ford-foot">
            <div className="cx-ov-mini">
              <Eyebrow as="h4">Coming up</Eyebrow>
              {ford.dates.length > 0 ? (
                ford.dates.map((d) => (
                  <p key={d.key} className="cx-ov-mini__row">
                    <span className="cx-ov-when" data-urgency={d.urgency}>
                      {d.when}
                    </span>
                    <span>{d.what}</span>
                  </p>
                ))
              ) : (
                <p className="cx-ov-quiet">{ford.datesEmpty}</p>
              )}
            </div>
            <div className="cx-ov-mini">
              <Eyebrow as="h4">Above and beyond</Eyebrow>
              {ford.gestures.length > 0 ? (
                ford.gestures.map((g) => (
                  <p key={g.key} className="cx-ov-mini__row">
                    <Chip>{g.status}</Chip>
                    <span>
                      {g.idea} · {g.owner}
                    </span>
                  </p>
                ))
              ) : (
                <p className="cx-ov-quiet">{ford.gesturesEmpty}</p>
              )}
            </div>
          </div>
        ) : null}
      </Slot>

      {/* ---- Body & Pulse ---------------------------------------------- */}
      <Slot
        as="button"
        className="cx-ov-body"
        eyebrow="Body & Pulse"
        icon={HeartPulse}
        go={() => go("body")}
        footer={body.foot || undefined}
      >
        <Lede as="span">{body.lede}</Lede>
        {body.chips.length > 0 ? (
          <span className="cx-chips">
            {body.chips.map((c) => (
              <Chip key={c.id} tone={c.tone}>
                {c.text}
              </Chip>
            ))}
          </span>
        ) : (
          <span className="cx-ov-quiet">{body.chipsEmpty}</span>
        )}
        <span className="cx-ov-lines">
          {body.everySet ? (
            <span data-testid="ov-every-set">
              <b>Every set:</b> {curly(body.everySet.quote)}
              {body.everySet.more > 0 ? ` (+${body.everySet.more} more on Body & Pulse)` : ""}
            </span>
          ) : null}
          <span data-testid="ov-says">
            {body.says.label ? <b>{body.says.label}</b> : null}
            {body.says.label ? " " : ""}
            {body.says.text}
          </span>
        </span>
      </Slot>

      {/* ---- Goals & Focus --------------------------------------------- */}
      <Slot
        as="button"
        className="cx-ov-goals"
        eyebrow="Goals & Focus"
        icon={Target}
        go={() => go("goals")}
        footer={goals.foot || undefined}
      >
        {goals.why ? (
          <Lede as="span">{curly(goals.why)}</Lede>
        ) : (
          <span className="cx-ov-quiet">{goals.whyMissing}</span>
        )}
        <span className="cx-ov-lines">
          {goals.lines.map((l) => (
            <span key={l.label}>
              <b>{l.label}</b> {l.importance ? <LoudChip importance={l.importance} /> : null}
              {l.importance ? " " : ""}
              {l.text}
            </span>
          ))}
        </span>
      </Slot>

      {/* ---- Story ----------------------------------------------------- */}
      <Slot as="button" className="cx-ov-story" eyebrow="Story" icon={BookOpen} go={() => go("story")}>
        <Lede as="span">{story.lede}</Lede>
        {story.rows.length > 0 ? (
          <span className="cx-ov-story-rows">
            {story.rows.map((r) => (
              <Fragment key={r.key}>
                <span className="cx-ov-story-rows__day">{r.day}</span>
                <span>{r.text}</span>
              </Fragment>
            ))}
          </span>
        ) : null}
        {story.empty ? <span className="cx-ov-quiet">{story.empty}</span> : null}
        {story.unread ? <span className="cx-ov-quiet">{story.unread}</span> : null}
      </Slot>

      {/* ---- Account --------------------------------------------------- */}
      <Slot
        as="button"
        className="cx-ov-account"
        eyebrow="Account · contact and membership"
        icon={ShieldCheck}
        go={() => go("account")}
        footer={account.foot}
      >
        {account.empty ? (
          <span className="cx-ov-quiet">{account.empty}</span>
        ) : (
          <span className="cx-ov-acct">
            {[account.who, account.membership]
              .filter((column) => column.length > 0)
              .map((column) => (
                <span key={column[0]} className="cx-ov-lines">
                  {column.map((l) => (
                    <span key={l}>{l}</span>
                  ))}
                </span>
              ))}
          </span>
        )}
      </Slot>
    </div>
  );
}
