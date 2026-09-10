/**
 * One way out of a match, and it always asks first.
 *
 * Every in-match screen navigates with `router.replace`, so the Android back
 * button used to drop straight to the title and take the match with it — no
 * warning, no way back. This guard intercepts that, and the leave buttons on the
 * scoreboard and in the lobby route through the same prompt, so an accidental
 * tap costs nothing anywhere.
 */

import React, { useCallback, useEffect } from 'react';
import { BackHandler } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { create } from 'zustand';
import { ConfirmModal } from './kit';
import { nameOf, useGame } from '../store/useGame';
import { useNet } from '../store/useNet';
import { stopSession } from '../net/session';

/** Screens where backing out would throw away a match in progress. */
const GUARDED = ['/lobby', '/scoreboard', '/handoff', '/select', '/reveal'];

/**
 * The final tally. Nothing is left to lose, so backing out just leaves — but it
 * has to leave properly: an online session left running here would have the
 * phase router bounce the player straight back to this screen.
 */
const FINISHED = '/end';

type ExitPrompt = { visible: boolean; show: () => void; hide: () => void };

const useExitPrompt = create<ExitPrompt>((set) => ({
  visible: false,
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
}));

/** Ask to leave. Screens call this instead of navigating away themselves. */
export const requestExit = () => useExitPrompt.getState().show();

export function ExitGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const visible = useExitPrompt((s) => s.visible);
  const hide = useExitPrompt((s) => s.hide);

  const state = useGame();
  const net = useNet();
  const online = state.netRole !== 'off';
  const guarded = GUARDED.includes(pathname);
  const inLobby = pathname === '/lobby';

  const leave = useCallback(() => {
    hide();
    // Said to the other phone, and shown there as prose rather than shouted.
    if (useGame.getState().netRole !== 'off') stopSession('The other player left the table.');
    useGame.getState().endMatch();
    router.replace('/');
  }, [hide, router]);

  // Android's back button. Returning true swallows it; false lets the system
  // do its usual thing, which on the title screen means backgrounding the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (guarded) {
        useExitPrompt.getState().show();
        return true;
      }
      if (pathname === FINISHED) {
        leave();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [guarded, pathname, leave]);

  // If the match ends or the link drops while the prompt is up, drop the prompt:
  // it would be asking about something that is no longer true.
  useEffect(() => {
    if (visible && !guarded) hide();
  }, [visible, guarded, hide]);

  if (!visible) return null;

  const opponent = nameOf(state, state.seat === 'p1' ? 'p2' : 'p1');
  const title = inLobby ? 'LEAVE THE TABLE?' : 'ABANDON THE MATCH?';

  // Online, walking away is not the end of it: the table is kept, and TWO PHONES
  // offers the seat back for as long as the other phone is still holding it.
  let body: string;
  if (inLobby) {
    body =
      net.role === 'guest'
        ? 'Whoever opened the table keeps it open. You can take this seat again from TWO PHONES.'
        : net.peerHere
          ? `${opponent} is already seated. Leaving closes the table and sends them back to the title — reopening it on the same code lets them back in.`
          : 'The table closes and the code stops working. You can open a new one at any time.';
  } else if (online) {
    body = `Round ${state.game} of 12 is still on the table, and ${opponent} will be left sitting at it. You can take the seat again from TWO PHONES while they hold it.`;
  } else {
    body = `Round ${state.game} of 12 is still on the table. Every point either of you has won is lost — nothing is saved.`;
  }

  return (
    <ConfirmModal
      visible={visible}
      title={title}
      body={body}
      confirmLabel={inLobby ? 'LEAVE' : 'ABANDON'}
      cancelLabel={inLobby ? 'STAY' : 'KEEP PLAYING'}
      onCancel={hide}
      onConfirm={leave}
    />
  );
}
