import React from 'react';
import { Gift, History } from 'lucide-react';
import { flagEmoji } from '../../utils/countries.js';

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function timeAgo(timestamp) {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Recent contacts strip (calls of 20+ seconds). Tapping a contact opens the gift tray for them.
 */
export default function HistoryBar({ contacts = [], onSelect }) {
  if (contacts.length === 0) return null;

  return (
    <div className="absolute bottom-28 z-30 w-full max-w-lg px-4">
      <div className="flex items-center gap-1.5 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <History size={12} className="text-[#00F0FF]" />
        <span>Recent vibes</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {contacts.map((c) => (
          <button
            key={c.peerId}
            onClick={() => onSelect(c)}
            title={`Send ${c.username} a gift`}
            className="shrink-0 w-28 p-2.5 rounded-3xl bg-[#12151E]/80 border border-slate-800 hover:border-[#FF2A7A]/50 backdrop-blur-xl text-left transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#00F0FF] to-[#FF2A7A] flex items-center justify-center text-[11px] font-black text-slate-950">
                {c.username.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm">{flagEmoji(c.country)}</span>
            </div>
            <div className="text-[11px] font-bold text-white truncate">{c.username}</div>
            <div className="text-[9px] text-slate-500">
              {formatDuration(c.durationSeconds)} · {timeAgo(c.endedAt)}
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[9px] font-bold text-[#FFD166] opacity-70 group-hover:opacity-100">
              <Gift size={10} />
              <span>Send gift</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
