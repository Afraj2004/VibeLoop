import React, { useState } from 'react';
import { X, UserCog, Download, Trash2 } from 'lucide-react';
import { apiFetch } from '../../utils/api.js';

/**
 * "Your account & data": download everything we store, or permanently delete the account
 */
export default function AccountModal({ currentUser, token, onClose, onDeleted }) {
  const isGuest = !currentUser || currentUser.isGuest;
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [exported, setExported] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await apiFetch('/api/account/export', { token });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vibeloop-data-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setExported(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError('');
    try {
      await apiFetch('/api/account', {
        token,
        method: 'DELETE',
        body: { confirm: confirmText, ...(isGuest ? {} : { password }) }
      });
      onDeleted();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const canDelete = confirmText === 'DELETE' && (isGuest || password.length > 0) && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#12151E] border border-slate-800 rounded-3xl p-6 shadow-2xl">

        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20">
              <UserCog size={18} />
            </div>
            <div>
              <h3 className="text-white font-bold text-lg tracking-wide">Your account &amp; data</h3>
              <p className="text-xs text-slate-400">
                {currentUser?.username || 'Guest'} · {isGuest ? 'Guest session' : 'Registered account'}
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

        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Download your data</h4>
        <p className="text-xs text-slate-400 mb-3">
          A JSON file with your profile, VIBE transactions, match history, messages, reports and blocks.
        </p>
        <button
          onClick={handleExport}
          disabled={busy || !token}
          className="w-full mb-6 py-2.5 rounded-2xl border border-slate-700 text-slate-200 hover:bg-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40"
        >
          <Download size={14} />
          <span>{exported ? 'Downloaded — download again' : 'Download my data'}</span>
        </button>

        <h4 className="text-[11px] font-bold uppercase tracking-wider text-red-400 mb-2">Delete account</h4>
        <p className="text-xs text-slate-400 mb-3">
          Permanently deletes your account, VIBE balance (including earned balance), history and messages. This cannot be undone.
        </p>

        <div className="space-y-2 mb-3">
          {!isGuest && (
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              className="w-full bg-[#08090D] border border-slate-800 focus:border-red-500/60 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none"
            />
          )}
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="w-full bg-[#08090D] border border-slate-800 focus:border-red-500/60 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none"
          />
        </div>

        {error && (
          <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">{error}</div>
        )}

        <button
          onClick={handleDelete}
          disabled={!canDelete}
          className="w-full py-2.5 rounded-2xl bg-red-500 hover:bg-red-400 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Trash2 size={14} />
          <span>Delete my account permanently</span>
        </button>

        <div className="mt-5 flex justify-center gap-4 text-[11px]">
          <a href="/terms" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white">Terms of Service</a>
          <a href="/privacy" target="_blank" rel="noreferrer" className="text-slate-500 hover:text-white">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}
