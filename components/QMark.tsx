'use client';

/**
 * The Forge question mark: a drawn hook whose dot is the split YES/NO disc
 * from the wordmark. One glyph, used large behind the hero and small in
 * empty states — never as a barely-visible watermark.
 */
export default function QMark({
  size = 64,
  strokeOpacity = 1,
  stroke = 'var(--qn-foreground)',
}: {
  size?: number;
  strokeOpacity?: number;
  stroke?: string;
}) {
  const w = (size * 48) / 72;
  return (
    <svg
      aria-hidden
      width={w}
      height={size}
      viewBox="0 0 48 72"
      fill="none"
      style={{ display: 'block' }}
    >
      <path
        d="M 9 19 C 9 6, 39 6, 39 19 C 39 30, 24 29, 24 42 L 24 46"
        stroke={stroke}
        strokeOpacity={strokeOpacity}
        strokeWidth="8"
        strokeLinecap="round"
      />
      {/* the dot: the split market disc */}
      <g transform="rotate(-18 24 62)">
        <circle cx="24" cy="62" r="8" fill="var(--yes)" />
        <path d="M24 54 A8 8 0 0 1 24 70 Z" fill="var(--no)" />
        <circle cx="24" cy="62" r="8" fill="none" stroke={stroke} strokeOpacity={strokeOpacity} strokeWidth="1.6" />
      </g>
    </svg>
  );
}
