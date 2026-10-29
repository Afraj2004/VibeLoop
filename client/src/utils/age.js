// Mirrors server/src/config/age.js
export const MIN_AGE = 18;
export const FILTER_MIN_AGE = MIN_AGE;
export const FILTER_MAX_AGE = 60; // means "60 and older"

/**
 * Whole years since a YYYY-MM-DD birth date (null if it isn't one)
 */
export function ageFrom(birthDate, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate || '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  let age = now.getFullYear() - year;
  if (now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day)) age -= 1;
  return age;
}

/**
 * "Any age", "25+", "18–30" or "60+"
 */
export function ageRangeLabel(minAge = FILTER_MIN_AGE, maxAge = FILTER_MAX_AGE) {
  if (minAge <= FILTER_MIN_AGE && maxAge >= FILTER_MAX_AGE) return 'Any age';
  if (maxAge >= FILTER_MAX_AGE) return `${minAge}+`;
  return `${minAge}–${maxAge}`;
}

/**
 * "12 April 1998"
 */
export function formatBirthDate(birthDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate || '');
  if (!match) return '';
  const [, year, month, day] = match.map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}
