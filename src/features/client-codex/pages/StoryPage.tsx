/**
 * STORY — the codex page: the Story area's page (`client-story/StoryPage`)
 * on the tab's one load.
 *
 * A thin adapter (INTEGRATION: pages/*.tsx map the tab's one load onto each
 * area's page). The story itself is `CodexData.story` — built ONCE by the
 * shell from what the tab already holds (the journal, FORD for a reader it
 * lets in, the InBody scans, the Pulse history, the record) and shared with
 * the Overview's Story slot — so this page reads nothing and writes nothing.
 * A moment's door is the shell's `go`: a card on another page, or one
 * thread on Notes (`note-{id}`, which Notes interprets itself).
 */
import { StoryPage as StoryArea } from "../../client-story/StoryPage";
import type { CodexPageProps } from "../codex-data";

export function StoryPage({ data, go }: CodexPageProps) {
  return <StoryArea story={data.story} pronouns={data.pronouns} go={go} />;
}
