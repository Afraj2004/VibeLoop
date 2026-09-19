import React, { useEffect, useState } from 'react';
import { Zap, Sparkles, Coins, Users, LogIn, LogOut, User } from 'lucide-react';

export default function HeaderBar({
  onlineCount = 1240,
  vibeBalance = 0.0,
  m2eEarnedToday = 0.0,
  m2eDailyCap = 10.0,
  secondsUntilNextReward = 180,
  isCallActive = false,
  currentUser = null,
  onOpenAuthModal,
  onLogout,
  onOpenBoostModal,
  onOpenRechargeModal
}) {
  const [countdown, setCountdown] = useState(secondsUntilNextReward);

  useEffect(() => {
    setCountdown(secondsUntilNextReward);
  }, [secondsUntilNextReward]);

  useEffect(() => {
    if (!isCallActive) return;

    const interval = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 180));
    }, 1000);

    return () => clearInterval(interval);
  }, [isCallActive]);

  const cycleProgress = Math.min(100, Math.max(0, ((180 - countdown) / 180) * 100));
  const isCapReached = m2eEarnedToday >= m2eDailyCap;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 px-3 sm:px-6 py-3 flex items-center justify-between pointer-events-none">
      
      {/* Left: Brand Logo & Online Counter */}
      <div className="flex items-center gap-2.5 pointer-events-auto">
        <div className="flex items-center gap-2 bg-[#12151E]/90 backdrop-blur-xl border border-slate-800/80 px-3 py-1.5 rounded-2xl shadow-xl">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00F0FF] animate-pulse shadow-[0_0_8px_#00F0FF]" />
          <span className="font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#00F0FF] via-slate-100 to-[#FF2A7A] text-sm sm:text-base">
            VIBELOOP
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 bg-[#12151E]/70 backdrop-blur-md border border-slate-800/60 px-3 py-1.5 rounded-2xl text-xs font-semibold text-slate-300">
          <Users size={13} className="text-[#00F0FF]" />
          <span>{onlineCount.toLocaleString()}</span>
          <span className="text-slate-500 text-[10px]">online</span>
        </div>
      </div>

      {/* Center: Meet-to-Earn Progress */}
      <div className="pointer-events-auto hidden md:flex items-center gap-3 bg-[#12151E]/90 backdrop-blur-xl border border-slate-800/80 px-4 py-1.5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className={isCallActive ? "text-[#FF2A7A] animate-spin-slow" : "text-slate-500"} />
          <span className="text-xs font-bold text-slate-200">Meet-to-Earn</span>
        </div>

        <div className="w-24 h-2 bg-[#08090D] rounded-full overflow-hidden border border-slate-800 relative">
          <div 
            className="h-full bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] transition-all duration-1000 ease-linear"
            style={{ width: `${isCapReached ? 100 : cycleProgress}%` }}
          />
        </div>

        <div className="text-[11px] font-mono text-slate-400">
          <span className="text-[#00F0FF] font-bold">{m2eEarnedToday.toFixed(2)}</span>
          <span className="text-slate-600">/</span>
          <span>{m2eDailyCap.toFixed(0)} VIBE</span>
        </div>
      </div>

      {/* Right: Wallet Balance & User Auth Pill */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Wallet Pill */}
        <button 
          onClick={onOpenRechargeModal}
          className="flex items-center gap-2 bg-[#12151E]/90 hover:bg-slate-800/80 border border-slate-800 hover:border-[#FFD166]/40 px-3 py-1.5 rounded-2xl shadow-xl transition-all group"
        >
          <Coins size={14} className="text-[#FFD166] group-hover:rotate-12 transition-transform" />
          <div className="flex flex-col items-start leading-none">
            <span className="text-[9px] text-slate-400 font-medium">Balance</span>
            <span className="text-xs font-bold text-white tracking-wide">{vibeBalance.toFixed(2)} VIBE</span>
          </div>
        </button>

        {/* User Status / Login Button */}
        {currentUser ? (
          <div className="flex items-center gap-1.5 bg-[#12151E]/90 border border-slate-800 px-3 py-1.5 rounded-2xl shadow-xl text-xs">
            <User size={13} className="text-[#00F0FF]" />
            <span className="font-bold text-white max-w-[80px] truncate">{currentUser.username}</span>
            <button
              onClick={onLogout}
              title="Sign Out"
              className="ml-1 text-slate-500 hover:text-red-400 transition-colors"
            >
              <LogOut size={13} />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuthModal}
            className="flex items-center gap-1.5 bg-[#12151E]/90 hover:bg-slate-800/90 border border-[#00F0FF]/40 text-[#00F0FF] px-3.5 py-1.5 rounded-2xl text-xs font-bold shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <LogIn size={13} />
            <span>Sign In</span>
          </button>
        )}

        {/* Boost Button */}
        <button
          onClick={onOpenBoostModal}
          className="hidden xs:flex items-center gap-1.5 bg-gradient-to-r from-[#FF2A7A] to-[#FF9E00] hover:opacity-90 text-slate-950 px-3 py-1.5 rounded-2xl text-xs font-extrabold shadow-[0_0_15px_rgba(255,42,122,0.3)] transition-all active:scale-95 cursor-pointer"
        >
          <Zap size={13} className="fill-slate-950" />
          <span>BOOST</span>
        </button>
      </div>

    </header>
  );
}

