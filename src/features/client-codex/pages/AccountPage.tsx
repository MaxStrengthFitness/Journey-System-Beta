/**
 * ACCOUNT — the codex page (shell phase: an adapter).
 *
 * Hosts the long scroll's "Who they are" and Admin sections as they were:
 * the client's ID card (Mindbody owns identity and contact on a linked
 * client, so those are read only; the nickname is the coach's), the
 * Mindbody account notes, the contract (ContractPanel, with the tier lock
 * and where they may train) and how they found us. The Account area
 * rebuilds it in its own phase.
 *
 * The Migration Hub moved here from the old record's top bar, into the fine
 * print, for a reader who may change the record. It still switches the
 * profile to Journey first, because that is where imported sessions land.
 */
import { Upload } from "lucide-react";
import { ContractPanel } from "../../client-admin/ContractPanel";
import { Btn, Card, Page, Source, anchorProps } from "../kit";
import type { CodexPageProps } from "../codex-data";
import { RecordLock } from "./RecordLock";
import { AcquisitionBlock, MindbodyNotesBlock, WhoTheyAreBlock } from "./legacy-blocks";

export function AccountPage({ data, form, go, hosts }: CodexPageProps) {
  const { client, access, authTrainer, author, availableStudios } = data;
  const locked = !access.canEdit;

  return (
    <Page id="account" title="Account" lede="Contact details as Mindbody knows them, then the membership." go={go}>
      <Card eyebrow="Contact" id="account-contact">
        <RecordLock locked={locked}>
          <WhoTheyAreBlock client={client} formData={form.formData} updateField={form.updateField} />
        </RecordLock>
      </Card>

      {client.mindbodyNotes ? (
        <Card id="account-mindbody-notes">
          <MindbodyNotesBlock client={client} />
        </Card>
      ) : null}

      <Card host id="account-membership">
        <RecordLock locked={locked}>
          <ContractPanel
            client={client}
            formData={form.formData}
            updateField={form.updateField}
            studios={availableStudios}
            // The Auth uid names the lock (the author's id), as the old record did.
            author={authTrainer ? { id: author.id || authTrainer.id, name: authTrainer.fullName } : null}
            acquisition={
              <div {...anchorProps("account-found-us")}>
                <AcquisitionBlock formData={form.formData} updateField={form.updateField} />
              </div>
            }
          />
        </RecordLock>
      </Card>

      {access.canEdit ? (
        <Card eyebrow="Fine print" id="account-fine-print">
          <div>
            <Btn icon={Upload} onClick={hosts.onOpenMigrationHub}>
              Migration Hub (OCR)
            </Btn>
          </div>
          <Source>Imports past sessions from paper charts. The profile switches to Journey, where they land.</Source>
        </Card>
      ) : null}
    </Page>
  );
}
