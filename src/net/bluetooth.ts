/**
 * Bluetooth table — two phones and nothing else. No Wi-Fi network, no router,
 * no relay, no internet.
 *
 * Built on `expo-nearby-connections`, which is Google Nearby Connections on
 * Android and Apple's MultipeerConnectivity on iOS. Both of those negotiate
 * their own link — Bluetooth, BLE, or a direct Wi-Fi leg between the two
 * handsets — so this works with no network joined at all.
 *
 * Two things to know:
 *
 *   • It needs a built app. Expo Go carries no native code of ours, so
 *     `availability()` says so and the lobby offers Wi-Fi instead.
 *   • Android talks to Android and iOS to iOS. The two frameworks are not
 *     interoperable, and the library does not pretend otherwise.
 *
 * The host advertises as `ECARD-<code>` and accepts the first phone that asks
 * for that exact name; the guest scans for it. The room code is therefore the
 * whole of the pairing — there is nothing to type but four characters.
 */

import { decode, encode, type NetMessage } from './protocol';
import {
  deadLink,
  optionalModule,
  type Availability,
  type HostOptions,
  type JoinOptions,
  type Link,
  type LinkEvents,
  type TransportDriver,
} from './link';
import { errorText } from './ws/tcpHost';

/** Advertised name, so a scan can match on the room code alone. */
export const advertisedName = (code: string) => `ECARD-${code.toUpperCase()}`;

/** 1-to-1. A table seats two. */
const POINT_TO_POINT = 3;

/** How long a guest hunts for the table before giving up. */
const DISCOVER_TIMEOUT_MS = 25_000;

type Peer = { peerId: string; name: string };
type Unsubscribe = () => void;

type Nearby = {
  startAdvertise: (name: string, strategy?: number) => Promise<string>;
  stopAdvertise: () => Promise<void>;
  startDiscovery: (name: string, strategy?: number) => Promise<string>;
  stopDiscovery: () => Promise<void>;
  requestConnection: (peerId: string) => Promise<void>;
  acceptConnection: (peerId: string) => Promise<void>;
  disconnect: (peerId?: string) => Promise<void>;
  sendText: (peerId: string, text: string) => Promise<void>;
  onPeerFound: (cb: (p: Peer) => void) => Unsubscribe;
  onInvitationReceived: (cb: (p: Peer) => void) => Unsubscribe;
  onConnected: (cb: (p: Peer) => void) => Unsubscribe;
  onDisconnected: (cb: (p: { peerId: string }) => void) => Unsubscribe;
  onTextReceived: (cb: (p: { peerId: string; text: string }) => void) => Unsubscribe;
};

const loadNearby = () =>
  optionalModule<Nearby>(() => {
    const mod = require('expo-nearby-connections') as Nearby | { default?: Nearby };
    const api = (mod as { default?: Nearby }).default ?? (mod as Nearby);
    // Present but inert is the Expo Go case, and it must read as unavailable.
    return typeof api?.startAdvertise === 'function' ? api : null;
  });

/** Expo Go carries no native modules of ours, whatever is in package.json. */
const inExpoGo = () =>
  optionalModule<boolean>(() => {
    const constants = (require('expo-constants') as { default?: { executionEnvironment?: string } }).default;
    return constants?.executionEnvironment === 'storeClient' ? true : null;
  }) === true;

const NEEDS_BUILD = 'BLUETOOTH NEEDS THE BUILT APP — EXPO GO CARRIES NO NATIVE CODE. USE WI-FI, OR BUILD IT.';

/* ------------------------------------------------------------- permissions */

/**
 * Android 12+ gates scanning, advertising and connecting behind runtime
 * permissions; older versions gate the same thing behind location. iOS prompts
 * on its own using the strings the config plugin writes into Info.plist.
 */
async function askAndroid(): Promise<string | null> {
  const rn = optionalModule<{
    Platform: { OS: string; Version: number };
    PermissionsAndroid: {
      requestMultiple: (perms: string[]) => Promise<Record<string, string>>;
      RESULTS: { GRANTED: string };
    };
  }>(() => require('react-native'));
  if (!rn || rn.Platform.OS !== 'android') return null;

  const modern = Number(rn.Platform.Version) >= 31;
  const wanted = modern
    ? [
        'android.permission.BLUETOOTH_SCAN',
        'android.permission.BLUETOOTH_ADVERTISE',
        'android.permission.BLUETOOTH_CONNECT',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.NEARBY_WIFI_DEVICES',
      ]
    : ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'];

  try {
    const granted = await rn.PermissionsAndroid.requestMultiple(wanted);
    const ok = rn.PermissionsAndroid.RESULTS.GRANTED;
    // NEARBY_WIFI_DEVICES only exists on Android 13+, so a refusal there is not
    // fatal on 12 — the Bluetooth trio is what actually has to be granted.
    const required = modern
      ? ['android.permission.BLUETOOTH_SCAN', 'android.permission.BLUETOOTH_ADVERTISE', 'android.permission.BLUETOOTH_CONNECT']
      : ['android.permission.ACCESS_FINE_LOCATION'];
    const missing = required.filter((p) => granted[p] !== ok);
    if (missing.length) {
      return 'BLUETOOTH PERMISSION WAS REFUSED — ALLOW NEARBY DEVICES FOR E-CARD IN ANDROID SETTINGS';
    }
    return null;
  } catch (e) {
    return errorText(e).toUpperCase();
  }
}

/* -------------------------------------------------------------- the links */

/** Everything both roles share once a peer is connected. */
function makeLink(api: Nearby, peerId: () => string | null, subs: Unsubscribe[], stop: () => void): Link {
  return {
    send: (msg) => {
      const id = peerId();
      if (id) void api.sendText(id, encode(msg)).catch(() => undefined);
    },
    info: { mode: 'bluetooth', hint: 'PHONE TO PHONE · NO NETWORK' },
    close: () => {
      subs.forEach((off) => off());
      subs.length = 0;
      stop();
      void api.disconnect().catch(() => undefined);
    },
  };
}

function listen(api: Nearby, ev: LinkEvents, peer: { id: string | null }, subs: Unsubscribe[]) {
  subs.push(
    api.onTextReceived(({ text }) => {
      const msg = decode(text);
      if (msg) ev.onMessage(msg);
    }),
  );
  subs.push(
    api.onDisconnected(() => {
      peer.id = null;
      ev.onMessage({ t: 'peer', state: 'left' });
      ev.onStatus('waiting');
    }),
  );
}

async function host(opts: HostOptions, ev: LinkEvents): Promise<Link> {
  const api = loadNearby();
  if (!api) {
    ev.onStatus('error', NEEDS_BUILD);
    return deadLink;
  }

  ev.onStatus('starting');
  const denied = await askAndroid();
  if (denied) {
    ev.onStatus('error', denied);
    return deadLink;
  }

  const name = advertisedName(opts.code);
  const peer: { id: string | null } = { id: null };
  const subs: Unsubscribe[] = [];

  // Anyone who dialled this exact name has the code, which is the only
  // credential a table has. Accept the first, ignore the rest.
  subs.push(
    api.onInvitationReceived(({ peerId }) => {
      if (peer.id) return;
      void api.acceptConnection(peerId).catch((e) => ev.onStatus('error', errorText(e).toUpperCase()));
    }),
  );
  subs.push(
    api.onConnected(({ peerId }) => {
      if (peer.id) return;
      peer.id = peerId;
      ev.onStatus('connected');
      ev.onMessage({ t: 'peer', state: 'joined' });
    }),
  );
  listen(api, ev, peer, subs);

  try {
    await api.startAdvertise(name, POINT_TO_POINT);
    ev.onStatus('waiting');
  } catch (e) {
    subs.forEach((off) => off());
    ev.onStatus('error', errorText(e).toUpperCase());
    return deadLink;
  }

  return makeLink(api, () => peer.id, subs, () => void api.stopAdvertise().catch(() => undefined));
}

async function join(opts: JoinOptions, ev: LinkEvents): Promise<Link> {
  const api = loadNearby();
  if (!api) {
    ev.onStatus('error', NEEDS_BUILD);
    return deadLink;
  }

  ev.onStatus('connecting');
  const denied = await askAndroid();
  if (denied) {
    ev.onStatus('error', denied);
    return deadLink;
  }

  const wanted = advertisedName(opts.code);
  const peer: { id: string | null } = { id: null };
  const subs: Unsubscribe[] = [];
  let asked = false;

  const timer = setTimeout(() => {
    if (!peer.id) {
      ev.onStatus('error', `NO TABLE ON CODE ${opts.code} IN RANGE — CHECK THE CODE, AND THAT THE OTHER PHONE HAS PRESSED "OPEN THE TABLE"`);
    }
  }, DISCOVER_TIMEOUT_MS);

  subs.push(
    api.onPeerFound(({ peerId, name }) => {
      if (asked || (name ?? '').toUpperCase() !== wanted) return;
      asked = true;
      void api.stopDiscovery().catch(() => undefined);
      void api.requestConnection(peerId).catch((e) => {
        asked = false;
        ev.onStatus('error', errorText(e).toUpperCase());
      });
    }),
  );
  subs.push(
    api.onConnected(({ peerId }) => {
      clearTimeout(timer);
      peer.id = peerId;
      ev.onStatus('connected');
    }),
  );
  listen(api, ev, peer, subs);

  try {
    await api.startDiscovery(advertisedName(opts.code), POINT_TO_POINT);
  } catch (e) {
    clearTimeout(timer);
    subs.forEach((off) => off());
    ev.onStatus('error', errorText(e).toUpperCase());
    return deadLink;
  }

  return makeLink(api, () => peer.id, subs, () => {
    clearTimeout(timer);
    void api.stopDiscovery().catch(() => undefined);
  });
}

async function availability(): Promise<Availability> {
  if (loadNearby()) return { ok: true };
  return { ok: false, reason: inExpoGo() ? NEEDS_BUILD : 'BLUETOOTH IS NOT AVAILABLE IN THIS BUILD. USE WI-FI.' };
}

export const bluetoothDriver: TransportDriver = {
  kind: 'bluetooth',
  label: 'BLUETOOTH',
  blurb: 'NO NETWORK AT ALL · NEEDS THE BUILT APP',
  availability,
  host,
  join,
};
