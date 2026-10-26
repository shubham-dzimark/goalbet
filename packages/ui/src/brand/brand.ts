/**
 * Brand identity. Rebrand by editing this file and tokens.css next to it.
 * The placeholder brand "GoalBet" is original — no third-party marks or palettes.
 */
export const brand = {
  name: 'GoalBet',
  /** Wordmark split: second part is drawn in the accent colour. */
  wordmark: ['Goal', 'Bet'],
  shortName: 'GB',
  /** Self-hosted font families (see fonts.ts + tokens.css). */
  fonts: { sans: 'Inter Variable', display: 'Barlow Condensed' },
  /** Logo mark (viewBox 0 0 32 32). Uses currentColor for the mark background. */
  logoMark: {
    viewBox: '0 0 32 32',
    background: 'M8 1h16a7 7 0 0 1 7 7v16a7 7 0 0 1-7 7H8a7 7 0 0 1-7-7V8a7 7 0 0 1 7-7Z',
    /** stylised "G" drawn as a goal frame with a ball */
    glyph:
      'M22.5 10.5A8 8 0 1 0 24 16h-7.5v3.2h3.6A4.8 4.8 0 1 1 19.7 12.6l2.8-2.1Z',
    ball: { cx: 16.5, cy: 16, r: 1.6 },
  },
} as const;
