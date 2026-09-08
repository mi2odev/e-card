import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
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
import { ExitGuard } from '../src/ui/ExitGuard';

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

  return (
    <View style={{ flex: 1, backgroundColor: C.tableEdge }}>
      <NetRouter />
      <ExitGuard />
      {banner ? <LinkBanner text={banner} topInset={insets.top} /> : null}
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

/**
 * What, if anything, is wrong with the link right now — null when all is well.
 *
 * The lobby already reports connection state in its own right, so the banner
 * stays out of its way there rather than saying the same thing twice.
 */
function useLinkBanner(): string | null {
  const pathname = usePathname();
  const active = useNet((s) => s.active);
  const status = useNet((s) => s.status);
  const detail = useNet((s) => s.detail);
  const peerHere = useNet((s) => s.peerHere);
  const inMatch = useGame((s) => s.phase !== 'idle' && s.phase !== 'lobby');

  if (!active || pathname === '/lobby') return null;
  const broken = status === 'error' || status === 'closed' || (inMatch && !peerHere);
  if (!broken) return null;

  // Most specific wins: a driver's own diagnosis, then a failed dial, then a
  // peer who really was here and left.
  return (
    detail ||
    (status === 'error' ? STATUS_WORD.error : !peerHere ? 'THE OTHER PHONE HAS LEFT THE TABLE' : STATUS_WORD[status])
  );
}

function LinkBanner({ text, topInset }: { text: string; topInset: number }) {
  return (
    <View
      style={{
        paddingTop: topInset + 6,
        paddingBottom: 8,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(140,45,26,0.98)',
      }}
    >
      <Text style={{ fontFamily: F.bold, fontSize: 10, letterSpacing: 1.8, color: C.creamOnRust, textAlign: 'center' }}>
        {text}
      </Text>
    </View>
  );
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
