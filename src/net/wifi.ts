/**
 * Wi-Fi table. Both phones must be on the same network; nothing leaves the LAN.
 *
 * Two ways the room can be served, tried in that order:
 *
 *   direct — the host phone runs the room server itself (`react-native-tcp-socket`,
 *            available in a dev build). Two phones, no computer, no internet.
 *   relay  — the host phone is a client too, and a tiny zero-dependency Node
 *            server on the same Wi-Fi pairs the two by room code. This is the
 *            path that works inside Expo Go, where an app cannot open a port.
 *            Run it with `npm run relay` (see server/relay.js).
 */

import { decode, encode, type NetMessage } from './protocol';
import { deadLink, type Availability, type HostOptions, type JoinOptions, type Link, type LinkEvents, type TransportDriver } from './link';
import { errorText, startTcpHost, tcpHostAvailable } from './ws/tcpHost';
import type { Connection } from './ws/hostServer';

const url = (address: string, port: number, code: string, role: 'host' | 'guest') =>
  `ws://${address}:${port}/?room=${encodeURIComponent(code)}&role=${role}`;

/** A WebSocket client link — used by the guest always, and by the host in relay mode. */
function clientLink(target: string, ev: LinkEvents, info: Link['info'], onOpen?: (send: (m: NetMessage) => void) => void): Link {
  let socket: WebSocket | null = null;
  let closedByUs = false;

  try {
    socket = new WebSocket(target);
  } catch (e) {
    ev.onStatus('error', errorText(e));
    return deadLink;
  }

  const send = (msg: NetMessage) => {
    if (socket && socket.readyState === 1) socket.send(encode(msg));
  };

  socket.onopen = () => onOpen?.(send);
  socket.onmessage = (e: { data: unknown }) => {
    const msg = decode(String(e.data));
    if (msg) ev.onMessage(msg);
  };
  socket.onerror = () => {
    if (!closedByUs) ev.onStatus('error', 'could not reach the table');
  };
  socket.onclose = () => {
    if (!closedByUs) ev.onStatus('closed');
  };

  return {
    send,
    info,
    close: (reason) => {
      closedByUs = true;
      try {
        if (reason && socket && socket.readyState === 1) socket.send(encode({ t: 'bye', reason }));
        socket?.close();
      } catch {
        /* already gone */
      }
      socket = null;
    },
  };
}

async function host(opts: HostOptions, ev: LinkEvents): Promise<Link> {
  ev.onStatus('starting');

  // 1. Serve the room from this phone if the platform lets us open a port.
  if (tcpHostAvailable()) {
    let guest: Connection | null = null;
    const handle = startTcpHost(opts.port, opts.code, {
      onListening: () => ev.onStatus('waiting'),
      onGuest: (conn) => {
        guest = conn;
        ev.onStatus('connected');
        // Direct mode has no relay to announce the pairing, so synthesise it and
        // keep the session layer identical for both modes.
        ev.onMessage({ t: 'peer', state: 'joined' });
      },
      onText: (text) => {
        const msg = decode(text);
        if (msg) ev.onMessage(msg);
      },
      onGuestGone: () => {
        guest = null;
        ev.onMessage({ t: 'peer', state: 'left' });
        ev.onStatus('waiting');
      },
      onError: (message) => ev.onStatus('error', message),
    });

    if (handle) {
      return {
        send: (msg) => guest?.send(encode(msg)),
        info: { mode: 'direct', hint: `${opts.address || 'this phone'}:${opts.port}` },
        close: (reason) => {
          guest?.close(reason);
          guest = null;
          handle.stop();
        },
      };
    }
  }

  // 2. Otherwise both phones meet at the relay.
  ev.onStatus('connecting');
  return clientLink(url(opts.address, opts.port, opts.code, 'host'), ev, {
    mode: 'relay',
    hint: `${opts.address}:${opts.port}`,
  }, () => ev.onStatus('waiting'));
}

async function join(opts: JoinOptions, ev: LinkEvents): Promise<Link> {
  ev.onStatus('connecting');
  return clientLink(
    url(opts.address, opts.port, opts.code, 'guest'),
    ev,
    { mode: 'relay', hint: `${opts.address}:${opts.port}` },
    () => ev.onStatus('connected'),
  );
}

async function availability(): Promise<Availability> {
  return { ok: true };
}

export const wifiDriver: TransportDriver = {
  kind: 'wifi',
  label: 'WI-FI',
  blurb: 'SAME NETWORK · NO INTERNET NEEDED',
  availability,
  host,
  join,
};

export const wifiHostsItself = tcpHostAvailable;
