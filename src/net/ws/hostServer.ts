/**
 * The host phone's side of a direct Wi-Fi table: a one-room WebSocket server.
 * Transport-agnostic — it talks to a `ByteSocket`, so the same code runs over
 * `react-native-tcp-socket` on a device and over `node:net` in the self-test.
 */

import {
  FrameDecoder,
  OP_CLOSE,
  OP_PING,
  OP_PONG,
  encodeFrame,
  encodeText,
  handshakeResponse,
  parseHandshake,
  rejectResponse,
  utf8Decode,
  utf8Encode,
} from './frames';

export type ByteSocket = {
  write: (bytes: Uint8Array) => void;
  destroy: () => void;
  onData: (cb: (bytes: Uint8Array) => void) => void;
  onClose: (cb: () => void) => void;
  onError: (cb: (err: unknown) => void) => void;
};

export type Connection = {
  send: (text: string) => void;
  close: (reason?: string) => void;
};

export type ConnectionHandlers = {
  /** Called once the upgrade succeeded and the room code matched. */
  onOpen: (conn: Connection) => void;
  onText: (text: string) => void;
  onClose: () => void;
};

/** Pull `room` out of `/?room=ABCD&role=guest`. */
export function roomOf(path: string): string {
  const q = path.indexOf('?');
  if (q < 0) return '';
  for (const pair of path.slice(q + 1).split('&')) {
    const [k, v = ''] = pair.split('=');
    if (k === 'room') return decodeURIComponent(v).toUpperCase();
  }
  return '';
}

/**
 * Drive one accepted socket through the upgrade and then the message loop.
 * Any socket presenting the wrong room code is turned away at the handshake.
 */
export function attachHostConnection(sock: ByteSocket, expectedRoom: string, h: ConnectionHandlers): void {
  let upgraded = false;
  let closed = false;
  // Header bytes are buffered raw: decoding them as text first would corrupt any
  // frame the client pipelined into the same TCP segment.
  let pending = new Uint8Array(0);
  const decoder = new FrameDecoder();

  // `onClose` fires exactly once for a connection that was ever open, no matter
  // which end hung up — the session layer must always learn the link is gone.
  let notified = false;
  const finish = () => {
    closed = true;
    if (upgraded && !notified) {
      notified = true;
      h.onClose();
    }
  };

  const conn: Connection = {
    send: (text) => {
      if (upgraded && !closed) sock.write(encodeText(text));
    },
    close: (reason) => {
      if (!closed && upgraded) {
        const body = utf8Encode(reason ?? '');
        const payload = new Uint8Array(2 + body.length);
        payload[0] = 0x03;
        payload[1] = 0xe8; // 1000, normal closure
        payload.set(body, 2);
        try {
          sock.write(encodeFrame(payload, OP_CLOSE));
        } catch {
          /* socket already gone */
        }
      }
      finish();
      sock.destroy();
    },
  };

  const bail = (response: string) => {
    closed = true;
    try {
      sock.write(utf8Encode(response));
    } catch {
      /* ignore */
    }
    sock.destroy();
  };

  sock.onError(() => {
    finish();
    sock.destroy();
  });

  sock.onClose(finish);

  sock.onData((bytes) => {
    if (closed) return;

    if (!upgraded) {
      const merged = new Uint8Array(pending.length + bytes.length);
      merged.set(pending, 0);
      merged.set(bytes, pending.length);
      pending = merged;
      if (pending.length > 8192) return bail(rejectResponse(431, 'Request Header Fields Too Large'));

      const end = findHeaderEnd(pending);
      if (end < 0) return;

      let hs;
      try {
        hs = parseHandshake(utf8Decode(pending.subarray(0, end)));
      } catch {
        return bail(rejectResponse());
      }
      if (!hs) return bail(rejectResponse());
      if (expectedRoom && roomOf(hs.path) !== expectedRoom.toUpperCase()) {
        return bail(rejectResponse(403, 'Wrong Room'));
      }

      sock.write(utf8Encode(handshakeResponse(hs.key)));
      upgraded = true;
      // Anything the client pipelined after the handshake is already framed.
      const tail = pending.slice(end);
      pending = new Uint8Array(0);
      h.onOpen(conn);
      if (tail.length) pump(tail);
      return;
    }
    pump(bytes);
  });

  function pump(bytes: Uint8Array) {
    let frames;
    try {
      frames = decoder.push(bytes);
    } catch {
      return conn.close('protocol error');
    }
    for (const f of frames) {
      if (f.opcode === OP_CLOSE) return conn.close();
      if (f.opcode === OP_PING) {
        sock.write(encodeFrame(f.payload, OP_PONG));
        continue;
      }
      if (f.opcode === OP_PONG) continue;
      h.onText(utf8Decode(f.payload));
    }
  }
}

/** Index just past the blank line that ends an HTTP request head, or -1. */
function findHeaderEnd(b: Uint8Array): number {
  for (let i = 3; i < b.length; i++) {
    if (b[i - 3] === 13 && b[i - 2] === 10 && b[i - 1] === 13 && b[i] === 10) return i + 1;
  }
  return -1;
}
