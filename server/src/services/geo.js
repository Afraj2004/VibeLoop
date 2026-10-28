const { iso1A2Code } = require('@rapideditor/country-coder');

/**
 * ISO 3166-1 alpha-2 country for a browser geolocation fix, or null (ocean, invalid input).
 * Runs offline against bundled borders: coordinates never leave this server and are not stored.
 */
function countryFromLocation(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return iso1A2Code([longitude, latitude]) || null;
}

module.exports = { countryFromLocation };
