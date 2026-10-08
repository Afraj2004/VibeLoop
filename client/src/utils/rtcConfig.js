import { apiFetch } from './api.js';

const FALLBACK_RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

/**
 * Fetches dynamic STUN/TURN ICE server list from backend API with ephemeral credentials
 */
export async function getIceServerConfig(token) {
  try {
    const data = await apiFetch('/api/ice-servers', { token });
    if (Array.isArray(data.iceServers)) {
      return {
        iceServers: data.iceServers,
        iceCandidatePoolSize: 10
      };
    }
    return FALLBACK_RTC_CONFIG;
  } catch (error) {
    console.warn('[VibeLoop RTC] Using fallback STUN configuration:', error.message);
    return FALLBACK_RTC_CONFIG;
  }
}

export default FALLBACK_RTC_CONFIG;
