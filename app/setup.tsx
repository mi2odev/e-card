import React, { useEffect } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { C, F } from '../src/theme';
import { BigButton, HelpButton, NameField, shadow } from '../src/ui/kit';
import { TableBackground } from '../src/ui/Radial';
import { nameOf, useGame } from '../src/store/useGame';
import { fmt } from '../src/game/logic';
import { tapLight, tick } from '../src/haptics';

type Choice = 'emperor' | 'random' | 'slave';

export default function SetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const state = useGame();
  const { p1, p2, setP1, setP2, sideChoice, setSideChoice, stakesOn, toggleStakes, beginMatch, settings } = state;
  const bankStart = Math.max(10, Math.round(settings.startingBankroll));

  return (
    <View style={{ flex: 1, backgroundColor: C.tableEdge }}>
      <TableBackground />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 22,
            paddingTop: insets.top,
            paddingBottom: 20 + insets.bottom,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 }}>
            <Pressable
              onPress={() => {
                tapLight();
                router.back();
              }}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  height: 44,
                  paddingLeft: 12,
                  paddingRight: 17,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: C.goldBorder,
                  backgroundColor: pressed ? 'rgba(212,165,60,0.14)' : 'rgba(0,0,0,0.28)',
                },
                shadow(3, 10, 0.4, 3),
                pressed && { transform: [{ translateY: 1 }] },
              ]}
            >
              <Text style={{ fontFamily: F.display, fontSize: 21, lineHeight: 22, color: C.goldSoft }}>‹</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 10.5, letterSpacing: 2.5, color: C.goldSoft }}>BACK</Text>
            </Pressable>
            <HelpButton />
          </View>

          <Text style={{ fontFamily: F.display, fontSize: 36, lineHeight: 40, letterSpacing: 3, color: C.creamWarm, marginTop: 4 }}>
            THE TABLE IS SET
          </Text>
          <Text style={{ fontFamily: F.body, fontSize: 10, letterSpacing: 2.5, color: C.muted3, marginTop: 2 }}>
            CONFIRM THE TERMS OF THE MATCH
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <NameField compact label="PLAYER 1" value={p1} onChangeText={setP1} placeholder="Player 1" style={{ flex: 1 }} />
            <NameField compact label="PLAYER 2" value={p2} onChangeText={setP2} placeholder="Player 2" style={{ flex: 1 }} />
          </View>

          <Text style={{ fontFamily: F.semi, fontSize: 10, letterSpacing: 2, color: C.muted2, marginTop: 24, marginBottom: 8 }}>
            FIRST DEAL — <Text style={{ color: C.goldText }}>{nameOf(state, 'p1').toUpperCase()}</Text> PLAYS AS
          </Text>

          <View style={{ flexDirection: 'row', gap: 9 }}>
            <SideOption
              title="EMPEROR"
              titleColor={C.goldText}
              caption="GOLD SIDE"
              active={sideChoice === 'emperor'}
              activeStyle={{ borderColor: 'rgba(212,165,60,0.9)', backgroundColor: 'rgba(212,165,60,0.1)' }}
              onPress={() => setSideChoice('emperor')}
            />
            <SideOption
              title="RANDOM"
              titleColor={C.creamDim}
              caption="FATE DEALS"
              active={sideChoice === 'random'}
              activeStyle={{ borderColor: 'rgba(236,225,198,0.75)', backgroundColor: 'rgba(236,225,198,0.07)' }}
              onPress={() => setSideChoice('random')}
            />
            <SideOption
              title="SLAVE"
              titleColor={C.rust}
              caption="RUST SIDE"
              active={sideChoice === 'slave'}
              activeStyle={{ borderColor: 'rgba(199,90,54,0.9)', backgroundColor: 'rgba(199,90,54,0.1)' }}
              onPress={() => setSideChoice('slave')}
            />
          </View>

          <Text style={{ fontFamily: F.body, fontSize: 9.5, letterSpacing: 1.5, color: C.muted7, marginTop: 9 }}>
            SIDES SWAP EVERY 3 GAMES — BOTH WILL HOLD EACH SIDE TWICE
          </Text>

          <View
            style={{
              marginTop: 22,
              paddingVertical: 15,
              paddingHorizontal: 16,
              borderRadius: 12,
              backgroundColor: 'rgba(0,0,0,0.3)',
              borderWidth: 1,
              borderColor: C.hairline,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 13, letterSpacing: 1, color: C.cream }}>
                STAKES <Text style={{ color: C.goldSoft }}>{stakesOn ? 'ON' : 'OFF'}</Text>
              </Text>
              <Text style={{ fontFamily: F.body, fontSize: 9.5, letterSpacing: 0.8, color: C.muted3, lineHeight: 14 }}>
                {`EACH GAME THE SLAVE SIDE SETS THE WAGER · BOTH START WITH ${fmt(bankStart)} PTS`}
              </Text>
            </View>
            <StakesToggle
              on={stakesOn}
              onPress={() => {
                tick();
                toggleStakes();
              }}
            />
          </View>

          <View style={{ flex: 1, minHeight: 16 }} />

          <BigButton
            label="BEGIN THE MATCH"
            onPress={() => {
              beginMatch();
              router.replace('/scoreboard');
            }}
            style={{ marginTop: 16 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function SideOption({
  title,
  titleColor,
  caption,
  active,
  activeStyle,
  onPress,
}: {
  title: string;
  titleColor: string;
  caption: string;
  active: boolean;
  activeStyle: { borderColor: string; backgroundColor: string };
  onPress: () => void;
}) {
  return (
    <Pressable
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

function StakesToggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  const t = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(on ? 1 : 0, { duration: 250, easing: Easing.out(Easing.ease) });
  }, [on, t]);
  const track = useAnimatedStyle(() => ({
    backgroundColor: t.value > 0.5 ? 'rgba(212,165,60,0.85)' : 'rgba(255,255,255,0.13)',
  }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: 22 * t.value }] }));
  return (
    <Pressable onPress={onPress} hitSlop={8}>
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
