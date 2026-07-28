import { initializeSupabase } from './supabaseClient';
import { axiosInstance } from './axiosInstance';

// Generate a unique 6-character alphanumeric code based on device properties
export async function generatePairingCode(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  // Generate random 6 characters (since the new flow doesn't require deterministic generation)
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Register a new device in NestJS
export async function registerDevice({ code, name }: { code: string; name: string }) {
  const response = await axiosInstance.post('/api/player/pairing-sessions', { code, name });
  return response.data;
}

export async function pollDevicePaired(code: string, intervalMs = 3000, timeoutMs = 15 * 60 * 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const interval = setInterval(async () => {
      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        reject(new Error('Pairing timed out'));
        return;
      }
      
      try {
        const res = await axiosInstance.get(`/api/player/pairing-sessions/${code}/status`);
        const payload = res.data;
        
        if (payload.status === 'paired' && payload.token) {
          clearInterval(interval);
          localStorage.setItem('player_device_token', payload.token);
          initializeSupabase(payload.token);
          resolve(payload.token);
        } else if (payload.error) {
          clearInterval(interval);
          reject(new Error(payload.error));
        }
      } catch (err: any) {
        console.warn('Polling error (retrying)...', err.message);
        // If it's a 400 Bad Request, the session probably expired
        if (err.response && err.response.status === 400) {
          clearInterval(interval);
          reject(new Error('Pairing session expired or invalid'));
        }
      }
    }, intervalMs);
  });
}
