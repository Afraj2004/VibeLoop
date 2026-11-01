import React, { useEffect } from 'react';
import { X, Gift, Share2 } from 'lucide-react';

const AUTO_HIDE_MS = 15000;

/**
 * Small card after a long call: registered users open their invite link, guests share the site.
 */
export default function SharePrompt({ isRegistered, inviterReward, onInvite, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [onClose]);

  const shareSite = () => {
    const url = window.location.origin;
    const text = 'Meet new people in instant 1-on-1 video chats on VibeLoop (18+):';
    if (typeof navigator.share === 'function') {
      navigator.share({ title: 'VibeLoop', text, url }).catch(() => {});
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noreferrer');
    }
    onClose();
  };

  return (
    <div
      role="status"
      className="absolute left-1/2 -translate-x-1/2 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 w-[calc(100%-1.5rem)] max-w-sm flex items-center gap-3 p-3 pr-2 rounded-2xl bg-[#12151E]/95 border border-[#3DDC97]/40 backdrop-blur-xl shadow-[0_0_30px_rgba(61,220,151,0.2)]"
    >
      <span className="shrink-0 p-2 rounded-xl bg-[#3DDC97]/10 text-[#3DDC97]">
        <Gift size={18} />
      </span>
      <div className="flex-1 min-w-0 text-xs">
        <div className="font-bold text-white">Enjoying VibeLoop?</div>
        <div className="text-slate-400">
          {isRegistered ? `Invite a friend and you both get VIBE (+${inviterReward} for you).` : 'Share it with your friends.'}
        </div>
      </div>
      <button
        onClick={isRegistered ? onInvite : shareSite}
        className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#3DDC97] text-slate-950 text-xs font-extrabold cursor-pointer"
      >
        <Share2 size={13} /> {isRegistered ? 'Invite' : 'Share'}
      </button>
      <button onClick={onClose} aria-label="Dismiss" className="shrink-0 p-1.5 text-slate-500 hover:text-white cursor-pointer">
        <X size={15} />
      </button>
    </div>
  );
}

