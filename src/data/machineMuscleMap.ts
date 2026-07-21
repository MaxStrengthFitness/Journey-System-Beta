export interface MachineMuscleMapping {
  name: string;
  primary: any[];
  synergist: any[];
}

export const machineMuscleMap: Record<string, MachineMuscleMapping> = {
  // HORIZONTAL PUSH
  "m-chest-press": {
    name: "Chest Press",
    primary: ["chest"],
    synergist: ["front-deltoids", "back-deltoids", "triceps"],
  },
  "m-chest-fly": {
    name: "Chest Fly",
    primary: ["chest"],
    synergist: ["front-deltoids", "back-deltoids"],
  },

  // HORIZONTAL PULL
  "m-compound-row": {
    name: "Compound Row",
    primary: ["upper-back"], // lats & rhomboids
    synergist: ["biceps", "front-deltoids", "back-deltoids", "trapezius"],
  },
  "m-simple-row": {
    name: "Simple Row",
    primary: ["upper-back", "trapezius"],
    synergist: ["biceps"],
  },

  // VERTICAL PUSH
  "m-overhead-press": {
    name: "Overhead Press",
    primary: ["front-deltoids", "back-deltoids"],
    synergist: ["triceps", "trapezius"],
  },
  "m-dip": {
    name: "Dip",
    primary: ["triceps"],
    synergist: ["chest", "front-deltoids", "back-deltoids"],
  },

  // VERTICAL PULL
  "m-pulldown": {
    name: "Pulldown",
    primary: ["upper-back"], // lats
    synergist: ["biceps", "front-deltoids", "back-deltoids"],
  },
  "m-pullover": {
    name: "Pullover",
    primary: ["upper-back"], // lats
    synergist: ["chest", "triceps"],
  },

  // SHOULDER ISOLATION
  "m-lateral-raise": {
    name: "Lateral Raise",
    primary: ["front-deltoids", "back-deltoids"],
    synergist: ["trapezius"],
  },

  // ARM ISOLATION
  "m-bicep": {
    name: "Bicep Curl",
    primary: ["biceps"],
    synergist: ["forearm"],
  },
  "m-tricep-ext": {
    name: "Tricep Extension",
    primary: ["triceps"],
    synergist: ["forearm"],
  },

  // LOWER BODY PUSH
  "m-leg-press": {
    name: "Leg Press",
    primary: ["quadriceps", "gluteal"],
    synergist: ["hamstring", "calves", "adductor"],
  },
  "m-ext": {
    name: "Leg Extension",
    primary: ["quadriceps"],
    synergist: ["calves"],
  },

  // LOWER BODY PULL
  "m-leg-curl": {
    name: "Leg Curl",
    primary: ["hamstring"],
    synergist: ["calves", "gluteal"],
  },

  // HIP ISOLATION
  "m-hip-abd": {
    name: "Hip Abduction",
    primary: ["gluteal"],
    synergist: ["lower-back", "obliques"],
  },
  "m-hip-add": {
    name: "Hip Adduction",
    primary: ["adductor"],
    synergist: ["gluteal", "abs"],
  },

  // CORE / SPINE
  "m-lumbar": {
    name: "Lumbar Extension",
    primary: ["lower-back"],
    synergist: ["gluteal"],
  },
  "m-abs": {
    name: "Ab Crunch",
    primary: ["abs"],
    synergist: ["obliques"],
  },
  "m-torso-rotation": {
    name: "Torso Rotation",
    primary: ["obliques"],
    synergist: ["abs"],
  },

  // CERVICAL
  "m-neck": {
    name: "Neck Extension",
    primary: ["neck"],
    synergist: ["trapezius"],
  },
};
