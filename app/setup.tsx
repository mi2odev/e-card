import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../src/theme';
import { BigButton, HelpButton, NameField, shadow } from '../src/ui/kit';
import { SidePanel, StakesPanel } from '../src/ui/Terms';
import { TableBackground } from '../src/ui/Radial';
import { nameOf, useGame } from '../src/store/useGame';
import { tapLight } from '../src/haptics';

export default function SetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const state = useGame();
  const { p1, p2, setP1, setP2, beginMatch } = state;

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

          <SidePanel
            style={{ marginTop: 24 }}
            heading={
              <>
                FIRST DEAL — <Text style={{ color: C.goldText }}>{nameOf(state, 'p1').toUpperCase()}</Text> PLAYS AS
              </>
            }
          />

          <StakesPanel style={{ marginTop: 22 }} />

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
