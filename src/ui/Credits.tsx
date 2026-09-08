/**
 * Who made this.
 *
 * Reached from the line under the two buttons on the title screen, and built in
 * the same idiom as the rules sheet — dark panel, gold hairline, blurred scrim —
 * so it belongs to the game rather than sitting on top of it.
 */

import React, { useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { C, F } from '../theme';
import { BigButton, GoldHairline, GradientText, shadow } from './kit';
import { tapLight } from '../haptics';

export const AUTHOR = 'MOHAMED MEHDI ZITOUNI';

type Link = { label: string; shown: string; url: string };

const LINKS: Link[] = [
  { label: 'PORTFOLIO', shown: 'mohamedmehdi-zitouni.netlify.app', url: 'https://mohamedmehdi-zitouni.netlify.app/' },
  { label: 'GITHUB', shown: 'github.com/mi2odev', url: 'https://github.com/mi2odev/' },
  { label: 'INSTAGRAM', shown: '@_.mi2o', url: 'https://www.instagram.com/_.mi2o/' },
  {
    label: 'LINKEDIN',
    shown: 'in/mohamed-mehdi-zitouni',
    url: 'https://www.linkedin.com/in/mohamed-mehdi-zitouni-a84423418/',
  },
];

/** The line on the title screen. Discreet, and the whole of it is the target. */
export function CreditsLine({ style }: { style?: ViewStyle }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        onPress={() => {
          tapLight();
          setOpen(true);
        }}
        hitSlop={10}
        style={({ pressed }) => [{ alignItems: 'center', paddingVertical: 4, opacity: pressed ? 0.6 : 1 }, style]}
      >
        <Text style={{ fontFamily: F.body, fontSize: 9.5, letterSpacing: 2, color: C.muted7 }}>
          {`CODED BY ${AUTHOR}`}
        </Text>
        <Text style={{ marginTop: 3, fontFamily: F.bold, fontSize: 8.5, letterSpacing: 2, color: C.goldSoft }}>
          CREDITS
        </Text>
      </Pressable>
      <CreditsModal visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function CreditsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const open = (url: string) => {
    tapLight();
    // A phone with no browser for it is not worth a crash, or a scolding.
    void Linking.openURL(url).catch(() => undefined);
  };

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

              <View style={{ alignItems: 'center', marginTop: 18 }}>
                <Text style={{ fontFamily: F.body, fontSize: 9.5, letterSpacing: 3, color: C.muted3 }}>
                  DESIGNED AND CODED BY
                </Text>
                <View style={{ marginTop: 8 }}>
                  <GradientText
                    style={{ fontFamily: F.display, fontSize: 30, lineHeight: 33, letterSpacing: 2, textAlign: 'center' }}
                  >
                    {AUTHOR}
                  </GradientText>
                </View>
                <GoldHairline width={90} style={{ marginTop: 12 }} />
              </View>

              <View style={{ gap: 9, marginTop: 18 }}>
                {LINKS.map((link) => (
                  <Pressable
                    key={link.label}
                    onPress={() => open(link.url)}
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: pressed ? C.gold : C.hairline,
                      backgroundColor: pressed ? 'rgba(212,165,60,0.12)' : C.panel,
                    })}
                  >
                    <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                      <Text style={{ fontFamily: F.semi, fontSize: 9, letterSpacing: 2, color: C.muted2 }}>
                        {link.label}
                      </Text>
                      <Text numberOfLines={1} style={{ fontFamily: F.medium, fontSize: 13.5, color: C.cream }}>
                        {link.shown}
                      </Text>
                    </View>
                    <Text style={{ fontFamily: F.display, fontSize: 18, lineHeight: 19, color: C.goldSoft }}>↗</Text>
                  </Pressable>
                ))}
              </View>

              <Text
                style={{
                  marginTop: 16,
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
