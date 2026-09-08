/**
 * Ties a transport link to the game store.
 *
 * The host owns the match: it is the only device that shuffles, moves money or
 * advances a phase. After every change it pushes a snapshot — redacted so the
 * guest is never sent the other hand — and the guest adopts it wholesale. The
 * guest's screens never mutate shared state; they send intents and wait for the
 * snapshot that comes back.
 *
 * A link that drops is not the end of the match. The session keeps the table it
 * was dialling, redials it on a backoff, and — because the host still holds the
 * whole match — the phone that comes back is simply sent the board as it now
 * stands. Walk away on purpose and the table is parked instead, so the seat can
 * be taken again from the two-phones screen (see `resumeSession`).
 */

import { useGame } from '../store/useGame';
import { useNet } from '../store/useNet';
import { seatSide, applySnapshot, makeSnapshot, snapshotKey, type Snapshot } from './snapshot';
import { DEFAULT_PORT, type Intent, type LinkStatus, type NetMessage, PROTOCOL_VERSION } from './protocol';
import type { Link, TransportDriver, TransportKind } from './link';
import { wifiDriver } from './wifi';

export const DRIVERS: Record<TransportKind, TransportDriver> = {
  wifi: wifiDriver,
};

const GUEST_SEAT = 'p2' as const;
const HOST_SEAT = 'p1' as const;

/**
 * How long to wait before each redial. The first is quick — most drops are a
 * screen locking or a moment of bad Wi-Fi — and they back off from there so a
 * table that is genuinely gone is not hammered.
 */
const RETRY_DELAYS_MS = [600, 1200, 2500, 4000, 6000, 9000, 12000, 15000];

/** About two minutes of trying before the player is asked whether to keep going. */
const MAX_RETRIES = 14;

/** Heartbeat interval, and the silence after which the far phone counts as gone. */
const HEARTBEAT_MS = 4000;
const SILENT_MS = 12_000;

const SAY = {
  dropped: 'THE LINK DROPPED — TAKING THE SEAT AGAIN',
  quiet: 'THE OTHER PHONE HAS GONE QUIET',
  gaveUp: 'COULD NOT GET BACK TO THE TABLE — TRY AGAIN?',
  guestLeft: 'THE CHALLENGER LEFT THE TABLE — THE SEAT IS OPEN AGAIN',
};

let link: Link | null = null;
let unsubscribeStore: (() => void) | null = null;
let seq = 0;
let lastKey = '';
let helloSent = false;

/** The table being played, kept so a link that dies can be dialled again. */
let table: StartOptions | null = null;
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;
let lastHeard = 0;
/** A dial that never landed is a wrong address, not a drop — only redial a link that worked. */
let everWorked = false;
/** Whether the two phones have ever been paired on this table, which changes what an empty room means. */
let everPaired = false;
/** Bumped by every dial, so a link that arrives late from an abandoned one is dropped. */
let generation = 0;
/** The other phone said it was leaving. There is nothing to dial back to. */
let peerLeftForGood = false;
/** Someone is expected at the other end of this link, so silence from it means something. */
let expectPeer = false;
/** Whether that silence has already been reported, so it is said once and not every beat. */
let saidQuiet = false;
/** Set while the session is being torn down, so the closing link is not chased. */
let leaving = false;

/** The table this phone walked away from, and the match as it stood on it. */
let parked: { table: StartOptions; snap: Snapshot } | null = null;

export type StartOptions = {
  kind: TransportKind;
  role: 'host' | 'guest';
  code: string;
  address?: string;
  port?: number;
  name: string;
  /** Wi-Fi tables only: the host phone is the one sharing the network — see ./wifi. */
  hotspot?: boolean;
};

export const isLive = () => link !== null;

const seatOf = (role: 'host' | 'guest') => (role === 'host' ? HOST_SEAT : GUEST_SEAT);

/** Push the current match to the guest, unless nothing it can see has changed. */
function broadcast(): void {
  if (!link) return;
  const snap = makeSnapshot(useGame.getState(), GUEST_SEAT);
  const key = snapshotKey(snap);
  if (key === lastKey) return;
  lastKey = key;
  link.send({ t: 'state', seq: ++seq, snap });
}

/** Host-side: force the reveal to its end state, then move the match along. */
function advanceOnHost(): void {
  const g = useGame.getState();
  if (g.phase !== 'reveal') return;
  if (g.rev < 4) useGame.setState({ rev: 4 });
  useGame.getState().applyResult();
  useGame.getState().continueReveal();
}

function applyIntent(intent: Intent): void {
  const g = useGame.getState();
  const guestSide = () => seatSide(GUEST_SEAT, g.resolvedStart, g.game);

  switch (intent.k) {
    case 'name': {
      const name = String(intent.value ?? '').slice(0, 14);
      useGame.setState({ p2: name });
      useNet.getState().patch({ peerName: name, peerHere: true });
      break;
    }
    case 'stake':
      // Only the Slave side names the wager, and only between games.
      if (g.phase === 'scoreboard' && guestSide() === 'slv') g.setStake(Number(intent.value));
      break;
    case 'deal':
      if (g.phase === 'scoreboard' && g.inMatch) g.deal();
      break;
    case 'pick':
      if (g.phase === 'select') g.submitPick(guestSide(), Number(intent.index));
      break;
    case 'advance':
      advanceOnHost();
      break;
    case 'rematch':
      if (g.phase === 'end') g.beginMatch();
      break;
  }
}

function onMessage(role: 'host' | 'guest', msg: NetMessage): void {
  const net = useNet.getState();
  // Anything at all off the wire proves the far phone is still there.
  lastHeard = Date.now();
  if (saidQuiet) {
    saidQuiet = false;
    net.patch({ peerHere: true, detail: '' });
  }

  switch (msg.t) {
    case 'peer':
      if (msg.state === 'alone') {
        // The relay pairs by room code, so an empty room means the two phones do
        // not agree on it. Say so, rather than sitting on a silent "waiting" —
        // unless they have already played together, in which case the other one
        // is simply not back yet.
        net.patch({
          status: 'waiting',
          retrying: false,
          detail: everPaired
            ? `THE OTHER PHONE IS NOT BACK AT CODE ${net.code} YET — THIS SEAT IS HELD`
            : `NO TABLE OPEN ON CODE ${net.code} — CHECK THE FOUR CHARACTERS, AND THAT THE OTHER PHONE HAS PRESSED "OPEN THE TABLE"`,
        });
        break;
      }
      if (msg.state === 'joined') {
        everWorked = true;
        everPaired = true;
        peerLeftForGood = false;
        expectPeer = true;
        retries = 0;
        net.patch({ peerHere: true, status: 'connected', detail: '', retrying: false, attempt: 0 });
        // Both ends announce themselves; whoever is already up answers.
        if (role === 'host') link?.send({ t: 'welcome', v: PROTOCOL_VERSION, name: useGame.getState().p1 });
        else sayHello();
        if (role === 'host') {
          lastKey = '';
          broadcast();
        }
      } else {
        // The seat emptied. The link itself is a socket and stays perfectly
        // good, so there is nothing to redial — the table simply waits.
        expectPeer = false;
        net.patch({ peerHere: false, peerName: '' });
      }
      break;

    case 'hello':
      if (role !== 'host') break;
      if (msg.v !== PROTOCOL_VERSION) {
        net.patch({ status: 'error', detail: 'THE OTHER PHONE IS RUNNING A DIFFERENT VERSION' });
        break;
      }
      // Whoever this is has the code, and a returning guest looks exactly like a
      // new one. Either way the seat is theirs and the board goes out in full.
      peerLeftForGood = false;
      everPaired = true;
      expectPeer = true;
      applyIntent({ k: 'name', value: msg.name });
      link?.send({ t: 'welcome', v: PROTOCOL_VERSION, name: useGame.getState().p1 });
      lastKey = '';
      broadcast();
      break;

    case 'welcome':
      if (role !== 'guest') break;
      if (msg.v !== PROTOCOL_VERSION) {
        net.patch({ status: 'error', detail: 'THE OTHER PHONE IS RUNNING A DIFFERENT VERSION' });
        break;
      }
      peerLeftForGood = false;
      everPaired = true;
      expectPeer = true;
      net.patch({ peerName: msg.name, peerHere: true, status: 'connected', detail: '', retrying: false, attempt: 0 });
      useGame.setState({ p1: msg.name });
      break;

    case 'state':
      if (role !== 'guest') break;
      useGame.setState((s) => applySnapshot(msg.snap, s));
      break;

    case 'intent':
      if (role === 'host') applyIntent(msg.intent);
      break;

    case 'ping':
      link?.send({ t: 'pong', ts: msg.ts });
      break;

    case 'bye':
      // A phone that left on purpose is not coming back on its own, so stop
      // dialling for it. The host keeps its table open for a new challenger —
      // which is also how the same one gets back in.
      peerLeftForGood = true;
      expectPeer = false;
      if (role === 'host') net.patch({ status: 'waiting', detail: SAY.guestLeft, peerHere: false, peerName: '' });
      else net.patch({ status: 'closed', detail: msg.reason, peerHere: false });
      break;

    case 'pong':
      break;
  }
}

function onStatus(role: 'host' | 'guest', status: LinkStatus, detail?: string): void {
  if (leaving) return;

  // A redial reports its own progress — 'starting', then 'connecting' — and none
  // of that should push aside the line telling the player what is going on.
  if (!detail && (status === 'starting' || status === 'connecting') && useNet.getState().retrying) {
    useNet.getState().patch({ status });
    return;
  }

  // 'waiting' means the table is open and nobody has sat down yet — the dial
  // landed, which is what makes it worth dialling again later.
  if (status === 'connected' || status === 'waiting') {
    everWorked = true;
    retries = 0;
    useNet.getState().patch({ status, detail: detail ?? '', retrying: false, attempt: 0 });
    if (role === 'guest' && status === 'connected') sayHello();
    return;
  }

  if ((status === 'closed' || status === 'error') && canRedial()) {
    linkLost(detail);
    return;
  }

  useNet.getState().patch({ status, detail: detail ?? '' });
}

/** The guest introduces itself the moment the pipe is usable, exactly once. */
function sayHello(): void {
  if (helloSent || !link) return;
  helloSent = true;
  link.send({ t: 'hello', v: PROTOCOL_VERSION, name: useNet.getState().myName });
}

/* ------------------------------------------------------------- reconnecting */

const canRedial = () => !!table && !leaving && everWorked && !peerLeftForGood && retries < MAX_RETRIES;

/**
 * The link is gone. Drop it, keep the match, and start dialling — or, if there
 * is nothing left worth dialling, say so and leave the seat where it is.
 */
function linkLost(detail?: string): void {
  if (!table || leaving) return;

  stopHeartbeat();
  closeLink();
  useNet.getState().patch({ peerHere: false });

  if (!canRedial()) {
    if (peerLeftForGood) {
      // The other phone said goodbye. That is already on screen, and it is the
      // truth — the socket falling over afterwards is just the tail of it.
      useNet.getState().patch({ status: 'closed', retrying: false });
      return;
    }
    // Running out of tries is the one case worth overriding a driver's own words
    // with: nothing new went wrong, we simply stopped, and the player decides.
    const spent = everWorked && retries >= MAX_RETRIES;
    useNet.getState().patch({
      status: everWorked ? 'closed' : 'error',
      detail: spent ? SAY.gaveUp : detail || (everWorked ? SAY.gaveUp : ''),
      retrying: false,
    });
    return;
  }

  const wait = RETRY_DELAYS_MS[Math.min(retries, RETRY_DELAYS_MS.length - 1)];
  retries += 1;
  useNet.getState().patch({
    status: 'connecting',
    detail: `${SAY.dropped} (${retries})`,
    retrying: true,
    attempt: retries,
  });
  retryTimer = setTimeout(() => void redial(), wait);
}

async function redial(): Promise<void> {
  retryTimer = null;
  if (!table || leaving) return;
  closeLink();
  try {
    await openLink(table);
  } catch (e) {
    linkLost(String((e as { message?: string })?.message ?? e).toUpperCase());
  }
}

function closeLink(): void {
  generation += 1;
  expectPeer = false;
  saidQuiet = false;
  try {
    link?.close();
  } catch {
    /* already gone */
  }
  link = null;
  helloSent = false;
}

/**
 * A socket can die without either end being told — a phone that lost Wi-Fi, or
 * one whose screen was off long enough for the network to give up on it. So the
 * two phones keep talking quietly, and silence is treated as a drop.
 */
function startHeartbeat(): void {
  stopHeartbeat();
  lastHeard = Date.now();
  saidQuiet = false;
  heartbeat = setInterval(() => {
    if (!link || leaving || !expectPeer) return; // nobody there to have gone quiet

    if (Date.now() - lastHeard > SILENT_MS && !saidQuiet) {
      // Say the seat is empty, but keep the pipe: whether the fault is this end
      // or the other one is not knowable from here. A socket of ours that is
      // really dead will say so itself and be redialled; a phone that was only
      // asleep answers the next ping and is simply back.
      saidQuiet = true;
      useNet.getState().patch({ peerHere: false, detail: SAY.quiet });
    }
    link.send({ t: 'ping', ts: Date.now() });
  }, HEARTBEAT_MS);
}

function stopHeartbeat(): void {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
}

/** Build the pipe for `opts` and hand it to the session. Used to start and to redial. */
async function openLink(opts: StartOptions): Promise<void> {
  const driver = DRIVERS[opts.kind];
  const where = {
    code: opts.code,
    address: opts.address ?? '',
    port: opts.port ?? DEFAULT_PORT,
    hotspot: opts.hotspot === true,
  };
  const events = {
    onStatus: (status: LinkStatus, detail?: string) => onStatus(opts.role, status, detail),
    onMessage: (m: NetMessage) => onMessage(opts.role, m),
  };

  helloSent = false;
  lastKey = '';
  const mine = ++generation;
  const created = opts.role === 'host' ? await driver.host(where, events) : await driver.join(where, events);

  // A dial that failed while it was being made has already been given up on and
  // replaced by the next one; whatever it hands back now is nobody's link.
  if (mine !== generation || leaving) {
    created.close();
    return;
  }

  link = created;
  useNet.getState().patch({ info: created.info });
  startHeartbeat();

  // Some transports (BLE) are already open by the time the link is handed back,
  // so the status callback fired before there was anything to send on.
  if (opts.role === 'guest' && useNet.getState().status === 'connected') sayHello();
}

export async function startSession(opts: StartOptions): Promise<void> {
  stopSession();

  const port = opts.port ?? DEFAULT_PORT;
  const address = opts.address ?? '';

  table = { ...opts, address, port };
  retries = 0;
  everWorked = false;
  everPaired = false;
  peerLeftForGood = false;
  expectPeer = false;
  seq = 0;

  useNet.getState().patch({
    active: true,
    role: opts.role,
    kind: opts.kind,
    code: opts.code,
    address,
    port,
    myName: opts.name,
    peerName: '',
    peerHere: false,
    status: 'starting',
    detail: '',
    info: null,
    retrying: false,
    attempt: 0,
    resume: null,
  });

  useGame.getState().startNet(opts.role, seatOf(opts.role));
  if (opts.role === 'host') useGame.setState({ p1: opts.name });
  else useGame.setState({ p2: opts.name });

  if (opts.role === 'host') unsubscribeStore = useGame.subscribe(() => broadcast());

  await openLink(table);
}

/**
 * Take the parked seat again — after leaving on purpose, or after the app was
 * closed while a match was on the table.
 *
 * The host's copy of the board *is* the match, so it is put back exactly as it
 * was and pushed to the guest when they arrive. A guest's copy is only something
 * to look at until the host's next snapshot lands and overwrites it.
 */
export async function resumeSession(): Promise<void> {
  const saved = parked;
  if (!saved) return;
  await startSession(saved.table);
  useGame.setState((s) => applySnapshot(saved.snap, s));
}

/** Dial the table again now. The banner and the lobby offer this by hand. */
export function retryNow(): void {
  if (!table || leaving) return;
  const { status, retrying } = useNet.getState();
  if (!retrying && status !== 'closed' && status !== 'error') return;

  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retries = 0;
  peerLeftForGood = false;
  void redial();
}

/**
 * The app is in front of the player again. A phone that was locked or switched
 * away from comes back to a socket the other end may have long given up on, so
 * poke the link — and if it is already gone, start dialling at once rather than
 * waiting out a backoff that was counted in a suspended timer.
 */
export function wake(): void {
  if (!table || leaving) return;
  const { status } = useNet.getState();
  if (link && status === 'connected') {
    // Nothing was heard while the app was asleep, and that proves nothing. Give
    // the far phone a fresh window to answer in before calling the link dead.
    lastHeard = Date.now();
    link.send({ t: 'ping', ts: Date.now() });
    return;
  }
  retryNow();
}

/** Guest → host. A no-op for the host, which acts on its own store directly. */
export function sendIntent(intent: Intent): void {
  link?.send({ t: 'intent', intent });
}

export function stopSession(reason?: string): void {
  leaving = true;
  const net = useNet.getState();

  // Park the table on the way out, so the seat can be taken again. An accidental
  // exit and a deliberate one look identical from here — only the player knows
  // which it was, so both are kept.
  if (net.active && table) {
    parked = { table, snap: makeSnapshot(useGame.getState(), seatOf(table.role)) };
  }

  // A guest's store holds the host as player 1. Give the phone its own name back
  // so the title screen is not left showing someone else's.
  if (net.active && net.role === 'guest' && net.myName) {
    useGame.setState({ p1: net.myName, p2: '' });
  }

  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  stopHeartbeat();
  unsubscribeStore?.();
  unsubscribeStore = null;
  generation += 1;
  link?.close(reason);
  link = null;
  table = null;
  retries = 0;
  everWorked = false;
  everPaired = false;
  peerLeftForGood = false;
  expectPeer = false;
  saidQuiet = false;
  lastKey = '';
  seq = 0;
  helloSent = false;

  useNet.getState().reset();
  if (parked) {
    const { table: t, snap } = parked;
    useNet.getState().patch({
      resume: { code: t.code, kind: t.kind, role: t.role, game: snap.game, inMatch: snap.inMatch },
    });
  }
  if (useGame.getState().netRole !== 'off') useGame.getState().endNet();
  leaving = false;
}

/** Forget the parked table — the player has said they are done with it. */
export function forgetParkedTable(): void {
  parked = null;
  useNet.getState().patch({ resume: null });
}

export { advanceOnHost };
