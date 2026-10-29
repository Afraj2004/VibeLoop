import React, { useEffect, useState } from 'react';
import { MailCheck, Loader2, ArrowLeft } from 'lucide-react';
import { apiFetch } from '../../utils/api.js';

const RESEND_SECONDS = 60;

/**
 * "Check your email": enter the 6-digit code. A correct code signs the person in.
 * `initialError` carries a send failure from registration/login.
 */
export default function VerifyEmailStep({ email, initialError, onVerified, onBack }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(initialError || '');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(initialError ? 0 : RESEND_SECONDS);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const data = await apiFetch('/api/auth/verify-email', { method: 'POST', body: { email, code } });
      onVerified(data);
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setInfo('');
    try {
      await apiFetch('/api/auth/resend-code', { method: 'POST', body: { email } });
      setInfo('A new code is on its way.');
      setResendIn(RESEND_SECONDS);
    } catch (err) {
      setError(err.message);
      // The server's cooldown wins if the timers drifted
      if (err.status === 429) setResendIn(RESEND_SECONDS);
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-col items-center text-center gap-2 mb-5">
        <div className="p-3 rounded-2xl bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20">
          <MailCheck size={26} />
        </div>
        <h3 className="text-white font-bold text-lg">Check your email</h3>
        <p className="text-xs text-slate-400">
          We sent a 6-digit code to <span className="text-white font-semibold break-all">{email}</span>.
          Enter it to finish. It expires in 15 minutes.
        </p>
      </div>

      {error && <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">{error}</div>}
      {info && <div className="mb-3 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl">{info}</div>}

      <form onSubmit={handleVerify} className="space-y-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          aria-label="6-digit code"
          placeholder="••••••"
          className="w-full bg-[#08090D] border border-slate-800 focus:border-[#00F0FF] rounded-2xl px-4 py-3.5 text-center text-2xl font-mono tracking-[0.5em] text-white placeholder-slate-700 outline-none"
        />
        <button
          type="submit"
          disabled={busy || code.length !== 6}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] text-slate-950 font-extrabold text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : 'VERIFY & CONTINUE'}
        </button>
      </form>

      <div className="mt-4 flex items-center justify-between text-xs">
        <button onClick={onBack} className="flex items-center gap-1 text-slate-400 hover:text-white cursor-pointer">
          <ArrowLeft size={13} /> Wrong email?
        </button>
        <button
          onClick={handleResend}
          disabled={resendIn > 0}
          className="font-bold text-[#00F0FF] disabled:text-slate-500 cursor-pointer disabled:cursor-default"
        >
          {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
        </button>
      </div>
      <p className="mt-3 text-[10px] text-slate-500 text-center">Can't find it? Check your spam or promotions folder.</p>
    </div>
  );
}
