import React, { useState } from 'react';
import { X, Zap, Flame, Eye, Rocket, Coins } from 'lucide-react';
import { apiFetch } from '../../utils/api.js';

const PERKS = [
  { Icon: Rocket, title: 'Priority matching', text: 'You are offered to compatible people before anyone else waiting.' },
  { Icon: Flame, title: 'Flame badge', text: 'Your matches see you are boosted.' },
  { Icon: Eye, title: 'Gender reveal', text: "See your match's gender while the video is still connecting." }
];

export function minutesLeft(boostUntil) {
  if (!boostUntil) return 0;
  return Math.max(0, Math.ceil((new Date(boostUntil) - Date.now()) / 60000));
}

/**
 * Buy or extend a 1-hour VibeBoost
 */
export default function BoostModal({ token, balance, boostUntil, price = 10, onClose, onActivated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remaining = minutesLeft(boostUntil);
  const canAfford = balance >= price;

  const handleActivate = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch('/api/wallet/boost', { token, method: 'POST' });
      onActivated(data);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#12151E] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#FF2A7A]/20 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5 relative">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-[#FF2A7A] to-[#FF9E00] text-slate-950">
              <Zap size={18} className="fill-slate-950" />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg tracking-wide">VibeBoost</h3>
              <p className="text-xs text-slate-400">
                {remaining > 0 ? `Active · ${remaining} min left` : `1 hour for ${price} VIBE`}
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

        <div className="space-y-3 mb-6 relative">
          {PERKS.map(({ Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <div className="shrink-0 p-2 h-fit rounded-xl bg-[#FF2A7A]/10 text-[#FF7A00] border border-[#FF2A7A]/20">
                <Icon size={16} />
              </div>
              <div>
                <div className="text-sm font-bold text-white">{title}</div>
                <div className="text-xs text-slate-400">{text}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between bg-[#08090D]/80 border border-slate-800/80 rounded-2xl p-3.5 mb-4 text-xs">
          <span className="text-slate-400">Your balance</span>
          <span className="flex items-center gap-1 font-bold text-[#FFD166]">
            <Coins size={12} />
            {balance.toFixed(2)} VIBE
          </span>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">{error}</div>
        )}

        <button
          onClick={handleActivate}
          disabled={busy || !canAfford}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#FF2A7A] to-[#FF9E00] text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(255,42,122,0.35)] active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          <Zap size={16} className="fill-slate-950" />
          <span>
            {busy
              ? 'Activating…'
              : !canAfford
                ? `Need ${price} VIBE`
                : remaining > 0
                  ? `Extend +1 hour · ${price} VIBE`
                  : `Activate for ${price} VIBE`}
          </span>
        </button>
      </div>
    </div>
  );
}
