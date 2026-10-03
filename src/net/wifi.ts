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
 * The guest is not asked where the table is. It goes looking: the address the
 * player typed if they typed one, the gateway a phone sharing a hotspot sits at,
 * and then every other address on its own network, nearest first (see
 * ./discover) — over and over until something answers with the right room
 * code, since the two players never press their buttons at the same moment.
 *
 * `hotspot` tables are the same sockets over a network one of the phones is
 * making itself. There is no router and nothing to type: the phone sharing the
 * connection serves the table directly, and the guest finds it the same way.
 */

import { decode, encode, type NetMessage } from './protocol';
import { deadLink, type HostOptions, type JoinOptions, type Link, type LinkEvents, type TransportDriver } from './link';
import { errorText, startTcpHost, tcpHostAvailable, type TcpHostHandle } from './ws/tcpHost';
import type { Connection } from './ws/hostServer';
import {
  type Endpoint,
  endpointText,
  hotspotTargets,
  isHostname,
  isIpv4,
  lanTargets,
  localIpAddress,
  parseAddress,
} from './discover';
import { NOTICE, lookingForHotspot, lookingOnWifi, type Notice } from './notice';

/**
 * `find` asks a relay to answer only if the table is really there. A relay
 * otherwise opens for any room code at all — that is how the guest who presses
 * first gets to wait for the host — and a search would stop at the first relay
 * it met, empty room or not. A phone serving a table turns away a wrong code
 * whatever is asked, so to it the flag means nothing.
 */
const url = (at: Endpoint, code: string, role: 'host' | 'guest', find = false) =>
  `ws://${at.host}:${at.port}/?room=${encodeURIComponent(code)}&role=${role}${find ? '&find=1' : ''}`;

const DIALABLE = /^ws:\/\/([^/:?#]+):(\d{1,5})\/\?room=[A-Za-z0-9]{1,8}&role=(host|guest)(&find=1)?$/;

/**
 * Whether a URL is one the native socket layer will take.
 *
 * On Android a WebSocket is handed straight to OkHttp on a native thread, and
 * OkHttp throws on a URL it cannot parse — two ports, a comma, a space — where
 * no try/catch in the app can reach it. The app does not report an error; it
 * closes. Every address is read properly long before it gets here, so this is
 * the last line, not the first: whatever slips past it is never dialled.
 */
export function dialable(target: string): boolean {
  const m = DIALABLE.exec(target);
  if (!m) return false;
  const port = Number(m[2]);
  const host = m[1];
  return port >= 1 && port <= 65535 && (/^[\d.]+$/.test(host) ? isIpv4(host) : isHostname(host));
}

/** The one place a socket is opened. Throws — in JavaScript, where it can be caught — rather than crash. */
function openSocket(target: string): WebSocket {
  if (!dialable(target)) throw new Error(`not an address that can be dialled: ${target}`);
  return new WebSocket(target);
}

/** Wire a socket — open or still dialling — into a link the session can use. */
function socketLink(
  opened: WebSocket,
  ev: LinkEvents,
  info: Link['info'],
  unreachable: Notice,
  // A socket that never opened was never a table. Saying "the other phone left"
  // in that case sends people hunting for the wrong problem entirely.
  everOpen: boolean,
  onOpen?: () => void,
  // Whatever arrived between the socket opening and this link taking it over.
  backlog: string[] = [],
): Link {
  let socket: WebSocket | null = opened;
  let closedByUs = false;

  const send = (msg: NetMessage) => {
    try {
      if (socket && socket.readyState === 1) socket.send(encode(msg));
    } catch {
      /* closing under us; its close event says so */
    }
  };

  const failed = () => {
    if (!closedByUs) ev.onStatus('error', unreachable);
  };

  const deliver = (raw: string) => {
    const msg = decode(raw);
    if (msg) ev.onMessage(msg);
  };

  socket.onopen = () => {
    everOpen = true;
    onOpen?.();
  };
  socket.onmessage = (e: { data: unknown }) => deliver(String(e.data));
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

  for (const raw of backlog.splice(0)) deliver(raw);

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

/** A WebSocket client link to an address the player gave — the host in relay mode, or a guest told where to go. */
function clientLink(
  target: string,
  ev: LinkEvents,
  info: Link['info'],
  unreachable: Notice,
  onOpen?: () => void,
): Link {
  let socket: WebSocket;
  try {
    socket = openSocket(target);
  } catch (e) {
    // A URL that cannot be built now cannot be built on the next try either.
    ev.onStatus('error', NOTICE.unexpected(errorText(e)), true);
    return deadLink;
  }
  return socketLink(socket, ev, info, unreachable, false, onOpen);
}

/* ------------------------------------------------------------- the search */

/** Somewhere worth dialling, and how long it gets to answer. */
export type Target = Endpoint & { waitMs?: number };

export type Answer = {
  socket: WebSocket;
  at: Endpoint;
  /** Messages that arrived before anything had taken the socket over. */
  backlog: string[];
};

export type SearchOptions = {
  /** How long one address gets to answer, unless it says otherwise. */
  waitMs?: number;
  /** How many addresses are being dialled at any one moment. */
  width?: number;
  /** Stop dialling once this passes, whatever is left. */
  deadline?: number;
  stillWanted?: () => boolean;
  /** How many have been dialled so far — for the screen to show the search moving. */
  onDialled?: (count: number) => void;
};

/** How long one pass over the candidate addresses is given before it reports back. */
const SEARCH_MS = 6000;

/** How often a search in progress asks whether anyone still wants it. */
const ABANDON_CHECK_MS = 250;

/**
 * Put down a dial that is no longer wanted.
 *
 * Closing a socket that is still dialling does nothing at all on Android: the
 * native side only learns of a socket once it has opened, so it carries on and
 * opens anyway — and React Native then announces it as open. Left alone, that
 * is a connection to the table nobody is listening to, and it takes the seat
 * from the one that is. So a dial that lands after it was given up on is hung
 * up the moment it does.
 */
function hangUp(socket: WebSocket) {
  socket.onopen = () => {
    try {
      socket.close();
    } catch {
      /* gone */
    }
  };
  socket.onerror = null;
  socket.onclose = null;
  socket.onmessage = null;
  try {
    socket.close();
  } catch {
    /* never opened */
  }
}

/**
 * Dial the candidates, a window of them at a time, and keep the first that
 * answers.
 *
 * A table turns away the wrong room code during the handshake, and a relay
 * asked with `find` turns away a room with nobody hosting it, so a socket that
 * opens is the table being looked for — not merely something else listening on
 * the port.
 *
 * Addresses with nothing behind them never refuse; they just say nothing until
 * the dial times out. So each is given a short while and its place in the window
 * goes to the next, which walks a whole network in seconds rather than minutes.
 */
export function firstAnswering(targets: Target[], code: string, opts: SearchOptions = {}): Promise<Answer | null> {
  const { waitMs = SEARCH_MS, width = 40, deadline, stillWanted, onDialled } = opts;

  return new Promise((resolve) => {
    const queue = targets.slice();
    const live = new Set<WebSocket>();
    let settled = false;
    let dialled = 0;

    const wanted = () => (!stillWanted || stillWanted()) && (!deadline || Date.now() < deadline);

    const finish = (winner: Answer | null) => {
      if (settled) return;
      settled = true;
      clearInterval(abandoned);
      // Let go of the rest before closing them: a dial that lands a moment later
      // must not report anything to a search that is already over.
      for (const other of live) if (other !== winner?.socket) hangUp(other);
      live.clear();
      resolve(winner);
    };

    // Walking away from the table drops every socket in the air, rather than
    // leaving them to dial out the rest of the search on their own.
    const abandoned = setInterval(() => {
      if (!wanted()) finish(null);
    }, ABANDON_CHECK_MS);

    const next = (): void => {
      if (settled) return;
      if (!queue.length || !wanted()) {
        if (!live.size) finish(null);
        return;
      }
      const target = queue.shift()!;
      const at = { host: target.host, port: target.port };
      dialled += 1;
      onDialled?.(dialled);

      let socket: WebSocket;
      try {
        socket = openSocket(url(at, code, 'guest', true));
      } catch {
        // One address failing outright must not take the whole search with it.
        return next();
      }
      live.add(socket);

      let done = false;
      const giveUp = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        live.delete(socket);
        if (settled) return;
        hangUp(socket);
        next();
      };
      const timer = setTimeout(giveUp, target.waitMs ?? waitMs);

      socket.onopen = () => {
        if (done || settled) return;
        done = true;
        clearTimeout(timer);
        live.delete(socket);
        const backlog: string[] = [];
        socket.onmessage = (e: { data: unknown }) => backlog.push(String(e.data));
        socket.onerror = null;
        socket.onclose = null;
        finish({ socket, at, backlog });
      };
      socket.onerror = giveUp;
      socket.onclose = giveUp;
    };

    const start = Math.max(1, Math.min(width, queue.length));
    for (let i = 0; i < start; i++) next();
  });
}

/* ------------------------------------------------------------ hosting */

/**
 * How long to give the in-app server to say it is listening before giving up on
 * it. The native module can be installed but inert — inside Expo Go, say — and
 * that must not leave the host on a dead socket.
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
        if (settled) ev.onStatus('error', NOTICE.servingFailed(message));
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

  // A table this phone serves can still be reached by an address typed in, so it
  // is worth a moment's asking to have one to read out — the screen that opened
  // the table may well have asked before the Wi-Fi had settled. A hotspot host
  // is the exception: the interface it serves on is the one neither platform
  // will report, and nobody types anything there anyway.
  const serving = opts.hotspot || opts.address ? opts : { ...opts, address: await localIpAddress(3) };

  // 1. Serve the room from this phone if the platform lets us open a port.
  const direct = await tryDirectHost(serving, ev);
  if (direct && 'link' in direct) return direct.link;

  // This copy can serve; it just could not this time. Falling back to a relay
  // is no answer to that — the only address to hand is this phone's own, so it
  // dialled itself and reported that nothing was relaying there. The port is
  // what is wrong, ports come free, and the session tries it again.
  if (direct) {
    ev.onStatus('error', NOTICE.portTaken(direct.failure, opts.port));
    return deadLink;
  }

  // On a hotspot there is no third machine to fall back to — the network only
  // exists because this phone is making it, and a relay would have to live on it.
  if (opts.hotspot) {
    ev.onStatus('error', NOTICE.cannotServe(), true);
    return deadLink;
  }

  // 2. Otherwise both phones meet at the relay.
  if (!opts.address.trim()) {
    ev.onStatus('error', NOTICE.needsRelayAddress(), true);
    return deadLink;
  }
  const relay = parseAddress(opts.address, opts.port);
  if (!relay) {
    ev.onStatus('error', NOTICE.badAddress(opts.address), true);
    return deadLink;
  }
  ev.onStatus('connecting');
  return clientLink(
    url(relay, opts.code, 'host'),
    ev,
    { mode: 'relay', hint: endpointText(relay) },
    NOTICE.noRelay(relay.host, relay.port),
    () => ev.onStatus('waiting'),
  );
}

/* ------------------------------------------------------------- joining */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
 * How long each kind of address is given. The ones somebody named — typed in,
 * or the gateway a hotspot is at — are worth waiting on; the rest of the network
 * is mostly addresses with nothing behind them, and a phone serving a table on
 * the same Wi-Fi answers well inside this.
 *
 * The width is kept modest for Android's sake: a dial given up on there is not
 * actually stopped (see `hangUp`), and runs on a native thread of its own until
 * the network gives up on it too — a few seconds for an address with nobody
 * behind it. Thirty-two at a time keeps that to a few dozen threads, and still
 * walks a whole network in about twelve seconds.
 */
const NAMED_WAIT_MS = 5000;
const SWEEP_WAIT_MS = 1500;
const SWEEP_WIDTH = 32;

/** Everything worth dialling for a table, best guess first. */
export function seekTargets(typed: Endpoint | null, ownIp: string, port: number): Target[] {
  const out: Target[] = [];
  const seen = new Set<string>();
  const add = (at: Endpoint, waitMs: number) => {
    const key = endpointText(at);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...at, waitMs });
  };
  if (typed) add(typed, NAMED_WAIT_MS);
  for (const host of hotspotTargets(ownIp)) add({ host, port }, NAMED_WAIT_MS);
  for (const host of lanTargets(ownIp)) add({ host, port }, SWEEP_WAIT_MS);
  return out;
}

/**
 * Find the table, and sit down at it.
 *
 * The guest knows the room code and, usually, nothing else. Everything it could
 * be is dialled — whatever was typed, then the gateway a phone sharing a hotspot
 * sits at, then outwards from its own address across the network — and the
 * first that answers with that code is the table.
 *
 * And if none of them answers, it is asked again. The other phone may simply not
 * be open yet — the two players are pressing their buttons seconds apart — and a
 * guest that gave up on the first pass would be sitting on an error while the
 * table it wants finishes opening a foot away. The candidates are worked out
 * afresh each time too: a phone that had no address to give a moment ago usually
 * has one by the next pass.
 */
async function seekTable(opts: JoinOptions, ev: LinkEvents): Promise<Link> {
  const raw = opts.address.trim();
  const typed = raw ? parseAddress(raw, opts.port) : null;
  if (raw && !typed) {
    ev.onStatus('error', NOTICE.badAddress(raw), true);
    return deadLink;
  }

  const deadline = Date.now() + HUNT_MS;
  const looking = opts.hotspot ? lookingForHotspot : lookingOnWifi;
  let tried: Target[] = typed ? [typed] : [];
  let ownIp = '';
  let found: Answer | null = null;

  const wanted = () => opts.stillWanted?.() !== false;

  for (let sweep = 1; wanted(); sweep++) {
    ev.onStatus('connecting', looking(sweep));
    ownIp = (await localIpAddress(2)) || ownIp;
    if (!wanted()) break;
    const targets = seekTargets(typed, ownIp, opts.port);
    if (targets.length) tried = targets;

    // The screen shows the search moving, but not on every one of two hundred
    // dials — a step every few is plenty to watch.
    let shown = 0;
    ev.onSearch?.(0, targets.length);
    found = await firstAnswering(targets, opts.code, {
      width: SWEEP_WIDTH,
      deadline,
      stillWanted: opts.stillWanted,
      onDialled: (n) => {
        if (n - shown >= 6 || n === targets.length) {
          shown = n;
          ev.onSearch?.(n, targets.length);
        }
      },
    });
    if (found || Date.now() >= deadline) break;
    await sleep(BETWEEN_SWEEPS_MS);
  }

  if (found && !wanted()) {
    // Answered, but into an empty room: the player left while it was looking.
    hangUp(found.socket);
    found = null;
  }

  if (!found) {
    // Nobody to tell, if the search was abandoned rather than spent. A search
    // that was spent has already asked again and again for most of a minute;
    // starting the whole sweep over on the session's backoff would keep the
    // radio busy for minutes more, so it stops here and the lobby offers TRY
    // AGAIN.
    if (wanted()) ev.onStatus('error', missing(opts, tried, ownIp, !!typed), true);
    return deadLink;
  }

  const where = endpointText(found.at);
  const link = socketLink(
    found.socket,
    ev,
    opts.hotspot
      ? { mode: 'hotspot', hint: `FOUND ON THE HOTSPOT AT ${where}`, found: where }
      : { mode: 'found', hint: where, found: where },
    NOTICE.nothingAnswered(found.at.host, found.at.port),
    true,
    undefined,
    found.backlog,
  );
  ev.onStatus('connected');
  return link;
}

/** Why a search came back empty, as specifically as it can be said. */
function missing(opts: JoinOptions, tried: Target[], ownIp: string, typed: boolean): Notice {
  const named = tried.filter((t) => (t.waitMs ?? NAMED_WAIT_MS) >= NAMED_WAIT_MS).map(endpointText);
  const swept = tried.length - named.length;
  // Without its own address a phone has no network to search, and the handful of
  // fixed guesses it can still make are not what the player is expecting.
  if (!ownIp && !typed) return NOTICE.cannotSearch(!!opts.hotspot);
  if (opts.hotspot) return NOTICE.noHotspotTable(named, swept, opts.port);
  return NOTICE.noWifiTable(named, swept, opts.port);
}

async function join(opts: JoinOptions, ev: LinkEvents): Promise<Link> {
  // Nothing to dial is the same thing as being asked to look.
  if (opts.hotspot || opts.seek || !opts.address.trim()) return seekTable(opts, ev);

  const at = parseAddress(opts.address, opts.port);
  if (!at) {
    ev.onStatus('error', NOTICE.badAddress(opts.address), true);
    return deadLink;
  }
  ev.onStatus('connecting');
  return clientLink(
    url(at, opts.code, 'guest'),
    ev,
    { mode: 'relay', hint: endpointText(at) },
    NOTICE.nothingAnswered(at.host, at.port),
    () => ev.onStatus('connected'),
  );
}

export const wifiDriver: TransportDriver = {
  kind: 'wifi',
  host,
  join,
};

export const wifiHostsItself = tcpHostAvailable;
