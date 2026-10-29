import React from 'react';
import { FILTER_MIN_AGE, FILTER_MAX_AGE, ageRangeLabel } from '../../utils/age.js';

const SPAN = FILTER_MAX_AGE - FILTER_MIN_AGE;
const percent = (age) => ((age - FILTER_MIN_AGE) / SPAN) * 100;

/**
 * Two-handle age range, 18 to 60+. The handles can meet but never cross.
 */
export default function AgeRangeSlider({ minAge, maxAge, onChange }) {
  return (
    <div className="bg-[#08090D] border border-slate-800 rounded-2xl px-4 pt-3 pb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-400">Age</span>
        <span className="text-xs font-bold text-[#00F0FF]">{ageRangeLabel(minAge, maxAge)}</span>
      </div>

      <div className="relative h-5">
        <div className="absolute top-1/2 -translate-y-1/2 inset-x-0 h-1.5 rounded-full bg-slate-800" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A]"
          style={{ left: `${percent(minAge)}%`, right: `${100 - percent(maxAge)}%` }}
        />
        <input
          type="range"
          aria-label="Youngest age"
          min={FILTER_MIN_AGE}
          max={FILTER_MAX_AGE}
          value={minAge}
          onChange={(e) => onChange(Math.min(Number(e.target.value), maxAge), maxAge)}
          className="range-thumb absolute inset-0 w-full"
          // When both handles sit at the top, the low one must stay grabbable
          style={{ zIndex: minAge >= FILTER_MAX_AGE - 1 ? 3 : 2 }}
        />
        <input
          type="range"
          aria-label="Oldest age"
          min={FILTER_MIN_AGE}
          max={FILTER_MAX_AGE}
          value={maxAge}
          onChange={(e) => onChange(minAge, Math.max(Number(e.target.value), minAge))}
          className="range-thumb absolute inset-0 w-full"
          style={{ zIndex: 2 }}
        />
      </div>

      <div className="flex justify-between mt-1.5 text-[10px] text-slate-500">
        <span>{FILTER_MIN_AGE}</span>
        <span>{FILTER_MAX_AGE}+</span>
      </div>
    </div>
  );
}
