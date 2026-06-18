import React, { useEffect, useState } from 'react';

export type MascotMood = 'idle' | 'waving' | 'thinking';

/**
 * Nekko — an 8-bit pixel cat that peeks in from the right edge of the window.
 * It waves on idle/greeting and "makes cat biscuits" (kneads its paws) while
 * the model is thinking. Rendered as crisp pixel art via an SVG rect grid.
 */
export function Mascot({ mood, enabled }: { mood: MascotMood; enabled: boolean }) {
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const t = setTimeout(() => setPeek(true), 400);
    return () => clearTimeout(t);
  }, [enabled]);

  if (!enabled) return null;
  const C = {
    body: '#f6a45c',
    dark: '#d97b38',
    cream: '#ffe2c0',
    ink: '#2a2018',
    blush: '#ff8f8f',
  };
  const px = (x: number, y: number, w: number, h: number, fill: string) => (
    <rect key={`${x}-${y}-${fill}`} x={x} y={y} width={w} height={h} fill={fill} />
  );

  return (
    <div
      className={`pointer-events-none fixed bottom-6 right-0 z-40 select-none ${peek ? 'nekko-peek' : ''}`}
      style={{ width: 92 }}
      title="Nekko"
    >
      <svg viewBox="0 0 32 40" width="92" height="115" shapeRendering="crispEdges" className="drop-shadow-lg">
        {/* ears */}
        {px(6, 2, 4, 4, C.body)}
        {px(18, 2, 4, 4, C.body)}
        {px(7, 3, 2, 2, C.dark)}
        {px(19, 3, 2, 2, C.dark)}
        {/* head */}
        {px(5, 5, 18, 13, C.body)}
        {px(5, 5, 18, 2, C.dark)}
        {/* eyes */}
        {px(9, 9, 2, 3, C.ink)}
        {px(17, 9, 2, 3, C.ink)}
        {/* blush */}
        {px(7, 12, 2, 2, C.blush)}
        {px(19, 12, 2, 2, C.blush)}
        {/* muzzle + nose */}
        {px(13, 12, 2, 2, C.cream)}
        {px(13, 12, 2, 1, C.blush)}
        {/* body */}
        {px(7, 18, 14, 14, C.body)}
        {px(7, 18, 14, 2, C.dark)}
        {px(11, 22, 6, 8, C.cream)}

        {/* left paw (waves when greeting) */}
        <g className={mood === 'waving' ? 'nekko-wave' : mood === 'thinking' ? 'nekko-knead-l' : ''}
           style={{ transformBox: 'fill-box' }}>
          {px(3, 20, 4, 6, C.body)}
          {px(3, 24, 4, 2, C.cream)}
        </g>
        {/* right paw (kneads biscuits when thinking) */}
        <g className={mood === 'thinking' ? 'nekko-knead-r' : ''} style={{ transformBox: 'fill-box' }}>
          {px(21, 20, 4, 6, C.body)}
          {px(21, 24, 4, 2, C.cream)}
        </g>

        {/* tail */}
        {px(21, 28, 6, 3, C.dark)}
        {/* feet */}
        {px(9, 31, 4, 3, C.dark)}
        {px(15, 31, 4, 3, C.dark)}
      </svg>
      {mood === 'thinking' && (
        <div
          className="absolute -top-2 left-1 text-[10px] font-mono"
          style={{ color: 'var(--ink-faint)' }}
        >
          knead… knead…
        </div>
      )}
    </div>
  );
}
