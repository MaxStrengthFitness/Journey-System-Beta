# The Codex source check — the twenty machines against the Academy

*Sep 28 2026, overnight. Codex R1, the fourth phase of the Machine Catalog room (branch `redesign/catalog`, on `1c38174`). Read-only: no code, no data and no catalog document changed. Every line the app holds for the twenty MSF machines was checked against `docs/msf-academy/` in a worktree on AJ's PC. This page is for AJ to rule on.*

## What was asked

The Codex room's question 2 on the Blueprints page: "Who rules when sources disagree, like 'contraindicated for knee replacement' against Academy 6? And may we first check all 20 machines, read-only, marking each method line sourced, unsourced or contradicted?" Its default, which this round follows: AJ rules, and the check runs first, read-only. The handoff's Finding 2 (the Leg Press's knee replacement, 90° and "L4/L5 shear" lines) and Finding 3 (never to failure reaching no floor screen) are answered here.

AJ's answers that touch it:

> On the body figure: "I would like to use our current body model for the body model ... I know it doesn't really have the most accurate markings on the correct muscle points I feel like we can spend a little bit more time to kind of make that a better accurate". So the markings that look wrong are listed at the end, for that later work; nothing is redrawn tonight.

> On starting weights: "i dont like our current starting weights and would rather have actual data to go off of for our suggested weights from our clients data once we have it on the app".

> On The Renaissance of Exercise: paraphrase it with a book reference, never quote it. The book is not in `docs/msf-academy/`, so it played no part in this check.

## The answer, short

- **1,015 lines checked**, one verdict each. Of the 795 that make a claim about the method, **721 are sourced** in a Quick Reference Guide, an overview, a spoken script or an Academy module. **23 are contradicted** by one of them. **29 have no source** anywhere in the Academy. **22 appear only in the standardized setup guides**, which summarise the Academy rather than belong to it. The other 220 lines are the app's own labels (the figure's muscles, the floor name, the dial names); some of those disagree with the Academy too, and they are listed.
- **Every starting weight is unsourced, twenty of twenty.** The neck machine's is contradicted outright: the Academy starts most clients at 20 lb and the app starts men at 30. AJ has already ruled that there is no house starting weight.
- **The Leg Press is the worst page (Finding 2).** "Contraindicated for: Knee Replacement" is the opposite of Academy 6, which puts the Leg Press in most or all of a knee-replacement client's workouts once physical therapy is done. The 90° knee limit, the "L4/L5 shear" warning and "Severe Patellar Tendonitis" appear nowhere in the Academy. Its knee advice points the wrong way. Most of these came from an old seed file, not from the Academy.
- **Never to failure is set on the right two machines, the Lumbar and the neck (Finding 3).** Until this round a trainer saw it only as a badge on My Studio → Machines, without its reason. The Catalog shows it now, with the reason; the Active Session still does not.
- **Most of the damage has two causes, both in one place.** The generator reads an old seed file (`src/data/default-machines.ts`) before the Academy for posture, contraindications, sequencing and the dial list, and it has five small faults in how it reads the setup guides. So a fix is a corrected source, a regenerated file and one administrator's button, not twenty hand edits.

## The rulings

Each has a suggested answer, which is the Academy's own. "Follow the Academy on all of them" is a complete answer; name a number to answer one differently. Until AJ answers, nothing changes (question 2's default): every page keeps today's lines.

**Safety lines first**

1. **The Leg Press and a knee replacement.** Suggested: take "Knee Replacement" off "Contraindicated for" and say what the Academy says. Nothing on the knee until physical therapy is finished and the client is cleared; after that the Leg Press is included, with a Leg Curl first as a warm-up. The other choices are keeping "contraindicated", or the clinical watch-outs' "no deeper than 90°", which has no Academy source. Whichever is chosen, the clinical watch-outs (`src/data/clinical-matrix.ts`) should say the same.
2. **The Leg Press and low backs.** Suggested: take "Lumbar Issues" off "Contraindicated for", and replace "Lock seat angle to P2 or P1" with the Academy's answer: P3, a bigger gap, and the Lumbar in another workout.
3. **The Leg Press and knees.** Suggested: replace "Reduce gap, set end-stop earlier" with "a bigger gap makes the bottom shallower", and stop the taller-client line saying P3 reduces knee flexion. P3 is for larger clients or tight hips, and it increases knee flexion.
4. **The Leg Press's unsourced claims**: the 90° limit to protect the patellar tendon, "L4/L5 shear", and "Severe Patellar Tendonitis". Suggested: remove them, unless there is a source outside the Academy AJ wants cited.
5. **The Lumbar's named conditions** (Spinal Stenosis, Herniated Disc (Acute), Spondylolisthesis) and its "decrease weight if form breaks". Suggested: the Academy's rule in their place: leave the Lumbar out for any orthopedic problem until the client is medically cleared. The three can stay as examples of that rule if AJ wants them named.
6. **Static work's conditions, on seven machines.** Suggested: wherever a timed static contraction or a static hold is offered, add the Academy's three conditions. It is for clients with no underlying orthopedic issue; after surgery, nothing on the joint until physical therapy is finished and the client is cleared; an acute injury heals first. On the Abdominals, "omit it altogether until cleared" replaces "omit it dynamically". On the Hip Abduction and Adduction, "leave it out" comes first, as their Quick Reference Guides say.
7. **The Seated Dip.** Suggested: the top of the rep is touch and go ("There is no end stop on this movement"); a deconditioned client gets a lower seat (5–9) with a gap, not a higher one; and add "avoid seats 1–4".
8. **The neck machine.** Suggested: add the unloading transfer (how the trainer takes the weight back at the end: at neutral, gradually, "that is…mine", feet planted); acute neck pain heals first (as in 6); and its Gap dial goes (ruling 15).

**Coaching lines**

9. **The Compound Row's handoff.** The trainer's leverage is poor, not the client's. Suggested: fix it.
10. **When to click on the hip machines.** At the end of the pause or squeeze, not when the arms meet (Adduction) or "the moment contraction stops" (Abduction). Suggested: fix it.
11. **The Lateral Raise's posture** is abdomen tight (PPT), not chest up. Suggested: fix it. The Triceps Extension's posture is split inside the Academy (ruling 14).
12. **Lines filed on the wrong machine, or the wrong way round.** The Torso Rotation's thick pads, the Leg Extension's two short-client lines, the Leg Curl's and Hip Abduction's feet on the toes, the Pulldown's higher seat for tall clients, the Pulldown's and Lateral Raise's helper muscles, the Lateral Raise's impingement warning, and the forearm and biceps sequencing line on the Leg Curl, Hip Adduction, neck machine and Lumbar. Suggested: each machine's own Academy lines in their place, and the three sequencing rules the app lacks: the Lumbar and the Leg Press never back to back, in either order; the Lumbar before the Leg Curl belongs in separate workouts; the Abdominals first and the Lumbar several exercises later.
13. **Cadence.** "A strict 6-second concentric and 6-second eccentric tempo" (Hip Adduction; "strict" appears on the pressing machines too). Suggested: 6 to 10 seconds each way, with 6 and 6 the goal once a client shows control, and never forced (Academy 4.5).

**Where the Academy disagrees with itself: corporate's call**

14. **Twelve places where two Academy documents disagree** (the table under "Where the Academy disagrees with itself"): the top of the Overhead Press, the bottom of the Pulldown, the gap on six machines, two postures, and two smaller ones. These are MSF's method, so they are corporate's to settle. One suggestion where a number depends on the client: keep the usual number and the exception together, as the scripts do ("Gap 5 for most, 6 for back issues").

**Dials**

15. **A Gap dial on three machines that have no gap**: the neck machine, the Torso Rotation and the Hip Abduction. Suggested: the standard stops offering a gap on them; any value a studio already typed is kept.
16. **Dials the Academy names that the app lacks** (the table under "The dials"): the Pulldown's foot stool, the Pullover's arm pads and seat back, the Simple Row's handle height, the Lateral Raise's back pad, the Triceps' pad width and back pad, the Leg Press's foot position, the end-stop pin on the Leg Extension and Leg Curl, the Lumbar's footplate, foot placement, knee pad and accessory stack, the neck machine's seat depth, the Abdominals' top-of-range pin, the Torso Rotation's leg pads, and the Compound Row's grip type and pad height. Suggested: add them. They are new dials only; no dial key changes, so every saved setting keeps working.
17. **The Academy's stated defaults.** Pulldown back pad 2; Compound Row handles M and neutral; Pullover seat back up and back, arm pads M; Simple Row no gap, chest pad 4 or 5; Chest Flye back pad 2 or 3; Lateral Raise back pad up; Triceps gap 0, pad width in; Leg Press seat back P2; Seated Dip no gap; Torso Rotation seat 1 then 5, arm pads 1; Hip Abduction and Adduction seat back 6 or 7. A default shows as the standard on the machine window wherever a studio has set none. Suggested: prefill them. Today's four gap defaults (Biceps Curl 1, Chest Flye 1, Leg Curl 1, Abdominals 5) are each the low end of what the Academy says, and follow ruling 14.

**Already ruled, one follow-up**

18. **Starting weights.** AJ ruled: no house starting weight. The Catalog shows none. The machine window's Prescription card still offers the house number as "Studio standard" wherever a studio has set none. For a beginner woman that is 16 lb on the Biceps Curl and the neck machine, under the 20 lb the Academy names as their lightest. Suggested: a later round retires that fallback so the card offers only the studio's own number, and the Codex's "where clients built like her started, once 5 have" replaces it.

**The figure**

19. **The markings that look wrong** (the table under "The body figure"). Four of them are choices in the anatomy map, not in the drawing: the Leg Curl's glutes, the Triceps' forearms, the trapezius shown only as a helper on the Compound Row and the neck machine, and the neck machine drawn from the front. Suggested: fix those four in the map first, with no redrawing; the other five need the figure itself made more accurate, the later work AJ described.

## Finding 2 — the Leg Press

Ten Leg Press lines would have a trainer coach wrongly, or have no source. Where each shows today matters. The contraindications are on the Catalog page every trainer can open. The taller-client line reaches the Active Session for a tall client. The rest sit in the catalog editor, where only administrators see them, until the Codex's trainer page shows them.

| The app says | Verdict | What the Academy says | Shows today on |
| --- | --- | --- | --- |
| Contraindicated for: **Knee Replacement** | Contradicted | Academy 6.1: a 65-year-old with a knee replacement gets "leg press or leg extension in a majority if not all of the workouts". Academy 4.10: "leg curl preceding a leg press for a knee replacement recipient". The Selection Template lists the Leg Press for knee issues. The one bar is temporary (Academy 7.1): until physical therapy is finished and the client is cleared, "WE WILL NOT TRAIN OR INVOLVE THE AFFECTED AREA" | The Catalog page |
| Contraindicated for: **Lumbar Issues** | Contradicted | The Selection Template's low-back row: "LP (P3?)". The overview keeps the Leg Press out of the Lumbar's workout, not because it is inherently dangerous | The Catalog page |
| Contraindicated for: **Severe Patellar Tendonitis** | No source | The patellar tendon is named nowhere in the Academy. Its rule for tendonitis (Training with Pain) is a diagnosis, the physician's limits, then a light test of tolerance, not a bar | The Catalog page |
| "Knee angle should not exceed **90 degrees** at bottom turnaround to protect patellar tendon." | No source | The only Leg Press "90 degrees" is the consultation's demo, where the trainer pins the stack "When I get your knees back to about 90 degrees": a starting position, not a limit | The catalog editor |
| "High shear force potential on **L4/L5** if posterior pelvic tilt occurs." | No source | No L4, L5 or shear anywhere. The Academy's concern is keeping the hips down, handled with a bigger gap or P3 | The catalog editor |
| "For Lumbar issues: Lock seat angle to **P2 or P1**" | Contradicted | Low backs go to P3 (the Selection Template; the overview: a client who cannot tolerate P2 uses P3). P1 appears in no Leg Press document | The catalog editor |
| "For Knee issues: **Reduce gap**, set end-stop earlier to prevent deep flexion." | Contradicted | A bigger gap makes the bottom shallower: "The larger the gap that is used, the shorter the range of motion will be" (Glossary); the QRG: "increase gap (shallower lower turnaround)". The end stop is at the top, so it cannot limit the bottom | The catalog editor |
| Taller clients: "Recline the seat back to Position 3 (P3) to reduce midsection congestion and **knee/hip flexion** joint angles." | Contradicted (the knee half) | The QRG: "Lower foot position (and lower seat back P3) = increased knee flexion", and the app's own clinical warning a few lines further on says the same. The QRG's reason for P3 is "Consider P3 for larger subjects or limited hip flexion tolerance", not height, with a caution the app leaves out: more shoulder-pad pressure and the hips rising | The Active Session's settings card and the client's Body page, for a tall client |
| The top of the rep: **"Hard stop"** | Disagrees | The script: "touch the end stop and immediately change directions as if you're passing right through it". There is no pause at any point on a Leg Press | The catalog editor |
| Starting weight **160 lb** (men), **60 lb** (women) | No source | No per-machine weight in the Academy. The only Leg Press numbers are the 18 lb accessory stack and 38 lb of set-up pressure | The Prescription card, as "Studio standard", where a studio set none |

**Where they came from.** The three contraindications, the 90° and L4/L5 lines, and the two "Modifications" came from `src/data/default-machines.ts`, the old seed, which the generator reads before anything else for those fields. The taller-client line is the setup guide's. "Hard stop" is the generator's guess from the words "end stop". The weight is `src/data/machine-database.ts`'s.

**The 90° limit reaches trainers another way.** For a client flagged with a knee replacement, the clinical watch-outs (`src/data/clinical-matrix.ts`, entry `joint-tka`) say to set the footplate "so the knee does not bend past 90 degrees at the bottom turn". That shows on the machine window, Programming and the briefing. It is not in the Academy either. It may be MSF's own clinical writing rather than an import, so it is AJ's to confirm or change. Whatever the Leg Press ruling, the two should agree.

**What the Leg Press gets right.** Its muscles, posture, load-up, cadence, both turnaround descriptions and all six clinical warnings are the Quick Reference Guide's own words: 33 of its 41 method lines are sourced.

## Finding 3 — never to failure

- **The flag is right on all twenty.** The Academy says never to failure for exactly two machines, the Lumbar ("Never take lumbar extension to failure") and the neck machine (Cervical Extension), and those are the two the definitions flag. Every other machine is taken to concentric failure, with cautions for new clients.
- **Before this round, three screens read it**: the catalog editor (whose field is labelled "Why — shown prominently on the floor"), the Admins → Catalog list, and a studio's machine list, which My Studio → Machines shows everyone who works there. That last one was the only place a trainer saw it: a "Never to failure" badge on the row, without the reason. The machine's own page and every session screen ignored it. (The handoff's "reaches nobody" missed the My Studio badge.)
- **This round, the Catalog shows it** (Catalog R2): a "Never to failure" mark on the machine's row on the floor, and the reason at the top of the machine's page, before the clinical warnings. Find answers "never to failure" with the machines that carry it.
- **The Active Session still does not.** Showing it at the machine is the Codex's third round; question 5's default is to show it and never refuse a set.
- **What the Academy says beside it, which no app line carries.** No partial reps on the Lumbar and the neck machine ("Do NOT use partial reps"), nor on the four compound pushes: Leg Press, Chest Press, Overhead Press and Seated Dip. The only end-of-set hold on the two spinal machines is a cautious 2 to 3 second count at the top. Extra care with new clients and low backs. And on the neck machine, how the trainer takes the weight back at the end, which the Academy calls "quite possibly even more important to master for safety purposes".
- **One safety notice shows nowhere.** The Hip Abduction's pinch-point warning is stored as a safety notice, and every screen shows a safety notice only beside never to failure, so this one is never drawn. The same warning is among its clinical warnings, which do show.

## What reaches a trainer today

A wrong line matters most where a trainer reads it. What the twenty definitions feed:

| Where | What it shows from the definitions |
| --- | --- |
| **Learning → Catalog → a machine** | Posture, class, the gap line, handoff; the muscles and the figure; clinical warnings; the set-up text and checkpoints; the load-up text and key cues; "Contraindicated for"; since this round, never to failure |
| **The Active Session's machine window** | Posture, handoff, the target muscles, key cues, clinical warnings, cadence notes. The settings card's stature tip: the shorter or taller column, word for word, for a client at least 3 inches shorter or taller than the app's average. The default gap as the standard where a studio set none. The Prescription card's "Studio standard" weight: the house starting weight where a studio set none |
| **The client's Body page (On our floor)** | The shorter or taller column, labelled as the Academy's |
| **Only the catalog editor** | Turnaround styles ("Hard stop"), biomechanical notes, sequencing, the limited-mobility column, the handoff's protocol and cue. These reach trainers once the Codex's trainer page shows them, so they need ruling before it does |

## Other lines a trainer would coach wrongly

| Machine | The app says | The Academy says | Shows today on |
| --- | --- | --- | --- |
| Compound Row | At the handoff and the load-up: "the client's leverage is poor" | "leverage is poor for trainer alone"; the client must reach the handles and pull | The Catalog page |
| Hip Adduction | "Click at the exact moment handles converge" | "Instructor clicks at the exact moment the contraction duration ends", after the pause or squeeze | The catalog editor |
| Hip Adduction | "Maintain a strict 6-second concentric and 6-second eccentric tempo", from the first load-up | 6 and 6 is a goal "over time" that "may not be achievable or advisable in the initial sessions"; a faster pace "should never be forced" (Academy 4.5) | The Catalog page |
| Lateral Raise | Posture: "Chest Up / Anterior Pelvic Tilt" | "abdomen tight (PPT)" (the script; Exercise Categories). The app's own checkpoint says PPT | The Catalog page and the machine window |
| Triceps Extension | Posture: "Posterior Pelvic Tilt / Contracted Abdomen" | The Academy is split: the older overview says PPT; the newer one a back pad and sitting tall; Exercise Categories says chest up | The Catalog page and the machine window |
| Seated Dip | The top of the rep: "Hard stop" | "There is no end stop on this movement"; continuous, touch and go | The catalog editor |
| Seated Dip | Deconditioned: "err on a higher seat setting" | A client who lacks mobility, is severely deconditioned or is too short gets a lower seat (5–9), with a gap to bring the handles down | The catalog editor |
| Seated Dip | No line about the highest seats | "avoid 1-4": stay off the four highest seats | — |
| Neck machine | "Acute Neck Pain / Deconditioned: Use a Static Hold (SH) or TSC" | An acute injury heals first; static work is for chronic discomfort with no medical reason against it (Academy 7.1 and 7.2) | The catalog editor |
| Abdominals | A timed static contraction for "compromised lower backs"; orthopedic clients "omit this exercise dynamically" | Omit the movement "altogether until they have medical clearance"; the static option is for those with "no underlying orthopedic issue" | The catalog editor; the static option also as a clinical warning on the Catalog page and the machine window |
| Torso Rotation | Thick leg pads "to increase pelvis stability" | "Thick pads = smaller clients or to increase stretch"; the pelvis is steadied by the hip pads and the seat belt | The machine window and the Body page, for a short client |
| Leg Extension | Short clients: "use seat positions 5–9"; "increase the gap ... to lower the tibia pad and handles" | Both are the Pulldown's rules. The Leg Extension has no seat height, and a bigger gap shortens its range | The machine window and the Body page, for a short client |
| Leg Curl, Hip Abduction | Short clients: rest the feet "on the toes of their shoes" | The Biceps Curl's rule, in no Leg Curl or Abduction document | The machine window and the Body page, for a short client |
| Pulldown | Taller clients: "Set a higher seat position" | Avoid seats 1–4; if the elbows stay too bent, "consider a lower seat or decreasing the gap" | The machine window and the Body page, for a tall client |
| Pulldown | Teres major, rear deltoid and biceps filed as helpers; brachioradialis added | All three are targets; brachioradialis is in no Pulldown document; the seven real helpers were dropped | The Catalog page |
| Lateral Raise | Helpers: anterior deltoid, triceps, pectoralis major, trapezius | Copied from the Overhead Press; no Lateral Raise document names them | The Catalog page |
| Lateral Raise | "Shoulder Impingement / AC Joint Issues: Increase the weight stack gap" | From the setup template's worked example, not the Academy. Only "stop below parallel" is backed | The Catalog page and the machine window |
| Leg Curl, Hip Adduction, neck machine, Lumbar | "Avoid back-to-back pulling exercises" for forearm and biceps fatigue | The Academy's grip rule for the Pulldown and the Compound Row. None of these four has a grip or a torso pull | The catalog editor |
| Lumbar | Contraindicated for Spinal Stenosis, Herniated Disc (Acute), Spondylolisthesis | Named nowhere. The Academy leaves the Lumbar out for any orthopedic problem until medically cleared | The Catalog page |
| Lumbar | "Decrease weight if form breaks or anterior pelvic tilt is lost"; a "No-Flexion Protocol (Osteoporosis/Osteopenia)" | The first has no source (the old seed). The second is only in the setup guide; the Academy uses osteoporosis on the Torso Rotation | The catalog editor |

**Static work loses its conditions on seven machines.** The Academy offers a timed static contraction "for those with no underlying orthopedic issue", trains nothing on a joint still in physical therapy after surgery (Academy 7.1), and lets an acute injury heal first. The app offers static work on the Leg Extension, Simple Row, Hip Abduction, Hip Adduction, Lumbar, Abdominals and neck machine without those conditions. On the Hip Abduction and Adduction it sits right beside hip replacements. The clinical warnings carrying it show on the Catalog page and the machine window.

**The Academy says it; no app line does.**

- No partial reps past failure on the Leg Press, Chest Press, Overhead Press and Seated Dip, nor on the Lumbar and neck machine (How Intensely to Push a Client).
- Go easy on failure with a new client on the Leg Extension ("Avoid pushing new clients to failure"), Leg Curl, Hip Abduction and Hip Adduction; and never push both the Leg Extension and the Leg Press to failure while introducing them (the Selection Template).
- The neck machine's unloading transfer.
- Three sequencing rules: the Lumbar and the Leg Press never back to back "in any arrangement"; the Lumbar before the Leg Curl belongs in separate workouts; the Abdominals first and the Lumbar several exercises later.
- The Torso Rotation's "watch your head" on the way in.
- The Chest Flye's own squeeze cue ("We need to teach them HOW to squeeze"), dropped for length, and the Compound Row's upper-back cues, dropped by the generator, leaving only its lat-biased cue.
- The Pulldown's foot stool, which all three of its documents call for.

## Starting weights

- **None is sourced.** The Academy gives no per-machine starting weight. The only numbers it gives: most clients start the neck machine at 20 lb, "the lightest increment"; 20 lb is the minimum on the Biceps Curl and the minimal load on the Triceps; the Leg Press takes an 18 lb accessory stack and 38 lb of set-up pressure; the Leg Extension and Leg Curl name the main stack's 20 lb; and a low-back client tests the Lumbar with 20 lb for about 3 reps. The Selection Template tells trainers to underestimate a new client deliberately.
- **The app's numbers** (`baselineLoad`, from `src/data/machine-database.ts`) are unsourced on nineteen machines and contradicted on the neck machine (30 lb for men).
- **AJ has ruled**: no house starting weight. The Catalog shows none.
- **The machine window still offers one.** Its Prescription card shows "Studio standard {n} lbs" and a "Use studio standard" button. Where the studio has set nothing, that number is the house figure: 0.8 of it for a beginner, which is also what a client with no level gets, and 1.5 of it for an advanced client. For a beginner woman that is 16 lb on the Biceps Curl and the neck machine, where the Academy names 20 lb as the lightest, and 12 lb on the Lateral Raise. The label says "Studio standard" for a number the studio never set. Ruling 18 suggests retiring the fallback.

## The dials

The Academy writes its settings with a small vocabulary: seat back **P2 / P3** (Leg Press); handles **N · M · W** (Compound Row) and arm pads **W · M · N** (Pullover); **^ / v** for up or down (the Compound Row's chest pad, the Pullover's seat back, the Lateral Raise's back pad, the Torso Rotation's arm pads); numbered positions (the Pulldown's seat 5–9, the Seated Dip's "avoid 1-4", the Torso Rotation's seat 1–5, the hips' seat back 6 or 7); pad width **"in"** (Triceps); leg pads **thin / thick** (Torso Rotation). Every app dial is free text, so none of these is enforced, and the app invents no letters of its own. The Catalog's preset line (Catalog R2) shows the studio's own numbers, then the unit's defaults, and says "No numbers set for this unit yet" when there are none.

| Machine | The Academy's settings | The app's dials (prefilled) | What differs |
| --- | --- | --- | --- |
| Compound Row | Chest pad position (the script's "seat"); chest pad height, ^ or v; handles N · M · W, M for most; handle type neutral (default) or pronated; gap 2 | Gap (2), Chest Pad, Handles | One Chest Pad dial for position and height; no grip type; M and neutral not prefilled |
| Pulldown | Seat 5–9, avoid 1–4; back pad 2 or 3 for most, 1 for larger clients; handles supinated, one notch toward neutral (neutral for the Torso Arm); gap 2; foot stool; seat belt | Gap (2), Back Pad, Seat, Handles | No foot stool; back pad 2 not prefilled |
| Pullover | Seat back "up and back" (most) or "down and forward" (smaller clients); seat height, taller is lower; arm pads W · M · N, M for most; gap 6 (Exercise Categories: 6 or 7; confirm it for each machine) | Gap (6), Seat, Handles | "Handles" is not a Pullover setting (the hands rest on a bar); no arm pads; one Seat dial for height and seat back |
| Simple Row | Seat; chest pad, most 4 or 5; no gap (one for a wider frame); vertical handle height | Gap, Chest Pad, Seat Pad | "Seat Pad" is the seat; no handle height; no gap and 4 or 5 not prefilled |
| Biceps Curl | Seat; gap 1 or 2 (Exercise Categories: 2) | Gap (1), Seat | The default is 1 where the standard is 2 |
| Chest Press | Seat, upper arm 30–45° off the body; back pad; custom gap | Gap, Back Pad, Seat | Matches |
| Overhead Press | Seat; gap 2; a selector pin as a hard end stop, as a modification | Gap (2), Seat | Matches; the pin has no dial |
| Chest Flye | Seat; back pad, most 2 or 3; gap 1 or 2 by mobility | Gap (1), Back Pad, Seat | The default keeps only the 1; back pad 2 or 3 recorded nowhere |
| Lateral Raise | Seat; back pad, ^ for most; handles position 1 or 2, both the same; no gap; foot stool | Gap, Seat, Handles | No back pad; handle positions by height are the guide's |
| Seated Dip | Seat, avoid 1–4 (5–9 for the lower settings); back pad height and angle; no gap (one only with a lower seat); grip neutral or pronated; seat belt; foot stool | Gap, Back Pad Height, Back Pad Angle, Seat, Handles | "Avoid 1–4" nowhere; "no gap" not recorded; "Handles" could hold the grip |
| Triceps Extension | Seat; gap 0 to 3, typically none; pad width, most "in"; back pad (on newer machines) | Gap, Seat | No pad width or back pad; the gap blank where the Academy says typically none |
| Leg Press | Seat back P2 (default) or P3; shoulder pads touching the shoulders; seat distance; custom gap; foot position, charted | Gap, Seat Angle, Shoulder Pads, Seat Distance | No foot position; P2 not prefilled; P1 appears in no Leg Press document |
| Leg Extension | Gap 2 (3 or 4 for knee issues); back pad; tibia pad (no number); an upper selector pin, counting the empty holes | Gap (2), Back Pad | No end-stop pin |
| Leg Curl | Gap (the Academy is split: 1 or 2, 2 or 3, "3 for most"); back pad; calf pad; an upper selector pin | Gap (1), Back Pad, Ankle Pad | "Ankle Pad" is the calf pad; the default is the lowest value; no end-stop pin |
| Lumbar | Seat; gap 4 (5 or 6 for back issues); accessory stack; footplate; foot placement; knee pad; seat belt | Gap (4), Seat | No footplate, foot placement, knee pad or accessory stack, which the Academy says change the difficulty and must be recorded |
| Neck machine | Seat height, the pivot near C3–C5; where on the seat (mid-seat); back pad (optional); no gap; the client's own range | Gap, Back Pad, Seat | A Gap dial on a machine with no gap; nowhere for the seat depth or the range |
| Abdominals | Seat; gap 5 for most, 6 for back issues (the QRG: 6 typical; Exercise Categories: 5 to 7); knee pad; foot placement; a top-of-range pin | Gap (5), Seat | 5 against 6; "6 for back issues" lost; no pin |
| Torso Rotation | Seat 1–5 (1 and 5 for most, 2 and 4 reduced, 3 never for a working set); arm pads, six positions, 1 by default and 4 for taller clients; leg pads thin (standard) or thick; no gap; seat belt if needed | Gap, Arms, Seat | A Gap dial on a machine with no gap; no leg pads; nothing prefilled |
| Hip Abduction | Seat back 6 or 7; thigh pad width; no gap, "a gap is never needed" | Gap, Back Pad, Thigh Pads | A Gap dial on a machine with no gap; 6 or 7 not prefilled |
| Hip Adduction | Seat back 6 or 7; custom gap; accessory stack | Gap, Back Pad | "Back Pad" is the seat back; 6 or 7 not prefilled |

## Where the Academy disagrees with itself

| Topic | One document says | Another says | The app now |
| --- | --- | --- | --- |
| Overhead Press, top of the rep | The QRG, the overview, Exercise Categories and the cue sheet: no pause, pass through | The script: "a brief but definite stillness at the top" | No pause |
| Pulldown, bottom of the rep | The QRG and the overview: the weights lightly touch | Academy 4.6, Cues and Timing and Mastery Series 6: the elbows straighten before the stack touches; the script: whichever comes first | The weights touch |
| Leg Curl gap | The QRG: 1 or 2 | The overview: 2 or 3, then "at least 1 and maybe 2"; Exercise Categories: 2 or 3; the script: "Gap 3 for most" | 1 |
| Abdominals gap | The script: "Gap 5 for most (6 for back issues)" | The QRG and the overview: 6 typical; Exercise Categories: 5 to 7 | 5 |
| Biceps Curl gap | The script and the QRG: 1 or 2 | Exercise Categories: "Biceps - 2" | 1 |
| Chest Flye gap | The script: 1 or 2 by mobility | Exercise Categories: not on its gap list | 1 |
| Pullover gap | The QRG, the overview and the script: 6 | Exercise Categories: 6 or 7; the QRG: confirm it for each machine | 6 |
| Leg Extension gap | The QRG, the overview and the script: 2 | Exercise Categories: 2 or 3 | 2 |
| Triceps posture | The older overview: PPT, a contracted abdomen | The newer overview: a back pad, sitting tall; Exercise Categories: chest up | PPT |
| Seated Dip posture | The script: chest up at the start, PPT at the top | Exercise Categories: PPT | PPT |
| Leg Press, larger frames | The overview: they lack internal rotation of the femur | The QRG: limited external rotation; the script: they can't keep the femur internally rotated | The overview |
| Seated Dip gap | The overview: a gap with a lower seat | Exercise Categories: a gap "for shorter clients with a high seat" | Blank |

## How the wrong lines got in

`src/data/machine-definitions.ts` is generated by `scripts/generate-machine-definitions.ts`. It reads the four standardized setup guides (`docs/msf-academy/Set Up Machines/standardized-setup-guide-batch1.md` to `batch4.md`) and two older files: `src/data/default-machines.ts` (the old seed, called `legacy` in the generator) and `src/data/machine-database.ts` (called `know`).

1. **The old seed wins.** For the dial list (line 568), "Modifications" (line 586), posture (line 603), contraindications, sequencing and biomechanical notes (lines 659–662), the generator takes the old seed first and the Academy's guide never gets a say. That is where the Leg Press's knee replacement, 90° and L4/L5 lines come from, the Lumbar's three conditions, the Gap dials on three machines with no gap, and the Lateral Raise's posture. `machine-database.ts` already has the Lateral Raise corrected, but the seed is read first.
2. **The starting weights** are `machine-database.ts`'s `baseMale` and `baseFemale` (lines 666–668).
3. **Muscles.** `tier()` keeps only the first bullet of a muscle tier (lines 224–227). The Pulldown's guide has two helper bullets, so three of its targets were filed as helpers and its real helpers were lost.
4. **Cues.** `quotedPhrases()` (lines 106–115) takes only italic quotations when there are any, needs each in its own italic run, and stops at 180 characters. So the Compound Row's upper-back cues, which share one italic run, were skipped, and the Chest Flye's 213-character squeeze cue was too long.
5. **Turnarounds.** One pattern reads "end stop" anywhere in the text, even in "no mechanical end stop" (line 400). So the Seated Dip got "Hard stop", and so did the Leg Press, from "the end stop is reached".
6. **The default gap** is the first number after "gap of", "gap is" or "gap at" (lines 577–579). So "1 or 2" became 1 on the Biceps Curl, the Chest Flye and the Leg Curl, and the Triceps' "(Gap 0)" was missed.
7. **The guides themselves** misfile a few height lines from other machines: the Leg Extension's from the Pulldown, and the Leg Curl's and Hip Abduction's from the Biceps Curl. The generator copies the guides' columns as they are.

## How a fix would land, after the rulings

Each step needs AJ's OK: the generated file and the live catalog are the method, which is corporate's.

1. **Correct the sources.** The setup guides for the lines born there. For the rest, stop reading the old seed for method fields (posture, contraindications, sequencing, biomechanics, modifications) and stop reading `machine-database.ts`'s starting weights.
2. **Fix the generator's five faults** above.
3. **Regenerate** `src/data/machine-definitions.ts`, never by hand, and run its tests. `src/features/admin/catalog/review.test.ts` holds all twenty to the catalog gate.
4. **An administrator presses Admins → System tools → Restore standard machines**, which re-writes the twenty catalog documents. It merges, so studios' own settings survive. It also overwrites any edit an administrator has made to those fields in the catalog editor since the last restore, so check first.
5. **The lasting guard is the Codex's format v2**: a source on every method line, so a line with no source can't slip in unseen again.

## The body figure

AJ keeps the figure and wants its markings made more accurate later. What looks wrong on it today:

| What looks wrong | Why | Whose |
| --- | --- | --- |
| The Hip Abduction lights the whole glute | The figure has one glute region, and "abductors" paint onto it. The Academy's target is the gluteus medius, at the side of the hip | The drawing |
| The Pulldown (lats) and the Simple Row (rhomboids) light the same patch | Lats and rhomboids share one "upper back" region | The drawing |
| The Lateral Raise, the Overhead Press and the rows light the same shoulder | One deltoid region, front and back. The Lateral Raise is filed as front deltoid, though its target is the middle deltoid | The drawing |
| The trapezius shows on both figures | The figure's trapezius region is drawn on both | The drawing |
| The Leg Press shows only the quads | There is no side figure. Its "side" view resolves to the front, where the glutes, one of its two targets, are not drawn | The drawing |
| The neck machine shows the front of the neck | Its "side" view resolves to the front, but the machine trains the extensors at the back. Choosing the back figure would fix it | The anatomy map |
| The Leg Curl lights the glutes | No Leg Curl document names the glutes. The calf, which is a target, shows only as a helper | The anatomy map |
| The Triceps Extension lights the forearms | The Academy's only helper for it is the abdominals | The anatomy map |
| The Compound Row and the neck machine show the trapezius only as a helper | The Academy lists it as a target on both | The anatomy map |

The anatomy map is `src/data/machine-anatomy-map.ts`; changing a line there and regenerating needs no redrawing (ruling 19).

## What this check did not cover

- **The live database.** The check read the file the catalog was written from. If an administrator has edited a machine in Admins → Catalog since the last restore, the live text may differ.
- **The older coaching text in `src/data/machine-database.ts`** that the Catalog and the machine window still fall back to: its set-up and execution cues, and all of its text for a studio without a roster. Those should be checked, or retired, before the Codex replaces them.
- **A studio's own copies and its own machines.**
- **The clinical watch-outs** (`src/data/clinical-matrix.ts`), except where they touch the Leg Press.
- **The Renaissance of Exercise**, which is not in the repository.
- **Two machines have thinner sources.** The Lateral Raise has no Quick Reference Guide and no overview; the Triceps Extension has no Quick Reference Guide, and its overview exists in two versions. Their lines were judged on what there is.

## Appendix — every line that is not plainly sourced

Machine by machine: each line the check found contradicted, without a source, or only in the setup guides, with the labels that disagree and the sourced lines that lost a condition. The Academy's short names are under "Sources".

| Machine | Lines | Sourced | Guide only | No source | Contradicted | App labels |
| --- | --- | --- | --- | --- | --- | --- |
| Compound Row | 55 | 39 | 0 | 1 | 2 | 13 |
| Pulldown | 52 | 32 | 2 | 1 | 3 | 14 |
| Pullover | 58 | 44 | 0 | 1 | 0 | 13 |
| Simple Row | 52 | 40 | 0 | 1 | 1 | 10 |
| Biceps Curl | 46 | 36 | 0 | 1 | 1 | 8 |
| Chest Press | 46 | 35 | 0 | 1 | 0 | 10 |
| Overhead Press | 48 | 38 | 0 | 1 | 0 | 9 |
| Chest Flye | 43 | 32 | 0 | 1 | 0 | 10 |
| Lateral Raise | 47 | 27 | 8 | 1 | 1 | 10 |
| Seated Dip | 51 | 35 | 1 | 1 | 2 | 12 |
| Triceps Extension | 42 | 31 | 0 | 1 | 1 | 9 |
| Leg Press | 54 | 33 | 1 | 3 | 4 | 13 |
| Leg Extension | 51 | 38 | 2 | 1 | 0 | 10 |
| Leg Curl | 52 | 37 | 1 | 2 | 1 | 11 |
| Lumbar | 58 | 41 | 1 | 6 | 0 | 10 |
| Neck machine (Cervical Extension) | 55 | 39 | 1 | 1 | 2 | 12 |
| Abdominals | 51 | 37 | 1 | 1 | 2 | 10 |
| Torso Rotation | 49 | 33 | 0 | 1 | 1 | 14 |
| Hip Abduction | 54 | 40 | 1 | 1 | 0 | 12 |
| Hip Adduction | 51 | 34 | 3 | 2 | 2 | 10 |
| **All twenty** | **1,015** | **721** | **22** | **29** | **23** | **220** |

**Compound Row (CR).**
- Contradicted: the handoff and the load-up both say "the client's leverage is poor"; the QRG says the trainer's is.
- No source: the starting weight, 80 / 40 lb.
- Thin: the only key cue is the lat-biased "Pull your elbows into your sides"; the default row (neutral handles, M) targets the upper back first, and the script's cue is "drive your elbows back". The handoff leaves out "if the arm moves, don't transfer; cue pull harder".
- Labels: one Chest Pad dial for the pad's position and height; no grip type; the figure shows the trapezius only as a helper, where the Academy lists it as a target.

**Pulldown (Pd).**
- Contradicted: teres major, rear deltoid and biceps are filed as helpers; all three are targets (the QRG, the overview).
- Guide only: brachioradialis as a helper, in no Pulldown document; taller clients "Set a higher seat position".
- No source: the starting weight, 70 / 50 lb.
- Missing: the seven real helpers (rhomboids, lower trapezius, pectoralis major, triceps, erector spinae, rectus abdominis, wrist flexors); the foot stool.
- Split inside the Academy: the bottom of the rep.

**Pullover (PO).**
- No source: the starting weight, 60 / 40 lb.
- Thin: the sequencing reason (forearm and biceps fatigue) doesn't fit a machine with no grip; the rule itself stands on overlapping lat work. The gap of 6 lacks its caveat (confirm it for each machine). The handoff leaves out gripping the arm further from the axis and bringing the arm and pads down one at a time.
- Labels: a "Handles" dial; no arm pads or seat back; "Seated Pullover" is not the Academy's name.

**Simple Row (SR).**
- Contradicted: the sequencing reason, "to prevent localized forearm/biceps fatigue". The overview pairs the Simple Row with the Pulldown precisely because it avoids that.
- No source: the starting weight, 60 / 40 lb.
- Thin: a timed static contraction for shoulder issues without the overview's condition, or its point that leaving the exercise out is the most conservative choice; "(pronated grip)" is the guide's label; "leaning back engages the lower back extensors" is the guide's reason.
- Labels: "Seat Pad" is the seat; no handle-height dial; nothing prefilled.

**Biceps Curl (Bi).**
- Contradicted: the default gap of 1; Exercise Categories says "Biceps - 2". The gap is the Academy's protection on a machine it calls higher-risk at full extension.
- No source: the starting weight, 40 / 20 lb. The 20 is the Academy's minimum, a floor, not a starting weight.

**Chest Press (CP).**
- No source: the starting weight, 60 / 20 lb.
- Thin: a "strict" 6 and 6; the move to heavier loads drops "once client demonstrates control"; nothing says no partial reps past failure.

**Overhead Press (OH).**
- No source: the starting weight, 40 / 20 lb.
- Thin: taller clients "Increase the weight stack gap", where the overview says there "may even be a need"; the progression drops "once control is established"; no partial reps past failure is missing.
- Split inside the Academy: the top of the rep.

**Chest Flye (CF).**
- No source: the starting weight, 50 / 30 lb.
- Thin: the default gap keeps only the 1 of "1 or 2 (depending on mobility)"; the squeeze is stored as 2 seconds of the Academy's 2 to 3; its own squeeze cue was dropped; the shorter-client column never says "higher seat".
- Labels: "CHEST/PEC FLY" is not the Academy's "Chest Flye". Since Catalog R1 the Catalog shows the Academy's name beside the floor name.

**Lateral Raise (LR).** Its only document is the spoken script.
- Contradicted: the posture, "Chest Up / Anterior Pelvic Tilt".
- Guide only: four helper muscles copied from the Overhead Press; the seat's criterion; handle positions by height (1 short, 2 or 3 tall, where the script says 1 or 2 for most, both the same); the impingement and AC-joint warning with "Increase the weight stack gap".
- No source: the starting weight, 30 / 15 lb. The 15 is under the 20 lb lightest named on other machines.
- Labels: the figure paints the front deltoid; no back pad dial.

**Seated Dip (SD).**
- Contradicted: "Hard stop" at the top; deconditioned clients "err on a higher seat".
- Guide only: the pronated "capped" hand position as joint-friendly. The dip's documents leave the grip to the client.
- No source: the starting weight, 70 / 40 lb.
- Labels: filed as an arm machine ("Arm / Upper Extremity"), where the Academy names the chest first and files it with the pushes; "Handles" is not a dip setting; "avoid 1–4" appears nowhere; the posture keeps only the finish.

**Triceps Extension (Tri).**
- Contradicted, with the Academy split: the posture, PPT.
- No source: the starting weight, 40 / 25 lb. 25 can't be reached in two-pound steps from 20.
- Thin: the watch for a dropped head is narrowed to the lifting half; the script says the whole set, because the arm nears the face on every lower turn.
- Labels: the figure lights the forearms; no pad width or back pad dial.

**Leg Press (LP).** See Finding 2.
- Guide only: the shorter-client column (seat closer, feet lower), which no Leg Press document ties to height.

**Leg Extension (LE).**
- Guide only, both the Pulldown's rules: short clients "use seat positions 5–9" and "increase the gap ... to lower the tibia pad and handles".
- No source: the starting weight, 80 / 40 lb.
- Thin: the static options without their condition; the new-client failure caution missing; a heading with nothing after it ("Conservative Static Protocols:").
- Labels: no end-stop pin dial.

**Leg Curl (LC).**
- Contradicted, with the Academy split: the default gap of 1.
- Guide only: the feet on the toes, the Biceps Curl's rule.
- No source: the forearm and biceps sequencing line; the starting weight, 70 / 40 lb.
- Missing: the Lumbar before the Leg Curl belongs in separate workouts; the new-client caution.
- Labels: filed "Hamstring / Glute", and the figure lights the glutes, which no Leg Curl document names; the calf, a target, shows only as a helper; "Ankle Pad" is the Academy's calf pad; no end-stop pin dial.

**Lumbar (Lumb).**
- No source: Spinal Stenosis, Herniated Disc (Acute) and Spondylolisthesis; "Decrease weight if form breaks or anterior pelvic tilt is lost"; the forearm and biceps sequencing line; the starting weight, 40 / 30 lb.
- Guide only: taller clients move the footplate further out; the osteoporosis "No-Flexion Protocol".
- Thin: the sequencing line covers only the Lumbar before the Leg Press or Leg Curl, where the Academy says the Lumbar and the Leg Press are never back to back, in either order; "aligns perfectly with the iliac crest", where the Academy says approximately.
- Never to failure matches. Missing beside it: no partial reps, the cautious 2 to 3 second hold, and extra care with new clients and low backs.
- Labels: no footplate, foot placement, knee pad or accessory stack dials.

**Neck machine (Cervical Extension, Cx).**
- Contradicted: the starting weight, 30 lb for men (the Academy: 20 lb, "the lightest increment"); static work for "Acute Neck Pain".
- Guide only: "stopping well short of mechanical boundaries"; the script asks the client to lower "far enough to allow those weights to touch".
- No source: the forearm and biceps sequencing line.
- Missing: the unloading transfer; no partial reps.
- Labels: a Gap dial ("There will be no gap on this machine"); "4 WAY NECK" is not in the Academy; the trapezius is a target in the Academy and a helper on the figure. None of its lines came from the superseded "4-way neck" record.

**Abdominals (Abs).**
- Contradicted: a timed static contraction for "compromised lower backs"; orthopedic clients "omit this exercise dynamically".
- Guide only: "keeping the lower body locked extremely tight" to prevent lower back hyperextension.
- No source: the starting weight, 50 / 30 lb.
- Split inside the Academy: the gap, 5 or 6; "6 for back issues" is lost.
- Missing: the Abdominals first and the Lumbar several exercises later; the seat belt.

**Torso Rotation (TR).**
- Contradicted: thick leg pads "to increase pelvis stability".
- No source: the starting weight, 40 / 30 lb.
- Thin: arm pad position 4 called the "highest/furthest setting", where the overview puts the pin in the lowest, furthest hole with the pad turned higher; the 6-second cadence is in no Torso Rotation document; "watch your head" missing.
- Labels: a Gap dial; no leg pad dial; nothing prefilled.

**Hip Abduction (Abd).**
- Guide only: the feet on the toes, the Biceps Curl's rule.
- No source: the starting weight, 50 / 30 lb.
- Thin: static work for hip issues without "omit the exercise entirely" first or the orthopedic condition; "Click at the exact moment contraction stops"; "thigh pads sit flush against the client's knees", where the overview says the knees may not touch the pads and that is acceptable. Its pinch-point safety notice is never drawn (Finding 3).
- Labels: a Gap dial ("a gap is never needed"); seat back 6 or 7 not prefilled.

**Hip Adduction (Add).**
- Contradicted: click "at the exact moment handles converge"; "a strict 6-second" cadence from the first load-up.
- Guide only: "short muscle fibers"; taller clients "may tolerate a slightly wider gap"; "Verify knees are centered in the pads".
- No source: the forearm and biceps sequencing line; the starting weight, 60 / 40 lb (the app's own consultation table says 60 / 50).
- Thin: static work beside hip replacements with no clearance condition.
- Labels: filed "Lower Body: Quad Dominant", where the Academy lists it under Hips; seat back 6 or 7 not prefilled.

## How the check was done

- **The lines.** Every field of the twenty entries in `src/data/machine-definitions.ts` was numbered, 1,015 lines in all, and each line was checked on its own.
- **The sources.** For each machine, its Quick Reference Guide, its Comprehensive Equipment Overview and its section of the spoken script were read in full, then the Academy modules that apply to every machine: turnarounds, speed, load-up, warm-up, programming, the Selection Template, substitutes, training with pain, the variations (timed static contraction, static hold), resistance transfers, Exercise Categories and How Intensely to Push a Client. Anything unplaced was searched for across the whole of `docs/msf-academy/`. The copies of a document in different folders are byte-identical, except the Triceps overview (two versions) and one line of the neck machine's QRG (the copy under `Set Up Machines/` calls its back pad optional).
- **The verdicts.** Sourced (a primary document says it, a faithful paraphrase included); Guide only (only the standardized setup guides say it); No source (nowhere in the Academy, with what was searched for); Contradicted (a primary document says otherwise); App field (a label the app files the machine by, noted when it disagrees). When one line held several claims, it took the verdict of its weakest.
- **Who did it.** Five read-only Claude checkers split the twenty machines by body area, and every headline here was checked again against the Academy's own words before it was written down. Nothing in the repository was changed.

## Sources

Short names used above, all under `docs/msf-academy/`:

| Short name | File |
| --- | --- |
| QRG | `Initial Setups (Comprehensive Overview)/Quick Reference Guides/<code> – Quick Reference Guide.txt` (eighteen; none for the Lateral Raise or the Triceps) |
| The overview | `Initial Setups (Comprehensive Overview)/Comprehensive Equipment Overview/<name>.txt` |
| The script | `Workout Setups and Instruction/MSF Upper Body - setup and instruction.txt`, and the Lower Body and Spine_Trunk_Core ones |
| Academy 4.x | `Academy/Academy 4 - Exercise Performance/` (4.5 Speed of Movement, 4.6 Turnaround Technique, 4.10 Warm-up Considerations) |
| Academy 6.1 | `Academy/Academy 6 - General Recommendations for Programming and Progression/Academy - Programming and Progression 1 - Workout Programming Considerations.txt` |
| Academy 7.1, 7.2 | `Academy/Academy 7 - Variations on the Continuous Tension Protocol/` (Timed Static Contraction, Static Hold) |
| The Selection Template | `Academy 6 - General Recommendations for Programming and Progression/Programming and Progression 7 - Exercise Selection Template.txt` |
| Exercise Categories | `Academy 2/Exercise Categories (posture_execution_gaps).txt` |
| How Intensely | `Academy 2/How Intensely to Push a Client.txt` |
| Training with Pain | `Academy 6 - General Recommendations for Programming and Progression/Considerations for Training with Pain.txt` |
| Resistance Transfer | `Academy/Academy - Resistance Transfer Techniques.txt` |
| Glossary | `Academy/Academy 1 - Introduction/Academy - Intro 2 - Glossary.txt` |
| The consultation | `Academy/Academy - Initial Consultation and Articles/Academy - Initial Consultation Script - Tour, Preliminary Considerations, Demo Workout, Consclusion.txt` |
| The setup guides (secondary) | `Set Up Machines/standardized-setup-guide-batch1.md` to `batch4.md` |
