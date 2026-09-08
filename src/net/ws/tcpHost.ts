/**
 * Binds the one-room WebSocket server to a real TCP listener.
 *
 * `react-native-tcp-socket` is not part of the Expo Go runtime, so it is required
 * lazily and its absence is reported, never thrown. With it (a dev build or a
 * custom client) the host phone serves the table itself and no computer is
 * involved at all; without it the app falls back to the LAN relay.
 */

import { optionalModule } from '../link';
import { attachHostConnection, type ByteSocket, type Connection } from './hostServer';

type RawSocket = {
  on: (event: string, cb: (arg?: unknown) => void) => void;
  write: (data: unknown, encoding?: string) => void;
  destroy: () => void;
};

type TcpModule = {
  createServer: (handler: (socket: RawSocket) => void) => {
    listen: (opts: { port: number; host: string }, cb?: () => void) => void;
    on: (event: string, cb: (arg?: unknown) => void) => void;
    close: () => void;
  };
};

const loadTcp = () =>
  optionalModule<TcpModule>(() => {
    const mod = require('react-native-tcp-socket');
    return mod?.default ?? mod;
  });

export const tcpHostAvailable = () => loadTcp() !== null;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toBase64(bytes: Uint8Array): string {
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

/** Whatever the native bridge hands us — Buffer, typed array, or a latin-1 string. */
function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (Array.isArray(data)) return Uint8Array.from(data as number[]);
  if (data && typeof data === 'object' && 'length' in (data as ArrayLike<number>)) {
    return Uint8Array.from(data as ArrayLike<number>);
  }
  const str = String(data ?? '');
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

export type TcpHostHandle = { stop: () => void };

export type TcpHostHandlers = {
  onListening: () => void;
  onGuest: (conn: Connection) => void;
  onText: (text: string) => void;
  onGuestGone: () => void;
  onError: (message: string) => void;
};

/**
 * Serve one room on `port`. Returns null when the native module is missing, so
 * the caller can fall back rather than fail.
 */
export function startTcpHost(port: number, room: string, h: TcpHostHandlers): TcpHostHandle | null {
  const tcp = loadTcp();
  if (!tcp) return null;

  let taken = false;

  const server = tcp.createServer((socket) => {
    // One guest per table. A second dialler is dropped without disturbing the game.
    if (taken) {
      socket.destroy();
      return;
    }
    taken = true;

    const wrapped: ByteSocket = {
      write: (bytes) => socket.write(toBase64(bytes), 'base64'),
      destroy: () => socket.destroy(),
      onData: (cb) => socket.on('data', (d) => cb(toBytes(d))),
      onClose: (cb) => socket.on('close', () => cb()),
      onError: (cb) => socket.on('error', (e) => cb(e)),
    };

    attachHostConnection(wrapped, room, {
      onOpen: h.onGuest,
      onText: h.onText,
      onClose: () => {
        taken = false;
        h.onGuestGone();
      },
    });
  });

  server.on('error', (e) => h.onError(errorText(e)));
  try {
    server.listen({ port, host: '0.0.0.0' }, h.onListening);
  } catch (e) {
    h.onError(errorText(e));
    return null;
  }

  return { stop: () => {
    try {
      server.close();
    } catch {
      /* already down */
    }
  } };
}

export function errorText(e: unknown): string {
  if (!e) return 'unknown error';
  if (typeof e === 'string') return e;
  const msg = (e as { message?: unknown }).message;
  return typeof msg === 'string' ? msg : 'unknown error';
}
