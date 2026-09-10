import React, { useState } from 'react';
import {
  Image,
  Keyboard,
  type KeyboardTypeOptions,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  type ReturnKeyTypeOptions,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { C, F, GOLD_TEXT_GRADIENT, GOLD_TEXT_LOCATIONS } from '../theme';
import type { Notice } from '../net/notice';
import { CARD_ART } from '../assets';
import { Radial } from './Radial';
import { tapLight } from '../haptics';

/* ------------------------------------------------------------------ shadows */
type ShadowStyle = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

// Deliberately not typed as ViewStyle: the same shadow is applied to <Image>,
// and ViewStyle and ImageStyle disagree about `overflow`.
export const shadow = (y: number, blur: number, opacity: number, elevation?: number): ShadowStyle => ({
  shadowColor: '#000',
  shadowOffset: { width: 0, height: y },
  shadowOpacity: opacity,
  shadowRadius: blur / 2,
  elevation: elevation ?? Math.round(y + 2),
});

const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

/* ------------------------------------------------------------- gradient text */
// background-clip:text has no RN equivalent; masked-view + a linear gradient is
// the closest match. If masked-view is unavailable we fall back to solid gold.
let MaskedView: any = null;
try {
  MaskedView = require('@react-native-masked-view/masked-view').default;
} catch {
  MaskedView = null;
}

export function GradientText({
  children,
  style,
  colors = GOLD_TEXT_GRADIENT,
  locations = GOLD_TEXT_LOCATIONS,
}: {
  children: string;
  style?: TextStyle | TextStyle[];
  colors?: readonly [string, string, ...string[]];
  locations?: readonly [number, number, ...number[]];
}) {
  if (!MaskedView) return <Text style={[style, { color: C.gold }]}>{children}</Text>;
  return (
    <MaskedView
      maskElement={
        <View style={{ backgroundColor: 'transparent' }}>
          <Text style={[style, { color: '#000' }]}>{children}</Text>
        </View>
      }
    >
      <LinearGradient colors={colors} locations={locations} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}>
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

/* -------------------------------------------------------------------- buttons */
export function BigButton({
  label,
  onPress,
  tone = 'gold',
  fontSize = 25,
  letterSpacing = 3.5,
  radius = 13,
  padV = 19,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: 'gold' | 'rust';
  fontSize?: number;
  letterSpacing?: number;
  radius?: number;
  padV?: number;
  style?: ViewStyle;
}) {
  const gold = tone === 'gold';
  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      style={({ pressed }) => [
        { borderRadius: radius, overflow: 'hidden' },
        shadow(10, 26, 0.55, 10),
        pressed && { transform: [{ translateY: 1 }] },
        style,
      ]}
    >
      {({ pressed }) => (
        <LinearGradient
          colors={gold ? [C.goldBtnTop, C.goldBtnBottom] : [C.rustBtnTop, C.rustBtnBottom]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ paddingVertical: padV, alignItems: 'center', justifyContent: 'center' }}
        >
          {/* inset 0 1px 0 rgba(255,240,200,.55) top highlight */}
          <View style={[StyleSheet.absoluteFill, { borderTopWidth: 1, borderTopColor: 'rgba(255,240,200,0.55)' }]} />
          {pressed ? <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.06)' }]} /> : null}
          <Text
            style={{
              fontFamily: F.display,
              fontSize,
              letterSpacing,
              lineHeight: fontSize * 1.05,
              color: gold ? C.inkOnGold : C.creamOnRustBtn,
              textAlign: 'center',
            }}
          >
            {label}
          </Text>
        </LinearGradient>
      )}
    </Pressable>
  );
}

export function OutlineButton({
  label,
  onPress,
  fontSize = 20,
  letterSpacing = 3,
  padV = 16,
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  fontSize?: number;
  letterSpacing?: number;
  padV?: number;
  style?: ViewStyle;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        tapLight();
        onPress();
      }}
      style={({ pressed }) => [
        {
          borderRadius: 13,
          borderWidth: 1,
          borderColor: C.goldBorder,
          backgroundColor: pressed ? 'rgba(212,165,60,0.15)' : 'rgba(212,165,60,0.06)',
          paddingVertical: padV,
          alignItems: 'center',
        },
        pressed && { transform: [{ translateY: 1 }] },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: F.display,
          fontSize,
          letterSpacing,
          lineHeight: fontSize * 1.05,
          color: C.creamDim,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------ pulsing ring */
/** CSS ecPulse animated a box-shadow ring; RN scales + fades a real ring view. */
export function PulseRing({ radius = 14, color = 'rgba(238,197,94,0.4)' }: { radius?: number; color?: string }) {
  const t = useSharedValue(0);
  React.useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.ease) }), -1, false);
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - t.value,
    transform: [{ scale: 1 + 0.06 * t.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: radius, borderWidth: 5, borderColor: color, margin: -2 },
        style,
      ]}
    />
  );
}

/** ecBreathe: scale 1 -> 1.14 -> 1, ease-in-out, looping. */
export function useBreathe(durationMs: number, to = 1.14) {
  const t = useSharedValue(0);
  React.useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, [t, durationMs]);
  return useAnimatedStyle(() => ({ transform: [{ scale: 1 + (to - 1) * t.value }] }));
}

/* ---------------------------------------------------------------- keyboard */

/**
 * How much of the screen the keyboard is covering, and whether it is up at all.
 *
 * Android with edge-to-edge does not always shrink the window for the keyboard,
 * so a screen cannot assume its own layout has made room. Asking outright is the
 * only answer that holds on both platforms.
 */
export function useKeyboard(): { open: boolean; height: number } {
  const [height, setHeight] = React.useState(0);

  React.useEffect(() => {
    // iOS reports before the keyboard moves, which lets the layout travel with
    // it; Android only reports once it has arrived.
    const shown = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hidden = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const up = Keyboard.addListener(shown, (e) => setHeight(e.endCoordinates?.height ?? 0));
    const down = Keyboard.addListener(hidden, () => setHeight(0));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);

  return { open: height > 0, height };
}

/**
 * Keeps the field being typed into in front of the player.
 *
 * Each field says where it sits with `track`, and says when it is focused with
 * `focus`; the form scrolls it to just under the top of the screen, which is
 * above the keyboard whatever the keyboard did to the window.
 */
export function useFieldScroller() {
  const ref = React.useRef<ScrollView>(null);
  const spots = React.useRef<Record<string, number>>({});
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const track = (id: string) => (e: LayoutChangeEvent) => {
    spots.current[id] = e.nativeEvent.layout.y;
  };

  const focus = (id: string) => () => {
    const y = spots.current[id];
    if (y == null) return;
    // Let the keyboard finish arriving, or the scroll is measured against a
    // layout that is about to change under it.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => ref.current?.scrollTo({ y: Math.max(0, y - 64), animated: true }), 140);
  };

  return { ref, track, focus };
}

/**
 * Lifts its children in the first time they are drawn.
 *
 * For things that arrive rather than change: a panel that opens, a card that
 * lands on the table, the offer of a seat you left. Toggling something already
 * on screen is `Fade`'s job — this one only ever plays forwards, once.
 */
export function Appear({
  delay = 0,
  duration = 320,
  from = 8,
  scaleFrom,
  style,
  onLayout,
  children,
}: {
  delay?: number;
  duration?: number;
  /** How far below its place it starts, in px. */
  from?: number;
  scaleFrom?: number;
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const t = useSharedValue(0);
  React.useEffect(() => {
    t.value = withDelay(delay, withTiming(1, { duration, easing: Easing.out(Easing.ease) }));
    // Mount only: this is an entrance, not a state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const anim = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: [
      { translateY: from * (1 - t.value) },
      ...(scaleFrom ? [{ scale: scaleFrom + (1 - scaleFrom) * t.value }] : []),
    ],
  }));
  return (
    <Animated.View style={[style, anim]} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

/**
 * A slow breath for something that is waiting on somebody else — the table code
 * with nobody at it yet. Settles back to rest the moment the wait is over.
 */
export function useWaitingPulse(active: boolean, to = 1.03, durationMs = 3200) {
  const t = useSharedValue(0);
  React.useEffect(() => {
    if (active) {
      t.value = withRepeat(withTiming(1, { duration: durationMs, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      cancelAnimation(t);
      t.value = withTiming(0, { duration: 320, easing: Easing.out(Easing.ease) });
    }
  }, [active, durationMs, t]);
  return useAnimatedStyle(() => ({ transform: [{ scale: 1 + (to - 1) * t.value }] }));
}

/**
 * Counts a number up (or down) to where it now stands.
 *
 * Used for the purses, which is where the whole game actually happens: arriving
 * at the scoreboard, the money is seen to move rather than simply be different.
 * Pass `startAt` to animate from a value the screen never rendered — the purse
 * as it was before the round that just resolved.
 */
export function useCountUp(value: number, startAt?: number, durationMs = 900) {
  const [shown, setShown] = React.useState(startAt ?? value);
  const at = React.useRef(shown);

  React.useEffect(() => {
    const from = at.current;
    if (from === value) return;
    const began = Date.now();
    let frame = requestAnimationFrame(function step() {
      const p = Math.min(1, (Date.now() - began) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      const next = Math.round(from + (value - from) * eased);
      at.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return shown;
}

/** CSS `transition: opacity` stand-in for the reveal sequence. */
export function Fade({
  visible,
  duration = 500,
  scaleFrom,
  style,
  pointerEventsWhenHidden = 'none',
  children,
}: {
  visible: boolean;
  duration?: number;
  scaleFrom?: number;
  style?: StyleProp<ViewStyle>;
  pointerEventsWhenHidden?: 'none' | 'auto';
  children: React.ReactNode;
}) {
  const t = useSharedValue(visible ? 1 : 0);
  React.useEffect(() => {
    t.value = withTiming(visible ? 1 : 0, { duration, easing: Easing.out(Easing.ease) });
  }, [visible, duration, t]);
  const anim = useAnimatedStyle(() => ({
    opacity: t.value,
    transform: scaleFrom ? [{ scale: scaleFrom + (1 - scaleFrom) * t.value }] : [],
  }));
  return (
    <Animated.View pointerEvents={visible ? 'auto' : pointerEventsWhenHidden} style={[style, anim]}>
      {children}
    </Animated.View>
  );
}

/* --------------------------------------------------------------------- chips */
export function Chip({ label, tone = 'gold', style }: { label: string; tone?: 'gold' | 'rust'; style?: ViewStyle }) {
  const gold = tone === 'gold';
  return (
    <View
      style={[
        {
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 999,
          backgroundColor: 'rgba(0,0,0,0.35)',
          borderWidth: 1,
          borderColor: gold ? C.goldBorderFaint : C.rustBorder,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: F.semi,
          fontSize: 10,
          letterSpacing: 2,
          color: gold ? C.creamChip : C.rustChip,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/* --------------------------------------------------------- side monogram (E/S) */
export function SideMono({ side, size }: { side: 'emp' | 'slv'; size: number }) {
  const gold = side === 'emp';
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: gold ? 'rgba(212,165,60,0.75)' : 'rgba(199,90,54,0.75)',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: 'rgba(0,0,0,0.2)',
        },
        shadow(0, 22, gold ? 0.22 : 0.25, 4),
      ]}
    >
      <Radial
        cx="50%"
        cy="30%"
        rx="70%"
        ry="70%"
        stops={
          gold
            ? [
                [0, C.gold, 0.24],
                [1, C.gold, 0.04],
              ]
            : [
                [0, '#c75a36', 0.24],
                [1, '#c75a36', 0.05],
              ]
        }
      />
      <Text
        style={{
          fontFamily: F.display,
          fontSize: Math.round(size * 0.5),
          lineHeight: Math.round(size * 0.56),
          paddingTop: 2,
          color: gold ? C.goldBright : C.rustText,
        }}
      >
        {gold ? 'E' : 'S'}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------- history strip */
export function HistoryStrip({
  history,
  currentGame,
  inMatch,
  style,
}: {
  history: Array<{ g: number; winner: 'p1' | 'p2' | null; winSide: 'emp' | 'slv' | null }>;
  currentGame: number;
  inMatch: boolean;
  style?: ViewStyle;
}) {
  const byGame = new Map(history.map((h) => [h.g, h]));
  return (
    <View style={[{ flexDirection: 'row', gap: 5, justifyContent: 'center' }, style]}>
      {Array.from({ length: 12 }, (_, i) => i + 1).map((g) => {
        const h = byGame.get(g);
        // A round that ran out of cards without a decision: played, won by nobody.
        if (h && h.winner === null) {
          return (
            <View
              key={g}
              style={[pip.base, { borderWidth: 1, borderColor: 'rgba(212,165,60,0.3)', backgroundColor: 'rgba(255,255,255,0.06)' }]}
            >
              <Text style={[pip.txt, { color: C.muted6 }]}>–</Text>
            </View>
          );
        }
        if (h) {
          const gold = h.winSide === 'emp';
          return (
            <LinearGradient
              key={g}
              colors={gold ? ['#e9c25c', '#bb8d2e'] : [C.rustPipTop, C.rustPipBottom]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={pip.base}
            >
              <Text style={[pip.txt, { color: gold ? C.inkOnPip : C.creamOnRust }]}>{h.winner === 'p1' ? '1' : '2'}</Text>
            </LinearGradient>
          );
        }
        const isNow = g === currentGame && inMatch;
        return (
          <View
            key={g}
            style={[
              pip.base,
              isNow
                ? { borderWidth: 1, borderColor: 'rgba(212,165,60,0.8)', backgroundColor: 'rgba(212,165,60,0.12)' }
                : { borderWidth: 1, borderColor: 'rgba(212,165,60,0.25)', borderStyle: 'dashed' },
            ]}
          />
        );
      })}
    </View>
  );
}

const pip = StyleSheet.create({
  base: { width: 18, height: 18, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  txt: { fontFamily: F.bold, fontSize: 9 },
});

/* -------------------------------------------------------------- name fields */
export function NameField({
  label,
  value,
  onChangeText,
  placeholder,
  compact,
  style,
  inputRef,
  onFocus,
  returnKeyType = 'done',
  onSubmit,
  maxLength = 14,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  compact?: boolean;
  style?: ViewStyle;
  /** So one field can hand the keyboard to the next. */
  inputRef?: React.RefObject<TextInput | null>;
  onFocus?: () => void;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmit?: () => void;
  /** Names are short; an address is not. */
  maxLength?: number;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const [focus, setFocus] = useState(false);
  const lit = useSharedValue(0);
  React.useEffect(() => {
    lit.value = withTiming(focus ? 1 : 0, { duration: 180, easing: Easing.out(Easing.ease) });
  }, [focus, lit]);
  const border = useAnimatedStyle(() => ({
    borderColor: interpolateColor(lit.value, [0, 1], [C.goldBorderDim, C.gold]),
  }));
  return (
    <View style={style}>
      <Text
        style={{
          fontFamily: F.semi,
          fontSize: 9.5,
          letterSpacing: compact ? 2 : 2.5,
          color: C.muted2,
          marginBottom: 6,
          marginLeft: 2,
        }}
      >
        {label}
      </Text>
      <Animated.View
        style={[
          { backgroundColor: C.field, borderWidth: 1, borderRadius: compact ? 10 : 11 },
          border,
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          maxLength={maxLength}
          placeholder={placeholder}
          placeholderTextColor={C.placeholder}
          selectionColor={C.gold}
          autoCorrect={false}
          autoCapitalize={autoCapitalize}
          keyboardType={keyboardType}
          returnKeyType={returnKeyType}
          submitBehavior={returnKeyType === 'next' ? 'submit' : 'blurAndSubmit'}
          onSubmitEditing={onSubmit}
          onFocus={() => {
            setFocus(true);
            onFocus?.();
          }}
          onBlur={() => setFocus(false)}
          style={{
            padding: compact ? 12 : 14,
            color: C.cream,
            fontFamily: F.medium,
            fontSize: 16,
            letterSpacing: compact ? 0 : 0.5,
          }}
        />
      </Animated.View>
    </View>
  );
}

/* ----------------------------------------------------------------- ? + rules */
export function HelpButton({ style }: { style?: ViewStyle }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => {
          tapLight();
          setOpen(true);
        }}
        hitSlop={6}
        style={({ pressed }) => [
          {
            width: 44,
            height: 44,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: C.goldBorder,
            backgroundColor: pressed ? 'rgba(212,165,60,0.14)' : 'rgba(0,0,0,0.25)',
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <Text style={{ fontFamily: SERIF, fontWeight: '600', fontSize: 19, color: C.goldSoft }}>?</Text>
      </Pressable>
      <RulesModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const RULES = [
  'The Emperor side holds 1 Emperor + 4 Citizens. The Slave side holds 1 Slave + 4 Citizens. Fresh hands every round.',
  'One side lays its card face down first and the other answers, then both are flipped. The Emperor side opens round 1; who goes first alternates on every play and again at each new round.',
  'Citizen vs Citizen is a draw — both cards are discarded and the round continues.',
  'A round runs until a card decides it — up to five plays, which is every card in hand.',
  'Sit on Citizens and the last two cards are the Emperor and the Slave, which the Slave takes at 5×. The Emperor side has to strike before the cards run out; the Slave side has to guess when.',
  'A match is 12 rounds in 4 sets of 3. Sides swap between sets, so each player holds each side for 6 rounds.',
  'Stakes: an Emperor-side win collects 1× the wager — a Slave-side win collects 5×. The loser pays, down to their last point.',
];

export function RulesModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(3,5,4,0.87)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <View
            style={[
              {
                width: '100%',
                maxHeight: '100%',
                backgroundColor: '#0c130e',
                borderWidth: 1,
                borderColor: C.goldBorder,
                borderRadius: 16,
                paddingHorizontal: 18,
                paddingTop: 18,
                paddingBottom: 20,
              },
              shadow(24, 60, 0.7, 18),
            ]}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: F.display, fontSize: 27, letterSpacing: 3, color: C.goldBright }}>
                  THE RULES
                </Text>
                <Pressable
                  onPress={onClose}
                  hitSlop={8}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    borderWidth: 1,
                    borderColor: C.goldBorder,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontFamily: F.body, fontSize: 16, color: C.goldSoft }}>✕</Text>
                </Pressable>
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <Image source={CARD_ART.E} style={rules.mini} />
                <Text style={rules.arrow}>▸</Text>
                <Image source={CARD_ART.C} style={rules.mini} />
                <Text style={rules.arrow}>▸</Text>
                <Image source={CARD_ART.S} style={rules.mini} />
              </View>
              <Text
                style={{
                  textAlign: 'center',
                  marginTop: 8,
                  fontFamily: F.body,
                  fontSize: 9,
                  letterSpacing: 2,
                  color: C.muted3,
                }}
              >
                EACH BEATS THE NEXT
              </Text>
              <Text
                style={{
                  textAlign: 'center',
                  marginTop: 3,
                  fontFamily: F.bold,
                  fontSize: 9.5,
                  letterSpacing: 1.5,
                  color: C.rust,
                }}
              >
                …AND THE SLAVE FELLS THE EMPEROR — THE 5× UPSET
              </Text>

              <View style={{ gap: 9, marginTop: 14 }}>
                {RULES.map((line) => (
                  <View key={line} style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}>
                    <View
                      style={{
                        width: 5,
                        height: 5,
                        backgroundColor: C.gold,
                        transform: [{ rotate: '45deg' }],
                        marginTop: 6,
                      }}
                    />
                    <Text
                      style={{
                        flex: 1,
                        fontFamily: F.body,
                        fontSize: 11.5,
                        lineHeight: 11.5 * 1.55,
                        color: C.creamMute,
                      }}
                    >
                      {line}
                    </Text>
                  </View>
                ))}
              </View>

              <BigButton label="GOT IT" onPress={onClose} fontSize={20} letterSpacing={3} padV={15} radius={11} style={{ marginTop: 16 }} />
            </ScrollView>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}

const rules = StyleSheet.create({
  mini: { width: 54, height: 72, borderRadius: 6 },
  arrow: { color: C.goldSoft, fontSize: 15, fontFamily: F.body },
});

/* ------------------------------------------------------------------ hairline */
export function GoldHairline({ width = 56, style }: { width?: number; style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={['rgba(212,165,60,0)', 'rgba(212,165,60,0.7)', 'rgba(212,165,60,0)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[{ width, height: 1 }, style]}
    />
  );
}

/* ------------------------------------------------------------- segmented */
export type SegmentOption<T extends string> = { value: T; label: string; caption?: string };

/** Two or three mutually exclusive choices, styled like the side picker. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  tone = 'gold',
  style,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  tone?: 'gold' | 'rust';
  style?: ViewStyle;
}) {
  const gold = tone === 'gold';
  return (
    <View style={[{ flexDirection: 'row', gap: 9 }, style]}>
      {options.map((o) => (
        <Segment key={o.value} option={o} active={o.value === value} gold={gold} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

/**
 * One option. The chosen state is drawn as its own layer and faded in, so moving
 * between two options reads as the light coming up on one and down on the other
 * rather than two separate blinks.
 */
function Segment<T extends string>({
  option,
  active,
  gold,
  onPress,
}: {
  option: SegmentOption<T>;
  active: boolean;
  gold: boolean;
  onPress: () => void;
}) {
  const t = useSharedValue(active ? 1 : 0);
  React.useEffect(() => {
    t.value = withTiming(active ? 1 : 0, { duration: 190, easing: Easing.out(Easing.ease) });
  }, [active, t]);

  const chosen = useAnimatedStyle(() => ({ opacity: t.value }));
  const label = useAnimatedStyle(() => ({
    color: interpolateColor(t.value, [0, 1], [C.creamMute, gold ? C.goldText : C.rust]),
  }));

  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      style={({ pressed }) => [
        {
          flex: 1,
          minHeight: 62,
          borderRadius: 12,
          backgroundColor: 'rgba(0,0,0,0.3)',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          borderWidth: 1.5,
          borderColor: 'rgba(212,165,60,0.2)',
        },
        pressed && { transform: [{ translateY: 1 }] },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            margin: -1.5,
            borderRadius: 12,
            borderWidth: 1.5,
            borderColor: gold ? 'rgba(212,165,60,0.9)' : 'rgba(199,90,54,0.9)',
            backgroundColor: gold ? 'rgba(212,165,60,0.1)' : 'rgba(199,90,54,0.1)',
          },
          chosen,
        ]}
      />
      <Animated.Text style={[{ fontFamily: F.display, fontSize: 19, lineHeight: 21, letterSpacing: 2 }, label]}>
        {option.label}
      </Animated.Text>
      {option.caption ? (
        <Text style={{ fontFamily: F.body, fontSize: 8.5, letterSpacing: 1.5, color: C.muted3 }}>{option.caption}</Text>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------- money chip */
export function MoneyChip({
  label,
  active,
  tone = 'gold',
  disabled,
  onPress,
  style,
}: {
  label: string;
  active?: boolean;
  tone?: 'gold' | 'rust';
  disabled?: boolean;
  onPress: () => void;
  style?: ViewStyle;
}) {
  const gold = tone === 'gold';
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        tapLight();
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: 40,
          paddingVertical: 9,
          paddingHorizontal: 15,
          borderRadius: 999,
          borderWidth: 1,
          justifyContent: 'center',
          borderColor: gold ? 'rgba(212,165,60,0.35)' : 'rgba(199,90,54,0.55)',
          backgroundColor: pressed ? (gold ? 'rgba(212,165,60,0.16)' : 'rgba(199,90,54,0.18)') : 'transparent',
          opacity: disabled ? 0.35 : 1,
        },
        active && {
          borderColor: gold ? 'rgba(212,165,60,0.95)' : 'rgba(199,90,54,0.95)',
          backgroundColor: gold ? 'rgba(212,165,60,0.14)' : 'rgba(199,90,54,0.16)',
        },
        style,
      ]}
    >
      <Text
        style={{
          fontFamily: active ? F.bold : F.semi,
          fontSize: 11,
          letterSpacing: 1.5,
          textAlign: 'center',
          color: gold ? (active ? C.goldBright : C.goldSoft) : C.rust,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------ amount pad */
/**
 * Counting out a wager with a keypad rather than tapping +5 forty times.
 * Values are clamped on commit, and the pad tells you why when it clamps.
 */
export function AmountPad({
  visible,
  title,
  initial,
  min,
  max,
  confirmLabel = 'SET WAGER',
  onCancel,
  onCommit,
}: {
  visible: boolean;
  title: string;
  initial: number;
  min: number;
  max: number;
  confirmLabel?: string;
  onCancel: () => void;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState('');

  React.useEffect(() => {
    if (visible) setText(String(Math.max(0, Math.round(initial))));
  }, [visible, initial]);

  const typed = text === '' ? 0 : Number(text);
  const clamped = Math.min(max, Math.max(min, typed));
  const note =
    typed > max
      ? `THE MOST ALLOWED IS ${max.toLocaleString('en-US')}`
      : typed < min
        ? `THE LEAST ALLOWED IS ${min.toLocaleString('en-US')}`
        : '';

  const press = (key: string) => {
    tapLight();
    if (key === '⌫') return setText((t) => t.slice(0, -1));
    if (key === 'C') return setText('');
    setText((t) => (t === '0' ? key : (t + key).slice(0, 9)));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill}>
        <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: 'rgba(3,5,4,0.87)', justifyContent: 'flex-end' }}>
          <Pressable
            onPress={() => {}}
            style={[
              {
                backgroundColor: '#0c130e',
                borderTopWidth: 1,
                borderColor: C.goldBorder,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingHorizontal: 18,
                paddingTop: 16,
                paddingBottom: 26,
              },
              shadow(-6, 40, 0.6, 18),
            ]}
          >
            <Text style={{ fontFamily: F.body, fontSize: 10, letterSpacing: 3, color: C.muted3, textAlign: 'center' }}>
              {title}
            </Text>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: F.display,
                fontSize: 54,
                lineHeight: 58,
                color: C.goldBright,
                textAlign: 'center',
                marginTop: 2,
              }}
            >
              {text === '' ? '0' : Number(text).toLocaleString('en-US')}
            </Text>
            <Text
              style={{
                fontFamily: F.bold,
                fontSize: 9.5,
                letterSpacing: 1.5,
                color: note ? C.rust : C.muted6,
                textAlign: 'center',
                minHeight: 14,
              }}
            >
              {note || `${min.toLocaleString('en-US')} – ${max.toLocaleString('en-US')}`}
            </Text>

            <View style={{ marginTop: 12, gap: 8 }}>
              {[
                ['1', '2', '3'],
                ['4', '5', '6'],
                ['7', '8', '9'],
                ['C', '0', '⌫'],
              ].map((row) => (
                <View key={row.join()} style={{ flexDirection: 'row', gap: 8 }}>
                  {row.map((key) => (
                    <Pressable
                      key={key}
                      onPress={() => press(key)}
                      style={({ pressed }) => [
                        {
                          flex: 1,
                          minHeight: 54,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: C.hairline,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: pressed ? 'rgba(212,165,60,0.14)' : 'rgba(0,0,0,0.3)',
                        },
                      ]}
                    >
                      <Text style={{ fontFamily: F.display, fontSize: 24, lineHeight: 26, color: C.creamDim }}>{key}</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <OutlineButton label="CANCEL" fontSize={18} padV={14} onPress={onCancel} style={{ flex: 1 }} />
              <BigButton
                label={confirmLabel}
                fontSize={18}
                letterSpacing={2.5}
                padV={15}
                radius={13}
                onPress={() => onCommit(clamped)}
                style={{ flex: 1.4 }}
              />
            </View>
          </Pressable>
        </Pressable>
      </BlurView>
    </Modal>
  );
}

/* ------------------------------------------------------------ link status */
export function StatusLine({ text, tone = 'gold', style }: { text: string; tone?: 'gold' | 'rust' | 'dim'; style?: ViewStyle }) {
  const color = tone === 'rust' ? C.rustText : tone === 'dim' ? C.muted3 : C.goldSoft;
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }, style]}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontFamily: F.bold, fontSize: 10, letterSpacing: 2, color, flexShrink: 1 }}>{text}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------- prose */

/**
 * A sentence or two of explanation, set to be read.
 *
 * The design shouts, and rightly: labels, buttons, status words and the wager
 * are all caps, wide-tracked, and they are all short. The screens that came
 * after it — two phones, the hotspot instructions, anything gone wrong — needed
 * whole paragraphs, and took the caps along with them out of politeness to the
 * house style. Forty words in spaced capitals is a wall nobody reads.
 *
 * So prose is prose: Barlow, sentence case, ordinary tracking, and a line
 * height that carries it. The voice is the same, the volume is not.
 */
export function Prose({
  children,
  tone = 'plain',
  style,
}: {
  children: React.ReactNode;
  /** `quiet` for asides, `warn` for the things that are going wrong. */
  tone?: 'plain' | 'quiet' | 'warn';
  style?: StyleProp<TextStyle>;
}) {
  const color = tone === 'warn' ? C.rustText : tone === 'quiet' ? C.muted3 : C.creamMute;
  return (
    <Text style={[{ fontFamily: F.body, fontSize: 11.5, lineHeight: 17, letterSpacing: 0.2, color }, style]}>
      {children}
    </Text>
  );
}

/* ---------------------------------------------------------------- notices */

/**
 * What the app has to say when it has more than a word to say it in.
 *
 * A headline in the game's own voice, the explanation set as prose beneath it,
 * and the machine's own words folded away until somebody asks. Everything used
 * to arrive as one all-caps sentence on the status line — technically the whole
 * story, and shaped so that nobody would read it.
 */
export function NoticeBoard({
  notice,
  tone = 'rust',
  attempt = 0,
  style,
}: {
  notice: Notice;
  tone?: 'rust' | 'gold' | 'dim';
  /** Which go at reconnecting this is, when one is in progress. */
  attempt?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const head = tone === 'rust' ? C.rustText : tone === 'dim' ? C.muted2 : C.goldSoft;
  const edge = tone === 'rust' ? C.rustBorder : C.hairline;

  return (
    <View
      style={[
        {
          alignSelf: 'stretch',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: edge,
          backgroundColor: 'rgba(0,0,0,0.34)',
          paddingVertical: 13,
          paddingHorizontal: 15,
        },
        style,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: head }} />
        <Text style={{ fontFamily: F.bold, fontSize: 10.5, letterSpacing: 2.2, color: head, flexShrink: 1 }}>
          {notice.say}
        </Text>
        {attempt > 0 ? (
          <Text style={{ fontFamily: F.semi, fontSize: 9, letterSpacing: 1.6, color: C.muted7 }}>
            {`· TRY ${attempt}`}
          </Text>
        ) : null}
      </View>

      {notice.fix ? (
        // Prose, in body type and sentence case. This is the part with something
        // to teach, and the only part set to be read rather than glanced at.
        <Text
          style={{
            fontFamily: F.body,
            fontSize: 11.5,
            lineHeight: 17,
            letterSpacing: 0.2,
            color: C.creamMute,
            marginTop: 7,
          }}
        >
          {notice.fix}
        </Text>
      ) : null}

      {notice.tech ? (
        <>
          <Pressable
            onPress={() => setOpen((v) => !v)}
            hitSlop={8}
            style={({ pressed }) => ({ marginTop: 10, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ fontFamily: F.semi, fontSize: 9, letterSpacing: 2, color: C.muted7 }}>
              {open ? 'HIDE DETAILS' : 'DETAILS'}
            </Text>
          </Pressable>
          {open ? (
            <Text
              selectable
              style={{
                fontFamily: F.body,
                fontSize: 10.5,
                lineHeight: 15,
                letterSpacing: 0.2,
                color: C.muted5,
                marginTop: 6,
              }}
            >
              {notice.tech}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------- code field */
/** Four big characters, spaced out so they can be read across a table. */
export function CodeField({
  value,
  onChangeText,
  editable = true,
  onFocus,
  style,
}: {
  value: string;
  onChangeText?: (v: string) => void;
  editable?: boolean;
  onFocus?: () => void;
  // A text field takes text styles. Typed as a ViewStyle this only compiled
  // until `expo start` wrote expo-env.d.ts, after which `npm run typecheck`
  // failed for anyone who had ever run the app.
  style?: StyleProp<TextStyle>;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      maxLength={4}
      autoCapitalize="characters"
      autoCorrect={false}
      autoComplete="off"
      placeholder="––––"
      placeholderTextColor={C.muted8}
      selectionColor={C.gold}
      returnKeyType="done"
      onFocus={() => {
        setFocus(true);
        onFocus?.();
      }}
      onBlur={() => setFocus(false)}
      style={[
        {
          backgroundColor: C.field,
          borderWidth: 1,
          borderColor: focus ? C.gold : C.goldBorderDim,
          borderRadius: 12,
          paddingVertical: 12,
          color: C.goldBright,
          fontFamily: F.display,
          fontSize: 42,
          lineHeight: 46,
          letterSpacing: 12,
          textAlign: 'center',
        },
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------ confirmation */
/**
 * A decision you cannot take back, put in front of the player before it happens.
 * Same sheet as the rules modal so it reads as part of the table, not a system alert.
 */
export function ConfirmModal({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel = 'KEEP PLAYING',
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill}>
        {/* Tapping the scrim backs out — the safe choice is always the easy one. */}
        <Pressable
          onPress={onCancel}
          style={{ flex: 1, backgroundColor: 'rgba(3,5,4,0.87)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <Pressable
            onPress={() => {}}
            style={[
              {
                width: '100%',
                backgroundColor: '#0c130e',
                borderWidth: 1,
                borderColor: C.goldBorder,
                borderRadius: 16,
                paddingHorizontal: 20,
                paddingTop: 22,
                paddingBottom: 20,
              },
              shadow(24, 60, 0.7, 18),
            ]}
          >
            <Text
              style={{
                fontFamily: F.display,
                fontSize: 30,
                lineHeight: 33,
                letterSpacing: 2.5,
                color: C.creamWarm,
                textAlign: 'center',
              }}
            >
              {title}
            </Text>
            <GoldHairline width={72} style={{ alignSelf: 'center', marginTop: 12 }} />
            <Text
              style={{
                marginTop: 14,
                fontFamily: F.body,
                fontSize: 12.5,
                lineHeight: 12.5 * 1.55,
                color: C.creamMute,
                textAlign: 'center',
              }}
            >
              {body}
            </Text>

            <BigButton
              label={cancelLabel}
              fontSize={21}
              letterSpacing={2.5}
              padV={16}
              radius={12}
              onPress={onCancel}
              style={{ marginTop: 20 }}
            />
            <Pressable
              onPress={() => {
                tapLight();
                onConfirm();
              }}
              style={({ pressed }) => [
                {
                  marginTop: 10,
                  paddingVertical: 15,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: C.rustBorder,
                  alignItems: 'center',
                  backgroundColor: pressed ? 'rgba(199,90,54,0.16)' : 'transparent',
                },
                pressed && { transform: [{ translateY: 1 }] },
              ]}
            >
              <Text style={{ fontFamily: F.display, fontSize: 19, letterSpacing: 2.5, color: C.rustText }}>
                {confirmLabel}
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </BlurView>
    </Modal>
  );
}
