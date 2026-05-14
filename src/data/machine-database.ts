import legPressImg from '../assets/images/regenerated_image_1778764853982.png';
import legCurlImg from '../assets/images/regenerated_image_1778764857234.png';
import legExtensionImg from '../assets/images/regenerated_image_1778764860741.png';
import abductionImg from '../assets/images/regenerated_image_1778764863940.png';
import adductionImg from '../assets/images/regenerated_image_1778764867344.png';
import chestPressImg from '../assets/images/regenerated_image_1778764870689.png';

export interface MachineKnowledge {
  kinematicClassification?: string;
  setupGap?: string;
  executionPosture?: string;
  requiresHandoff?: boolean;
  sequencingContraindications?: string[];
  id: string;
  name: string;
  category: string;
  baseFemale: number;
  baseMale: number;
  setup: string;
  execution: string;
  target?: string;
  targetMuscles?: string[];
  synergists?: string[];
  setupCues?: string[];
  executionCues?: string[];
  clinicalWarnings?: string[];
  contraindicatedFor?: string[];
  biomechanicalNotes?: string;
  imageUrl?: string;
}

export const MACHINE_DATABASE: Record<string, MachineKnowledge> = {
  // Lower Body
  "leg_press": {
    id: "leg_press",
    name: "Leg Press",
    imageUrl: legPressImg,
    kinematicClassification: "Compound Push",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: false,
    category: "Lower Body",
    baseMale: 160,
    baseFemale: 60,
    setup: "Default to P2 seat. Pin accessory at 18 lbs. Feet hip-width apart, parallel.",
    execution: "No pause at turnarounds. Emphasize control ('drag out the turn').",
    target: "Quadriceps, Gluteus Maximus",
    targetMuscles: [
      "Quadriceps (Thighs) - Knee Extension",
      "Gluteus Maximus (Rear end/buttocks) - Hip Extension"
    ],
    synergists: [
      "Hamstrings",
      "Gastrocnemius (Calves)",
      "Soleus (Calves)",
      "Adductor Magnus (Inner Thigh)"
    ],
    setupCues: [
      "Determine seat back position: default to P2 for most. Consider P3 for larger subjects or limited hip flexion tolerance. P3 may increase shoulder pad pressure and hip rise risk.",
      "Set shoulder pads to touch the tops of shoulders when subject is reclined.",
      "Pin accessory stack at 18 lbs. Leave main stack clear; instructor holds selector pin.",
      "Instructor advances footplate forward to reachable distance for client’s leg length.",
      "Position feet hip-width apart on footplate to align ankles, knees, and hips (“stacked”). Feet should be parallel.",
      "Use wider stance and slight toe-out for subjects with larger frames or limited external rotation. Ensure knees track in line with feet.",
      "Instructor carefully releases footplate over client’s control (knees still slightly bent with feet on footplate). Combined 38 lbs of pressure from footplate helps client secure foot position.",
      "Adjust seat so footplate abuts end stop just before full knee extension. Move seat a couple settings closer to account for compression under load (first-time setup only).",
      "Bring footplate back to desired starting (lower turnaround) position. Instructor may need to assist pulling back on footplate due to limited hip flexion (first-time setup only).",
      "Pin main weight stack when footplate is at desired position. Client may pin weight if easier; otherwise, instructor should do so (initial setup only).",
      "Account for additional spacing created under load from padding compression and arm flex."
    ],
    executionCues: [
      "LOAD UP: From lower turnaround, maintain neutral head ('chin down'), establish breathing, then gradually apply pressure through the footplate (may take 3-5 seconds to build enough to move stack).",
      "CONCENTRIC: Smooth pace to upper turnaround (end stop). 'Click' at the moment the end stop is reached or effort limit. No pause.",
      "ECCENTRIC: Keep upper turn continuous with timing of 'click' and cue 'ease out…do not speed up' or 'be continuous…keep that pace'.",
      "LOWER TURNAROUND: Be continuous/seamless, make sure to bottom out but do not unload, avoid Val Salva, do not fire out of the bottom.",
      "Keep hips down; avoid pelvis roll or tailbone lift.",
      "Maintain continuous pace until concentric failure—no pause at any point.",
      "Maintain posture, head position, pace, and knee path throughout. Knees must track consistently in both directions to keep joints stacked.",
      "As fatigue increases, effort must increase to maintain pace and stimulate tension.",
      "At direction changes, emphasize control ('drag out the turn' or 'almost pause but do not')."
    ],
    clinicalWarnings: [
      "If feet slide or torso shifts up seat back, ensure knees do not fully extend. Cue appropriately and click if needed. Adjust settings for next set if necessary.",
      "Higher foot position (and higher seat back P2) = decreased knee flexion, increased hip flexion → more glute biased.",
      "Lower foot position (and lower seat back P3) = increased knee flexion → more quad biased. Both muscle groups contribute regardless.",
      "Avoid pairing LP with Lumbar if client has sensitive lower back. If included in same workout, place several exercises between them to allow lumbar 'pump' to subside.",
      "Upright seat increases hip/spinal flexion; if discomfort occurs, increase gap (shallower lower turnaround) even if it reduces glute emphasis.",
      "Consider doing ABD prior to LP to pre-fatigue glutes and improve sensation of glute engagement."
    ]
  },
  "leg_curl": {
    id: "leg_curl",
    name: "Leg Curl",
    imageUrl: legCurlImg,
    kinematicClassification: "Simple Pull",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: false,
    setupGap: "Gap 2",
    sequencingContraindications: ["Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation."],
    category: "Lower Body",
    baseMale: 70,
    baseFemale: 40,
    setup: "Knee aligned with axis. Thigh pad secure above knee. Ankle pad on Achilles.",
    execution: "Dorsiflex ankles slightly. Squeeze at flexion. Smooth eccentric return.",
    target: "Hamstrings",
    targetMuscles: [
      "Hamstrings - Knee Flexion",
      "Gastrocnemius (Calf) - Knee Flexion"
    ],
    synergists: [
      "Sartorius (upper leg in front of thigh) - assists in Knee Flexion",
      "Gracilis (inner thigh) - assists in Knee Flexion",
      "Wrist Flexors (Forearms) - gripping/holding - anchoring into seat with arms"
    ],
    setupCues: [
      "LC will most likely have a gap of 2 or 3 as an introduction to this exercise (this will be determined by the Studio Leader and MSF Corp). A gap of 3 or more may be advised for those with knee injuries/issues.",
      "Move the seat back to the rearmost position leaving the largest possible area on the seat.",
      "Have the subject sit with their femurs cantilevered off the front of the seat and the lower leg hanging.",
      "The knee should align with the axis of rotation of the machine, which puts the knee cap at the edge of the roller pad but NOT under the pad. No part of the patella can be under the roller pad.",
      "Subject leans slightly forward, seat back is brought forward to just contact the lower back without pushing knees ahead of axis.",
      "Verify that the knees are still in alignment with the axis of rotation.",
      "Subject exits the machine to allow for weight selection and proper loading.",
      "Use the assist bar attached to the movement arm, pull the movement arm down to an approximate midpoint. Use your right knee on the calf pad to assist.",
      "Lower the weight to set the movement arm into the starting position (client’s legs will now be extended out in front of them).",
      "ALTERNATIVE LOADING METHOD: If weight is too heavy to move with assist bar, use only accessory stack initially. Lower movement arm against passive tension, then select main stack.",
      "Adjust the calf pad. Ideally, it will make contact with the lowest part of the back of the leg, just above the achilles tendon. A tighter fit that is still comfortable is ideal."
    ],
    executionCues: [
      "LOAD UP: From starting position, keeping neutral head, feet and ankles relaxed, pulling up on handles, gradually activate force couple by bending knees into roller pads.",
      "Once instructor gives cue to begin load up, observe intently. Give positive feedback if proper.",
      "CONCENTRIC: Move until knees are maximally bent, with the 'click' after the brief pause or squeeze.",
      "ECCENTRIC: After load up and first concentric, cue 'ease out and do not speed up'.",
      "LOWER TURNAROUND: Establish expectation: 'touch and go' or 'be continuous' or 'barely touch, barely start'.",
      "Keep hips down by anchoring with the hands.",
      "After lower turnaround at beginning of third rep, dorsiflex ankles AFTER the change of direction.",
      "Cue: 'keep ankles relaxed during the turn…now pull the feet up to the knees'.",
      "At upper turn cue: 'keep ankles flexed, keep movement arm still, keep breathing, [click], relax the ankles, THEN ease out'. Ensure no movement occurs while relaxing ankles.",
      "Pace: 1-second pause on first two reps, 2-3 second 'squeeze' from third rep on.",
      "Maintain posture, head position, pace, and contact on roller pads. Movement only at knee joint.",
      "Record only full reps. Continuing set after concentric failure is highly individual and should be discussed with a leader."
    ],
    clinicalWarnings: [
      "Gradual load up may take 3 to 5 seconds. Use imagery like 'just barely beginning to dent the roller pads'.",
      "Relax feet/ankles on first two reps, then flex ankles during concentric from third rep on. This 'toggling' engages calf on concentric for tighter contraction, then relaxes on eccentric to isolate hamstring.",
      "Leg curl has reputation for 'cramps'. These are often just sensations from unfamiliar knee flexion resistance and typically go away as strength increases.",
      "If client physically cannot fully bend knees, redefine full ROM as 'limited ROM' or 'limit flexion' on chart.",
      "Consider using a hard end stop at THEIR contracted position (upper turn) with extra selector pin. Document gap.",
      "Full knee flexion is not a requirement. Focus on establishing neuromuscular connection.",
      "Prolonged light sets may be counterproductive due to discomfort. Strive for 'faster' reps (6s/6s) and heavier weight leading to failure in ≤10 reps once form is perfect."
    ]
  },
  "leg_extension": {
    id: "leg_extension",
    name: "Leg Extension",
    imageUrl: legExtensionImg,
    kinematicClassification: "Simple Push",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: false,
    setupGap: "Gap 2",
    category: "Lower Body",
    baseMale: 80,
    baseFemale: 40,
    setup: "Align knee joint with axis of rotation. Ankle pad rests gently above the shoe.",
    execution: "Smooth transition at extension. Do not throw the weight. 2-3 second pause at top.",
    target: "Quadriceps Femoris",
    targetMuscles: [
      "Quadriceps (Thighs) – Knee extension: all four heads of the quadriceps active, especially the Rectus Femoris which is not stimulated during pressing patterns"
    ],
    synergists: [
      "Brachioradialis (Forearms) – anchoring into seat with arms",
      "Wrist Flexors (Forearms) – gripping/holding for anchoring"
    ],
    setupCues: [
      "LE will typically have a gap of 2 as an introduction to the exercise.",
      "Move the seat back to the rearmost position to maximize seat surface.",
      "With tibia pad in the bottom position, have subject sit with legs hanging off at the knee; align knee joint with machine’s axis of rotation.",
      "Subject should lean forward slightly while seat back is brought forward to make contact with pelvis without pushing them forward beyond axis.",
      "Subject should sit fully back into the seat; ensure knee remains aligned with axis and there is no excessive pressure behind the knee.",
      "Once the position is finalized, have subject exit for proper loading.",
      "Standard gap of 2 in most cases due to significant knee flexion; confirm specifics with MSF Corporate during installation (gap may be larger for knee issues).",
      "Select appropriate weight and gap.",
      "Use assist bar to move tibia pad; subject enters seat rear-first and sweeps legs behind tibia pad.",
      "Lower tibia pad onto subject’s shins, ensure contact just above the top of the foot.",
      "ALTERNATIVE LOADING: If weight is too heavy to move with assist bar, load desired weight on accessory stack, remove main stack pin. Move tibia pad out of way, client enters seat, and trainer lowers movement arm into place against passive resistance. Then set main stack.",
      "Secure seatbelt in subject’s hip crease; belt should not restrict femurs. Trainer may need to request the other end from the subject.",
      "Posture: Chest up, back laid against seat, head upright and neutral. Hands pulling up for leverage. Face, jaw, feet, and ankles relaxed."
    ],
    executionCues: [
      "LOAD UP: Begin from lower turn with neutral head, relaxed feet and ankles, pulling up on handles. Establish breathing and gradually apply pressure into tibia pad to initiate knee extension.",
      "Instructor provides feedback after gradual load up ('mmm, hmm' or 'yes, just like that').",
      "CONCENTRIC: Subject moves to full knee extension; brief pause or squeeze at upper turn with optional 'click'.",
      "ECCENTRIC: After the first concentric, cue 'ease out and do not speed up'.",
      "LOWER TURNAROUND: During first eccentric, cue lower turnaround: 'touch and go,' 'be continuous,' or 'barely touch, barely start'.",
      "Maintain hips down using leverage from handles.",
      "Use continuous pace with 'brief but definite' pause of 1 second in contracted position for first two reps, progressing to 2–3 second squeeze from third rep on.",
      "Provide clear instruction for HOW to perform squeeze (e.g. 'pull up on handles, fully straighten knees, keep breathing, keep still, [click], ease out').",
      "Maintain posture, head position, pace, and alignment; movement occurs only at the knee.",
      "Only full reps reaching full extension count toward recorded total.",
      "Instructor may allow continuation after concentric failure if partial reps are controlled and client is experienced/comfortable with higher intensity.",
      "Teach effort progression; effort must increase with fatigue to maintain pace and tension."
    ],
    clinicalWarnings: [
      "Explain 'gradual' to the client: e.g. '20 pounds… 40 pounds… find just enough force to crack the stack'. Emphasize 3–5 second gradual load-up.",
      "Instruct subject to relax feet and ankles to prevent dorsiflexion, which can inhibit quadriceps contraction due to calf tension.",
      "If client appears unable to fully straighten knees, assess joint capability with a no-load demonstration (knee extension without movement arm). Use anchoring and verbal cues ('straighten further').",
      "If structurally limited, note 'limited ROM' or 'limit ext' on chart for consistency.",
      "Consider using a hard end stop (pin placed above weight stack) for those unable to reach full extension; this gives feedback on ROM and allows trainer to track. Document empty holes-gap.",
      "Be prepared to avoid or modify exercise for those with knee issues.",
      "Most conservative option: Timed Static Contraction (TSC) – position movement arm mid-range, pin heavy unliftable weight, cue 50% for 30s, 75% for 30s, 100% for 30s.",
      "Alternative conservative option: Static Hold (SH) – load held against end stop. Initial duration: 30–45s; progress to 120s max before increasing weight.",
      "Be cautious with prolonged light sets that may lead to discomfort before stimulus. Strive for heavier weight over time and controlled 6/6 tempo leading to failure in ≤10 reps."
    ]
  },
  // Hips
  "abduction": {
    id: "abduction",
    name: "Abduction",
    imageUrl: abductionImg,
    kinematicClassification: "Simple Push",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: false,
    setupGap: "Custom Gap",
    category: "Hips",
    baseMale: 50,
    baseFemale: 30,
    setup: "Thigh pads snug, no gap needed. Manual pull apart during entry.",
    execution: "Lift chest, arch back. Brief 2-3 second squeeze at upper turnaround.",
    target: "Gluteus Medius, Minimus",
    targetMuscles: [
      "Gluteus Medius (Glutes/Hips) – Hip horizontal Abduction"
    ],
    synergists: [
      "Gluteus Minimus (Glutes/Hips) – Hip horizontal Abduction",
      "Gluteus Maximus – lateral fibers (Glutes/Hips) – Hip horizontal Abduction",
      "Piriformis – Hip horizontal Abduction"
    ],
    setupCues: [
      "Seat back is typically standardized at position 6 or 7 to maintain a more upright position.",
      "Thigh pad width determines starting point and lower turnaround, thus a gap is never needed.",
      "Pads should be as snug as possible without discomfort; slight compression of soft tissue may be desirable for increased ROM.",
      "If client has a history of hip issues or reports discomfort, slightly wider pad settings may be warranted.",
      "Subjects with larger hips/legs typically require wider pad settings; smaller individuals narrower settings.",
      "Movement arms must be pulled apart manually by grabbing the ends of padding while client enters seat and lifts legs.",
      "If weight is too heavy to allow arms to be pulled apart manually, wait until client is seated to load weight stack.",
      "When setting weight post-entry, assist movement arms fully closed to allow selector pin placement; take additional care due to soft tissue compression."
    ],
    executionCues: [
      "Posture: Chest up, butt back, seat belt secured around waist (not over femurs or restricting hips), head neutral, feet and ankles relaxed.",
      "Hands on handles for balance—not for anchoring.",
      "Encourage anterior pelvic tilt facilitated by upright chest and slight lumbar arch.",
      "LOAD UP: From lower turnaround, cue client to lift chest, maintain neutral head, hands on handles, and gradually apply outward pressure through the knees.",
      "Instructor observes closely during initial load; brief positive feedback.",
      "CONCENTRIC: Client drives knees apart 'as far as comfortably possible' while lifting chest and arching back.",
      "UPPER TURNAROUND: Brief 1-2 second pause on first two reps, 2-3 second squeeze from third rep onward. Click at precise moment duration is completed.",
      "Verbiage: 'keeping your head still, drive your knees apart as hard as you can…there, lock it in place…breathe freely…[click], ease out'.",
      "ECCENTRIC: Cue 'ease out, do not speed up' immediately after click.",
      "LOWER TURNAROUND: Provide cue on first eccentric such as 'touch and go', 'be continuous', or 'seamlessly change directions'.",
      "Movement should be continuous at the bottom with no pause.",
      "Only full reps (full contraction) are recorded.",
      "Partial reps may be useful near failure if controlled and subject is advanced."
    ],
    clinicalWarnings: [
      "Watch for pinch points when loading/unloading; pull movement arms apart by ends of padding and return slowly.",
      "Ensure client's hands are clear of rocking/tilting thigh pads.",
      "Clients with hip replacements or other hip pathologies may not tolerate this movement.",
      "If limited ROM is present, ensure it's not due to excessive weight or poor execution.",
      "Drive through knees to make the cueing simpler, even if pads aren't directly contacting them.",
      "Conservative approach for hip issues: Timed Static Contraction (TSC). Pin unliftable weight near midpoint, cue 50% for 30s, 75% for 30s, 100% for 30s.",
      "Progression: lighter weights allow higher reps but prolonged time under load may cause discomfort before stimulus. Strive for 6/6 tempo and failure in ≤10 reps with a slightly heavier load over time."
    ]
  },
  "adduction": {
    id: "adduction",
    name: "Adduction",
    imageUrl: adductionImg,
    kinematicClassification: "Simple Pull",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: false,
    setupGap: "Custom Gap",
    sequencingContraindications: ["Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation."],
    category: "Hips",
    baseMale: 60,
    baseFemale: 40,
    setup: "Pads positioned inside knees. Max comfortable stretch on setup.",
    execution: "Drive knees together. Squeeze inner thighs. Do NOT clash pads.",
    target: "Adductor Longus/Brevis/Magnus",
    targetMuscles: [
      "Adductor Brevis (Inner Thigh) – Hip horizontal adduction",
      "Adductor Longus (Inner Thigh) – Hip horizontal adduction",
      "Adductor Magnus (Inner Thigh) – Hip horizontal adduction",
      "Pectineus (Inner Thigh) – Hip horizontal adduction",
      "Gracilis (Inner Thigh) – Hip horizontal adduction"
    ],
    setupCues: [
      "Seat back typically standardized at position 6 or 7.",
      "Instructor must assist client with entry and exit; take full responsibility for safety during setup.",
      "Main setup consideration is establishing a conservative ROM using a custom gap.",
      "Clear main stack (and accessory stack if needed) before setting the gap.",
      "Ensure movement arms are far enough apart, then have the client take a seat.",
      "Begin bringing movement arms together and cue client to lift left leg into place, then right leg.",
      "Slowly allow movement arms apart, maintaining contact with leg/hand to avoid sudden movement.",
      "Ask client to indicate when a slight stretch is felt on the inner thigh.",
      "Set selector pin into desired main stack weight and record gap.",
      "Instructor should use judgment if client requests more stretch; assess risk/benefit."
    ],
    executionCues: [
      "Posture: Sit back, butt back, neutral head, feet and ankles relaxed.",
      "Hands on handles for balance, not anchoring. Encourage relaxed upper body with optional abdominal contraction.",
      "LOAD UP: From lower turnaround, establish steady breathing and gradually begin pressing knees together.",
      "CONCENTRIC: Smoothly drive knees together into upper turnaround.",
      "UPPER TURNAROUND: Pause in contracted position for about 1-2 seconds on first two reps, 2-3 seconds from rep three onward. Click exactly when duration ends.",
      "Verbiage: 'Continue to drive your knees together…keep breathing, lock it in place, [click], ease out…keep that pace.'",
      "ECCENTRIC: Immediately after the click, cue 'ease out, do not speed up'.",
      "LOWER TURNAROUND: Continuous movement at the bottom—'touch and go' without pausing.",
      "Maintain same controlled pace throughout (1-2s pause early, 2-3s squeeze later). Do not just say 'squeeze', teach HOW.",
      "Only full reps are counted/recorded on chart.",
      "Set may continue after full ROM is lost if reps remain under strict control and client is advanced/tolerant.",
      "For newer clients, a few full reps may be sufficient; failure is not required in initial sessions."
    ],
    clinicalWarnings: [
      "Instructor must remain fully responsible for client safety during entry/exit.",
      "Entire movement arm setup must be under instructor control with clear, timely instruction.",
      "Always begin with a conservative stretch to avoid vulnerable positions. Gradual increases over time if strength/tolerance improve.",
      "Cue clients to press through knees, even if knees do not directly contact the thigh pads.",
      "Clients with hip replacements or related issues may not tolerate this movement pattern. The most conservative approach is to avoid it.",
      "Alternative: Timed Static Contraction (TSC). Use unliftable weight, set arms at midpoint. 30s @ 50%, 30s @ 75%, 30s @ 100%.",
      "Continuous Tension protocol typically starts light, which can cause discomfort. Target 6s/6s tempo with heavy weights leading to failure in ≤10 reps to minimize discomfort."
    ]
  },
  // Upper Body - Push
  "chest_press": {
    id: "chest_press",
    name: "Chest Press",
    imageUrl: chestPressImg,
    kinematicClassification: "Compound Push",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: false,
    category: "Upper Body - Push",
    baseMale: 60,
    baseFemale: 20,
    setup: "Stool required. Elbows slightly lower than hands to align forearm.",
    execution: "No pause. Emphasize exaggerated control at turnarounds. 3-5s gradual load up.",
    target: "Pectoralis Major, Triceps",
    targetMuscles: [
      "Pectoralis Major (Chest/Pecs) – Shoulder horizontal Adduction",
      "Triceps – Elbow extension",
      "Anterior Deltoid (Shoulder) – Shoulder horizontal Adduction"
    ],
    synergists: [
      "Erector Spinae – Spinal extension / anterior pelvic tilt",
      "Lower Trapezius – Scapular stabilizer",
      "Rotator Cuff – Shoulder stabilizers"
    ],
    setupCues: [
      "Provide stool for all clients to support legs (knees should be higher than hips).",
      "Set seat height so upper arm is abducted 30–45° off body, with elbow ~90° or more. Handles should align with hands.",
      "If seat is too high: elbows will be above hands. If seat is too low: elbows significantly below hands.",
      "Ideal: elbows slightly lower than hands on handles, forearms aligned with movement arm path (forearm will be angled/tracking slightly upward).",
      "Place heel of palm on bend of handle for semi-pronated grip (thumbs slightly rotated upward).",
      "Determine seat back position by ensuring full elbow extension (or just short of it) at upper turnaround without protraction. Chest up, ribcage rigid.",
      "Assist unloaded handles back to a conservative stretch to determine lower turnaround gap. Account for padding compression.",
      "For compromised shoulders: elbow stays forward of torso midline (less stretch). For healthy shoulders: elbow just behind torso midline (more stretch)."
    ],
    executionCues: [
      "Posture: Chest up, hips back, chin tucked, shoulders retracted. Upper arms abducted 30–45°.",
      "Feet on stool with knees above hips. Avoid dangling feet.",
      "LOAD UP: From lower turn, establish breathing. Gradually apply pressure, pushing from chest (3-5 seconds to start moving).",
      "CONCENTRIC: Arms converge until handles touch or nearly touch. Elbows straighten or just short of it.",
      "Click precisely at movement convergence. Ensure client fully reaches upper turnaround before clicking.",
      "ECCENTRIC: Immediately after click, cue 'ease out…do not speed up'. No pause at upper turnaround (never on compound pushing).",
      "LOWER TURNAROUND: Cue during first eccentric. 'Touch and go', 'be continuous at the bottom', 'soft touch, do not pause'.",
      "Maintain posture, head, pace, and consistent arm/elbow path (elbows track through same path concentrically and eccentrically)."
    ],
    clinicalWarnings: [
      "There is no pause on a chest press. It is one continuous effort. Emphasize exaggerated control at turnarounds.",
      "Taller clients usually need a lower seat. Longer arms need back pad slightly further back.",
      "Stack the joints: hand and elbow must follow the out-and-up trajectory of the movement arm.",
      "During early learning, expect more reps. Progress to heavier loads and shorter sets (≤10 reps) with perfect form (~6 sec up / 6 sec down) to avoid intolerable duration."
    ]
  },
  "overhead_press": {
    id: "overhead_press",
    name: "Overhead Press",
    kinematicClassification: "Compound Push",
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
    requiresHandoff: false,
    category: "Upper Body - Push",
    baseMale: 40,
    baseFemale: 20,
    setup: "Stool required. Standard gap = 2. PPT posture.",
    execution: "No pause. Neutral grip, load up horizontally and push vertically.",
    target: "Anterior Deltoid, Triceps",
    targetMuscles: [
      "Anterior Deltoid (Shoulder [front]) – Shoulder Abduction, Shoulder Flexion",
      "Middle Deltoid (Shoulder [side]) – Shoulder Abduction, Shoulder Flexion",
      "Triceps – Elbow Extension",
      "Pectoralis Major (Chest/Pecs) – Assists in Shoulder Flexion"
    ],
    synergists: [
      "Rectus Abdominis (Abdominals) – Posterior Pelvic Tilt (PPT)",
      "Subscapularis (Rotator Cuff) – Shoulder Stabilizer",
      "Posterior Deltoid – Shoulder Stabilizer",
      "Trapezius – Scapular Rotation and Stabilizer (Scapulohumeral Rhythm)"
    ],
    setupCues: [
      "Evaluate if subject needs a stool for entry and/or leg support.",
      "Confirm seat height using the standard gap of 2 on the weight stack.",
      "Seat height is correct if arms hang naturally, then with an elbow bend hands land near handle ends.",
      "For compromised shoulder joints, consider lowering seat and/or increasing gap to reduce ROM.",
      "Ensure neutral grip, hands near bottom of the handles.",
      "Handles angle downward; proper leverage requires forward pressure perpendicular to handle.",
      "Instruct subject to maintain a posterior pelvic tilt (PPT) with abdominal contraction for lumbar safety.",
      "Account for pad compression and arm flex under load—adjust as needed."
    ],
    executionCues: [
      "Posture: Confirm PPT, neutral head (gazing downward), hips back.",
      "Upper arms should follow scapular plane (30°–40° anterior to frontal plane). Scapulae free.",
      "Feet must rest firmly on a support stool—no leg dangling.",
      "LOAD UP: From lower turnaround, establish breathing. Gradually apply pressure over 3-5 seconds.",
      "CONCENTRIC: Maintain consistent elbow path. Ensure full arm extension at top (some natural scapular elevation expected).",
      "Instruct to continue full ROM before clicking at upper turnaround—click timing is critical.",
      "ECCENTRIC: Immediately post-click, cue 'ease out, do not speed up'.",
      "LOWER TURNAROUND: 'Touch and go', 'be continuous', or 'do not pause'. Smooth continuous pace.",
      "Monitor and cue increased effort to match rising fatigue."
    ],
    clinicalWarnings: [
      "There is no pause on an overhead press. Emphasize continuous effort with slow transitions.",
      "Do not click prematurely at upper turnaround—this creates confusion and truncates ROM.",
      "If subject experiences shoulder pain/discomfort in upper half, limit ROM with a selector pin to establish a hard end stop.",
      "Continuous Tension protocol typically starts light, which can cause discomfort. Target 6s/6s tempo with heavy weights leading to failure in ≤10 reps to minimize discomfort."
    ]
  },
  "seated_dip": {
    id: "seated_dip",
    name: "Seated Dip",
    kinematicClassification: "Compound Push",
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
    requiresHandoff: false,
    category: "Upper Body - Push",
    baseMale: 70,
    baseFemale: 40,
    setup: "Seat height determines starting position and shoulder angle. Stool often required.",
    execution: "Press down gradually. Synergistic action: straighten arms, protract blades, contract abs.",
    target: "Pectoralis Major, Triceps, Anterior Deltoid",
    targetMuscles: [
      "Pectoralis Major (Costal and Sternal Heads) – Shoulder flexion from hyperextension, horizontal adduction",
      "Triceps – Elbow extension",
      "Anterior Deltoid – Shoulder flexion"
    ],
    synergists: [
      "Erector Spinae – Spinal extension, anterior pelvic tilt (chest-up posture)",
      "Lower Trapezius – Scapular stabilization",
      "Serratus Anterior – Scapular depression and protraction",
      "Latissimus Dorsi – Assists in shoulder flexion from hyperextension to anatomical position",
      "Rotator Cuff – Shoulder stabilization"
    ],
    setupCues: [
      "Most clients will require a stool to support legs due to high seat position; some may need for entry.",
      "Seat height determines both starting position and intersection of hands with movement arms (lower turnaround).",
      "Aim for upper arms abducted 45–60 degrees; elbows bent ~90° or more. Humerus tends to be behind torso.",
      "Favor a higher seat setting for safety to avoid excessive stretch of shoulder capsule and hyperflexion of elbows.",
      "Hands placed more forward on handles; choose neutral or pronated grip. Use Fat Gripz to distribute pressure.",
      "Set back pad angle and lower to meet mid/upper back to provide leverage, promoting forward lean.",
      "Adjust seat depth so subject can leverage off back pad. Adjustments may be needed post-loading."
    ],
    executionCues: [
      "Posture: Chest up, hips back, head neutral (downward gaze), shoulders retracted. Fasten seat belt tightly.",
      "Feet must contact a stool for stability. Start from lower turnaround.",
      "LOAD UP: Instruct gradual pressure through heel of palm while breathing (3-5 seconds to start).",
      "CONCENTRIC: Movement arms travel down. Subject must (1) straighten arms fully, (2) protract shoulder blades, (3) contract abdominals.",
      "Actions occur synergistically to complete the upper turnaround.",
      "Emphasize clicking occurs only after movement stalls, not just pushing handles as low as possible.",
      "Click visually confirms desirable ROM achieved and movement has temporarily ceased.",
      "ECCENTRIC: After click, cue 'ease out'. Establish lower turnaround expectation: 'Touch and go', 'do not pause'.",
      "Continuous pace throughout set with brief pause only as needed to ensure full contraction at upper turnaround.",
      "Effort must increase to match rising fatigue to maintain pace."
    ],
    clinicalWarnings: [
      "There is no pause on a seated dip. It is one continuous effort.",
      "In the interest of safety, always err on a more conservative setting by having the seat higher.",
      "Make sure the subject reaches fully contracted position (upper turn) prior to the click. Do not click prematurely.",
      "Early stages of protocol learning with lighter weight allow higher reps, creating discomfort well before stimulative tension.",
      "Progress to heavier loads (leading to failure ≤10 reps) once subject demonstrates control."
    ]
  },
  "chest_flye": {
    id: "chest_flye",
    name: "Chest Flye",
    kinematicClassification: "Simple Push",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: false,
    category: "Upper Body - Push",
    baseMale: 50,
    baseFemale: 30,
    setup: "Adjust seat so humerus slopes down slightly or is level. Practical alignment prioritizes elbow contact.",
    execution: "Squeeze elbows together until pads touch. Brief pause on first reps, 2-3s squeeze on later reps.",
    target: "Pectoralis Major",
    targetMuscles: [
      "Pectoralis Major (Chest/Pecs) – Shoulder horizontal adduction"
    ],
    synergists: [
      "Anterior Deltoid (Shoulder) – Shoulder horizontal adduction"
    ],
    setupCues: [
      "Determine seat height based on height: taller subjects lower seat, shorter subjects higher seat.",
      "Fine-tune seat so upper arm (humerus) slopes down slightly or is level to floor.",
      "Humeral head slightly above or level with elbow when hands on handles.",
      "Subject's head aligns near padded 'work box' overhead.",
      "Theoretical alignment: shoulders under machine's axes of rotation.",
      "Practical alignment takes priority: elbows must remain beyond and in contact with roller pads throughout ROM.",
      "Longer arms: back pad further. Shorter arms: back pad closer. Consider both arm length and torso size.",
      "Gap creates conservative stretch: elbows slightly behind midline of torso (frontal plane).",
      "For shoulder issues, use larger gap to reduce stretch."
    ],
    executionCues: [
      "Posture: Chest up, butt back, feet on stool. Chin slightly tucked. Arms behind roller pads.",
      "LOAD UP: From lower turn, establish breathing. Gradually drive forward through elbows.",
      "CONCENTRIC/UPPER TURN: Drive elbows together until roller pads make contact.",
      "Hold contracted position for 1 sec on initial reps, 2-3 sec from third rep onward. Provide actionable instruction.",
      "Instructor clicks at end of desired pause/squeeze.",
      "ECCENTRIC: Immediately cue 'ease out'.",
      "LOWER TURNAROUND: 'Touch and go', 'be continuous at bottom'. NO bottom pausing.",
      "Maintain continuous pace, posture, and contact with arm pads.",
      "Only full reps reaching proper contraction count toward total. Instructor may allow partial reps if control remains."
    ],
    clinicalWarnings: [
      "Always point out overhead padded mechanism on entry/exit ('watch your head').",
      "If client cannot reach handles without upward humeral angle, grip top of roller pads instead.",
      "Effective for clients with wrist, hand, or elbow issues needing chest stimulation.",
      "Excessive time under tension from high reps in early stages may lead to discomfort before stimulative levels."
    ]
  },
  "triceps_extension": {
    id: "triceps_extension",
    name: "Triceps Extension",
    kinematicClassification: "Simple Push",
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
    requiresHandoff: false,
    category: "Upper Body - Push",
    baseMale: 40,
    baseFemale: 25,
    setup: "Upper arms flush along pad. Taller subjects lower seat.",
    execution: "Brace abdomen, drive forearms to full extension. 1-3s pause.",
    target: "Triceps Brachii",
    targetMuscles: [
      "Triceps Brachii (Triceps - short head) – Elbow Extension"
    ],
    synergists: [
      "Rectus Abdominis (Abdominals) – Thorax stabilizer"
    ],
    setupCues: [
      "Primary consideration: seat height. Taller subjects lower seat, shorter subjects higher seat.",
      "Align elbow joint with machine axis of rotation as closely as possible.",
      "Proper seat height: upper arm (humerus) lays flush along pad.",
      "Subject sits upright with chest against pad, arms laying over pad in front.",
      "Test alignment: pin movement arm down into extended position to observe congruency.",
      "If seat too high, upper arm hovers. If too low, elbow cannot make contact.",
      "Gap required if movement arm at rest is near subject's face, or if subject lacks strength in lengthened position."
    ],
    executionCues: [
      "Posture: Rounded back posture with PPT, contracted abdomen, feet under foot pads, seat belt tight.",
      "LOAD UP: Tighten abdomen, neutral head, arms in place with palms facing and bladed hands. Gradually drive out from elbows.",
      "CONCENTRIC/UPPER TURN: Maintain smooth pace, abdomen tight, attempt to straighten elbows fully.",
      "Hold contracted position (1 sec pause for first two reps, 2-3 sec squeeze from third rep on).",
      "Instructor clicks ONLY when proper ROM achieved and movement temporarily ceased.",
      "ECCENTRIC: Cue 'ease out, do not speed up' immediately after click.",
      "LOWER TURNAROUND: 'Touch and go', 'be continuous', or 'seamlessly change directions'.",
      "Keep upper arm firmly leveraged against pad throughout.",
      "End set at concentric failure (record full reps), but partial reps permitted if control remains."
    ],
    clinicalWarnings: [
      "Most common error: lifting upper arms and elbows off pad to push movement arm further. Must keep contact to isolate triceps.",
      "Stronger individuals require more abdominal stabilization. Consider routine sequence (doing abs just prior may limit triceps output).",
      "Can be performed isometrically (TSC) for individuals with injuries like tennis/golfer's elbow.",
      "During early stages, expect higher reps. Progress to heavier loads (≤10 reps) to minimize discomfort from long duration."
    ]
  },
  "lateral_raise": {
    id: "lateral_raise",
    name: "Lateral Raise",
    kinematicClassification: "Simple Push",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: false,
    category: "Upper Body - Push",
    baseMale: 30,
    baseFemale: 15,
    setup: "Seat height such that axis of rotation is slightly below shoulders.",
    execution: "Lead with elbows. Raise to parallel. Slower eccentric lowering.",
    target: "Lateral Deltoid"
  },
  // Upper Body - Pull
  "compound_row": {
    id: "compound_row",
    name: "Compound Row",
    kinematicClassification: "Compound Pull",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: true,
    sequencingContraindications: ["Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation."],
    category: "Upper Body - Pull",
    baseMale: 80,
    baseFemale: 40,
    setup: "Adjust chest pad based on torso length. Handles within fingertip reach when extended.",
    execution: "Requires hand-off. Pull elbows past torso (squeeze). Lower continuously.",
    target: "Lats, Rhomboids, Trapezius",
    targetMuscles: [
      "Rhomboids – Scapular Retraction/Adduction and Downward Rotation",
      "Trapezius – Scapular Retraction/Adduction and Downward Rotation",
      "Latissimus Dorsi – Shoulder Extension, Shoulder Adduction",
      "Posterior Deltoid – Shoulder Horizontal Abduction, Shoulder Extension",
      "Teres Major – Shoulder Extension",
      "Biceps – Elbow Flexion, Forearm Supination",
      "Brachioradialis – Elbow Flexion, Forearm Pronation, Supination"
    ],
    synergists: [
      "Erector Spinae – Spinal Extension, Anterior Pelvic Tilt (chest-up posture)",
      "Wrist Flexors – Wrist Flexion (grip support)"
    ],
    setupCues: [
      "Set chest pad height ('up' or 'down') based on torso length and comfort. Note on chart.",
      "Adjust seat so handles are just within fingertip reach with arms fully extended and shoulders rounded forward slightly.",
      "Use standard gap of 2 on weight stack. Match chest pad location up to handles.",
      "Confirm movement arm clears top of client's head. Move chest pad back (and increase gap) if too close.",
      "Default handle width: Middle ('M'). Narrow ('N') for lats. Wide ('W') for upper back.",
      "Align handle settings with training intention; random variation compromises outcome."
    ],
    executionCues: [
      "Posture: Chest up, hips back, slight forward lean. Hips NOT tucked under chest pad.",
      "HANDOFF: Client and trainer pull handles together just beyond midpoint. Client contributes.",
      "Trainer uses wide stance, grabs bottom of arm with one hand and pronated handle with other.",
      "Trainer cues 'That is yours'. Delay handoff if client cannot stabilize ('increase your force').",
      "ECCENTRIC: Cue 'slowly begin to let arms straighten'.",
      "LOWER TURNAROUND: Once arms extended, 'continuously'/'immediately' begin concentric. Avoid pauses. Weights may/may not touch.",
      "CONCENTRIC/UPPER TURN: Pull until elbows pass torso (or align at side).",
      "Click only after full ROM and controlled pause achieved. Use specific cues (e.g. 'Draw shoulders back').",
      "Maintain chest-up posture, neutral head, and identical arm paths on both phases."
    ],
    clinicalWarnings: [
      "Ensure movement arm clears head during entry, exit, and execution.",
      "Neutral grip handles default (most shoulder-friendly).",
      "Scapular motion should increase with upper back emphasis (encouraging retraction/protraction).",
      "For valgus elbow conditions: adjust ROM, limit elbow extension, or switch to pronated handles if discomfort occurs.",
      "Pronated grip requires wider arm path and further elbow drive for upper back emphasis."
    ]
  },
  "pulldown": {
    id: "pulldown",
    name: "Pulldown (Torso Arm)",
    kinematicClassification: "Compound Pull",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: true,
    setupGap: "Gap 2",
    sequencingContraindications: ["Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation."],
    category: "Upper Body - Pull",
    baseMale: 70,
    baseFemale: 50,
    setup: "Setup supinated handles, adjust seat (avoid 1-4). Gap weight stack if needed.",
    execution: "Requires handoff near eye level. Pull elbows into sides of rib cage.",
    target: "Lats, Teres Major, Posterior Deltoid, Biceps",
    targetMuscles: [
      "Latissimus Dorsi (Lats) – Shoulder Extension (Supinated, Sagittal plane)",
      "Teres Major (Upper Back) – Shoulder Extension",
      "Posterior Deltoid (Rear Delt) – Shoulder Extension",
      "Biceps – Elbow Flexion, Forearm Supination"
    ],
    synergists: [
      "Rhomboids – Scapular downward rotation",
      "Lower Trapezius – Scapular depression",
      "Pectoralis Major & Triceps – Shoulder Extension",
      "Erector Spinae – Spinal Extension/Anterior Pelvic Tilt",
      "Rectus Abdominis – PPT at finish or upper turn of rep",
      "Wrist Flexors – Gripping/holding"
    ],
    setupCues: [
      "Provide stool for entry or foot support. Seat belt should be tightly secured.",
      "Handles in supinated position (ends face inward and slightly forward).",
      "Subject must be seated behind vertical path of handles (by upper arm length).",
      "Back pad setting of 2 or 3 for most (1 for larger subjects).",
      "Avoid seat positions 1-4 (too high). Use 5-9 and increase weight stack gap.",
      "Bring handles down to subject so elbow has slight bend, then pin stack to set gap.",
      "Grip should be shoulder-width or narrower to ensure narrow arm path."
    ],
    executionCues: [
      "Posture: Chest up, hips back, chin slightly tucked, upper back against seat back.",
      "HANDOFF: Trainer assists in pulling handles to contracted position near eye level.",
      "Confirm control during handoff ('increase your force'). ECCENTRIC: 'slowly let arms straighten'.",
      "LOWER TURN: As arms almost straighten and weights lightly touch, 'immediately' begin bending elbows.",
      "CONCENTRIC/UPPER TURN: Pull elbows into sides of rib cage (not beyond). Wrists remain flat.",
      "Optional: cue abdominal contraction for added engagement at upper turn (no forward leaning).",
      "Do not over-pull or excessively flex wrists to force a click.",
      "Click ONLY after observing control and full ROM at upper turn with brief pause."
    ],
    clinicalWarnings: [
      "Torso Arm variation uses neutral grip/frontal plane (biases iliac division of lats). Use if supinated pattern cannot be tolerated.",
      "Pulldown biases thoracic/lumbar divisions of lats.",
      "Do not restrict natural scapular movement (scapulohumeral rhythm) unless excessive shrugging is observed.",
      "Prioritize head/ribcage stabilization over scapular positioning.",
      "Address valgus elbow issues with ROM modifications or Torso Arm variation."
    ]
  },
  "pullover": {
    id: "pullover",
    name: "Pullover",
    kinematicClassification: "Simple Pull",
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
    requiresHandoff: true,
    sequencingContraindications: ["Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation."],
    category: "Upper Body - Pull",
    baseMale: 60,
    baseFemale: 40,
    setup: "Align axis slightly above shoulder joint. PPT posture (rounded back).",
    execution: "Starts in contracted position. Drive elbows down into ribs, tighten midsection.",
    target: "Lats, Teres Major, Posterior Deltoid, Pectoralis Major",
    targetMuscles: [
      "Latissimus Dorsi (Lats) – Shoulder Extension"
    ],
    synergists: [
      "Teres Major (Upper Back) – Shoulder Extension",
      "Posterior Deltoid (Rear Delt) – Shoulder Extension",
      "Rhomboids (Upper Back) – Scapular Downward Rotation w/ Adduction",
      "Trapezius (Upper Back) – Scapular Adduction w/ Depression",
      "Pectoralis Major (Chest) – Shoulder Extension",
      "Triceps Brachii (Long Head) – Shoulder Extension",
      "Rectus Abdominis – Thorax Stabilizer"
    ],
    setupCues: [
      "Seat back: most use 'up and back'; smaller clients 'down and forward'.",
      "Seat height: taller = lower seat, shorter = higher seat.",
      "Align machine's axis of rotation slightly above subject's shoulder joint (with arms at sides) to account for excursion.",
      "Arm pads: W, M, or N based on torso width. Usually M. Set as narrow as possible.",
      "Elbows should land at least halfway down the arm pads and maintain ~90 degree angle throughout without sliding.",
      "Maneuver one arm at a time between pads carefully.",
      "Standard lower turnaround gap is 6. Always evaluate ROM individually for safety."
    ],
    executionCues: [
      "Posture: Establish Posterior Pelvic Tilt (PPT) to contract abdomen and create a rounded back posture.",
      "Avoid chest-up, arched-back posture. Avoid pushing down with hands.",
      "HANDOFF: Trainer pulls arm over client. Grab far from axis. Cue: 'driving back through elbow, tighten abdomen, that... is... yours'.",
      "Delay handoff until control established. ECCENTRIC: cue 'slowly allow movement arm to rise'. Ribcage naturally rises (anterior pelvic tilt).",
      "LOWER TURN: 'continuously'/'seamlessly' reverse direction by tightening abdomen and driving through elbows.",
      "CONCENTRIC/UPPER TURN: 'Draw elbows down into the ribs'. Abdomen tightens, drawing ribcage down (PPT).",
      "Upper turn occurs when elbows fully drawn into sides. Do not push arm further just to lift stack.",
      "Click ONLY after observing full ROM and control in contracted position.",
      "Posture changes during lift: ribcage rises during eccentric, lowers during concentric."
    ],
    clinicalWarnings: [
      "Most clients will instinctively sit chest-up/arched-back or push with hands. Correct to PPT and elbow pressure.",
      "Standard gap of 6 is conservative; evaluate for each machine/person to avoid exceeding shoulder mobility.",
      "May use a selector pin near upper turn to provide an end stop if resting in contracted position.",
      "Can be performed isometrically (Static Hold/TSC) for safety or instructional purposes.",
      "Extremely demanding exercise. Avoid intolerable discomfort from prolonged sets with light weight. Progress intensity once control demonstrated."
    ]
  },
  "simple_row": {
    id: "simple_row",
    name: "Simple Row",
    kinematicClassification: "Simple Pull",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: false,
    sequencingContraindications: ["Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation."],
    category: "Upper Body - Pull",
    baseMale: 60,
    baseFemale: 40,
    setup: "Upper arm slopes down slightly. Chest pad ensures arm pads remain flush.",
    execution: "Drive out through elbows, draw shoulder blades together. Squeeze 2-3s.",
    target: "Posterior Deltoid, Rhomboids, Trapezius",
    targetMuscles: [
      "Posterior Deltoid (Rear Delt) – Shoulder horizontal abduction",
      "Rhomboids (Upper Back) – Scapular retraction/adduction and downward rotation",
      "Trapezius (Upper Back) – Scapular retraction/adduction and downward rotation"
    ],
    synergists: [
      "Infraspinatus (Rotator Cuff) – Shoulder horizontal abduction",
      "Erector Spinae (Spinal Erectors) – Stabilizers, spinal extension/anterior pelvic tilt (chest-up posture)"
    ],
    setupCues: [
      "Determine seat height based on subject height: taller = lower seat, shorter = higher seat.",
      "Fine-tune seat so upper arm slopes down slightly (shoulder higher than elbow).",
      "Head should be near the overhead padded 'work box' when seated.",
      "Practical alignment takes priority: elbow lands in at least middle of arm pads, pads flush through movement.",
      "Adjust chest pad based on interplay of arm length and torso size.",
      "Adjust vertical handle height for longer arms to align elbows with center of pads.",
      "May require gap for wider frames. If external rotation limited, 'cap' the handle ends."
    ],
    executionCues: [
      "Posture: Chest up, hips close to chest pad so abdomen is against the pad. Feet on floor/toe.",
      "Abdomen contacts chest pad to lift ribcage, facilitating thoracic extension + scapular retraction.",
      "LOAD UP: From lower turn, establish breathing, gradually apply pressure driving out through elbows.",
      "CONCENTRIC/UPPER TURN: Lift chest and draw shoulder blades together until full contraction.",
      "Hold contracted position (1 sec pause on first two reps, 2-3 sec squeeze from third rep).",
      "Instructor clicks once desired duration reached. Cue 'ease out' immediately.",
      "LOWER TURN: 'Touch and go', 'be continuous', or 'seamlessly change directions'.",
      "Give actionable cues: 'Leveraging off abdomen, lift chest and draw shoulder blades together'.",
      "Only full ROM reps count. May continue beyond concentric failure if control remains."
    ],
    clinicalWarnings: [
      "Point out overhead padded mechanism on entry/exit ('watch your head').",
      "Expect client ROM variability; assess during first 2-3 reps.",
      "Encourage full scapular retraction; avoid leaning back to move the movement arms.",
      "Suitable for clients with hand/wrist/elbow limitations. Complements pulldown.",
      "For shoulder concerns, may use TSC (Timed Static Contraction) against an immovable load (pinned stack).",
      "Avoid discomfort from excessively high reps in early stages; progress intensity (≤10 reps) when able."
    ]
  },
  "biceps_curl": {
    id: "biceps_curl",
    name: "Biceps Curl",
    kinematicClassification: "Simple Pull",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: false,
    sequencingContraindications: ["Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation."],
    category: "Upper Body - Pull",
    baseMale: 40,
    baseFemale: 20,
    setup: "Elbows aligned with pivot. Upper arms flush on pad. Use gap 1-2 initially.",
    execution: "Start from lower turn (instructor lifts). Flex elbows tightly. 1-3s pause.",
    target: "Biceps Brachii",
    targetMuscles: [
      "Biceps Brachii (Biceps) – Elbow flexion"
    ],
    synergists: [
      "Wrist Flexors (Forearms) – Wrist stabilizer"
    ],
    setupCues: [
      "Seat height is the primary consideration. Taller = lower seat, shorter = higher seat.",
      "Proper seat height allows full contact of upper arm with pad while chest remains upright.",
      "Too high = upper arm hovers, too low = elbow doesn't contact (discomfort in triceps).",
      "Align machine's axis with elbow joint as closely as possible.",
      "Elbow crease should point toward the ceiling (slight external rotation of humeri).",
      "Gap (usually 1-2) is required initially to ensure safety at full extension."
    ],
    executionCues: [
      "Posture: Chest-up, leaning into chest pad. Feet flat on floor or toes if shorter.",
      "Grasp handles palms up, equidistant. Instructor removes slack; states 'exercise will begin from this position'.",
      "LOAD UP: Gradually apply pressure: elbows down into pad and upward pull on handles. Keep wrists flat.",
      "CONCENTRIC/UPPER TURN: Flex elbows tightly to max contraction. Avoid over-pulling or flexing wrists.",
      "Pause in contracted position: 1-2s for first two reps, 2-3s from rep 3 onward.",
      "Instructor clicks ONLY after confirming full contraction and pause. 'Ease out' immediately.",
      "LOWER TURN: 'Touch and go' / continuous. Monitor closely for control at full extension.",
      "Maintain chest up and elbows leveraged firmly into pad. No shrugging.",
      "End set at true concentric failure (record full reps)."
    ],
    clinicalWarnings: [
      "Biceps curl carries higher risk due to loading at full extension; use gap 1-2 to reduce risk.",
      "Most common compensations: lifting elbows off pad, flexing wrists, exaggerated shrugging. Must correct.",
      "Client might mistakenly wait for click to initiate pause; instructor must control timing.",
      "Isometric versions (Static Hold/TSC) appropriate for tennis/golfer's elbow or inability to lift minimum 20 lbs.",
      "Lighter weights/longer sets may lead to discomfort prior to stimulus. Progress to ≤10 reps/set when ready."
    ]
  },
  // Trunk/Spine/Core
  "lumbar_extension": {
    id: "lumbar_extension",
    name: "Lumbar Extension",
    kinematicClassification: "Simple Pull",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: false,
    setupGap: "Gap 4-6",
    sequencingContraindications: ["Do not pair immediately before Leg Press or Leg Curl (lumbar pump exacerbation).","Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation."],
    category: "Trunk/Spine/Core",
    baseMale: 40,
    baseFemale: 30,
    setup: "Align iliac crest with roller. Footplate so knees > hips.",
    execution: "Never to failure! Smooth extension. Pause 1-3s at upper turn.",
    target: "Erector Spinae, Multifidus, Quadratus Lumborum",
    targetMuscles: [
      "Erector Spinae (Spinal Erectors/Spinal Extensors) – Spinal Extension/Anterior Pelvic Tilt",
      "Multifidus – Spinal Extension/Spinal Stability",
      "Quadratus Lumborum (QL’s) – Spinal Extension/Anterior Pelvic Tilt"
    ],
    synergists: [
      "Gluteus Maximus (Rear end/buttocks) – Stabilizer",
      "Latissimus Dorsi (Lats) – Spinal Extension",
      "Trapezius (Upper Back) – Stabilizer, Scapular Retraction/Adduction and Downward Rotation"
    ],
    setupCues: [
      "If accessory weight stack used, set it prior to sitting.",
      "Move carriage all the way back, place pin in main stack to lock movement arm.",
      "Practical Alignment: back pad lands on majority of shoulder blade area.",
      "Theoretical Alignment: align iliac crest with top of roller pad.",
      "Monitor top-heaviness (shoulder blades above back pad = seat might be too high).",
      "Raise femur restraint to clear space for footplate adjustment.",
      "Position footplate so knee joint is slightly higher than hip joint (downward femur slope).",
      "Fasten seatbelt across hip crease AFTER feet are up.",
      "Femur restraint: pads straddle patella evenly (upper on femur, lower on tibia). Hugs knee angle.",
      "Determine lower turnaround conservatively. Most benefits are from extension; avoid deep flexion.",
      "Recheck and tighten femur pads after setting lower turn."
    ],
    executionCues: [
      "Posture: 'Chin tucked, chest up, establish breathing, gradually build pressure into back pad by lifting ribcage'.",
      "Prevent lifting head and holding breath. Check for overly emphasized leg drive.",
      "CONCENTRIC: 'Chest up, back arched' or 'Lift your chest and arch your back'.",
      "UPPER TURN: Watch stopper abutt frame. Pause 1-2s (or 2-3s squeeze from rep 3).",
      "Provide actionable cues for squeeze: 'Keep arching, keep breathing... ease out'.",
      "Instructor clicks at end of squeeze. 'Ease out, and do not speed up'.",
      "LOWER TURN: 'Touch and go', 'barely touch, barely start'. Cue before the turnaround.",
      "Maintain consistent and controlled pace. Client increases effort across set."
    ],
    clinicalWarnings: [
      "NEVER take lumbar extension to failure. Stop when demanding but still fully controlled.",
      "Avoid lumbar extension altogether for known orthopedic issues unless medically cleared.",
      "Consider Timed Static Contraction (TSC) pinned just beyond midpoint for safety/rehab.",
      "If client reports roller pad discomfort: check belt/waistline interference, lower footplate to decrease hip backward force, or tweak seat height."
    ]
  },
  "abdominals": {
    id: "abdominals",
    name: "Abdominals",
    kinematicClassification: "Simple Push",
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
    requiresHandoff: true,
    category: "Trunk/Spine/Core",
    baseMale: 50,
    baseFemale: 30,
    setup: "Align iliac crest with roller. Femur pad straddles knees. Pad in armpits.",
    execution: "Start at contracted position. Uncurl spine to lower. Curl down ribcage to pelvis.",
    target: "Rectus Abdominis",
    targetMuscles: [
      "Rectus Abdominis (Abs) – Spinal Flexion/Posterior Pelvic Tilt"
    ],
    synergists: [
      "External Obliques – Spinal Flexion",
      "Transverse Abdominis – Hollowing (supports abdominal wall)",
      "Pelvic Floor (in coordination with TA) – Pelvis stabilization",
      "Rectus Femoris (Rec Fem) – Hip Flexion",
      "Psoas – Hip Flexion"
    ],
    setupCues: [
      "Set weight stack prior; standard gap of 6 is typical.",
      "Ensure movement arm (roller pad) is upright and locked; it will fall forward if not secured.",
      "Instructor must control movement arm throughout set, especially during entry/exit.",
      "Determine seat height: align iliac crest with top of roller pad at back of seat.",
      "Practical alignment: consider torso length and hip girdle size to avoid being too top-heavy.",
      "Move femur restraint away to allow entry. Hold movement arm securely in rear.",
      "Set foot placement on fixed footplate to approximate knee angle with femur restraint.",
      "Femur restraint should straddle knee caps evenly, resting snugly above and below knee.",
      "Unlock movement arm and lower into position. Pad should rest in armpits or close.",
      "Client brings elbows together, hands in front of head in 'prayer' position."
    ],
    executionCues: [
      "Start at upper turnaround (contracted position). Instructor assists arm/client down to this point.",
      "Interpersonal transfer: client increases effort while instructor gradually releases.",
      "Instructor cues 'thaaat...iiisss...yyyours' when transfer is complete.",
      "ECCENTRIC: 'Slowly uncurl your spine from the bottom up as you lower the weight'.",
      "Cue prior to lower turn: 'uncurl far enough to barely touch before curling back down'.",
      "LOWER TURN: 'Immediately' or 'seamlessly' change directions (prompt, not sudden).",
      "CONCENTRIC: 'Curl back down one vertebrae at a time' or 'Draw ribcage down to pelvis'.",
      "UPPER TURN: Ends when abdomen fully contracted, not necessarily when arm hits legs.",
      "Pause 1-2s for first two reps, 2-3s squeeze from rep 3 onward.",
      "Provide actionable cues for squeeze: 'keep rounding, keep breathing... ease out'."
    ],
    clinicalWarnings: [
      "Review consultation for tolerance to trunk flexion. Omit for orthopedic restrictions until cleared.",
      "Conservative start: Timed Static Contraction (TSC) pinned near midpoint (50/75/100% x 30s each).",
      "If TSC not feasible, consider substituting with Torso Rotation to avoid trunk flexion.",
      "Resistance profile is heavier at lower turn, lighter at top. Clients may rest at top.",
      "May use selector pin in upper stack hole to truncate end range if client rests in contracted position (document this)."
    ]
  },
  "torso_rotation": {
    id: "torso_rotation",
    name: "Torso Rotation",
    kinematicClassification: "Simple Rotary",
    executionPosture: "Posterior Pelvic Tilt / Contracted Abdomen",
    requiresHandoff: false,
    category: "Trunk/Spine/Core",
    baseMale: 40,
    baseFemale: 30,
    setup: "Seat at 1/5 or 2/4. Adjust leg/arm pads. Knees abducted, feet flat.",
    execution: "Posterior pelvic tilt. Draw roller in, then rotate. Pause 1-3s.",
    target: "External/Internal Obliques",
    targetMuscles: [
      "External Obliques – spinal rotation",
      "Internal Obliques – spinal rotation"
    ],
    synergists: [
      "Rotatores – spinal rotation",
      "Hip Abductors – stabilize via hip horizontal abduction",
      "Rectus Abdominis – spinal flexion / posterior pelvic tilt support"
    ],
    setupCues: [
      "Seat settings: 1 & 5 = largest rotation, 2 & 4 = reduced rotation, 3 = neutral.",
      "Ensure seat is fully locked into stopper.",
      "Leg Pads: Thin = standard, Thick = smaller clients or to increase stretch.",
      "Arm Pads: Position 1 (lowest/closest) is optimal for most. Position 4 for taller clients.",
      "Warn client: 'Watch your head' (overhead workbox).",
      "Pelvis fully back into seat and hip pads. Use seat belt if pelvis isn't stable.",
      "Knees abducted into pads, feet flat under knees (use blocks if shorter).",
      "Arms wrap over pads, forearms along pad, hands 'cap' ends.",
      "Posterior pelvic tilt ('tightened down'). Mid-back stays in contact with pad (rounded spine)."
    ],
    executionCues: [
      "LOAD-UP: 'Tighten/crunch down'. Maintain mid-back contact.",
      "Sequence: 1. Draw far-side roller into body. 2. Then rotate ribcage.",
      "CONCENTRIC: Maintain posterior pelvic tilt. Compact movement = more tension.",
      "Stop when obliques fully tightened. Do not 'chase ROM' or reach with arms.",
      "Monitor: Hips stay back, knees don't slide. Head follows torso or stays neutral.",
      "UPPER TURN: Brief pause every rep. Rep 3+: 2-3s squeeze. 'Keep tight... ease out'.",
      "ECCENTRIC: Lower body completely still. Rotate only through ribcage.",
      "LOWER TURN: 'Only go far enough for weights to barely touch', then immediate/smooth direction change."
    ],
    clinicalWarnings: [
      "Osteoporosis/Osteopenia: No dynamic rotation! Use Static Hold (SH) only if medically cleared.",
      "STATIC HOLD (SH): Seat at 2 or 4. Carriage square. Zero movement. Hold 20-60s.",
      "Avoid training to failure on the first side so client can match reps on the second side.",
      "Aim for 4-7 reps per side. The goal is mechanical tension, not maximal rotation."
    ]
  },
  "cervical_extension": {
    id: "cervical_extension",
    name: "Cervical Extension",
    kinematicClassification: "Simple Pull",
    executionPosture: "Chest Up / Anterior Pelvic Tilt",
    requiresHandoff: true,
    sequencingContraindications: ["Avoid back-to-back pulling exercises to prevent localized forearm/biceps fatigue limiting torso stimulation."],
    category: "Trunk/Spine/Core",
    baseMale: 30,
    baseFemale: 20,
    setup: "Seat height aligns C3-C5 with axis. Head sits flush in pad recess.",
    execution: "Arc the head (rotary movement). Follow it back and down.",
    target: "Neck Extensors (Trapezius, Semispinalis, Splenius, Longissimus)",
    targetMuscles: [
      "Trapezius (Upper Back/Neck Extensors)",
      "Semispinalis Muscle Group",
      "Splenius Capitis",
      "Longissimus Muscle Group"
    ],
    synergists: [
      "Erector Spinae – Spinal Extension / Anterior Pelvic Tilt",
      "Multifidus – Spinal Stability",
      "Quadratus Lumborum (QL) – Spinal Extension / Anterior Pelvic Tilt"
    ],
    setupCues: [
      "Seat Height: Adjust based on height, aligns axis with C3-C5.",
      "Seat Depth: Sit mid-seat. Adjust to allow perfect horizontal alignment.",
      "Pull movement arm (head pad) back before client sits.",
      "Back Pad: Light contact with mid-back, do not push them forward.",
      "PRACTICAL ALIGNMENT: Back of head MUST sit flush/securely in head pad recess.",
      "If pad rides up, seat is too low. If pad misses base of skull, seat is too high.",
      "Reposition unloaded if they shift during execution. No gap required.",
      "Instructor must control movement arm at all times during setup.",
      "Client: Upright posture, chest up, slight chin elevation. Feet flat, hands on front handles."
    ],
    executionCues: [
      "Instructor assesses alignment from the side. Hand off load only if zero movement.",
      "ECCENTRIC: 'Let the head come forward... maintain flush contact with the pad'.",
      "Ribcage may drop slightly to maintain smooth contact. Go as far as comfortable.",
      "Seamless change of direction at bottom. 'Keep head in path of machine'.",
      "CONCENTRIC: 'Lift your head/chin while arching your back and lifting your chest'.",
      "Encourage full extension (cervical, thoracic, lumbar). 'Draw a rainbow with top of head'.",
      "UPPER TURN: Pause ONLY after maximal safe extension is achieved.",
      "Trainer clicks ONLY after movement stops and full contraction is reached.",
      "DO NOT cue client to wait for the click to stop."
    ],
    clinicalWarnings: [
      "NEVER train to failure. Stop set prior to technical failure. Progress conservatively.",
      "Cervical spine is less conditioned to external load; injury risk is higher.",
      "Do NOT let client push straight back or slide on pad. Emphasize rotary movement.",
      "Ideal rep range: ≤8 reps, especially early in training.",
      "Static Hold (SH) / TSC is a safe alternative: position just beyond neutral (chin up), push back and down. Zero movement.",
      "Instructor MUST perfect interpersonal handoff technique."
    ]
  }
};

export const MACHINE_LIST = Object.values(MACHINE_DATABASE);

export type Gender = 'Male' | 'Female' | 'Other';
export type SkillLevel = 'Novice' | 'Intermediate' | 'Advanced';

export function calculateStartingWeight(
  machineId: string,
  gender: Gender | string,
  age: number,
  skill: SkillLevel | string
): number {
  const machine = MACHINE_DATABASE[machineId];
  if (!machine) return 0;

  // Base weight
  const baseWeight = gender === 'Female' ? machine.baseFemale : machine.baseMale;

  // Age Multiplier
  let ageMultiplier = 1.0;
  if (age < 40) ageMultiplier = 1.2;
  else if (age >= 40 && age <= 60) ageMultiplier = 1.0;
  else if (age > 60) ageMultiplier = 0.8;

  // Skill Multiplier
  let skillMultiplier = 1.0;
  if (skill === 'Novice') skillMultiplier = 1.0;
  else if (skill === 'Intermediate') skillMultiplier = 1.15;
  else if (skill === 'Advanced') skillMultiplier = 1.3;

  const rawWeight = baseWeight * ageMultiplier * skillMultiplier;

  // Round to nearest even number
  return Math.round(rawWeight / 2) * 2;
}
