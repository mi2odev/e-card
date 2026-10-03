/**
 * Working out where the other phone is, so the players have as little to type as
 * possible.
 *
 * Both native modules are loaded through `optionalModule`: this file is pulled
 * in by the Wi-Fi driver, which the self-test exercises in plain Node where
 * neither of them exists. Missing simply means "nothing to suggest".
 */

import { optionalModule } from './link';

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

const constants = () =>
  optionalModule<{ expoConfig?: { hostUri?: string } | null; linkingUri?: string }>(() => {
    const mod = require('expo-constants') as { default?: object };
    return (mod.default ?? mod) as { expoConfig?: { hostUri?: string } | null; linkingUri?: string };
  });

const network = () => optionalModule<{ getIpAddressAsync: () => Promise<string> }>(() => require('expo-network'));

/**
 * A sensible default for the relay address.
 *
 * Inside Expo Go both phones are already talking to the same Metro bundler, and
 * that is almost always the same laptop you would run `npm run relay` on — so
 * pre-fill its IP and most players never have to type an address at all.
 */
export function defaultRelayAddress(): string {
  const c = constants();
  const candidates = [c?.expoConfig?.hostUri, c?.linkingUri];
  for (const raw of candidates) {
    if (!raw) continue;
    const host = String(raw).replace(/^\w+:\/\//, '').split('/')[0].split(':')[0];
    if (IPV4.test(host)) return host;
  }
  return '';
}

/**
 * This phone's address on the Wi-Fi it is joined to.
 *
 * Needed when the host serves the table itself: the other player has to type
 * this in, and the host is the only one who can tell them what it is.
 *
 * A phone that is *sharing* a hotspot rather than joined to one has no answer
 * here — on both platforms this reads the Wi-Fi client interface, which is down
 * while the phone is the access point. That is what `hotspotTargets` is for.
 *
 * `attempts` above 1 asks again after a moment, for the caller that would rather
 * wait than be told the phone does not know where it is.
 */
export async function localIpAddress(attempts = 1): Promise<string> {
  const api = network();
  if (!api) return '';
  // A phone that has just joined a network has no address for a moment — the
  // lease is still being taken out — and a hotspot guest is asking at exactly
  // that moment. One empty answer is not a no.
  for (let i = 0; i < Math.max(1, attempts); i++) {
    if (i) await new Promise((r) => setTimeout(r, 350));
    try {
      const ip = await api.getIpAddressAsync();
      if (IPV4.test(ip) && ip !== '0.0.0.0' && !ip.startsWith('127.')) return ip;
    } catch {
      /* ask again */
    }
  }
  return '';
}

/**
 * Addresses a phone sharing a hotspot is likely to be at, best guess first.
 *
 * A phone sharing its connection is the gateway of the small network it makes.
 * An iPhone is always at 172.20.10.1, and older Androids sat at .1 too — at
 * 192.168.43.1 for years — and a laptop sharing a connection on Windows uses
 * 192.168.137.1. So those are worth a try first.
 *
 * They are not enough. Since Android 11 a phone sharing a hotspot picks a random
 * network *and a random address on it* — 192.168.85.137, say — avoiding .1 on
 * purpose, and nothing an app can read without native code says which. That is
 * why a guest goes on to sweep its whole network (`lanTargets`): the host is on
 * it somewhere, and the sweep is the only thing that will find it.
 */
export const HOTSPOT_GATEWAYS = ['172.20.10.1', '192.168.43.1', '192.168.137.1'];

export function hotspotTargets(ownIp: string): string[] {
  const out: string[] = [];
  const own = ownIp.trim();
  const octets = IPV4.test(own) ? own.split('.') : null;
  const add = (address: string) => {
    if (address !== own && !out.includes(address)) out.push(address);
  };

  if (octets) add(`${octets[0]}.${octets[1]}.${octets[2]}.1`);
  for (const guess of HOTSPOT_GATEWAYS) add(guess);
  // Last, and least likely: the other end of the range, which is where a few
  // Android builds put the access point. Dialled with the rest, so a guess that
  // goes nowhere costs nothing but a socket.
  if (octets) add(`${octets[0]}.${octets[1]}.${octets[2]}.254`);
  return out;
}

/**
 * Every other address on this phone's own network, nearest first.
 *
 * A phone serving a table on a router's Wi-Fi is somewhere on the same /24 as
 * the phone looking for it — home routers hand addresses out from one small
 * range, and usually in order, so the other phone is most often a handful of
 * numbers away. Dialling outwards from our own address finds it in the first
 * few dozen tries rather than after walking the whole range.
 */
export function lanTargets(ownIp: string): string[] {
  const own = ownIp.trim();
  if (!isIpv4(own)) return [];
  const [a, b, c, d] = own.split('.').map(Number);
  const out: string[] = [];
  for (let step = 1; step < 254; step++) {
    for (const n of [d - step, d + step]) {
      if (n >= 1 && n <= 254) out.push(`${a}.${b}.${c}.${n}`);
    }
  }
  return out;
}

export const isIpv4 = (s: string) => IPV4.test(s) && s.split('.').every((o) => Number(o) <= 255);

/**
 * A name the socket layer will take: letters, digits and hyphens, labels of at
 * most 63 and 253 in all. Anything past that, Android's throws on — natively,
 * where nothing in the app can catch it.
 */
export const isHostname = (s: string) =>
  s.length <= 253 && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/.test(s);

/** Somewhere to dial: a host, and the port the table is on there. */
export type Endpoint = { host: string; port: number };

export const endpointText = (e: Endpoint) => `${e.host}:${e.port}`;

/**
 * Read an address the way a player actually types it.
 *
 * The phone serving a table shows `192.168.1.31:8787`, the relay prints the
 * same, and its browser page says to enter "this whole address" — so the port
 * comes along more often than not, and so does the `http://` off a browser
 * bar. All of that used to be glued onto `:8787` again, which made a URL with
 * two ports in it; Android's socket layer throws on one of those outright.
 *
 * Commas count as dots, since some numeric keyboards only offer the one.
 * Returns null for something that cannot be dialled at all.
 */
export function parseAddress(raw: string, defaultPort: number): Endpoint | null {
  let s = raw.trim().replace(/\s+/g, '');
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, ''); // scheme
  s = s.split(/[/?#]/)[0]; // path and query
  s = s.slice(s.lastIndexOf('@') + 1); // credentials, never meant

  let host = s;
  let port = defaultPort;
  const withPort = /^(.*):(\d{1,5})$/.exec(s);
  if (withPort) {
    host = withPort[1];
    port = Number(withPort[2]);
  }
  if (/^[\d,.]+$/.test(host)) host = host.replace(/,/g, '.');
  host = host.toLowerCase();

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  if (/^[\d.]+$/.test(host)) return isIpv4(host) ? { host, port } : null;
  // A name, for the rare network that hands them out (`laptop.local`).
  return isHostname(host) ? { host, port } : null;
}
