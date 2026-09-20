/**
 * Demo Mode — the training studio.
 *
 * Demo Mode is a REAL studio document, flagged `isDemo`, that every trainer
 * can enter from the studio selection screen. Demo clients, sessions, logs
 * and routines live in the ordinary collections scoped to this studio id, so
 * every screen in the app works inside it without a second code path. What
 * keeps it separate is not a parallel database — it is this id, the guards in
 * `guards.ts`, and the Firestore rules that name it.
 *
 * The id is FIXED rather than generated. A fixed id means the seeder is
 * idempotent (re-running it updates the same documents instead of creating a
 * second demo studio), every environment agrees on what "the demo studio"
 * means, and the Firestore rules can name it as a literal without spending a
 * document read on a lookup.
 *
 * Round: Demo Mode, Sep 20 2026. The design is carried over from the retired
 * `demo-mode-foundation` branch (Sep 6, tag `archive/demo-mode-foundation`),
 * which proved it and then fell 259 commits behind. AJ's decisions from that
 * round still stand: one shared demo studio, data in the real collections,
 * entry from the studio selection screen only, access derived from the id.
 */
export const DEMO_STUDIO_ID = "demo-studio";

/** Shown wherever a studio name is shown, including the global header. */
export const DEMO_STUDIO_NAME = "Demo Mode";

/** Stands in for the address line on the studio card. */
export const DEMO_STUDIO_TAGLINE = "Training studio — practise freely";

/**
 * Studios operate in US Eastern time, and the seeded session history is
 * generated relative to it, so the demo studio matches.
 */
export const DEMO_STUDIO_TIMEZONE = "America/New_York";

/**
 * Every demo document also carries `isDemo: true`. The studio id is the
 * primary signal; this flag is the backstop for a record that has been copied,
 * exported or read somewhere the studio scoping was not carried along — and
 * it is what the wipe queries, because one flag queried identically everywhere
 * cannot be missed by a collection somebody adds next month.
 */
export const DEMO_FLAG = "isDemo" as const;

/**
 * Bump this when the seeded content changes shape. The seeder writes it onto
 * the studio document, so "Set up" can tell an up-to-date demo studio from one
 * laid down by an older version of the app.
 */
export const DEMO_SEED_VERSION = 2;

/**
 * Emails use a reserved TLD that can never route anywhere (RFC 2606), so even
 * a bug that tried to contact a demo client could not reach a real inbox. The
 * app contacts nobody by design; this is the second lock on that door.
 */
export const DEMO_EMAIL_DOMAIN = "demo.invalid";
