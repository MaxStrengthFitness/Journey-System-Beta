import React, { useMemo } from 'react';
import Model, { IExerciseData } from 'react-body-highlighter';
import { MuscleId, AnatomyView } from '../data/machine-anatomy-map';

interface AnatomyFigureProps {
  view: AnatomyView;
  primary: MuscleId[];
  secondary?: MuscleId[];
  className?: string;
}

// Map our MuscleId taxonomy to the library's muscle names
const MUSCLE_MAP: Record<MuscleId, string[]> = {
  'pecs': ['chest'],
  'delts-front': ['front-deltoids'],
  'biceps': ['biceps'],
  'forearms': ['forearm'],
  'abs': ['abs'],
  'obliques': ['obliques'],
  'adductors': ['adductor'],
  'abductors': ['abductors'],
  'quads': ['quadriceps'],
  'traps': ['trapezius'],
  'delts-rear': ['back-deltoids'],
  'rhomboids': ['upper-back'], 
  'lats': ['upper-back', 'lower-back'], // Often overlaps
  'triceps': ['triceps'],
  'lower-back': ['lower-back'],
  'glutes': ['gluteal'],
  'hamstrings': ['hamstring'],
  'calves': ['calves'],
  'neck': ['neck']
};

export function AnatomyFigure({ view, primary, secondary = [], className, onMuscleClick }: AnatomyFigureProps & { onMuscleClick?: (muscleId: MuscleId) => void }) {
  const data = useMemo(() => {
    // Accumulate all primary muscles into one exercise, and secondary into another
    const primaryLibMuscles = Array.from(new Set((primary || []).flatMap(m => MUSCLE_MAP[m] || [])));
    const secondaryLibMuscles = Array.from(new Set((secondary || []).flatMap(m => MUSCLE_MAP[m] || [])));

    const result: any[] = [];
    
    if (primaryLibMuscles.length > 0) {
      result.push({
        name: 'Primary Target',
        muscles: primaryLibMuscles
      });
      // Pushing twice effectively increases frequency to 2 for these muscles
      result.push({
        name: 'Primary Target Max',
        muscles: primaryLibMuscles
      });
    }

    if (secondaryLibMuscles.length > 0) {
      result.push({
        name: 'Secondary Target',
        muscles: secondaryLibMuscles
      });
    }
    
    return result;
  }, [primary, secondary]);
  
  // Reverse map to get our MuscleId from string
  const getMuscleIdFromHighlighter = (libMuscle: string): MuscleId | undefined => {
    for (const [key, libMuscles] of Object.entries(MUSCLE_MAP)) {
      if (libMuscles.includes(libMuscle)) {
        return key as MuscleId;
      }
    }
    return undefined;
  };

  // Library only has anterior and posterior
  const type = view === 'back' ? 'posterior' : 'anterior';

  // Apply fixes B and C: max-height/max-width guards along with the new library
  return (
    <div className={`flex items-center justify-center h-full w-full ${className ?? ''}`}>
      <Model
        data={data}
        type={type}
        style={{ width: '100%', height: '100%', maxHeight: '100%', maxWidth: 'min(280px, 100%)' }}
        highlightedColors={['#38BDF8', '#F37427']}  // freq 1 = cyan, freq 2 = cta
        bodyColor="#334155"
        onClick={(exercise) => {
          const muscleId = getMuscleIdFromHighlighter(exercise.muscle);
          if (muscleId && onMuscleClick) {
            onMuscleClick(muscleId);
          }
        }}
      />
    </div>
  );
}
