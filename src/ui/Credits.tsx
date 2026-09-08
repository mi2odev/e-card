/**
 * Who made this.
 *
 * Reached from a button under the two on the title screen, and built in the same
 * idiom as the rules sheet — dark panel, gold hairline, blurred scrim — so it
 * belongs to the game rather than sitting on top of it. The four places to find
 * the author are icons rather than addresses: nobody types a URL off a phone.
 */

import React, { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
// Imported by its own path: the package index pulls in every icon font there is,
// and this app wants four glyphs out of one of them.
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { C, F } from '../theme';
import { Appear, BigButton, GoldHairline, GradientText, shadow } from './kit';
import { tapLight } from '../haptics';

export const AUTHOR = 'MOHAMED MEHDI ZITOUNI';
/** The initials, for the seal on the button and at the head of the sheet. */
const MONOGRAM = 'MZ';

type Place = {
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  url: string;
};

const PLACES: Place[] = [
  { label: 'PORTFOLIO', icon: 'globe', url: 'https://mohamedmehdi-zitouni.netlify.app/' },
  { label: 'GITHUB', icon: 'github', url: 'https://github.com/mi2odev/' },
  { label: 'INSTAGRAM', icon: 'instagram', url: 'https://www.instagram.com/_.mi2o/' },
  { label: 'LINKEDIN', icon: 'linkedin', url: 'https://www.linkedin.com/in/mohamed-mehdi-zitouni-a84423418/' },
];

/** A phone with nothing to open a link with is not worth a crash, or a scolding. */
const open = (url: string) => {
  tapLight();
  void Linking.openURL(url).catch(() => undefined);
};

/** The gold seal that stands in for a portrait. */
function Monogram({ size = 40 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: C.goldBorder,
        backgroundColor: 'rgba(212,165,60,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: F.display,
          fontSize: size * 0.46,
          lineHeight: size * 0.52,
          letterSpacing: 1.5,
          color: C.goldBright,
          marginLeft: 1.5,
        }}
      >
        {MONOGRAM}
      </Text>
    </View>
  );
}

/** The button on the title screen: says who, and opens the rest. */
export function CreditsButton({ style }: { style?: ViewStyle }) {
  const [open_, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => {
          tapLight();
          setOpen(true);
        }}
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingVertical: 11,
            paddingLeft: 12,
            paddingRight: 14,
            borderRadius: 13,
            borderWidth: 1,
            borderColor: pressed ? C.goldBorder : C.hairline,
            backgroundColor: pressed ? 'rgba(212,165,60,0.1)' : 'rgba(0,0,0,0.3)',
          },
          pressed && { transform: [{ translateY: 1 }] },
          style,
        ]}
      >
        <Monogram />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={{ fontFamily: F.body, fontSize: 8.5, letterSpacing: 2.2, color: C.muted3 }}>CODED BY</Text>
          <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 11.5, letterSpacing: 1.4, color: C.creamMute }}>
            {AUTHOR}
          </Text>
        </View>
        <Text style={{ fontFamily: F.display, fontSize: 20, lineHeight: 21, color: C.goldSoft }}>›</Text>
      </Pressable>
      <CreditsModal visible={open_} onClose={() => setOpen(false)} />
    </>
  );
}

/** One round, tappable place to find the author. */
function PlaceButton({ place, delay }: { place: Place; delay: number }) {
  return (
    <Appear delay={delay} duration={300} from={10} scaleFrom={0.88} style={{ alignItems: 'center', gap: 7 }}>
      <Pressable
        onPress={() => open(place.url)}
        hitSlop={6}
        accessibilityRole="link"
        accessibilityLabel={place.label}
        style={({ pressed }) => [
          {
            width: 62,
            height: 62,
            borderRadius: 31,
            borderWidth: 1,
            borderColor: pressed ? C.gold : C.goldBorderFaint,
            backgroundColor: pressed ? 'rgba(212,165,60,0.16)' : 'rgba(0,0,0,0.34)',
            alignItems: 'center',
            justifyContent: 'center',
          },
          shadow(4, 12, 0.45, 4),
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
      >
        <FontAwesome name={place.icon} size={25} color={C.goldBright} />
      </Pressable>
      <Text style={{ fontFamily: F.body, fontSize: 8, letterSpacing: 1.6, color: C.muted3 }}>{place.label}</Text>
    </Appear>
  );
}

export function CreditsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
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
                  CREDITS
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

              <Appear duration={380} from={12} style={{ alignItems: 'center', marginTop: 18 }}>
                <Monogram size={64} />
                <Text style={{ marginTop: 12, fontFamily: F.body, fontSize: 9, letterSpacing: 3, color: C.muted3 }}>
                  DESIGNED AND CODED BY
                </Text>
                <View style={{ marginTop: 7 }}>
                  <GradientText
                    style={{ fontFamily: F.display, fontSize: 30, lineHeight: 33, letterSpacing: 2, textAlign: 'center' }}
                  >
                    {AUTHOR}
                  </GradientText>
                </View>
                <GoldHairline width={90} style={{ marginTop: 12 }} />
              </Appear>

              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginTop: 20,
                  paddingHorizontal: 4,
                }}
              >
                {PLACES.map((place, i) => (
                  <PlaceButton key={place.label} place={place} delay={160 + i * 70} />
                ))}
              </View>

              <Text
                style={{
                  marginTop: 20,
                  fontFamily: F.body,
                  fontSize: 10,
                  lineHeight: 15,
                  letterSpacing: 0.5,
                  color: C.muted7,
                  textAlign: 'center',
                }}
              >
                E-Card is the game from Kaiji, by Nobuyuki Fukumoto. This app is a fan-made adaptation of it, and is
                not affiliated with the rights holders.
              </Text>

              <BigButton
                label="BACK TO THE TABLE"
                onPress={onClose}
                fontSize={20}
                letterSpacing={3}
                padV={15}
                radius={11}
                style={{ marginTop: 16 }}
              />
            </ScrollView>
          </View>
        </View>
      </BlurView>
    </Modal>
  );
}
