import React, { useEffect } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaInsetsContext, SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import {
  Barlow_400Regular,
  Barlow_400Regular_Italic,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
} from '@expo-google-fonts/barlow';
import { C, F } from '../src/theme';
import { useGame, type Phase } from '../src/store/useGame';
import { useNet } from '../src/store/useNet';
import { STATUS_WORD } from '../src/net/protocol';
import { retryNow, wake } from '../src/net/session';
import { ExitGuard } from '../src/ui/ExitGuard';
import { tapLight } from '../src/haptics';

export default function RootLayout() {
  const [loaded] = useFonts({
    BebasNeue_400Regular,
    Barlow_400Regular,
    Barlow_400Regular_Italic,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
  });

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {loaded ? <AppFrame /> : <View style={{ flex: 1, backgroundColor: C.void }} />}
    </SafeAreaProvider>
  );
}

/**
 * The banner sits *above* the stack in normal layout rather than floating over
 * it, so it can never cover a screen's own header — the leave button on the
 * scoreboard, say. Since it then occupies the notch itself, the screens below
 * are handed a top inset of zero for as long as it is up.
 */
function AppFrame() {
  const insets = useSafeAreaInsets();
  const banner = useLinkBanner();
  useWakeOnForeground();

  return (
    <View style={{ flex: 1, backgroundColor: C.tableEdge }}>
      <NetRouter />
      <ExitGuard />
      {banner ? <LinkBanner {...banner} topInset={insets.top} /> : null}
      <SafeAreaInsetsContext.Provider value={banner ? { ...insets, top: 0 } : insets}>
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              animationDuration: 220,
              gestureEnabled: false,
              contentStyle: { backgroundColor: C.tableEdge },
            }}
          />
        </View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

/**
 * Online, the host owns the phase and both phones follow it. Keeping navigation
 * in one place means a screen never has to know whether it is driving the match
 * or mirroring it.
 */
const PHASE_ROUTE = {
  idle: null,
  lobby: '/lobby',
  scoreboard: '/scoreboard',
  select: '/select',
  reveal: '/reveal',
  end: '/end',
} as const satisfies Record<Phase, string | null>;

type Banner = {
  text: string;
  /** A link being dialled again is amber and patient; a dead one is rust. */
  tone: 'trying' | 'lost';
  /** Whether tapping the banner would actually do anything. */
  canRetry: boolean;
};

/**
 * What, if anything, is wrong with the link right now — null when all is well.
 *
 * The lobby already reports connection state in its own right, so the banner
 * stays out of its way there rather than saying the same thing twice.
 */
function useLinkBanner(): Banner | null {
  const pathname = usePathname();
  const active = useNet((s) => s.active);
  const status = useNet((s) => s.status);
  const detail = useNet((s) => s.detail);
  const peerHere = useNet((s) => s.peerHere);
  const retrying = useNet((s) => s.retrying);
  const inMatch = useGame((s) => s.phase !== 'idle' && s.phase !== 'lobby');

  if (!active || pathname === '/lobby') return null;

  // The link is coming back on its own. Nothing is lost yet, and saying so is
  // the whole point — a player who thinks the match is gone stops playing.
  if (retrying) return { text: detail || 'TAKING THE SEAT AGAIN', tone: 'trying', canRetry: false };

  const dead = status === 'error' || status === 'closed';
  if (!dead && !(inMatch && !peerHere)) return null;

  // Most specific wins: a driver's own diagnosis, then a failed dial, then a
  // peer who really was here and left.
  return {
    text:
      detail ||
      (status === 'error'
        ? STATUS_WORD.error
        : !peerHere
          ? 'THE OTHER PHONE HAS LEFT THE TABLE — THEIR SEAT IS STILL HERE'
          : STATUS_WORD[status]),
    tone: 'lost',
    canRetry: dead,
  };
}

function LinkBanner({ text, tone, canRetry, topInset }: Banner & { topInset: number }) {
  // It drops in rather than appearing, and breathes for as long as it is still
  // dialling — so a glance tells the player whether anything is being done.
  const enter = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    enter.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.ease) });
  }, [enter]);

  useEffect(() => {
    if (tone === 'trying') {
      pulse.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [tone, pulse]);

  const motion = useAnimatedStyle(() => ({
    opacity: enter.value * (1 - 0.3 * pulse.value),
    transform: [{ translateY: -12 * (1 - enter.value) }],
  }));

  return (
    <Animated.View style={motion}>
      <Pressable
        disabled={!canRetry}
        onPress={() => {
          tapLight();
          retryNow();
        }}
        style={({ pressed }) => ({
          paddingTop: topInset + 6,
          paddingBottom: 8,
          paddingHorizontal: 16,
          backgroundColor:
            tone === 'trying' ? 'rgba(120,86,20,0.97)' : pressed ? 'rgba(168,58,32,0.98)' : 'rgba(140,45,26,0.98)',
        })}
      >
        <Text style={{ fontFamily: F.bold, fontSize: 10, letterSpacing: 1.8, color: C.creamOnRust, textAlign: 'center' }}>
          {text}
        </Text>
        {canRetry ? (
          <Text
            style={{
              fontFamily: F.body,
              fontSize: 9,
              letterSpacing: 2,
              color: 'rgba(247,233,212,0.72)',
              textAlign: 'center',
              marginTop: 3,
            }}
          >
            TAP TO TRY AGAIN
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/**
 * A phone that was locked, or an app that was switched away from, comes back to
 * a socket the far end may already have given up on — and to timers that were
 * frozen the whole while. Poke the link the moment the app is in front of the
 * player again, rather than waiting out a backoff that never counted down.
 */
function useWakeOnForeground() {
  const active = useNet((s) => s.active);

  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') wake();
    });
    return () => sub.remove();
  }, [active]);
}

function NetRouter() {
  const router = useRouter();
  const pathname = usePathname();
  const netRole = useGame((s) => s.netRole);
  const phase = useGame((s) => s.phase);

  useEffect(() => {
    if (netRole === 'off') return;
    const target = PHASE_ROUTE[phase];
    if (target && pathname !== target) router.replace(target);
  }, [netRole, phase, pathname, router]);

  return null;
}
