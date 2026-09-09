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
 * A phone sharing its connection is the gateway of the small network it makes,
 * so a guest that knows its own address knows where the host is: the same three
 * octets, ending in 1. The fixed guesses cover the rest — iOS hands out
 * 172.20.10.x, Android has used 192.168.43.x for years, and a laptop sharing a
 * connection on Windows uses 192.168.137.x.
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
