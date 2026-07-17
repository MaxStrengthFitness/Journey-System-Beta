
export const ROUTINE_TEMPLATES = {
  INTRODUCTORY: [
    "Leg Press",
    "Comp Row",
    "Lumbar"
  ],
  STANDARD_MALE: [
    "Hip ADD",
    "Hip ABD",
    "Leg Press",
    "Comp Row",
    "Chest Press",
    "Lumbar"
  ],
  STANDARD_FEMALE: [
    "Hip ADD",
    "Hip ABD",
    "Leg Press",
    "Comp Row",
    "Seated Dip",
    "Lumbar"
  ]
};

export type RoutineTemplateType = keyof typeof ROUTINE_TEMPLATES;
