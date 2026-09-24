/**
 * ACCOUNT — the codex page: the Account area's page (`client-admin/AccountPage`)
 * on the tab's one load.
 *
 * A thin adapter (INTEGRATION: pages/*.tsx map the tab's one load onto each
 * area's page). Account reads the client document only — the ID card, the
 * Mindbody notes, the package, where she trains, what is on file, how she
 * found us and the fine print — so it opens nothing of its own. Who may
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
  const { client, access, authTrainer, author, availableStudios, coverage, pronouns, today } = data;
  return (
    <AccountArea
      client={client}
      form={form}
      canEdit={access.canEdit}
      studios={availableStudios}
      // The Auth uid names the lock (the author's id), as the old record did.
      author={authTrainer ? { id: author.id || authTrainer.id, name: authTrainer.fullName } : null}
      coverage={coverage}
      pronouns={pronouns}
      today={today}
      go={go}
      onOpenMigrationHub={hosts.onOpenMigrationHub}
    />
  );
}
