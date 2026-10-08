export const BACKEND_URL = import.meta.env.VITE_SIGNALING_SERVER || 'https://vibeloop-1kps.onrender.com';

/**
 * JSON fetch wrapper for the VibeLoop REST API. Throws on HTTP or API-level failure.
 */
export async function apiFetch(path, { token, method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    const error = new Error(data.error || `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}
