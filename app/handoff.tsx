import React from 'react';
import { Image, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { C, F, sideColor } from '../src/theme';
import { SEAL } from '../src/assets';
import { BigButton, Chip, PulseRing, useBreathe } from '../src/ui/kit';
import { Glow, Radial } from '../src/ui/Radial';
import { nameOf, otherSide, pickerPlayer, sidePlayerNow, useGame } from '../src/store/useGame';
import { SIDE_WORD, fmt } from '../src/game/logic';
import { tapMedium } from '../src/haptics';

export default function HandoffScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const state = useGame();
  const { picker, game, turn, stakesOn, stake } = state;

  const holder = pickerPlayer(state);
  const waiting = sidePlayerNow(state, otherSide(picker));
  const sealSize = Math.min(width * 0.52, 172);
  const breathe = useBreathe(3600);

  return (
    <View style={{ flex: 1, backgroundColor: C.handoffBg }}>
      <Radial
        cx="50%"
        cy="0%"
        rx="85%"
        ry="52%"
        stops={
          picker === 'emp'
            ? [
                [0, C.gold, 0.15],
                [0.62, C.gold, 0],
                [1, C.gold, 0],
              ]
            : [
                [0, '#c75a36', 0.16],
                [0.62, '#c75a36', 0],
                [1, '#c75a36', 0],
              ]
        }
      />

      <View
        style={{
          flex: 1,
          alignItems: 'center',
          paddingHorizontal: 26,
          paddingTop: insets.top,
          paddingBottom: 22 + insets.bottom,
        }}
      >
        <View style={{ flex: 0.5, minHeight: 20 }} />

        <Text style={{ fontFamily: F.body, fontSize: 11, letterSpacing: 4, color: C.muted3 }}>PASS THE DEVICE TO</Text>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: F.display,
            fontSize: 52,
            lineHeight: 54,
            letterSpacing: 3,
            color: C.creamPale,
            marginTop: 8,
            textAlign: 'center',
            maxWidth: '100%',
          }}
        >
          {nameOf(state, holder).toUpperCase()}
        </Text>

        <View style={{ width: sealSize, height: sealSize, marginTop: 16, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ position: 'absolute', left: -sealSize * 0.08, top: -sealSize * 0.08, width: sealSize * 1.16, height: sealSize * 1.16 }, breathe]}>
            <Glow color={picker === 'emp' ? 'rgba(226,180,80,0.4)' : 'rgba(207,90,54,0.42)'} edge={0.68} />
          </Animated.View>
          <Image
            source={SEAL[picker]}
            resizeMode="contain"
            style={{
              width: '100%',
              height: '100%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 14 },
              shadowOpacity: 0.65,
              shadowRadius: 11,
            }}
          />
        </View>

        <Text style={{ fontFamily: F.bold, fontSize: 11, letterSpacing: 3.5, color: sideColor(picker), marginTop: 10 }}>
          {`${SIDE_WORD[picker]} SIDE`}
        </Text>

        <Chip label={`GAME ${game} OF 12 · TURN ${turn}`} style={{ marginTop: 14 }} />
        {stakesOn ? <Chip tone="rust" label={`STAKE ${fmt(stake)} ON THE TABLE`} style={{ marginTop: 9 }} /> : null}

        <Text style={{ fontFamily: F.italic, fontSize: 12.5, color: C.muted4, marginTop: 18, textAlign: 'center' }}>
          {`${nameOf(state, waiting)}, eyes away.`}
        </Text>

        <View style={{ flex: 1 }} />

        <View style={{ width: '100%' }}>
          <PulseRing radius={14} color={picker === 'emp' ? 'rgba(238,197,94,0.4)' : 'rgba(207,90,54,0.4)'} />
          <BigButton
            label="I'M READY"
            tone={picker === 'emp' ? 'gold' : 'rust'}
            fontSize={26}
            radius={14}
            onPress={() => {
              tapMedium();
              router.replace('/select');
            }}
          />
        </View>
        <Text style={{ fontFamily: F.body, fontSize: 9.5, letterSpacing: 2, color: C.muted6, marginTop: 9 }}>
          YOUR HAND WILL BE REVEALED
        </Text>
      </View>
    </View>
  );
}
