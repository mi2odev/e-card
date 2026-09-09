// One duplex message pipe between two phones, however the bytes actually travel.

import type { LinkStatus, NetMessage } from './protocol';

export type TransportKind = 'wifi';

export type LinkEvents = {
  /**
   * `fatal` marks a failure that dialling again cannot mend — this copy has no
   * way to open a port, the port is held by something else — as against the
   * ordinary kind, where the other phone is simply not open yet and the answer
   * is to try once more.
   */
  onStatus: (status: LinkStatus, detail?: string, fatal?: boolean) => void;
  onMessage: (msg: NetMessage) => void;
};

/** How this link ended up working, so the lobby can tell the players what to do. */
export type LinkInfo = {
  mode: 'direct' | 'relay' | 'hotspot';
  /** Short line shown under the room code, e.g. the address to type in. */
  hint: string;
};

export type Link = {
  send: (msg: NetMessage) => void;
  close: (reason?: string) => void;
  info: LinkInfo;
};

/**
 * `hotspot` says the table lives on a phone that is sharing its connection
 * rather than on a network both phones joined. Nothing about the link changes —
 * it is the same Wi-Fi socket — but the host has no address it can read off
 * itself, and the guest has to work out where the host is instead of being told.
 */
/**
 * `stillWanted` goes false once the session has stopped caring about this dial —
 * the player left the table, or it has already been redialled. A driver that
 * takes its time finding the other phone is expected to ask, and to give up
 * when the answer is no.
 */
type Dialling = { code: string; address: string; port: number; hotspot?: boolean; stillWanted?: () => boolean };

export type HostOptions = Dialling;
export type JoinOptions = Dialling;

export type TransportDriver = {
  kind: TransportKind;
  host: (opts: HostOptions, ev: LinkEvents) => Promise<Link>;
  join: (opts: JoinOptions, ev: LinkEvents) => Promise<Link>;
};

/** A link that is already dead — handed back when a driver cannot start. */
export const deadLink: Link = { send: () => {}, close: () => {}, info: { mode: 'relay', hint: '' } };

/**
 * Load an optional native module, or report its absence.
 *
 * Two things can go wrong and both mean "not available": the require can throw,
 * or Metro can have resolved the specifier to the null stub (see metro.config.js,
 * which is what happens inside Expo Go).
 */
export function optionalModule<T>(load: () => T | null | undefined): T | null {
  try {
    return load() ?? null;
  } catch {
    return null;
  }
}
