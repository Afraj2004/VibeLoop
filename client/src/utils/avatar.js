import { BACKEND_URL } from './api.js';

const AVATAR_SIZE = 256;

/**
 * Public URL of a user's profile photo, or null. Each upload gets a new random key.
 */
export function avatarUrl(user) {
  if (!user?.avatarKey) return null;
  return `${BACKEND_URL}/api/avatars/${user.avatarKey}`;
}

/**
 * Centre-crops an image file to a square and scales it to 256px, returning a JPEG data URL
 * small enough for the upload limit (typically 10-40 KB).
 */
export function resizeImage(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('Choose an image file'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      canvas.getContext('2d').drawImage(
        img,
        (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side,
        0, 0, AVATAR_SIZE, AVATAR_SIZE
      );
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image couldn't be read. Try a JPEG or PNG."));
    };
    img.src = url;
  });
}
