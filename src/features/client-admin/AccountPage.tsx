/**
 * ACCOUNT — the last page of Notes & Profile: who she is as Mindbody knows
 * her, then her membership.
 *
 * Client codex, Sep 2026 (phase 16). It takes over the long scroll's "Who
 * they are" and Admin sections — a form of greyed-out boxes over a contract
 * panel whose fine print held everything else. Read first, as the approved
 * mockup has it (one column under 760px of page width — the 744pt iPad held
 * upright — two from 760):
 *
 *   Contact | Mindbody account notes
 *       the ID card (ContactCard): the nickname is the one thing a coach
 *       changes on a linked client; Mindbody's notes line by line, verbatim,
 *       each with where it belongs and one tap to put it there
 *       (IntakeNotesCard, the intake matcher — AJ's decision 4)
 *   Membership — what she has bought, what is left, and where she can train
 *       the package and its history | where she can train, on file with
 *       Mindbody, how she found us — then the fine print, folded
 *       (MembershipSection)
 *
 * It ends with the Next card, which reads "Done" and goes back to the
 * Overview: Account is the last page.
 *
 * SAVE MODEL. Every field here is a record field — the nickname, an unlinked
 * client's identity, the tier lock, the cross-train studios, the lead source
 * and the referral — so each is an edit to the shell's ONE record form, and
 * the Save bar saves ("Account · Contact", "· Membership", "· Where they can
 * train", "· How they found us"). The intake card's taps stage the fields
 * they fill on the same form — the job title, her why, her medical history,
 * each named on the Save bar by its own page. Its one exception is a FORD
 * detail (an Activity line), which saves the moment it is added, as every
 * FORD detail does.
 *
 * WHAT IT READS: the client document (and the studios this reader may see)
 * and the tab's one FORD stream, so the page opens no listener. The
 * Migration Hub is the profile's (`hosts.onOpenMigrationHub`): it switches
 * to Journey, where imported sessions land, and is offered only to a reader
 * who may change the record.
 */
import type { Client, Studio } from "../../types";
import type { HistoryCoverage } from "../../lib/prior-history";
import type { FordEntry } from "../ford/types";
import type { FordAuthor } from "../ford/ford-write";
import type { CodexFordStatus } from "../client-codex/codex-data";
import { Page, type CodexGo, type Pronouns } from "../client-codex/kit";
import type { RecordForm } from "../client-codex/useRecordForm";
import { ContactCard } from "./ContactCard";
import { IntakeNotesCard } from "./IntakeNotesCard";
import { MembershipSection } from "./MembershipSection";
import { accountLede, isMindbodyLinked } from "./account";
import "./client-admin.css";

export interface AccountPageProps {
  client: Client;
  form: Pick<RecordForm, "formData" | "updateField" | "isDirty" | "revision">;
  /** May change the client record (codexAccess().canEdit). */
  canEdit: boolean;
  /** The studios this reader may see. */
  studios: readonly Studio[];
  /**
   * Who is signed in, named on a tier lock: the Auth uid (the rules pin the
   * signed-in person by it, and it differs from the trainer id on older
   * accounts) and their name. Null when nobody is.
   */
  author: { id: string; name: string } | null;
  /**
   * The tab's one FORD stream (`off` for a reader the FORD rule refuses): the
   * intake card checks an Activity line against it before offering it.
   * `canAdd` is the FORD create rule for this reader
   * (`codexAccess().fordWritable`).
   */
  ford: { status: CodexFordStatus; entries: readonly FordEntry[]; canAdd: boolean };
  /** Who adds a FORD detail from the intake card: the Auth uid, which the FORD rule pins. */
  fordAuthor: FordAuthor | null;
  /** How much of her story Journey holds (the contract history's "Before Journey"). */
  coverage: HistoryCoverage;
  pronouns: Pronouns;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
  go: CodexGo;
  onOpenMigrationHub?: () => void;
  /** For ages and "synced 2 days ago"; the real clock when left out. */
  now?: Date;
}

export function AccountPage({
  client,
  form,
  canEdit,
  studios,
  author,
  ford,
  fordAuthor,
  coverage,
  pronouns: p,
  today,
  go,
  onOpenMigrationHub,
  now,
}: AccountPageProps) {
  const lede = accountLede(client, canEdit, p);
  // Mindbody's notes belong to a client Mindbody holds; a typed-in client has
  // none, unless an earlier link left some behind (then they still show).
  const showNotes = isMindbodyLinked(client) || !!client.mindbodyNotes?.trim();

  return (
    <Page id="account" title="Account" lede={lede} go={go}>
      <div className="cadm-page">
        <div className={showNotes ? "cadm-row cadm-row--contact" : "cadm-row"}>
          <ContactCard client={client} form={form} canEdit={canEdit} pronouns={p} now={now} />
          {showNotes ? (
            <IntakeNotesCard
              client={client}
              form={form}
              canEdit={canEdit}
              ford={ford}
              fordAuthor={fordAuthor}
              pronouns={p}
              go={go}
            />
          ) : null}
        </div>

        <MembershipSection
          client={client}
          form={form}
          studios={studios}
          author={author}
          coverage={coverage}
          canEdit={canEdit}
          pronouns={p}
          today={today}
          onOpenMigrationHub={onOpenMigrationHub}
          now={now}
        />
      </div>
    </Page>
  );
}
