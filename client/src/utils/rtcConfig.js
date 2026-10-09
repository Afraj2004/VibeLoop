import { apiFetch } from './api.js';

const FALLBACK_RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

// TURN credentials last 1 hour server-side; refresh well before they expire
export const ICE_REFRESH_MS = 30 * 60 * 1000;

// Open the app with ?relay=1 to force every call through TURN (verifies the relay works)
const FORCE_RELAY = new URLSearchParams(window.location.search).get('relay') === '1';

/**
 * Fetches dynamic STUN/TURN ICE server list from backend API with ephemeral credentials
 */
export async function getIceServerConfig(token) {
  try {
    const data = await apiFetch('/api/ice-servers', { token });
    if (Array.isArray(data.iceServers)) {
      if (FORCE_RELAY && !data.turnProvider) {
        console.warn('[VibeLoop RTC] ?relay=1 set but the server has no TURN provider configured');
      }
      return {
        iceServers: data.iceServers,
        iceCandidatePoolSize: 10,
        ...(FORCE_RELAY && { iceTransportPolicy: 'relay' })
      };
    }
    return FALLBACK_RTC_CONFIG;
  } catch (error) {
    console.warn('[VibeLoop RTC] Using fallback STUN configuration:', error.message);
    return FALLBACK_RTC_CONFIG;
  }
}

export default FALLBACK_RTC_CONFIG;
