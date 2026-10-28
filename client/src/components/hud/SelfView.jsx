import React, { useRef, useState } from 'react';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';

const SIDE_CLASS = {
  right: 'right-3 sm:right-6',
  left: 'left-3 sm:left-6'
};

// Movement (px) before a press counts as a drag rather than a tap
const DRAG_THRESHOLD = 8;

function TileButton({ on, onClick, label, OnIcon, OffIcon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Keep taps on the buttons from starting a drag
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={label}
      title={label}
      className={`p-1.5 rounded-xl backdrop-blur-md border transition-colors cursor-pointer ${
        on ? 'bg-black/50 border-white/10 text-white' : 'bg-red-500/30 border-red-500/50 text-red-200'
      }`}
    >
      {on ? <OnIcon size={14} /> : <OffIcon size={14} />}
    </button>
  );
}

/**
 * Your own camera as a picture-in-picture tile. Drag it to either side; it snaps to the
 * nearest one. On phones it also carries the mic/camera toggles to free up the control bar.
 */
export default function SelfView({
  videoRef, showVideo, side = 'right', onSideChange,
  isAudioOn, isVideoOn, onToggleAudio, onToggleVideo
}) {
  const [offset, setOffset] = useState(null);
  const dragRef = useRef(null);

  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    setOffset({ dx, dy });
  };

  const onPointerUp = (e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setOffset(null);
    if (!drag?.moved) return;
    const stage = e.currentTarget.parentElement.getBoundingClientRect();
    onSideChange?.(e.clientX < stage.left + stage.width / 2 ? 'left' : 'right');
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={offset ? { transform: `translate(${offset.dx}px, ${offset.dy}px)` } : undefined}
      className={`absolute top-24 ${SIDE_CLASS[side]} z-30 w-24 h-32 min-[400px]:w-28 min-[400px]:h-40 sm:w-44 sm:h-60 rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-700/80 shadow-2xl bg-[#12151E]/80 backdrop-blur-xl touch-none select-none ${
        offset ? 'cursor-grabbing scale-105 shadow-[0_0_30px_rgba(0,240,255,0.25)]' : 'cursor-grab transition-all duration-300'
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`w-full h-full object-cover scale-x-[-1] pointer-events-none ${showVideo ? '' : 'hidden'}`}
      />
      {!showVideo && (
        <div className="w-full h-full flex items-center justify-center text-slate-500 bg-[#08090D]">
          <VideoOff size={28} />
        </div>
      )}

      <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md text-[10px] font-bold text-slate-300">
        YOU
      </div>

      {/* Phones: mic/camera live on the tile; wider screens have them in the control bar */}
      <div className="sm:hidden absolute bottom-1.5 inset-x-0 flex justify-center gap-1.5">
        <TileButton on={isAudioOn} onClick={onToggleAudio} label={isAudioOn ? 'Mute microphone' : 'Unmute microphone'} OnIcon={Mic} OffIcon={MicOff} />
        <TileButton on={isVideoOn} onClick={onToggleVideo} label={isVideoOn ? 'Turn camera off' : 'Turn camera on'} OnIcon={Video} OffIcon={VideoOff} />
      </div>
    </div>
  );
}
