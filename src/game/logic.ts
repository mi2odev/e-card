// Pure game rules. No React, no store — identical behaviour to the approved design.

export type CardType = 'E' | 'C' | 'S';
export type Card = { id: string; t: CardType };
export type Side = 'emp' | 'slv';
export type PlayerKey = 'p1' | 'p2';
export type StartSide = 'emperor' | 'slave';
export type Hands = Record<Side, Card[]>;

export const LABEL: Record<CardType, string> = { E: 'EMPEROR', C: 'CITIZEN', S: 'SLAVE' };
export const SIDE_WORD: Record<Side, string> = { emp: 'EMPEROR', slv: 'SLAVE' };

export const TOTAL_GAMES = 12;
export const SWAP_EVERY = 3;
export const EMPEROR_MULT = 1;
export const SLAVE_MULT = 5;

/** Which player holds the Emperor side in a given game (sides swap every 3 games). */
export function emperorPlayer(resolvedStart: StartSide, game: number): PlayerKey {
  const evenBlock = Math.floor((game - 1) / SWAP_EVERY) % 2 === 0;
  const p1IsEmperor = resolvedStart === 'emperor' ? evenBlock : !evenBlock;
  return p1IsEmperor ? 'p1' : 'p2';
}

export function playerOfSide(side: Side, resolvedStart: StartSide, game: number): PlayerKey {
  const emp = emperorPlayer(resolvedStart, game);
  if (side === 'emp') return emp;
  return emp === 'p1' ? 'p2' : 'p1';
}

export function sideOfPlayer(p: PlayerKey, resolvedStart: StartSide, game: number): Side {
  return emperorPlayer(resolvedStart, game) === p ? 'emp' : 'slv';
}

export function setNumber(game: number): number {
  return Math.floor((game - 1) / SWAP_EVERY) + 1;
}

export function isSwapGame(game: number): boolean {
  return game > 1 && (game - 1) % SWAP_EVERY === 0;
}

let seq = 0;
function shuffle<T>(a: T[]): T[] {
  for (let j = a.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    const tmp = a[j];
    a[j] = a[k];
    a[k] = tmp;
  }
  return a;
}

/** Emperor side: 1 Emperor + 4 Citizens. Slave side: 1 Slave + 4 Citizens. */
export function freshHands(): Hands {
  const mk = (t: CardType): Card => ({ id: `k${Date.now()}_${seq++}`, t });
  return {
    emp: shuffle([mk('E'), mk('C'), mk('C'), mk('C'), mk('C')]),
    slv: shuffle([mk('S'), mk('C'), mk('C'), mk('C'), mk('C')]),
  };
}

export type DrawOutcome = { draw: true; line: string };
export type DecisiveOutcome = {
  draw: false;
  winSide: Side;
  winner: PlayerKey;
  loser: PlayerKey;
  mult: number;
  paid: number;
  capped: boolean;
  line: string;
};
export type Outcome = DrawOutcome | DecisiveOutcome;

/**
 * Emperor beats Citizen · Citizen beats Slave · Slave beats Emperor.
 * Citizen vs Citizen is a draw and the game continues.
 * Emperor-side win pays 1x, Slave-side win pays 5x, capped at the loser's bankroll.
 */
export function resolveTurn(input: {
  empCard: CardType;
  slvCard: CardType;
  resolvedStart: StartSide;
  game: number;
  stake: number;
  stakesOn: boolean;
  banks: Record<PlayerKey, number>;
}): Outcome {
  const { empCard, slvCard, resolvedStart, game, stake, stakesOn, banks } = input;

  if (empCard === 'C' && slvCard === 'C') {
    return { draw: true, line: 'Both Citizens fall. The duel continues.' };
  }

  let winSide: Side;
  let line: string;
  if (empCard === 'E' && slvCard === 'C') {
    winSide = 'emp';
    line = 'The Emperor crushes the Citizen';
  } else if (empCard === 'E' && slvCard === 'S') {
    winSide = 'slv';
    line = 'The Slave strikes down the Emperor';
  } else {
    winSide = 'emp';
    line = 'The Citizen tramples the Slave';
  }

  const winner = playerOfSide(winSide, resolvedStart, game);
  const loser: PlayerKey = winner === 'p1' ? 'p2' : 'p1';
  const mult = winSide === 'slv' ? SLAVE_MULT : EMPEROR_MULT;

  let paid = 0;
  let capped = false;
  if (stakesOn) {
    const raw = stake * mult;
    paid = Math.min(raw, banks[loser]);
    capped = paid < raw;
  }

  return { draw: false, winSide, winner, loser, mult, paid, capped, line: `${line} — ${mult}\u00d7 payout.` };
}

export const fmt = (n: number | null | undefined) => (n == null ? 0 : n).toLocaleString('en-US');

/* ------------------------------------------------------------------ money */

/** Bankrolls offered on the setup screen. `custom` covers everything else. */
export const BANKROLL_PRESETS = [50, 100, 250, 500, 1000, 5000] as const;

export const MIN_BANKROLL = 10;
export const MAX_BANKROLL = 1_000_000;

/** Table minimums offered on the setup screen (each still clamped to the bankroll). */
export const MIN_STAKE_PRESETS = [0, 5, 10, 25] as const;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A whole-number bankroll inside the supported range. */
export function normalizeBankroll(v: number): number {
  if (!Number.isFinite(v)) return MIN_BANKROLL;
  return clamp(Math.round(v), MIN_BANKROLL, MAX_BANKROLL);
}

/**
 * The table minimum can never exceed half the bankroll — otherwise the first
 * loss would leave a player unable to meet the floor.
 */
export function normalizeMinStake(v: number, bankroll: number): number {
  if (!Number.isFinite(v)) return 0;
  return clamp(Math.round(v), 0, Math.floor(normalizeBankroll(bankroll) / 2));
}

/**
 * What the Slave side may wager: at least the table minimum, at most their own
 * bankroll. When they are too poor to meet the minimum they simply push what is
 * left — a floor is never allowed to make the game unplayable.
 */
export function stakeBounds(bank: number, minStake: number): { min: number; max: number } {
  const max = Math.max(0, Math.floor(bank));
  return { min: Math.min(Math.max(0, Math.round(minStake)), max), max };
}

export const clampStake = (v: number, bank: number, minStake: number) => {
  const { min, max } = stakeBounds(bank, minStake);
  if (!Number.isFinite(v)) return min;
  return clamp(Math.round(v), min, max);
};

/** Nudge size for the ± buttons, scaled so a 5,000 pt table is not tapped 5 at a time. */
export function stakeStep(bank: number): number {
  if (bank <= 100) return 5;
  if (bank <= 500) return 10;
  if (bank <= 2000) return 25;
  if (bank <= 10000) return 100;
  return 500;
}

/** What each side stands to collect if this wager is won. */
export function payoutPreview(stake: number, banks: Record<PlayerKey, number>, emperor: PlayerKey) {
  const slave: PlayerKey = emperor === 'p1' ? 'p2' : 'p1';
  return {
    emperor: Math.min(stake * EMPEROR_MULT, banks[slave]),
    slave: Math.min(stake * SLAVE_MULT, banks[emperor]),
  };
}
