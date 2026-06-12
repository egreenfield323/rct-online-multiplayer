import { World, serializeWorld, deserializeWorld } from '@park/shared';

// Park save files (.park): XOR-stream-ciphered JSON + checksum, base64-wrapped.
// This is tamper-resistant obfuscation with integrity checking, not real
// cryptography — there is no secret to protect in a co-op park save, we just
// want files that survive round-trips and fail loudly when corrupted/edited.

const MAGIC = 'OPENPARK1:';
const KEY = 0x51e57a9b;

function fnv(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32 keystream over the bytes
function xorStream(bytes: Uint8Array): Uint8Array {
  let state = KEY | 0;
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = bytes[i] ^ ((t ^ (t >>> 14)) & 0xff);
  }
  return out;
}

function b64encode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodePark(w: World): string {
  const body = serializeWorld(w);
  const wrapped = JSON.stringify({ v: 1, check: fnv(body), body });
  return MAGIC + b64encode(xorStream(new TextEncoder().encode(wrapped)));
}

export function decodePark(s: string): World {
  const text = s.trim();
  if (!text.startsWith(MAGIC)) throw new Error('Not an OpenPark save file.');
  let wrapped: { v: number; check: number; body: string };
  try {
    wrapped = JSON.parse(new TextDecoder().decode(xorStream(b64decode(text.slice(MAGIC.length)))));
  } catch {
    throw new Error('Save file is corrupted.');
  }
  if (wrapped.v !== 1 || fnv(wrapped.body) !== wrapped.check) throw new Error('Save file failed its integrity check.');
  return deserializeWorld(wrapped.body);
}

export function exportPark(w: World): void {
  const blob = new Blob([encodePark(w)], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${w.park.name.replace(/[^\w\- ]+/g, '').trim() || 'park'}.park`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function importPark(): Promise<World> {
  return new Promise((res, rej) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.park,.json,.txt';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return rej(new Error('No file chosen.'));
      try {
        res(decodePark(await f.text()));
      } catch (e) {
        rej(e);
      }
    };
    input.click();
  });
}

// monthly autosave (host/offline)
const AUTOSAVE = 'openpark-autosave';

export function autosave(w: World): void {
  try {
    localStorage.setItem(AUTOSAVE, encodePark(w));
  } catch {
    /* quota — skip silently */
  }
}

export function loadAutosave(): World | null {
  const s = localStorage.getItem(AUTOSAVE);
  if (!s) return null;
  try {
    return decodePark(s);
  } catch {
    return null;
  }
}
