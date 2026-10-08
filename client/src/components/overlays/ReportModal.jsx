import React, { useState } from 'react';
import { X, Flag, Ban } from 'lucide-react';

const REASONS = [
  { id: 'nudity', label: 'Nudity or sexual content' },
  { id: 'harassment', label: 'Harassment, hate or threats' },
  { id: 'underage', label: 'Appears to be under 18' },
  { id: 'spam', label: 'Spam, scam or advertising' },
  { id: 'violence', label: 'Violence or self-harm' },
  { id: 'other', label: 'Something else' }
];

/**
 * Report (which also blocks) or just block the current partner. Both skip to the next match.
 */
export default function ReportModal({ peerName = 'this user', onClose, onReport, onBlock }) {
  const [reason, setReason] = useState(null);
  const [details, setDetails] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#12151E] border border-slate-800 rounded-3xl p-6 shadow-2xl">

        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
              <Flag size={18} />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg tracking-wide">Report {peerName}</h3>
              <p className="text-xs text-slate-400">They will be blocked and you will skip to someone new</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-2 mb-4">
          {REASONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setReason(r.id)}
              className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs transition-colors ${
                reason === r.id
                  ? 'bg-red-500/10 border-red-500/50 text-white'
                  : 'bg-[#08090D] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="Add details (optional)"
          className="w-full mb-5 bg-[#08090D] border border-slate-800 focus:border-red-500/60 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 outline-none resize-none"
        />

        <div className="flex gap-2">
          <button
            onClick={onBlock}
            className="flex-1 py-3 rounded-2xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Ban size={14} />
            <span>Just block</span>
          </button>
          <button
            onClick={() => onReport(reason, details)}
            disabled={!reason}
            className="flex-[2] py-3 rounded-2xl bg-red-500 hover:bg-red-400 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Flag size={14} />
            <span>Report &amp; skip</span>
          </button>
        </div>
      </div>
    </div>
  );
}
