import React from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, sideColor } from '../src/theme';
import { BigButton, Chip, Fade, HelpButton, SideMono, StatusLine } from '../src/ui/kit';
import { DiscardPair, FanCard, MiniBack } from '../src/ui/Cards';
import { TableBackground } from '../src/ui/Radial';
import { localPlayer, localSide, nameOf, otherSide, sidePlayerNow, useGame } from '../src/store/useGame';
import { LABEL, SIDE_WORD, fmt } from '../src/game/logic';
import { netPick } from '../src/net/actions';
import { tapMedium, tick } from '../src/haptics';

export default function SelectScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const state = useGame();
  const { hands, sel, game, turn, stakesOn, stake, discards, picks, settings, netRole, tapCard, confirmSel } = state;

  const online = netRole !== 'off';
  // Offline the side is whoever holds the phone; online it is this device's seat.
  const mySide = localSide(state);
  const theirSide = otherSide(mySide);

  const holder = localPlayer(state);
  const opp = sidePlayerNow(state, theirSide);
  const oppHand = hands ? hands[theirSide] : [];
  const myHand = hands ? hands[mySide] : [];
  const oppLocked = !!picks[theirSide];
  const iAmLocked = !!picks[mySide];
  const selCard = sel >= 0 ? myHand[sel] : undefined;

  const commit = () => {
    tapMedium();
    if (online) {
      // Both seats commit independently; the phase change moves us to the reveal.
      netPick(sel);
      return;
    }
    const next = confirmSel();
    if (next === 'handoff') router.replace('/handoff');
    else if (next === 'reveal') router.replace('/reveal');
  };

  const onCardPress = (i: number) => {
    if (iAmLocked) return;
    if (tapCard(i) === 'confirm') commit();
    else tick();
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.tableEdge }}>
      <TableBackground />

      <View style={{ flex: 1, paddingTop: insets.top }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11, paddingTop: 14, paddingHorizontal: 16 }}>
          <SideMono side={mySide} size={40} />
          <View style={{ gap: 2, minWidth: 0, flexShrink: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, letterSpacing: 0.5, color: C.cream }}>
              {nameOf(state, holder).toUpperCase()}
            </Text>
            <Text style={{ fontFamily: F.bold, fontSize: 9.5, letterSpacing: 2, color: sideColor(mySide) }}>
              {`${SIDE_WORD[mySide]} SIDE`}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          <HelpButton />
        </View>

        <View style={{ flexDirection: 'row', gap: 8, paddingTop: 11, paddingHorizontal: 16, flexWrap: 'wrap' }}>
          <Chip label={`GAME ${game} OF 12 · TURN ${turn}`} style={{ paddingVertical: 6, paddingHorizontal: 13 }} />
          {stakesOn ? (
            <Chip tone="rust" label={`STAKE ${fmt(stake)}`} style={{ paddingVertical: 6, paddingHorizontal: 13 }} />
          ) : null}
        </View>

        <View
          style={{
            marginHorizontal: 16,
            marginTop: 12,
            paddingVertical: 10,
            paddingHorizontal: 13,
            borderRadius: 13,
            backgroundColor: C.panelSoft,
            borderWidth: 1,
            borderColor: 'rgba(212,165,60,0.14)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 12, color: C.creamMute }}>
              {nameOf(state, opp).toUpperCase()}
            </Text>
            <Text style={{ fontFamily: F.body, fontSize: 8.5, letterSpacing: 1.5, color: C.muted6 }}>
              {`${oppHand.length} CARDS IN HAND`}
            </Text>
          </View>
          {oppHand.map((c) => (
            <MiniBack key={c.id} />
          ))}
          {oppLocked ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 2 }}>
              <MiniBack locked />
              <Text style={{ fontFamily: F.bold, fontSize: 8.5, letterSpacing: 1.5, color: C.rust, width: 40, lineHeight: 13 }}>
                LOCKED IN
              </Text>
            </View>
          ) : null}
        </View>

        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            paddingTop: 8,
            paddingHorizontal: 16,
            paddingBottom: (iAmLocked ? 40 : 244) + insets.bottom,
          }}
        >
          {discards.length > 0 ? (
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text style={{ fontFamily: F.body, fontSize: 9, letterSpacing: 2.5, color: C.muted6 }}>
                DISCARDS — DRAWN TURNS
              </Text>
              <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                {discards.map((t) => (
                  <DiscardPair key={t} label={`TURN ${t}`} />
                ))}
              </View>
            </View>
          ) : null}

          {iAmLocked ? (
            <View style={{ alignItems: 'center', gap: 10 }}>
              <Text style={{ fontFamily: F.display, fontSize: 34, lineHeight: 36, letterSpacing: 3, color: C.creamPale }}>
                CARD PLAYED
              </Text>
              <StatusLine tone="dim" text={`WAITING FOR ${nameOf(state, opp).toUpperCase()}`} />
              <Text style={{ fontFamily: F.italic, fontSize: 12.5, color: C.muted4, textAlign: 'center' }}>
                Face down on the table. No taking it back.
              </Text>
            </View>
          ) : settings.matchupHints ? (
            <View style={{ alignItems: 'center', gap: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[hint.word, { color: C.goldText }]}>EMPEROR</Text>
                <Text style={[hint.word, { color: C.muted8 }]}>▸</Text>
                <Text style={[hint.word, { color: C.creamMute }]}>CITIZEN</Text>
                <Text style={[hint.word, { color: C.muted8 }]}>▸</Text>
                <Text style={[hint.word, { color: C.rust }]}>SLAVE</Text>
                <Text style={[hint.word, { color: C.muted8 }]}>▸</Text>
                <Text style={[hint.word, { color: C.goldText }]}>EMPEROR</Text>
              </View>
              <Text style={{ fontFamily: F.body, fontSize: 8, letterSpacing: 2, color: C.muted8 }}>EACH BEATS THE NEXT</Text>
            </View>
          ) : null}
        </View>
      </View>

      <Fade
        visible={sel >= 0 && !iAmLocked}
        duration={250}
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: 250 + insets.bottom,
          alignItems: 'center',
          gap: 7,
          zIndex: 40,
        }}
      >
        <BigButton
          label={selCard ? `PLAY THE ${LABEL[selCard.t]}` : 'PLAY'}
          tone={mySide === 'emp' ? 'gold' : 'rust'}
          fontSize={23}
          letterSpacing={2.5}
          padV={16}
          radius={12}
          onPress={commit}
          style={{ width: '100%' }}
        />
        <Text style={{ fontFamily: F.body, fontSize: 9.5, letterSpacing: 1.8, color: '#a89c7c' }}>
          OR TAP THE RAISED CARD AGAIN
        </Text>
      </Fade>

      {iAmLocked ? null : (
        <View style={{ position: 'absolute', left: 14, right: 14, bottom: 6 + insets.bottom, height: 218 }}>
          {myHand.map((c, i) => (
            <FanCard
              key={c.id}
              cardType={c.t}
              index={i}
              count={myHand.length}
              raised={sel === i}
              onPress={() => onCardPress(i)}
            />
          ))}
        </View>
      )}

      <LinearGradient
        pointerEvents="none"
        colors={['rgba(4,16,10,0)', 'rgba(4,16,10,0.85)']}
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 26 }}
      />
    </View>
  );
}

const hint = {
  word: { fontFamily: F.bold, fontSize: 10, letterSpacing: 1.8 } as const,
};
