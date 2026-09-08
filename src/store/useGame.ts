import { create } from 'zustand';
import {
  type Card,
  type Hands,
  type Outcome,
  type PlayerKey,
  type Side,
  type StartSide,
  TOTAL_GAMES,
  clampStake,
  emperorPlayer,
  freshHands,
  normalizeBankroll,
  normalizeMinStake,
  playerOfSide,
  resolveTurn,
  stakeBounds,
  stakeStep,
} from '../game/logic';

export type HistoryEntry = { g: number; winner: PlayerKey; winSide: Side; paid: number };
export type RevealStep = 0 | 1 | 2 | 3 | 4;

/** Where the match is. Drives navigation on both devices when playing online. */
export type Phase = 'idle' | 'lobby' | 'scoreboard' | 'select' | 'reveal' | 'end';

/** 'off' = pass & play. 'host' owns the match state; 'guest' mirrors it. */
export type NetRole = 'off' | 'host' | 'guest';

export type Settings = {
  /** Beat between the cards landing and the flip, in seconds (design default 1.4). */
  revealDrama: number;
  startingBankroll: number;
  /** Table minimum the Slave side must wager, when they can afford it. */
  minStake: number;
  matchupHints: boolean;
};

export type State = {
  p1: string;
  p2: string;
  stakesOn: boolean;
  sideChoice: 'emperor' | 'random' | 'slave';
  resolvedStart: StartSide;
  inMatch: boolean;
  game: number;
  turn: number;
  p1w: number;
  p2w: number;
  p1pts: number;
  p2pts: number;
  hands: Hands | null;
  discards: number[];
  picks: Record<Side, Card | null>;
  picker: Side;
  sel: number;
  raisedAt: number;
  stake: number;
  rev: RevealStep;
  result: Outcome | null;
  applied: boolean;
  history: HistoryEntry[];
  quitArm: boolean;
  settings: Settings;
  phase: Phase;
  netRole: NetRole;
  /** Which player this device controls. Always 'p1' for the host, 'p2' for the guest. */
  seat: PlayerKey;
};

type Actions = {
  setP1: (v: string) => void;
  setP2: (v: string) => void;
  toggleStakes: () => void;
  setSideChoice: (v: 'emperor' | 'random' | 'slave') => void;
  setStartingBankroll: (v: number) => void;
  setMinStake: (v: number) => void;
  beginMatch: () => void;
  goPre: (game: number) => void;
  deal: () => void;
  tapCard: (i: number) => 'raised' | 'confirm';
  confirmSel: () => 'handoff' | 'reveal' | 'noop';
  submitPick: (side: Side, index: number) => 'waiting' | 'reveal' | 'noop';
  setRev: (r: RevealStep) => void;
  applyResult: () => void;
  skipReveal: () => boolean;
  continueReveal: () => 'handoff' | 'select' | 'scoreboard' | 'end' | 'noop';
  adjStake: (d: number) => void;
  setStake: (v: number) => void;
  allIn: () => void;
  minBet: () => void;
  scaleStake: (factor: number) => void;
  quitTap: () => 'armed' | 'quit';
  setPhase: (p: Phase) => void;
  startNet: (role: Exclude<NetRole, 'off'>, seat: PlayerKey) => void;
  endNet: () => void;
  resetToTitle: () => void;
};

export type GameStore = State & Actions;

const DEFAULT_SETTINGS: Settings = {
  revealDrama: 1.4,
  startingBankroll: 100,
  minStake: 0,
  matchupHints: true,
};

const initial: State = {
  p1: '',
  p2: '',
  stakesOn: true,
  sideChoice: 'emperor',
  resolvedStart: 'emperor',
  inMatch: false,
  game: 1,
  turn: 1,
  p1w: 0,
  p2w: 0,
  p1pts: 100,
  p2pts: 100,
  hands: null,
  discards: [],
  picks: { emp: null, slv: null },
  picker: 'emp',
  sel: -1,
  raisedAt: 0,
  stake: 25,
  rev: 0,
  result: null,
  applied: false,
  history: [],
  quitArm: false,
  settings: DEFAULT_SETTINGS,
  phase: 'idle',
  netRole: 'off',
  seat: 'p1',
};

export const useGame = create<GameStore>((set, get) => ({
  ...initial,

  setP1: (v) => set({ p1: v }),
  setP2: (v) => set({ p2: v }),
  toggleStakes: () => set((s) => ({ stakesOn: !s.stakesOn })),
  setSideChoice: (v) => set({ sideChoice: v }),

  setStartingBankroll: (v) => {
    const startingBankroll = normalizeBankroll(v);
    set((s) => ({
      settings: {
        ...s.settings,
        startingBankroll,
        minStake: normalizeMinStake(s.settings.minStake, startingBankroll),
      },
    }));
  },

  setMinStake: (v) =>
    set((s) => ({
      settings: { ...s.settings, minStake: normalizeMinStake(v, s.settings.startingBankroll) },
    })),

  beginMatch: () => {
    const s = get();
    const bank = normalizeBankroll(s.settings.startingBankroll);
    const minStake = normalizeMinStake(s.settings.minStake, bank);
    const resolvedStart: StartSide =
      s.sideChoice === 'random' ? (Math.random() < 0.5 ? 'emperor' : 'slave') : s.sideChoice;
    set({
      resolvedStart,
      inMatch: true,
      p1w: 0,
      p2w: 0,
      p1pts: bank,
      p2pts: bank,
      history: [],
      settings: { ...s.settings, startingBankroll: bank, minStake },
      stake: clampStake(openingStake(bank, minStake), bank, minStake),
      hands: null,
      discards: [],
      picks: { emp: null, slv: null },
      picker: 'emp',
      sel: -1,
      result: null,
      rev: 0,
      applied: false,
    });
    get().goPre(1);
  },

  goPre: (game) => {
    const s = get();
    const slavePlayer = playerOfSide('slv', s.resolvedStart, game);
    const bank = bankOf(s, slavePlayer);
    set({
      game,
      quitArm: false,
      stake: clampStake(s.stake || openingStake(s.settings.startingBankroll, s.settings.minStake), bank, s.settings.minStake),
      result: null,
      rev: 0,
      applied: false,
      phase: 'scoreboard',
    });
  },

  deal: () =>
    set({
      hands: freshHands(),
      discards: [],
      picks: { emp: null, slv: null },
      picker: 'emp',
      sel: -1,
      turn: 1,
      result: null,
      rev: 0,
      applied: false,
      phase: 'select',
    }),

  tapCard: (i) => {
    const s = get();
    if (s.sel === i) {
      // Second tap on the raised card commits it (guarded so the raise tap can't double-fire).
      if (Date.now() - s.raisedAt > 350) return 'confirm';
      return 'raised';
    }
    set({ sel: i, raisedAt: Date.now() });
    return 'raised';
  },

  /** Pass & play: the side currently holding the device commits, then the device changes hands. */
  confirmSel: () => {
    const s = get();
    if (s.sel < 0) return 'noop';
    const out = get().submitPick(s.picker, s.sel);
    if (out === 'noop') return 'noop';
    if (out === 'reveal') return 'reveal';
    set({ picker: s.picker === 'emp' ? 'slv' : 'emp' });
    return 'handoff';
  },

  /**
   * Commit one side's card. Host-authoritative: online, both seats submit
   * independently and the turn resolves the moment the second card lands.
   */
  submitPick: (side, index) => {
    const s = get();
    if (!s.hands || s.picks[side]) return 'noop';
    const hand = s.hands[side].slice();
    if (index < 0 || index >= hand.length) return 'noop';
    const card = hand.splice(index, 1)[0];
    const hands: Hands = { ...s.hands, [side]: hand } as Hands;
    const picks = { ...s.picks, [side]: card };

    if (!picks.emp || !picks.slv) {
      set({ hands, picks, sel: -1 });
      return 'waiting';
    }
    set({
      hands,
      picks,
      sel: -1,
      rev: 0,
      applied: false,
      result: computeResult({ ...s, hands, picks }),
      phase: 'reveal',
    });
    return 'reveal';
  },

  setRev: (rev) => set({ rev }),

  applyResult: () => {
    const s = get();
    if (s.applied) return;
    const r = s.result;
    if (!r) return;
    // The guest mirrors the host's tally; it never moves money itself.
    if (r.draw || s.netRole === 'guest') {
      set({ applied: true });
      return;
    }
    const paid = s.stakesOn ? r.paid : 0;
    const winnerIsP1 = r.winner === 'p1';
    set({
      applied: true,
      p1w: s.p1w + (winnerIsP1 ? 1 : 0),
      p2w: s.p2w + (winnerIsP1 ? 0 : 1),
      p1pts: s.p1pts + (winnerIsP1 ? paid : -paid),
      p2pts: s.p2pts + (winnerIsP1 ? -paid : paid),
      history: s.history.concat([{ g: s.game, winner: r.winner, winSide: r.winSide, paid: r.paid }]),
    });
  },

  skipReveal: () => {
    const s = get();
    if (s.rev > 0 && s.rev < 4) {
      set({ rev: 4 });
      get().applyResult();
      return true;
    }
    return false;
  },

  continueReveal: () => {
    const s = get();
    if (s.rev < 4) return 'noop';
    const r = s.result;
    if (!r) return 'noop';

    if (r.draw) {
      set({
        discards: s.discards.concat([s.turn]),
        turn: s.turn + 1,
        picks: { emp: null, slv: null },
        picker: 'emp',
        sel: -1,
        rev: 0,
        result: null,
        applied: false,
        phase: 'select',
      });
      return s.netRole === 'off' ? 'handoff' : 'select';
    }

    get().applyResult();
    if (s.game >= TOTAL_GAMES) {
      set({ inMatch: false, phase: 'end' });
      return 'end';
    }
    get().goPre(s.game + 1);
    return 'scoreboard';
  },

  adjStake: (d) => {
    const s = get();
    set({ stake: clampStake(s.stake + d, slaveBank(s), s.settings.minStake) });
  },

  setStake: (v) => {
    const s = get();
    set({ stake: clampStake(v, slaveBank(s), s.settings.minStake) });
  },

  allIn: () => {
    const s = get();
    set({ stake: clampStake(slaveBank(s), slaveBank(s), s.settings.minStake) });
  },

  minBet: () => {
    const s = get();
    set({ stake: stakeBounds(slaveBank(s), s.settings.minStake).min });
  },

  scaleStake: (factor) => {
    const s = get();
    set({ stake: clampStake(Math.round(s.stake * factor), slaveBank(s), s.settings.minStake) });
  },

  quitTap: () => {
    if (get().quitArm) {
      set({ quitArm: false, inMatch: false });
      return 'quit';
    }
    set({ quitArm: true });
    return 'armed';
  },

  setPhase: (phase) => set({ phase }),

  startNet: (role, seat) => set({ netRole: role, seat, phase: 'lobby' }),

  endNet: () => set({ netRole: 'off', seat: 'p1', phase: 'idle' }),

  resetToTitle: () =>
    set({ ...initial, p1: get().p1, p2: get().p2, settings: get().settings }),
}));

/** Opening wager: a quarter of the bankroll, rounded to the nudge size, above the floor. */
export function openingStake(bankroll: number, minStake: number): number {
  const step = stakeStep(bankroll);
  const quarter = Math.max(step, Math.round(bankroll / 4 / step) * step);
  return clampStake(quarter, bankroll, minStake);
}

function computeResult(s: State): Outcome | null {
  const e = s.picks.emp;
  const v = s.picks.slv;
  if (!e || !v) return null;
  return resolveTurn({
    empCard: e.t,
    slvCard: v.t,
    resolvedStart: s.resolvedStart,
    game: s.game,
    stake: s.stake,
    stakesOn: s.stakesOn,
    banks: { p1: s.p1pts, p2: s.p2pts },
  });
}

// ---- derived helpers (plain functions so screens stay declarative) ----
export const bankOf = (s: State, p: PlayerKey) => (p === 'p1' ? s.p1pts : s.p2pts);
export const winsOf = (s: State, p: PlayerKey) => (p === 'p1' ? s.p1w : s.p2w);

const slaveBank = (s: State) => bankOf(s, playerOfSide('slv', s.resolvedStart, s.game));

export function nameOf(s: State, p: PlayerKey) {
  const raw = (p === 'p1' ? s.p1 : s.p2) || '';
  return raw.trim() || (p === 'p1' ? 'Player 1' : 'Player 2');
}

export const empPlayerNow = (s: State) => emperorPlayer(s.resolvedStart, s.game);
export const sidePlayerNow = (s: State, side: Side) => playerOfSide(side, s.resolvedStart, s.game);
export const pickerPlayer = (s: State) => sidePlayerNow(s, s.picker);
export const otherSide = (side: Side): Side => (side === 'emp' ? 'slv' : 'emp');

/** The side this device plays. Online that is the seat; offline it is whoever holds the phone. */
export const localSide = (s: State): Side =>
  s.netRole === 'off' ? s.picker : (sidePlayerNow(s, 'emp') === s.seat ? 'emp' : 'slv');

export const localPlayer = (s: State): PlayerKey => (s.netRole === 'off' ? pickerPlayer(s) : s.seat);

export const isOnline = (s: State) => s.netRole !== 'off';

/** Online, only the Slave side may move the wager. Offline, whoever holds the phone can. */
export const canSetStake = (s: State) => s.netRole === 'off' || localSide(s) === 'slv';

export const stakeRange = (s: State) => stakeBounds(slaveBank(s), s.settings.minStake);
