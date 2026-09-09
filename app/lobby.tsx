import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { C, F } from '../src/theme';
import { BigButton, Chip, GradientText, HelpButton, SideMono, StatusLine, useWaitingPulse } from '../src/ui/kit';
import { SidePanel, StakesPanel } from '../src/ui/Terms';
import { TableBackground } from '../src/ui/Radial';
import { nameOf, useGame } from '../src/store/useGame';
import { useNet } from '../src/store/useNet';
import { requestExit } from '../src/ui/ExitGuard';
import { retryNow } from '../src/net/session';
import { STATUS_WORD } from '../src/net/protocol';
import { tapLight } from '../src/haptics';

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const state = useGame();
  const net = useNet();

  const isHost = net.role === 'host';
  const me = isHost ? 'p1' : 'p2';
  const them = isHost ? 'p2' : 'p1';
  const failed = net.status === 'error' || net.status === 'closed';
  const seated = net.peerHere && net.status === 'connected';
  // The code breathes while the seat opposite is empty, and settles when it fills.
  const codePulse = useWaitingPulse(!seated);

  const leave = () => {
    tapLight();
    requestExit();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.tableEdge }}>
      <TableBackground />
      <ScrollView
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
            onPress={leave}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 7,
                height: 40,
                paddingLeft: 12,
                paddingRight: 15,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: 'rgba(212,165,60,0.28)',
                backgroundColor: pressed ? 'rgba(199,90,54,0.16)' : 'rgba(0,0,0,0.28)',
              },
            ]}
          >
            <Text style={{ fontFamily: F.display, fontSize: 16, lineHeight: 17, color: C.muted }}>✕</Text>
            <Text style={{ fontFamily: F.bold, fontSize: 10, letterSpacing: 2, color: C.muted }}>LEAVE THE TABLE</Text>
          </Pressable>
          <HelpButton />
        </View>

        <View style={{ alignItems: 'center', marginTop: 8 }}>
          <Text style={{ fontFamily: F.body, fontSize: 10, letterSpacing: 3, color: C.muted3 }}>
            {isHost ? 'YOUR TABLE CODE' : 'AT THE TABLE'}
          </Text>
          <Animated.View style={[{ marginTop: 4 }, codePulse]}>
            <GradientText
              style={{ fontFamily: F.display, fontSize: 62, lineHeight: 64, letterSpacing: 12, textAlign: 'center' }}
            >
              {net.code}
            </GradientText>
          </Animated.View>

          <StatusLine
            style={{ marginTop: 8 }}
            tone={failed ? 'rust' : seated ? 'gold' : 'dim'}
            text={net.detail || STATUS_WORD[net.status]}
          />

          {failed ? (
            <Pressable
              onPress={() => {
                tapLight();
                retryNow();
              }}
              style={({ pressed }) => ({
                marginTop: 10,
                height: 38,
                paddingHorizontal: 20,
                borderRadius: 999,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: C.goldBorder,
                backgroundColor: pressed ? 'rgba(212,165,60,0.16)' : 'rgba(0,0,0,0.3)',
              })}
            >
              <Text style={{ fontFamily: F.bold, fontSize: 10.5, letterSpacing: 2.5, color: C.goldSoft }}>
                TRY AGAIN
              </Text>
            </Pressable>
          ) : null}

          {net.info?.hint ? (
            <Chip
              style={{ marginTop: 10 }}
              label={
                net.info.mode === 'direct'
                  ? `SERVED BY THIS PHONE · ${net.info.hint}`
                  : net.info.mode === 'hotspot'
                    ? net.info.hint
                    : // A guest dials an address and is never told what answered
                      // — a relay, or the other phone serving the table itself.
                      // Only the host knows it went looking for a relay.
                      isHost
                      ? `VIA RELAY ${net.info.hint}`
                      : `TABLE AT ${net.info.hint}`
              }
            />
          ) : null}

          {isHost && net.info?.mode === 'hotspot' ? (
            <Text
              style={{
                fontFamily: F.body,
                fontSize: 9,
                letterSpacing: 1.2,
                color: C.muted7,
                marginTop: 8,
                textAlign: 'center',
                lineHeight: 13,
              }}
            >
              THE OTHER PHONE JOINS THIS HOTSPOT, ENTERS THE CODE, AND FINDS THIS TABLE BY ITSELF
            </Text>
          ) : null}

          {isHost && net.info?.mode === 'relay' ? (
            <Text
              style={{
                fontFamily: F.body,
                fontSize: 9,
                letterSpacing: 1.2,
                color: C.muted7,
                marginTop: 8,
                textAlign: 'center',
                lineHeight: 13,
              }}
            >
              THE OTHER PHONE NEEDS THIS CODE AND THE SAME RELAY ADDRESS
            </Text>
          ) : null}
        </View>

        <View
          style={{
            marginTop: 20,
            borderRadius: 16,
            backgroundColor: C.panel,
            borderWidth: 1,
            borderColor: C.hairline,
            overflow: 'hidden',
          }}
        >
          <Seat label="THIS PHONE" name={nameOf(state, me)} side="emp" present />
          <Seat
            label={isHost ? 'THE CHALLENGER' : 'WHO OPENED THE TABLE'}
            name={net.peerHere ? nameOf(state, them) : 'EMPTY SEAT'}
            side="slv"
            present={net.peerHere}
            divider
          />
        </View>

        <SidePanel
          style={{ marginTop: 22 }}
          editable={isHost}
          heading={
            <>
              FIRST DEAL —{' '}
              <Text style={{ color: C.goldText }}>
                {(net.peerHere || isHost ? nameOf(state, 'p1') : 'THE HOST').toUpperCase()}
              </Text>{' '}
              PLAYS AS
            </>
          }
        />

        <StakesPanel style={{ marginTop: 22 }} editable={isHost} />

        <View style={{ flex: 1, minHeight: 16 }} />

        {isHost ? (
          <BigButton
            label={seated ? 'BEGIN THE MATCH' : 'WAITING FOR A CHALLENGER'}
            onPress={() => {
              if (seated) state.beginMatch();
            }}
            style={{ marginTop: 16, opacity: seated ? 1 : 0.45 }}
          />
        ) : (
          <View
            style={{
              marginTop: 16,
              paddingVertical: 19,
              borderRadius: 13,
              borderWidth: 1,
              borderColor: C.goldBorderFaint,
              backgroundColor: 'rgba(0,0,0,0.25)',
            }}
          >
            <StatusLine
              tone="dim"
              text={seated ? `${nameOf(state, 'p1').toUpperCase()} SETS THE TERMS` : 'LOOKING FOR THE TABLE'}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** A seat at the table. Somebody arriving is worth watching happen. */
function Seat({
  label,
  name,
  side,
  present,
  divider,
}: {
  label: string;
  name: string;
  side: 'emp' | 'slv';
  present: boolean;
  divider?: boolean;
}) {
  const t = useSharedValue(present ? 1 : 0);
  useEffect(() => {
    t.value = withTiming(present ? 1 : 0, { duration: 420, easing: Easing.out(Easing.ease) });
  }, [present, t]);

  const row = useAnimatedStyle(() => ({ opacity: 0.5 + 0.5 * t.value }));
  const taken = useAnimatedStyle(() => ({ opacity: t.value, transform: [{ scale: 0.7 + 0.3 * t.value }] }));
  const waiting = useAnimatedStyle(() => ({ opacity: 1 - t.value }));

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 13,
          paddingHorizontal: 14,
          borderTopWidth: divider ? 1 : 0,
          borderTopColor: C.hairlineSoft,
        },
        row,
      ]}
    >
      <SideMono side={side} size={42} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 14.5, letterSpacing: 0.5, color: C.cream }}>
          {name.toUpperCase()}
        </Text>
        <Text style={{ fontFamily: F.body, fontSize: 9, letterSpacing: 2, color: C.muted3 }}>{label}</Text>
      </View>
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.Text style={[seatMark.glyph, { color: C.goldBright }, taken]}>✓</Animated.Text>
        <Animated.Text style={[seatMark.glyph, { color: C.muted8 }, waiting]}>…</Animated.Text>
      </View>
    </Animated.View>
  );
}

const seatMark = StyleSheet.create({
  glyph: { position: 'absolute', fontFamily: F.display, fontSize: 20, lineHeight: 21 },
});
