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

It has zero dependencies, keeps nothing after a room empties, and is about 250 lines
(`server/relay.js`). The address field in the app is pre-filled with your Metro host,
which is usually the same machine — so most of the time neither player types anything
but the code.

In a **development build** that includes `react-native-tcp-socket`, the host phone serves
the room itself and the relay is not needed at all — two phones, no computer, no internet.
The app detects this and switches automatically; the lobby says which mode you got.

### Bluetooth

Bluetooth needs native BLE, which Expo Go does not ship, so the app says so plainly and
points you at Wi-Fi. In a development build:

- **Joining** works with [`react-native-ble-plx`](https://github.com/dotintent/react-native-ble-plx)
  — the phone scans for `ECARD-<code>` and connects.
- **Hosting** additionally needs a peripheral-capable module, because ble-plx has no
  peripheral mode. Register one at startup:

  ```ts
  import { registerBlePeripheral } from './src/net/ble/bridge';
  registerBlePeripheral(() => myPeripheralAdapter); // see the BlePeripheral type
  ```

Messages are chunked to fit a GATT characteristic and reassembled on the far side
(`src/net/ble/chunks.ts`, covered by the self-test).

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
bluetooth.ts   BLE transport over the bridge below
ble/           bridge.ts (the native surface it needs), chunks.ts (GATT-sized framing)
ws/            frames.ts (RFC 6455 codec), hostServer.ts, tcpHost.ts
```

Pass & play uses `router.replace`, so the previous screen is **unmounted** — the hidden
hand does not exist in the tree while the handoff cover is up. Online there is no shared
screen to hide: the other hand was never sent.

## Rules encoded

Emperor › Citizen › Slave › Emperor. Citizen vs Citizen is a draw and the game continues.
12 games, sides swap every 3. Emperor-side win pays 1×, Slave-side win pays 5×, capped at
the loser's bankroll. Stakes are set each game by whoever holds the Slave side.

Portrait-locked, dark, 44 px minimum touch targets.

See `DESIGN-PARITY.md` for the handful of CSS effects that have no literal React Native
equivalent and what each one became.
