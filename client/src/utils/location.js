/**
 * Asks for the device's location (this shows the browser's permission prompt the first time).
 * Resolves { latitude, longitude }; rejects with a message the user can act on.
 * Country-level accuracy is all we need, so a coarse, cached fix is fine.
 */
export function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser can't share your location, which VibeLoop needs to set your country."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      (err) => {
        reject(new Error(err.code === err.PERMISSION_DENIED
          ? 'Location access is blocked. Allow location for this site in your browser settings, then try again.'
          : "We couldn't get your location. Check that location is turned on and try again."));
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }
    );
  });
}
