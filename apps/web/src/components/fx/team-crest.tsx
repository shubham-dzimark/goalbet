'use client';

import { useState } from 'react';
import { cn } from '@goalbet/ui';

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const SHAPES = [
  // classic shield
  'M16 2 L28 6 V15 C28 23 22 28 16 30 C10 28 4 23 4 15 V6 Z',
  // round badge (two half arcs; a single full-circle arc is degenerate)
  'M16 2 A14 14 0 0 1 16 30 A14 14 0 0 1 16 2 Z',
  // pointed shield
  'M5 3 H27 V14 C27 22 21 27 16 30 C11 27 5 22 5 14 Z',
  // hexagon
  'M16 2 L28 9 V23 L16 30 L4 23 V9 Z',
];

function initials(name: string) {
  const words = name
    .replace(/\b(FC|CF|AFC|SC|AC|FK|SV|CD|SS|US|RB|VfB|VfL|TSG|1\.)\b/gi, ' ')
    .split(/[\s.-]+/)
    .filter(Boolean);
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/**
 * Team badge: the club's real logo from the data provider when there is one, otherwise (demo
 * feed, or the image fails to load) a generated crest.
 */
export function TeamCrest({ name, logo, size = 32, className }: { name: string; logo?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (logo && !failed) {
    // plain <img>: small remote badges need no Next.js image optimisation
    return (
      <img
        src={logo}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={cn('shrink-0 object-contain drop-shadow-[0_4px_10px_rgb(0_0_0/0.45)]', className)}
      />
    );
  }
  return <GeneratedCrest name={name} size={size} className={className} />;
}

/**
 * Original, generated team crest: shape, colours and stripe pattern are derived from the
 * team name, so every club gets a stable identity without a real club logo.
 */
function GeneratedCrest({ name, size, className }: { name: string; size: number; className?: string | undefined }) {
  const h = hash(name);
  const hue = h % 360;
  const hue2 = (hue + 140 + ((h >>> 9) % 80)) % 360;
  const shape = SHAPES[(h >>> 3) % SHAPES.length]!;
  const pattern = (h >>> 6) % 3;
  const id = `crest-${h.toString(36)}`;
  const primary = `hsl(${hue} 48% 36%)`;
  const secondary = `hsl(${hue2} 42% 58%)`;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={cn('shrink-0 drop-shadow-[0_4px_10px_rgb(0_0_0/0.45)]', className)} role="img" aria-label={name}>
      <defs>
        <clipPath id={id}>
          <path d={shape} />
        </clipPath>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="32" height="32" fill={primary} />
        {pattern === 0 ? <rect x="12" width="8" height="32" fill={secondary} /> : null}
        {pattern === 1 ? <path d="M0 22 L32 10 V18 L0 30 Z" fill={secondary} /> : null}
        {pattern === 2 ? <rect y="19" width="32" height="13" fill={secondary} /> : null}
        <rect width="32" height="32" fill={`url(#${id}-g)`} />
      </g>
      <path d={shape} fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth="1.2" />
      <text
        x="16"
        y="18.5"
        textAnchor="middle"
        fontSize={initials(name).length > 2 ? 7.5 : 9}
        fontWeight="800"
        fill="#fff"
        style={{ fontFamily: 'var(--font-display)', letterSpacing: '0.02em' }}
        stroke="rgb(0 0 0 / 0.35)"
        strokeWidth="0.6"
        paintOrder="stroke"
      >
        {initials(name)}
      </text>
    </svg>
  );
}
