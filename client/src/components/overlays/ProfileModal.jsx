import React, { useRef, useState } from 'react';
import { X, Camera, Lock, LogOut, UserCog, Loader2, Sparkles, MapPin, Heart } from 'lucide-react';
import Avatar from '../hud/Avatar.jsx';
import GenderLabel from '../hud/GenderLabel.jsx';
import { apiFetch } from '../../utils/api.js';
import { resizeImage } from '../../utils/avatar.js';
import { countryName, flagEmoji } from '../../utils/countries.js';
import { getLocation } from '../../utils/location.js';
import { ageFrom, formatBirthDate } from '../../utils/age.js';


/**
 * Your profile: photo (the first one earns VIBE), country, the locked gender, sign out
 */
export default function ProfileModal({ currentUser, token, photoReward, onClose, onUpdated, onReward, onOpenAccount, onLogout }) {
  const [busy, setBusy] = useState(null); // 'photo' | 'country' | null
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const fileRef = useRef(null);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('photo');
    setError('');
    setSaved('');
    try {
      const image = await resizeImage(file);
      const data = await apiFetch('/api/profile/avatar', { token, method: 'PUT', body: { image } });
      onUpdated(data.user);
      if (data.reward > 0) onReward(data.balance, data.reward);
      setSaved(data.reward > 0 ? `Photo saved. +${data.reward} VIBE added to your wallet!` : 'Photo updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const handleRemovePhoto = async () => {
    setBusy('photo');
    setError('');
    setSaved('');
    try {
      const data = await apiFetch('/api/profile/avatar', { token, method: 'DELETE' });
      onUpdated(data.user);
      setSaved('Photo removed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  // Country only ever comes from the device location
  const handleUpdateCountry = async () => {
    setBusy('country');
    setError('');
    setSaved('');
    try {
      const coords = await getLocation();
      // The new token carries the updated country for matchmaking
      const data = await apiFetch('/api/profile/location', { token, method: 'PATCH', body: coords });
      onUpdated(data.user, data.token);
      setSaved(data.user.country === currentUser.country
        ? `You're still in ${countryName(data.user.country)}.`
        : `Country updated to ${countryName(data.user.country)}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Your profile"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-[#12151E] border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl relative"
      >
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#00F0FF]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between mb-5 relative">
          <h3 className="text-white font-bold text-lg tracking-wide">Your profile</h3>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Photo */}
        <div className="flex flex-col items-center gap-3 relative">
          <div className="relative">
            <Avatar user={currentUser} size={104} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy === 'photo'}
              aria-label={currentUser.avatarKey ? 'Change photo' : 'Add a photo'}
              className="absolute bottom-0 right-0 p-2.5 rounded-full bg-[#00F0FF] text-slate-950 border-4 border-[#12151E] shadow-lg cursor-pointer disabled:opacity-60"
            >
              {busy === 'photo' ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>

          <div className="text-center">
            <div className="text-white font-extrabold text-lg">{currentUser.username}</div>
            {currentUser.email && <div className="text-xs text-slate-500">{currentUser.email}</div>}
            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FF2A7A]/10 border border-[#FF2A7A]/30 text-[#FF7AA8] text-xs font-bold">
              <Heart size={12} className="fill-current" />
              {currentUser.likes || 0} like{currentUser.likes === 1 ? '' : 's'}
            </div>
          </div>

          {!currentUser.photoRewardClaimed && !currentUser.avatarKey && (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-[#FFD166]/10 border border-[#FFD166]/40 text-[#FFD166] text-xs font-bold cursor-pointer"
            >
              <Sparkles size={14} />
              Add a profile photo and earn +{photoReward} VIBE
            </button>
          )}
          {currentUser.avatarKey && (
            <button onClick={handleRemovePhoto} disabled={busy === 'photo'} className="text-[11px] text-slate-500 hover:text-red-400 cursor-pointer">
              Remove photo
            </button>
          )}
        </div>

        {(error || saved) && (
          <div className={`mt-4 p-3 rounded-xl text-xs border ${error ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'}`}>
            {error || saved}
          </div>
        )}

        {/* Details */}
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[#08090D] border border-slate-800">
            <span className="text-xs text-slate-400">Gender</span>
            <span className="flex items-center gap-1.5 text-xs font-bold text-white">
              <GenderLabel gender={currentUser.gender} />
              <Lock size={12} className="text-slate-500" />
            </span>
          </div>

          {currentUser.birthDate && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-[#08090D] border border-slate-800">
              <span className="text-xs text-slate-400">Date of birth</span>
              <span className="flex items-center gap-1.5 text-xs font-bold text-white">
                {formatBirthDate(currentUser.birthDate)}
                <span className="text-slate-500 font-semibold">· {ageFrom(currentUser.birthDate)}</span>
                <Lock size={12} className="text-slate-500" />
              </span>
            </div>
          )}

          <div className="p-3 rounded-2xl bg-[#08090D] border border-slate-800">
            <span className="text-xs text-slate-400 block mb-2">Country</span>
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate text-sm font-bold text-white">
                {flagEmoji(currentUser.country)} {countryName(currentUser.country)}
              </span>
              <button
                onClick={handleUpdateCountry}
                disabled={busy === 'country'}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/40 text-[#00F0FF] text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {busy === 'country' ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                Update from location
              </button>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={onOpenAccount}
            className="flex items-center justify-center gap-2 py-3 rounded-2xl border border-slate-800 hover:border-slate-600 text-slate-300 text-xs font-bold cursor-pointer"
          >
            <UserCog size={14} /> Account &amp; data
          </button>
          <button
            onClick={onLogout}
            className="flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-500/40 hover:bg-red-500/10 text-red-300 text-xs font-bold cursor-pointer"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
