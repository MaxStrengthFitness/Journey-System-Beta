
export function getBroadMuscleGroup(region?: string, machineName?: string): "Lower Body" | "Upper Body" | "Core & Spine" | "Other" {
  const r = (region || "").toLowerCase();
  const n = (machineName || "").toLowerCase();
  
  if (
    r.includes("thigh") || 
    r.includes("hip") || 
    r.includes("crural") || 
    r.includes("pelvic girdle") || 
    r.includes("calf") ||
    r.includes("glute") ||
    n.includes("leg press") || 
    n.includes("calf") || 
    n.includes("hip") || 
    n.includes("thigh") ||
    n.includes("abduction") ||
    n.includes("adduction") ||
    n.includes("leg extension") ||
    n.includes("leg curl")
  ) {
    return "Lower Body";
  }
  
  if (
    r.includes("core") || 
    r.includes("spine") || 
    r.includes("neck") || 
    r.includes("cervical") || 
    r.includes("lumbar") || 
    r.includes("abdominal") ||
    n.includes("abs") || 
    n.includes("lumbar") || 
    n.includes("neck") || 
    n.includes("torso")
  ) {
    return "Core & Spine";
  }
  
  if (
    r.includes("shoulder") || 
    r.includes("dorsal") || 
    r.includes("thoracic") || 
    r.includes("chest") || 
    r.includes("brachial") || 
    r.includes("extremities") || 
    r.includes("arm") ||
    n.includes("press") || 
    n.includes("raise") || 
    n.includes("fly") || 
    n.includes("row") || 
    n.includes("pulldown") || 
    n.includes("pullover") || 
    n.includes("bicep") || 
    n.includes("tricep") || 
    n.includes("dip")
  ) {
    return "Upper Body";
  }

  return "Other";
}
