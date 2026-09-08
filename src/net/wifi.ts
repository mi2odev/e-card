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
 *
 * `hotspot` tables are the same sockets over a network one of the phones is
 * making itself. There is no router and nothing to type: the phone sharing the
 * connection serves the table directly, and the guest finds it by dialling the
 * handful of addresses a hotspot gateway can have (see ./discover).
 */

import { decode, encode, type NetMessage } from './protocol';
import { deadLink, type Availability, type HostOptions, type JoinOptions, type Link, type LinkEvents, type TransportDriver } from './link';
import { errorText, startTcpHost, tcpHostAvailable, type TcpHostHandle } from './ws/tcpHost';
import type { Connection } from './ws/hostServer';
import { hotspotTargets, localIpAddress } from './discover';

const url = (address: string, port: number, code: string, role: 'host' | 'guest') =>
  `ws://${address}:${port}/?room=${encodeURIComponent(code)}&role=${role}`;

/** Wire a socket — open or still dialling — into a link the session can use. */
function socketLink(
  opened: WebSocket,
  ev: LinkEvents,
  info: Link['info'],
  unreachable: string,
  // A socket that never opened was never a table. Saying "the other phone left"
  // in that case sends people hunting for the wrong problem entirely.
  everOpen: boolean,
  onOpen?: () => void,
): Link {
  let socket: WebSocket | null = opened;
  let closedByUs = false;

  const send = (msg: NetMessage) => {
    if (socket && socket.readyState === 1) socket.send(encode(msg));
  };

  const failed = () => {
    if (!closedByUs) ev.onStatus('error', unreachable);
  };

  socket.onopen = () => {
    everOpen = true;
    onOpen?.();
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

/** A WebSocket client link — used by the guest always, and by the host in relay mode. */
function clientLink(
  target: string,
  ev: LinkEvents,
  info: Link['info'],
  unreachable: string,
  onOpen?: () => void,
): Link {
  let socket: WebSocket;
  try {
    socket = new WebSocket(target);
  } catch (e) {
    ev.onStatus('error', errorText(e));
    return deadLink;
  }
  return socketLink(socket, ev, info, unreachable, false, onOpen);
}

export type Answer = { socket: WebSocket; address: string };

/** How long the search for a phone sharing a hotspot is given before it reports back. */
const SEARCH_MS = 6000;

/**
 * Dial every candidate address at once and keep the first that answers, closing
 * the rest.
 *
 * A table turns away the wrong room code during the handshake, so a socket that
 * opens is the table being looked for — not merely something else listening on
 * the port.
 */
export function firstAnswering(
  addresses: string[],
  port: number,
  code: string,
  timeoutMs = SEARCH_MS,
): Promise<Answer | null> {
  return new Promise((resolve) => {
    const dialled: WebSocket[] = [];
    let settled = false;
    let pending = addresses.length;
    if (!pending) return resolve(null);

    const finish = (winner: Answer | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const other of dialled) {
        if (other === winner?.socket) continue;
        try {
          other.close();
        } catch {
          /* never opened */
        }
      }
      resolve(winner);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);

    for (const address of addresses) {
      let socket: WebSocket;
      // One address failing outright must not take the whole search with it.
      let done = false;
      const gone = () => {
        if (done || settled) return;
        done = true;
        if (--pending === 0) finish(null);
      };
      try {
        socket = new WebSocket(url(address, port, code, 'guest'));
      } catch {
        gone();
        continue;
      }
      dialled.push(socket);
      socket.onopen = () => finish({ socket, address });
      socket.onerror = gone;
      socket.onclose = gone;
    }
  });
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

    // A phone sharing a hotspot cannot read its own address off the interface it
    // is serving on, and nobody has to type it anyway — so it says what it is
    // rather than where it is.
    const info: Link['info'] = opts.hotspot
      ? { mode: 'hotspot', hint: "SERVED BY THIS PHONE'S HOTSPOT" }
      : { mode: 'direct', hint: `${opts.address || 'this phone'}:${opts.port}` };

    handle = startTcpHost(opts.port, opts.code, {
      onListening: () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ev.onStatus('waiting');
        resolve({
          send: (msg) => guest?.send(encode(msg)),
          info,
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

  // On a hotspot there is no third machine to fall back to — the network only
  // exists because this phone is making it, and a relay would have to live on it.
  if (opts.hotspot) {
    ev.onStatus('error', CANNOT_SHARE);
    return deadLink;
  }

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

/**
 * Said when the dial never lands. The host in relay mode knows it was reaching
 * for a relay; a guest may have been given either a relay or a host phone, so it
 * is told what to check rather than what to run.
 */
const noRelay = (address: string, port: number) =>
  `NO RELAY AT ${address}:${port} — RUN "npm run relay" ON THAT COMPUTER, IN A SECOND TERMINAL, AND LEAVE IT OPEN`;

const noAnswer = (address: string, port: number) =>
  `NOTHING ANSWERED AT ${address}:${port} — CHECK THE ADDRESS, AND THAT BOTH PHONES ARE ON THE SAME WI-FI`;

const CANNOT_SHARE =
  'THIS COPY CANNOT SERVE A TABLE — EXPO GO IS NOT ALLOWED TO OPEN A PORT. THE PHONE SHARING THE HOTSPOT NEEDS THE BUILT APP; THE OTHER ONE DOES NOT.';

const noHotspotTable = (tried: string, port: number) =>
  `NO TABLE ANSWERED ON THE HOTSPOT${tried ? ` AT ${tried}:${port}` : ''} — JOIN THE OTHER PHONE'S HOTSPOT IN WI-FI SETTINGS, AND CHECK IT HAS PRESSED "OPEN THE TABLE"`;

/**
 * Find the phone that is sharing, and sit down at it.
 *
 * Nothing is typed here: the guest is on the host's own little network, and the
 * phone handing out the addresses is at a gateway address the guest can work out
 * from its own. Every candidate is dialled at once and the first that answers
 * with the right room code is the table.
 */
async function joinHotspot(opts: JoinOptions, ev: LinkEvents): Promise<Link> {
  ev.onStatus('connecting', 'LOOKING FOR THE PHONE SHARING THE HOTSPOT');

  const typed = opts.address.trim();
  const targets = typed ? [typed] : hotspotTargets(await localIpAddress());
  const found = await firstAnswering(targets, opts.port, opts.code);
  if (!found) {
    ev.onStatus('error', noHotspotTable(targets[0] ?? '', opts.port));
    return deadLink;
  }

  const link = socketLink(
    found.socket,
    ev,
    { mode: 'hotspot', hint: `FOUND ON THE HOTSPOT AT ${found.address}` },
    noAnswer(found.address, opts.port),
    true,
  );
  ev.onStatus('connected');
  return link;
}

async function join(opts: JoinOptions, ev: LinkEvents): Promise<Link> {
  if (opts.hotspot) return joinHotspot(opts, ev);
  ev.onStatus('connecting');
  return clientLink(
    url(opts.address, opts.port, opts.code, 'guest'),
    ev,
    { mode: 'relay', hint: `${opts.address}:${opts.port}` },
    noAnswer(opts.address, opts.port),
    () => ev.onStatus('connected'),
  );
}

async function availability(): Promise<Availability> {
  return { ok: true };
}

export const wifiDriver: TransportDriver = {
  kind: 'wifi',
  label: 'WI-FI',
  blurb: 'NEARBY · NO INTERNET NEEDED',
  availability,
  host,
  join,
};

export const wifiHostsItself = tcpHostAvailable;
