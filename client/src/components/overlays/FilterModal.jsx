import React, { useState } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { COUNTRIES, flagEmoji } from '../../utils/countries.js';

const TARGET_GENDERS = [
  { id: 'any', label: 'Everyone' },
  { id: 'female', label: 'Women' },
  { id: 'male', label: 'Men' }
];

const OWN_GENDERS = [
  { id: 'female', label: 'Woman' },
  { id: 'male', label: 'Man' },
  { id: 'other', label: 'Other' }
];

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="flex bg-[#08090D] p-1 rounded-2xl border border-slate-800">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
            value === o.id ? 'bg-[#12151E] text-[#00F0FF] shadow-sm' : 'text-slate-400 hover:text-white'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function CountrySelect({ value, onChange, anyLabel }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-[#08090D] border border-slate-800 focus:border-[#00F0FF] rounded-xl px-3 py-2.5 text-xs text-white outline-none"
    >
      <option value="ALL">{flagEmoji('ALL')} {anyLabel}</option>
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>{flagEmoji(c.code)} {c.name}</option>
      ))}
    </select>
  );
}

/**
 * Who to meet (applied on the next search) and who you are (lets others' filters find you)
 */
export default function FilterModal({ preferences, profile, onClose, onSave }) {
  const [targetGender, setTargetGender] = useState(preferences.targetGender);
  const [targetCountry, setTargetCountry] = useState(preferences.targetCountry);
  const [gender, setGender] = useState(profile.gender);
  const [country, setCountry] = useState(profile.country);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave({ preferences: { targetGender, targetCountry }, profile: { gender, country } });
      onClose();
    } catch (err) {
      setError(err.message || 'Could not save your filters');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#12151E] border border-slate-800 rounded-3xl p-6 shadow-2xl">

        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20">
              <SlidersHorizontal size={18} />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg tracking-wide">Match Filters</h3>
              <p className="text-xs text-slate-400">Applied from your next match</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">I want to meet</h4>
        <div className="space-y-2 mb-5">
          <SegmentedControl options={TARGET_GENDERS} value={targetGender} onChange={setTargetGender} />
          <CountrySelect value={targetCountry} onChange={setTargetCountry} anyLabel="Anywhere in the world" />
        </div>

        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">About me</h4>
        <div className="space-y-2 mb-2">
          <SegmentedControl options={OWN_GENDERS} value={gender} onChange={setGender} />
          <CountrySelect value={country} onChange={setCountry} anyLabel="Prefer not to say" />
        </div>
        <p className="text-[10px] text-slate-500 mb-5">
          People filtering by gender or country can only find you if you set these. Changing them ends your current call.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">
            {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] text-slate-950 font-extrabold text-xs tracking-wider shadow-[0_0_20px_rgba(0,240,255,0.3)] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
        >
          {saving ? 'SAVING...' : 'SAVE FILTERS'}
        </button>
      </div>
    </div>
  );
}
