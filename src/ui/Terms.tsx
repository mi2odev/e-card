/**
 * The terms of a match — who opens as Emperor, whether money is on the table,
 * and how much of it. Shared by the pass & play setup screen and the online
 * lobby, where only the host may touch them.
 */

import React, { useState } from 'react';
import { Pressable, Text, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { C, F } from '../theme';
import { AmountPad, MoneyChip, shadow } from './kit';
import { useGame } from '../store/useGame';
import { BANKROLL_PRESETS, MAX_BANKROLL, MIN_BANKROLL, MIN_STAKE_PRESETS, fmt } from '../game/logic';
import { tick } from '../haptics';

/* ------------------------------------------------------------ side choice */

export function SidePanel({
  heading,
  editable = true,
  style,
}: {
  heading: React.ReactNode;
  editable?: boolean;
  style?: ViewStyle;
}) {
  const sideChoice = useGame((s) => s.sideChoice);
  const setSideChoice = useGame((s) => s.setSideChoice);

  return (
    <View style={style}>
      <Text style={{ fontFamily: F.semi, fontSize: 10, letterSpacing: 2, color: C.muted2, marginBottom: 8 }}>
        {heading}
      </Text>

      <View style={{ flexDirection: 'row', gap: 9, opacity: editable ? 1 : 0.75 }}>
        <SideOption
          title="EMPEROR"
          titleColor={C.goldText}
          caption="GOLD SIDE"
          active={sideChoice === 'emperor'}
          editable={editable}
          activeStyle={{ borderColor: 'rgba(212,165,60,0.9)', backgroundColor: 'rgba(212,165,60,0.1)' }}
          onPress={() => setSideChoice('emperor')}
        />
        <SideOption
          title="RANDOM"
          titleColor={C.creamDim}
          caption="FATE DEALS"
          active={sideChoice === 'random'}
          editable={editable}
          activeStyle={{ borderColor: 'rgba(236,225,198,0.75)', backgroundColor: 'rgba(236,225,198,0.07)' }}
          onPress={() => setSideChoice('random')}
        />
        <SideOption
          title="SLAVE"
          titleColor={C.rust}
          caption="RUST SIDE"
          active={sideChoice === 'slave'}
          editable={editable}
          activeStyle={{ borderColor: 'rgba(199,90,54,0.9)', backgroundColor: 'rgba(199,90,54,0.1)' }}
          onPress={() => setSideChoice('slave')}
        />
      </View>

      <Text style={{ fontFamily: F.body, fontSize: 9.5, letterSpacing: 1.5, color: C.muted7, marginTop: 9 }}>
        SIDES SWAP EVERY 3 GAMES — BOTH WILL HOLD EACH SIDE TWICE
      </Text>
    </View>
  );
}

function SideOption({
  title,
  titleColor,
  caption,
  active,
  editable,
  activeStyle,
  onPress,
}: {
  title: string;
  titleColor: string;
  caption: string;
  active: boolean;
  editable: boolean;
  activeStyle: { borderColor: string; backgroundColor: string };
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={!editable}
      onPress={() => {
        tick();
        onPress();
      }}
      style={[
        {
          flex: 1,
          minHeight: 76,
          borderRadius: 12,
          backgroundColor: 'rgba(0,0,0,0.3)',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          borderWidth: 1.5,
          borderColor: 'rgba(212,165,60,0.2)',
        },
        active && activeStyle,
        active && shadow(0, 18, 0.16, 4),
      ]}
    >
      <Text style={{ fontFamily: F.display, fontSize: 21, lineHeight: 23, letterSpacing: 2, color: titleColor }}>{title}</Text>
      <Text style={{ fontFamily: F.body, fontSize: 8.5, letterSpacing: 1.5, color: C.muted3 }}>{caption}</Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------- the money */

export function StakesPanel({ editable = true, style }: { editable?: boolean; style?: ViewStyle }) {
  const stakesOn = useGame((s) => s.stakesOn);
  const toggleStakes = useGame((s) => s.toggleStakes);
  const settings = useGame((s) => s.settings);
  const setStartingBankroll = useGame((s) => s.setStartingBankroll);
  const setMinStake = useGame((s) => s.setMinStake);
  const [padOpen, setPadOpen] = useState(false);

  const bankStart = settings.startingBankroll;
  const minStakeCap = Math.floor(bankStart / 2);
  const isPreset = BANKROLL_PRESETS.includes(bankStart as (typeof BANKROLL_PRESETS)[number]);

  return (
    <View
      style={[
        {
          paddingVertical: 15,
          paddingHorizontal: 16,
          borderRadius: 12,
          backgroundColor: 'rgba(0,0,0,0.3)',
          borderWidth: 1,
          borderColor: C.hairline,
          gap: 12,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, letterSpacing: 1, color: C.cream }}>
            STAKES <Text style={{ color: C.goldSoft }}>{stakesOn ? 'ON' : 'OFF'}</Text>
          </Text>
          <Text style={{ fontFamily: F.body, fontSize: 9.5, letterSpacing: 0.8, color: C.muted3, lineHeight: 14 }}>
            {stakesOn ? 'EACH GAME THE SLAVE SIDE SETS THE WAGER' : 'PLAY FOR THE COUNT OF GAMES WON ALONE'}
          </Text>
        </View>
        <StakesToggle
          on={stakesOn}
          editable={editable}
          onPress={() => {
            tick();
            toggleStakes();
          }}
        />
      </View>

      {stakesOn ? (
        <>
          <View style={{ height: 1, backgroundColor: C.hairlineSoft }} />

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: F.semi, fontSize: 10, letterSpacing: 2, color: C.muted2 }}>
                EACH PLAYER BRINGS
              </Text>
              <Text style={{ fontFamily: F.display, fontSize: 26, lineHeight: 27, color: C.goldBright }}>
                {fmt(bankStart)}
              </Text>
            </View>

            {editable ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {BANKROLL_PRESETS.map((v) => (
                  <MoneyChip key={v} label={fmt(v)} active={bankStart === v} onPress={() => setStartingBankroll(v)} />
                ))}
                <MoneyChip label="OTHER…" active={!isPreset} onPress={() => setPadOpen(true)} />
              </View>
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: F.semi, fontSize: 10, letterSpacing: 2, color: C.muted2 }}>TABLE MINIMUM</Text>
              {editable ? null : (
                <Text style={{ fontFamily: F.display, fontSize: 20, lineHeight: 21, color: C.rustText }}>
                  {settings.minStake > 0 ? fmt(settings.minStake) : 'NONE'}
                </Text>
              )}
            </View>

            {editable ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {MIN_STAKE_PRESETS.map((v) => (
                  <MoneyChip
                    key={v}
                    label={v === 0 ? 'NONE' : fmt(v)}
                    tone="rust"
                    active={settings.minStake === v}
                    disabled={v > minStakeCap}
                    onPress={() => setMinStake(v)}
                  />
                ))}
              </View>
            ) : null}

            <Text style={{ fontFamily: F.body, fontSize: 9, letterSpacing: 1.2, color: C.muted7, lineHeight: 13 }}>
              {settings.minStake > 0
                ? `NO ONE MAY WAGER UNDER ${fmt(settings.minStake)} — A BROKE PLAYER PUSHES WHAT IS LEFT`
                : 'THE SLAVE SIDE MAY WAGER AS LITTLE AS NOTHING'}
            </Text>
          </View>
        </>
      ) : null}

      <AmountPad
        visible={padOpen}
        title="EACH PLAYER BRINGS"
        initial={bankStart}
        min={MIN_BANKROLL}
        max={MAX_BANKROLL}
        confirmLabel="SET THE PURSE"
        onCancel={() => setPadOpen(false)}
        onCommit={(v) => {
          setStartingBankroll(v);
          setPadOpen(false);
        }}
      />
    </View>
  );
}

function StakesToggle({ on, editable, onPress }: { on: boolean; editable: boolean; onPress: () => void }) {
  const t = useSharedValue(on ? 1 : 0);
  React.useEffect(() => {
    t.value = withTiming(on ? 1 : 0, { duration: 250, easing: Easing.out(Easing.ease) });
  }, [on, t]);
  const track = useAnimatedStyle(() => ({
    backgroundColor: t.value > 0.5 ? 'rgba(212,165,60,0.85)' : 'rgba(255,255,255,0.13)',
  }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: 22 * t.value }] }));
  return (
    <Pressable onPress={onPress} disabled={!editable} hitSlop={8} style={{ opacity: editable ? 1 : 0.6 }}>
      <Animated.View style={[{ width: 52, height: 30, borderRadius: 999 }, track]}>
        <Animated.View
          style={[
            { position: 'absolute', top: 3, left: 3, width: 24, height: 24, borderRadius: 12, backgroundColor: C.creamPale },
            shadow(2, 6, 0.5, 3),
            knob,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
