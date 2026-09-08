/**
 * A minimal RFC 6455 server codec — handshake, frames, UTF-8 — written against
 * plain byte arrays so it can run on Hermes (no Buffer, no crypto, no TextEncoder)
 * and be unit-tested from Node. Server side only: we accept a browser/RN
 * WebSocket client, we never dial out with it.
 */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/* ------------------------------------------------------------------- utf-8 */

export function utf8Encode(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if (b < 0xe0) {
      cp = ((b & 31) << 6) | (bytes[i + 1] & 63);
      i += 2;
    } else if (b < 0xf0) {
      cp = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63);
      i += 3;
    } else {
      cp = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63);
      i += 4;
    }
    if (cp > 0xffff) {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ base64 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

export function base64Decode(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array((clean.length * 3) >> 2);
  let at = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[at++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, at);
}

/* -------------------------------------------------------------------- sha-1 */

export function sha1(bytes: Uint8Array): Uint8Array {
  const ml = bytes.length;
  const withPad = new Uint8Array((((ml + 8) >> 6) + 1) << 6);
  withPad.set(bytes);
  withPad[ml] = 0x80;
  const bitLen = ml * 8;
  // Length is 64-bit big-endian; messages here are far below 2^32 bits.
  withPad[withPad.length - 4] = (bitLen >>> 24) & 0xff;
  withPad[withPad.length - 3] = (bitLen >>> 16) & 0xff;
  withPad[withPad.length - 2] = (bitLen >>> 8) & 0xff;
  withPad[withPad.length - 1] = bitLen & 0xff;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Int32Array(80);
  const rol = (n: number, s: number) => (n << s) | (n >>> (32 - s));

  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] =
        (withPad[off + i * 4] << 24) |
        (withPad[off + i * 4 + 1] << 16) |
        (withPad[off + i * 4 + 2] << 8) |
        withPad[off + i * 4 + 3];
    }
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const tmp = (rol(a, 5) + f + e + k + w[i]) | 0;
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = tmp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  const out = new Uint8Array(20);
  [h0, h1, h2, h3, h4].forEach((h, i) => {
    out[i * 4] = (h >>> 24) & 0xff;
    out[i * 4 + 1] = (h >>> 16) & 0xff;
    out[i * 4 + 2] = (h >>> 8) & 0xff;
    out[i * 4 + 3] = h & 0xff;
  });
  return out;
}

export const acceptKey = (clientKey: string) => base64(sha1(utf8Encode(clientKey + GUID)));

/* --------------------------------------------------------------- handshake */

export type Handshake = { key: string; path: string };

/** Returns null while the request is still incomplete, throws on a bad one. */
export function parseHandshake(request: string): Handshake | null {
  if (!request.includes('\r\n\r\n')) return null;
  const [head, ...rest] = request.split('\r\n');
  const m = /^GET\s+(\S+)\s+HTTP\/1\.1$/i.exec(head.trim());
  if (!m) throw new Error('not a websocket request');
  let key = '';
  let upgraded = false;
  for (const line of rest) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (name === 'sec-websocket-key') key = value;
    if (name === 'upgrade' && value.toLowerCase() === 'websocket') upgraded = true;
  }
  if (!key || !upgraded) throw new Error('not a websocket request');
  return { key, path: m[1] };
}

export function handshakeResponse(key: string): string {
  return [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey(key)}`,
    '',
    '',
  ].join('\r\n');
}

export const rejectResponse = (code = 400, reason = 'Bad Request') =>
  [`HTTP/1.1 ${code} ${reason}`, 'Connection: close', 'Content-Length: 0', '', ''].join('\r\n');

/* ------------------------------------------------------------------ frames */

export const OP_TEXT = 0x1;
export const OP_CLOSE = 0x8;
export const OP_PING = 0x9;
export const OP_PONG = 0xa;

/** Server→client frames are never masked. */
export function encodeFrame(payload: Uint8Array, opcode = OP_TEXT): Uint8Array {
  const len = payload.length;
  let header: number[];
  if (len < 126) header = [0x80 | opcode, len];
  else if (len < 65536) header = [0x80 | opcode, 126, (len >> 8) & 0xff, len & 0xff];
  else
    header = [
      0x80 | opcode,
      127,
      0,
      0,
      0,
      0,
      (len >>> 24) & 0xff,
      (len >>> 16) & 0xff,
      (len >>> 8) & 0xff,
      len & 0xff,
    ];
  const out = new Uint8Array(header.length + len);
  out.set(header, 0);
  out.set(payload, header.length);
  return out;
}

export const encodeText = (text: string) => encodeFrame(utf8Encode(text), OP_TEXT);

export type Frame = { opcode: number; payload: Uint8Array };

/** Guards against a peer announcing a preposterous length. */
export const MAX_FRAME_BYTES = 1 << 20;

/** Incremental reader: feed it whatever the socket hands you, take whole frames out. */
export class FrameDecoder {
  private buf = new Uint8Array(0);
  private fragmentOp = 0;
  private fragments: Uint8Array[] = [];

  push(chunk: Uint8Array): Frame[] {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;

    const out: Frame[] = [];
    for (;;) {
      const frame = this.shift();
      if (!frame) break;
      const { fin, opcode, payload } = frame;
      if (opcode === 0x0 || (fin === false && (opcode === OP_TEXT || opcode === 0x2))) {
        if (opcode !== 0x0) {
          this.fragmentOp = opcode;
          this.fragments = [];
        }
        this.fragments.push(payload);
        if (fin) {
          out.push({ opcode: this.fragmentOp, payload: concat(this.fragments) });
          this.fragments = [];
          this.fragmentOp = 0;
        }
        continue;
      }
      out.push({ opcode, payload });
    }
    return out;
  }

  private shift(): { fin: boolean; opcode: number; payload: Uint8Array } | null {
    const b = this.buf;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let off = 2;
    if (len === 126) {
      if (b.length < off + 2) return null;
      len = (b[off] << 8) | b[off + 1];
      off += 2;
    } else if (len === 127) {
      if (b.length < off + 8) return null;
      // Only the low 32 bits can matter — anything larger is rejected below.
      const hi = (b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3];
      len = hi !== 0 ? Number.MAX_SAFE_INTEGER : ((b[off + 4] << 24) >>> 0) + (b[off + 5] << 16) + (b[off + 6] << 8) + b[off + 7];
      off += 8;
    }
    if (len > MAX_FRAME_BYTES) throw new Error('frame too large');
    const maskLen = masked ? 4 : 0;
    if (b.length < off + maskLen + len) return null;

    const mask = masked ? b.subarray(off, off + 4) : null;
    off += maskLen;
    const payload = new Uint8Array(len);
    for (let i = 0; i < len; i++) payload[i] = mask ? b[off + i] ^ mask[i & 3] : b[off + i];
    this.buf = b.slice(off + len);
    return { fin, opcode, payload };
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
