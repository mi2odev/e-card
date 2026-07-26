import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, sideColor } from '../src/theme';
import { BigButton, GradientText, HelpButton, HistoryStrip, SideMono, shadow } from '../src/ui/kit';
import { TableBackground } from '../src/ui/Radial';
import { bankOf, nameOf, sidePlayerNow, useGame, winsOf } from '../src/store/useGame';
import { fmt, isSwapGame, setNumber, sideOfPlayer } from '../src/game/logic';
import { tapLight, tick } from '../src/haptics';

export default function ScoreboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const state = useGame();
  const { game, stakesOn, stake, history, quitArm, resolvedStart, adjStake, allIn, deal, quitTap } = state;

  const slavePlayer = sidePlayerNow(state, 'slv');

  return (
    <View style={{ flex: 1, backgroundColor: C.tableEdge }}>
      <TableBackground />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top, paddingBottom: 20 + insets.bottom }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 12,
            paddingHorizontal: 14,
          }}
        >
          <Pressable
            onPress={() => {
              tapLight();
              if (quitTap() === 'quit') router.replace('/');
            }}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                height: 40,
                paddingLeft: 12,
                paddingRight: 15,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: quitArm ? 'rgba(199,90,54,0.75)' : 'rgba(212,165,60,0.28)',
                backgroundColor: quitArm ? 'rgba(199,90,54,0.16)' : 'rgba(0,0,0,0.28)',
              },
              pressed && { transform: [{ translateY: 1 }] },
            ]}
          >
            <Text style={{ fontFamily: F.display, fontSize: 16, lineHeight: 17, color: quitArm ? C.rustText : C.muted }}>✕</Text>
            <Text style={{ fontFamily: F.bold, fontSize: 10, letterSpacing: 2, color: quitArm ? C.rustText : C.muted }}>
              {quitArm ? 'TAP AGAIN TO ABANDON' : 'ABANDON MATCH'}
            </Text>
          </Pressable>
          <HelpButton />
        </View>

        <View style={{ alignItems: 'center', marginTop: 2 }}>
          <Text style={{ fontFamily: F.body, fontSize: 10, letterSpacing: 3, color: C.muted3 }}>
            {`SET ${setNumber(game)} OF 4`}
          </Text>
          <View style={{ marginTop: 4 }}>
            <GradientText style={{ fontFamily: F.display, fontSize: 62, lineHeight: 62, letterSpacing: 4, textAlign: 'center' }}>
              {`GAME ${game}`}
            </GradientText>
          </View>
          <Text style={{ fontFamily: F.body, fontSize: 10.5, letterSpacing: 3, color: C.muted, marginTop: 4 }}>OF TWELVE</Text>
        </View>

        {isSwapGame(game) ? (
          <View style={{ alignItems: 'center', marginTop: 12 }}>
            <LinearGradient
              colors={['rgba(212,165,60,0)', 'rgba(212,165,60,0.16)', 'rgba(212,165,60,0)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{
                transform: [{ rotate: '-1.5deg' }],
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderColor: 'rgba(212,165,60,0.55)',
                paddingVertical: 7,
                paddingHorizontal: 30,
              }}
            >
              <Text style={{ fontFamily: F.display, fontSize: 20, lineHeight: 22, letterSpacing: 5, color: C.goldBright }}>
                SIDES SWAP
              </Text>
            </LinearGradient>
          </View>
        ) : null}

        <View
          style={{
            marginHorizontal: 20,
            marginTop: 16,
            borderRadius: 16,
            backgroundColor: C.panel,
            borderWidth: 1,
            borderColor: C.hairline,
            overflow: 'hidden',
          }}
        >
          {(['p1', 'p2'] as const).map((p, i) => {
            const side = sideOfPlayer(p, resolvedStart, game);
            return (
              <View
                key={p}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 13,
                  paddingHorizontal: 14,
                  borderTopWidth: i === 1 ? 1 : 0,
                  borderTopColor: C.hairlineSoft,
                }}
              >
                <SideMono side={side} size={42} />
                <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 14.5, letterSpacing: 0.5, color: C.cream }}>
                    {nameOf(state, p).toUpperCase()}
                  </Text>
                  <Text style={{ fontFamily: F.semi, fontSize: 9.5, letterSpacing: 2, color: sideColor(side) }}>
                    {`PLAYS ${side === 'emp' ? 'EMPEROR' : 'SLAVE'}`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontFamily: F.display, fontSize: 25, lineHeight: 26, color: C.creamWarm }}>
                    {stakesOn ? fmt(bankOf(state, p)) : String(winsOf(state, p))}
                  </Text>
                  <Text style={{ fontFamily: F.body, fontSize: 9, letterSpacing: 1.5, color: C.muted2 }}>
                    {stakesOn ? `${winsOf(state, p)} WINS` : 'GAMES WON'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        <HistoryStrip history={history} currentGame={game} inMatch style={{ marginTop: 14, marginHorizontal: 20 }} />

        {stakesOn ? (
          <View
            style={{
              marginHorizontal: 20,
              marginTop: 16,
              paddingTop: 14,
              paddingHorizontal: 14,
              paddingBottom: 12,
              borderRadius: 16,
              backgroundColor: C.panel,
              borderWidth: 1,
              borderColor: C.hairline,
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Text style={{ fontFamily: F.body, fontSize: 10, letterSpacing: 2, color: C.muted }}>
              THE WAGER · SET BY{' '}
              <Text style={{ fontFamily: F.bold, color: C.rust }}>{nameOf(state, slavePlayer).toUpperCase()}</Text>
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <StakeRound label="−5" onPress={() => adjStake(-5)} />
              <Text
                style={{
                  fontFamily: F.display,
                  fontSize: 48,
                  lineHeight: 50,
                  color: C.goldBright,
                  minWidth: 100,
                  textAlign: 'center',
                }}
              >
                {fmt(stake)}
              </Text>
              <StakeRound label="+5" onPress={() => adjStake(5)} />
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <StakePill label="+25" onPress={() => adjStake(25)} />
              <StakePill label="ALL IN" tone="rust" onPress={allIn} />
            </View>

            <Text style={{ fontFamily: F.body, fontSize: 9, letterSpacing: 1.5, color: C.muted3, textAlign: 'center' }}>
              EMPEROR WIN COLLECTS 1× · SLAVE WIN COLLECTS 5×
            </Text>
          </View>
        ) : null}

        <View style={{ flex: 1, minHeight: 14 }} />

        <BigButton
          label={`DEAL GAME ${game}`}
          onPress={() => {
            deal();
            router.replace('/handoff');
          }}
          style={{ marginTop: 16, marginHorizontal: 20 }}
        />
      </ScrollView>
    </View>
  );
}

function StakeRound({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => [
        {
          width: 54,
          height: 54,
          borderRadius: 27,
          borderWidth: 1,
          borderColor: C.goldBorder,
          backgroundColor: pressed ? 'rgba(212,165,60,0.12)' : 'rgba(0,0,0,0.3)',
          alignItems: 'center',
          justifyContent: 'center',
        },
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      <Text style={{ fontFamily: F.display, fontSize: 20, lineHeight: 22, color: C.creamDim }}>{label}</Text>
    </Pressable>
  );
}

function StakePill({ label, tone = 'gold', onPress }: { label: string; tone?: 'gold' | 'rust'; onPress: () => void }) {
  const gold = tone === 'gold';
  return (
    <Pressable
      onPress={() => {
        tick();
        onPress();
      }}
      style={({ pressed }) => [
        {
          paddingVertical: 9,
          paddingHorizontal: 16,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: gold ? 'rgba(212,165,60,0.35)' : 'rgba(199,90,54,0.55)',
          backgroundColor: pressed ? (gold ? 'rgba(212,165,60,0.12)' : 'rgba(199,90,54,0.14)') : 'transparent',
        },
      ]}
    >
      <Text
        style={{
          fontFamily: gold ? F.semi : F.bold,
          fontSize: 11,
          letterSpacing: 1.5,
          color: gold ? C.goldSoft : C.rust,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
