'use client';

/**
 * Favicon activity spinner: while a signature or deploy is in flight, the
 * tab's split disc spins (canvas frames swapped into the icon link). Firefox
 * and Chrome show it; Safari ignores dynamic favicons, which is a fine
 * no-op. Refcounted so overlapping operations share one spinner.
 */

let active = 0;
let timer: number | null = null;
let angle = 0;
let originalHref: string | null = null;

function iconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}

function drawFrame(deg: number): string {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.translate(16, 16);
  ctx.rotate(((deg - 18) * Math.PI) / 180);
  // green half
  ctx.beginPath();
  ctx.arc(0, 0, 14, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.closePath();
  ctx.fillStyle = '#6cff75';
  ctx.fill();
  // purple half
  ctx.beginPath();
  ctx.arc(0, 0, 14, -Math.PI / 2, Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = '#a855f7';
  ctx.fill();
  return c.toDataURL('image/png');
}

export function startFaviconSpin(): void {
  active++;
  if (timer !== null) return;
  const link = iconLink();
  originalHref = originalHref ?? link.href;
  timer = window.setInterval(() => {
    angle = (angle + 30) % 360;
    const frame = drawFrame(angle);
    if (frame) iconLink().href = frame;
  }, 90);
}

export function stopFaviconSpin(): void {
  active = Math.max(0, active - 1);
  if (active > 0 || timer === null) return;
  window.clearInterval(timer);
  timer = null;
  angle = 0;
  if (originalHref) iconLink().href = originalHref;
}
