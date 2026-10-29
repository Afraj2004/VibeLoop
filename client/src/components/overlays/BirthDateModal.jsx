import React, { useState } from 'react';
import { Cake, Loader2 } from 'lucide-react';
import BirthDateInput from './BirthDateInput.jsx';
import { apiFetch } from '../../utils/api.js';
import { ageFrom, MIN_AGE } from '../../utils/age.js';
import { LEGAL_CONTACT } from '../../legal/content.js';

/**
 * One-time, blocking: sessions from before birth dates were asked must add one to keep matching.
 * onSaved(user, token) receives the updated profile and a token carrying the date.
 */
export default function BirthDateModal({ token, isGuest, onSaved, onSignOut }) {
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const age = ageFrom(birthDate);
  const tooYoung = age !== null && age < MIN_AGE;

  const handleSave = async (e) => {
    e.preventDefault();
    if (!birthDate || tooYoung) return;
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch('/api/profile/birth-date', { token, method: 'PATCH', body: { birthDate } });
      onSaved(data.user, data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#08090D]/95 backdrop-blur-md p-4">
      <form
        onSubmit={handleSave}
        role="dialog"
        aria-label="Add your date of birth"
        className="w-full max-w-sm bg-[#12151E] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden"
      >
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#FF2A7A]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center text-center gap-2 mb-5 relative">
          <div className="p-3 rounded-2xl bg-[#FF2A7A]/10 text-[#FF7AA8] border border-[#FF2A7A]/20">
            <Cake size={26} />
          </div>
          <h3 className="text-white font-bold text-lg">Add your date of birth</h3>
          <p className="text-xs text-slate-400">
            VibeLoop now shows ages and lets everyone filter by age. People you meet see your age, never your birth date.
          </p>
        </div>

        <BirthDateInput value={birthDate} onChange={setBirthDate} />

        {(error || tooYoung) && (
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">
            {tooYoung ? `VibeLoop is only for people ${MIN_AGE} and over.` : error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !birthDate || tooYoung}
          className="w-full mt-4 py-3 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] text-slate-950 font-extrabold text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : 'SAVE & CONTINUE'}
        </button>

        <p className="mt-3 text-[10px] text-slate-500 text-center">
          It can&apos;t be changed later. Made a mistake? Write to {LEGAL_CONTACT}.
        </p>
        {!isGuest && (
          <button type="button" onClick={onSignOut} className="block mx-auto mt-2 text-[11px] text-slate-400 hover:text-white cursor-pointer">
            Sign out
          </button>
        )}
      </form>
    </div>
  );
}
