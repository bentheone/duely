export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Darken a colour until white text on it passes `target` contrast (default 4.5:1). */
export function darkenForWhiteText(hex: string, target = 4.5): string {
  let rgb = hexToRgb(hex);
  let out = rgbToHex(rgb);
  for (let i = 0; i < 40 && contrastRatio(out, '#FFFFFF') < target; i++) {
    rgb = rgb.map((c) => c * 0.94) as [number, number, number];
    out = rgbToHex(rgb);
  }
  return out;
}

/** Mixes a colour with a background at `alpha` (for course-tinted blocks). */
export function tint(hex: string, bg: string, alpha: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(bg);
  return rgbToHex(a.map((c, i) => c * alpha + b[i]! * (1 - alpha)) as [number, number, number]);
}

/** Google Calendar event colour ids (1..11) → hex. */
export const GOOGLE_EVENT_COLORS: Record<string, string> = {
  '1': '#7986CB',
  '2': '#33B679',
  '3': '#8E24AA',
  '4': '#E67C73',
  '5': '#F6BF26',
  '6': '#F4511E',
  '7': '#039BE5',
  '8': '#616161',
  '9': '#3F51B5',
  '10': '#0B8043',
  '11': '#D50000',
};

export function closestGoogleColorId(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  let best = '1';
  let bestD = Infinity;
  for (const [id, c] of Object.entries(GOOGLE_EVENT_COLORS)) {
    const [r2, g2, b2] = hexToRgb(c);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}
