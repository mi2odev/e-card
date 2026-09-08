/**
 * Ties a transport link to the game store.
 *
 * The host owns the match: it is the only device that shuffles, moves money or
 * advances a phase. After every change it pushes a snapshot — redacted so the
 * guest is never sent the other hand — and the guest adopts it wholesale. The
 * guest's screens never mutate shared state; they send intents and wait for the
 * snapshot that comes back.
 */

import { useGame } from '../store/useGame';
import { useNet } from '../store/useNet';
import { seatSide, applySnapshot, makeSnapshot, snapshotKey } from './snapshot';
import { DEFAULT_PORT, type Intent, type LinkStatus, type NetMessage, PROTOCOL_VERSION } from './protocol';
import type { Link, TransportDriver, TransportKind } from './link';
import { wifiDriver } from './wifi';
import { bluetoothDriver } from './bluetooth';

export const DRIVERS: Record<TransportKind, TransportDriver> = {
  wifi: wifiDriver,
  bluetooth: bluetoothDriver,
};

const GUEST_SEAT = 'p2' as const;
const HOST_SEAT = 'p1' as const;

let link: Link | null = null;
let unsubscribeStore: (() => void) | null = null;
let seq = 0;
let lastKey = '';
let helloSent = false;

export type StartOptions = {
  kind: TransportKind;
  role: 'host' | 'guest';
  code: string;
  address?: string;
  port?: number;
  name: string;
};

export const isLive = () => link !== null;

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

  switch (msg.t) {
    case 'peer':
      if (msg.state === 'joined') {
        net.patch({ peerHere: true, status: 'connected', detail: '' });
        // Both ends announce themselves; whoever is already up answers.
        if (role === 'host') link?.send({ t: 'welcome', v: PROTOCOL_VERSION, name: useGame.getState().p1 });
        else sayHello();
        if (role === 'host') {
          lastKey = '';
          broadcast();
        }
      } else {
        net.patch({ peerHere: false, peerName: '' });
      }
      break;

    case 'hello':
      if (role !== 'host') break;
      if (msg.v !== PROTOCOL_VERSION) {
        net.patch({ status: 'error', detail: 'THE OTHER PHONE IS RUNNING A DIFFERENT VERSION' });
        break;
      }
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
      net.patch({ peerName: msg.name, peerHere: true, status: 'connected' });
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
      net.patch({ status: 'closed', detail: msg.reason, peerHere: false });
      break;

    case 'pong':
      break;
  }
}

function onStatus(role: 'host' | 'guest', status: LinkStatus, detail?: string): void {
  useNet.getState().patch({ status, detail: detail ?? '' });
  if (role === 'guest' && status === 'connected') sayHello();
}

/** The guest introduces itself the moment the pipe is usable, exactly once. */
function sayHello(): void {
  if (helloSent || !link) return;
  helloSent = true;
  link.send({ t: 'hello', v: PROTOCOL_VERSION, name: useNet.getState().myName });
}

export async function startSession(opts: StartOptions): Promise<void> {
  stopSession();

  const driver = DRIVERS[opts.kind];
  const port = opts.port ?? DEFAULT_PORT;
  const address = opts.address ?? '';
  const seat = opts.role === 'host' ? HOST_SEAT : GUEST_SEAT;

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
  });

  useGame.getState().startNet(opts.role, seat);
  if (opts.role === 'host') useGame.setState({ p1: opts.name });
  else useGame.setState({ p2: opts.name });

  const events = {
    onStatus: (status: LinkStatus, detail?: string) => onStatus(opts.role, status, detail),
    onMessage: (m: NetMessage) => onMessage(opts.role, m),
  };

  const created =
    opts.role === 'host'
      ? await driver.host({ code: opts.code, address, port }, events)
      : await driver.join({ code: opts.code, address, port }, events);

  link = created;
  useNet.getState().patch({ info: created.info });

  helloSent = false;
  if (opts.role === 'host') {
    lastKey = '';
    seq = 0;
    unsubscribeStore = useGame.subscribe(() => broadcast());
  } else if (useNet.getState().status === 'connected') {
    // Some transports (BLE) are already open by the time the link is handed
    // back, so the status callback fired before there was anything to send on.
    sayHello();
  }
}

/** Guest → host. A no-op for the host, which acts on its own store directly. */
export function sendIntent(intent: Intent): void {
  link?.send({ t: 'intent', intent });
}

export function stopSession(reason?: string): void {
  const net = useNet.getState();
  // A guest's store holds the host as player 1. Give the phone its own name back
  // so the title screen is not left showing someone else's.
  if (net.active && net.role === 'guest' && net.myName) {
    useGame.setState({ p1: net.myName, p2: '' });
  }

  unsubscribeStore?.();
  unsubscribeStore = null;
  link?.close(reason);
  link = null;
  lastKey = '';
  seq = 0;
  helloSent = false;
  useNet.getState().reset();
  if (useGame.getState().netRole !== 'off') useGame.getState().endNet();
}

export { advanceOnHost };
