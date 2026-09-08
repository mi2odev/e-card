import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { C, F, sideColor } from '../src/theme';
import { CARD_ART } from '../src/assets';
import { Chip, Fade, OutlineButton, useBreathe } from '../src/ui/kit';
import { FlipCard } from '../src/ui/Cards';
import { Glow, TableBackground } from '../src/ui/Radial';
import { RevealStep, nameOf, otherSide, useGame } from '../src/store/useGame';
import { PLAYS_PER_GAME, SIDE_WORD, fmt, sideOfPlayer } from '../src/game/logic';
import { netAdvance } from '../src/net/actions';
import { draw as drawBuzz, tapHeavy, upset, win } from '../src/haptics';

const CARD_W = 146;

/**
 * How a card sits once the round is decided: 1 for the card that took it, -1 for
 * the card that lost it, 0 while nothing is settled. Runs on the UI thread.
 */
function verdict(fate: number, t: number) {
  'worklet';
  return {
    opacity: fate < 0 ? 1 - 0.4 * t : 1,
    transform: [
      { translateY: fate > 0 ? -8 * t : fate < 0 ? 6 * t : 0 },
      { scale: fate > 0 ? 1 + 0.055 * t : fate < 0 ? 1 - 0.03 * t : 1 },
    ],
  };
}

export default function RevealScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const state = useGame();
  const { rev, result, picks, resolvedStart, game, turn, stake, stakesOn, settings, netRole } = state;
  const { setRev, applyResult, skipReveal, continueReveal } = state;
  const online = netRole !== 'off';
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const p1Side = sideOfPlayer('p1', resolvedStart, game);
  const p2Side = otherSide(p1Side);
  const leftPick = picks[p1Side];
  const rightPick = picks[p2Side];

  const settle = () => {
    if (!result) return;
    if (result.draw) drawBuzz();
    else if (result.winSide === 'slv') upset();
    else win();
  };

  useEffect(() => {
    const drama = Math.max(0.2, settings.revealDrama) * 1000;
    const steps: Array<[number, RevealStep]> = [
      [140, 1],
      [140 + drama, 2],
      [140 + drama + 1250, 3],
      [140 + drama + 2050, 4],
    ];
    timers.current = steps.map(([ms, step]) =>
      setTimeout(() => {
        setRev(step);
        if (step === 2) tapHeavy();
        if (step === 4) {
          applyResult();
          settle();
        }
      }, ms),
    );
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    // Runs once per reveal — the pick is already locked in by the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onZoneTap = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (skipReveal()) settle();
  };

  const decisive = result && !result.draw ? result : null;
  const glowRust = rev >= 2 && decisive?.winSide === 'slv';

  // The verdict lands on the cards themselves, not only in the banner under
  // them: the one that took the round lifts, the one that lost it sinks away.
  const leftFate = decisive ? (decisive.winner === 'p1' ? 1 : -1) : 0;
  const rightFate = -leftFate;
  const settled = useSharedValue(0);
  useEffect(() => {
    settled.value = withTiming(rev >= 4 ? 1 : 0, { duration: 420, easing: Easing.out(Easing.ease) });
  }, [rev, settled]);

  const leftVerdict = useAnimatedStyle(() => verdict(leftFate, settled.value));
  const rightVerdict = useAnimatedStyle(() => verdict(rightFate, settled.value));

  const glowOpacity = useSharedValue(0);
  useEffect(() => {
    glowOpacity.value = withTiming(rev === 1 ? 0.95 : rev >= 2 ? 0.55 : 0, { duration: 700 });
  }, [rev, glowOpacity]);
  const glowFade = useAnimatedStyle(() => ({ opacity: glowOpacity.value }));
  const glowBreathe = useBreathe(2400);

  // A drawn third play ends the round outright — nobody takes it and no money moves.
  const spent = !!result && result.draw && result.final;
  const roundOver = !result || !result.draw || result.final;

  const bannerText = !result
    ? ''
    : result.draw
      ? spent
        ? 'NO DECISION'
        : 'DRAW'
      : `${nameOf(state, result.winner).toUpperCase()} WINS`;
  const payoutText = !result
    ? ''
    : spent
      ? stakesOn
        ? 'EVERY CARD SPENT · THE WAGER GOES BACK'
        : 'EVERY CARD SPENT · THE ROUND GOES TO NEITHER'
      : result.draw
        ? stakesOn
          ? 'BOTH CITIZENS DISCARDED · THE STAKE RIDES ON'
          : 'BOTH CITIZENS DISCARDED — PLAY ON'
        : stakesOn
          ? `STAKE ${fmt(stake)} \u00d7 ${result.mult} — COLLECTS ${fmt(result.paid)} PTS${result.capped ? ' · CLEANED OUT!' : ''}`
          : result.winSide === 'slv'
            ? 'THE 5\u00d7 UPSET'
            : 'ROUND TO THE EMPEROR SIDE';

  const continueLabel = !roundOver ? 'CONTINUE THE ROUND' : game >= 12 ? 'FINAL TALLY' : 'TO THE SCOREBOARD';

  return (
    <View style={{ flex: 1, backgroundColor: C.tableEdge }}>
      <TableBackground />
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          paddingTop: 16 + insets.top,
          paddingHorizontal: 18,
          paddingBottom: 20 + insets.bottom,
        }}
      >
        <Chip
          label={`ROUND ${game} OF 12 · PLAY ${turn} OF ${PLAYS_PER_GAME}`}
          style={{ paddingVertical: 6, paddingHorizontal: 14 }}
        />

        <Pressable
          onPress={onZoneTap}
          style={{ flex: 1, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 }}
        >
          <Animated.View
            pointerEvents="none"
            style={[{ position: 'absolute', width: 330, height: 330, alignSelf: 'center' }, glowBreathe, glowFade]}
          >
            <Glow color={glowRust ? 'rgba(207,90,54,0.34)' : 'rgba(226,180,80,0.3)'} edge={0.65} />
          </Animated.View>

          <Animated.View style={leftVerdict}>
            <FlipCard
              width={CARD_W}
              faceSource={CARD_ART[leftPick ? leftPick.t : 'C']}
              entered={rev >= 1}
              flipped={rev >= 2}
              enterFrom="top"
              dramaMs={500}
            >
              <CardLabel name={nameOf(state, 'p1')} side={p1Side} />
            </FlipCard>
          </Animated.View>

          <Animated.View style={rightVerdict}>
            <FlipCard
              width={CARD_W}
              faceSource={CARD_ART[rightPick ? rightPick.t : 'C']}
              entered={rev >= 1}
              flipped={rev >= 2}
              enterFrom="bottom"
              dramaMs={550}
            >
              <CardLabel name={nameOf(state, 'p2')} side={p2Side} />
            </FlipCard>
          </Animated.View>
        </Pressable>

        <Fade visible={rev >= 3} duration={500} style={{ minHeight: 26, justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.italic, fontSize: 15, color: '#ead9ac', textAlign: 'center' }}>
            {result ? result.line : ''}
          </Text>
        </Fade>

        <Fade visible={rev >= 4} duration={450} scaleFrom={0.94} style={{ width: '100%', marginTop: 12 }}>
          {decisive ? (
            <LinearGradient
              colors={decisive.winSide === 'emp' ? ['#e9c25c', '#b8892c'] : [C.rustPipTop, C.rustPipBottom]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={banner.box}
            >
              <BannerText
                title={bannerText}
                sub={payoutText}
                color={decisive.winSide === 'emp' ? C.inkOnPip : C.creamOnRust}
              />
            </LinearGradient>
          ) : (
            <View style={[banner.box, { backgroundColor: C.panel, borderWidth: 1, borderColor: 'rgba(212,165,60,0.35)' }]}>
              <BannerText title={bannerText} sub={payoutText} color={C.creamDim} />
            </View>
          )}
        </Fade>

        <Fade visible={rev >= 4} duration={400} style={{ width: '100%', marginTop: 14 }} pointerEventsWhenHidden="none">
          <OutlineButton
            label={continueLabel}
            fontSize={22}
            letterSpacing={3}
            padV={17}
            disabled={rev < 4}
            onPress={() => {
              if (online) {
                // The host advances the match; both phones follow the phase.
                netAdvance();
                return;
              }
              const next = continueReveal();
              if (next === 'handoff') router.replace('/handoff');
              else if (next === 'scoreboard') router.replace('/scoreboard');
              else if (next === 'end') router.replace('/end');
            }}
            style={{ borderRadius: 12, borderColor: 'rgba(212,165,60,0.5)' }}
          />
        </Fade>
      </View>
    </View>
  );
}

function CardLabel({ name, side }: { name: string; side: 'emp' | 'slv' }) {
  return (
    <View style={{ marginTop: 9, alignItems: 'center', gap: 2 }}>
      <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 12, letterSpacing: 0.5, color: C.cream }}>
        {name.toUpperCase()}
      </Text>
      <Text style={{ fontFamily: F.bold, fontSize: 9, letterSpacing: 2, color: sideColor(side) }}>{SIDE_WORD[side]}</Text>
    </View>
  );
}

function BannerText({ title, sub, color }: { title: string; sub: string; color: string }) {
  return (
    <>
      <Text style={{ fontFamily: F.display, fontSize: 40, lineHeight: 41, letterSpacing: 3, color, textAlign: 'center' }}>
        {title}
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontFamily: F.bold,
          fontSize: 10.5,
          letterSpacing: 2,
          color,
          opacity: 0.85,
          textAlign: 'center',
        }}
      >
        {sub}
      </Text>
    </>
  );
}

const banner = StyleSheet.create({
  box: {
    width: '100%',
    borderRadius: 12,
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
});
