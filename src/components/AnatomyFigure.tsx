import React from 'react';
import { MuscleId, AnatomyView } from '../data/machine-anatomy-map';

interface AnatomyFigureProps {
  view: AnatomyView;
  primary: MuscleId[];
  secondary?: MuscleId[];
  className?: string;
}

/**
 * One reusable atomic <Muscle> path.
 * All color comes from CSS variables — no Tailwind fill/stroke utilities,
 * no arbitrary hex. Inline style keeps the token contract explicit.
 */
function Muscle({
  id,
  muscle,
  d,
  primary,
  secondary,
}: {
  id: string;
  muscle: MuscleId;
  d: string;
  primary: MuscleId[];
  secondary: MuscleId[];
}) {
  const isPrimary = primary.includes(muscle);
  const isSecondary = !isPrimary && secondary.includes(muscle);

  const color = isPrimary
    ? 'var(--cta)'
    : isSecondary
    ? 'var(--cyan)'
    : 'var(--ink-d3)';

  const fillOpacity = isPrimary ? 0.78 : isSecondary ? 0.32 : 0.18;
  const strokeOpacity = isPrimary ? 0.95 : isSecondary ? 0.6 : 0.32;
  const strokeWidth = isPrimary ? 1.0 : isSecondary ? 0.75 : 0.5;

  return (
    <path
      id={id}
      data-muscle={muscle}
      d={d}
      style={{
        fill: color,
        fillOpacity,
        stroke: color,
        strokeOpacity,
        strokeWidth,
        strokeLinejoin: 'round',
        transition:
          'fill 280ms ease, fill-opacity 280ms ease, stroke 280ms ease, stroke-opacity 280ms ease, stroke-width 280ms ease',
      }}
    />
  );
}

/**
 * Body silhouette outline — non-interactive structural lines.
 * Always rendered at low contrast so the muscle highlights are the signal.
 */
function Silhouette({ d }: { d: string }) {
  return (
    <path
      d={d}
      style={{
        fill: 'none',
        stroke: 'var(--ink-d2)',
        strokeOpacity: 0.45,
        strokeWidth: 0.8,
        strokeLinejoin: 'round',
      }}
    />
  );
}

const VIEW_BOX = '0 0 200 500';

/* ──────────────────────────────────────────────────────────
   FRONT VIEW
   Placeholder geometry — anatomically positioned but simplified.
   Replace path `d=` attributes with real artwork later; IDs are stable.
   ────────────────────────────────────────────────────────── */
function FrontFigure({ primary, secondary }: { primary: MuscleId[]; secondary: MuscleId[] }) {
  return (
    <svg viewBox={VIEW_BOX} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" className="w-auto h-full">
      {/* Body silhouette */}
      <Silhouette d="M100,8 C115,8 122,18 122,32 C122,46 116,58 110,62 L110,72 L138,78 C146,80 154,86 158,98 L168,180 C170,196 168,220 162,232 L150,232 L142,168 L138,232 L130,260 L128,310 L122,478 L108,478 L102,310 L100,260 L98,310 L92,478 L78,478 L72,310 L70,260 L62,232 L58,168 L50,232 L38,232 C32,220 30,196 32,180 L42,98 C46,86 54,80 62,78 L90,72 L90,62 C84,58 78,46 78,32 C78,18 85,8 100,8 Z" />

      {/* Head fill (very subtle) */}
      <ellipse cx={100} cy={32} rx={22} ry={26} style={{ fill: 'var(--ink-d3)', fillOpacity: 0.08, stroke: 'none' }} />

      {/* Pecs */}
      <Muscle id="pecs-front" muscle="pecs" primary={primary} secondary={secondary}
        d="M68,88 Q70,80 100,80 Q100,118 82,124 Q70,118 68,108 Z M132,88 Q130,80 100,80 Q100,118 118,124 Q130,118 132,108 Z" />

      {/* Anterior deltoids */}
      <Muscle id="delts-front-left" muscle="delts-front" primary={primary} secondary={secondary}
        d="M58,82 a14,14 0 1,0 0.1,0 Z" />
      <Muscle id="delts-front-right" muscle="delts-front" primary={primary} secondary={secondary}
        d="M142,82 a14,14 0 1,0 0.1,0 Z" />

      {/* Biceps */}
      <Muscle id="biceps-front-left" muscle="biceps" primary={primary} secondary={secondary}
        d="M44,108 Q40,108 38,132 L46,170 L60,166 L62,114 Z" />
      <Muscle id="biceps-front-right" muscle="biceps" primary={primary} secondary={secondary}
        d="M156,108 Q160,108 162,132 L154,170 L140,166 L138,114 Z" />

      {/* Forearms */}
      <Muscle id="forearms-front-left" muscle="forearms" primary={primary} secondary={secondary}
        d="M40,176 L58,180 L56,226 L40,222 Z" />
      <Muscle id="forearms-front-right" muscle="forearms" primary={primary} secondary={secondary}
        d="M160,176 L142,180 L144,226 L160,222 Z" />

      {/* Abs */}
      <Muscle id="abs-front" muscle="abs" primary={primary} secondary={secondary}
        d="M86,124 Q86,118 100,118 Q114,118 114,124 L114,212 Q114,220 100,220 Q86,220 86,212 Z" />

      {/* Obliques */}
      <Muscle id="obliques-front-left" muscle="obliques" primary={primary} secondary={secondary}
        d="M76,126 L84,132 L84,210 L74,212 Z" />
      <Muscle id="obliques-front-right" muscle="obliques" primary={primary} secondary={secondary}
        d="M124,126 L116,132 L116,210 L126,212 Z" />

      {/* Adductors */}
      <Muscle id="adductors-front-left" muscle="adductors" primary={primary} secondary={secondary}
        d="M92,262 L96,275 L96,336 L88,338 Z" />
      <Muscle id="adductors-front-right" muscle="adductors" primary={primary} secondary={secondary}
        d="M108,262 L104,275 L104,336 L112,338 Z" />

      {/* Quads */}
      <Muscle id="quads-front-left" muscle="quads" primary={primary} secondary={secondary}
        d="M72,258 Q68,260 68,272 L72,368 L94,372 L96,272 Q96,260 92,258 Z" />
      <Muscle id="quads-front-right" muscle="quads" primary={primary} secondary={secondary}
        d="M128,258 Q132,260 132,272 L128,368 L106,372 L104,272 Q104,260 108,258 Z" />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────
   SIDE VIEW (figure facing right)
   ────────────────────────────────────────────────────────── */
function SideFigure({ primary, secondary }: { primary: MuscleId[]; secondary: MuscleId[] }) {
  return (
    <svg viewBox={VIEW_BOX} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" className="w-auto h-full">
      <Silhouette d="M110,10 C124,10 132,20 132,34 C132,46 126,58 122,62 L122,72 C134,76 144,84 146,98 L146,180 C146,200 138,224 132,238 L132,310 L128,478 L114,478 L112,310 L104,278 L96,310 L92,478 L78,478 L80,310 L82,238 C76,224 70,200 70,180 L70,108 C70,90 76,80 88,76 L98,72 L98,62 C92,58 86,46 86,34 C86,20 96,10 110,10 Z" />

      <ellipse cx={110} cy={32} rx={20} ry={24} style={{ fill: 'var(--ink-d3)', fillOpacity: 0.08, stroke: 'none' }} />

      {/* Pecs partial (chest profile) */}
      <Muscle id="pecs-side" muscle="pecs" primary={primary} secondary={secondary}
        d="M118,88 Q138,94 138,118 Q132,134 118,134 Z" />

      {/* Front/rear delts in profile */}
      <Muscle id="delts-front-side" muscle="delts-front" primary={primary} secondary={secondary}
        d="M126,82 a11,12 0 1,0 0.1,0 Z" />
      <Muscle id="delts-rear-side" muscle="delts-rear" primary={primary} secondary={secondary}
        d="M96,82 a11,12 0 1,0 0.1,0 Z" />

      {/* Biceps (anterior arm) */}
      <Muscle id="biceps-side" muscle="biceps" primary={primary} secondary={secondary}
        d="M126,110 L142,116 L142,162 L126,162 Z" />

      {/* Triceps (posterior arm) */}
      <Muscle id="triceps-side" muscle="triceps" primary={primary} secondary={secondary}
        d="M108,110 L124,116 L124,162 L108,162 Z" />

      {/* Forearm */}
      <Muscle id="forearms-side" muscle="forearms" primary={primary} secondary={secondary}
        d="M122,168 L142,172 L140,224 L120,222 Z" />

      {/* Abs (front torso) */}
      <Muscle id="abs-side" muscle="abs" primary={primary} secondary={secondary}
        d="M118,134 Q132,138 132,200 Q126,216 118,216 Z" />

      {/* Obliques (lateral) */}
      <Muscle id="obliques-side" muscle="obliques" primary={primary} secondary={secondary}
        d="M92,138 L102,144 L102,208 L90,208 Z" />

      {/* Lats (posterior ribcage) */}
      <Muscle id="lats-side" muscle="lats" primary={primary} secondary={secondary}
        d="M76,108 L94,114 L96,184 L82,188 Z" />

      {/* Glutes */}
      <Muscle id="glutes-side" muscle="glutes" primary={primary} secondary={secondary}
        d="M74,234 Q60,238 60,266 Q72,278 92,262 Z" />

      {/* Quads (anterior thigh) */}
      <Muscle id="quads-side" muscle="quads" primary={primary} secondary={secondary}
        d="M104,256 Q126,262 130,310 L118,366 L104,370 Z" />

      {/* Hamstrings (posterior thigh) */}
      <Muscle id="hamstrings-side" muscle="hamstrings" primary={primary} secondary={secondary}
        d="M84,256 Q68,262 64,310 L82,362 L94,366 Z" />

      {/* Calves (posterior lower leg) */}
      <Muscle id="calves-side" muscle="calves" primary={primary} secondary={secondary}
        d="M76,376 L94,380 L92,440 L72,442 Z" />

      {/* Neck (posterior cervical profile) */}
      <Muscle id="neck-side" muscle="neck" primary={primary} secondary={secondary}
        d="M96,62 L108,62 L108,76 L96,76 Z" />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────
   BACK VIEW
   ────────────────────────────────────────────────────────── */
function BackFigure({ primary, secondary }: { primary: MuscleId[]; secondary: MuscleId[] }) {
  return (
    <svg viewBox={VIEW_BOX} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" className="w-auto h-full">
      <Silhouette d="M100,8 C115,8 122,18 122,32 C122,46 116,58 110,62 L110,72 L138,78 C146,80 154,86 158,98 L168,180 C170,196 168,220 162,232 L150,232 L142,168 L138,232 L130,260 L128,310 L122,478 L108,478 L102,310 L100,260 L98,310 L92,478 L78,478 L72,310 L70,260 L62,232 L58,168 L50,232 L38,232 C32,220 30,196 32,180 L42,98 C46,86 54,80 62,78 L90,72 L90,62 C84,58 78,46 78,32 C78,18 85,8 100,8 Z" />

      <ellipse cx={100} cy={32} rx={22} ry={26} style={{ fill: 'var(--ink-d3)', fillOpacity: 0.08, stroke: 'none' }} />

      {/* Neck (posterior) */}
      <Muscle id="neck-back" muscle="neck" primary={primary} secondary={secondary}
        d="M88,60 L112,60 L112,78 L88,78 Z" />

      {/* Traps */}
      <Muscle id="traps-back" muscle="traps" primary={primary} secondary={secondary}
        d="M74,76 L100,68 L126,76 L132,120 L100,114 L68,120 Z" />

      {/* Rear deltoids */}
      <Muscle id="delts-rear-left" muscle="delts-rear" primary={primary} secondary={secondary}
        d="M58,84 a14,14 0 1,0 0.1,0 Z" />
      <Muscle id="delts-rear-right" muscle="delts-rear" primary={primary} secondary={secondary}
        d="M142,84 a14,14 0 1,0 0.1,0 Z" />

      {/* Rhomboids */}
      <Muscle id="rhomboids-back" muscle="rhomboids" primary={primary} secondary={secondary}
        d="M86,100 L100,96 L114,100 L114,138 L86,138 Z" />

      {/* Lats (V-taper) */}
      <Muscle id="lats-back-left" muscle="lats" primary={primary} secondary={secondary}
        d="M68,122 Q56,128 62,200 Q84,228 100,228 L100,150 L80,134 Z" />
      <Muscle id="lats-back-right" muscle="lats" primary={primary} secondary={secondary}
        d="M132,122 Q144,128 138,200 Q116,228 100,228 L100,150 L120,134 Z" />

      {/* Triceps */}
      <Muscle id="triceps-back-left" muscle="triceps" primary={primary} secondary={secondary}
        d="M40,108 Q38,114 40,164 L60,168 L62,114 Z" />
      <Muscle id="triceps-back-right" muscle="triceps" primary={primary} secondary={secondary}
        d="M160,108 Q162,114 160,164 L140,168 L138,114 Z" />

      {/* Forearms */}
      <Muscle id="forearms-back-left" muscle="forearms" primary={primary} secondary={secondary}
        d="M40,172 L60,172 L58,226 L40,224 Z" />
      <Muscle id="forearms-back-right" muscle="forearms" primary={primary} secondary={secondary}
        d="M160,172 L140,172 L142,226 L160,224 Z" />

      {/* Lower back / erectors */}
      <Muscle id="lower-back" muscle="lower-back" primary={primary} secondary={secondary}
        d="M88,210 L112,210 L116,254 L84,254 Z" />

      {/* Glutes */}
      <Muscle id="glutes-back-left" muscle="glutes" primary={primary} secondary={secondary}
        d="M68,252 Q56,266 70,310 Q88,320 100,310 L100,260 Z" />
      <Muscle id="glutes-back-right" muscle="glutes" primary={primary} secondary={secondary}
        d="M132,252 Q144,266 130,310 Q112,320 100,310 L100,260 Z" />

      {/* Hamstrings */}
      <Muscle id="hamstrings-back-left" muscle="hamstrings" primary={primary} secondary={secondary}
        d="M72,316 Q66,330 74,380 L94,378 L96,316 Z" />
      <Muscle id="hamstrings-back-right" muscle="hamstrings" primary={primary} secondary={secondary}
        d="M128,316 Q134,330 126,380 L106,378 L104,316 Z" />

      {/* Calves */}
      <Muscle id="calves-back-left" muscle="calves" primary={primary} secondary={secondary}
        d="M72,388 L94,390 L92,448 L72,448 Z" />
      <Muscle id="calves-back-right" muscle="calves" primary={primary} secondary={secondary}
        d="M128,388 L106,390 L108,448 L128,448 Z" />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────
   Public component
   ────────────────────────────────────────────────────────── */
export function AnatomyFigure({
  view,
  primary,
  secondary = [],
  className,
}: AnatomyFigureProps) {
  return (
    <div className={`flex items-center justify-center h-full w-full ${className ?? ''}`}>
      {view === 'front' && <FrontFigure primary={primary} secondary={secondary} />}
      {view === 'side' && <SideFigure primary={primary} secondary={secondary} />}
      {view === 'back' && <BackFigure primary={primary} secondary={secondary} />}
    </div>
  );
}
