export type ActivityLevel = 'Highly Sedentary' | 'Sedentary' | 'Moderate / Mixed' | 'Active';

export interface OccupationalProfile {
  id: string;
  title: string;
  category: string;
  activityLevel: ActivityLevel;
  primaryErgonomicRisk: string;
}

export const OCCUPATIONS: OccupationalProfile[] = [
  // 1. Corporate, Legal & Finance
  { id: 'occ-exec', title: 'Executive / C-Suite', category: 'Corporate, Legal & Finance', activityLevel: 'Highly Sedentary', primaryErgonomicRisk: 'Chronic lumbar compression, high psychological stress' },
  { id: 'occ-lawyer', title: 'Attorney / Legal Professional', category: 'Corporate, Legal & Finance', activityLevel: 'Highly Sedentary', primaryErgonomicRisk: 'Prolonged seated posture, forward head translation' },
  { id: 'occ-finance', title: 'Finance / Accounting', category: 'Corporate, Legal & Finance', activityLevel: 'Highly Sedentary', primaryErgonomicRisk: 'Screen-bound cervical strain' },
  { id: 'occ-consultant', title: 'Management Consultant', category: 'Corporate, Legal & Finance', activityLevel: 'Sedentary', primaryErgonomicRisk: 'High travel volume, asymmetric carrying loads' },

  // 2. Healthcare & Medicine
  { id: 'occ-md', title: 'Physician / Surgeon', category: 'Healthcare & Medicine', activityLevel: 'Moderate / Mixed', primaryErgonomicRisk: 'Prolonged standing, severe asymmetrical leaning' },
  { id: 'occ-dentist', title: 'Dentist / Orthodontist', category: 'Healthcare & Medicine', activityLevel: 'Sedentary', primaryErgonomicRisk: 'Extreme cervical flexion, thoracic rotation and sustained isometric tension' },
  { id: 'occ-rn', title: 'Registered Nurse / Allied Health', category: 'Healthcare & Medicine', activityLevel: 'Active', primaryErgonomicRisk: 'High volume walking, unpredictable heavy lifting (patient transfer)' },
  { id: 'occ-clinic-admin', title: 'Clinic Administrator', category: 'Healthcare & Medicine', activityLevel: 'Sedentary', primaryErgonomicRisk: 'Standard desk-bound pelvic tilt' },

  // 3. Engineering, Tech & Science
  { id: 'occ-software', title: 'Software Developer / IT', category: 'Engineering, Tech & Science', activityLevel: 'Highly Sedentary', primaryErgonomicRisk: 'Severe forward head posture, shortened pectoral girdle' },
  { id: 'occ-aero-eng', title: 'Aerospace / Mechanical Engineer', category: 'Engineering, Tech & Science', activityLevel: 'Sedentary', primaryErgonomicRisk: 'Mixed desk and lab bench posture' },
  { id: 'occ-scientist', title: 'Bioscience / Research Scientist', category: 'Engineering, Tech & Science', activityLevel: 'Moderate / Mixed', primaryErgonomicRisk: 'Prolonged microscopic/bench work, cervical strain' },

  // 4. Real Estate & Sales
  { id: 'occ-re-broker', title: 'Real Estate Broker / Agent', category: 'Real Estate & Sales', activityLevel: 'Moderate / Mixed', primaryErgonomicRisk: 'Frequent transitions, standing' },
  { id: 'occ-outside-sales', title: 'Outside / Regional Sales', category: 'Real Estate & Sales', activityLevel: 'Sedentary', primaryErgonomicRisk: 'High-frequency driving, unilateral pedal operation, lumbar stiffness' },

  // 5. Manufacturing & Operations
  { id: 'occ-ops-manager', title: 'Plant / Operations Manager', category: 'Manufacturing & Operations', activityLevel: 'Moderate / Mixed', primaryErgonomicRisk: 'Concrete floor walking mixed with desk administration' },
  { id: 'occ-logistics', title: 'Logistics Director', category: 'Manufacturing & Operations', activityLevel: 'Sedentary', primaryErgonomicRisk: 'High-stress desk-bound operations' },

  // 6. Education & Public Service
  { id: 'occ-uni-faculty', title: 'University Faculty / Administrator', category: 'Education & Public Service', activityLevel: 'Sedentary', primaryErgonomicRisk: 'Prolonged seated reading/grading' },
  { id: 'occ-teacher', title: 'Teacher / Educator', category: 'Education & Public Service', activityLevel: 'Active', primaryErgonomicRisk: 'Prolonged standing, bending' },

  // 7. Lifestyle & Retirement
  { id: 'occ-retired-active', title: 'Retired (Active Lifestyle)', category: 'Lifestyle & Retirement', activityLevel: 'Active', primaryErgonomicRisk: 'Variable recreation (golf, tennis) requiring rotational mobility' },
  { id: 'occ-retired-sedentary', title: 'Retired (Sedentary Lifestyle)', category: 'Lifestyle & Retirement', activityLevel: 'Highly Sedentary', primaryErgonomicRisk: 'Sarcopenia, general deconditioning, joint stiffness' },
  { id: 'occ-sah-active', title: 'Stay at Home (Active)', category: 'Lifestyle & Retirement', activityLevel: 'Active', primaryErgonomicRisk: 'Child-rearing lifting mechanics, floor-to-stand transitions' },
  { id: 'occ-sah-sedentary', title: 'Stay at Home (Sedentary)', category: 'Lifestyle & Retirement', activityLevel: 'Sedentary', primaryErgonomicRisk: 'General deconditioning' }
];

export function getErgonomicRisk(occupationIdOrTitle: string): string | null {
  const occ = OCCUPATIONS.find(o => o.id === occupationIdOrTitle || o.title === occupationIdOrTitle);
  return occ ? occ.primaryErgonomicRisk : null;
}

