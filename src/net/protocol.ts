// Wire format shared by every transport. Keep this file free of React and of any
// native import so it can be exercised from plain Node (see scripts/selftest.ts).

import type { Snapshot } from './snapshot';

export const PROTOCOL_VERSION = 1;

/** Default port for the LAN relay and for the in-app host server. */
export const DEFAULT_PORT = 8787;

/** No I/1/O/0 — these get read off a phone screen and typed into another one. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

export function makeRoomCode(rand: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    out += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  }
  return out;
}

export function normalizeRoomCode(raw: string): string {
  return raw
    .toUpperCase()
    .split('')
    .filter((ch) => CODE_ALPHABET.includes(ch))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}

export const isCompleteRoomCode = (code: string) => normalizeRoomCode(code).length === ROOM_CODE_LENGTH;

/** Guest → host. The host is the only device that mutates match state. */
export type Intent =
  | { k: 'name'; value: string }
  | { k: 'stake'; value: number }
  | { k: 'deal' }
  | { k: 'pick'; index: number }
  | { k: 'advance' }
  | { k: 'rematch' };

export type NetMessage =
  | { t: 'hello'; v: number; name: string }
  | { t: 'welcome'; v: number; name: string }
  | { t: 'state'; seq: number; snap: Snapshot }
  | { t: 'intent'; intent: Intent }
  | { t: 'peer'; state: 'joined' | 'left' }
  | { t: 'bye'; reason: string }
  | { t: 'ping'; ts: number }
  | { t: 'pong'; ts: number };

export function encode(msg: NetMessage): string {
  return JSON.stringify(msg);
}

/** Never throws — a malformed frame from the wire returns null and is dropped. */
export function decode(raw: string): NetMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const t = (parsed as { t?: unknown }).t;
  if (typeof t !== 'string') return null;
  switch (t) {
    case 'hello':
    case 'welcome':
    case 'state':
    case 'intent':
    case 'peer':
    case 'bye':
    case 'ping':
    case 'pong':
      return parsed as NetMessage;
    default:
      return null;
  }
}

export type LinkStatus =
  | 'idle'
  | 'starting'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'closed'
  | 'error';

export const STATUS_WORD: Record<LinkStatus, string> = {
  idle: 'IDLE',
  starting: 'OPENING THE TABLE',
  waiting: 'WAITING FOR THE OTHER PLAYER',
  connecting: 'CONNECTING',
  connected: 'CONNECTED',
  closed: 'DISCONNECTED',
  error: 'CONNECTION FAILED',
};
