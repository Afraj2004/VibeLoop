import React from 'react';
import {
  ArrowRight, Sparkles, Video, Coins, Gift, Zap, Globe, ShieldCheck, Lock, Flag, SkipForward, ChevronDown
} from 'lucide-react';
import { LEGAL_CONTACT } from '../legal/content.js';

const APP_PATH = '/chat';

const STEPS = [
  { Icon: ShieldCheck, title: 'Confirm you are 18+', text: 'Accept the community guidelines once. No sign-up needed to start.' },
  { Icon: Video, title: 'Press START', text: 'You are matched with someone new in seconds, face to face.' },
  { Icon: SkipForward, title: 'Chat or skip', text: 'Talk, text and send gifts. Not your vibe? Hit NEXT.' }
];

const FEATURES = [
  {
    Icon: Coins, tone: 'text-[#FFD166] bg-[#FFD166]/10 border-[#FFD166]/20',
    title: 'Meet-to-Earn',
    text: 'Earn 0.10 VIBE for every 3 minutes of real conversation, up to 10 VIBE a day.'
  },
  {
    Icon: Gift, tone: 'text-[#FF2A7A] bg-[#FF2A7A]/10 border-[#FF2A7A]/20',
    title: 'Live gifts',
    text: 'Send roses, coffees and more to people you click with. They keep half the value.'
  },
  {
    Icon: Zap, tone: 'text-[#FF9E00] bg-[#FF9E00]/10 border-[#FF9E00]/20',
    title: 'VibeBoost',
    text: 'Jump the queue for an hour, unlock gender filters and wear the 🔥 badge.'
  },
  {
    Icon: Globe, tone: 'text-[#00F0FF] bg-[#00F0FF]/10 border-[#00F0FF]/20',
    title: 'Country filters',
    text: 'Meet people from anywhere, or only from the countries you choose. Free.'
  }
];

const SAFETY = [
  { Icon: Lock, title: 'Never recorded', text: 'Video goes directly between you and your match, encrypted. We never store it.' },
  { Icon: Flag, title: 'Report & block', text: 'One tap removes someone for good. Repeated reports mean automatic suspension.' },
  { Icon: ShieldCheck, title: 'Adults only', text: 'VibeLoop is strictly 18+, with clear community guidelines everyone accepts.' }
];

const FAQ = [
  {
    q: 'Is VibeLoop free?',
    a: 'Yes. Video chat, text chat and country filters are free. You can optionally buy VIBE to send gifts or activate VibeBoost.'
  },
  {
    q: 'Do I need an account?',
    a: 'No. You start as a guest instantly. Create an account any time to keep your VIBE, recent contacts and history across devices.'
  },
  {
    q: 'What is VIBE?',
    a: 'VIBE is an in-app token you earn by chatting or buy in packs. It is used for gifts and VibeBoost. It is not money and has no cash value.'
  },
  {
    q: 'Are my calls recorded?',
    a: 'No. Calls are peer-to-peer and encrypted in transit. VibeLoop never records, stores or views your video or audio.'
  },
  {
    q: 'What if someone breaks the rules?',
    a: 'Tap Report during the call. You will never be matched with them again, and accounts reported by several people are suspended automatically.'
  }
];

function CTA({ className = '', children = 'Start video chat' }) {
  return (
    <a
      href={APP_PATH}
      className={`inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] text-slate-950 font-black text-sm tracking-wide shadow-[0_0_30px_rgba(0,240,255,0.35)] hover:shadow-[0_0_40px_rgba(255,42,122,0.45)] active:scale-95 transition-all ${className}`}
    >
      {children}
      <ArrowRight size={18} />
    </a>
  );
}

function SectionTitle({ eyebrow, title, text }) {
  return (
    <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#00F0FF] mb-3">{eyebrow}</p>
      <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">{title}</h2>
      {text && <p className="text-slate-400 mt-3 text-sm sm:text-base">{text}</p>}
    </div>
  );
}

/** Illustrative mock of a call, built from CSS only */
function HeroMock() {
  return (
    <div className="relative mx-auto w-full max-w-[22rem] aspect-[9/16] max-h-[34rem] rounded-[2.5rem] border border-slate-800 bg-[#0B0D13] p-3 shadow-[0_0_80px_rgba(0,240,255,0.12)]">
      <div className="relative h-full w-full rounded-[2rem] overflow-hidden bg-gradient-to-br from-[#1a1f3a] via-[#2a1533] to-[#0f2733]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,209,102,0.35),transparent_35%)]" />
        <div className="absolute left-1/2 top-[30%] -translate-x-1/2 w-28 h-28 rounded-full bg-gradient-to-br from-[#FFB38A] to-[#C9746B] opacity-80 blur-[1px]" />
        <div className="absolute left-1/2 top-[55%] -translate-x-1/2 w-52 h-40 rounded-t-[5rem] bg-gradient-to-br from-[#3b2a5c] to-[#1d1534]" />

        <div className="absolute top-4 left-4 px-3 py-1.5 rounded-2xl bg-black/50 border border-white/10 backdrop-blur text-xs font-bold text-white">🇮🇳 aanya_22</div>
        <div className="absolute top-4 right-4 w-20 h-28 rounded-2xl border border-white/15 bg-gradient-to-br from-[#0f3a40] to-[#14202b] overflow-hidden">
          <div className="absolute left-1/2 top-6 -translate-x-1/2 w-10 h-10 rounded-full bg-gradient-to-br from-[#E2A27F] to-[#9C5E4F] opacity-80" />
          <div className="absolute left-1/2 top-[4.5rem] -translate-x-1/2 w-16 h-12 rounded-t-3xl bg-[#1f4b55]" />
          <span className="absolute bottom-1.5 left-1.5 px-1.5 rounded-md bg-black/60 text-[8px] font-bold text-slate-300">YOU</span>
        </div>

        <div className="absolute left-4 right-14 bottom-24 space-y-2">
          <div className="w-fit max-w-full px-3 py-2 rounded-2xl rounded-bl-md bg-black/50 backdrop-blur border border-white/10 text-[11px] text-white">Hey! Where are you from? 👋</div>
          <div className="w-fit max-w-full ml-auto px-3 py-2 rounded-2xl rounded-br-md bg-[#00F0FF]/20 backdrop-blur border border-[#00F0FF]/30 text-[11px] text-white">Bengaluru! You?</div>
        </div>

        <div className="absolute right-4 bottom-24 flex flex-col items-center gap-1 animate-bounce">
          <span className="text-3xl drop-shadow-lg">🌹</span>
        </div>

        <div className="absolute inset-x-4 bottom-4 flex gap-2">
          <div className="flex-1 py-2.5 rounded-xl border border-red-500/50 bg-black/40 text-center text-[11px] font-black text-red-300">STOP</div>
          <div className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] text-center text-[11px] font-black text-slate-950">NEXT</div>
        </div>
      </div>

      <div className="absolute -left-4 sm:-left-12 top-16 px-3 py-2 rounded-2xl bg-[#12151E]/95 border border-[#FFD166]/30 shadow-xl text-[11px] font-bold text-[#FFD166] flex items-center gap-1.5">
        <Coins size={14} /> +0.10 VIBE
      </div>
      <div className="absolute -right-3 sm:-right-10 top-1/2 px-3 py-2 rounded-2xl bg-gradient-to-r from-[#FF2A7A] to-[#FF9E00] shadow-xl text-[11px] font-extrabold text-slate-950">
        🔥 Boosted
      </div>
    </div>
  );
}

/**
 * Public home page. The app itself lives at /chat so the camera is only requested there.
 */
export default function LandingPage() {
  return (
    <div className="h-screen supports-[height:100dvh]:h-dvh overflow-y-auto overflow-x-hidden bg-[#08090D] text-slate-300 select-text scroll-smooth">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-[#08090D]/80 backdrop-blur-xl border-b border-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00F0FF] animate-pulse shadow-[0_0_8px_#00F0FF]" />
            <span className="font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-[#00F0FF] via-slate-100 to-[#FF2A7A]">VIBELOOP</span>
          </a>
          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold text-slate-400">
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#safety" className="hover:text-white">Safety</a>
            <a href="#faq" className="hover:text-white">FAQ</a>
          </nav>
          <a
            href={APP_PATH}
            className="px-4 py-2 rounded-xl border border-[#00F0FF]/40 text-[#00F0FF] text-xs font-bold hover:bg-[#00F0FF]/10 transition-colors"
          >
            Open app
          </a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(0,240,255,0.12),transparent_50%),radial-gradient(ellipse_at_80%_60%,rgba(255,42,122,0.12),transparent_50%)]" />
          <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 sm:pb-24 grid lg:grid-cols-2 gap-14 items-center">
            <div className="text-center lg:text-left">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#12151E] border border-slate-800 text-[11px] font-bold text-slate-300 mb-6">
                <Sparkles size={12} className="text-[#00F0FF]" /> Live 1-on-1 video chat · 18+
              </span>
              <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.05]">
                Meet someone new{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A]">in one tap.</span>
              </h1>
              <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-xl mx-auto lg:mx-0">
                Instant face-to-face conversations with people around the world. No sign-up to start,
                skip any time, and earn VIBE tokens for every real conversation.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <CTA />
                <a
                  href="#how"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl border border-slate-800 bg-[#12151E] text-white font-bold text-sm hover:border-slate-700 transition-colors"
                >
                  How it works
                  <ChevronDown size={16} />
                </a>
              </div>
              <p className="mt-5 text-xs text-slate-500">Free to use · Video is never recorded · Report &amp; block in one tap</p>
            </div>
            <HeroMock />
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-16 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <SectionTitle eyebrow="How it works" title="From hello to new friend in seconds" />
          <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
            {STEPS.map(({ Icon, title, text }, i) => (
              <div key={title} className="relative p-6 rounded-3xl bg-[#12151E] border border-slate-800">
                <span className="absolute top-5 right-6 text-5xl font-black text-slate-800/80">{i + 1}</span>
                <div className="w-11 h-11 rounded-2xl bg-[#00F0FF]/10 border border-[#00F0FF]/20 text-[#00F0FF] flex items-center justify-center mb-5">
                  <Icon size={20} />
                </div>
                <h3 className="text-white font-bold text-lg">{title}</h3>
                <p className="text-sm text-slate-400 mt-1.5">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-16 border-y border-slate-900 bg-[#0B0D13]">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <SectionTitle
              eyebrow="Features"
              title="More than a random video chat"
              text="Conversations that are worth your time, with rewards for showing up."
            />
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {FEATURES.map(({ Icon, tone, title, text }) => (
                <div key={title} className="p-6 rounded-3xl bg-[#12151E] border border-slate-800 hover:border-slate-700 transition-colors">
                  <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center mb-5 ${tone}`}>
                    <Icon size={20} />
                  </div>
                  <h3 className="text-white font-bold">{title}</h3>
                  <p className="text-sm text-slate-400 mt-1.5">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Safety */}
        <section id="safety" className="scroll-mt-16 max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <SectionTitle eyebrow="Safety" title="Built to keep it respectful" />
          <div className="grid sm:grid-cols-3 gap-4 sm:gap-6">
            {SAFETY.map(({ Icon, title, text }) => (
              <div key={title} className="p-6 rounded-3xl bg-[#12151E] border border-slate-800">
                <Icon size={22} className="text-[#00F0FF] mb-4" />
                <h3 className="text-white font-bold">{title}</h3>
                <p className="text-sm text-slate-400 mt-1.5">{text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-t border-slate-900 bg-[#0B0D13]">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
            <SectionTitle eyebrow="FAQ" title="Questions, answered" />
            <div className="space-y-3">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group p-5 rounded-2xl bg-[#12151E] border border-slate-800 open:border-slate-700">
                  <summary className="flex items-center justify-between gap-4 cursor-pointer list-none text-white font-semibold text-sm sm:text-base">
                    {q}
                    <ChevronDown size={18} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-sm text-slate-400">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-[#12151E] px-6 py-12 sm:py-16 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,240,255,0.15),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(255,42,122,0.15),transparent_60%)]" />
            <h2 className="relative text-2xl sm:text-4xl font-extrabold text-white tracking-tight">Your next great conversation is one tap away.</h2>
            <p className="relative text-slate-400 mt-3">No downloads. Works in your browser on phone and desktop.</p>
            <CTA className="relative mt-8" />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} VibeLoop · Bengaluru, India · 18+ only</p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <a href="/terms" className="hover:text-white">Terms</a>
            <a href="/privacy" className="hover:text-white">Privacy</a>
            <span>{LEGAL_CONTACT}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
