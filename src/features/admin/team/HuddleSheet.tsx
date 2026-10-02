/**
 * HUDDLE MODE — the morning's agenda, full screen, from Today's "Start huddle".
 *
 * The redesign's Operations room, phase 6 (Sep 28 2026; the blueprint's
 * Huddle). Five items a leader points at, not reads out; each tap marks one
 * covered, and End huddle closes it. Nothing is sent and nothing is written:
 * the covered marks start fresh each time it opens (huddle-agenda.ts has the rules
 * for what each item says).
 *
 * It is a Sheet (components/ui/sheet) run the full width, so it sits over
 * the app shell and pays the status bar and home indicator itself: the
 * Home Screen app's rule that each inset is paid once, at the true edge.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Hand, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "../../../components/ui/sheet";
import type { Trainer } from "../../../types";
import { useHubAnnouncements } from "../../notifications/useHubAnnouncements";
import { AdminButton } from "../primitives";
import { huddleAgenda, type BriefHuddleInput, type HuddleItem } from "./huddle-agenda";
import { useHuddleLines } from "./huddle-memory";
import "../shell/ops.css";

/** How many of the bell's announcements the huddle shows. */
const ANNOUNCEMENTS_SHOWN = 3;

/**
 * The huddle as Today opens it: the brief's lines, what Team recognised for
 * this studio today, and what the bell is showing. Mounted only while the
 * huddle is open, so its two reads (the bell's own announcement listener,
 * which Firestore shares with the bell, and this iPad's memory) cost nothing
 * the rest of the time.
 */
export function BriefHuddle({
  studioId,
  studioName,
  today,
  dateLabel,
  authTrainer,
  input,
  onClose,
}: {
  studioId: string;
  studioName: string;
  today: string;
  dateLabel: string;
  authTrainer: Trainer;
  input: BriefHuddleInput;
  onClose: () => void;
}) {
  const recognised = useHuddleLines(studioId, today);
  const { announcements } = useHubAnnouncements(authTrainer, studioId);
  const items = useMemo(
    () =>
      huddleAgenda({
        ...input,
        recognition: [...recognised, ...input.recognition.filter((l) => !recognised.includes(l))],
        announcements: announcements.slice(0, ANNOUNCEMENTS_SHOWN).map((a) => (a.shortContent?.trim() ? `${a.title}: ${a.shortContent.trim()}` : a.title)),
      }),
    [input, recognised, announcements],
  );
  return <Huddle open onClose={onClose} studioName={studioName} dateLabel={dateLabel} items={items} />;
}

export interface HuddleProps {
  open: boolean;
  onClose: () => void;
  studioName: string;
  /** "Monday, September 28". */
  dateLabel: string;
  items: HuddleItem[];
}

export function Huddle({ open, onClose, studioName, dateLabel, items }: HuddleProps) {
  const [covered, setCovered] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    if (open) setCovered(new Set());
  }, [open]);
  const toggle = (n: number) =>
    setCovered((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="right" showCloseButton={false} className="ops-huddle gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none" data-testid="huddle">
        {open ? (
          <div className="ops-huddle__in">
            <header className="ops-huddle__bar">
              <div>
                <span className="ops-brief__eyebrow">Huddle · {studioName}</span>
                <SheetTitle className="ops-huddle__title">{dateLabel}</SheetTitle>
              </div>
              <SheetDescription className="ops-huddle__hint">Tap each item as you cover it</SheetDescription>
              <AdminButton onClick={onClose}>
                <X className="w-4 h-4" aria-hidden /> End huddle
              </AdminButton>
            </header>
            <div className="ops-huddle__grid">
              {items.map((item) => {
                const done = covered.has(item.n);
                return (
                  <button key={item.n} type="button" className="ops-huddle__i" aria-pressed={done} onClick={() => toggle(item.n)}>
                    <span className="ops-huddle__n" aria-hidden>
                      {done ? <Check className="w-5 h-5" /> : item.n}
                    </span>
                    <span className="ops-huddle__c">
                      <span className="ops-huddle__t">
                        {item.title}
                        {item.sub && <em>{item.sub}</em>}
                      </span>
                      {item.lines.map((l, i) => (
                        <span key={i} className="ops-huddle__l">
                          {l.tag && <i>{l.tag}</i>}
                          {l.text}
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="ops-huddle__foot">
              <Hand className="w-4 h-4" aria-hidden />
              Point to it, don't read it. Nothing here is sent to anyone.
            </p>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
