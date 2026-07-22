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

// Wait for device pairing status via SSE
export async function pollDevicePaired(code: string, _intervalMs = 3000, _timeoutMs = 15 * 60 * 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    const baseURL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:10000';
    const sseURL = `${baseURL}/api/player/pairing-sessions/${code}/stream`;
    
    const eventSource = new EventSource(sseURL);

    // Timeout fallback just in case the server doesn't close it
    const timeout = setTimeout(() => {
      eventSource.close();
      reject(new Error('Pairing timed out'));
    }, _timeoutMs);

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.token) {
          clearTimeout(timeout);
          eventSource.close();
          // Save token and initialize authenticated Supabase client
          localStorage.setItem('player_device_token', payload.token);
          initializeSupabase(payload.token);
          resolve(payload.token);
        } else if (payload.error) {
          clearTimeout(timeout);
          eventSource.close();
          reject(new Error(payload.error));
        }
      } catch (err) {
        console.error('Failed to parse SSE payload', err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('SSE connection error (retrying)...', err);
      // We do not reject here immediately, letting the browser auto-reconnect.
      // If the connection is fatal, EventSource.readyState will be CLOSED (2).
      if (eventSource.readyState === 2 /* CLOSED */) {
        clearTimeout(timeout);
        reject(new Error('SSE connection closed permanently'));
      }
    };
  });
}
