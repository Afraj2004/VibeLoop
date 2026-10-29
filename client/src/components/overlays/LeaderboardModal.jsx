import React, { useEffect, useState } from 'react';
import { X, Trophy, Heart, Loader2 } from 'lucide-react';
import Avatar from '../hud/Avatar.jsx';
import { apiFetch } from '../../utils/api.js';
import { flagEmoji } from '../../utils/countries.js';

export const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

const PERIODS = [
  { id: 'week', label: 'This week' },
  { id: 'all', label: 'All time' }
];

// "Resets in 3d 4h" / "Resets in 5h"
function resetsIn(resetsAt) {
  const ms = new Date(resetsAt) - Date.now();
  if (!(ms > 0)) return 'Resets soon';
  const hours = Math.floor(ms / 3600000);
  return hours >= 24 ? `Resets in ${Math.floor(hours / 24)}d ${hours % 24}h` : `Resets in ${Math.max(1, hours)}h`;
}

function Row({ entry, isMe }) {
  return (
    <li className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border ${
      isMe ? 'bg-[#00F0FF]/10 border-[#00F0FF]/40' : 'bg-[#08090D] border-slate-800/80'
    }`}>
      <span className={`w-8 shrink-0 text-center font-black text-slate-300 ${MEDALS[entry.rank] ? "text-2xl leading-none" : "text-sm"}`}>
        {MEDALS[entry.rank] || `#${entry.rank}`}
      </span>
      <Avatar user={entry} size={34} />
      <span className="flex-1 min-w-0 truncate text-sm font-bold text-white">
        {entry.country && entry.country !== 'ALL' ? `${flagEmoji(entry.country)} ` : ''}{entry.username}
        {isMe && <span className="ml-1.5 text-[10px] font-extrabold text-[#00F0FF]">YOU</span>}
      </span>
      <span className="shrink-0 flex items-center gap-1 text-sm font-extrabold text-white">
        <Heart size={14} className="text-[#FF2A7A] fill-[#FF2A7A]" />
        {entry.likes.toLocaleString()}
      </span>
    </li>
  );
}

/**
 * Most-liked verified accounts, this week and all time. Last week's top 3 wear a medal in chats.
 */
export default function LeaderboardModal({ token, isRegistered, onClose, onRequireAccount }) {
  const [period, setPeriod] = useState('week');
  const [boards, setBoards] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    apiFetch(`/api/leaderboard?period=${period}`, { token })
      .then((data) => !cancelled && setBoards((prev) => ({ ...prev, [period]: data })))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [period, token]);

  const board = boards[period];
  const meListed = board?.me && board.entries.some((e) => e.id === board.me.id);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Leaderboard"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md h-[85vh] sm:h-[80vh] flex flex-col bg-[#12151E] border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl relative overflow-hidden"
      >
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#FFD166]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="p-5 pb-3 relative">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#FFD166]/10 text-[#FFD166] border border-[#FFD166]/30">
                <Trophy size={18} />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg tracking-wide">Leaderboard</h3>
                <p className="text-xs text-slate-400">Most liked in chats</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer">
              <X size={18} />
            </button>
          </div>

          <div className="flex bg-[#08090D] p-1 rounded-2xl border border-slate-800">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                  period === p.id ? 'bg-[#12151E] text-[#FFD166] shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === 'week' && board?.resetsAt && (
            <p className="mt-2 text-[10px] text-slate-500 text-center">
              {resetsIn(board.resetsAt)} (Monday 12 AM IST). Last week&apos;s top 3 wear a medal in chats.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {error ? (
            <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">{error}</div>
          ) : !board ? (
            <div className="flex justify-center py-10 text-slate-500"><Loader2 className="animate-spin" /></div>
          ) : board.entries.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-400">
              No likes yet {period === 'week' ? 'this week' : ''}. Be the first: start chatting!
            </div>
          ) : (
            <ol className="space-y-2">
              {board.entries.map((entry) => <Row key={entry.id} entry={entry} isMe={entry.id === board.me?.id} />)}
            </ol>
          )}
        </div>

        {/* Your own place, when it's below the list or you aren't on it */}
        <div className="px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] border-t border-slate-800/80">
          {!isRegistered ? (
            <button
              onClick={onRequireAccount}
              className="w-full py-2.5 rounded-2xl border border-[#00F0FF]/40 text-[#00F0FF] hover:bg-[#00F0FF]/10 text-xs font-bold cursor-pointer"
            >
              Create an account to appear on the leaderboard
            </button>
          ) : board?.me && !meListed ? (
            <ol><Row entry={board.me} isMe /></ol>
          ) : board && !board.me ? (
            <p className="text-center text-xs text-slate-400">
              You&apos;re not on the board {period === 'week' ? 'this week' : 'yet'}. Every like you get in a chat counts.
            </p>
          ) : (
            <p className="text-center text-xs text-slate-400">Every like you get in a chat counts.</p>
          )}
        </div>
      </div>
    </div>
  );
}
