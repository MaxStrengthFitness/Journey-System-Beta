import React from "react";
import { ArrowLeft, GitCompare, Loader2, RefreshCw } from "lucide-react";
import { collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "../../../../firebase";
import {
  AdminButton,
  AdminEmpty,
  AdminHeader,
  AdminNotice,
  AdminPanel,
  AdminScreen,
} from "../../primitives";
import type { MachineCatalogEntry } from "../../../../types/machines";
import { useOptionalActiveStudio } from "../../../../contexts/ActiveStudioContext";
import { formatStudioDate } from "../../../../lib/studio-time";
import { modelLabel } from "../../../machine-codex/models";
import { useMachineModels } from "../../../machine-codex/models-store";
import { definitionOf } from "../definition-defaults";
import { compareStandard, networkSentence, type RosterDocLike, type StudioComparison } from "./compare";
import "../editor/codex-editor.css";

/**
 * COMPARE — head office's view of one catalog machine across every studio
 * (Codex R5, the Sep 21 rule; built Sep 28 2026 with the rule itself, never
 * half). Every studio's differences from the standard, and above them every
 * safety line a studio took off, with its reason, who and when.
 *
 * Administrators only: it is opened from Admins → Catalog, and the one read
 * it makes — the roster entries whose lineage is this machine, across every
 * studio — is a collection-group read the rules give administrators alone.
 * It is the same query the catalog list already counts with (served by the
 * existing roster basedOn index), made once when the view opens and again on
 * Check again. No listener, no timer. A read that fails says so: unknown,
 * never "nobody changed anything".
 */
export function MachineCompare({
  machine,
  onBack,
  backLabel,
}: {
  machine: MachineCatalogEntry;
  onBack: () => void;
  backLabel: string;
}) {
  const [state, setState] = React.useState<
    { status: "loading" } | { status: "failed" } | { status: "done"; docs: RosterDocLike[] }
  >({ status: "loading" });
  const [everyone, setEveryone] = React.useState(false);

  const load = React.useCallback(async () => {
    setState({ status: "loading" });
    try {
      const snap = await getDocs(query(collectionGroup(db, "roster"), where("basedOn", "==", machine.id)));
      setState({
        status: "done",
        docs: snap.docs.map((d) => ({ ...(d.data() as RosterDocLike), path: d.ref.path })),
      });
    } catch (err) {
      console.warn("[compare] the studios' copies could not be read", err);
      setState({ status: "failed" });
    }
  }, [machine.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const studios = useOptionalActiveStudio()?.studios ?? [];
  const names = React.useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of studios) if (s.id) out[s.id] = s.name;
    return out;
  }, [studios]);
  const { byId: models } = useMachineModels();
  const standard = React.useMemo(() => definitionOf(machine), [machine]);
  const result = React.useMemo(
    () => (state.status === "done" ? compareStandard(standard, state.docs, names) : null),
    [state, standard, names],
  );

  const shown = result
    ? result.units.filter((u) => everyone || !u.follows)
    : [];

  return (
    <AdminScreen>
      <AdminHeader
        icon={<GitCompare className="w-5 h-5" />}
        title={`${machine.name} · Compare`}
        subtitle="Every studio's copy beside the Max Strength standard: settings and words, never a studio's numbers."
        actions={
          <>
            <AdminButton variant="quiet" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" /> {backLabel}
            </AdminButton>
            <AdminButton variant="quiet" onClick={() => void load()} disabled={state.status === "loading"}>
              <RefreshCw className="w-4 h-4" /> Check again
            </AdminButton>
          </>
        }
      />

      {state.status === "loading" && (
        <AdminNotice tone="info">
          <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> Reading every studio&apos;s copy…
        </AdminNotice>
      )}
      {state.status === "failed" && (
        <AdminNotice tone="warn">
          The studios&apos; copies couldn&apos;t be read just now. That is &ldquo;couldn&apos;t check&rdquo;,
          not &ldquo;nobody changed anything&rdquo; — try Check again.
        </AdminNotice>
      )}

      {result && (
        <>
          <AdminPanel>
            <p className="adm-mx__sentence">{networkSentence(result, machine.name)}</p>
          </AdminPanel>

          {result.removed.length > 0 && (
            <AdminPanel
              title="Safety lines taken off"
              subtitle="Each one leaves that studio's unit and nowhere else. The reason is the studio's own words."
            >
              <div className="adm-mx__list">
                {result.removed.map((r, i) => (
                  <div key={`${r.studioId}-${r.field}-${i}`} className="adm-mx__item adm-mx__removed">
                    <div className="adm-mx__itemhead">
                      <span className="adm-mx__name">{r.studioName}</span>
                      <span className="adm-mx__meta">
                        {r.by?.name || "Someone at the studio"}
                        {r.at ? ` · ${formatStudioDate(r.at, { month: "short", day: "numeric", year: "numeric" })}` : ""}
                      </span>
                    </div>
                    <p className="adm-mx__line adm-mx__was">
                      {labelFor(r.field)}: &ldquo;{r.line}&rdquo;
                    </p>
                    <p className="adm-mx__line">
                      <strong>Why:</strong> {r.reason}
                    </p>
                  </div>
                ))}
              </div>
            </AdminPanel>
          )}

          <AdminPanel
            title="By studio"
            subtitle={everyone ? "Every studio with this machine, by name." : "The studios whose copy differs, by name."}
            actions={
              <div className="adm-mx__modes">
                <AdminButton variant={everyone ? "ghost" : "quiet"} aria-pressed={!everyone} onClick={() => setEveryone(false)}>
                  Only differences
                </AdminButton>
                <AdminButton variant={everyone ? "quiet" : "ghost"} aria-pressed={everyone} onClick={() => setEveryone(true)}>
                  Every studio
                </AdminButton>
              </div>
            }
          >
            {shown.length === 0 ? (
              <AdminEmpty title={result.units.length === 0 ? "Not on any floor yet" : "Every copy follows the standard"}>
                {result.units.length === 0
                  ? "When a studio adds this machine to its floor it shows here."
                  : "Nothing to compare: no studio has changed its copy."}
              </AdminEmpty>
            ) : (
              <div className="adm-mx__list">
                {shown.map((u) => (
                  <StudioCard key={`${u.studioId}-${u.machineId}`} unit={u} modelName={u.modelId ? modelLabel(models[u.modelId]) || undefined : undefined} />
                ))}
              </div>
            )}
          </AdminPanel>
        </>
      )}
    </AdminScreen>
  );
}

const FIELD_WORDS: Record<string, string> = {
  clinicalWarnings: "Clinical warning",
  contraindicatedFor: "Contraindicated for",
  sequencingContraindications: "Sequencing",
  alignmentCheckpoints: "Checkpoint",
  stopRules: "Stop rule",
  watchOuts: "Watch-out",
};

function labelFor(field: string): string {
  return FIELD_WORDS[field] ?? field;
}

const STATUS_WORDS: Record<string, string> = {
  active: "In service",
  maintenance: "Out of service",
  inactive: "Switched off",
};

function StudioCard({ unit, modelName }: { unit: StudioComparison; modelName?: string }) {
  const meta = [
    unit.kind === "copy" ? "Their copy" : "Their own machine, based on this one",
    unit.modelId ? modelName ?? `A model no longer recorded (${unit.modelId})` : null,
    STATUS_WORDS[unit.status] ?? unit.status,
  ]
    .filter(Boolean)
    .join(" · ");

  const safety = unit.differences.filter((d) => d.tier === "additive");
  const method = unit.differences.filter((d) => d.tier === "method");
  const hardware = unit.differences.filter((d) => d.tier === "studio");

  return (
    <div className="adm-mx__item">
      <div className="adm-mx__itemhead">
        <span className="adm-mx__name">{unit.studioName}</span>
        <span className="adm-mx__meta">{meta}</span>
      </div>

      {unit.kind === "own" && (
        <p className="adm-mx__line">
          It inherits nothing from the standard, so it is not compared line by line
          {unit.adoptedFromName ? ` (copied from ${unit.adoptedFromName}'s machine)` : ""}.
        </p>
      )}

      {unit.kind === "copy" && unit.follows && <p className="adm-mx__line">Follows the standard exactly.</p>}

      {unit.removed.length > 0 && (
        <p className="adm-mx__line">
          <strong>Took off:</strong>{" "}
          {unit.removed.map((r) => `${labelFor(r.field)} “${r.line}” — ${r.reason}`).join("; ")}
        </p>
      )}
      {unit.added.length > 0 && (
        <p className="adm-mx__line">
          <strong>Added:</strong> {unit.added.map((a) => `${labelFor(a.field)} “${a.line}”`).join("; ")}
        </p>
      )}

      {[
        { title: "Safety", list: safety },
        { title: "Max Strength's words", list: method },
        { title: "The unit", list: hardware },
      ]
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <div key={g.title} className="adm-me__stack">
            <span className="adm-me__inheritedhead">{g.title}</span>
            {g.list.flatMap((d) =>
              d.lines.map((l, i) => (
                <p key={`${d.field}-${i}`} className="adm-mx__line">
                  <strong>{l.label}</strong>: standard <span className="adm-mx__was">&ldquo;{l.standard}&rdquo;</span> →
                  here &ldquo;{l.studio}&rdquo;
                </p>
              )),
            )}
          </div>
        ))}
    </div>
  );
}
