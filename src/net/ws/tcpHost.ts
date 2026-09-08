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
  /** Accepts a Uint8Array directly; 'data' arrives as a Buffer, which is one too. */
  write: (data: Uint8Array) => void;
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

/**
 * The JavaScript package can load perfectly well with no native half behind it —
 * which is exactly the situation inside Expo Go, where `NativeModules.TcpSockets`
 * is simply absent. Asking the package whether it exists would answer yes and
 * send the lobby into a hosting mode that cannot work, so ask the bridge instead.
 */
const nativeTcpPresent = () =>
  optionalModule<object>(() => {
    const { NativeModules } = require('react-native') as { NativeModules?: Record<string, object> };
    return NativeModules?.TcpSockets ?? null;
  }) !== null;

export const tcpHostAvailable = () => nativeTcpPresent() && loadTcp() !== null;

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

  // The package can be installed and still have no native side behind it — that
  // is exactly the case inside Expo Go — so every call into it is guarded and a
  // failure means "no direct hosting here", not a crash.
  try {
    return listen(tcp, port, room, h, () => taken, (v) => {
      taken = v;
    });
  } catch (e) {
    h.onError(errorText(e));
    return null;
  }
}

function listen(
  tcp: TcpModule,
  port: number,
  room: string,
  h: TcpHostHandlers,
  isTaken: () => boolean,
  setTaken: (v: boolean) => void,
): TcpHostHandle | null {
  const server = tcp.createServer((socket) => {
    // One guest per table. A second dialler is dropped without disturbing the game.
    if (isTaken()) {
      socket.destroy();
      return;
    }
    setTaken(true);

    const wrapped: ByteSocket = {
      write: (bytes) => socket.write(bytes),
      destroy: () => socket.destroy(),
      onData: (cb) => socket.on('data', (d) => cb(toBytes(d))),
      onClose: (cb) => socket.on('close', () => cb()),
      onError: (cb) => socket.on('error', (e) => cb(e)),
    };

    attachHostConnection(wrapped, room, {
      onOpen: h.onGuest,
      onText: h.onText,
      onClose: () => {
        setTaken(false);
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
