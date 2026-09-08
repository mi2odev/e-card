/**
 * What the screens call. Offline and host act on the store directly; the guest
 * asks the host and waits for the snapshot that follows.
 */

import { canSetStake, localPlayer, localSide, sidePlayerNow, useGame } from '../store/useGame';
import { advanceOnHost, sendIntent } from './session';

const isGuest = () => useGame.getState().netRole === 'guest';

/**
 * Online, the Slave side names the wager and deals on it — the same rule the
 * host enforces on incoming intents, applied here so the host cannot break it
 * either. Offline the one phone does everything.
 */
const dealIsMine = () => {
  const s = useGame.getState();
  return s.netRole === 'off' || localPlayer(s) === sidePlayerNow(s, 'slv');
};

export function netDeal(): void {
  if (!dealIsMine()) return;
  if (isGuest()) return sendIntent({ k: 'deal' });
  useGame.getState().deal();
}

export function netSetStake(value: number): void {
  if (!canSetStake(useGame.getState())) return;
  if (isGuest()) return sendIntent({ k: 'stake', value });
  useGame.getState().setStake(value);
}

export function netPick(index: number): void {
  if (isGuest()) return sendIntent({ k: 'pick', index });
  const s = useGame.getState();
  s.submitPick(localSide(s), index);
}

export function netAdvance(): void {
  if (isGuest()) return sendIntent({ k: 'advance' });
  advanceOnHost();
}

export function netRematch(): void {
  if (isGuest()) return sendIntent({ k: 'rematch' });
  useGame.getState().beginMatch();
}
