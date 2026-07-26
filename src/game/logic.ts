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
