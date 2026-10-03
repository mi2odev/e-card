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

  // The package can be installed and still have no native side behind it — that
  // is exactly the case inside Expo Go — so every call into it is guarded and a
  // failure means "no direct hosting here", not a crash.
  try {
    return listen(tcp, port, room, h);
  } catch (e) {
    h.onError(errorText(e));
    return null;
  }
}

function listen(tcp: TcpModule, port: number, room: string, h: TcpHostHandlers): TcpHostHandle | null {
  /** The one guest seat. `live` goes false the moment a socket stops owning it. */
  let seat: { socket: RawSocket; live: boolean } | null = null;
  /** Set once the table is put away, so a listen that lands late is undone. */
  let stopped = false;

  const server = tcp.createServer((socket) => {
    // Nobody is seated just for opening a socket. A browser checking whether
    // this phone can be reached, a search dialling every address on the
    // network, a dial that lands after it was given up on — none of them has
    // the room code, and none of them may cost the player at the table their
    // seat. Only a socket that has passed the handshake takes it.
    const mine = { socket, live: false };

    const wrapped: ByteSocket = {
      // The native socket throws on a write once it is closed, and a close can
      // land between any two writes. A frame for a socket that is gone has
      // nowhere to go; it must not take a heartbeat or a store update with it.
      write: (bytes) => {
        try {
          socket.write(bytes);
        } catch {
          /* gone; its close is on the way */
        }
      },
      destroy: () => {
        try {
          socket.destroy();
        } catch {
          /* already gone */
        }
      },
      onData: (cb) => socket.on('data', (d) => cb(toBytes(d))),
      onClose: (cb) => socket.on('close', () => cb()),
      onError: (cb) => socket.on('error', (e) => cb(e)),
    };

    attachHostConnection(wrapped, room, {
      onOpen: (conn) => {
        // One guest per table — but a phone that dropped off the Wi-Fi leaves a
        // socket that is dead without being closed, and it is the same phone
        // that then needs the seat back. So the newest socket with the code
        // takes it, and the old one is dropped rather than the new one.
        if (seat && seat !== mine) {
          seat.live = false;
          try {
            seat.socket.destroy();
          } catch {
            /* already gone */
          }
        }
        mine.live = true;
        seat = mine;
        h.onGuest(conn);
      },
      onText: (text) => {
        if (mine.live) h.onText(text);
      },
      onClose: () => {
        // A socket that was replaced is not a guest leaving: the seat it used to
        // hold is already someone else's, and the table never noticed.
        if (!mine.live) return;
        mine.live = false;
        seat = null;
        h.onGuestGone();
      },
    });
  });

  const close = () => {
    try {
      server.close();
    } catch {
      /* already down */
    }
  };

  server.on('error', (e) => {
    if (!stopped) h.onError(errorText(e));
  });
  try {
    server.listen({ port, host: '0.0.0.0' }, () => {
      // Given up on before it got here — a close asked for while the listen was
      // still in flight is a no-op, and would leave the port held for good.
      if (stopped) return close();
      h.onListening();
    });
  } catch (e) {
    h.onError(errorText(e));
    return null;
  }

  return {
    stop: () => {
      stopped = true;
      close();
    },
  };
}

export function errorText(e: unknown): string {
  if (!e) return 'unknown error';
  if (typeof e === 'string') return e;
  const msg = (e as { message?: unknown }).message;
  return typeof msg === 'string' ? msg : 'unknown error';
}
