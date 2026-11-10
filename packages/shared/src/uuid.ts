/**
 * UUID v7 (RFC 9562): 48-bit ms timestamp + random. `random` defaults to
 * crypto.getRandomValues; the mobile app passes expo-crypto's implementation.
 */
let rng: (bytes: Uint8Array) => Uint8Array = (bytes) => {
  const c = (globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) return c.getRandomValues(bytes);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
};

export function setUuidRandomSource(fn: (bytes: Uint8Array) => Uint8Array): void {
  rng = fn;
}

let lastMs = 0;
let seq = 0;

export function uuidv7(now: number = Date.now()): string {
  const b = rng(new Uint8Array(16));
  // Monotonic within the same millisecond.
  if (now === lastMs) seq = (seq + 1) & 0xfff;
  else {
    lastMs = now;
    seq = ((b[6]! & 0x0f) << 8) | b[7]!;
  }
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = ts & 0xff;
    ts = Math.floor(ts / 256);
  }
  b[6] = 0x70 | ((seq >> 8) & 0x0f);
  b[7] = seq & 0xff;
  b[8] = 0x80 | (b[8]! & 0x3f);
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
