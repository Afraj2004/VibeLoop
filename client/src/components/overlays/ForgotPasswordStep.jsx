import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, ArrowLeft, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '../../utils/api.js';
import { LEGAL_CONTACT } from '../../legal/content.js';

const RESEND_SECONDS = 60;

const INPUT_CLASS = 'w-full bg-[#08090D] border border-slate-800 focus:border-[#00F0FF] rounded-xl pl-10 pr-3 py-2.5 text-xs text-white placeholder-slate-600 outline-none transition-colors';

/**
 * Forgotten password: email -> 6-digit code + new password. A correct code signs the person in
 * (onDone receives the same payload as a login).
 */
export default function ForgotPasswordStep({ initialEmail = '', onDone, onBack }) {
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const requestCode = async () => {
    setError('');
    setInfo('');
    await apiFetch('/api/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
    setResendIn(RESEND_SECONDS);
  };

  const handleSendCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await requestCode();
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    try {
      await requestCode();
      setInfo('If an account uses this email, a new code is on its way.');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const data = await apiFetch('/api/auth/reset-password', { method: 'POST', body: { email: email.trim(), code, password } });
      onDone(data);
    } catch (err) {
      setError(err.message);
      if (/code/i.test(err.message)) setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-col items-center text-center gap-2 mb-5">
        <div className="p-3 rounded-2xl bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20">
          <KeyRound size={26} />
        </div>
        <h3 className="text-white font-bold text-lg">Reset your password</h3>
        <p className="text-xs text-slate-400">
          {step === 'email'
            ? "Enter your account's email and we'll send you a 6-digit code."
            : <>If an account uses <span className="text-white font-semibold break-all">{email.trim()}</span>, we sent it a code. It expires in 15 minutes.</>}
        </p>
      </div>

      {error && <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded-xl">{error}</div>}
      {info && <div className="mb-3 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl">{info}</div>}

      {step === 'email' ? (
        <form onSubmit={handleSendCode} className="space-y-3">
          <div className="relative">
            <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="email"
              required
              autoFocus
              aria-label="Email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] text-slate-950 font-extrabold text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : 'SEND CODE'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleReset} className="space-y-3">
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
          <div className="relative">
            <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              aria-label="New password"
              placeholder="New password (8+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${INPUT_CLASS} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white cursor-pointer"
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <button
            type="submit"
            disabled={busy || code.length !== 6 || password.length < 8}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] text-slate-950 font-extrabold text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : 'SET NEW PASSWORD'}
          </button>
        </form>
      )}

      <div className="mt-4 flex items-center justify-between text-xs">
        <button
          onClick={step === 'code' ? () => { setStep('email'); setError(''); setInfo(''); } : onBack}
          className="flex items-center gap-1 text-slate-400 hover:text-white cursor-pointer"
        >
          <ArrowLeft size={13} /> {step === 'code' ? 'Wrong email?' : 'Back to sign in'}
        </button>
        {step === 'code' && (
          <button
            onClick={handleResend}
            disabled={resendIn > 0}
            className="font-bold text-[#00F0FF] disabled:text-slate-500 cursor-pointer disabled:cursor-default"
          >
            {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
          </button>
        )}
      </div>
      {step === 'code' && (
        <p className="mt-3 text-[10px] text-slate-500 text-center">
          Can&apos;t find it? Check your spam or promotions folder, or write to{' '}
          <a href={`mailto:${LEGAL_CONTACT}`} className="text-slate-300 underline">{LEGAL_CONTACT}</a>.
        </p>
      )}
    </div>
  );
}
