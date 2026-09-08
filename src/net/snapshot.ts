// The host is authoritative. Every change it makes is serialised here, redacted
// per recipient, and applied verbatim on the other phone.
//
// Redaction is the whole point: a guest's device is only ever sent its own hand.
// The opponent's cards are replaced with same-length placeholders, and the
// opponent's played card stays hidden until the turn has actually resolved.

import type { Card, Hands, Outcome, PlayerKey, Side, StartSide } from '../game/logic';
import { playerOfSide } from '../game/logic';
import type { HistoryEntry, Phase, Settings, State } from '../store/useGame';

export type Snapshot = {
  v: 1;
  p1: string;
  p2: string;
  stakesOn: boolean;
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
  stake: number;
  result: Outcome | null;
  history: HistoryEntry[];
  settings: Settings;
  phase: Phase;
};

const HIDDEN_PREFIX = 'hidden:';

/** A stand-in card. Same id shape as a real one so React keys stay stable. */
const hiddenCard = (n: number): Card => ({ id: `${HIDDEN_PREFIX}${n}`, t: 'C' });

export const isHidden = (c: Card | null | undefined) => !!c && c.id.startsWith(HIDDEN_PREFIX);

/** Which side of the table a seat is playing this game. */
export function seatSide(seat: PlayerKey, resolvedStart: StartSide, game: number): Side {
  return playerOfSide('emp', resolvedStart, game) === seat ? 'emp' : 'slv';
}

/**
 * Build the view of the match that `forSeat` is allowed to see.
 * Pass the host's own seat to get an unredacted copy.
 */
export function makeSnapshot(s: State, forSeat: PlayerKey): Snapshot {
  const mine = seatSide(forSeat, s.resolvedStart, s.game);
  const theirs: Side = mine === 'emp' ? 'slv' : 'emp';

  let hands: Hands | null = null;
  if (s.hands) {
    hands = {
      [mine]: s.hands[mine],
      [theirs]: s.hands[theirs].map((_, i) => hiddenCard(i)),
    } as Hands;
  }

  // Once the turn has resolved both cards are on the table, so nothing is left to hide.
  const resolved = s.result != null;
  const picks: Record<Side, Card | null> = {
    [mine]: s.picks[mine],
    [theirs]: resolved ? s.picks[theirs] : s.picks[theirs] ? hiddenCard(99) : null,
  } as Record<Side, Card | null>;

  return {
    v: 1,
    p1: s.p1,
    p2: s.p2,
    stakesOn: s.stakesOn,
    resolvedStart: s.resolvedStart,
    inMatch: s.inMatch,
    game: s.game,
    turn: s.turn,
    p1w: s.p1w,
    p2w: s.p2w,
    p1pts: s.p1pts,
    p2pts: s.p2pts,
    hands,
    discards: s.discards,
    picks,
    picker: s.picker,
    stake: s.stake,
    result: s.result,
    history: s.history,
    settings: s.settings,
    phase: s.phase,
  };
}

/**
 * Fields the guest adopts from a snapshot. `sel`, `rev`, `applied` and `quitArm`
 * stay local — the reveal animation runs independently on each device.
 */
export function applySnapshot(snap: Snapshot, prev: State): Partial<State> {
  const turnChanged = snap.game !== prev.game || snap.turn !== prev.turn || snap.phase !== prev.phase;
  return {
    p1: snap.p1,
    p2: snap.p2,
    stakesOn: snap.stakesOn,
    resolvedStart: snap.resolvedStart,
    inMatch: snap.inMatch,
    game: snap.game,
    turn: snap.turn,
    p1w: snap.p1w,
    p2w: snap.p2w,
    p1pts: snap.p1pts,
    p2pts: snap.p2pts,
    hands: snap.hands,
    discards: snap.discards,
    picks: snap.picks,
    picker: snap.picker,
    stake: snap.stake,
    result: snap.result,
    history: snap.history,
    settings: snap.settings,
    phase: snap.phase,
    ...(turnChanged ? { sel: -1, rev: 0 as const, applied: false } : null),
  };
}

/** Cheap change detector so an unchanged store does not spam the link. */
export function snapshotKey(snap: Snapshot): string {
  return JSON.stringify(snap);
}
