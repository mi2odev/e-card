import { create } from 'zustand';
import {
  Card,
  Hands,
  Outcome,
  PlayerKey,
  Side,
  StartSide,
  TOTAL_GAMES,
  emperorPlayer,
  freshHands,
  playerOfSide,
  resolveTurn,
} from '../game/logic';

export type HistoryEntry = { g: number; winner: PlayerKey; winSide: Side; paid: number };
export type RevealStep = 0 | 1 | 2 | 3 | 4;

export type Settings = {
  /** Beat between the cards landing and the flip, in seconds (design default 1.4). */
  revealDrama: number;
  startingBankroll: number;
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
};

type Actions = {
  setP1: (v: string) => void;
  setP2: (v: string) => void;
  toggleStakes: () => void;
  setSideChoice: (v: 'emperor' | 'random' | 'slave') => void;
  beginMatch: () => void;
  goPre: (game: number) => void;
  deal: () => void;
  tapCard: (i: number) => 'raised' | 'confirm';
  confirmSel: () => 'handoff' | 'reveal' | 'noop';
  setRev: (r: RevealStep) => void;
  applyResult: () => void;
  skipReveal: () => boolean;
  continueReveal: () => 'handoff' | 'scoreboard' | 'end' | 'noop';
  adjStake: (d: number) => void;
  allIn: () => void;
  quitTap: () => 'armed' | 'quit';
  resetToTitle: () => void;
};

export type GameStore = State & Actions;

const DEFAULT_SETTINGS: Settings = { revealDrama: 1.4, startingBankroll: 100, matchupHints: true };

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
};

export const useGame = create<GameStore>((set, get) => ({
  ...initial,

  setP1: (v) => set({ p1: v }),
  setP2: (v) => set({ p2: v }),
  toggleStakes: () => set((s) => ({ stakesOn: !s.stakesOn })),
  setSideChoice: (v) => set({ sideChoice: v }),

  beginMatch: () => {
    const s = get();
    const bank = Math.max(10, Math.round(s.settings.startingBankroll));
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
      stake: Math.min(25, bank),
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
    const max = bankOf(s, slavePlayer);
    set({
      game,
      quitArm: false,
      stake: Math.max(0, Math.min(s.stake || 25, max)),
      result: null,
      rev: 0,
      applied: false,
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

  confirmSel: () => {
    const s = get();
    if (s.sel < 0 || !s.hands) return 'noop';
    const hand = s.hands[s.picker].slice();
    const card = hand.splice(s.sel, 1)[0];
    const hands: Hands = { ...s.hands, [s.picker]: hand } as Hands;
    const picks = { ...s.picks, [s.picker]: card };

    if (s.picker === 'emp') {
      set({ hands, picks, picker: 'slv', sel: -1 });
      return 'handoff';
    }
    set({ hands, picks, sel: -1, rev: 0, applied: false, result: computeResult({ ...s, hands, picks }) });
    return 'reveal';
  },

  setRev: (rev) => set({ rev }),

  applyResult: () => {
    const s = get();
    if (s.applied) return;
    const r = s.result;
    if (!r) return;
    if (r.draw) {
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
      });
      return 'handoff';
    }

    get().applyResult();
    if (s.game >= TOTAL_GAMES) {
      set({ inMatch: false });
      return 'end';
    }
    get().goPre(s.game + 1);
    return 'scoreboard';
  },

  adjStake: (d) => {
    const s = get();
    const max = bankOf(s, playerOfSide('slv', s.resolvedStart, s.game));
    set({ stake: Math.max(0, Math.min(max, s.stake + d)) });
  },

  allIn: () => {
    const s = get();
    set({ stake: bankOf(s, playerOfSide('slv', s.resolvedStart, s.game)) });
  },

  quitTap: () => {
    if (get().quitArm) {
      set({ quitArm: false, inMatch: false });
      return 'quit';
    }
    set({ quitArm: true });
    return 'armed';
  },

  resetToTitle: () => set({ ...initial, p1: get().p1, p2: get().p2, settings: get().settings }),
}));

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

export function nameOf(s: State, p: PlayerKey) {
  const raw = (p === 'p1' ? s.p1 : s.p2) || '';
  return raw.trim() || (p === 'p1' ? 'Player 1' : 'Player 2');
}

export const empPlayerNow = (s: State) => emperorPlayer(s.resolvedStart, s.game);
export const sidePlayerNow = (s: State, side: Side) => playerOfSide(side, s.resolvedStart, s.game);
export const pickerPlayer = (s: State) => sidePlayerNow(s, s.picker);
export const otherSide = (side: Side): Side => (side === 'emp' ? 'slv' : 'emp');
