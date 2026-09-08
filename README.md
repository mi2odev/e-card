# E-Card

Two-player bluffing card game. Play it pass & play on one phone, or on **two phones**
over Wi-Fi. Expo SDK 54 · TypeScript · expo-router · Reanimated · zustand.

## Run it

```bash
npm install
npx expo install --fix     # pins every package to the exact SDK 54 version
npx expo start
```

Then scan the QR with **Expo Go** (iOS or Android), or press `a` / `i` for an emulator.
If the bundler ever caches something stale: `npx expo start -c`.

```bash
npm run typecheck   # tsc --noEmit
npm run selftest    # rules, money, wire codecs and a whole online match — no phone needed
```

## Playing for money

Stakes are set up front on **The table is set** (or in the online lobby, by the host):

- **Each player brings** — the starting purse. 50 / 100 / 250 / 500 / 1,000 / 5,000, or
  tap **OTHER…** and count out any amount from 10 to 1,000,000.
- **Table minimum** — a floor under every wager. Capped at half the purse, so a single
  loss can never leave someone unable to meet it; a player who cannot afford the floor
  simply pushes what they have left.

Then, before every game, the Slave side names the wager on the scoreboard:

- **±** buttons that scale with the purse (5 at a 100-point table, 100 at a 5,000-point one)
- **MIN · HALF · DOUBLE · ¼ PURSE · ALL IN**
- tap the number itself to **count it out on a keypad**
- a live read-out of what an Emperor win (1×) and a Slave win (5×) would actually collect,
  already capped at the loser's remaining purse

## Two phones

**Title → TWO PHONES.** One player opens a table and reads out a four-character code;
the other joins with it. Each phone holds its own hand — there is no passing and no
handoff screen, and both players choose their card at the same time.

The host device owns the match: it shuffles, resolves every turn and moves the money.
It sends the other phone a **redacted** view of the table, so the opponent's hand and
their face-down card are never on the wire at all — not merely hidden in the UI.

### Wi-Fi

Both phones must be on the same network. Nothing leaves it and no internet is needed.

Inside **Expo Go** an app cannot open a listening port, so the two phones meet at a tiny
relay you run on any computer on the same Wi-Fi:

```bash
npm run relay        # prints the address to type into both phones
```

**If a phone says it cannot reach the relay,** open that same address in the phone's
browser (`http://192.168.1.20:8787`). The relay answers plain browser visits with a page
saying it is running, so:

- **page loads** → the network is fine; check the code matches on both phones
- **page does not load** → the phone cannot see that machine at all. Usual causes, in
  order: the relay is not running; the computer's firewall is blocking Node on port 8787
  (on Windows, allow it on *private* networks); the phones are on a guest network or one
  with client isolation; or the printed address belongs to a virtual adapter (VirtualBox,
  WSL, a VPN) rather than the real Wi-Fi one — the relay lists every address it found, so
  try another.

It has zero dependencies, keeps nothing after a room empties, and is about 250 lines
(`server/relay.js`). The address field in the app is pre-filled with your Metro host,
which is usually the same machine — so most of the time neither player types anything
but the code.

In any build that is not Expo Go, `react-native-tcp-socket` is live and the host phone
serves the room itself — the relay is not needed at all. See **Building it as a real app**
above. The app detects this and switches automatically; the lobby says which mode you got.

### Building it as a real app — one phone hosts, no computer

**This is the only way to host from a phone.** Expo Go is not allowed to open a listening
port, and no amount of app code changes that; inside it, a computer has to sit in the
middle. A built app bundles `react-native-tcp-socket`, so the host phone opens the port and
serves the table itself. Two phones on the same Wi-Fi, nothing else.

The app works out which mode it is in by asking the native bridge, not the JavaScript
package — the package loads fine in Expo Go with nothing behind it — so the lobby never
offers a hosting mode that cannot work.

```bash
npm install -g eas-cli
eas login
eas build:configure                              # once, if you have no eas.json
eas build --platform android --profile preview   # an APK you can sideload
```

`preview` builds for internal distribution, which on Android means a plain APK you can
download onto both phones from the link EAS gives you. Add `"android": { "buildType":
"apk" }` to that profile if you get an `.aab` instead.

Install the APK on both phones. Then:

1. Both phones join the **same Wi-Fi**.
2. Phone A: **TWO PHONES → OPEN**. It shows its own address (`192.168.1.31:8787`) and a
   four-character code.
3. Phone B: **TWO PHONES → JOIN**. Type phone A's address and the code.
4. Phone A presses **BEGIN THE MATCH**.

Only the **host** needs the built app. A phone still running Expo Go can join it — a
guest is just a WebSocket client — which makes one build enough to try this out.

If the two phones cannot see each other, open the host's address in the other phone's
browser (`http://192.168.1.31:8787`). The host answers plain browser visits with a page
showing the code to join with. If that page does not load, the phones cannot reach each
other at all: usually the router has client isolation switched on (common on guest and
public networks), or they are on different networks — a phone quietly on mobile data, say.

For iOS you need an Apple Developer account (`eas build --platform ios`), or run
`--profile development` and install through Xcode. The first launch on iOS asks for local
network permission — say yes, or the phones cannot see each other.

Three pieces of platform config make this work, and are already in `app.json`:

| Setting | Why |
|---|---|
| `usesCleartextTraffic: true` (via `expo-build-properties`) | Android 9+ blocks non-TLS traffic in release builds, which would kill `ws://` to a phone on the LAN |
| `NSAllowsLocalNetworking: true` | The same problem on iOS — App Transport Security, scoped here to local addresses only |
| `NSLocalNetworkUsageDescription` | iOS 14+ refuses local network access without a reason string to show the user |
| `NSBluetoothAlwaysUsageDescription`, `NSBonjourServices` (via the `expo-nearby-connections` plugin) | MultipeerConnectivity needs both before iOS will let it advertise |

If the host phone cannot open the port for any reason, it falls back to the relay below
rather than failing, and the lobby says which mode you got.

`npx expo-doctor` reports `react-native-tcp-socket` as *untested on New Architecture*. It
is a legacy `ReactContextBaseJavaModule`, which the New Architecture interop layer handles;
"untested" means nobody has filed a report with React Native Directory, not that it is
known to fail. It is listed under `expo.doctor.reactNativeDirectoryCheck.exclude` so the
check passes. If a build ever does trip over it, that exclusion is the first thing to
revisit.

### Bluetooth — two phones, no network at all

No Wi-Fi to join, no router, no relay. Built on `expo-nearby-connections`, which is Google
Nearby Connections on Android and Apple's MultipeerConnectivity on iOS; both negotiate
their own link between the handsets (Bluetooth, BLE, or a direct Wi-Fi leg), so nothing
has to exist around them.

1. Both phones have the **built app** — Expo Go carries no native code, so it offers Wi-Fi
   instead and says why.
2. Phone A: **TWO PHONES → OPEN → BLUETOOTH**. It advertises as `ECARD-<code>`.
3. Phone B: **TWO PHONES → JOIN → BLUETOOTH**, and enter that code.

There is no address to type — the four-character code is the whole of the pairing.

**Android pairs with Android, iOS with iOS.** The two underlying frameworks are not
interoperable, and this does not paper over that.

Android asks for nearby-device permission the first time (scan, advertise, connect, and
location, which Android still ties to Bluetooth scanning). Refuse it and the lobby says so
rather than failing quietly. iOS prompts on its own, using the strings the config plugin
writes into `Info.plist`.

## Your artwork

Drop replacements straight over these files — same names, same paths, no code change:

```
assets/cards/emperor.png     assets/cards/citizen.png
assets/cards/slave.png       assets/cards/card-back.png
assets/seals/seal-emperor.png  assets/seals/seal-slave.png
assets/icon.png  assets/adaptive-icon.png  assets/splash.png
```

Card art is drawn at a 3:4 aspect ratio (`resizeMode: cover`) — 900×1200 px is plenty.

## Layout

```
app/                 one file per screen, expo-router
  _layout.tsx        fonts + stack, the phase router and the dropped-link banner
  index.tsx          Title
  setup.tsx          The table is set — pass & play terms
  online.tsx         Two phones — host or join, Wi-Fi or Bluetooth
  lobby.tsx          Table code, seats, and the host's terms
  scoreboard.tsx     Game n of twelve + the wager
  handoff.tsx        Pass the device (pass & play only)
  select.tsx         Hand fan + confirm
  reveal.tsx         Flip, verdict, payout
  end.tsx            Match over
src/game/logic.ts    pure rules and money maths (no React)
src/store/useGame.ts zustand match state + actions
src/store/useNet.ts  connection state for the lobby and the banner
src/net/             see below
src/ui/              kit.tsx (buttons, chips, keypad, rules modal), Terms.tsx, Cards.tsx, Radial.tsx
src/theme.ts         every colour and font token from the design
server/relay.js      zero-dependency LAN relay
scripts/selftest.ts  the checks behind `npm run selftest`
```

### `src/net/`

```
protocol.ts    message shapes, room codes, encode/decode
snapshot.ts    per-recipient redaction — the guarantee that a hand stays secret
session.ts     host authority: broadcast snapshots, apply guest intents
actions.ts     what screens call; host acts, guest asks
link.ts        the Link / TransportDriver interfaces
wifi.ts        direct-host or relay, both plain WebSocket
bluetooth.ts   phone-to-phone over Nearby Connections / MultipeerConnectivity
ws/            frames.ts (RFC 6455 codec), hostServer.ts, tcpHost.ts
```

Pass & play uses `router.replace`, so the previous screen is **unmounted** — the hidden
hand does not exist in the tree while the handoff cover is up. Online there is no shared
screen to hide: the other hand was never sent.

Because every in-match screen replaces rather than pushes, backing out would otherwise
drop straight to the title and take the match with it. `src/ui/ExitGuard.tsx` is the one
way out: the Android back button, the scoreboard's **ABANDON MATCH** and the lobby's
**LEAVE THE TABLE** all raise the same confirmation, which says which round is on the
table and who is left sitting at it. On the final tally there is nothing left to lose, so
back just leaves — but it still closes any online session, or the phase router would bounce
you back to the tally.

## Rules encoded

E-Card as played in *Kaiji*.

**The cards.** Each side is dealt 5 fresh cards every round. Emperor side: 1 Emperor +
4 Citizens. Slave side: 1 Slave + 4 Citizens.

**The matchups.** Emperor › Citizen › Slave › Emperor. Citizen vs Citizen is a draw —
both cards are discarded and the round continues.

**A round is three plays at most.** It ends the instant a special card wins or loses. If
all three plays are drawn, the round is *spent*: neither side takes it and no money moves.
Two of the five cards are never revealed, which is the whole point — with 4 Citizens
against 3 plays, either side can sit on Citizens and give nothing away. (Were a round
played to exhaustion instead, its fifth play would always be Emperor against Slave, and
the Slave side could force its 5× win every round just by stalling.)

**The sides do not place together.** One lays its card face down first and the other
answers, then both are flipped. Round 1 opens with the Emperor side; the opener alternates
on every play within a round, and again at the top of each round — so round 1 goes
E, S, E and round 2 goes S, E, S.

**The match.** 12 rounds in 4 sets of 3. The sides swap between sets, so each player holds
each side for 6 rounds.

**The money.** An Emperor-side win collects 1× the wager; a Slave-side win collects 5×,
which is what compensates the Slave side for only ever beating one card. Either payout is
capped at what the loser actually has.

One deliberate departure: in the anime the wager is named each round by the challenger,
against a house that covers it. Between two equal players that has no obvious equivalent,
so here the Slave side — the one deciding how much to risk on their single chance — names
it. The purse and the table minimum are yours to set (see **Playing for money** above).

Portrait-locked, dark, 44 px minimum touch targets.

See `DESIGN-PARITY.md` for the handful of CSS effects that have no literal React Native
equivalent and what each one became.
