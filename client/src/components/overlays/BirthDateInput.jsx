import React, { useEffect, useState } from 'react';
import { MIN_AGE } from '../../utils/age.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const THIS_YEAR = new Date().getFullYear();
// Newest year that can still be 18 today, back 100 years
const YEARS = Array.from({ length: 100 }, (_, i) => THIS_YEAR - MIN_AGE - i);

const daysIn = (year, month) => (year && month ? new Date(year, month, 0).getDate() : 31);
const pad = (n) => String(n).padStart(2, '0');

const SELECT_CLASS = 'w-full bg-[#08090D] border border-slate-800 focus:border-[#00F0FF] rounded-xl px-2.5 py-2.5 text-xs outline-none disabled:opacity-60';

/**
 * Day / month / year pickers (friendlier on phones than a calendar). Reports 'YYYY-MM-DD',
 * or '' until all three are chosen.
 */
export default function BirthDateInput({ value = '', onChange, disabled = false, id }) {
  const [parts, setParts] = useState(() => {
    const [year, month, day] = value ? value.split('-').map(Number) : [];
    return { day: day || '', month: month || '', year: year || '' };
  });

  // Follow a value supplied from outside (e.g. a guest's saved date)
  useEffect(() => {
    if (!value) return;
    const [year, month, day] = value.split('-').map(Number);
    setParts({ day, month, year });
  }, [value]);

  const update = (field, raw) => {
    const next = { ...parts, [field]: raw ? Number(raw) : '' };
    // 31 March -> February becomes 28/29 February
    if (next.day && next.day > daysIn(next.year, next.month)) next.day = daysIn(next.year, next.month);
    setParts(next);
    onChange(next.day && next.month && next.year ? `${next.year}-${pad(next.month)}-${pad(next.day)}` : '');
  };

  const days = Array.from({ length: daysIn(parts.year, parts.month) }, (_, i) => i + 1);
  const tone = (v) => (v ? 'text-white' : 'text-slate-500');

  return (
    <div className="grid grid-cols-[1fr_1.2fr_1.3fr] gap-2" id={id}>
      <select aria-label="Day of birth" required disabled={disabled} value={parts.day} onChange={(e) => update('day', e.target.value)} className={`${SELECT_CLASS} ${tone(parts.day)}`}>
        <option value="" disabled>Day</option>
        {days.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <select aria-label="Month of birth" required disabled={disabled} value={parts.month} onChange={(e) => update('month', e.target.value)} className={`${SELECT_CLASS} ${tone(parts.month)}`}>
        <option value="" disabled>Month</option>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <select aria-label="Year of birth" required disabled={disabled} value={parts.year} onChange={(e) => update('year', e.target.value)} className={`${SELECT_CLASS} ${tone(parts.year)}`}>
        <option value="" disabled>Year</option>
        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}
