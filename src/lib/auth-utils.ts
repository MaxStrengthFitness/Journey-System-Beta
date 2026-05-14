
/**
 * Simple SHA-256 hashing for PIN codes.
 * NOTE: For production, use a server-side hashing mechanism like bcrypt or argon2
 * with unique salts per user to prevent rainbow table attacks.
 */
export async function hashPin(pin: string): Promise<string> {
  if (!pin) return '';
  // Defensive TextEncoder check to avoid "Illegal constructor" in edge environments
  const encoder = (typeof TextEncoder !== 'undefined') 
    ? new TextEncoder() 
    : { encode: (s: string) => new Uint8Array(Array.from(s).map(c => c.charCodeAt(0))) };
  
  const msgUint8 = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Compares a raw PIN with a target (which could be plain text or a hash).
 * Supports legacy plain-text PINs for migration.
 */
export async function comparePin(rawPin: string, target: string): Promise<boolean> {
  if (!rawPin || !target) return false;
  
  // Try plain text match (legacy)
  if (rawPin === target) return true;
  
  // Try hash match
  const hashed = await hashPin(rawPin);
  return hashed === target;
}
