import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../src/theme';
import {
  Appear,
  BigButton,
  CodeField,
  HelpButton,
  NameField,
  Segmented,
  NoticeBoard,
  Prose,
  shadow,
  useFieldScroller,
  useKeyboard,
} from '../src/ui/kit';
import { TableBackground } from '../src/ui/Radial';
import { useGame } from '../src/store/useGame';
import { useNet } from '../src/store/useNet';
import { forgetParkedTable, resumeSession, startSession } from '../src/net/session';
import { wifiHostsItself } from '../src/net/wifi';
import { defaultRelayAddress, localIpAddress } from '../src/net/discover';
import { DEFAULT_PORT, isCompleteRoomCode, makeRoomCode, normalizeRoomCode } from '../src/net/protocol';
import { NOTICE, type Notice } from '../src/net/notice';
import { tapLight } from '../src/haptics';

type Role = 'host' | 'guest';

export default function OnlineScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const p1 = useGame((s) => s.p1);
  const setP1 = useGame((s) => s.setP1);
  // A table this phone walked away from — by accident or otherwise. The seat is
  // still there as long as the other phone is holding it.
  const resume = useNet((s) => s.resume);

  const [role, setRole] = useState<Role>('host');
  // Both phones on a network they joined, or on one that a phone is making
  // itself. On a hotspot nothing is typed: the guest works out where the host is.
  const [hotspot, setHotspot] = useState(false);
  const [code, setCode] = useState(() => makeRoomCode());
  const [address, setAddress] = useState('');
  const [error, setError] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [ownIp, setOwnIp] = useState('');
  /** Whether the asking is over, so "still looking" can stop being the answer. */
  const [askedForIp, setAskedForIp] = useState(false);

  // Same as everywhere a name is typed: make room for the keyboard, and put the
  // field being filled in where the player can see it.
  const { height: keyboard } = useKeyboard();
  const form = useFieldScroller();

  // Only the host invents a code; the guest types the one they were shown.
  const [hostCode] = useState(code);
  useEffect(() => {
    setCode(role === 'host' ? hostCode : '');
  }, [role, hostCode]);

  useEffect(() => {
    setAddress((a) => a || defaultRelayAddress());
    // Asked with a few goes: a phone that has just come onto the Wi-Fi has no
    // address to give for a second or two, and this one is read out loud.
    void localIpAddress(6).then((ip) => {
      setOwnIp(ip);
      setAskedForIp(true);
    });
  }, []);

  const onHotspot = hotspot;
  // This build can serve the table from the phone itself — no computer needed,
  // and no relay address to type. The other phone dials this one directly.
  const canServe = wifiHostsItself();
  const directHost = role === 'host' && canServe;
  // A hotspot table is always served by the phone sharing, and always found by
  // the other one, so there is never an address to type on either side.
  const needsAddress = !onHotspot && !directHost;
  const ready = useMemo(
    () => isCompleteRoomCode(code) && (!needsAddress || address.trim().length > 0) && !busy,
    [code, needsAddress, address, busy],
  );

  /** What to hand the driver: a hotspot guest is given nothing and goes looking. */
  const dialAddress = () => {
    if (onHotspot) return role === 'host' ? ownIp : '';
    return directHost ? ownIp : address.trim();
  };

  /**
   * Go to the table now and let the dial report itself from there.
   *
   * Sitting on the button until the link is up is fine for a relay, which either
   * answers or does not, and quite wrong for a hotspot: the guest goes looking
   * for the other phone and can be at it for the best part of a minute, which
   * from here is a button reading ONE MOMENT and nothing else at all. The table
   * has the room code, the search saying where it has got to, and a way to try
   * again — so that is where the waiting belongs.
   */
  const waitAtTheTable = (start: Promise<void>) => {
    setBusy(true);
    setError(null);
    router.replace('/lobby');
    start
      .catch((e) => {
        // Drivers report their own failures through the link status; this is for
        // the unexpected kind, which would otherwise land nowhere at all.
        const said = NOTICE.unexpected(String((e as { message?: string })?.message ?? e));
        setError(said);
        useNet.getState().patch({ status: 'error', notice: said });
      })
      .finally(() => setBusy(false));
  };

  /** Take the seat that was left, on the same table, with the match as it stood. */
  const back = () => {
    if (busy) return;
    waitAtTheTable(resumeSession());
  };

  const go = () => {
    if (!ready) return;
    waitAtTheTable(
      startSession({
        kind: 'wifi',
        role,
        code: normalizeRoomCode(code),
        // Hosting directly, the address is this phone's own — it is what the
        // other player types, so it has to travel with the session for display.
        address: dialAddress(),
        hotspot: onHotspot,
        port: DEFAULT_PORT,
        name: p1.trim() || (role === 'host' ? 'Host' : 'Challenger'),
      }),
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.tableEdge }}>
      <TableBackground />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={form.ref}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 22,
            paddingTop: insets.top,
            paddingBottom: 20 + insets.bottom + (Platform.OS === 'android' ? keyboard : 0),
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
            TWO PHONES
          </Text>
          <Text style={{ fontFamily: F.body, fontSize: 10, letterSpacing: 2.5, color: C.muted3, marginTop: 2 }}>
            EACH PLAYER KEEPS THEIR OWN HAND
          </Text>

          {resume ? (
            <Appear
              duration={380}
              from={12}
              style={{
                marginTop: 18,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: C.goldBorder,
                backgroundColor: 'rgba(0,0,0,0.34)',
                overflow: 'hidden',
              }}
            >
              <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 4 }}>
                <Text style={{ fontFamily: F.semi, fontSize: 10, letterSpacing: 2, color: C.muted2 }}>
                  YOU LEFT A TABLE
                </Text>
                <Text style={{ fontFamily: F.display, fontSize: 30, lineHeight: 32, letterSpacing: 6, color: C.goldBright }}>
                  {resume.code}
                </Text>
                <Prose tone="quiet" style={{ marginTop: 2 }}>
                  {resume.inMatch
                    ? `Round ${resume.game} of 12 was still on it. If the other phone is still there, the match picks up exactly where it stopped.`
                    : 'The seat is still yours if the other phone has not closed the table.'}
                </Prose>
              </View>
              <BigButton
                label={busy ? 'ONE MOMENT…' : 'TAKE YOUR SEAT AGAIN'}
                fontSize={19}
                onPress={back}
                style={{ marginHorizontal: 12 }}
              />
              <Pressable
                onPress={() => {
                  tapLight();
                  forgetParkedTable();
                }}
                style={({ pressed }) => ({
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Text style={{ fontFamily: F.body, fontSize: 9, letterSpacing: 2, color: C.muted7 }}>
                  NO — THAT TABLE IS DONE
                </Text>
              </Pressable>
            </Appear>
          ) : null}

          <Segmented
            style={{ marginTop: 20 }}
            value={role}
            onChange={setRole}
            options={[
              { value: 'host', label: 'OPEN', caption: 'DEAL THE TABLE' },
              { value: 'guest', label: 'JOIN', caption: 'TAKE A SEAT' },
            ]}
          />

          <Text style={{ fontFamily: F.semi, fontSize: 10, letterSpacing: 2, color: C.muted2, marginTop: 22, marginBottom: 8 }}>
            HOW THE PHONES FIND EACH OTHER
          </Text>
          <Segmented
            value={hotspot ? 'hotspot' : 'network'}
            onChange={(v) => setHotspot(v === 'hotspot')}
            options={[
              { value: 'network', label: 'WI-FI', caption: 'BOTH ON ONE NETWORK' },
              { value: 'hotspot', label: 'HOTSPOT', caption: 'A PHONE MAKES ONE' },
            ]}
          />
          {error ? <NoticeBoard notice={error} style={{ marginTop: 12 }} /> : null}

          <View style={{ marginTop: 22 }} onLayout={form.track('name')}>
            <NameField
              label="YOUR NAME"
              value={p1}
              onChangeText={setP1}
              placeholder="Enter a name"
              onFocus={form.focus('name')}
            />
          </View>

          <Text
            onLayout={form.track('code')}
            style={{ fontFamily: F.semi, fontSize: 10, letterSpacing: 2, color: C.muted2, marginTop: 20, marginBottom: 8 }}
          >
            {role === 'host' ? 'YOUR TABLE CODE — READ IT OUT' : 'THE TABLE CODE'}
          </Text>
          <CodeField
            value={code}
            editable={role === 'guest'}
            onChangeText={(v) => setCode(normalizeRoomCode(v))}
            onFocus={form.focus('code')}
          />

          {onHotspot ? (
            <Appear
              style={{
                marginTop: 18,
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: 12,
                backgroundColor: 'rgba(0,0,0,0.3)',
                borderWidth: 1,
                borderColor: C.hairline,
                gap: 7,
              }}
            >
              <Text style={{ fontFamily: F.semi, fontSize: 10, letterSpacing: 2, color: C.muted2 }}>
                {role === 'host' ? 'THIS PHONE MAKES THE WI-FI' : 'JOIN THE OTHER PHONE FIRST'}
              </Text>
              <Prose>
                {role === 'host'
                  ? 'Turn on Personal Hotspot (iPhone) or Mobile Hotspot (Android), have the other player join that network, then open the table and read out the code.'
                  : 'In Wi-Fi settings, join the network the other phone is sharing. Then enter the code — this phone goes looking for the table on its own.'}
              </Prose>
              <Prose tone="quiet">
                No router, no computer, nothing to type. The phone sharing the hotspot is the one that opens it.
              </Prose>
              {role === 'host' && !canServe ? (
                <Prose tone="warn">
                  This copy cannot open a port, so it cannot serve the table — normal in Expo Go, which is not allowed
                  one. The phone sharing the hotspot needs a build that can; the other one does not.
                </Prose>
              ) : null}
            </Appear>
          ) : null}

          {directHost && !onHotspot ? (
            <Appear
              style={{
                marginTop: 18,
                paddingVertical: 14,
                paddingHorizontal: 16,
                borderRadius: 12,
                backgroundColor: 'rgba(0,0,0,0.3)',
                borderWidth: 1,
                borderColor: C.hairline,
                gap: 6,
              }}
            >
              <Text style={{ fontFamily: F.semi, fontSize: 10, letterSpacing: 2, color: C.muted2 }}>
                THIS PHONE SERVES THE TABLE
              </Text>
              <Text style={{ fontFamily: F.display, fontSize: 26, lineHeight: 28, letterSpacing: 1, color: C.goldBright }}>
                {ownIp
                  ? `${ownIp}:${DEFAULT_PORT}`
                  : askedForIp
                    ? `PORT ${DEFAULT_PORT}`
                    : 'FINDING THIS PHONE ON THE WI-FI…'}
              </Text>
              <Prose tone="quiet">
                No computer needed. The other phone enters this address and the code above, on the same Wi-Fi.
              </Prose>
              {askedForIp && !ownIp ? (
                // The table is served either way — but an address nobody can read
                // out is no use to the other phone, and saying "finding it…" for
                // ever is worse than saying it was not found.
                <Prose tone="warn">
                  This phone will not say which address it is on. The table is still served — look the address up in
                  Wi-Fi settings, or use Hotspot above, where there is nothing to read out at all.
                </Prose>
              ) : null}
            </Appear>
          ) : null}

          {needsAddress ? (
            <Appear style={{ marginTop: 18 }} onLayout={form.track('address')}>
              <NameField
                // A guest is not necessarily dialling a relay at all: the other
                // phone may be serving the table itself, in which case this is
                // the address that phone is showing. Calling it the relay
                // address sent players to the wrong machine entirely.
                label={
                  role === 'host'
                    ? `RELAY ADDRESS · PORT ${DEFAULT_PORT}`
                    : `WHERE THE TABLE IS · PORT ${DEFAULT_PORT}`
                }
                value={address}
                onChangeText={setAddress}
                placeholder="192.168.1.20"
                onFocus={form.focus('address')}
                // An address is longer than a name, has no capitals in it, and is
                // mostly digits and dots.
                maxLength={31}
                autoCapitalize="none"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
              />
              <Prose tone="quiet" style={{ marginTop: 8 }}>
                {role === 'host'
                  ? 'The computer you ran `npm start` on is already running the relay, and its address is filled in above if this phone could work it out. Both phones use the same one.'
                  : 'If the other phone is serving the table itself, this is the address on its screen — read it out and type it here. If a computer is relaying instead, it is that computer, and it is already filled in.'}
              </Prose>
              {role === 'host' ? (
                <Prose tone="warn" style={{ marginTop: 10 }}>
                  This copy cannot open a port, so a computer has to sit in the middle — normal in Expo Go, which is not
                  allowed one. A build that can open one hosts the table on this phone, with no computer at all.
                </Prose>
              ) : null}
            </Appear>
          ) : null}

          <View style={{ flex: 1, minHeight: 18 }} />

          <BigButton
            label={busy ? 'ONE MOMENT…' : role === 'host' ? 'OPEN THE TABLE' : 'JOIN THE TABLE'}
            fontSize={24}
            onPress={go}
            style={{ marginTop: 18, opacity: ready ? 1 : 0.45 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
