import { ClinicalSafetyFlag } from '../types';

export const CLINICAL_FLAGS_MATRIX: ClinicalSafetyFlag[] = [
  // 1. Cardiovascular & Cardiopulmonary Flags
  {
    id: "cv-hypertension",
    category: "Cardiovascular & Cardiopulmonary",
    conditionName: "Uncontrolled Hypertension (Resting BP > 180/100 mmHg)",
    severity: "Absolute Contraindication",
    protocolHandling: [
      {
        instruction: "This is an absolute contraindication until medically managed. Once managed, trainers must strictly monitor breathing pace to ensure the client never holds their breath (Valsalva maneuver), which causes dangerous blood pressure spikes.",
        affectedMachineIds: []
      }
    ]
  },
  {
    id: "cv-aortic-aneurysm",
    category: "Cardiovascular & Cardiopulmonary",
    conditionName: "Aortic Aneurysm (Abdominal or Thoracic)",
    severity: "High Risk",
    protocolHandling: [
      {
        instruction: "Clients with aneurysms are at risk of rupture during heavy exertion. Trainers must ensure systolic blood pressure stays below 160-180 mmHg. The load intensity must be kept below 40-50% of their 1-rep maximum, and the Valsalva maneuver must be strictly avoided.",
        affectedMachineIds: []
      }
    ]
  },
  {
    id: "cv-recent-cardiac",
    category: "Cardiovascular & Cardiopulmonary",
    conditionName: "Recent Cardiac Event (MI, Stent, or Bypass within 4 weeks)",
    severity: "Absolute Contraindication",
    protocolHandling: [
      {
        instruction: "Absolute contraindication without direct, written physician clearance.",
        affectedMachineIds: []
      }
    ]
  },
  {
    id: "cv-pacemaker",
    category: "Cardiovascular & Cardiopulmonary",
    conditionName: "Pacemaker / Implantable Cardioverter-Defibrillator (ICD)",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Heart rate must be monitored continuously to ensure it stays strictly below the device's firing threshold.",
        affectedMachineIds: []
      }
    ]
  },
  {
    id: "cv-glaucoma",
    category: "Cardiovascular & Cardiopulmonary",
    conditionName: "Glaucoma",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Heavy straining and breath-holding spike intraocular pressure. Trainers must enforce continuous, rhythmic breathing and avoid exercises that place the head in a heavily declined position.",
        affectedMachineIds: []
      }
    ]
  },
  // 2. Bone Density & Aging Flags
  {
    id: "bone-osteoporosis",
    category: "Bone Density & Aging",
    conditionName: "Osteoporosis / Severe Osteopenia",
    severity: "High Risk",
    protocolHandling: [
      {
        instruction: "Clients with high fracture risk must strictly avoid trunk flexion and powerful twisting movements, as these heavily increase the risk of spinal compression fractures. Focus should be shifted to trunk extension and lower-body weight-bearing exercises to stimulate bone density.",
        affectedMachineIds: ["abdominals", "torso_rotation", "lumbar_extension", "leg_press"]
      }
    ]
  },
  {
    id: "bone-frailty",
    category: "Bone Density & Aging",
    conditionName: "High Fall Risk / Frailty",
    severity: "High Risk",
    protocolHandling: [
      {
        instruction: "Prioritize the Hip Abduction, Hip Adduction, and Leg Press to build pelvic stability and leg strength. Ensure all seat belts are utilized on machines like the Leg Curl and Abduction/Adduction to provide rigid external stability and prevent sliding.",
        affectedMachineIds: ["abduction", "adduction", "leg_press", "leg_curl"]
      }
    ]
  },
  // 3. Spinal & Cervical Flags
  {
    id: "spine-spondylolisthesis",
    category: "Spinal & Cervical",
    conditionName: "Spondylolisthesis (Grade 2 or higher)",
    severity: "Absolute Contraindication", // Changed to absolute per text "Absolute Contraindication for Specific Machines"
    protocolHandling: [
      {
        instruction: "This is a direct contraindication for full-range, heavy loading on the Lumbar Extension machine. Excessive spinal extension can exacerbate the slippage of the vertebra.",
        affectedMachineIds: ["lumbar_extension"]
      }
    ]
  },
  {
    id: "spine-deformity",
    category: "Spinal & Cervical",
    conditionName: "Adult Spinal Deformity (Scoliosis / Hyper-Kyphosis)",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "These conditions create asymmetrical loading on the spinal discs and facet joints. Trainers must be hyper-vigilant regarding back pad placement and avoid forcing the client into a \"neutral\" posture that their spine can no longer physically achieve.",
        affectedMachineIds: []
      }
    ]
  },
  {
    id: "spine-ddd",
    category: "Spinal & Cervical",
    conditionName: "Degenerative Disc Disease / Spinal Stenosis / Sciatica",
    severity: "High Risk",
    protocolHandling: [
      {
        instruction: "The Lumbar Extension machine must be introduced with extreme caution. Start with a large gap setting (Gap 4 to 6) to limit the range of motion, and use an extremely light diagnostic load (e.g., 20 lbs for 3 reps) to test tolerance before proceeding.",
        affectedMachineIds: ["lumbar_extension"],
        setupModification: "Gap 4-6. Diagnostic load: 20 lbs / 3 reps."
      }
    ]
  },
  {
    id: "spine-cervical",
    category: "Spinal & Cervical",
    conditionName: "Cervical Pathology (Neck Pain / Forward Head Posture)",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Very common in desk-bound executives and dentists. The Cervical Extension machine must utilize an intrapersonal load transfer (the trainer physically hands off and receives the weight stack). Do not train the neck to concentric failure; terminate the set with a 2-3 second static hold instead.",
        affectedMachineIds: ["cervical_extension"]
      }
    ]
  },
  // 4. Joint Replacements
  {
    id: "joint-tha",
    category: "Joint Replacements",
    conditionName: "Total Hip Replacement (THA)",
    severity: "High Risk",
    protocolHandling: [
      {
        instruction: "Restoring the strength of the hip abductors is critical post-surgery to prevent dislocation and stabilize gait. When setting up the Hip Abduction machine, bypass the standard \"no gap\" flush setup and manually set a wider starting position to accommodate the client's restricted postoperative range of motion.",
        affectedMachineIds: ["abduction"]
      }
    ]
  },
  {
    id: "joint-tka",
    category: "Joint Replacements",
    conditionName: "Total Knee Replacement (TKA)",
    severity: "High Risk",
    protocolHandling: [
      {
        instruction: "Avoid deep knee flexion (squatting motions) and high-impact loading. On the Leg Press, ensure the footplate is set so the knee does not bend past 90 degrees at the bottom turn, and strictly utilize the mechanical stops to prevent hyperextension at the top.",
        affectedMachineIds: ["leg_press"]
      }
    ]
  },
  // 5. Neurological & Movement
  {
    id: "neuro-parkinsons",
    category: "Neurological & Movement",
    conditionName: "Parkinson's Disease / Multiple Sclerosis / Stroke (Hemiparesis)",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "These clients suffer from altered motor unit recruitment, rigidity, and rapid fatigue. Trainers must closely monitor facial expressions for distress and watch for signs of excessive localized fatigue. Focus heavily on bilateral machine exercises where the equipment guides the path of motion, removing the balance and coordination requirements of free weights.",
        affectedMachineIds: []
      }
    ]
  },
  {
    id: "neuro-neuropathy",
    category: "Neurological & Movement",
    conditionName: "Peripheral Neuropathy",
    severity: "High Risk",
    protocolHandling: [
      {
        instruction: "Diminished sensation in the hands or feet means the client may not realize their foot is slipping off the Leg Press plate or their grip is failing on a Pulldown. Trainers must visually verify hand and foot placement throughout the entire set.",
        affectedMachineIds: ["leg_press", "pulldown"]
      }
    ]
  },
  // 6. Soft Tissue & Inflammation
  {
    id: "soft-ra",
    category: "Soft Tissue & Inflammation",
    conditionName: "Rheumatoid Arthritis (RA) / Inflammatory Flare-ups",
    severity: "High Risk",
    protocolHandling: [
      {
        instruction: "If a client is experiencing a severe flare-up characterized by morning stiffness lasting longer than 1 hour or joint pain that is worse with rest, heavy resistance training on the affected joints should be paused until the inflammation subsides.",
        affectedMachineIds: []
      }
    ]
  },
  {
    id: "soft-tendonitis",
    category: "Soft Tissue & Inflammation",
    conditionName: "Upper Extremity Tendonitis / Bursitis / Carpal Tunnel",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "If gripping handles causes severe elbow or wrist pain, trainers should implement a \"hands-free\" upper body protocol. This involves using hand/forearm pads to push against the movement arms of the Lateral Raise, Simple Row, Pullover, and Chest Flye machines, completely removing the hands and wrists from the equation.",
        affectedMachineIds: ["lateral_raise", "simple_row", "pullover", "chest_flye"]
      }
    ]
  },
  {
    id: "soft-rotator",
    category: "Soft Tissue & Inflammation",
    conditionName: "Rotator Cuff Tears / Impingement",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Heavy vertical pushing (Overhead Press) is generally contraindicated. The protocol should over-index on scapular retraction and posterior shoulder strength using the Simple Row and Pulldown to stabilize the joint.",
        affectedMachineIds: ["overhead_press", "simple_row", "pulldown"]
      }
    ]
  },
  // 7. Systemic & General
  {
    id: "sys-diabetes",
    category: "Systemic & General",
    conditionName: "Uncontrolled Diabetes",
    severity: "Absolute Contraindication",
    protocolHandling: [
      {
        instruction: "Absolute contraindication if blood glucose is below 4.0 mmol/L or above 15 mmol/L accompanied by weakness or ketosis.",
        affectedMachineIds: []
      }
    ]
  },
  {
    id: "sys-dvt",
    category: "Systemic & General",
    conditionName: "Deep Vein Thrombosis (DVT) / Recent Embolism",
    severity: "Absolute Contraindication",
    protocolHandling: [
      {
        instruction: "Absolute contraindication.",
        affectedMachineIds: []
      }
    ]
  },
  {
    id: "sys-hernia",
    category: "Systemic & General",
    conditionName: "Abdominal Hernia (Unrepaired)",
    severity: "High Risk",
    protocolHandling: [
      {
        instruction: "Avoid the Abdominal crunch machine, the Lumbar machine, and the Leg Press, as these require massive intra-abdominal pressure that can worsen the hernia.",
        affectedMachineIds: ["abdominals", "lumbar_extension", "leg_press"]
      }
    ]
  },

  // 8. Common constraints (client-profile audit, Sep 2026)
  //
  // The quick toggles on the Body section: broad limitations a coach hears
  // every week, as opposed to the diagnoses above. The instructions are
  // deliberately general studio cautions — which machines load the joint, and
  // "confirm pain-free range" — not treatment. A head trainer can refine them
  // here; every screen that reads the matrix picks the change up.
  {
    id: "gen-shoulder",
    category: "Common constraints",
    conditionName: "Shoulder limitation",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Confirm a pain-free range before loading. If the shoulder is aggravated, shorten the range, reduce the load, or swap the machine — and note what worked.",
        affectedMachineIds: ["overhead_press", "lateral_raise", "chest_press", "chest_flye", "pullover", "pulldown", "seated_dip", "compound_row"]
      }
    ]
  },
  {
    id: "gen-knee",
    category: "Common constraints",
    conditionName: "Knee limitation",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Confirm a pain-free range before loading. Watch the depth at the start of the movement and adjust the seat or range if the knee complains.",
        affectedMachineIds: ["leg_press", "leg_extension", "leg_curl"]
      }
    ]
  },
  {
    id: "gen-low-back",
    category: "Common constraints",
    conditionName: "Lower back limitation",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Check posture and pad contact before every set; start conservative on range and load and build only while it stays pain-free.",
        affectedMachineIds: ["lumbar_extension", "leg_press", "abdominals", "torso_rotation"]
      }
    ]
  },
  {
    id: "gen-hip",
    category: "Common constraints",
    conditionName: "Hip limitation",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Confirm a comfortable range at the hip before loading; reduce the range if it pinches.",
        affectedMachineIds: ["abduction", "adduction", "leg_press"]
      }
    ]
  },
  {
    id: "gen-neck",
    category: "Common constraints",
    conditionName: "Neck limitation",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Keep the head neutral and the load light until the neck is confirmed comfortable through the full range.",
        affectedMachineIds: ["cervical_extension", "4_way_neck", "overhead_press"]
      }
    ]
  },
  {
    id: "gen-elbow-wrist",
    category: "Common constraints",
    conditionName: "Elbow / wrist / hand limitation",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Check the grip and handle position first; a different grip or a pad can make the set comfortable.",
        affectedMachineIds: ["biceps_curl", "triceps_extension", "seated_dip", "compound_row", "simple_row", "pulldown", "chest_press"]
      }
    ]
  },
  {
    id: "gen-blood-pressure",
    category: "Common constraints",
    conditionName: "High blood pressure — managed",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Keep the breathing continuous on every set — no breath-holding under load.",
        affectedMachineIds: []
      }
    ]
  },
  {
    id: "gen-balance",
    category: "Common constraints",
    conditionName: "Balance / steadiness concern",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Be at arm's reach for every entry and exit.",
        affectedMachineIds: []
      }
    ]
  },
  {
    id: "gen-recent-surgery",
    category: "Common constraints",
    conditionName: "Recent surgery — cleared to train",
    severity: "Moderate / Needs Modification",
    protocolHandling: [
      {
        instruction: "Confirm the clearance and any limits the surgeon set before loading, and write them in the medical history.",
        affectedMachineIds: []
      }
    ]
  }
];
