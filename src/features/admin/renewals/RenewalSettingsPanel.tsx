/**
 * My Studio → Studio → Renewals: whether the studio's packages renew by
 * themselves, when each studio starts the renewal conversation, and its own
 * package table. (It was Operations → Renewals → Settings until the
 * Operations round, Sep 2026 — My Studio is where you run the studio;
 * Operations only points here now.)
 *
 * This is the ONE editor of the studio's auto-renew answer (Sep 25 2026; AJ:
 * the franchise studios have auto-renewal on, the corporate studios off, on
 * by default). Operations → Renewals flags a studio that hasn't answered and
 * opens this screen; it never edits the answer itself.
 *
 * AJ, Sep 10 2026: "each studio should be able to customize anything that
 * relates to knowing." Everything the renewal engine measures against is
 * here, and nowhere else.
 *
 * House rules (src/features/admin/README.md): a controlled form, dirty-tracked
 * through useDirtyForm, and only the fields that changed are written. The
 * package table is one field, so editing one package sends the whole (valid)
 * table. Nothing saves while the form has a problem, and the problems are
 * listed in words above the save bar.
 */

import React, { useCallback, useMemo, useState } from "react";
import { Package, Plus, RefreshCw, Timer, Trash2, Tag } from "lucide-react";
import {
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminGrid,
  AdminInput,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminSelect,
  AdminTextarea,
  ConfirmDialog,
  SaveBar,
} from "../primitives";
import { useDirtyForm } from "../useDirtyForm";
import {
  assignNameInForm,
  nameWontFitInForm,
  formToSettings,
  newPackageRow,
  settingsPatchFromForm,
  settingsToForm,
  type PackageRowForm,
  type RenewalSettingsForm,
} from "../../renewals/settings-form";
import { MAX_EXTRA_SESSION_NAMES, MAX_NAMES_PER_PACKAGE, SETTING_LABELS } from "../../renewals/settings";
import { suggestionTarget, suggestionWords, waitingNames, type WaitingName } from "../../renewals/name-suggest";
import { saveRenewalSettings } from "../../renewals/useRenewalSettings";
import type { RenewalNamesSeen, RenewalSettings } from "../../renewals/types";

type NumberKey =
  | "conversationAtSessionsLeft"
  | "chargeWarnDays"
  | "chargeWarnMinBanked"
  | "horizonMonths"
  | "breakDays"
  | "lostAfterDays";

const HINTS: Record<NumberKey, string> = {
  conversationAtSessionsLeft: "The usual moment to ask. Most studios start around 10.",
  chargeWarnDays:
    "For clients who will still have sessions when billing ends — so there's time to talk before the card is charged.",
  chargeWarnMinBanked: "Fewer banked sessions than this isn't worth a warning.",
  horizonMonths: "How far ahead the Coming up list looks.",
  breakDays: "The studio's own number (AJ, Sep 19): past it a quiet client goes on the Overview's attendance watch. Two weeks is the Activity Archive's rule too.",
  lostAfterDays: "Days after billing ends with no new package before a client counts as lost.",
};

export interface RenewalSettingsPanelProps {
  studioId: string;
  studioName: string;
  settings: RenewalSettings;
  /** False while the studio is still on the defaults. */
  saved: boolean;
  /**
   * The studio's saved document holds a package table of its own
   * (useRenewalSettings). Without one, saving a matched name writes Max
   * Strength's standard table, prices included, as the studio's.
   */
  ownPackageTable: boolean;
  namesSeen: RenewalNamesSeen | null;
  canEdit: boolean;
}

export function RenewalSettingsPanel({
  studioId,
  studioName,
  settings,
  saved,
  ownPackageTable,
  namesSeen,
  canEdit,
}: RenewalSettingsPanelProps) {
  const external = useMemo(() => settingsToForm(settings), [settings]);

  const onSave = useCallback(
    async (patch: Partial<RenewalSettingsForm>) => {
      // Parse the WHOLE draft, not just the patch: a package edit must send a
      // complete, valid table. The form refuses to save while there are
      // problems, so this only throws if that guard is bypassed.
      const { settings: parsed, problems } = formToSettings(draftRef.current);
      if (problems.length > 0) throw new Error(problems[0]);
      await saveRenewalSettings(studioId, settingsPatchFromForm(patch, parsed));
    },
    [studioId],
  );

  const form = useDirtyForm<RenewalSettingsForm>(external, onSave, {
    label: "the renewal settings",
  });
  // The save callback needs the live draft; a ref keeps onSave's identity stable.
  const draftRef = React.useRef(form.value);
  draftRef.current = form.value;

  const { problems } = useMemo(() => formToSettings(form.value), [form.value]);
  const [removing, setRemoving] = useState<PackageRowForm | null>(null);
  // The studio's auto-renew answer (AJ, Sep 25 2026: on by default, off at
  // the corporate studios). "Not answered" is offered only while nothing is
  // saved: once a studio answers, going back to the standard isn't a choice.
  const unanswered = external.packagesRenewAutomatically === "";
  const turningOff = form.value.packagesRenewAutomatically === "no" && external.packagesRenewAutomatically !== "no";
  const studioRenews = form.value.packagesRenewAutomatically !== "no";

  const setRow = (key: string, patch: Partial<PackageRowForm>) =>
    form.setField(
      "packages",
      form.value.packages.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  // The names no package claims yet, each with its suggestion (name-suggest.ts;
  // the renewals dashboard, Oct 7 2026: Strongsville had 44 waiting). Read
  // against the form's own table, so a name confirmed below leaves the list
  // at once and a package being edited is what the suggestions name.
  const unmatched = useMemo(
    () => (namesSeen ? waitingNames(namesSeen, formToSettings(form.value).settings) : []),
    [namesSeen, form.value],
  );
  const suggested = unmatched.filter((n): n is WaitingName & { suggestion: NonNullable<WaitingName["suggestion"]> } => n.suggestion !== null);
  // Confirming puts the name in its package's (or the extra sessions') list
  // in the form; the save bar writes it, like any other change here.
  // A name past a list's limit would be dropped on save without a word, so
  // it is not added and the panel says which ones didn't fit.
  const [didntFit, setDidntFit] = useState<string[]>([]);
  const assign = (pairs: Array<{ name: string; target: string }>) => {
    let draft = form.value;
    let patch: Partial<RenewalSettingsForm> = {};
    const skipped: string[] = [];
    for (const { name, target } of pairs) {
      if (nameWontFitInForm(draft, name, target)) {
        skipped.push(name);
        continue;
      }
      const p = assignNameInForm(draft, name, target);
      draft = { ...draft, ...p };
      patch = { ...patch, ...p };
    }
    form.setFields(patch);
    setDidntFit(skipped);
  };
  const confirm = (names: typeof suggested) =>
    assign(names.map((n) => ({ name: n.name, target: suggestionTarget(n.suggestion) })));
  // A studio that never saved a package table of its own is reading Max
  // Strength's: a name saved into it saves that whole table, prices included,
  // as the studio's (AJ, Oct 7 2026: "yes", warn first). Said once, beside
  // Confirm, while there is a name to match or a table change unsaved (by
  // value, as the save bar sees it, so an edit undone puts it away); it never
  // stops the save. Worded for both, a name or a price.
  const adoptsStandardTable =
    canEdit && !ownPackageTable && (unmatched.length > 0 || form.changed.includes("packages"));

  const numberField = (key: NumberKey) => (
    <AdminField key={key} label={SETTING_LABELS[key]} hint={HINTS[key]} htmlFor={`renewals-${key}`}>
      <AdminInput
        id={`renewals-${key}`}
        inputMode="numeric"
        value={form.value[key]}
        disabled={!canEdit}
        onChange={(e) => form.setField(key, e.target.value)}
      />
    </AdminField>
  );

  return (
    <div className="space-y-4">
      {!saved && (
        <AdminNotice tone="info">
          {canEdit
            ? `${studioName} is using the standard settings below. Change anything and save to make them this studio's own.`
            : `${studioName} is using the standard settings below.`}
        </AdminNotice>
      )}
      {!canEdit && (
        <AdminNotice tone="info">
          Only this studio's leaders can change these settings.
        </AdminNotice>
      )}

      <AdminPanel
        title="Auto-renewal"
        subtitle="What happens when a package's payments finish. Mindbody's own setting on a contract wins wherever Mindbody has said."
        icon={<RefreshCw className="w-4 h-4" />}
      >
        <div className="space-y-3">
          {unanswered && (
            <AdminNotice tone="warn">
              {studioName} hasn't answered yet, so its packages read as renewing automatically. The corporate studios
              don't auto-renew: if {studioName} is one of them, choose No and save.
            </AdminNotice>
          )}
          <AdminGrid>
            <AdminField
              label={`Packages at ${studioName} renew automatically`}
              hint="Whether a package starts again by itself when its payments finish. A package below can say otherwise, and a trainer can mark one client on the client's profile."
              htmlFor="renewals-autorenew"
            >
              <AdminSelect
                id="renewals-autorenew"
                value={form.value.packagesRenewAutomatically}
                disabled={!canEdit}
                onChange={(e) =>
                  form.setField(
                    "packagesRenewAutomatically",
                    e.target.value === "yes" ? "yes" : e.target.value === "no" ? "no" : "",
                  )
                }
              >
                {unanswered && <option value="">Yes — the standard, not confirmed yet</option>}
                <option value="yes">Yes, they renew automatically</option>
                <option value="no">No, billing ends when the payments finish</option>
              </AdminSelect>
            </AdminField>
          </AdminGrid>
          {turningOff && (
            <AdminNotice tone="info">
              Clients on a package set to “Same as the studio”, with no answer from Mindbody and no mark of their own,
              will read as not renewing, and their before-the-charge warnings stop. A package set to “It renews
              automatically” still renews. If contracts already sold still renew, leave this on or mark those clients
              on their profiles.
            </AdminNotice>
          )}
        </div>
      </AdminPanel>

      <AdminPanel
        title="When to talk"
        subtitle="Two moments start a renewal conversation: few sessions left, or billing ending while sessions are still banked."
        icon={<Timer className="w-4 h-4" />}
      >
        <AdminGrid>
          {numberField("conversationAtSessionsLeft")}
          {numberField("chargeWarnDays")}
          {numberField("chargeWarnMinBanked")}
          {numberField("horizonMonths")}
          {numberField("breakDays")}
          {numberField("lostAfterDays")}
          <AdminField
            label="A client who moves to single sessions counts as"
            hint="Pay-as-you-go after a package ends."
            htmlFor="renewals-payg"
          >
            <AdminSelect
              id="renewals-payg"
              value={form.value.payAsYouGoCountsAs}
              disabled={!canEdit}
              onChange={(e) =>
                form.setField("payAsYouGoCountsAs", e.target.value === "lost" ? "lost" : "retained")
              }
            >
              <option value="retained">Kept</option>
              <option value="lost">Lost</option>
            </AdminSelect>
          </AdminField>
          <AdminField
            label="Vacation, snowbird and medical time"
            hint="Paused clients aren't counted as slipping."
            htmlFor="renewals-away"
          >
            <AdminSelect
              id="renewals-away"
              value={form.value.pauseDuringAwayEvents}
              disabled={!canEdit}
              onChange={(e) =>
                form.setField("pauseDuringAwayEvents", e.target.value === "no" ? "no" : "yes")
              }
            >
              <option value="yes">Pauses the clocks</option>
              <option value="no">Doesn't pause anything</option>
            </AdminSelect>
          </AdminField>
        </AdminGrid>
      </AdminPanel>

      <AdminPanel
        title="Packages"
        subtitle={`What ${studioName} sells, at its own prices. The Mindbody names are how the app recognizes each package on a client's account.`}
        icon={<Package className="w-4 h-4" />}
        actions={
          canEdit ? (
            <AdminButton
              variant="quiet"
              size="sm"
              onClick={() =>
                form.setField("packages", [...form.value.packages, newPackageRow(form.value)])
              }
            >
              <Plus className="w-3.5 h-3.5" />
              Add a package
            </AdminButton>
          ) : undefined
        }
      >
        <div className="space-y-6">
          {form.value.packages.map((row, i) => (
            <div key={row.key} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="adm-label">{row.label.trim() || `Package ${i + 1}`}</p>
                {canEdit && form.value.packages.length > 1 && (
                  <AdminButton variant="ghost" size="sm" onClick={() => setRemoving(row)}>
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </AdminButton>
                )}
              </div>
              <AdminGrid>
                <AdminField label="Name" htmlFor={`pkg-${row.key}-label`}>
                  <AdminInput
                    id={`pkg-${row.key}-label`}
                    value={row.label}
                    disabled={!canEdit}
                    onChange={(e) => setRow(row.key, { label: e.target.value })}
                  />
                </AdminField>
                <AdminField label="Months" htmlFor={`pkg-${row.key}-months`}>
                  <AdminInput
                    id={`pkg-${row.key}-months`}
                    inputMode="numeric"
                    value={row.months}
                    disabled={!canEdit}
                    onChange={(e) => setRow(row.key, { months: e.target.value })}
                  />
                </AdminField>
                <AdminField label="Sessions" htmlFor={`pkg-${row.key}-sessions`}>
                  <AdminInput
                    id={`pkg-${row.key}-sessions`}
                    inputMode="numeric"
                    value={row.sessions}
                    disabled={!canEdit}
                    onChange={(e) => setRow(row.key, { sessions: e.target.value })}
                  />
                </AdminField>
                <AdminField label="Payments (every 4 weeks)" htmlFor={`pkg-${row.key}-payments`}>
                  <AdminInput
                    id={`pkg-${row.key}-payments`}
                    inputMode="numeric"
                    value={row.payments}
                    disabled={!canEdit}
                    onChange={(e) => setRow(row.key, { payments: e.target.value })}
                  />
                </AdminField>
                <AdminField label="Price per session ($)" htmlFor={`pkg-${row.key}-rate`}>
                  <AdminInput
                    id={`pkg-${row.key}-rate`}
                    inputMode="decimal"
                    value={row.ratePerSession}
                    disabled={!canEdit}
                    onChange={(e) => setRow(row.key, { ratePerSession: e.target.value })}
                  />
                </AdminField>
                <AdminField label="Each payment ($)" htmlFor={`pkg-${row.key}-payment`}>
                  <AdminInput
                    id={`pkg-${row.key}-payment`}
                    inputMode="decimal"
                    value={row.paymentAmount}
                    disabled={!canEdit}
                    onChange={(e) => setRow(row.key, { paymentAmount: e.target.value })}
                  />
                </AdminField>
                <AdminField
                  label="Paid in full, per session ($)"
                  hint="The monthly price if there's no discount."
                  htmlFor={`pkg-${row.key}-prepay`}
                >
                  <AdminInput
                    id={`pkg-${row.key}-prepay`}
                    inputMode="decimal"
                    value={row.prepayRatePerSession}
                    disabled={!canEdit}
                    onChange={(e) => setRow(row.key, { prepayRatePerSession: e.target.value })}
                  />
                </AdminField>
                <AdminField
                  label="When the payments finish"
                  hint="What the packages screen and the renewal screens say for this package. Sessions never expire."
                  htmlFor={`pkg-${row.key}-renews`}
                >
                  <AdminSelect
                    id={`pkg-${row.key}-renews`}
                    value={row.renews}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setRow(row.key, {
                        renews: e.target.value === "yes" ? "yes" : e.target.value === "no" ? "no" : "",
                      })
                    }
                  >
                    <option value="">{studioRenews ? "Same as the studio (renews)" : "Same as the studio (doesn't renew)"}</option>
                    <option value="yes">It renews automatically</option>
                    <option value="no">It doesn't renew by itself</option>
                  </AdminSelect>
                </AdminField>
                <AdminField
                  label="Names in Mindbody"
                  hint="One per line — contract and pricing-option names, e.g. 144 PIF. Capitals and extra spaces don't matter."
                  wide
                  htmlFor={`pkg-${row.key}-names`}
                >
                  <AdminTextarea
                    id={`pkg-${row.key}-names`}
                    rows={3}
                    value={row.namesText}
                    disabled={!canEdit}
                    onChange={(e) => setRow(row.key, { namesText: e.target.value })}
                  />
                </AdminField>
              </AdminGrid>
            </div>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel
        title="Extra sessions"
        subtitle="Pricing options that add sessions but aren't a package, like complimentary sessions. They count toward sessions left."
        icon={<Tag className="w-4 h-4" />}
      >
        <AdminField label="Names in Mindbody" hint="One per line." wide htmlFor="renewals-extra">
          <AdminTextarea
            id="renewals-extra"
            rows={2}
            value={form.value.extraNamesText}
            disabled={!canEdit}
            onChange={(e) => form.setField("extraNamesText", e.target.value)}
          />
        </AdminField>
      </AdminPanel>

      <AdminPanel
        title="Names seen in Mindbody"
        subtitle="Contract and pricing-option names found on this studio's clients that no package claims yet. Until one is matched, its clients show 'package not recognized'. A confirmed suggestion is matched when you save."
        flush
        actions={
          canEdit && suggested.length > 1 ? (
            <AdminButton variant="quiet" size="sm" onClick={() => confirm(suggested)}>
              Confirm all {suggested.length}
            </AdminButton>
          ) : undefined
        }
      >
        {adoptsStandardTable && (
          <AdminNotice tone="warn">
            {studioName} has no package table of its own yet: saving here makes Max Strength's standard prices{" "}
            {studioName}'s own. Check the prices in Packages above first.
          </AdminNotice>
        )}
        {didntFit.length > 0 && (
          <AdminNotice tone="warn">
            {didntFit.length === 1 ? "This name didn't fit" : "These names didn't fit"}: {didntFit.join(", ")}. A package holds
            at most {MAX_NAMES_PER_PACKAGE} Mindbody names and the extra sessions {MAX_EXTRA_SESSION_NAMES}; remove one
            that no longer sells to make room.
          </AdminNotice>
        )}
        {!namesSeen ? (
          <AdminEmpty title="Nothing seen yet">
            This list fills in after the nightly renewals job has run for {studioName}.
          </AdminEmpty>
        ) : unmatched.length === 0 ? (
          <AdminEmpty title="Every name is matched">
            All the names the nightly job found belong to a package or the extra-sessions list.
          </AdminEmpty>
        ) : (
          <AdminRows>
            {unmatched.map((n) => (
              <AdminRow
                key={`${n.kind}:${n.name}`}
                name={n.name}
                meta={
                  <span className="flex flex-col gap-0.5">
                    <span>{`${n.kind === "contract" ? "Contract" : "Pricing option"} · ${n.clients} client${n.clients === 1 ? "" : "s"}`}</span>
                    <span className={n.suggestion ? "font-semibold" : undefined}>
                      {n.suggestion ? `Suggested: ${suggestionWords(n.suggestion)}` : "No suggestion: match it by hand"}
                    </span>
                  </span>
                }
                trailing={
                  canEdit ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-2">
                      {n.suggestion && (
                        <AdminButton
                          variant="primary"
                          size="sm"
                          aria-label={`Confirm ${n.name} as ${suggestionWords(n.suggestion)}`}
                          onClick={() => confirm([n as (typeof suggested)[number]])}
                        >
                          Confirm
                        </AdminButton>
                      )}
                      <AdminSelect
                        aria-label={`Match ${n.name} to a package`}
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          assign([{ name: n.name, target: e.target.value }]);
                        }}
                      >
                        <option value="">Match to…</option>
                        {form.value.packages.map((p) => (
                          <option key={p.key} value={p.key}>
                            {p.label.trim() || "Unnamed package"}
                          </option>
                        ))}
                        <option value="__extra__">Extra sessions</option>
                      </AdminSelect>
                    </span>
                  ) : undefined
                }
              />
            ))}
          </AdminRows>
        )}
      </AdminPanel>

      {form.dirty && problems.length > 0 && (
        <AdminNotice tone="warn">
          <p className="font-semibold">Fix these before saving:</p>
          <ul className="list-disc pl-5">
            {problems.slice(0, 8).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </AdminNotice>
      )}

      {canEdit && (
        <SaveBar
          status={form.status}
          error={form.error}
          onSave={() => {
            if (problems.length === 0) void form.save();
          }}
          onDiscard={form.discard}
          saveLabel={problems.length > 0 ? "Fix the problems first" : "Save settings"}
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.label.trim() || "this package"}?`}
        body="Clients on it will show 'package not recognized' until its Mindbody names belong to another package. Nothing changes in Mindbody."
        confirmLabel="Remove package"
        destructive
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) {
            form.setField(
              "packages",
              form.value.packages.filter((r) => r.key !== removing.key),
            );
          }
          setRemoving(null);
        }}
      />
    </div>
  );
}
