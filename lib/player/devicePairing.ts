import { ensureSupabase } from './supabaseClient';

// Generate a deterministic device fingerprint. Keep only relatively stable
// properties to avoid session-to-session variation (canvas and viewport
// rendering can differ between reloads and produce different fingerprints).
async function getDeviceFingerprint(): Promise<string> {
  const components: string[] = [];

  // Timezone (should be stable for the device)
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown');

  // Language
  components.push(navigator.language || 'unknown');

  // Hardware concurrency (CPU cores)
  components.push(String(navigator.hardwareConcurrency || 'unknown'));

  // Platform and user agent (broad stable indicators)
  components.push(navigator.platform || 'unknown');
  components.push(navigator.userAgent || 'unknown');

  // Device memory (if available)
  if ('deviceMemory' in navigator) {
    components.push(String((navigator as { deviceMemory?: number }).deviceMemory));
  }

  return components.join('|');
}

// Hash string to a number using simple hash function
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

// Generate a unique 6-character alphanumeric code based on device properties
// This code will be the same for the same device every time
export async function generatePairingCode(): Promise<string> {
  // If we already generated and stored a code for this browser, return it.
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const cached = localStorage.getItem('pairingCode');
      if (cached) return cached;
    }
  } catch {
    // localStorage may be unavailable or throw in some environments; ignore.
  }

  const fingerprint = await getDeviceFingerprint();
  const hash = hashString(fingerprint);

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  let hashValue = hash;

  for (let i = 0; i < 6; i++) {
    code += chars.charAt(hashValue % chars.length);
    hashValue = Math.floor(hashValue / chars.length);
  }

  // Persist the generated code so reloads return the same value for this
  // browser/profile. LocalStorage is per-origin and per-browser, which is
  // appropriate for ensuring the same browser instance keeps the same code.
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('pairingCode', code);
    }
  } catch {
    // ignore storage errors
  }

  return code;
}

// Register a new device in Supabase
type DeviceRegistration = {
  code: string;
  name: string;
};

export async function registerDevice({ code, name }: DeviceRegistration) {
  const supabase = ensureSupabase();
  const { data, error } = await supabase
    .from('devices')
    .insert([{ code, name, paired: false }]);
  if (error) throw new Error(error.message);
  return data;
}

// Poll for device pairing status
export async function pollDevicePaired(code: string, intervalMs = 3000, timeoutMs = 300000): Promise<boolean> {
  const supabase = ensureSupabase();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data, error } = await supabase
      .from('devices')
      .select('paired')
      .eq('code', code)
      .maybeSingle();
    console.log('[pollDevicePaired] Polled device:', { code, data, error });
    if (error) throw new Error(error.message);
    if (data && data.paired) return true;
    // If device not found or not paired, keep polling
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}
