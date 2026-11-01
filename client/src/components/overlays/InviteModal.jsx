import React, { useEffect, useState } from 'react';
import { X, Gift, Copy, Check, Share2, Loader2 } from 'lucide-react';
import { apiFetch } from '../../utils/api.js';
import { inviteLink, SHARE_TEXT } from '../../utils/referral.js';

/**
 * Your invite link, ways to share it, and how your invites are doing. Registered accounts only.
 */
export default function InviteModal({ token, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiFetch('/api/referrals', { token })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [token]);

  const link = data?.code ? inviteLink(data.code) : '';
  const message = `${SHARE_TEXT} ${link}`;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copy failed. Press and hold the link to copy it.');
    }
  };

  const share = () => navigator.share({ title: 'VibeLoop', text: SHARE_TEXT, url: link }).catch(() => {});

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Invite friends"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-[#12151E] border border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl relative"
      >
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#3DDC97]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between mb-4 relative">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#3DDC97]/10 text-[#3DDC97] border border-[#3DDC97]/30">
              <Gift size={18} />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg tracking-wide">Invite friends</h3>
              <p className="text-xs text-slate-400">You both earn VIBE</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">{error}</div>}

        {!data && !error ? (
          <div className="flex justify-center py-10 text-slate-500"><Loader2 className="animate-spin" /></div>
        ) : data && (
          <>
            <div className="grid grid-cols-2 gap-2 mb-4 relative">
              <div className="p-3 rounded-2xl bg-[#08090D] border border-slate-800 text-center">
                <div className="text-2xl font-black text-[#3DDC97]">+{data.rewards.inviter}</div>
                <div className="text-[11px] text-slate-400">VIBE for you</div>
              </div>
              <div className="p-3 rounded-2xl bg-[#08090D] border border-slate-800 text-center">
                <div className="text-2xl font-black text-[#00F0FF]">+{data.rewards.invitee}</div>
                <div className="text-[11px] text-slate-400">extra VIBE for your friend</div>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mb-4">
              Paid when your friend joins with your link, verifies their email and spends {data.rewards.qualifyMinutes} minutes
              chatting with other people. Up to {data.rewards.monthlyCap} paid invites a month.
            </p>

            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">Your link</label>
            <div className="flex gap-2 mb-3">
              <input
                readOnly
                value={link}
                aria-label="Your invite link"
                onFocus={(e) => e.target.select()}
                className="flex-1 min-w-0 bg-[#08090D] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white outline-none select-all"
              />
              <button
                onClick={copy}
                className="shrink-0 flex items-center gap-1.5 px-3 rounded-xl bg-[#00F0FF]/10 border border-[#00F0FF]/40 text-[#00F0FF] text-xs font-bold cursor-pointer"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className={`grid ${canShare ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#25D366] text-slate-950 text-xs font-extrabold"
              >
                Share on WhatsApp
              </a>
              {canShare && (
                <button
                  onClick={share}
                  className="flex items-center justify-center gap-2 py-3 rounded-2xl border border-slate-700 hover:border-slate-500 text-white text-xs font-bold cursor-pointer"
                >
                  <Share2 size={14} /> More apps
                </button>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between p-3 rounded-2xl bg-[#08090D] border border-slate-800 text-xs">
              <span className="text-slate-400">Friends joined</span>
              <span className="font-bold text-white">{data.joined} <span className="text-slate-500 font-semibold">· {data.rewarded} paid</span></span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
