import React, { useEffect } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { C, F } from '../theme';
import { CARD_ART, CARD_BACK } from '../assets';
import { shadow } from './kit';
import { Radial } from './Radial';

export const CARD_RATIO = 4 / 3; // height = width * 4/3  (aspect-ratio: 3/4)

/* ------------------------------------------------------------------ faces */
export function CardFace({
  source,
  width,
  radius = 12,
  style,
}: {
  source: ImageSourcePropType;
  width: number;
  radius?: number;
  style?: ViewStyle;
}) {
  return (
    <View style={[{ width, height: width * CARD_RATIO, borderRadius: radius, overflow: 'hidden', backgroundColor: '#000' }, style]}>
      <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </View>
  );
}

export function CardBack({ width, radius = 12, style }: { width: number; radius?: number; style?: ViewStyle }) {
  return (
    <View style={[{ width, height: width * CARD_RATIO, borderRadius: radius, overflow: 'hidden' }, style]}>
      <Image source={CARD_BACK} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </View>
  );
}

/** The little face-down cards in the opponent's hand row. */
export function MiniBack({ locked }: { locked?: boolean }) {
  return (
    <View
      style={[
        { width: 28, height: 38, borderRadius: 5, overflow: 'hidden' },
        shadow(2, 5, 0.5, 3),
        locked && shadow(0, 12, 0.35, 4),
      ]}
    >
      {locked ? (
        <>
          <Radial
            cx="50%"
            cy="35%"
            stops={[
              [0, '#3a2418'],
              [0.75, '#170b06'],
              [1, '#130906'],
            ]}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: 5, borderWidth: 1, borderColor: 'rgba(199,90,54,0.7)' },
            ]}
          />
        </>
      ) : (
        <>
          <Radial
            cx="50%"
            cy="35%"
            stops={[
              [0, '#153b28'],
              [0.75, '#0a2115'],
              [1, '#08190f'],
            ]}
          />
          <View
            style={[
              StyleSheet.absoluteFill,
              { borderRadius: 5, borderWidth: 1, borderColor: 'rgba(212,165,60,0.45)' },
            ]}
          />
          <View
            style={{
              position: 'absolute',
              left: 5,
              right: 5,
              top: 5,
              bottom: 5,
              borderRadius: 3,
              borderWidth: 1,
              borderColor: 'rgba(212,165,60,0.28)',
            }}
          />
        </>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------- flip */
export function FlipCard({
  faceSource,
  width,
  entered,
  flipped,
  enterFrom,
  dramaMs = 550,
  children,
}: {
  faceSource: ImageSourcePropType;
  width: number;
  entered: boolean;
  flipped: boolean;
  enterFrom: 'top' | 'bottom';
  dramaMs?: number;
  children?: React.ReactNode;
}) {
  const enter = useSharedValue(0);
  const flip = useSharedValue(0);

  useEffect(() => {
    enter.value = withTiming(entered ? 1 : 0, { duration: dramaMs, easing: Easing.bezier(0.2, 0.8, 0.3, 1) });
  }, [entered, enter, dramaMs]);

  useEffect(() => {
    flip.value = withTiming(flipped ? 1 : 0, { duration: 950, easing: Easing.bezier(0.3, 0.75, 0.2, 1) });
  }, [flipped, flip]);

  const offset = enterFrom === 'top' ? -30 : 30;

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: offset * (1 - enter.value) }],
  }));

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 1100 }, { rotateY: `${flip.value * 180}deg` }],
  }));

  // Faces are swapped by opacity at the halfway point — the most reliable way to
  // get a true two-sided flip on both iOS and Android.
  const frontStyle = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 1 : 0 }));
  const backStyle = useAnimatedStyle(() => ({ opacity: flip.value < 0.5 ? 0 : 1 }));

  const h = width * CARD_RATIO;

  return (
    <Animated.View style={[{ width }, wrapStyle]}>
      <Animated.View style={[{ width, height: h }, innerStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, frontStyle, shadow(12, 26, 0.55, 10)]}>
          <CardBack width={width} />
        </Animated.View>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            backStyle,
            shadow(12, 26, 0.55, 10),
            { transform: [{ rotateY: '180deg' }] },
          ]}
        >
          <CardFace source={faceSource} width={width} />
        </Animated.View>
      </Animated.View>
      {children}
    </Animated.View>
  );
}

/* -------------------------------------------------------------------- fan */
const FAN_W = 106;

export function FanCard({
  cardType,
  index,
  count,
  raised,
  onPress,
}: {
  cardType: 'E' | 'C' | 'S';
  index: number;
  count: number;
  raised: boolean;
  onPress: () => void;
}) {
  const mid = (count - 1) / 2;
  const angle = (index - mid) * 7;
  const drop = Math.abs(index - mid) * 10;
  const leftPct = 50 + (index - mid) * 16.5;

  const t = useSharedValue(raised ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(raised ? 1 : 0, { duration: 260, easing: Easing.bezier(0.2, 0.8, 0.3, 1.18) });
  }, [raised, t]);

  // The hand is dealt rather than posted: each card slides up into the fan a
  // beat after the one before it, left to right, the way they leave a hand.
  const dealt = useSharedValue(0);
  useEffect(() => {
    dealt.value = withDelay(index * 55, withTiming(1, { duration: 420, easing: Easing.bezier(0.2, 0.8, 0.3, 1) }));
    // The deal happens once, when the hand arrives on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    const e = dealt.value;
    return {
      opacity: e,
      transform: [
        { translateY: drop + (-64 - drop) * p + 140 * (1 - e) },
        { rotate: `${angle * (1 - p) + 9 * (1 - e)}deg` },
        { scale: (1 + 0.09 * p) * (0.94 + 0.06 * e) },
      ],
    };
  });

  const ringStyle = useAnimatedStyle(() => ({ opacity: t.value }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: `${leftPct}%`,
          marginLeft: -FAN_W / 2,
          bottom: 16,
          width: FAN_W,
          height: FAN_W * CARD_RATIO,
          transformOrigin: '50% 100%',
          zIndex: raised ? 30 : 10 + index,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: raised ? 20 : 8 },
          shadowOpacity: raised ? 0.62 : 0.55,
          shadowRadius: raised ? 17 : 8,
          elevation: raised ? 24 : 6,
        },
        style,
      ]}
    >
      <Pressable onPress={onPress} style={{ width: '100%', height: '100%' }}>
        <CardFace source={CARD_ART[cardType]} width={FAN_W} radius={11} />
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: 11, borderWidth: 2.5, borderColor: 'rgba(238,197,94,0.95)' },
            ringStyle,
          ]}
        />
      </Pressable>
    </Animated.View>
  );
}

/* ---------------------------------------------------------------- discards */
export function DiscardPair({ label }: { label: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <View style={{ width: 58, height: 52 }}>
        <Image source={CARD_ART.C} style={[disc.card, { left: 3, top: 3, transform: [{ rotate: '-9deg' }] }]} />
        <Image source={CARD_ART.C} style={[disc.card, { right: 3, top: 0, transform: [{ rotate: '8deg' }] }]} />
      </View>
      <Text style={{ fontFamily: F.body, fontSize: 8.5, letterSpacing: 1.5, color: C.muted6 }}>{label}</Text>
    </View>
  );
}

const disc = StyleSheet.create({
  card: {
    position: 'absolute',
    width: 34,
    height: 34 * CARD_RATIO,
    borderRadius: 4,
    opacity: 0.6,
    // RN 0.81 supports CSS filters; the opacity above keeps it readable if it is ignored.
    ...({ filter: 'grayscale(1) brightness(0.5)' } as object),
  },
});
