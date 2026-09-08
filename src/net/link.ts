// One duplex message pipe between two phones, however the bytes actually travel.

import type { LinkStatus, NetMessage } from './protocol';

export type TransportKind = 'wifi' | 'bluetooth';

export type LinkEvents = {
  onStatus: (status: LinkStatus, detail?: string) => void;
  onMessage: (msg: NetMessage) => void;
};

/** How this link ended up working, so the lobby can tell the players what to do. */
export type LinkInfo = {
  mode: 'direct' | 'relay' | 'bluetooth';
  /** Short line shown under the room code, e.g. the address to type in. */
  hint: string;
};

export type Link = {
  send: (msg: NetMessage) => void;
  close: (reason?: string) => void;
  info: LinkInfo;
};

export type HostOptions = { code: string; address: string; port: number };
export type JoinOptions = { code: string; address: string; port: number };

export type Availability = { ok: boolean; reason?: string };

export type TransportDriver = {
  kind: TransportKind;
  label: string;
  /** One line under the option, in the game's voice. */
  blurb: string;
  /** Cheap enough to call on render; result is cached by the caller. */
  availability: () => Promise<Availability>;
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
