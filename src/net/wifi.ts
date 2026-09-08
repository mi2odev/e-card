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
import { errorText, startTcpHost, tcpHostAvailable, type TcpHostHandle } from './ws/tcpHost';
import type { Connection } from './ws/hostServer';

const url = (address: string, port: number, code: string, role: 'host' | 'guest') =>
  `ws://${address}:${port}/?room=${encodeURIComponent(code)}&role=${role}`;

/** A WebSocket client link — used by the guest always, and by the host in relay mode. */
function clientLink(
  target: string,
  ev: LinkEvents,
  info: Link['info'],
  unreachable: string,
  onOpen?: (send: (m: NetMessage) => void) => void,
): Link {
  let socket: WebSocket | null = null;
  let closedByUs = false;
  // A socket that never opened was never a table. Saying "the other phone left"
  // in that case sends people hunting for the wrong problem entirely.
  let everOpen = false;

  try {
    socket = new WebSocket(target);
  } catch (e) {
    ev.onStatus('error', errorText(e));
    return deadLink;
  }

  const send = (msg: NetMessage) => {
    if (socket && socket.readyState === 1) socket.send(encode(msg));
  };

  const failed = () => {
    if (!closedByUs) ev.onStatus('error', unreachable);
  };

  socket.onopen = () => {
    everOpen = true;
    onOpen?.(send);
  };
  socket.onmessage = (e: { data: unknown }) => {
    const msg = decode(String(e.data));
    if (msg) ev.onMessage(msg);
  };
  // A failed dial fires onerror and then onclose. Both report the same thing, so
  // the second one cannot wipe the diagnosis the first one gave.
  socket.onerror = () => {
    if (!everOpen) failed();
  };
  socket.onclose = () => {
    if (closedByUs) return;
    if (everOpen) ev.onStatus('closed');
    else failed();
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

/**
 * How long to give the in-app server to say it is listening before giving up on
 * it. The native module can be installed but inert — inside Expo Go, say — and
 * that must fall back to the relay rather than leave the host on a dead socket.
 */
const LISTEN_TIMEOUT_MS = 2500;

/** Serve the room from this phone. Resolves null if that is not possible here. */
function tryDirectHost(opts: HostOptions, ev: LinkEvents): Promise<Link | null> {
  if (!tcpHostAvailable()) return Promise.resolve(null);

  return new Promise<Link | null>((resolve) => {
    let guest: Connection | null = null;
    let handle: TcpHostHandle | null = null;
    let settled = false;

    const giveUp = () => {
      if (settled) return;
      settled = true;
      handle?.stop();
      resolve(null);
    };
    const timer = setTimeout(giveUp, LISTEN_TIMEOUT_MS);

    handle = startTcpHost(opts.port, opts.code, {
      onListening: () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ev.onStatus('waiting');
        resolve({
          send: (msg) => guest?.send(encode(msg)),
          info: { mode: 'direct', hint: `${opts.address || 'this phone'}:${opts.port}` },
          close: (reason) => {
            guest?.close(reason);
            guest = null;
            handle?.stop();
          },
        });
      },
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
      onError: (message) => {
        // Before it is listening this is just "no direct hosting here"; after,
        // it is a real fault on a table people are sitting at.
        if (settled) ev.onStatus('error', message);
        else {
          clearTimeout(timer);
          giveUp();
        }
      },
    });

    if (!handle && !settled) {
      settled = true;
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function host(opts: HostOptions, ev: LinkEvents): Promise<Link> {
  ev.onStatus('starting');

  // 1. Serve the room from this phone if the platform lets us open a port.
  const direct = await tryDirectHost(opts, ev);
  if (direct) return direct;

  // 2. Otherwise both phones meet at the relay.
  if (!opts.address) {
    ev.onStatus('error', 'THIS BUILD CANNOT HOST BY ITSELF — ENTER THE ADDRESS OF A COMPUTER RUNNING "npm run relay"');
    return deadLink;
  }
  ev.onStatus('connecting');
  return clientLink(
    url(opts.address, opts.port, opts.code, 'host'),
    ev,
    { mode: 'relay', hint: `${opts.address}:${opts.port}` },
    noRelay(opts.address, opts.port),
    () => ev.onStatus('waiting'),
  );
}

/** Said out loud on both phones when the dial never lands. */
const noRelay = (address: string, port: number) =>
  `NO RELAY AT ${address}:${port} — RUN "npm run relay" ON THAT COMPUTER AND CHECK BOTH PHONES ARE ON ITS WI-FI`;

async function join(opts: JoinOptions, ev: LinkEvents): Promise<Link> {
  ev.onStatus('connecting');
  return clientLink(
    url(opts.address, opts.port, opts.code, 'guest'),
    ev,
    { mode: 'relay', hint: `${opts.address}:${opts.port}` },
    noRelay(opts.address, opts.port),
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
