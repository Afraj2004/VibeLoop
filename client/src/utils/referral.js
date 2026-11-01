// Invite links look like https://<site>/?ref=CODE. The code is remembered on this device
// for a while, so it still counts if the friend signs up later.
const STORAGE_KEY = 'vibeloop_ref';
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_PATTERN = /^[2-9A-HJKMNP-Z]{8}$/;

/**
 * Saves a ?ref= code from the address bar (then tidies the URL). Call once on page load.
 */
export function captureInviteCode() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('ref')?.trim().toUpperCase();
    if (!code) return;
    if (CODE_PATTERN.test(code)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ code, at: Date.now() }));
    }
    url.searchParams.delete('ref');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  } catch {
    // Storage blocked: the invite just won't count
  }
}

/**
 * The saved invite code, or null (none, or older than KEEP_MS)
 */
export function getInviteCode() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && CODE_PATTERN.test(saved.code) && Date.now() - saved.at < KEEP_MS) return saved.code;
  } catch {
    // Ignore unreadable storage
  }
  return null;
}

export function clearInviteCode() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

export const inviteLink = (code) => `${window.location.origin}/?ref=${code}`;

export const SHARE_TEXT = 'Meet new people in instant 1-on-1 video chats on VibeLoop (18+). Join with my link and we both get free VIBE:';
