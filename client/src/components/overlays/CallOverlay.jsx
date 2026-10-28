import React from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import Avatar from '../hud/Avatar.jsx';

/**
 * Friend-call ringing UI: an incoming call to answer, or our outgoing call waiting for an answer.
 * `who` is the friend (with avatar details when they are in the friends list).
 */
export default function CallOverlay({ incoming, who, inCall, onAccept, onDecline, onCancel }) {
  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex justify-center p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pointer-events-none">
      <div
        role="alertdialog"
        aria-label={incoming ? `${who.username} is calling` : `Calling ${who.username}`}
        className="pointer-events-auto w-full max-w-sm flex items-center gap-3 p-3 pr-4 rounded-3xl bg-[#12151E]/95 border border-emerald-500/40 backdrop-blur-2xl shadow-[0_0_40px_rgba(16,185,129,0.25)]"
      >
        <span className="relative">
          <span className="absolute inset-0 rounded-full border-2 border-emerald-400/60 animate-ping" />
          <Avatar user={who} size={48} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white truncate">{who.username}</div>
          <div className="flex items-center gap-1 text-[11px] text-emerald-300">
            <Video size={12} />
            {incoming ? (inCall ? 'Video call · answering ends this call' : 'Incoming video call') : 'Calling...'}
          </div>
        </div>

        {incoming ? (
          <>
            <button
              onClick={onDecline}
              aria-label="Decline call"
              className="p-3 rounded-full bg-red-500 text-white shadow-lg active:scale-95 transition-transform cursor-pointer"
            >
              <PhoneOff size={18} />
            </button>
            <button
              onClick={onAccept}
              aria-label="Accept call"
              className="p-3 rounded-full bg-emerald-500 text-white shadow-lg active:scale-95 transition-transform cursor-pointer"
            >
              <Phone size={18} />
            </button>
          </>
        ) : (
          <button
            onClick={onCancel}
            aria-label="Cancel call"
            className="p-3 rounded-full bg-red-500 text-white shadow-lg active:scale-95 transition-transform cursor-pointer"
          >
            <PhoneOff size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
