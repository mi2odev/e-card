import React, { useEffect } from 'react';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../src/theme';
import { Appear, BigButton, GradientText, HistoryStrip, OutlineButton, useCountUp } from '../src/ui/kit';
import { Glow, TableBackground } from '../src/ui/Radial';
import { Confetti } from '../src/ui/Motion';
import { bankOf, nameOf, useGame, winsOf } from '../src/store/useGame';
import { PlayerKey, fmt } from '../src/game/logic';
import { netRematch } from '../src/net/actions';
import { stopSession } from '../src/net/session';
import { draw as drawBuzz, win } from '../src/haptics';

export default function EndScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
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
  // The match in three numbers: how often the Slave struck, how often the
  // Emperor held, and the most that changed hands at once.
  const upsets = history.filter((h) => h.winSide === 'slv').length;
  const emperorWins = history.filter((h) => h.winSide === 'emp').length;
  const biggestPot = history.reduce((most, h) => Math.max(most, h.paid), 0);

  // The last word of the match is felt as well as read.
  useEffect(() => {
    if (winner) win();
    else drawBuzz();
    // Once, on arriving at the tally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sub = stakesOn
    ? `${n1.toUpperCase()} ${fmt(p1pts)} PTS · ${n2.toUpperCase()} ${fmt(p2pts)} PTS`
    : `${n1.toUpperCase()} ${p1w} — ${p2w} ${n2.toUpperCase()}`;

  return (
    <View style={{ flex: 1, backgroundColor: C.tableEdge }}>
      <TableBackground />
      <Glow
        color="rgba(226,180,80,0.22)"
        edge={0.7}
        style={{ left: screen.width / 2 - 230, top: insets.top - 60, width: 460, height: 360 }}
      />
      {winner ? <Confetti width={screen.width} height={screen.height} /> : null}
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

        <Appear delay={120} duration={560} from={0} scaleFrom={0.82} style={{ marginTop: 12 }}>
          <GradientText style={{ fontFamily: F.display, fontSize: 44, lineHeight: 46, letterSpacing: 3, textAlign: 'center' }}>
            {title}
          </GradientText>
        </Appear>

        <Appear delay={380} duration={420} from={6}>
          <Text style={{ fontFamily: F.body, fontSize: 11, letterSpacing: 2, color: C.muted, marginTop: 10, textAlign: 'center' }}>
            {sub}
          </Text>
        </Appear>

        <Appear
          delay={520}
          duration={420}
          from={14}
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
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, letterSpacing: 0.5, color: C.cream }}>
                  {nameOf(state, p).toUpperCase()}
                </Text>
                {winner === p ? (
                  <Text style={{ fontFamily: F.bold, fontSize: 9, letterSpacing: 2.4, color: C.goldText }}>
                    TAKES THE TABLE
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Tally
                  value={stakesOn ? bankOf(state, p) : winsOf(state, p)}
                  from={stakesOn ? state.settings.startingBankroll : 0}
                  money={stakesOn}
                />
                <Text style={{ fontFamily: F.body, fontSize: 9, letterSpacing: 1.5, color: C.muted2 }}>
                  {stakesOn ? `${winsOf(state, p)} WON` : 'ROUNDS WON'}
                </Text>
              </View>
            </View>
          ))}
        </Appear>

        <HistoryStrip history={history} currentGame={game} inMatch={false} cascade style={{ marginTop: 16 }} />

        <Appear delay={900} duration={420} from={10} style={{ width: '100%', flexDirection: 'row', gap: 8, marginTop: 16 }}>
          <Stat label="5× UPSETS" value={upsets} tone="rust" />
          <Stat label="EMPEROR WINS" value={emperorWins} tone="gold" />
          {stakesOn ? (
            <Stat label="BIGGEST POT" value={biggestPot} tone="gold" />
          ) : (
            <Stat label="ROUNDS PLAYED" value={history.length} tone="gold" />
          )}
        </Appear>

        <View style={{ flex: 1, minHeight: 20 }} />

        <BigButton
          label="REMATCH"
          onPress={() => {
            netRematch();
            if (!online) router.replace('/scoreboard');
          }}
          shine
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

/** A final purse, counted out from what both players sat down with. */
function Tally({ value, from, money }: { value: number; from: number; money: boolean }) {
  const shown = useCountUp(value, from, 1400);
  return (
    <Text style={{ fontFamily: F.display, fontSize: 26, lineHeight: 27, color: C.creamWarm }}>
      {money ? fmt(shown) : String(shown)}
    </Text>
  );
}

/** One number from the match, counted in. */
function Stat({ label, value, tone }: { label: string; value: number; tone: 'gold' | 'rust' }) {
  const shown = useCountUp(value, 0, 1100);
  const gold = tone === 'gold';
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: 10,
        paddingHorizontal: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: gold ? C.hairline : C.rustBorder,
        backgroundColor: 'rgba(0,0,0,0.26)',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Text style={{ fontFamily: F.display, fontSize: 28, lineHeight: 30, color: gold ? C.goldText : C.rustText }}>
        {fmt(shown)}
      </Text>
      <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: 8, letterSpacing: 1.5, color: C.muted3 }}>
        {label}
      </Text>
    </View>
  );
}
