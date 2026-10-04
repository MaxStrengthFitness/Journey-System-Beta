/**
 * NOTES — the codex page: the Notes area's page (`client-notes/NotesPage`)
 * inside the kit's Page (its head, the ‹ › neighbours and the Next card).
 *
 * A thin adapter (INTEGRATION: pages/*.tsx map the tab's one load onto each
 * area's page). Everything Notes shows is the tab's ONE load — the journal,
 * its note selection (`data.notes`), this trainer's dismissals — so the page
 * opens no listener of its own. The FORD door's number is the same
 * `fordCountOf` the sub-toggle's FORD segment reads (counts, never FORD's
 * text) — FORD's details and the older life notes that moved there from here
 * (phase 10) — and FORD / Life saves in place only for a reader the FORD create
 * rule accepts (`access.fordWritable`: a trainer at or leader of the client's
 * home studio — not a cross-train visitor, and not an administrator who works
 * elsewhere, phase 19), so anyone else is told where FORD is kept, or, for a
 * reader who may read FORD (`access.fordReadable`), that adding isn't offered.
 *
 * The shell hands over Notes' own cards (`note-{id}`, `notes-compose`,
 * `notes-resolved`) as `intent`: the page acts on each once per move.
 */
import { useMemo } from "react";
import { NotesPage as NotesArea } from "../../client-notes/NotesPage";
import type { RecordPage } from "../../client-profile/profile-nav";
import type { NotesIntent } from "../../client-notes/notes-intent";
import { fordStudioIdOf } from "../../ford/ford-write";
import { useActiveStudio } from "../../../contexts/ActiveStudioContext";
import { Page } from "../kit";
import { fordCountOf, type CodexPageProps } from "../codex-data";

export function NotesPage({
  data,
  go,
  intent = null,
  pageLines,
}: CodexPageProps & {
  /** A door's request (a thread, the composer, Resolved), keyed per move. */
  intent?: { key: unknown; request: NotesIntent } | null;
  /** The sub-toggle's line for each page, for the questions whose answer is a page. */
  pageLines?: Partial<Record<RecordPage, string | null>>;
}) {
  const { client, access, journal, notes, dismissals, machines, author, today, coverage, pronouns, ford } = data;
  // Stamped on a set added in the session pop-up a note opens (Oct 1 2026).
  const { activeStudioId } = useActiveStudio();
  const doorCount = useMemo(
    () => fordCountOf({ readable: access.fordReadable, ford, client }, notes),
    [access.fordReadable, ford, client, notes],
  );
  // `author.id` is the Auth uid (the rules pin it); no one signed in → read only.
  const writer = author.id ? author : null;

  return (
    <Page
      id="notes"
      title="Notes"
      lede="Ask what you came to find out. Every note is a thread: Open means it matters now, loudest first; Standing context is simply true; Resolved notes wait at the bottom with a way back."
      go={go}
    >
      <NotesArea
        client={client}
        journal={journal}
        record={notes.record}
        notesState={notes.state}
        dismissals={dismissals}
        machines={machines}
        author={writer}
        today={today}
        coverage={coverage}
        pronouns={pronouns}
        pageLines={pageLines}
        onOpenPage={(page) => go(page)}
        fordWritable={access.fordWritable}
        fordReadable={access.fordReadable}
        fordStudioId={fordStudioIdOf(client)}
        fordDoorCount={doorCount}
        onOpenFord={() => go("ford")}
        intent={intent}
        trainers={data.trainers}
        activeStudioId={activeStudioId}
      />
    </Page>
  );
}
