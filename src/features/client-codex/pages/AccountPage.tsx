/**
 * ACCOUNT — the codex page: the Account area's page (`client-admin/AccountPage`)
 * on the tab's one load.
 *
 * A thin adapter (INTEGRATION: pages/*.tsx map the tab's one load onto each
 * area's page). Account reads the client document — the ID card, the
 * Mindbody notes, the package, where she trains, what is on file, how she
 * found us and the fine print — and the tab's one FORD stream (the intake
 * matcher checks an Activity line against it), so it opens nothing of its
 * own. Who may
 * change the record is `codexAccess`, worked out once by the shell; every
 * field goes through the ONE form. The tier lock is named with the Auth uid
 * (`data.author.id`), as the old record's was.
 *
 * The Migration Hub is the profile's (`hosts.onOpenMigrationHub`): it
 * switches to Journey, where imported sessions land, and the page offers it
 * only to a reader who may change the record.
 */
import { AccountPage as AccountArea } from "../../client-admin/AccountPage";
import type { CodexPageProps } from "../codex-data";

export function AccountPage({ data, form, go, hosts }: CodexPageProps) {
  const { client, access, authTrainer, author, availableStudios, coverage, pronouns, today, ford, fordStatus } = data;
  return (
    <AccountArea
      client={client}
      form={form}
      canEdit={access.canEdit}
      studios={availableStudios}
      // The Auth uid names the lock (the author's id), as the old record did.
      author={authTrainer ? { id: author.id || authTrainer.id, name: authTrainer.fullName } : null}
      // The intake matcher (phase 17): FORD's one stream — `off` for a reader
      // the FORD rule refuses, never opened for them — whether the FORD
      // create rule takes a detail from this reader, and the Auth uid a FORD
      // detail is written with (the rule pins authorId to it).
      ford={{ status: fordStatus, entries: ford.entries, canAdd: access.fordWritable }}
      fordAuthor={author.id ? author : null}
      coverage={coverage}
      pronouns={pronouns}
      today={today}
      go={go}
      onOpenMigrationHub={hosts.onOpenMigrationHub}
    />
  );
}
