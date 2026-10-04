# The briefing as a Stack (Oct 3 2026)

**Branch:** `oct3/briefing-stack`, off master `6e788634` (the Relay Board and the self-made profile rule, live since Oct 3). **Ships with** `scripts/ship/ship-briefing-stack.ps1`. No Mindbody call, no Cloud Functions, no rules and no index change.

## Where it came from

AJ, on the iPad walk, Oct 3 2026: "I feel like we can have a better pre-session briefing screen just not the information that's on it but how it's displayed … interview me as a UX designer and try to do some research."

**What the research said, in short.** Hospital handoffs (I-PASS) put how sick the patient is first and keep a fixed order. Pilots brief the threats and what is different today, not everything. Situation awareness is "what it means for the next twenty minutes", not the raw data. Position and colour are read before words. Checklists hold only what can go wrong. And when every flag looks the same, people stop reading flags (alarm fatigue).

**Why the old screen felt off.** The most dangerous fact on it was the smallest text (an 11px "Shoulder limitation" chip whose instruction was a tap away). "Before you start" mixed safety, a hidden-note line, an InBody reminder and a goal at the same weight. Nothing said what had changed. The routine took half the screen and scrolled inside the page. Start floated over the content.

**AJ's answers.**
- When: "you wouldnt really have it open unless you know they are just about to be there … pre session briefing is they are coming in and you are double checking you have everything you need to know and filling anything in as you walk to the first machine with them." Before she arrives, and walking her in.
- First thing: **Safety: what could hurt her.**
- Routine: **One line, tap to edit.**
- On the way in: "all of the above, sometimes is everything, sometimes its one thing, sometimes its nothing maybe they came in extra early and you have time to hand them the pulse client view." One tap, the four dials, sore spots and a note.
- Privacy: **"Everything — it's about her."**
- Since last time: how the last session went, notes since, time away, life news.
- From three mockups (Stack, Body-first two-column, Headline): "We're definitely going to go with a stack … rather than the model that you made, we do have a muscular model that we use in the catalog in routine editor. So let's go ahead and use that model."

## What was built

Two commits:

1. **The pure half** (`src/features/briefing/stack.ts`, 15 tests): which body regions to light (her clinical flags by the codex's own table, `flagRegions`, and the regions carried over from the last session), which sides of the figure to draw, a tap on the model as a tracker region, what the last session says (a skip and its reason, a blood-flow set, a machine short of her usual), the routine as a line, and which of its machines her flags name.
2. **The screen** (`BriefingScreen.tsx`, `briefing.css`): the order in the README's "The Stack". The figure is `components/anatomy` BodyModel, the Catalog's and the Routine Builder's (`one-model.test.ts` still holds that nothing else draws one). `BodyStateTracker` gained one optional prop, `request`, so a tap on the figure opens its rating step.

**Nothing written changed.** Start passes the same routine, machines, note, check-in (`readiness`, `bodyStates`) and note category as before. A tap on the figure writes nothing until it is rated on the Dial.

## Calls I made (say if any is wrong)

- **"Her usual" needs three earlier performed sets** on that machine and is the median of her last five; a machine is mentioned only when last time was two or more reps under it. Time-based sets are left out.
- **The four Dials are open by default** and the rest are folded. There is no single "how is she feeling" tap: it would be a new field with no reader yet. If you want one overall read, it's a small follow-up.
- **The figure's caution colour is the briefing's warn amber**, not the kaizen red (reserved for rep quality). A sore spot captured on the way in is the live blue.
- **InBody and the renewal line moved to a quiet "Also today" footer.** A renewal coming up no longer stops the band saying "clear to go": it isn't a safety matter.
- **Life news (FORD) stays in "Something to ask about".** There is no separate "mention" line yet.

## Measured

On AJ's PC in the worktree, `TZ=America/New_York npx vitest run --dir src`: see `CLAUDE.md`'s Tests row. Typecheck 2 (baseline). Build clean. Rendered at iPad portrait width in a harness (limits, and clear to go) and checked by eye. **Not yet seen on an iPad.**
