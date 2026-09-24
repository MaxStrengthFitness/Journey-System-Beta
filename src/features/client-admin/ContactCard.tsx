/**
 * CONTACT — the client's ID card, as Mindbody knows her.
 *
 * Client codex, Sep 2026 (phase 16). The long scroll's "Who they are" was a
 * form: on a client linked to Mindbody every box was greyed out, and reading
 * a phone number meant reading a disabled input. It is now ONE read view —
 * goes by, legal name, born, gender, phone, email, address, emergency and the
 * Mindbody ID, each a fact (account.ts `contactFacts`), and an empty one says
 * why it is empty ("Not in Mindbody", "Not synced yet", "Not recorded").
 *
 * WHAT A COACH CHANGES HERE. Mindbody owns who a client is (CLAUDE.md), so on
 * a linked client the only field is what she is called on the floor — the
 * nickname ("Set a nickname" / "Change" opens a box in place). On a client
 * Mindbody does not hold (a temporary profile, or no Mindbody id) the card
 * has an Edit, which opens her name, date of birth, gender, phone, email,
 * address and emergency contact. Every box writes to the shell's ONE record
 * form: Done only closes the box, and the Save bar saves ("Account ·
 * Contact"). A reader who may not change the record gets the read view and
 * no button.
 *
 * NO SYNC BUTTON (a departure from the mockup, AJ's list): Master Sync at the
 * top of the profile is the one client sync (KNOWN-TRAPS → The client
 * profile), so the card says when Mindbody was last read and where Sync is.
 *
 * The Mindbody ID is shown here and nowhere else on the page.
 */
import { Check, IdCard } from "lucide-react";
import type { Client } from "../../types";
import {
  Btn,
  CardHead,
  Chip,
  EditButton,
  Fact,
  FactList,
  Meta,
  Picks,
  TextInput,
  agree,
  anchorProps,
  joinDots,
  useReadEdit,
  type Pronouns,
} from "../client-codex/kit";
import type { RecordForm } from "../client-codex/useRecordForm";
import { ageFromDob, masterSyncLabel } from "../client-profile/sync-label";
import { contactFacts, isMindbodyLinked } from "./account";
import "./client-admin.css";

export interface ContactCardProps {
  client: Client;
  form: Pick<RecordForm, "formData" | "updateField" | "isDirty" | "revision">;
  /** May change the client record (codexAccess().canEdit). */
  canEdit: boolean;
  pronouns: Pronouns;
  /** For the age and "synced 2 days ago"; the real clock when left out. */
  now?: Date;
}

/** The identity fields a coach types on a client Mindbody does not hold. */
const IDENTITY_KEYS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "gender",
  "phone",
  "email",
  "address",
  "emergencyContactName",
  "emergencyContactPhone",
] as const;

const GENDER_OPTIONS = [
  { value: "Female", label: "Female" },
  { value: "Male", label: "Male" },
  { value: "Other", label: "Other" },
] as const;

/** The rules refuse a record whose first or last name is empty or 50 characters or more. */
const NAME_MAX = 49;

const NICKNAME_HINT =
  "A nickname replaces the first name in the header, the briefing and the session. The legal name stays on the record.";

export function ContactCard({ client, form, canEdit, pronouns: p, now }: ContactCardProps) {
  const { formData, updateField, isDirty, revision } = form;
  const linked = isMindbodyLinked(client);
  // The identity editor exists only for a client Mindbody does not hold; the
  // nickname's box is its own, on every client.
  const card = useReadEdit({ canEdit: canEdit && !linked, revision });
  const nick = useReadEdit({ canEdit, revision });
  const [goesBy, ...facts] = contactFacts(client, formData, { now, pronouns: p });

  const identityDirty = isDirty(...IDENTITY_KEYS);
  const nickDirty = isDirty("nickname");
  const unsaved = (identityDirty && !card.open) || (nickDirty && !nick.open);

  const value = (key: (typeof IDENTITY_KEYS)[number] | "nickname"): string => {
    const v = formData[key];
    return typeof v === "string" ? v : "";
  };
  const set = (key: (typeof IDENTITY_KEYS)[number] | "nickname") => (v: string) => updateField(key, v);

  const synced = masterSyncLabel(client.mindbodyMasterSyncedAt, now);
  const meta = linked
    ? joinDots(["From Mindbody", `${synced.charAt(0).toLowerCase()}${synced.slice(1)}`, "Sync is at the top of the profile"])
    : "Typed in Journey · not linked to Mindbody";
  const age = ageFromDob(value("dateOfBirth"), now);
  const nameHint = (key: "firstName" | "lastName") =>
    value(key).trim() ? undefined : `The record needs a ${key === "firstName" ? "first" : "last"} name to save.`;

  return (
    <section className="cx-card" data-editing={card.open ? "" : undefined} {...anchorProps("account-contact")}>
      <CardHead
        eyebrow="Contact"
        icon={IdCard}
        meta={unsaved ? <Chip tone="live">Unsaved</Chip> : meta}
        actions={canEdit && !linked ? <EditButton open={card.open} onToggle={card.toggle} label="Contact" /> : null}
      />

      <FactList>
        <Fact label={goesBy.label} source={nick.open || !canEdit ? null : NICKNAME_HINT}>
          {nick.open ? (
            <span className="cadm-nick__edit">
              <TextInput
                label="Nickname"
                value={value("nickname")}
                onChange={set("nickname")}
                placeholder={`What ${p.subject} ${agree(p, "likes", "like")} to be called`}
                hint={NICKNAME_HINT}
                maxLength={60}
              />
              <Btn variant="live" icon={Check} onClick={() => nick.setOpen(false)}>
                Done
              </Btn>
            </span>
          ) : (
            <span className="cadm-nick">
              <span className={goesBy.empty ? "cadm-missing" : undefined}>{goesBy.value}</span>
              {canEdit ? (
                <Btn onClick={() => nick.setOpen(true)}>{goesBy.empty ? "Set a nickname" : "Change"}</Btn>
              ) : null}
            </span>
          )}
        </Fact>
      </FactList>

      {card.open ? (
        <div className="cadm-edit">
          <div className="cadm-edit__grid">
            <TextInput
              label="First name"
              value={value("firstName")}
              onChange={set("firstName")}
              maxLength={NAME_MAX}
              hint={nameHint("firstName")}
            />
            <TextInput
              label="Last name"
              value={value("lastName")}
              onChange={set("lastName")}
              maxLength={NAME_MAX}
              hint={nameHint("lastName")}
            />
            <TextInput
              label="Date of birth"
              type="date"
              value={value("dateOfBirth")}
              onChange={set("dateOfBirth")}
              hint={age !== null ? `${age} years old` : undefined}
            />
            <Picks
              label="Gender"
              options={GENDER_OPTIONS}
              value={value("gender")}
              onChange={set("gender")}
              allowClear
            />
            <TextInput label="Phone" type="tel" inputMode="tel" value={value("phone")} onChange={set("phone")} />
            <TextInput label="Email" type="email" inputMode="email" value={value("email")} onChange={set("email")} />
            <TextInput
              label="Address"
              className="cadm-edit__wide"
              value={value("address")}
              onChange={set("address")}
            />
            <TextInput
              label="Emergency contact"
              value={value("emergencyContactName")}
              onChange={set("emergencyContactName")}
            />
            <TextInput
              label="Emergency phone"
              type="tel"
              inputMode="tel"
              value={value("emergencyContactPhone")}
              onChange={set("emergencyContactPhone")}
            />
          </div>
          <Meta>Nothing is saved until you tap Save changes on the bar at the bottom.</Meta>
        </div>
      ) : (
        <FactList>
          {facts.map((f) => (
            <Fact key={f.key} label={f.label}>
              <span className={f.empty ? "cadm-missing" : undefined}>{f.value}</span>
            </Fact>
          ))}
        </FactList>
      )}
    </section>
  );
}
