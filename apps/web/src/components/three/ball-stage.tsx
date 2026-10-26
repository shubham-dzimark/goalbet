'use client';

import dynamic from 'next/dynamic';
import { type MutableRefObject, useEffect, useState } from 'react';
import { cn } from '@goalbet/ui';
import { prefersReducedMotion } from '@/lib/gsap';

const MatchBallScene = dynamic(() => import('./match-ball-scene'), { ssr: false, loading: () => <StaticBall /> });

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const ngon = (cx: number, cy: number, r: number, rot: number) =>
  Array.from({ length: 5 }, (_, i) => {
    const a = ((rot + i * 72) * Math.PI) / 180;
    return [r3(cx + r * Math.cos(a)), r3(cy + r * Math.sin(a))] as const;
  });
const pts = (p: readonly (readonly [number, number])[]) => p.map(([x, y]) => `${x},${y}`).join(' ');

// classic flat football: a centre pentagon, five outer pentagons pointing at it, seams between them
const CENTRE = ngon(50, 50, 13, -90);
const OUTER = CENTRE.map((_, i) => ngon(50 + 41 * Math.cos(((-90 + i * 72) * Math.PI) / 180), 50 + 41 * Math.sin(((-90 + i * 72) * Math.PI) / 180), 12, 90 + i * 72));
const SEAMS = [
  ...CENTRE.map((v, i) => [v, OUTER[i]![0]!] as const),
  ...OUTER.map((o, i) => [o[1]!, OUTER[(i + 1) % 5]![4]!] as const),
];

/** Lightweight SVG ball used on phones, without WebGL, with reduced motion, and while the 3D scene loads. */
export function StaticBall({ className }: { className?: string }) {
  return (
    <div className={cn('grid h-full w-full place-items-center', className)} aria-hidden="true">
      <div className="relative aspect-square h-full max-h-60 animate-[gb-float_5s_ease-in-out_infinite]">
        <div className="absolute inset-[-25%] rounded-full bg-[radial-gradient(circle,rgb(var(--brand-rgb)/0.32),transparent_65%)] blur-xl" />
        <svg viewBox="0 0 100 100" className="relative h-full w-full drop-shadow-[0_20px_36px_rgb(var(--brand-rgb)/0.35)]">
          <defs>
            <radialGradient id="sb-skin" cx="0.36" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.55" stopColor="#e6ecf3" />
              <stop offset="1" stopColor="#9fb0c4" />
            </radialGradient>
            <radialGradient id="sb-panel" cx="0.35" cy="0.3" r="0.9">
              <stop offset="0" stopColor="#14b87a" />
              <stop offset="1" stopColor="#075e3f" />
            </radialGradient>
            <radialGradient id="sb-shine" cx="0.32" cy="0.26" r="0.32">
              <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <clipPath id="sb-clip">
              <circle cx="50" cy="50" r="47" />
            </clipPath>
          </defs>
          <g clipPath="url(#sb-clip)">
            <g className="origin-center animate-[spin_40s_linear_infinite]">
              <circle cx="50" cy="50" r="47" fill="url(#sb-skin)" />
              {SEAMS.map(([a, b], i) => (
                <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#0d1a2b" strokeWidth="1.6" strokeLinecap="round" />
              ))}
              <polygon points={pts(CENTRE)} fill="url(#sb-panel)" stroke="#0d1a2b" strokeWidth="1.4" strokeLinejoin="round" />
              {OUTER.map((o, i) => (
                <polygon key={i} points={pts(o)} fill="url(#sb-panel)" stroke="#0d1a2b" strokeWidth="1.4" strokeLinejoin="round" />
              ))}
            </g>
            <circle cx="50" cy="50" r="47" fill="url(#sb-shine)" />
            <circle cx="50" cy="50" r="47" fill="none" stroke="rgb(0 0 0 / 0.28)" strokeWidth="6" />
          </g>
          <circle cx="50" cy="50" r="47" fill="none" stroke="rgb(var(--brand-rgb) / 0.55)" strokeWidth="1" />
        </svg>
      </div>
    </div>
  );
}

/**
 * The 3D ball is loaded lazily and only on large screens with WebGL and normal motion
 * preferences, so phones and low-power devices get the static version (no three.js download).
 */
export function BallStage({ scroll, className }: { scroll: MutableRefObject<number>; className?: string }) {
  const [threeD, setThreeD] = useState(false);
  useEffect(() => {
    const ok = window.matchMedia('(min-width: 1024px)').matches && !prefersReducedMotion() && webglAvailable();
    setThreeD(ok);
  }, []);
  return <div className={cn('relative', className)}>{threeD ? <MatchBallScene scroll={scroll} /> : <StaticBall />}</div>;
}
