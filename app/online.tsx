import React, { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../src/theme';
import { BigButton, CodeField, HelpButton, NameField, Segmented, StatusLine, shadow } from '../src/ui/kit';
import { TableBackground } from '../src/ui/Radial';
import { useGame } from '../src/store/useGame';
import { useNet } from '../src/store/useNet';
import { DRIVERS, forgetParkedTable, resumeSession, startSession } from '../src/net/session';
import { wifiHostsItself } from '../src/net/wifi';
import { defaultRelayAddress, localIpAddress } from '../src/net/discover';
import { DEFAULT_PORT, isCompleteRoomCode, makeRoomCode, normalizeRoomCode } from '../src/net/protocol';
import type { TransportKind } from '../src/net/link';
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
  const [kind, setKind] = useState<TransportKind>('wifi');
  const [code, setCode] = useState(() => makeRoomCode());
  const [address, setAddress] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ownIp, setOwnIp] = useState('');

  // Only the host invents a code; the guest types the one they were shown.
  const [hostCode] = useState(code);
  useEffect(() => {
    setCode(role === 'host' ? hostCode : '');
  }, [role, hostCode]);

  useEffect(() => {
    setAddress((a) => a || defaultRelayAddress());
    void localIpAddress().then(setOwnIp);
  }, []);

  useEffect(() => {
    let alive = true;
    void DRIVERS[kind].availability().then((a) => {
      if (alive) setReason(a.reason ?? '');
    });
    return () => {
      alive = false;
    };
  }, [kind]);

  const wifi = kind === 'wifi';
  // This build can serve the table from the phone itself — no computer needed,
  // and no relay address to type. The other phone dials this one directly.
  const directHost = wifi && role === 'host' && wifiHostsItself();
  const needsAddress = wifi && !directHost;
  const ready = useMemo(
    () => isCompleteRoomCode(code) && (!needsAddress || address.trim().length > 0) && !busy,
    [code, needsAddress, address, busy],
  );

  /** Take the seat that was left, on the same table, with the match as it stood. */
  const back = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await resumeSession();
      router.replace('/lobby');
    } catch (e) {
      setError(String((e as { message?: string })?.message ?? e).toUpperCase());
    } finally {
      setBusy(false);
    }
  };

  const go = async () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      await startSession({
        kind,
        role,
        code: normalizeRoomCode(code),
        // Hosting directly, the address is this phone's own — it is what the
        // other player types, so it has to travel with the session for display.
        address: directHost ? ownIp : address.trim(),
        port: DEFAULT_PORT,
        name: p1.trim() || (role === 'host' ? 'Host' : 'Challenger'),
      });
      router.replace('/lobby');
    } catch (e) {
      // Drivers report their own failures through the link status; this is for
      // the unexpected kind, so the button never just goes dead.
      setError(String((e as { message?: string })?.message ?? e).toUpperCase());
    } finally {
      setBusy(false);
    }
  };

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
            TWO PHONES
          </Text>
          <Text style={{ fontFamily: F.body, fontSize: 10, letterSpacing: 2.5, color: C.muted3, marginTop: 2 }}>
            EACH PLAYER KEEPS THEIR OWN HAND
          </Text>

          {resume ? (
            <View
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
                <Text style={{ fontFamily: F.body, fontSize: 9, letterSpacing: 1.4, color: C.muted7, lineHeight: 13 }}>
                  {resume.inMatch
                    ? `ROUND ${resume.game} OF 12 WAS STILL ON IT. IF THE OTHER PHONE IS STILL THERE, THE MATCH PICKS UP EXACTLY WHERE IT STOPPED.`
                    : 'THE SEAT IS STILL YOURS IF THE OTHER PHONE HAS NOT CLOSED THE TABLE.'}
                </Text>
              </View>
              <BigButton
                label={busy ? 'ONE MOMENT…' : 'TAKE YOUR SEAT AGAIN'}
                fontSize={19}
                onPress={() => void back()}
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
            </View>
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
            HOW THE PHONES TALK
          </Text>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'wifi', label: DRIVERS.wifi.label, caption: DRIVERS.wifi.blurb },
              { value: 'bluetooth', label: DRIVERS.bluetooth.label, caption: DRIVERS.bluetooth.blurb },
            ]}
          />
          {reason ? <StatusLine tone="rust" text={reason} style={{ marginTop: 10 }} /> : null}
          {error ? <StatusLine tone="rust" text={error} style={{ marginTop: 10 }} /> : null}

          <View style={{ marginTop: 22 }}>
            <NameField label="YOUR NAME" value={p1} onChangeText={setP1} placeholder="Enter a name" />
          </View>

          <Text style={{ fontFamily: F.semi, fontSize: 10, letterSpacing: 2, color: C.muted2, marginTop: 20, marginBottom: 8 }}>
            {role === 'host' ? 'YOUR TABLE CODE — READ IT OUT' : 'THE TABLE CODE'}
          </Text>
          <CodeField
            value={code}
            editable={role === 'guest'}
            onChangeText={(v) => setCode(normalizeRoomCode(v))}
          />

          {directHost ? (
            <View
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
                {ownIp ? `${ownIp}:${DEFAULT_PORT}` : 'FINDING THIS PHONE ON THE WI-FI…'}
              </Text>
              <Text style={{ fontFamily: F.body, fontSize: 9, letterSpacing: 1.2, color: C.muted7, lineHeight: 13 }}>
                NO COMPUTER NEEDED. THE OTHER PHONE ENTERS THIS ADDRESS AND THE CODE ABOVE, ON THE SAME WI-FI.
              </Text>
            </View>
          ) : null}

          {needsAddress ? (
            <View style={{ marginTop: 18 }}>
              <NameField
                label={`RELAY ADDRESS · PORT ${DEFAULT_PORT}`}
                value={address}
                onChangeText={setAddress}
                placeholder="192.168.1.20"
              />
              <Text style={{ fontFamily: F.body, fontSize: 9, letterSpacing: 1.2, color: C.muted7, marginTop: 8, lineHeight: 13 }}>
                RUN `npm run relay` ON A COMPUTER ON THIS WI-FI AND ENTER THE ADDRESS IT PRINTS. BOTH PHONES USE THE SAME ONE.
              </Text>
              {role === 'host' ? (
                <Text
                  style={{ fontFamily: F.bold, fontSize: 9, letterSpacing: 1.2, color: C.rustText, marginTop: 10, lineHeight: 13 }}
                >
                  THIS COPY RUNS INSIDE EXPO GO, WHICH IS NOT ALLOWED TO OPEN A PORT — SO A COMPUTER HAS TO SIT IN THE
                  MIDDLE. BUILD THE APP AND THIS PHONE HOSTS THE TABLE ITSELF, WITH NO COMPUTER AT ALL.
                </Text>
              ) : null}
            </View>
          ) : null}

          <View style={{ flex: 1, minHeight: 18 }} />

          <BigButton
            label={busy ? 'ONE MOMENT…' : role === 'host' ? 'OPEN THE TABLE' : 'JOIN THE TABLE'}
            fontSize={24}
            onPress={() => void go()}
            style={{ marginTop: 18, opacity: ready ? 1 : 0.45 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
