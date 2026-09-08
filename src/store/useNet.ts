import { create } from 'zustand';
import type { LinkInfo, TransportKind } from '../net/link';
import type { LinkStatus } from '../net/protocol';

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
};

export const useNet = create<NetUiState & NetActions>((set) => ({
  ...initial,
  patch: (p) => set(p),
  reset: () => set({ ...initial }),
}));
