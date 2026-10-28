import React, { useEffect, useState } from 'react';

const HEARTS = 9;

/**
 * Hearts that float up and fade. Remounted (via key) each time a like is sent or received.
 */
export default function LikeBurst({ className = '' }) {
  const [hearts] = useState(() => Array.from({ length: HEARTS }, (_, i) => ({
    id: i,
    dx: `${Math.round((Math.random() - 0.5) * 160)}px`,
    rot: `${Math.round((Math.random() - 0.5) * 60)}deg`,
    delay: `${Math.round(Math.random() * 250)}ms`,
    size: 18 + Math.round(Math.random() * 16)
  })));
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDone(true), 1700);
    return () => clearTimeout(timer);
  }, []);

  if (done) return null;

  return (
    <div aria-hidden="true" className={`pointer-events-none absolute z-50 ${className}`}>
      {hearts.map((h) => (
        <span
          key={h.id}
          className="heart-float absolute left-0 bottom-0 opacity-0"
          style={{ '--dx': h.dx, '--rot': h.rot, animationDelay: h.delay, fontSize: h.size }}
        >
          ❤️
        </span>
      ))}
    </div>
  );
}
