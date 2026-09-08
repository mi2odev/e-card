import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../src/theme';
import { BigButton, GradientText, HistoryStrip, OutlineButton } from '../src/ui/kit';
import { TableBackground } from '../src/ui/Radial';
import { bankOf, nameOf, useGame, winsOf } from '../src/store/useGame';
import { PlayerKey, fmt } from '../src/game/logic';
import { netRematch } from '../src/net/actions';
import { stopSession } from '../src/net/session';

export default function EndScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const state = useGame();
  const { stakesOn, p1pts, p2pts, p1w, p2w, history, game, netRole } = state;
  const online = netRole !== 'off';

  const n1 = nameOf(state, 'p1');
  const n2 = nameOf(state, 'p2');

  const a = stakesOn ? p1pts : p1w;
  const b = stakesOn ? p2pts : p2w;
  let winner: PlayerKey | null = null;
  if (a > b) winner = 'p1';
  else if (b > a) winner = 'p2';
  else if (stakesOn) {
    if (p1w > p2w) winner = 'p1';
    else if (p2w > p1w) winner = 'p2';
  }

  const title = winner ? `${nameOf(state, winner).toUpperCase()} TAKES THE TABLE` : 'DEAD HEAT';
  const sub = stakesOn
    ? `${n1.toUpperCase()} ${fmt(p1pts)} PTS · ${n2.toUpperCase()} ${fmt(p2pts)} PTS`
    : `${n1.toUpperCase()} ${p1w} — ${p2w} ${n2.toUpperCase()}`;

  return (
    <View style={{ flex: 1, backgroundColor: C.tableEdge }}>
      <TableBackground />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          paddingTop: 46 + insets.top,
          paddingHorizontal: 24,
          paddingBottom: 22 + insets.bottom,
        }}
      >
        <Text style={{ fontFamily: F.body, fontSize: 11, letterSpacing: 4, color: C.muted3 }}>MATCH OVER</Text>

        <View style={{ marginTop: 12 }}>
          <GradientText style={{ fontFamily: F.display, fontSize: 44, lineHeight: 46, letterSpacing: 3, textAlign: 'center' }}>
            {title}
          </GradientText>
        </View>

        <Text style={{ fontFamily: F.body, fontSize: 11, letterSpacing: 2, color: C.muted, marginTop: 10, textAlign: 'center' }}>
          {sub}
        </Text>

        <View
          style={{
            width: '100%',
            marginTop: 22,
            borderRadius: 16,
            backgroundColor: C.panel,
            borderWidth: 1,
            borderColor: C.hairline,
            overflow: 'hidden',
          }}
        >
          {(['p1', 'p2'] as const).map((p, i) => (
            <View
              key={p}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingVertical: 14,
                paddingHorizontal: 16,
                backgroundColor: winner === p ? 'rgba(212,165,60,0.09)' : 'transparent',
                borderTopWidth: i === 1 ? 1 : 0,
                borderTopColor: C.hairlineSoft,
              }}
            >
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: 15, letterSpacing: 0.5, color: C.cream }}>
                {nameOf(state, p).toUpperCase()}
              </Text>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={{ fontFamily: F.display, fontSize: 26, lineHeight: 27, color: C.creamWarm }}>
                  {stakesOn ? fmt(bankOf(state, p)) : String(winsOf(state, p))}
                </Text>
                <Text style={{ fontFamily: F.body, fontSize: 9, letterSpacing: 1.5, color: C.muted2 }}>
                  {stakesOn ? `${winsOf(state, p)} WON` : 'ROUNDS WON'}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <HistoryStrip history={history} currentGame={game} inMatch={false} style={{ marginTop: 16 }} />

        <View style={{ flex: 1, minHeight: 20 }} />

        <BigButton
          label="REMATCH"
          onPress={() => {
            netRematch();
            if (!online) router.replace('/scoreboard');
          }}
          style={{ width: '100%' }}
        />
        <OutlineButton
          label={online ? 'LEAVE THE TABLE' : 'BACK TO TITLE'}
          onPress={() => {
            if (online) stopSession('left the table');
            useGame.getState().endMatch();
            router.replace('/');
          }}
          style={{ width: '100%', marginTop: 10 }}
        />
      </ScrollView>
    </View>
  );
}
