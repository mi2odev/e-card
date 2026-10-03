/**
 * Motion the design did not draw, in the design's own vocabulary: gold light,
 * felt, cards. Every effect here is decoration over a state the screens already
 * show — none of them carries information of its own, none of them delays a
 * tap, and all of them stand down when the phone asks for reduced motion.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

/**
 * The same "random" every render, so a particle does not jump about when its
 * screen re-renders. Two calls with the same arguments always agree.
 */
export function scatter(i: number, salt = 0): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/* -------------------------------------------------------------- radar */

/**
 * Rings going out from the middle of whatever it sits behind, like a table
 * calling for its other player. Fades to nothing once the call is answered.
 */
export function Radar({
  active,
  size = 220,
  color = 'rgba(212,165,60,0.55)',
  rings = 3,
  periodMs = 2600,
  style,
}: {
  active: boolean;
  size?: number;
  color?: string;
  rings?: number;
  periodMs?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const shown = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    shown.value = withTiming(active ? 1 : 0, { duration: 420, easing: Easing.out(Easing.ease) });
  }, [active, shown]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.value }));
  if (reduced) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style, fade]}
    >
      {Array.from({ length: rings }, (_, i) => (
        <RadarRing key={i} size={size} color={color} delay={(periodMs / rings) * i} periodMs={periodMs} />
      ))}
    </Animated.View>
  );
}

function RadarRing({ size, color, delay, periodMs }: { size: number; color: string; delay: number; periodMs: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: periodMs, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(t);
  }, [t, delay, periodMs]);
  const ring = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - t.value),
    transform: [{ scale: 0.25 + 0.75 * t.value }],
  }));
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor: color },
        ring,
      ]}
    />
  );
}

/* -------------------------------------------------------------- shine */

/**
 * A band of light drawn across its parent every few seconds — the glint off a
 * gold edge. The parent clips it, so it needs `overflow: 'hidden'`.
 */
export function Shine({
  every = 3600,
  delay = 900,
  strength = 0.42,
}: {
  every?: number;
  delay?: number;
  strength?: number;
}) {
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const t = useSharedValue(0);
  const sweepMs = 1000;

  useEffect(() => {
    if (reduced || !width) return;
    t.value = 0;
    t.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: sweepMs, easing: Easing.inOut(Easing.quad) }),
          withDelay(Math.max(0, every - sweepMs), withTiming(0, { duration: 0 })),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(t);
  }, [reduced, width, every, delay, t]);

  const band = Math.max(60, width * 0.32);
  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -band * 1.6 + (width + band * 2.2) * t.value }, { skewX: '-22deg' }],
  }));

  if (reduced) return null;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
    >
      {width ? (
        <Animated.View style={[{ position: 'absolute', top: -10, bottom: -10, left: 0, width: band }, sweep]}>
          <LinearGradient
            colors={['rgba(255,248,225,0)', `rgba(255,248,225,${strength})`, 'rgba(255,248,225,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------- burst */

/**
 * Sparks thrown out from around the middle of its parent, and a ring going out
 * after them — once, the moment `fire` turns true. Drawn over what it sits on,
 * so it starts at `from` px out: the edge of the card, not its face.
 */
export function Burst({
  fire,
  color = '#f2cf6f',
  sparks = 18,
  from = 70,
  reach = 170,
  size = 280,
}: {
  fire: boolean;
  color?: string;
  sparks?: number;
  from?: number;
  reach?: number;
  size?: number;
}) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!fire || reduced) return;
    t.value = 0;
    t.value = withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [fire, reduced, t]);

  const ring = useAnimatedStyle(() => ({
    opacity: t.value === 0 ? 0 : 0.85 * (1 - t.value),
    transform: [{ scale: 0.6 + 0.65 * t.value }],
  }));

  if (reduced) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Animated.View
        style={[
          { position: 'absolute', width: size * 0.8, height: size * 0.8, borderRadius: size, borderWidth: 2, borderColor: color },
          ring,
        ]}
      />
      {Array.from({ length: sparks }, (_, i) => (
        <Spark
          key={i}
          t={t}
          angle={(i / sparks) * Math.PI * 2 + scatter(i, 3) * 0.4}
          from={from * (0.85 + 0.3 * scatter(i, 4))}
          reach={reach * (0.7 + 0.45 * scatter(i, 7))}
          color={color}
          big={i % 3 === 0}
        />
      ))}
    </View>
  );
}

function Spark({
  t,
  angle,
  from,
  reach,
  color,
  big,
}: {
  t: SharedValue<number>;
  angle: number;
  from: number;
  reach: number;
  color: string;
  big: boolean;
}) {
  const cx = Math.cos(angle);
  const cy = Math.sin(angle);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    const r = from + (reach - from) * p;
    return {
      opacity: p === 0 ? 0 : p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88,
      transform: [{ translateX: cx * r }, { translateY: cy * r + 28 * p * p }, { scale: 1.2 - 0.7 * p }, { rotate: `${angle}rad` }],
    };
  });
  return (
    <Animated.View
      style={[
        { position: 'absolute', width: big ? 15 : 10, height: big ? 4 : 3, borderRadius: 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

/* -------------------------------------------------------------- shake */

/** A short sideways jolt each time `key` changes to something truthy. */
export function useShake(key: unknown, distance = 9) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!key || reduced) return;
    const step = (to: number, ms = 55) => withTiming(to, { duration: ms, easing: Easing.inOut(Easing.quad) });
    x.value = withSequence(
      step(distance),
      step(-distance * 0.85),
      step(distance * 0.6),
      step(-distance * 0.4),
      step(distance * 0.2),
      step(0, 80),
    );
  }, [key, reduced, distance, x]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
}

/* -------------------------------------------------------------- flash */

/** The whole screen catching a colour for an instant, the moment `fire` turns true. */
export function Flash({ fire, color, peak = 0.32 }: { fire: boolean; color: string; peak?: number }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (!fire || reduced) return;
    t.value = withSequence(withTiming(peak, { duration: 90 }), withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) }));
  }, [fire, reduced, peak, t]);
  const style = useAnimatedStyle(() => ({ opacity: t.value }));
  if (reduced) return null;
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }, style]} />;
}

/* -------------------------------------------------------------- stamp */

/** Slammed down onto the table: in large and loose, settling hard into place. */
export function Stamp({
  delay = 0,
  onLand,
  style,
  children,
}: {
  delay?: number;
  onLand?: () => void;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const t = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    t.value = withDelay(delay, withTiming(1, { duration: 360, easing: Easing.bezier(0.5, 0, 0.75, 0) }));
    const landed = setTimeout(() => onLand?.(), delay + 340);
    return () => clearTimeout(landed);
    // An entrance: it lands once, when the screen arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 2.5),
    transform: [{ scale: 1.7 - 0.7 * t.value }, { rotate: `${-7 * (1 - t.value)}deg` }],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/* -------------------------------------------------------------- confetti */

const CONFETTI_COLORS = ['#f2cf6f', '#d4a53c', '#eec55e', '#f0e4c0', '#d96a3f', '#93691c'];

/**
 * Gold paper coming down over the winner. Each piece falls on its own clock, so
 * it never arrives as a sheet; it keeps falling, thinly, for as long as the
 * screen is up.
 */
export function Confetti({ count = 26, height = 900, width = 430 }: { count?: number; height?: number; width?: number }) {
  const reduced = useReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: scatter(i, 1) * width,
        delay: scatter(i, 2) * 2600,
        fall: 3600 + scatter(i, 4) * 2600,
        sway: 14 + scatter(i, 5) * 26,
        spin: (scatter(i, 6) > 0.5 ? 1 : -1) * (360 + scatter(i, 8) * 540),
        w: 6 + scatter(i, 9) * 5,
        h: 9 + scatter(i, 10) * 7,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    [count, width],
  );
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
      {pieces.map((p, i) => (
        <Piece key={i} {...p} height={height} />
      ))}
    </View>
  );
}

function Piece({
  x,
  delay,
  fall,
  sway,
  spin,
  w,
  h,
  color,
  height,
}: {
  x: number;
  delay: number;
  fall: number;
  sway: number;
  spin: number;
  w: number;
  h: number;
  color: string;
  height: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: fall, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [t, delay, fall]);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    return {
      opacity: p === 0 ? 0 : p > 0.85 ? (1 - p) / 0.15 : 0.95,
      transform: [
        { translateX: x + Math.sin(p * Math.PI * 4) * sway },
        { translateY: -40 + (height + 80) * p },
        { rotate: `${spin * p}deg` },
        { scaleX: Math.cos(p * Math.PI * 6) },
      ],
    };
  });
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height: h, borderRadius: 1.5, backgroundColor: color }, style]} />;
}

/* -------------------------------------------------------------- dust */

/**
 * Motes of gold drifting up through the light over the table. Slow, few and
 * faint: the room the game is played in, not something to look at.
 */
export function Dust({ count = 14, height = 900, width = 430 }: { count?: number; height?: number; width?: number }) {
  const reduced = useReducedMotion();
  const motes = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: scatter(i, 11) * width,
        delay: scatter(i, 12) * 6000,
        rise: 9000 + scatter(i, 13) * 7000,
        drift: (scatter(i, 14) - 0.5) * 60,
        size: 2 + scatter(i, 15) * 2.6,
        glow: 0.35 + scatter(i, 16) * 0.4,
      })),
    [count, width],
  );
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {motes.map((m, i) => (
        <Mote key={i} {...m} height={height} />
      ))}
    </View>
  );
}

function Mote({
  x,
  delay,
  rise,
  drift,
  size,
  glow,
  height,
}: {
  x: number;
  delay: number;
  rise: number;
  drift: number;
  size: number;
  glow: number;
  height: number;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: rise, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [t, delay, rise]);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    return {
      opacity: p === 0 ? 0 : glow * Math.sin(p * Math.PI),
      transform: [{ translateX: x + drift * p }, { translateY: height * (1 - p) * 0.95 }],
    };
  });
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: '#f6dd8a',
          shadowColor: '#f2cf6f',
          shadowOpacity: 0.9,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    />
  );
}

/* -------------------------------------------------------------- bob */

/** A small, endless rise and fall — something waiting on somebody else's move. */
export function Bob({
  active,
  delay = 0,
  lift = 4,
  periodMs = 1300,
  children,
}: {
  active: boolean;
  delay?: number;
  lift?: number;
  periodMs?: number;
  children: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (active && !reduced) {
      t.value = withDelay(
        delay,
        withRepeat(withTiming(1, { duration: periodMs / 2, easing: Easing.inOut(Easing.sin) }), -1, true),
      );
    } else {
      cancelAnimation(t);
      t.value = withTiming(0, { duration: 200 });
    }
  }, [active, reduced, delay, periodMs, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -lift * t.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
