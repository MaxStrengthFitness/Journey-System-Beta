/**
 * HOW TO COACH HER — the coach strategy on her record, then her Preference
 * and Coaching-tip notes as they are on Notes.
 *
 * Client codex, Sep 2026 (phase 14). It heads Goals & Focus (the mockup's
 * "how to be the best trainer for her") and stores nothing new:
 *
 *   The strategy   `discoveryNotes`, quoted with its own line breaks, "Coach
 *                  strategy, on her record". Edit writes through the shell's
 *                  ONE record form; the Save bar saves it.
 *   From her notes the threads Notes lists as Preference and Coaching tip
 *                  that are still true (`howToCoachRows`, over Notes'
 *                  `howToCoachThreads` — by KIND, so a legacy session wrap-up
 *                  is never a "Preference"), loudest first, labelled in
 *                  Notes' one vocabulary. Heads up and Critical show their
 *                  Loudness; a machine is named first, in full. A row folds a
 *                  long note to two lines — the whole thread is one tap away,
 *                  on Notes.
 *
 * A read of the notes that has not answered or failed is said to be so,
 * never "No coaching tips yet".
 */
import type { ReactNode } from "react";
import { ChevronRight, Users } from "lucide-react";
import type { Client, Machine } from "../../types";
import type { JournalLoad } from "../../hooks/useClientJournal";
import type { NoteThread } from "../client-notes/threads";
import { NoteCategoryIcon } from "../client-notes/NoteCategoryChips";
import {
  Btn,
  CardHead,
  Chip,
  EditButton,
  EmptyLine,
  Eyebrow,
  LoudChip,
  Meta,
  Row,
  Rows,
  Source,
  TextArea,
  anchorProps,
  cap,
  cls,
  plural,
  useReadEdit,
  type CodexGo,
  type Pronouns,
} from "../client-codex/kit";
import type { RecordAnchor } from "../client-profile/profile-nav";
import { howToCoachRows } from "./goals-page";
import "./goals.css";

export interface HowToCoachCardProps {
  /** The coach strategy as the form holds it (discoveryNotes). */
  value: string;
  updateField: (key: keyof Client, value: unknown) => void;
  /** The tab's one journal load: its threads, and whether they answered. */
  threads: readonly NoteThread[] | null | undefined;
  notesState: JournalLoad;
  today: string;
  machines: readonly Machine[];
  canEdit: boolean;
  dirty: boolean;
  revision: number;
  pronouns: Pronouns;
  go: CodexGo;
  /** Opens one thread on Notes. */
  onOpenThread: (threadId: string) => void;
  id?: RecordAnchor;
  className?: string;
}

export function HowToCoachCard({
  value,
  updateField,
  threads,
  notesState,
  today,
  machines,
  canEdit,
  dirty,
  revision,
  pronouns: p,
  go,
  onOpenThread,
  id = "goals-coach",
  className,
}: HowToCoachCardProps) {
  const { open, toggle, setOpen } = useReadEdit({ canEdit, revision });
  const title = `How to coach ${p.object}`;
  const strategy = (value ?? "").replace(/\r\n?/g, "\n").trim();
  const { rows, total } = notesState === "ready" ? howToCoachRows(threads, today) : { rows: [], total: 0 };
  const machineName = (machineId: string | null) =>
    machineId ? machines.find((m) => m.id === machineId)?.name?.trim() || null : null;

  let notes: ReactNode;
  if (notesState === "loading") {
    notes = <Meta>{`Loading ${p.possessive} notes…`}</Meta>;
  } else if (notesState === "failed") {
    notes = <Meta>{`Couldn't load ${p.possessive} notes just now, so a coaching tip or preference may be missing.`}</Meta>;
  } else if (rows.length === 0) {
    notes = (
      <EmptyLine action={{ label: "Write one in Notes", onClick: () => go("notes", "notes-compose") }}>
        No coaching tips or preferences written yet.
      </EmptyLine>
    );
  } else {
    notes = (
      <>
        <Rows>
          {rows.map((r) => {
            const machine = machineName(r.machineId);
            return (
              <Row
                key={r.threadId}
                className="gf-row"
                label={
                  <span className="gf-row__kind">
                    <NoteCategoryIcon id={r.category} className="gf-row__icon" />
                    {r.label}
                  </span>
                }
                meta={r.loud ? <LoudChip importance={r.importance} /> : undefined}
                onClick={() => onOpenThread(r.threadId)}
              >
                <span className="gf-row__text" data-testid={`coach-row-${r.threadId}`}>
                  {machine ? <b className="gf-row__machine">{`${machine}: `}</b> : null}
                  {r.text}
                </span>
              </Row>
            );
          })}
        </Rows>
        {total > rows.length ? (
          <div className="gf-buttons">
            <Btn iconEnd={ChevronRight} onClick={() => go("notes")}>
              {`All ${total} in Notes`}
            </Btn>
          </div>
        ) : null}
        <Source>{`${cap(p.possessive)} Preference and Coaching-tip notes, as they are in Notes. Nothing new is stored.`}</Source>
      </>
    );
  }

  return (
    <section className={cls("cx-card", className)} data-editing={open ? "" : undefined} {...anchorProps(id)}>
      <CardHead
        eyebrow={title}
        icon={Users}
        meta={dirty && !open ? <Chip tone="live">Unsaved</Chip> : null}
        actions={canEdit ? <EditButton open={open} onToggle={toggle} label={title} /> : null}
      />

      {open ? (
        <div className="gf-edit">
          <TextArea
            label="Coach strategy"
            value={value}
            onChange={(v) => updateField("discoveryNotes", v)}
            rows={5}
            placeholder="How do you coach this client? What cues land?"
            hint="The first paragraph leads How to coach on Body & Pulse and the Overview."
          />
          <Meta>Nothing is saved until you tap Save changes on the bar at the bottom.</Meta>
        </div>
      ) : strategy ? (
        <>
          <p className="gf-strategy">{strategy}</p>
          <Source>{`Coach strategy, on ${p.possessive} record`}</Source>
        </>
      ) : (
        <EmptyLine action={canEdit ? { label: "Write it", onClick: () => setOpen(true) } : undefined}>
          No coach strategy written yet.
        </EmptyLine>
      )}

      <Eyebrow as="h4">{rows.length > 0 ? `From ${p.possessive} notes · ${plural(total, "note")}` : `From ${p.possessive} notes`}</Eyebrow>
      {notes}
    </section>
  );
}
