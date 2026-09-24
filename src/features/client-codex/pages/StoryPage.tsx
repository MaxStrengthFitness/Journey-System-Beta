/**
 * STORY — the codex page (shell phase: a placeholder).
 *
 * The Story is new: the client's time with Max Strength, newest first, built
 * from what the team already recorded — contracts, the FileMaker era, goals
 * and focuses reached, Pulse rounds, InBody scans, notes, FORD moments. It is
 * built in its own phase, from the tab's one load, with no reads of its own.
 *
 * Until then the page says so plainly. It does not print a "time with us"
 * sentence: for a client who trained here long before Journey, a date or a
 * count worked out without the whole story would be a confident wrong
 * number (docs/business/migration-and-prior-history.md).
 */
import { Card, Page, cap } from "../kit";
import type { CodexPageProps } from "../codex-data";

export function StoryPage({ data, go }: CodexPageProps) {
  const p = data.pronouns;
  return (
    <Page
      id="story"
      title="Story"
      lede={`${cap(p.possessive)} time with Max Strength, newest first, built from what the team already recorded.`}
      go={go}
    >
      <Card>
        <p>
          The story isn't drawn yet. It will be built from what the team has already recorded: the
          membership, the sessions, goals and focuses reached, Pulse rounds, InBody scans and notes.
        </p>
      </Card>
    </Page>
  );
}
