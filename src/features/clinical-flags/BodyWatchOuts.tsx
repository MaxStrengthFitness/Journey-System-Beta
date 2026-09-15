import { useMemo } from "react";
import { ShieldAlert } from "lucide-react";
import { generalWatchOuts, machineWatchOuts } from "../../lib/clinical-watchouts";
import type { Machine } from "../../types";
import { selectedFlags } from "./flag-search";
import "./clinical-flags.css";

/**
 * The watch-out banner at the top of the Body section (client-profile audit:
 * "any active medical history, constraint or watch-out item must be highly
 * visible… without having to dig through paragraphs of text").
 *
 * One glance: the flags, most serious first; what applies to every set; and
 * which machines on this studio's floor carry a specific instruction. The
 * detail for a machine is in its machine window.
 */
export function BodyWatchOuts({
  flagIds,
  machines,
  hasMedicalText,
}: {
  flagIds: readonly string[] | null | undefined;
  machines: Machine[];
  /** Medical history or constraints are written below. */
  hasMedicalText: boolean;
}) {
  const flags = useMemo(() => selectedFlags(flagIds), [flagIds]);
  const everySet = useMemo(() => generalWatchOuts(flagIds), [flagIds]);
  const affected = useMemo(
    () =>
      machines
        .filter((m) => machineWatchOuts(flagIds, m).length > 0)
        .map((m) => m.name)
        .sort((a, b) => a.localeCompare(b)),
    [flagIds, machines],
  );

  if (flags.length === 0 && !hasMedicalText) return null;
  const worst = flags[0]?.tone ?? "modify";

  return (
    <section className="cfl-banner" data-tone={worst} aria-label="Watch-outs">
      <header className="cfl-banner__head">
        <ShieldAlert size={18} strokeWidth={2.4} aria-hidden />
        <span>Watch-outs</span>
      </header>
      {flags.length > 0 && (
        <div className="cfl-on">
          {flags.map((f) => (
            <span key={f.id} className="cfl-chip cfl-chip--static" data-tone={f.tone} title={f.full}>
              {f.name}
            </span>
          ))}
        </div>
      )}
      {everySet.length > 0 && (
        <ul className="cfl-banner__list">
          {everySet.map((w) => (
            <li key={w.flagId}>
              <b>Every set:</b> {w.instruction}
            </li>
          ))}
        </ul>
      )}
      {affected.length > 0 && (
        <p className="cfl-banner__line">
          <b>Machine instructions on file for:</b> {affected.join(", ")} — open the machine for the detail.
        </p>
      )}
      {hasMedicalText && <p className="cfl-banner__line">Medical history and constraints are written below — read them before loading.</p>}
    </section>
  );
}
