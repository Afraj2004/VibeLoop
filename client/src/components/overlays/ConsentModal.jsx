import React, { useState } from 'react';
import { ShieldCheck, Check } from 'lucide-react';

// Bump when the guidelines change so every user re-confirms
export const TERMS_VERSION = '2026-10';

const GUIDELINES = [
  'You must be 18 or older to use VibeLoop.',
  'No nudity, sexual content or sexual behaviour on camera.',
  'No harassment, hate speech, threats or bullying.',
  'Do not record or share anyone without their consent.',
  'No spam, scams or advertising.',
  'Report anyone who breaks these rules. Accounts with repeated reports are suspended.'
];

function ConsentCheckbox({ checked, onChange, children }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none">
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
          checked ? 'bg-[#00F0FF] border-[#00F0FF] text-slate-950' : 'bg-[#08090D] border-slate-700'
        }`}
      >
        {checked && <Check size={14} strokeWidth={3} />}
      </button>
      <span className="text-xs text-slate-300 leading-relaxed">{children}</span>
    </label>
  );
}

/**
 * Blocking age + terms gate shown before the camera or a session is created
 */
export default function ConsentModal({ onAccept }) {
  const [isAdult, setIsAdult] = useState(false);
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const canContinue = isAdult && acceptsTerms;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#08090D]/95 backdrop-blur-md p-4">
      <div className="w-full max-w-md bg-[#12151E] border border-slate-800 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#00F0FF]/15 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-800/80 mb-5 relative">
          <div className="p-2 rounded-xl bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg tracking-wide">Before you start</h3>
            <p className="text-xs text-slate-400">VibeLoop connects you live with strangers on camera</p>
          </div>
        </div>

        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Community Guidelines</h4>
        <ul className="space-y-1.5 mb-5">
          {GUIDELINES.map((rule) => (
            <li key={rule} className="flex gap-2 text-xs text-slate-300 leading-relaxed">
              <span className="text-[#FF2A7A]">•</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-3 mb-6">
          <ConsentCheckbox checked={isAdult} onChange={setIsAdult}>
            I confirm I am <span className="font-bold text-white">18 years or older</span>.
          </ConsentCheckbox>
          <ConsentCheckbox checked={acceptsTerms} onChange={setAcceptsTerms}>
            I agree to the Community Guidelines above, the{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="text-[#00F0FF] hover:underline">Terms of Service</a>
            {' '}and the{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-[#00F0FF] hover:underline">Privacy Policy</a>.
          </ConsentCheckbox>
        </div>

        <button
          onClick={onAccept}
          disabled={!canContinue}
          className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] text-slate-950 font-extrabold text-xs tracking-wider shadow-[0_0_20px_rgba(0,240,255,0.3)] active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        >
          ENTER VIBELOOP
        </button>
      </div>
    </div>
  );
}
