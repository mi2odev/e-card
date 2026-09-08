import React, { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { C, F } from '../src/theme';
import { CARD_ART } from '../src/assets';
import { CARD_RATIO } from '../src/ui/Cards';
import {
  Appear,
  BigButton,
  GoldHairline,
  GradientText,
  HelpButton,
  NameField,
  OutlineButton,
  shadow,
  useKeyboard,
} from '../src/ui/kit';
import { Glow, TableBackground } from '../src/ui/Radial';
import { CreditsLine } from '../src/ui/Credits';
import { useGame } from '../src/store/useGame';
import { useNet } from '../src/store/useNet';
import { resumeSession } from '../src/net/session';
import { tapLight } from '../src/haptics';

export default function TitleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const p1 = useGame((s) => s.p1);
  const p2 = useGame((s) => s.p2);
  const setP1 = useGame((s) => s.setP1);
  const setP2 = useGame((s) => s.setP2);
  // Left a table, by accident or otherwise? This is where the phone lands, so
  // this is where the way back belongs.
  const resume = useNet((s) => s.resume);

  // Typing a name should not mean typing blind. The keyboard takes most of a
  // phone, so the cards and the wordmark fold away while it is up and the two
  // fields come to meet the player; everything comes back when it goes.
  const { open: typing } = useKeyboard();
  const player2 = useRef<TextInput>(null);
  const [heroHeight, setHeroHeight] = useState(0);
  const hero = useSharedValue(1);

  useEffect(() => {
    hero.value = withTiming(typing ? 0 : 1, { duration: 240, easing: Easing.out(Easing.ease) });
  }, [typing, hero]);

  const heroStyle = useAnimatedStyle(() =>
    heroHeight ? { height: heroHeight * hero.value, opacity: hero.value } : {},
  );
  const gapStyle = useAnimatedStyle(() => ({ flex: hero.value, minHeight: 18 * hero.value }));
  const markStyle = useAnimatedStyle(() => ({ height: 34 * (1 - hero.value), opacity: 1 - hero.value }));

  const takeSeatAgain = async () => {
    tapLight();
    try {
      await resumeSession();
      router.replace('/lobby');
    } catch {
      // Something about that table no longer works; the two-phones screen says
      // what, and can open it again by hand.
      router.push('/online');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.tableEdge }}>
      <TableBackground />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: 'center',
            paddingTop: 36 + insets.top,
            paddingHorizontal: 26,
            paddingBottom: 20 + insets.bottom,
          }}
        >
          <Animated.View style={[{ alignItems: 'center', overflow: 'hidden' }, heroStyle]}>
            <View
              style={{ alignItems: 'center' }}
              onLayout={(e) => setHeroHeight((h) => h || Math.round(e.nativeEvent.layout.height))}
            >
              {/* card cluster */}
              <View style={{ width: 238, height: 156 }}>
                <Glow color="rgba(212,165,60,0.26)" style={{ left: 14, top: 38, width: 210, height: 110 }} edge={0.68} />
                <Image
                  source={CARD_ART.C}
                  style={[
                    { position: 'absolute', left: 14, top: 22, width: 86, height: 86 * CARD_RATIO, borderRadius: 8, transform: [{ rotate: '-13deg' }] },
                    shadow(10, 22, 0.6, 6),
                  ]}
                />
                <Image
                  source={CARD_ART.S}
                  style={[
                    { position: 'absolute', right: 14, top: 22, width: 86, height: 86 * CARD_RATIO, borderRadius: 8, transform: [{ rotate: '13deg' }] },
                    shadow(10, 22, 0.6, 6),
                  ]}
                />
                <Image
                  source={CARD_ART.E}
                  style={[
                    { position: 'absolute', left: '50%', marginLeft: -47, top: 2, width: 94, height: 94 * CARD_RATIO, borderRadius: 8, zIndex: 3 },
                    shadow(14, 28, 0.68, 10),
                  ]}
                />
              </View>

              <View style={{ marginTop: 16 }}>
                <GradientText style={{ fontFamily: F.display, fontSize: 76, lineHeight: 74, letterSpacing: 7, textAlign: 'center' }}>
                  E-CARD
                </GradientText>
              </View>

              <Text style={{ marginTop: 9, fontFamily: F.semi, fontSize: 11, letterSpacing: 5, color: C.muted }}>
                EMPEROR · CITIZEN · SLAVE
              </Text>
              <GoldHairline style={{ marginTop: 12 }} />
              <Text style={{ marginTop: 10, fontFamily: F.body, fontSize: 10, letterSpacing: 2.5, color: C.muted5 }}>
                TWO PLAYERS · ONE DEVICE · NO MERCY
              </Text>
            </View>
          </Animated.View>

          {/* Stands in for the wordmark while it is folded away. */}
          <Animated.View style={[{ alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, markStyle]}>
            <Text style={{ fontFamily: F.display, fontSize: 23, lineHeight: 26, letterSpacing: 7, color: C.goldSoft }}>
              E-CARD
            </Text>
          </Animated.View>

          <Animated.View style={gapStyle} />

          <View style={{ width: '100%', gap: 12 }}>
            {resume ? (
              <Appear duration={420} from={10}>
                <Pressable
                  onPress={() => void takeSeatAgain()}
                  style={({ pressed }) => [
                    {
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: C.goldBorder,
                      backgroundColor: pressed ? 'rgba(212,165,60,0.14)' : 'rgba(0,0,0,0.32)',
                      gap: 3,
                    },
                    shadow(4, 12, 0.4, 3),
                  ]}
                >
                  <Text style={{ fontFamily: F.bold, fontSize: 11, letterSpacing: 2.2, color: C.goldBright }}>
                    {`TAKE YOUR SEAT AGAIN · ${resume.code}`}
                  </Text>
                  <Text style={{ fontFamily: F.body, fontSize: 9, letterSpacing: 1.6, color: C.muted7 }}>
                    {resume.inMatch ? `ROUND ${resume.game} OF 12 WAS STILL ON THE TABLE` : 'THE TABLE YOU LEFT'}
                  </Text>
                </Pressable>
              </Appear>
            ) : null}
            <NameField
              label="PLAYER 1"
              value={p1}
              onChangeText={setP1}
              placeholder="Enter a name"
              returnKeyType="next"
              onSubmit={() => player2.current?.focus()}
            />
            <NameField
              label="PLAYER 2"
              value={p2}
              onChangeText={setP2}
              placeholder="Enter a name"
              inputRef={player2}
            />
            <BigButton
              label="PASS & PLAY"
              fontSize={26}
              onPress={() => router.push('/setup')}
              style={{ marginTop: 6 }}
            />
            <OutlineButton
              label="TWO PHONES"
              fontSize={22}
              padV={15}
              onPress={() => router.push('/online')}
            />
            <Text
              style={{
                textAlign: 'center',
                fontFamily: F.body,
                fontSize: 9.5,
                letterSpacing: 2,
                color: C.muted7,
              }}
            >
              12 ROUNDS · 5 CARDS EACH · THE SLAVE PAYS 5×
            </Text>
            <CreditsLine style={{ marginTop: 2 }} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <HelpButton style={{ position: 'absolute', top: 14 + insets.top, right: 14 }} />
    </View>
  );
}
