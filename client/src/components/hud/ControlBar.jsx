import React from 'react';
import {
  Mic, MicOff, Video, VideoOff, Play, Square, SkipForward, SlidersHorizontal, MessageSquare, Gift, Heart
} from 'lucide-react';

const ICON_BUTTON = 'shrink-0 p-2.5 min-[400px]:p-3 sm:p-4 rounded-2xl backdrop-blur-xl border transition-all shadow-lg active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100';
const NEUTRAL = 'bg-[#12151E]/90 hover:bg-slate-800 border-slate-800 text-white';
const MUTED = 'bg-red-500/20 border-red-500/50 text-red-400';
const TEXT_BUTTON = 'flex-1 min-w-0 py-2.5 min-[400px]:py-3 sm:py-4 px-2.5 sm:px-4 rounded-2xl font-black text-xs sm:text-sm tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed disabled:active:scale-100';
const PRIMARY = 'bg-gradient-to-r from-[#00F0FF] to-[#FF2A7A] hover:opacity-95 text-slate-950 shadow-[0_0_25px_rgba(0,240,255,0.4)] disabled:opacity-50';

/**
 * Bottom controls. Start/Stop enters or leaves matchmaking; Next skips to someone new.
 * On phones the mic/camera toggles live on the self-view tile instead, and during a call
 * the Like button takes the filter button's place.
 */
export default function ControlBar({
  status, canStart, onStartStop, onNext,
  isAudioOn, isVideoOn, onToggleAudio, onToggleVideo,
  onOpenFilters, filtersActive, onToggleChat, hasUnreadChat, onGift, onLike, hasLiked, likePulse = 0
}) {
  const isIdle = status === 'idle';
  const isMatched = status === 'connected';

  return (
    <div className="absolute bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40 px-3 sm:px-4 flex items-center gap-1.5 min-[400px]:gap-2 sm:gap-3 max-w-2xl w-full justify-center">
      <button
        onClick={onToggleAudio}
        aria-label={isAudioOn ? 'Mute microphone' : 'Unmute microphone'}
        title={isAudioOn ? 'Mute microphone' : 'Unmute microphone'}
        className={`hidden sm:block ${ICON_BUTTON} ${isAudioOn ? NEUTRAL : MUTED}`}
      >
        {isAudioOn ? <Mic size={20} /> : <MicOff size={20} />}
      </button>

      <button
        onClick={onToggleVideo}
        aria-label={isVideoOn ? 'Turn camera off' : 'Turn camera on'}
        title={isVideoOn ? 'Turn camera off' : 'Turn camera on'}
        className={`hidden sm:block ${ICON_BUTTON} ${isVideoOn ? NEUTRAL : MUTED}`}
      >
        {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
      </button>

      <button
        onClick={onOpenFilters}
        aria-label="Match filters"
        title="Match filters"
        className={`${isMatched ? 'hidden sm:block' : ''} ${ICON_BUTTON} ${NEUTRAL} relative`}
      >
        <SlidersHorizontal size={20} />
        {filtersActive && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#00F0FF]" />}
      </button>

      {/* Start / Stop */}
      <button
        onClick={onStartStop}
        disabled={isIdle && !canStart}
        className={`${TEXT_BUTTON} ${
          isIdle
            ? PRIMARY
            : 'bg-[#12151E]/90 hover:bg-red-500/10 border border-red-500/50 text-red-300 shadow-lg'
        }`}
      >
        {isIdle ? (
          <>
            <span>START</span>
            <Play size={16} className="hidden min-[400px]:block fill-slate-950" />
          </>
        ) : (
          <>
            <span>STOP</span>
            <Square size={14} className="hidden min-[400px]:block fill-red-300" />
          </>
        )}
      </button>

      {/* Next: skip the current partner */}
      <button
        onClick={onNext}
        disabled={!isMatched}
        title={isMatched ? 'Skip to someone new' : 'Available during a call'}
        className={`${TEXT_BUTTON} ${
          isMatched ? PRIMARY : 'bg-[#12151E]/70 border border-slate-800 text-slate-500'
        }`}
      >
        <span>NEXT</span>
        <SkipForward size={16} className={`hidden min-[400px]:block ${isMatched ? 'fill-slate-950' : ''}`} />
      </button>

      {/* Like: once per chat. Remounting the icon (key) replays the pop animation. */}
      {isMatched && (
        <button
          onClick={onLike}
          disabled={hasLiked}
          aria-label={hasLiked ? 'Liked' : 'Like'}
          aria-pressed={hasLiked}
          title={hasLiked ? 'You liked this chat' : 'Like'}
          className={`${ICON_BUTTON} ${
            hasLiked
              ? 'bg-[#FF2A7A]/20 border-[#FF2A7A]/60 text-[#FF2A7A] disabled:opacity-100 disabled:cursor-default'
              : 'bg-[#12151E]/90 hover:bg-[#FF2A7A]/10 border-[#FF2A7A]/40 text-[#FF7AA8]'
          }`}
        >
          <Heart key={likePulse} size={20} className={`${hasLiked ? 'fill-current' : ''} ${likePulse ? 'like-pop' : ''}`} />
        </button>
      )}

      <button
        onClick={onToggleChat}
        aria-label="Chat"
        title="Chat"
        className={`${ICON_BUTTON} relative bg-[#12151E]/90 hover:bg-slate-800 border-[#00F0FF]/40 text-[#00F0FF]`}
      >
        <MessageSquare size={20} />
        {hasUnreadChat && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#FF2A7A] animate-ping" />}
      </button>

      <button
        onClick={onGift}
        disabled={!isMatched}
        aria-label="Send a gift"
        title="Send a gift"
        className={`${ICON_BUTTON} bg-[#12151E]/90 hover:bg-slate-800 border-[#FFD166]/40 text-[#FFD166]`}
      >
        <Gift size={20} />
      </button>
    </div>
  );
}
