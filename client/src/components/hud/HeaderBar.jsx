import React, { useEffect, useState } from 'react';
import { Zap, Sparkles, Coins, Users, LogIn, UserPlus } from 'lucide-react';
import Avatar from './Avatar.jsx';

export default function HeaderBar({
  onlineCount = 1240,
  vibeBalance = 0.0,
  m2eEarnedToday = 0.0,
  m2eDailyCap = 10.0,
  secondsUntilNextReward = 180,
  isCallActive = false,
  currentUser = null,
  onOpenAuthModal,
  onOpenProfile,
  onOpenFriends,
  friendsBadge = 0,
  onOpenBoostModal,
  onOpenRechargeModal,
  boostMinutesLeft = 0
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
    <header className="absolute top-0 left-0 right-0 z-40 px-3 sm:px-6 py-3 flex items-center justify-between pointer-events-none">
      
      {/* Left: Brand Logo & Online Counter */}
      <div className="flex items-center gap-2.5 pointer-events-auto">
        <a href="/" aria-label="VibeLoop home" className="flex items-center gap-2 bg-[#12151E]/90 hover:border-slate-700 backdrop-blur-xl border border-slate-800/80 px-3 py-1.5 rounded-2xl shadow-xl transition-colors">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00F0FF] animate-pulse shadow-[0_0_8px_#00F0FF]" />
          <span className="font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#00F0FF] via-slate-100 to-[#FF2A7A] text-sm sm:text-base">
            VIBELOOP
          </span>
        </a>

        <div className="hidden sm:flex items-center gap-1.5 bg-[#12151E]/70 backdrop-blur-md border border-slate-800/60 px-3 py-1.5 rounded-2xl text-xs font-semibold text-slate-300">
          <Users size={13} className="text-[#00F0FF]" />
          <span>{onlineCount.toLocaleString()}</span>
          <span className="text-slate-500 text-[10px]">online</span>
        </div>
      </div>

      {/* Center: Meet-to-Earn Progress (compact below lg, own row on phones) */}
      <div className="pointer-events-auto hidden sm:flex items-center gap-2 lg:gap-3 bg-[#12151E]/90 backdrop-blur-xl border border-slate-800/80 px-3 lg:px-4 py-1.5 rounded-2xl shadow-xl">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className={isCallActive ? "text-[#FF2A7A] animate-spin-slow" : "text-slate-500"} />
          <span className="hidden lg:inline text-xs font-bold text-slate-200">Meet-to-Earn</span>
        </div>

        <div className="w-14 lg:w-24 h-2 bg-[#08090D] rounded-full overflow-hidden border border-slate-800 relative">
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

      <div className="pointer-events-auto sm:hidden absolute top-full left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#12151E]/90 backdrop-blur-xl border border-slate-800/80 px-3 py-1 rounded-2xl shadow-xl">
        <Sparkles size={12} className={isCallActive ? "text-[#FF2A7A] animate-spin-slow" : "text-slate-500"} />
        <div className="w-12 h-1.5 bg-[#08090D] rounded-full overflow-hidden border border-slate-800">
          <div
            className="h-full bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] transition-all duration-1000 ease-linear"
            style={{ width: `${isCapReached ? 100 : cycleProgress}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-slate-400">
          <span className="text-[#00F0FF] font-bold">{m2eEarnedToday.toFixed(2)}</span>/{m2eDailyCap.toFixed(0)}
        </span>
      </div>

      {/* Right: wallet, boost, friends, profile. Icon-only on phones. */}
      <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
        <button
          onClick={onOpenRechargeModal}
          aria-label="Wallet"
          className="flex items-center gap-1.5 sm:gap-2 bg-[#12151E]/90 hover:bg-slate-800/80 border border-slate-800 hover:border-[#FFD166]/40 px-2.5 sm:px-3 py-1.5 rounded-2xl shadow-xl transition-all group cursor-pointer"
        >
          <Coins size={14} className="text-[#FFD166] group-hover:rotate-12 transition-transform" />
          <div className="flex flex-col items-start leading-none">
            <span className="hidden sm:block text-[9px] text-slate-400 font-medium">Balance</span>
            <span className="text-xs font-bold text-white tracking-wide whitespace-nowrap">
              {vibeBalance.toFixed(2)}<span className="hidden min-[400px]:inline"> VIBE</span>
            </span>
          </div>
        </button>

        <button
          onClick={onOpenBoostModal}
          aria-label="VibeBoost"
          title="VibeBoost"
          className="flex items-center gap-1.5 bg-gradient-to-r from-[#FF2A7A] to-[#FF9E00] hover:opacity-90 text-slate-950 p-2 sm:px-3 sm:py-1.5 rounded-2xl text-xs font-extrabold shadow-[0_0_15px_rgba(255,42,122,0.3)] transition-all active:scale-95 cursor-pointer"
        >
          <Zap size={14} className="fill-slate-950" />
          {boostMinutesLeft > 0 ? (
            <span>{boostMinutesLeft}m</span>
          ) : (
            <span className="hidden sm:inline">BOOST</span>
          )}
        </button>

        <button
          onClick={onOpenFriends}
          aria-label={friendsBadge > 0 ? `Friends (${friendsBadge} new)` : 'Friends'}
          title="Friends"
          className="relative p-2 rounded-2xl bg-[#12151E]/90 hover:bg-slate-800/90 border border-slate-800 hover:border-[#00F0FF]/40 text-[#00F0FF] shadow-xl transition-all active:scale-95 cursor-pointer"
        >
          <Users size={14} />
          {friendsBadge > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-[#FF2A7A] text-[9px] font-black text-white flex items-center justify-center">
              {friendsBadge > 9 ? '9+' : friendsBadge}
            </span>
          )}
        </button>

        {currentUser && !currentUser.isGuest ? (
          <button
            onClick={onOpenProfile}
            aria-label="Your profile"
            title={currentUser.username}
            className="flex items-center gap-2 rounded-2xl sm:bg-[#12151E]/90 sm:border sm:border-slate-800 hover:border-[#00F0FF]/40 sm:pl-1 sm:pr-3 sm:py-1 shadow-xl transition-all active:scale-95 cursor-pointer"
          >
            <Avatar user={currentUser} size={30} />
            <span className="hidden md:inline text-xs font-bold text-white max-w-[90px] truncate">{currentUser.username}</span>
          </button>
        ) : (
          <button
            onClick={onOpenAuthModal}
            aria-label="Sign in"
            className="flex items-center gap-1.5 bg-[#12151E]/90 hover:bg-slate-800/90 border border-[#00F0FF]/40 text-[#00F0FF] p-2 sm:px-3.5 sm:py-1.5 rounded-2xl text-xs font-bold shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            <UserPlus size={14} className="sm:hidden" />
            <LogIn size={13} className="hidden sm:block" />
            <span className="hidden sm:inline whitespace-nowrap">Sign In</span>
          </button>
        )}
      </div>

    </header>
  );
}

