/**
 * A STUDIO'S SETUP CHECKLIST — on its page in Admins (Setup), while its stage
 * is Setting up or Handed over (checklist.ts says what it is).
 *
 * Five blocks, each with a word for where it stands, and a sentence at the
 * top for the whole: "Not ready to hand over: 3 things left", the next thing
 * due, what is overdue. Items that tick themselves say why they are or
 * aren't done; the rest are ticked here. Anything can be skipped on purpose,
 * with its reason, and put back. An administrator may add an item of their
 * own to a block, with a due date.
 *
 * When blocks one to four are done or skipped, Mark it handed over sets the
 * stage; when the first week is done, Mark it running. Every change lands,
 * then leaves a line in the Activity record (setup-store.ts). A reason or an
 * item half typed joins the leave question.
 */
import { useState, type ReactNode } from "react";
import { Check, Circle, CircleHelp, Clock, ListChecks, Plus, RefreshCw, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Studio, Trainer } from "../../../types";
import { formatStudioDate } from "../../../lib/studio-time";
import { AdminButton, AdminField, AdminGrid, AdminInput, AdminNotice, AdminPanel, AdminSelect } from "../../admin/primitives";
import { useUnsavedChanges } from "../../unsaved-changes";
import { HqStatus } from "../kit";
import { dayLabel } from "../studios/stages";
import { andList } from "../activity/activity";
import {
  BLOCKS,
  SETUP_BLOCKS,
  blocksOf,
  buildChecklist,
  openingDayOf,
  readiness,
  stageOf,
  todayFor,
  type ChecklistItem,
  type SetupBlock,
} from "./checklist";
import { addCustomItem, removeCustomItem, saveOpening, skipItem, tickItem, unskipItem, untickItem } from "./setup-store";
import { LOADING_SETUP, useSetupData } from "./useSetupData";

const MARK = {
  done: <Check aria-hidden="true" />,
  skipped: <SkipForward aria-hidden="true" />,
  unknown: <CircleHelp aria-hidden="true" />,
  later: <Clock aria-hidden="true" />,
  todo: <Circle aria-hidden="true" />,
} as const;

export interface SetupChecklistProps {
  studio: Studio;
  studios: readonly Studio[];
  trainers: readonly Trainer[];
  byName: string;
  /** After the stage changes here: the dashboard reads the studios again. */
  onStageChanged?: () => void | Promise<void>;
}

export function SetupChecklist({ studio, studios, trainers, byName, onStageChanged }: SetupChecklistProps) {
  const studioId = studio.id ?? "";
  const name = studio.name || "the studio";
  const [seq, setSeq] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<{ block: SetupBlock; title: string; dueOn: string }>({ block: "studio", title: "", dueOn: "" });

  const data = useSetupData(studioId ? [studioId] : [], seq)[studioId] ?? LOADING_SETUP;
  const typed = Boolean((skipping && reason.trim()) || (adding && draft.title.trim()));
  useUnsavedChanges(typed, `${name}'s setup checklist`, {
    onDiscard: () => {
      setSkipping(null);
      setReason("");
      setAdding(false);
      setDraft({ block: "studio", title: "", dueOn: "" });
    },
  });

  const who = { studioId, studioName: name, byName };
  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      setSeq((n) => n + 1);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const panel = (body: ReactNode) => (
    <AdminPanel
      title="Setup checklist"
      icon={<ListChecks className="w-3.5 h-3.5" />}
      subtitle={`Items tick themselves from ${name}'s own data where they can; the rest are ticked here. Due dates count back from the opening day. A skip is kept with its reason.`}
      actions={
        <AdminButton size="sm" onClick={() => setSeq((n) => n + 1)}>
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Check again
        </AdminButton>
      }
    >
      {body}
    </AdminPanel>
  );

  if (data.items.state === "loading") {
    return panel(
      <p className="hq-standing" role="status">
        Reading the checklist…
      </p>,
    );
  }
  if (data.items.state === "failed") {
    return panel(
      <AdminNotice tone="warn">
        <span className="flex flex-wrap items-center gap-3">
          <span>Couldn&apos;t read {name}&apos;s checklist just now, so it can&apos;t say what&apos;s done.</span>
          <AdminButton size="sm" onClick={() => setSeq((n) => n + 1)}>
            Try again
          </AdminButton>
        </span>
      </AdminNotice>,
    );
  }

  const facts = { studio, studios, trainers, roster: data.roster, today: todayFor(studio) };
  const items = buildChecklist(facts, data.items.docs);
  const blocks = blocksOf(items, facts);
  const stage = stageOf(studio);
  const opening = openingDayOf(studio);
  const r = readiness(items, stage);

  const setStage = (next: "handed-over" | "running") =>
    run(`stage-${next}`, async () => {
      await saveOpening(who, { stage, openingDay: opening }, { stage: next, openingDay: opening });
      await onStageChanged?.();
    });

  const itemRow = (item: ChecklistItem) => {
    const key = item.id;
    const acting = busy === key;
    const stateWord =
      item.state === "done"
        ? item.auto
          ? "Ticked itself"
          : "Done"
        : item.state === "skipped"
          ? "Skipped on purpose"
          : item.state === "unknown"
            ? "Couldn't check"
            : item.state === "later"
              ? "After the opening day"
              : item.overdue
                ? "Overdue"
                : null;
    return (
      <li key={key} className={cn("hq-item", `hq-item--${item.state}`, item.overdue && "hq-item--overdue")}>
        <span className="hq-item__mark">{MARK[item.state]}</span>
        <div className="hq-item__body">
          <p className="hq-item__title">
            {item.title}
            {stateWord ? <span className="hq-item__state">{stateWord}</span> : null}
          </p>
          {item.proof ? <p className="hq-item__proof">{item.proof}</p> : null}
          {item.state === "skipped" ? (
            <p className="hq-item__proof">
              {item.doneByName ? `${item.doneByName}: ` : ""}“{item.skipReason}”
            </p>
          ) : null}
          {item.state === "done" && !item.auto ? (
            <p className="hq-item__who">
              Ticked{item.doneByName ? ` by ${item.doneByName}` : ""}
              {item.doneAt ? `, ${formatStudioDate(item.doneAt, { weekday: "short", month: "short", day: "numeric" })}` : ""}.
            </p>
          ) : null}
          {item.dueOn && item.state !== "done" && item.state !== "skipped" ? (
            <p className={cn("hq-item__due", item.overdue && "hq-item__due--over")}>
              {item.overdue ? `Was due ${dayLabel(item.dueOn)}` : `Due ${dayLabel(item.dueOn)}`}
            </p>
          ) : null}
          {skipping === key ? (
            <div className="hq-item__form">
              <AdminField label={`Why skip “${item.title}”?`} htmlFor={`hq-skip-${key}`} hint="Kept with the item, and in the Activity record.">
                <AdminInput id={`hq-skip-${key}`} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
              </AdminField>
              <div className="hq-item__acts">
                <AdminButton
                  size="sm"
                  variant="primary"
                  disabled={!reason.trim()}
                  busy={acting}
                  onClick={() =>
                    void run(key, () => skipItem(who, item, reason)).then((ok) => {
                      if (ok) {
                        setSkipping(null);
                        setReason("");
                      }
                    })
                  }
                >
                  Skip it
                </AdminButton>
                <AdminButton
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSkipping(null);
                    setReason("");
                  }}
                >
                  Cancel
                </AdminButton>
              </div>
            </div>
          ) : null}
        </div>
        {skipping !== key ? (
          <div className="hq-item__acts">
            {item.state === "todo" && !item.auto ? (
              <AdminButton size="sm" variant="primary" busy={acting} onClick={() => void run(key, () => tickItem(who, item))} aria-label={`Tick ${item.title}`}>
                Tick
              </AdminButton>
            ) : null}
            {item.state === "done" && !item.auto ? (
              <AdminButton size="sm" busy={acting} onClick={() => void run(key, () => untickItem(who, item))} aria-label={`Untick ${item.title}`}>
                Untick
              </AdminButton>
            ) : null}
            {item.state === "todo" || item.state === "unknown" || item.state === "later" ? (
              <AdminButton
                size="sm"
                onClick={() => {
                  setSkipping(key);
                  setReason("");
                }}
                aria-label={`Skip ${item.title}`}
              >
                Skip…
              </AdminButton>
            ) : null}
            {item.state === "skipped" ? (
              <AdminButton size="sm" busy={acting} onClick={() => void run(key, () => unskipItem(who, item))} aria-label={`Put it back: ${item.title}`}>
                Put it back
              </AdminButton>
            ) : null}
            {item.custom ? (
              <AdminButton size="sm" variant="ghost" busy={acting} onClick={() => void run(key, () => removeCustomItem(who, item))} aria-label={`Remove ${item.title}`}>
                Remove
              </AdminButton>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  return panel(
    <div className="hq-checklist">
      <div className="hq-ready">
        <p className="hq-ready__say">{r.sentence}</p>
        {r.next ? (
          <p className="hq-ready__line">
            Next due: {r.next.title}
            {r.next.dueOn ? `, ${dayLabel(r.next.dueOn)}` : ""}.
          </p>
        ) : null}
        {r.overdue.length > 0 ? (
          <p className="hq-ready__over">
            {r.overdue.length} overdue: {andList(r.overdue.map((i) => i.title))}.
          </p>
        ) : null}
        {!opening ? <p className="hq-ready__line">No opening day yet, so nothing has a due date. Set one under Opening.</p> : null}
        {stage === "setting-up" ? (
          r.ready ? (
            <div>
              <AdminButton variant="primary" busy={busy === "stage-handed-over"} onClick={() => void setStage("handed-over")}>
                Mark it handed over
              </AdminButton>
            </div>
          ) : (
            <p className="hq-ready__line">Mark it handed over once blocks 1 to 4 are done or skipped on purpose.</p>
          )
        ) : null}
        {stage === "handed-over" && r.firstWeekLeft === 0 ? (
          <div>
            <AdminButton variant="primary" busy={busy === "stage-running"} onClick={() => void setStage("running")}>
              Mark it running
            </AdminButton>
          </div>
        ) : null}
      </div>

      {error ? <AdminNotice tone="alert">{error}</AdminNotice> : null}

      {blocks.map((b, i) => (
        <section key={b.block} className="hq-block" aria-label={b.title}>
          <header className="hq-block__head">
            <span className="hq-block__n" aria-hidden="true">
              {i + 1}
            </span>
            <h4 className="hq-block__title">{b.title}</h4>
            <HqStatus tone={b.tone}>{b.word}</HqStatus>
          </header>
          <ul className="hq-items">{b.items.map(itemRow)}</ul>
        </section>
      ))}

      {adding ? (
        <div className="hq-item__form">
          <AdminGrid>
            <AdminField label="Block" htmlFor="hq-add-block">
              <AdminSelect id="hq-add-block" value={draft.block} onChange={(e) => setDraft((d) => ({ ...d, block: e.target.value as SetupBlock }))}>
                {SETUP_BLOCKS.map((b) => (
                  <option key={b} value={b}>
                    {BLOCKS[b].title}
                  </option>
                ))}
              </AdminSelect>
            </AdminField>
            <AdminField label="The item" htmlFor="hq-add-title">
              <AdminInput id="hq-add-title" value={draft.title} maxLength={160} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
            </AdminField>
            <AdminField label="Due" htmlFor="hq-add-due" hint="Optional.">
              <AdminInput id="hq-add-due" type="date" value={draft.dueOn} onChange={(e) => setDraft((d) => ({ ...d, dueOn: e.target.value }))} />
            </AdminField>
          </AdminGrid>
          <div className="hq-item__acts">
            <AdminButton
              size="sm"
              variant="primary"
              disabled={!draft.title.trim()}
              busy={busy === "add"}
              onClick={() =>
                void run("add", () => addCustomItem(who, { block: draft.block, title: draft.title, dueOn: draft.dueOn || null })).then((ok) => {
                  if (ok) {
                    setAdding(false);
                    setDraft({ block: "studio", title: "", dueOn: "" });
                  }
                })
              }
            >
              Add it
            </AdminButton>
            <AdminButton
              size="sm"
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setDraft({ block: "studio", title: "", dueOn: "" });
              }}
            >
              Cancel
            </AdminButton>
          </div>
        </div>
      ) : (
        <div>
          <AdminButton onClick={() => setAdding(true)}>
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add an item
          </AdminButton>
        </div>
      )}
    </div>,
  );
}
