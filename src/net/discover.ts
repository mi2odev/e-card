import Constants from 'expo-constants';
import * as Network from 'expo-network';

/**
 * A sensible default for the relay address.
 *
 * Inside Expo Go both phones are already talking to the same Metro bundler, and
 * that is almost always the same laptop you would run `npm run relay` on — so
 * pre-fill its IP and most players never have to type an address at all.
 */
export function defaultRelayAddress(): string {
  const config = Constants.expoConfig as { hostUri?: string } | null;
  const candidates = [config?.hostUri, (Constants as { linkingUri?: string }).linkingUri];
  for (const raw of candidates) {
    if (!raw) continue;
    const host = String(raw).replace(/^\w+:\/\//, '').split('/')[0].split(':')[0];
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
  }
  return '';
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * This phone's address on the Wi-Fi it is joined to.
 *
 * Needed when the host serves the table itself: the other player has to type
 * this in, and the host is the only one who can tell them what it is.
 */
export async function localIpAddress(): Promise<string> {
  try {
    const ip = await Network.getIpAddressAsync();
    return IPV4.test(ip) && ip !== '0.0.0.0' && !ip.startsWith('127.') ? ip : '';
  } catch {
    return '';
  }
}
