import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, sideColor } from '../src/theme';
import { AmountPad, BigButton, GradientText, HelpButton, HistoryStrip, MoneyChip, SideMono, StatusLine, shadow } from '../src/ui/kit';
import { TableBackground } from '../src/ui/Radial';
import { bankOf, canSetStake, localPlayer, nameOf, sidePlayerNow, stakeRange, useGame, winsOf } from '../src/store/useGame';
import { fmt, isSwapGame, payoutPreview, setNumber, sideOfPlayer, stakeStep } from '../src/game/logic';
import { netDeal, netSetStake } from '../src/net/actions';
import { stopSession } from '../src/net/session';
import { tapLight, tick } from '../src/haptics';

export default function ScoreboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const state = useGame();
  const { game, stakesOn, stake, history, quitArm, resolvedStart, netRole, quitTap } = state;
  const [padOpen, setPadOpen] = useState(false);

  const slavePlayer = sidePlayerNow(state, 'slv');
  const online = netRole !== 'off';
  const emperorPlayerKey = sidePlayerNow(state, 'emp');
  const { min, max } = stakeRange(state);
  const step = stakeStep(bankOf(state, slavePlayer));
  const mine = canSetStake(state);
  const payout = payoutPreview(stake, { p1: state.p1pts, p2: state.p2pts }, emperorPlayerKey);
  const setTo = (v: number) => netSetStake(v);
  // Online, the Slave side names the wager and deals with it; offline the one phone does both.
  const canDeal = !online || localPlayer(state) === slavePlayer;

  const leave = () => {
    tapLight();
    if (online) {
      stopSession('left the table');
      router.replace('/');
      return;
    }
    if (quitTap() === 'quit') router.replace('/');
  };

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
            onPress={leave}
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
              {online ? 'LEAVE THE TABLE' : quitArm ? 'TAP AGAIN TO ABANDON' : 'ABANDON MATCH'}
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
              {`ROUND ${game}`}
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
                    {stakesOn ? `${winsOf(state, p)} WON` : 'ROUNDS WON'}
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
              <StakeRound label={`−${step}`} disabled={!mine || stake <= min} onPress={() => setTo(stake - step)} />
              <Pressable
                disabled={!mine}
                onPress={() => {
                  tick();
                  setPadOpen(true);
                }}
                hitSlop={8}
                style={({ pressed }) => [{ minWidth: 116, opacity: pressed ? 0.75 : 1 }]}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    fontFamily: F.display,
                    fontSize: 48,
                    lineHeight: 50,
                    color: C.goldBright,
                    textAlign: 'center',
                  }}
                >
                  {fmt(stake)}
                </Text>
                {mine ? (
                  <Text
                    style={{
                      fontFamily: F.body,
                      fontSize: 8,
                      letterSpacing: 1.8,
                      color: C.muted6,
                      textAlign: 'center',
                      marginTop: -2,
                    }}
                  >
                    TAP TO COUNT IT OUT
                  </Text>
                ) : null}
              </Pressable>
              <StakeRound label={`+${step}`} disabled={!mine || stake >= max} onPress={() => setTo(stake + step)} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7 }}>
              <MoneyChip label="MIN" disabled={!mine} active={stake === min} onPress={() => setTo(min)} />
              <MoneyChip label="HALF" disabled={!mine} onPress={() => setTo(Math.round(stake / 2))} />
              <MoneyChip label="DOUBLE" disabled={!mine} onPress={() => setTo(stake > 0 ? stake * 2 : step)} />
              <MoneyChip label="¼ PURSE" disabled={!mine} onPress={() => setTo(Math.round(max / 4))} />
              <MoneyChip label="ALL IN" tone="rust" disabled={!mine} active={stake === max && max > 0} onPress={() => setTo(max)} />
            </View>

            <View style={{ flexDirection: 'row', alignSelf: 'stretch', gap: 10 }}>
              <PayoutCell label="EMPEROR WIN" mult="1×" value={payout.emperor} tone="gold" />
              <PayoutCell label="SLAVE WIN" mult="5×" value={payout.slave} tone="rust" />
            </View>

            {!mine ? (
              <StatusLine tone="dim" text={`${nameOf(state, slavePlayer).toUpperCase()} IS NAMING THE WAGER`} />
            ) : null}
          </View>
        ) : null}

        <View style={{ flex: 1, minHeight: 14 }} />

        {canDeal ? (
          <BigButton
            label={`DEAL ROUND ${game}`}
            onPress={() => {
              netDeal();
              if (!online) router.replace('/handoff');
            }}
            style={{ marginTop: 16, marginHorizontal: 20 }}
          />
        ) : (
          <View
            style={{
              marginTop: 16,
              marginHorizontal: 20,
              paddingVertical: 19,
              borderRadius: 13,
              borderWidth: 1,
              borderColor: C.goldBorderFaint,
              backgroundColor: 'rgba(0,0,0,0.25)',
            }}
          >
            <StatusLine text={`WAITING FOR ${nameOf(state, slavePlayer).toUpperCase()} TO DEAL`} />
          </View>
        )}
      </ScrollView>

      <AmountPad
        visible={padOpen}
        title="THE WAGER"
        initial={stake}
        min={min}
        max={max}
        onCancel={() => setPadOpen(false)}
        onCommit={(v) => {
          setTo(v);
          setPadOpen(false);
        }}
      />
    </View>
  );
}

function PayoutCell({
  label,
  mult,
  value,
  tone,
}: {
  label: string;
  mult: string;
  value: number;
  tone: 'gold' | 'rust';
}) {
  const gold = tone === 'gold';
  return (
    <View
      style={{
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: gold ? C.hairline : C.rustBorder,
        backgroundColor: 'rgba(0,0,0,0.22)',
        gap: 1,
      }}
    >
      <Text style={{ fontFamily: F.body, fontSize: 8, letterSpacing: 1.5, color: C.muted3 }}>
        {`${label} · ${mult}`}
      </Text>
      <Text style={{ fontFamily: F.display, fontSize: 22, lineHeight: 24, color: gold ? C.goldText : C.rustText }}>
        {fmt(value)}
      </Text>
    </View>
  );
}

function StakeRound({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      disabled={disabled}
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
          opacity: disabled ? 0.35 : 1,
        },
        pressed && !disabled && { transform: [{ scale: 0.96 }] },
      ]}
    >
      <Text style={{ fontFamily: F.display, fontSize: 18, lineHeight: 20, color: C.creamDim }}>{label}</Text>
    </Pressable>
  );
}
