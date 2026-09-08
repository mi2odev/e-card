import { create } from 'zustand';
import type { LinkInfo, TransportKind } from '../net/link';
import type { LinkStatus } from '../net/protocol';

/** Enough about the table this phone left to offer the seat back. */
export type ResumeInfo = {
  code: string;
  kind: TransportKind;
  role: 'host' | 'guest';
  /** Which of the twelve games was on the table when the phone left. */
  game: number;
  inMatch: boolean;
};

export type NetUiState = {
  active: boolean;
  role: 'host' | 'guest';
  kind: TransportKind;
  status: LinkStatus;
  /** Human-readable reason for the current status, when there is one. */
  detail: string;
  code: string;
  address: string;
  port: number;
  info: LinkInfo | null;
  /** Name this device announced to the other one. */
  myName: string;
  peerName: string;
  peerHere: boolean;
  /** Dialling a link that had been working and dropped. The match is still here. */
  retrying: boolean;
  /** Which attempt at getting back is in flight, counting from 1. */
  attempt: number;
  /** The table this phone walked away from, offered back on the two-phones screen. */
  resume: ResumeInfo | null;
};

type NetActions = {
  patch: (p: Partial<NetUiState>) => void;
  reset: () => void;
};

const initial: NetUiState = {
  active: false,
  role: 'host',
  kind: 'wifi',
  status: 'idle',
  detail: '',
  code: '',
  address: '',
  port: 8787,
  info: null,
  myName: '',
  peerName: '',
  peerHere: false,
  retrying: false,
  attempt: 0,
  resume: null,
};

export const useNet = create<NetUiState & NetActions>((set) => ({
  ...initial,
  patch: (p) => set(p),
  reset: () => set({ ...initial }),
}));
