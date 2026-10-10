import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { LEGAL_EFFECTIVE_DATE } from '../legal/content.js';

/**
 * Standalone, scrollable page for the Terms of Service / Privacy Policy
 */
export default function LegalPage({ document }) {
  return (
    <div className="h-screen overflow-y-auto bg-[#08090D] text-slate-300 select-text">
      <div className="max-w-3xl mx-auto px-5 py-10">
        <a href="/" className="inline-flex items-center gap-1.5 text-xs font-bold text-[#00F0FF] hover:underline mb-8">
          <ArrowLeft size={14} />
          <span>Back to VibeLoop</span>
        </a>

        <h1 className="text-3xl font-extrabold text-white tracking-wide mb-2">{document.title}</h1>
        <p className="text-xs text-slate-500 mb-6">Effective {LEGAL_EFFECTIVE_DATE}</p>
        <p className="text-sm leading-relaxed mb-8">{document.intro}</p>

        {document.sections.map((section) => (
          <section key={section.heading} className="mb-7">
            <h2 className="text-base font-bold text-white mb-2">{section.heading}</h2>
            {section.paragraphs?.map((p) => (
              <p key={p} className="text-sm leading-relaxed mb-2">{p}</p>
            ))}
            {section.bullets && (
              <ul className="list-disc pl-5 space-y-1">
                {section.bullets.map((b) => (
                  <li key={b} className="text-sm leading-relaxed">{b}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <div className="pt-6 mt-10 border-t border-slate-800 flex gap-4 text-xs">
          <a href="/terms" className="text-slate-400 hover:text-white">Terms of Service</a>
          <a href="/privacy" className="text-slate-400 hover:text-white">Privacy Policy</a>
        </div>
      </div>
    </div>
  );
}
