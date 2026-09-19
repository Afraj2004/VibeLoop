import React, { useState } from 'react';
import { X, User, Mail, Lock, Sparkles, LogIn, UserPlus } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onAuthSuccess, backendUrl }) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    gender: 'other',
    country: 'US'
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const payload = isLogin
      ? { email: formData.email, password: formData.password }
      : formData;

    try {
      const res = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Save token and notify parent
      localStorage.setItem('vibeloop_token', data.token);
      localStorage.setItem('vibeloop_user', JSON.stringify(data.user));
      onAuthSuccess(data.user, data.token);
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
                {isLogin ? 'Login to save your tokens & history' : 'Join and receive 10 bonus VIBE'}
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
                  value={formData.gender}
                  onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                  className="w-full bg-[#08090D] border border-slate-800 focus:border-[#00F0FF] rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                >
                  <option value="other">Any / Other</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] text-slate-400 font-medium block mb-1">Country</label>
                <select
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  className="w-full bg-[#08090D] border border-slate-800 focus:border-[#00F0FF] rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                >
                  <option value="US">🇺🇸 Global / US</option>
                  <option value="IN">🇮🇳 India</option>
                  <option value="UK">🇬🇧 UK</option>
                  <option value="CA">🇨🇦 Canada</option>
                  <option value="DE">🇩🇪 Germany</option>
                  <option value="BR">🇧🇷 Brazil</option>
                </select>
              </div>
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
      </div>
    </div>
  );
}
