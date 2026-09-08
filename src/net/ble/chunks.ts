/**
 * BLE characteristics carry a couple of hundred bytes at best, and a match
 * snapshot is a kilobyte or two of JSON. Messages are therefore split into
 * numbered chunks and reassembled on the far side.
 *
 * Wire form of one chunk:  `<msgId>:<index>:<count>:<base64 slice>`
 *
 * The payload is sliced as *bytes* and base64'd per slice, so a multi-byte
 * character straddling a chunk boundary survives the trip. Ids are per-sender
 * and monotonic, so a chunk from an abandoned message can never be spliced into
 * the next one.
 */

import { CHUNK_BYTES } from './bridge';
import { base64, base64Decode, utf8Decode, utf8Encode } from '../ws/frames';

const HEADER_BUDGET = 24;

export function splitMessage(id: number, text: string): string[] {
  const bytes = utf8Encode(text);
  // base64 costs 4 bytes per 3, so work back from the chunk budget.
  const budget = Math.max(12, Math.floor(((CHUNK_BYTES - HEADER_BUDGET) * 3) / 4));
  const count = Math.max(1, Math.ceil(bytes.length / budget));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(`${id}:${i}:${count}:${base64(bytes.subarray(i * budget, (i + 1) * budget))}`);
  }
  return out;
}

/** Base64 is what both ble-plx and most peripheral bridges speak. */
export const encodeChunk = (chunk: string) => base64(utf8Encode(chunk));
export const decodeChunk = (value: string) => utf8Decode(base64Decode(value));

export class ChunkAssembler {
  private id = -1;
  private parts: (Uint8Array | null)[] = [];
  private have = 0;

  /** Returns a complete message, or null while one is still arriving. */
  push(chunk: string): string | null {
    const m = /^(\d+):(\d+):(\d+):([A-Za-z0-9+/=]*)$/.exec(chunk);
    if (!m) return null;
    const id = Number(m[1]);
    const index = Number(m[2]);
    const count = Number(m[3]);
    if (count < 1 || index >= count) return null;

    if (id !== this.id) {
      this.id = id;
      this.parts = new Array(count).fill(null);
      this.have = 0;
    }
    if (this.parts.length !== count) return null;
    if (this.parts[index]) return null; // duplicate chunk
    this.parts[index] = base64Decode(m[4]);
    this.have++;
    if (this.have < count) return null;

    const total = this.parts.reduce<number>((n, p) => n + (p ? p.length : 0), 0);
    const joined = new Uint8Array(total);
    let at = 0;
    for (const p of this.parts) {
      if (p) {
        joined.set(p, at);
        at += p.length;
      }
    }
    this.id = -1;
    this.parts = [];
    this.have = 0;
    return utf8Decode(joined);
  }
}
