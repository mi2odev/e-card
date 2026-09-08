import React, { useEffect } from 'react';
import { Text, View } from 'react-native';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
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
      {loaded ? (
        <>
          <NetRouter />
          <LinkBanner />
          <ExitGuard />
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              animationDuration: 220,
              gestureEnabled: false,
              contentStyle: { backgroundColor: C.tableEdge },
            }}
          />
        </>
      ) : (
        <View style={{ flex: 1, backgroundColor: C.void }} />
      )}
    </SafeAreaProvider>
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
 * A dropped link would otherwise be invisible from the middle of a match, so it
 * gets one line above everything. Only shown when something is actually wrong.
 */
function LinkBanner() {
  const insets = useSafeAreaInsets();
  const active = useNet((s) => s.active);
  const status = useNet((s) => s.status);
  const detail = useNet((s) => s.detail);
  const peerHere = useNet((s) => s.peerHere);
  const inMatch = useGame((s) => s.phase !== 'idle' && s.phase !== 'lobby');

  const broken = status === 'error' || status === 'closed' || (inMatch && !peerHere);
  if (!active || !broken) return null;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        paddingTop: insets.top + 4,
        paddingBottom: 7,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(140,45,26,0.94)',
      }}
    >
      <Text
        numberOfLines={3}
        style={{ fontFamily: F.bold, fontSize: 10, letterSpacing: 1.8, color: C.creamOnRust, textAlign: 'center' }}
      >
        {/* Most specific wins: a driver's own diagnosis, then a failed dial, then
            a peer who really was here and left. */}
        {detail || (status === 'error' ? STATUS_WORD.error : !peerHere ? 'THE OTHER PHONE HAS LEFT THE TABLE' : STATUS_WORD[status])}
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
