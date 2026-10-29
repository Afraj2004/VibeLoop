// Date of birth rules shared by sign-up, the one-time birth date prompt and matchmaking
const MIN_AGE = 18;
const OLDEST_BIRTH_YEAR = 1900;

// Age filter range; the top value means "this age or older"
const FILTER_MIN_AGE = MIN_AGE;
const FILTER_MAX_AGE = 60;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Whole years between a YYYY-MM-DD birth date and `now` (by the UTC calendar date)
 */
function ageOn(birthDate, now = new Date()) {
  const match = DATE_PATTERN.exec(birthDate || '');
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  let age = now.getUTCFullYear() - year;
  const beforeBirthday = now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Validates a submitted birth date. Returns { birthDate } or { error }.
 */
function checkBirthDate(value) {
  const match = DATE_PATTERN.exec(typeof value === 'string' ? value.trim() : '');
  if (!match) return { error: 'Enter your date of birth' };

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Rejects dates like 2001-02-30, which Date would roll over into March
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { error: 'Enter a real date of birth' };
  }
  if (year < OLDEST_BIRTH_YEAR || date > new Date()) {
    return { error: 'Enter a real date of birth' };
  }
  if (ageOn(match[0]) < MIN_AGE) {
    return { error: `VibeLoop is only for people ${MIN_AGE} and over.` };
  }
  return { birthDate: match[0] };
}

module.exports = { MIN_AGE, FILTER_MIN_AGE, FILTER_MAX_AGE, ageOn, checkBirthDate };
