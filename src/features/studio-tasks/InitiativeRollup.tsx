/**
 * THE ROLL-UP — the manager's half of an initiative.
 *
 * AJ's spec, near enough verbatim: "the studio manager should be able to put,
 * hey, I need you guys to all do at least five of these assessments for the
 * clients. And then the trainers can submit, hey, I did it with these five
 * clients. And then that studio manager can see, oh, okay, I see it with
 * these five clients."
 *
 * So the last clause is the whole design brief, and it rules out the obvious
 * implementation. A progress bar reading "34 of 45" is a number a manager can
 * do nothing with. What they can act on is: Dana has done six, Marcus has
 * done none, and here are the six names so I can go and read those reports.
 *
 * THREE THINGS THIS DELIBERATELY DOES
 *
 * 1. EVERY TRAINER IS A ROW, including the ones who have logged nothing.
 *    initiativeProgress takes the roster for exactly this reason. A view
 *    built from submissions alone makes non-participation invisible, which is
 *    the one thing the manager opened this to see.
 *
 * 2. THE HEADLINE COUNTS PEOPLE WHO MET THE TARGET, not entries. Nine
 *    trainers doing one each is not "9 of 45 done", it is nought out of nine
 *    trainers finished, and those are opposite conclusions.
 *
 * 3. NAMES ARE ONE TAP AWAY, NOT ON SCREEN BY DEFAULT. Nine trainers times
 *    five clients is forty-five names, which is a wall. Expanding one trainer
 *    is the question a manager actually has.
 *
 * READ-ONLY, ON PURPOSE. A manager cannot tick a client off on a trainer's
 * behalf here. The rule would refuse the write anyway (submissions/{trainerId}
 * is `request.auth.uid == trainerId`), and a button that always fails is
 * worse than no button.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, UserRound } from "lucide-react";
import { watchSubmissions } from "./playbook-mutations";
import { initiativeProgress } from "./initiatives";
import type { InitiativeSubmission, InitiativeTarget } from "./initiatives";

export interface InitiativeRollupProps {
  studioId: string | null;
  requestId: string;
  target?: InitiativeTarget;
  /** Everyone expected to take part. Non-submitters come from here. */
  roster: { id: string; name: string }[];
  /** Highlight this trainer's own row. */
  currentUserId?: string | null;
}

export function InitiativeRollup({
  studioId,
  requestId,
  target,
  roster,
  currentUserId,
}: InitiativeRollupProps) {
  const [subs, setSubs] = useState<InitiativeSubmission[]>([]);
  const [open, setOpen] = useState<string | null>(null);

  /*
   * Live rather than a one-shot read: this is the card a manager leaves open
   * on a Friday afternoon while the floor finishes, and a stale roll-up is
   * the thing that makes someone chase a trainer who already logged it.
   */
  useEffect(() => {
    if (!studioId || !requestId) return;
    return watchSubmissions(studioId, requestId, setSubs);
  }, [studioId, requestId]);

  const progress = useMemo(
    () => initiativeProgress(subs, roster, target),
    [subs, roster, target],
  );

  const per = target?.perTrainer ?? 0;

  return (
    <section className="ini" aria-label="Initiative progress">
      <header className="ini__head">
        <span className="ini__headline tabular">
          {per > 0 ? (
            <>
              {progress.met} of {progress.expected} trainers done
            </>
          ) : (
            <>
              {progress.started} of {progress.expected} trainers logged
            </>
          )}
        </span>
        <span className="ini__total tabular">
          {progress.totalEntries} client{progress.totalEntries === 1 ? "" : "s"}
        </span>
      </header>

      {/*
        One bar, and it measures the same thing the headline does. Two
        different denominators on one card is how a manager ends up quoting
        the wrong number in a meeting.
      */}
      <div
        className="ini__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress.ratio * 100)}
      >
        <span
          className="ini__bar-fill"
          style={{ width: `${Math.round(progress.ratio * 100)}%` }}
        />
      </div>

      <ul className="ini__trainers">
        {progress.perTrainer.map((t) => {
          const expanded = open === t.trainerId;
          const isMe = t.trainerId === currentUserId;
          return (
            <li
              key={t.trainerId}
              className={`ini__trainer${t.met ? " ini__trainer--met" : ""}${
                t.count === 0 ? " ini__trainer--none" : ""
              }`}
            >
              <button
                type="button"
                className="ini__trainer-row"
                disabled={t.entries.length === 0}
                aria-expanded={t.entries.length > 0 ? expanded : undefined}
                onClick={() => setOpen(expanded ? null : t.trainerId)}
              >
                <UserRound size={14} className="ini__avatar" aria-hidden />
                <span className="ini__name">
                  {t.trainerName}
                  {isMe && <span className="ini__you">you</span>}
                </span>
                <span className="ini__count tabular">
                  {per > 0 ? `${t.count} / ${t.target}` : t.count}
                </span>
                {t.entries.length > 0 && (
                  <ChevronDown
                    size={14}
                    className={`sh__chev${expanded ? " sh__chev--open" : ""}`}
                    aria-hidden
                  />
                )}
              </button>

              {expanded && (
                <ul className="ini__entries">
                  {t.entries.map((e) => (
                    <li key={e.clientId} className="ini__entry">
                      {e.clientName}
                      {e.note && (
                        <span className="ini__entry-note">{e.note}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {/*
        Said plainly rather than shown as an empty list. An initiative posted
        into a studio with no roster loaded looks identical to one nobody has
        started, and those need different responses from a manager.
      */}
      {progress.expected === 0 && (
        <p className="ini__empty">
          No trainers on this studio's roster yet, so there is nobody to track
          this against.
        </p>
      )}
    </section>
  );
}
