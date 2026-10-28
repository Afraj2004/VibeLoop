import React, { useEffect, useState } from 'react';
import { X, User, Mail, Lock, Sparkles, LogIn, UserPlus, MapPin, Loader2, Check } from 'lucide-react';
import { countryName, flagEmoji } from '../../utils/countries.js';
import { apiFetch } from '../../utils/api.js';
import { genderText } from '../hud/GenderLabel.jsx';
import { getLocation } from '../../utils/location.js';

export default function AuthModal({ isOpen, onClose, onAuthSuccess, backendUrl, token, isGuest, initialMode = 'login', signupBonus = 5 }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    gender: ''
  });
  // Country comes from the device location: { status: 'idle' | 'locating' | 'done', coords, country }
  const [place, setPlace] = useState({ status: 'idle', coords: null, country: null });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Each time the modal opens, start on the tab the caller asked for
  useEffect(() => {
    if (isOpen) setIsLogin(initialMode === 'login');
  }, [isOpen, initialMode]);

  if (!isOpen) return null;

  // Asks for location permission, then shows which country it resolves to (the server decides)
  const detectCountry = async () => {
    setError('');
    setPlace((prev) => ({ ...prev, status: 'locating' }));
    try {
      const coords = await getLocation();
      const { country } = await apiFetch('/api/geo/country', { method: 'POST', body: coords });
      const next = { status: 'done', coords, country };
      setPlace(next);
      return next;
    } catch (err) {
      setPlace({ status: 'idle', coords: null, country: null });
      throw err;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      let payload = { email: formData.email, password: formData.password };
      if (!isLogin) {
        const location = (place.coords ? place : await detectCountry()).coords;
        // Registration is only reachable after the app-wide age/terms gate has been accepted
        payload = { ...formData, location, ageConfirmed: true, termsAccepted: true };
      }

      const res = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Registering from a guest session upgrades that guest, keeping its VIBE, history and contacts
          ...(!isLogin && isGuest && token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Save token and notify parent
      localStorage.setItem('vibeloop_token', data.token);
      localStorage.setItem('vibeloop_user', JSON.stringify(data.user));
      onAuthSuccess(data.user, data.token, Boolean(data.upgraded), data.bonus || 0);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#12151E] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        {/* Ambient Glow */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#00F0FF]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-[#FF2A7A]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5 relative">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg tracking-wide">
                {isLogin ? 'Welcome Back' : 'Create VibeLoop Account'}
              </h3>
              <p className="text-xs text-slate-400">
                {isLogin
                  ? 'Sign in to an existing account'
                  : isGuest
                    ? `Keep this session's VIBE and history, plus ${signupBonus} bonus VIBE`
                    : `Join and receive ${signupBonus} bonus VIBE`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="flex bg-[#08090D] p-1 rounded-2xl mb-5 border border-slate-800">
          <button
            type="button"
            onClick={() => { setIsLogin(true); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              isLogin
                ? 'bg-[#12151E] text-[#00F0FF] shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => { setIsLogin(false); setError(''); }}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              !isLogin
                ? 'bg-[#12151E] text-[#FF2A7A] shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Register
          </button>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {!isLogin && (
            <div>
              <label className="text-[11px] text-slate-400 font-medium block mb-1">Username</label>
              <div className="relative">
                <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="viber_99"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full bg-[#08090D] border border-slate-800 focus:border-[#00F0FF] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-[11px] text-slate-400 font-medium block mb-1">Email</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="email"
                required
                placeholder="you@vibeloop.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full bg-[#08090D] border border-slate-800 focus:border-[#00F0FF] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-slate-400 font-medium block mb-1">Password</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full bg-[#08090D] border border-slate-800 focus:border-[#00F0FF] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-colors"
              />
            </div>
          </div>

          {!isLogin && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="text-[11px] text-slate-400 font-medium block mb-1">Gender</label>
                <select
                  required
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className={`w-full bg-[#08090D] border border-slate-800 focus:border-[#00F0FF] rounded-xl px-3 py-2.5 text-xs outline-none ${formData.gender ? 'text-white' : 'text-slate-500'}`}
                >
                  <option value="" disabled>Select...</option>
                  <option value="female">{genderText('female')}</option>
                  <option value="male">{genderText('male')}</option>
                  <option value="other">{genderText('other')}</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-medium block mb-1">Country</label>
                {place.status === 'done' ? (
                  <div className="flex items-center gap-2 bg-[#08090D] border border-emerald-500/40 rounded-xl px-3 py-2.5 text-xs text-white">
                    <span>{flagEmoji(place.country)}</span>
                    <span className="truncate flex-1">{countryName(place.country)}</span>
                    <Check size={14} className="text-emerald-400 shrink-0" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => detectCountry().catch((err) => setError(err.message))}
                    disabled={place.status === 'locating'}
                    className="w-full flex items-center justify-center gap-1.5 bg-[#08090D] border border-[#00F0FF]/40 hover:bg-[#00F0FF]/10 rounded-xl px-3 py-2.5 text-xs font-bold text-[#00F0FF] cursor-pointer disabled:opacity-60"
                  >
                    {place.status === 'locating' ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                    {place.status === 'locating' ? 'Locating...' : 'Use my location'}
                  </button>
                )}
              </div>
              <p className="col-span-2 text-[10px] text-slate-500">
                Gender can't be changed after sign-up. Your country is set from your location (only the country is saved, never where you are).
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] hover:opacity-95 text-slate-950 font-extrabold text-xs tracking-wider flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(0,240,255,0.3)] active:scale-95 transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? (
              <span className="inline-block animate-pulse">Authenticating...</span>
            ) : isLogin ? (
              <>
                <LogIn size={15} />
                <span>SIGN IN</span>
              </>
            ) : (
              <>
                <UserPlus size={15} />
                <span>CREATE ACCOUNT</span>
              </>
            )}
          </button>
        </form>

        {isLogin && isGuest && (
          <p className="mt-3 text-[10px] text-slate-500 text-center">
            Signing in switches to that account. This guest session's VIBE stays with the guest; register instead to keep it.
          </p>
        )}

        {!isLogin && (
          <p className="mt-3 text-[10px] text-slate-500 text-center">
            By creating an account you agree to the{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="text-slate-300 hover:underline">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-slate-300 hover:underline">Privacy Policy</a>.
          </p>
        )}
      </div>
    </div>
  );
}
