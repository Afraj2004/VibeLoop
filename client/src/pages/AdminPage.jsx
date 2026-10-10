import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../utils/api.js';

const REASON_LABELS = {
  nudity: 'Nudity / sexual',
  harassment: 'Harassment',
  underage: 'Under 18',
  spam: 'Spam / scam',
  violence: 'Violence',
  other: 'Other'
};

const BAN_OPTIONS = [
  { id: '24h', label: 'Ban 24h' },
  { id: '7d', label: 'Ban 7d' },
  { id: '30d', label: 'Ban 30d' },
  { id: 'permanent', label: 'Ban permanently' }
];

function formatTime(value) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function ReportedUserCard({ user, token, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isBanned = user.banned_until && new Date(user.banned_until) > new Date();

  const act = async (path, body) => {
    setBusy(true);
    setError('');
    try {
      await apiFetch(`/api/admin/users/${user.id}/${path}`, { token, method: 'POST', body: body || {} });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="bg-[#12151E] border border-slate-800 rounded-3xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-white font-bold">
            {user.username}
            {user.is_guest && <span className="ml-2 text-[10px] font-bold text-slate-400 border border-slate-700 rounded-md px-1.5 py-0.5">GUEST</span>}
            {isBanned && <span className="ml-2 text-[10px] font-bold text-red-400 border border-red-500/40 rounded-md px-1.5 py-0.5">BANNED until {formatTime(user.banned_until)}</span>}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {user.open_reports} open report{user.open_reports === 1 ? '' : 's'} from {user.distinct_reporters} user{user.distinct_reporters === 1 ? '' : 's'} · joined {formatTime(user.created_at)}
          </div>
          <div className="text-[10px] text-slate-600 font-mono mt-0.5">{user.id}</div>
        </div>
      </div>

      <ul className="space-y-2 mb-4">
        {user.reports.map((r, i) => (
          <li key={i} className="text-xs bg-[#08090D] border border-slate-800 rounded-xl px-3 py-2">
            <span className="font-bold text-red-300">{REASON_LABELS[r.reason] || r.reason}</span>
            <span className="text-slate-500"> · {formatTime(r.createdAt)} · by {r.reporter || 'deleted user'}</span>
            {r.details && <div className="text-slate-300 mt-1">“{r.details}”</div>}
          </li>
        ))}
      </ul>

      {error && <div className="mb-3 text-xs text-red-400">{error}</div>}

      <div className="flex flex-wrap gap-2">
        {BAN_OPTIONS.map((option) => (
          <button
            key={option.id}
            disabled={busy}
            onClick={() => act('ban', { duration: option.id })}
            className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/40 text-red-300 text-xs font-bold hover:bg-red-500/20 disabled:opacity-40"
          >
            {option.label}
          </button>
        ))}
        {isBanned && (
          <button
            disabled={busy}
            onClick={() => act('unban')}
            className="px-3 py-1.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-800 disabled:opacity-40"
          >
            Lift ban
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => act('dismiss')}
          className="px-3 py-1.5 rounded-xl border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-800 disabled:opacity-40"
        >
          Dismiss (no action)
        </button>
      </div>
    </div>
  );
}

/**
 * Moderation queue. Requires being signed in (in the main app) with an account that has is_admin set.
 */
export default function AdminPage() {
  const token = localStorage.getItem('vibeloop_token');
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!token) {
      setError('Sign in with an admin account in VibeLoop first, then return to this page.');
      return;
    }
    setError('');
    apiFetch('/api/admin/reports', { token })
      .then((data) => setUsers(data.users))
      .catch((err) => setError(err.status === 403
        ? 'This account is not an admin. Sign in with an admin account in VibeLoop first.'
        : err.message));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-screen overflow-y-auto bg-[#08090D] text-slate-300 select-text">
      <div className="max-w-4xl mx-auto px-5 py-8">
        <div className="flex items-center justify-between mb-6">
          <a href="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#00F0FF] hover:underline">
            <ArrowLeft size={14} />
            <span>Back to VibeLoop</span>
          </a>
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-300 border border-slate-700 rounded-xl px-3 py-1.5 hover:bg-slate-800"
          >
            <RefreshCw size={13} />
            <span>Refresh</span>
          </button>
        </div>

        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-white mb-1">
          <ShieldAlert className="text-red-400" size={22} />
          <span>Moderation queue</span>
        </h1>
        <p className="text-xs text-slate-500 mb-6">Users with unreviewed reports, most recent first. Every action is recorded in the audit log.</p>

        {error && (
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>
        )}

        {!error && users === null && <p className="text-sm text-slate-500">Loading…</p>}
        {!error && users?.length === 0 && <p className="text-sm text-slate-500">No open reports. 🎉</p>}

        <div className="space-y-4">
          {users?.map((user) => (
            <ReportedUserCard key={user.id} user={user} token={token} onDone={load} />
          ))}
        </div>
      </div>
    </div>
  );
}
