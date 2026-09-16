/**
 * BODY REGIONS on the briefing — where it hurts, how much, and for how long.
 *
 * Reporting round, Sep 2026. Step one is unchanged: pick a region from
 * BODY_REGIONS. Step two used to be two buttons (Stiff / Prime); it is now
 * the Dial — Pain · Stiff · As usual · Better · Recovered — so an injury can
 * be tracked coming back rather than only flagged. Once a value below the
 * centre is chosen (Pain, Stiff) a "Matters until" day can be added: the
 * briefing keeps showing the region from the last session until that day.
 *
 * What is written per region: `{ region, state, dial, until? }`. `state` is
 * derived from the dial (below the centre → stiff) so every older reader
 * still works; `until` is omitted, never `undefined`, because Firestore
 * refuses undefined. Chips read the Dial's word, never a number.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronDown, X, Check } from 'lucide-react';
import { BodyStateTag, DialValue } from '../types';
import { BODY_REGIONS } from '../data/body-regions';
import { cn } from '../lib/utils';
import { Dial, REGION_SCALE, dialFromRegionState, dialTone, dialWord, regionStateFromDial } from '../features/rating';
import { studioTodayKey } from '../lib/studio-time';

interface BodyStateTrackerProps {
  value: BodyStateTag[];
  onChange: (next: BodyStateTag[]) => void;
  disabled?: boolean;
  className?: string;
}

type View = 'region' | 'state';

/** "until Thu" / "until Sep 25" for a chip, from a yyyy-mm-dd studio day. */
function untilChipLabel(until: string | undefined): string | null {
  if (!until || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return null;
  const d = new Date(`${until}T12:00:00`);
  if (isNaN(d.getTime())) return null;
  const today = studioTodayKey();
  if (until === today) return 'until today';
  const [ty, tm, td] = today.split('-').map(Number);
  const [uy, um, ud] = until.split('-').map(Number);
  const diff = Math.round((Date.UTC(uy, um - 1, ud) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
  if (diff === 1) return 'until tomorrow';
  if (diff > 1 && diff < 7) return `until ${d.toLocaleDateString('en-US', { weekday: 'short' })}`;
  return `until ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/** Chip colour by urgency — the Dial's own tones, from the equipment tokens. */
function chipStyle(dial: DialValue | null): React.CSSProperties {
  const tone = dial === null ? 'live' : dialTone(dial);
  switch (tone) {
    case 'alert':
      return { background: 'var(--eq-alert-fill)', color: 'var(--eq-alert)', borderColor: 'var(--eq-alert)' };
    case 'warn':
      return { background: 'var(--eq-warn-fill)', color: 'var(--eq-warn)', borderColor: 'var(--eq-warn)' };
    case 'ok':
    case 'ok-strong':
      return { background: 'var(--eq-ok-fill)', color: 'var(--eq-ok)', borderColor: 'var(--eq-ok)' };
    default:
      return { background: 'var(--eq-live-fill)', color: 'var(--eq-live-text)', borderColor: 'var(--eq-live)' };
  }
}

export function BodyStateTracker({
  value,
  onChange,
  disabled,
  className,
}: BodyStateTrackerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('region');
  const [pendingRegion, setPendingRegion] = useState<string | null>(null);
  const [pendingDial, setPendingDial] = useState<DialValue | null>(null);
  const [pendingUntil, setPendingUntil] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside / Escape dismiss
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closePopover();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePopover();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const closePopover = () => {
    setOpen(false);
    setView('region');
    setPendingRegion(null);
    setPendingDial(null);
    setPendingUntil('');
  };

  const handleSelectRegion = (region: string) => {
    const existing = value.find((t) => t.region === region);
    setPendingRegion(region);
    setPendingDial(existing ? (existing.dial ?? dialFromRegionState(existing.state)) : null);
    setPendingUntil(existing?.until ?? '');
    setView('state');
  };

  const handleSave = () => {
    if (!pendingRegion || pendingDial === null) return;
    // Dedupe: if region already tagged, replace it.
    const next = value.filter((t) => t.region !== pendingRegion);
    const tag: BodyStateTag = {
      region: pendingRegion,
      state: regionStateFromDial(pendingDial),
      dial: pendingDial,
    };
    // "Matters until" only makes sense for something that is wrong today,
    // and the key is OMITTED when empty — Firestore refuses `undefined`.
    if (pendingDial < 0 && /^\d{4}-\d{2}-\d{2}$/.test(pendingUntil)) tag.until = pendingUntil;
    next.push(tag);
    onChange(next);
    closePopover();
  };

  const handleRemoveTag = (region: string) => {
    onChange(value.filter((t) => t.region !== region));
  };

  const taggedRegions = new Set(value.map((t) => t.region));
  const todayKey = studioTodayKey();

  return (
    <div className={cn('relative w-full', className)} ref={containerRef}>
      {/* Chips row */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {value.map((tag) => {
            const dial = tag.dial ?? dialFromRegionState(tag.state);
            const word = dialWord(REGION_SCALE, dial);
            const untilText = untilChipLabel(tag.until);
            return (
              <button
                key={tag.region}
                type="button"
                onClick={() => handleRemoveTag(tag.region)}
                style={chipStyle(dial)}
                className={cn(
                  'inline-flex items-center gap-2 h-11 min-w-[140px] px-3 rounded-xl border text-[13px] font-medium uppercase tracking-wide transition-all active:scale-95',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan',
                )}
                aria-label={`Remove ${tag.region} (${word}${untilText ? `, ${untilText}` : ''})`}
              >
                <span className="pointer-events-none">{tag.region}</span>
                <span className="pointer-events-none text-[11px] opacity-70">·</span>
                <span className="pointer-events-none">{word}</span>
                {untilText && (
                  <span className="pointer-events-none text-[11px] normal-case tracking-normal opacity-80">
                    {untilText}
                  </span>
                )}
                <span className="pointer-events-none ml-auto opacity-70">
                  <X className="w-4 h-4" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center justify-between w-full h-11 px-4 rounded-xl bg-surface-2 border border-div-d text-ink-d2 text-[13px] font-medium uppercase tracking-wide transition-all',
          'hover:bg-bg-dark-3 hover:text-white',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          open && 'ring-2 ring-cyan'
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Tag Body Region
        </span>
        <ChevronDown
          className={cn(
            'w-4 h-4 transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* Modal Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={closePopover}
        >
          <div
            role="dialog"
            aria-label="Body region picker"
            className="w-full max-w-sm max-h-[85dvh] bg-surface-1 border border-div-d rounded-xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {view === 'region' ? (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="px-4 py-3 border-b border-div-d flex-shrink-0 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-widest text-ink-d2 font-bold">
                    Select Region
                  </span>
                  <button type="button" onClick={closePopover} className="flex items-center justify-center w-11 h-11 -mr-2 text-ink-d2 hover:text-white transition-colors" aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto py-1">
                  {BODY_REGIONS.map((region) => {
                    const isTagged = taggedRegions.has(region);
                    return (
                      <button
                        key={region}
                        type="button"
                        onClick={() => handleSelectRegion(region)}
                        className={cn(
                          'flex items-center justify-between w-full h-12 px-4 text-left text-[14px] font-medium transition-colors',
                          'hover:bg-bg-dark-3 focus-visible:outline-none focus-visible:bg-bg-dark-3',
                          isTagged ? 'text-ink-d3' : 'text-ink-d1'
                        )}
                      >
                        <span>{region}</span>
                        {isTagged && (
                          <span className="text-[10px] uppercase tracking-widest text-cyan font-bold">
                            Update
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="flex items-center gap-2 px-2 py-2 border-b border-div-d flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setView('region');
                      setPendingRegion(null);
                      setPendingDial(null);
                      setPendingUntil('');
                    }}
                    className="flex items-center justify-center w-11 h-11 rounded-lg text-ink-d2 hover:bg-bg-dark-3 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                    aria-label="Back to region list"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-[13px] font-medium uppercase tracking-wide text-ink-d1">
                    {pendingRegion}
                  </span>
                  <div className="ml-auto flex items-center">
                    <button type="button" onClick={closePopover} className="flex items-center justify-center w-11 h-11 text-ink-d2 hover:text-white transition-colors" aria-label="Close">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto">
                  <Dial
                    scale={REGION_SCALE}
                    sub={pendingRegion ?? undefined}
                    value={pendingDial}
                    onChange={setPendingDial}
                    legend="all"
                  />

                  {pendingDial !== null && pendingDial < 0 && (
                    <label className="flex flex-col gap-1.5" data-testid="body-until">
                      <span className="text-[11px] uppercase tracking-widest text-ink-d2 font-bold">
                        Matters until <span className="normal-case tracking-normal font-medium opacity-80">(optional)</span>
                      </span>
                      <input
                        type="date"
                        min={todayKey}
                        value={pendingUntil}
                        onChange={(e) => setPendingUntil(e.target.value)}
                        className="h-11 px-3 rounded-lg border border-div-d bg-surface-2 text-ink-d1 text-[14px]"
                        aria-label="Matters until"
                      />
                      <span className="text-[12px] text-ink-d2">Keeps showing on the briefing until then</span>
                    </label>
                  )}

                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={pendingDial === null}
                    className="inline-flex w-full h-12 items-center justify-center gap-2 rounded-xl bg-cyan text-[14px] font-bold uppercase tracking-widest text-black disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                  >
                    <Check className="w-4 h-4" aria-hidden />
                    {pendingDial === null ? 'Tap how it is today' : `Save · ${dialWord(REGION_SCALE, pendingDial)}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
