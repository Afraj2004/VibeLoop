import React, { useState } from 'react';
import { avatarUrl } from '../../utils/avatar.js';

/**
 * Round profile photo, falling back to the user's initial on the brand gradient.
 * `online` adds a presence dot.
 */
export default function Avatar({ user, size = 36, online, className = '' }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const src = avatarUrl(user);
  const showImage = src && src !== failedSrc;

  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={{ width: size, height: size }}>
      {showImage ? (
        <img
          src={src}
          alt=""
          onError={() => setFailedSrc(src)}
          className="w-full h-full rounded-full object-cover border border-white/10"
        />
      ) : (
        <span
          className="w-full h-full rounded-full bg-gradient-to-br from-[#00F0FF] to-[#FF2A7A] flex items-center justify-center font-black text-slate-950"
          style={{ fontSize: Math.round(size * 0.42) }}
        >
          {(user?.username || '?').charAt(0).toUpperCase()}
        </span>
      )}
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-2 border-[#12151E] ${online ? 'bg-emerald-400' : 'bg-slate-600'}`}
          style={{ width: Math.max(9, size * 0.28), height: Math.max(9, size * 0.28) }}
        />
      )}
    </span>
  );
}
