/**
 * Operations → Renewals → Settings: when each studio starts the renewal
 * conversation, and its own package table.
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
import { Package, Plus, Timer, Trash2, Tag } from "lucide-react";
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
  formToSettings,
  newPackageRow,
  settingsPatchFromForm,
  settingsToForm,
  type PackageRowForm,
  type RenewalSettingsForm,
} from "../../renewals/settings-form";
import { buildPackageNameIndex, SETTING_LABELS } from "../../renewals/settings";
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
  breakDays: "Two weeks is the History tab's rule too.",
  lostAfterDays: "Days after billing ends with no new package before a client counts as lost.",
};

export interface RenewalSettingsPanelProps {
  studioId: string;
  studioName: string;
  settings: RenewalSettings;
  /** False while the studio is still on the defaults. */
  saved: boolean;
  namesSeen: RenewalNamesSeen | null;
  canEdit: boolean;
}

export function RenewalSettingsPanel({
  studioId,
  studioName,
  settings,
  saved,
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

  const form = useDirtyForm<RenewalSettingsForm>(external, onSave);
  // The save callback needs the live draft; a ref keeps onSave's identity stable.
  const draftRef = React.useRef(form.value);
  draftRef.current = form.value;

  const { problems } = useMemo(() => formToSettings(form.value), [form.value]);
  const [removing, setRemoving] = useState<PackageRowForm | null>(null);

  const setRow = (key: string, patch: Partial<PackageRowForm>) =>
    form.setField(
      "packages",
      form.value.packages.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );

  const unmatched = useMemo(() => {
    const index = buildPackageNameIndex(formToSettings(form.value).settings);
    return Object.values(namesSeen?.names ?? {})
      .filter((n) => n?.name && !index.tierFor(n.name) && !index.isExtraSessions(n.name))
      .sort((a, b) => b.clients - a.clients);
  }, [namesSeen, form.value]);

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
          {studioName} is using the standard settings below. Change anything and save to make them
          this studio's own.
        </AdminNotice>
      )}
      {!canEdit && (
        <AdminNotice tone="info">
          Only this studio's leaders can change these settings.
        </AdminNotice>
      )}

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
        subtitle="Contract and pricing-option names found on this studio's clients that no package claims yet. Until one is matched, its clients show 'package not recognized'."
        flush
      >
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
                meta={`${n.kind === "contract" ? "Contract" : "Pricing option"} · ${n.clients} client${n.clients === 1 ? "" : "s"}`}
                trailing={
                  canEdit ? (
                    <AdminSelect
                      aria-label={`Match ${n.name} to a package`}
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        form.setFields(assignNameInForm(form.value, n.name, e.target.value));
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
