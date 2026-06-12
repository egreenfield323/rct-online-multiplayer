import { World } from './types.js';

// World <-> JSON string. Used identically for: save files on the host's disk,
// join snapshots over the relay, and determinism hashing in tests.
// Typed arrays are packed to base64 (no DOM/Buffer — works in browser + node).

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : 0, c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out;
}

const B64R: Record<string, number> = {};
for (let i = 0; i < 64; i++) B64R[B64[i]] = i;

function b64ToBytes(s: string): Uint8Array {
  let n = (s.length / 4) * 3;
  if (s.endsWith('==')) n -= 2;
  else if (s.endsWith('=')) n -= 1;
  const out = new Uint8Array(n);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64R[s[i]], b = B64R[s[i + 1]], c = B64R[s[i + 2]] ?? 0, d = B64R[s[i + 3]] ?? 0;
    if (o < n) out[o++] = (a << 2) | (b >> 4);
    if (o < n) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (o < n) out[o++] = ((c & 3) << 6) | d;
  }
  return out;
}

function i16ToBytes(a: Int16Array): Uint8Array {
  const out = new Uint8Array(a.length * 2); // explicit little-endian
  for (let i = 0; i < a.length; i++) {
    out[i * 2] = a[i] & 0xff;
    out[i * 2 + 1] = (a[i] >> 8) & 0xff;
  }
  return out;
}

function bytesToI16(b: Uint8Array): Int16Array {
  const out = new Int16Array(b.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = (b[i * 2] | (b[i * 2 + 1] << 8)) << 16 >> 16;
  }
  return out;
}

const U8_FIELDS = ['heights', 'water', 'path', 'pathAdd', 'scen', 'litter'] as const;

export function serializeWorld(w: World): string {
  const plain: Record<string, unknown> = { ...w };
  for (const f of U8_FIELDS) plain[f] = bytesToB64(w[f]);
  plain.rideAt = bytesToB64(i16ToBytes(w.rideAt));
  return JSON.stringify(plain);
}

export function deserializeWorld(s: string): World {
  const plain = JSON.parse(s);
  for (const f of U8_FIELDS) plain[f] = b64ToBytes(plain[f]);
  plain.rideAt = bytesToI16(b64ToBytes(plain.rideAt));
  return plain as World;
}

// FNV-1a over the serialized form — equal hash ⇒ identical sim state
export function hashWorld(w: World): string {
  const s = serializeWorld(w);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
