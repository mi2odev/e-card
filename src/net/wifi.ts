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
 * handful of addresses a hotspot gateway can have (see ./discover) — over and
 * over until it answers, since the two players never press their buttons at the
 * same moment and there is nothing here for either of them to correct.
 */

import { decode, encode, type NetMessage } from './protocol';
import { deadLink, type HostOptions, type JoinOptions, type Link, type LinkEvents, type TransportDriver } from './link';
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

/** How long one pass over the candidate addresses is given before it reports back. */
const SEARCH_MS = 6000;

/**
 * How long the guest keeps looking altogether, and how long it rests between
 * passes.
 *
 * One pass is not enough. The two players press their buttons seconds apart, and
 * whichever of them is quicker is usually the guest — so the common way to fail
 * is to go looking before the other phone has finished opening the table. There
 * is nothing to type here and nothing to correct, so the only useful answer to
 * "nobody answered" is to ask again.
 */
const HUNT_MS = 45_000;
const BETWEEN_SWEEPS_MS = 700;

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
          // Let go of it before closing: a dial that lands a moment later must
          // not report anything to a search that is already over.
          other.onopen = null;
          other.onerror = null;
          other.onclose = null;
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
const LISTEN_TIMEOUT_MS = 4000;

/**
 * What came of trying to serve the room from this phone.
 *
 *   null        — there is no in-app server in this build at all. Expo Go.
 *   { failure } — there is one, and it could not listen. A port still held by the
 *                 table this phone opened a minute ago is the usual reason, and
 *                 it is nothing whatever to do with Expo Go.
 *   { link }    — the table is being served.
 *
 * The difference matters: told the wrong one, a player goes off to build an app
 * they have already built.
 */
type DirectAttempt = { link: Link } | { failure: string } | null;

/** Serve the room from this phone. */
function tryDirectHost(opts: HostOptions, ev: LinkEvents): Promise<DirectAttempt> {
  if (!tcpHostAvailable()) return Promise.resolve(null);

  return new Promise<DirectAttempt>((resolve) => {
    let guest: Connection | null = null;
    let handle: TcpHostHandle | null = null;
    let settled = false;

    const giveUp = (failure: string) => {
      if (settled) return;
      settled = true;
      handle?.stop();
      resolve({ failure });
    };
    const timer = setTimeout(() => giveUp('IT NEVER STARTED LISTENING'), LISTEN_TIMEOUT_MS);

    // A phone sharing a hotspot cannot read its own address off the interface it
    // is serving on, and nobody has to type it anyway — so it says what it is
    // rather than where it is.
    const info: Link['info'] = opts.hotspot
      ? { mode: 'hotspot', hint: "SERVED BY THIS PHONE'S HOTSPOT" }
      : {
          mode: 'direct',
          hint: opts.address ? `${opts.address}:${opts.port}` : `PORT ${opts.port}`,
        };

    handle = startTcpHost(opts.port, opts.code, {
      onListening: () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ev.onStatus('waiting');
        resolve({
          link: {
            send: (msg) => guest?.send(encode(msg)),
            info,
            close: (reason) => {
              guest?.close(reason);
              guest = null;
              handle?.stop();
            },
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
        // Before it is listening this is why the table could not be opened;
        // after, it is a real fault on a table people are sitting at.
        if (settled) ev.onStatus('error', message);
        else {
          clearTimeout(timer);
          giveUp(message);
        }
      },
    });

    if (!handle && !settled) {
      settled = true;
      clearTimeout(timer);
      // The module answered for itself a moment ago and is gone now — which is
      // not this build lacking it, so it is not reported as such.
      resolve({ failure: 'THE SERVER WOULD NOT START' });
    }
  });
}

async function host(opts: HostOptions, ev: LinkEvents): Promise<Link> {
  ev.onStatus('starting');

  // A table this phone serves is reached by an address the other player types
  // in, so it is worth a moment's asking to have one to read out — the screen
  // that opened the table may well have asked before the Wi-Fi had settled.
  // A hotspot host is the exception: the interface it serves on is the one
  // neither platform will report, and nobody types anything there anyway.
  const serving = opts.hotspot || opts.address ? opts : { ...opts, address: await localIpAddress(3) };

  // 1. Serve the room from this phone if the platform lets us open a port.
  const direct = await tryDirectHost(serving, ev);
  if (direct && 'link' in direct) return direct.link;

  // On a hotspot there is no third machine to fall back to — the network only
  // exists because this phone is making it, and a relay would have to live on it.
  if (opts.hotspot) {
    ev.onStatus('error', direct ? cannotListen(direct.failure, opts.port) : CANNOT_SHARE, true);
    return deadLink;
  }

  // 2. Otherwise both phones meet at the relay.
  if (!opts.address) {
    ev.onStatus(
      'error',
      'THIS COPY CANNOT HOST BY ITSELF — ENTER THE ADDRESS OF A COMPUTER RUNNING THE RELAY',
      true,
    );
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
  `NOTHING ANSWERED AT ${address}:${port} — CHECK THE ADDRESS, AND THAT BOTH PHONES ARE ON THE SAME WI-FI. OPENING http://${address}:${port} IN THIS PHONE'S BROWSER SAYS WHETHER IT CAN BE REACHED AT ALL.`;

/**
 * Said when there is no in-app server in this copy at all.
 *
 * Expo Go is the usual reason and used to be the only one named — which reads
 * as nonsense on a phone that downloaded the app, and sends the player off to
 * build something they are already running. So it says what is true either way
 * first, and what to do about it second.
 */
const CANNOT_SHARE =
  'THIS COPY CANNOT SERVE A TABLE — IT HAS NO WAY TO OPEN A PORT. THAT IS NORMAL IN EXPO GO, WHICH IS NOT ALLOWED ONE; IN A DOWNLOADED APP IT MEANS THE BUILD WENT OUT WITHOUT THE PART THAT DOES IT. THE PHONE SHARING THE HOTSPOT NEEDS A BUILD THAT HAS IT; THE OTHER ONE DOES NOT.';

/**
 * This build *can* serve a table and this time it could not. Almost always the
 * port is still held by the table this phone opened before — so say that, rather
 * than send a player off to build an app they are already running.
 */
const cannotListen = (why: string, port: number) =>
  `THIS PHONE COULD NOT OPEN PORT ${port} TO SERVE THE TABLE — ${why.toUpperCase()}. CLOSE ANY OTHER COPY OF THE GAME, OR GIVE THE LAST TABLE A MOMENT TO LET GO OF THE PORT, AND TRY AGAIN.`;

const noHotspotTable = (tried: string[], port: number) =>
  `NO TABLE ANSWERED ON THE HOTSPOT${tried.length ? ` — TRIED ${tried.join(', ')} ON PORT ${port}` : ''}. JOIN THE OTHER PHONE'S HOTSPOT IN WI-FI SETTINGS, AND CHECK IT HAS PRESSED "OPEN THE TABLE"`;

const LOOKING = 'LOOKING FOR THE PHONE SHARING THE HOTSPOT';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Find the phone that is sharing, and sit down at it.
 *
 * Nothing is typed here: the guest is on the host's own little network, and the
 * phone handing out the addresses is at a gateway address the guest can work out
 * from its own. Every candidate is dialled at once and the first that answers
 * with the right room code is the table.
 *
 * And if none of them answers, it is asked again. The other phone may simply not
 * be open yet — the two players are pressing their buttons seconds apart — and a
 * guest that gave up on the first pass would be sitting on an error while the
 * table it wants finishes opening a foot away. The candidates are worked out
 * afresh each time too: a phone that had no address to give a moment ago usually
 * has one by the next pass.
 */
async function joinHotspot(opts: JoinOptions, ev: LinkEvents): Promise<Link> {
  const typed = opts.address.trim();
  const deadline = Date.now() + HUNT_MS;
  let tried: string[] = typed ? [typed] : [];
  let found: Answer | null = null;

  for (let sweep = 1; ; sweep++) {
    ev.onStatus('connecting', sweep === 1 ? LOOKING : `${LOOKING} (${sweep})`);
    const targets = typed ? [typed] : hotspotTargets(await localIpAddress(2));
    if (targets.length) tried = targets;

    found = await firstAnswering(targets, opts.port, opts.code);
    if (found || Date.now() >= deadline) break;
    await sleep(BETWEEN_SWEEPS_MS);
  }

  if (!found) {
    ev.onStatus('error', noHotspotTable(tried, opts.port));
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

export const wifiDriver: TransportDriver = {
  kind: 'wifi',
  host,
  join,
};

export const wifiHostsItself = tcpHostAvailable;
