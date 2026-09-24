/**
 * THE OVERVIEW — the codex's front page, where the tab always opens (AJ's
 * decision 1).
 *
 * INTERIM (the shell phase): the Notes band, then one door per page. The
 * full Overview — FORD at a glance, the body, the why, the story, the
 * account — is built in its own phase from the selectors each page area
 * exports; until those exist, a door that says what is behind it is more
 * honest than a slot guessing at it.
 *
 * Zero reads: everything here is the tab's one load (CodexData). Nothing on
 * it is a score — counts are facts with their words beside them — and a read
 * that failed says so in its own sentence, never "No notes".
 */
import type { ReactNode } from "react";
import { NotebookPen, PenLine, ChevronRight } from "lucide-react";
import { RECORD_PAGES, isRecordAnchor, noteAnchor, type RecordPage } from "../../client-profile/profile-nav";
import {
  notesSummarySentence,
  threadRowMeta,
} from "../../client-notes/record-selectors";
import { sortThreads, zoneOf } from "../../client-notes/threads";
import type { SubnavItem } from "../../client-profile/ProfileSubnav";
import { Btn, EmptyLine, LoudChip, Meta, Row, Rows, Slot, firstSentences, plural } from "../kit";
import type { CodexPageProps } from "../codex-data";

/** How many open notes the band shows before "All notes". */
const OPEN_ROWS = 3;

/** The pages the Overview has a door to, in order: everything but itself and Notes (the band is Notes' door). */
const DOORS: readonly RecordPage[] = ["ford", "body", "goals", "story", "account"];

export function OverviewPage({
  data,
  go,
  items,
}: CodexPageProps & {
  /** The sub-toggle's lines: each door says what its segment says. */
  items: readonly SubnavItem<RecordPage>[];
}) {
  const { notes, today, machines } = data;
  const machineName = (id: string | null | undefined) =>
    id ? machines.find((m) => m.id === id)?.name?.trim() || null : null;

  const open = sortThreads(notes.record.listed.filter((t) => zoneOf(t, today) === "open")).slice(0, OPEN_ROWS);
  const total = notes.summary ? notes.summary.total + notes.summary.unfiled : null;

  const openThread = (threadId: string) => {
    const anchor = noteAnchor(threadId);
    go("notes", isRecordAnchor(anchor) ? anchor : undefined);
  };

  let band: ReactNode;
  if (notes.state === "failed") {
    band = <Meta>Notes couldn't be loaded, so nothing here is certain.</Meta>;
  } else if (notes.state === "loading" || !notes.summary) {
    band = <Meta>Loading notes…</Meta>;
  } else if (notes.summary.total + notes.summary.unfiled === 0) {
    band = <EmptyLine>No notes in Journey yet.</EmptyLine>;
  } else {
    band = (
      <>
        <Meta>
          {notesSummarySentence(notes.summary)}
          {data.journal.capped ? " · some older items not loaded" : ""}
        </Meta>
        {open.length > 0 ? (
          <Rows>
            {open.map((t) => {
              const machine = machineName(t.root.machineId);
              return (
                <Row
                  key={t.id}
                  label={<LoudChip importance={t.root.importance} />}
                  meta={threadRowMeta(t, "open", today)}
                  onClick={() => openThread(t.id)}
                >
                  {machine ? <span className="cx-ov-note__machine">{machine}: </span> : null}
                  {firstSentences(t.root.body ?? "", 120)}
                </Row>
              );
            })}
          </Rows>
        ) : notes.summary.standing > 0 ? (
          <Meta>Nothing open. {plural(notes.summary.standing, "standing note is", "standing notes are")} on Notes.</Meta>
        ) : null}
      </>
    );
  }

  return (
    <div className="cx-ov" data-cx-page="overview">
      <Slot
        eyebrow="Notes"
        icon={NotebookPen}
        open={
          <>
            <Btn variant="live" icon={PenLine} onClick={() => go("notes", "notes-compose")}>
              Write a note
            </Btn>
            <Btn iconEnd={ChevronRight} onClick={() => go("notes")}>
              {total !== null && total > 0 ? `All ${plural(total, "note")}` : "Notes"}
            </Btn>
          </>
        }
      >
        {band}
      </Slot>

      <div className="cx-ov-doors">
        {DOORS.map((id) => {
          const page = RECORD_PAGES.find((p) => p.id === id)!;
          const meta = items.find((i) => i.id === id)?.meta ?? null;
          return (
            <Slot key={id} as="button" eyebrow={page.label} go={() => go(id)}>
              <span>{page.blurb}</span>
              {meta ? <span className="cx-ov-door__meta">{meta}</span> : null}
            </Slot>
          );
        })}
      </div>
    </div>
  );
}
