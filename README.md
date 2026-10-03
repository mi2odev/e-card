# E-Card

Two-player bluffing card game. Play it pass & play on one phone, or on **two phones**
over Wi-Fi — including a Wi-Fi one of the phones makes itself. Expo SDK 54 · TypeScript · expo-router · Reanimated · zustand.

## Run it

```bash
npm install
npx expo install --fix     # pins every package to the exact SDK 54 version
npm start                  # Metro, and the Wi-Fi relay two phones in Expo Go meet at
```

Then scan the QR with **Expo Go** (iOS or Android), or press `a` / `i` for an emulator.
If the bundler ever caches something stale: `npm run start:clear`. Plain `npx expo start`
works too, but without the relay — fine for pass & play, not for two phones in Expo Go.

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
the other enters it and presses join. **That is all either of them types** — the joining
phone searches the Wi-Fi for the table by itself (see **Finding the table** below). Each
phone holds its own hand — there is no passing and no handoff screen.

The host device owns the match: it shuffles, resolves every turn and moves the money.
It sends the other phone a **redacted** view of the table, so the opponent's hand and
their face-down card are never on the wire at all — not merely hidden in the UI.

### If a phone drops out

A link that dies is not the end of the match. Wi-Fi hiccups, a screen locking, a phone
carried out of the room, a tap on the wrong thing — all of it is recoverable, because the
host still holds the whole match and hands the board back to whoever returns.

- **The screen stays on.** From the moment a table opens, or a pass & play match is dealt,
  until you leave it, the phone does not lock (`expo-keep-awake`). A locked phone was the
  commonest way a link dropped; not locking beats reconnecting.
- **The link is dialled again on its own.** A banner says so — amber while it is trying,
  rust once it has given up — and tapping it starts over. Fourteen attempts, the first
  inside a second and the last fifteen seconds apart, about two minutes in all. The lobby
  gets a **TRY AGAIN** button for the same thing.
- **Silence is noticed.** The two phones ping each other every four seconds; twelve seconds
  without a word and the seat is shown as empty — which is the only way to spot a phone
  that fell off the Wi-Fi without its socket ever closing. The pipe is kept and kept
  probing, so a phone that was merely asleep is back on its first answer, and one whose
  socket really is dead gets the redial above when the transport admits it.
- **Coming back to the app dials at once.** Timers do not run while an app is in the
  background, so returning to the foreground pokes the link rather than waiting out a
  backoff that never counted down.
- **The seat is held.** A phone that comes back on a new socket takes its own seat off the
  stale one — in the relay and on a phone-hosted table both — and the player still sitting
  there is never told their opponent left.
- **Leaving is not final.** Walk away on purpose and the table is parked: the title screen
  and **TWO PHONES** both offer **TAKE YOUR SEAT AGAIN**, with the round it was on. The host
  re-opens the same code with the board exactly as it stood; a guest is simply sent it.

What this does not do is survive the app being **closed** — nothing is written to disk, so
the parked table is gone with the process. A guest can still rejoin by typing the code
again, because the host is holding the table; but if the *host's* app is killed, the match
it was keeping goes with it.

### Finding the table

The joining phone is never asked where the table is. It goes looking, with the code:

1. the address typed in, if the player opened **TYPE AN ADDRESS** and gave one — or, in
   Expo Go, the computer the app was loaded from, which is where the relay runs;
2. the gateway a phone sharing a hotspot sits at, and the addresses iOS, Android and
   Windows hand out by convention;
3. every other address on its own network, outwards from its own — home routers hand
   addresses out in order, so the other phone is usually a few numbers away.

Forty are dialled at a time, and an address with nothing behind it gets under two
seconds before its place goes to the next, so a whole home network takes seconds, not
minutes. The lobby shows how far it has got. Whatever answers with the right code is the
table: a phone serving one turns away a wrong code during the handshake, and the relay is
asked to answer a search only when somebody is actually hosting that code — otherwise the
search would stop at the first empty relay room it met. It keeps looking for about three
quarters of a minute, because the other player is usually a few seconds behind; once
found, a dropped link is dialled straight back at that address.

An address can be typed the way the other phone shows it — `192.168.1.31:8787`, or
`http://192.168.1.31:8787/` off a browser bar. The port is read off it rather than added a
second time, commas count as dots, and anything that cannot be dialled is said once,
before anything is dialled.

**A wrong address never closes the app.** On Android a WebSocket's URL goes straight to
OkHttp on a native thread, and OkHttp throws on one it cannot parse — two ports, a comma, a
space — where nothing in JavaScript can catch it, so the app simply quit. Every address is
now read properly first, and every socket goes through one check (`dialable` in
`src/net/wifi.ts`) that refuses anything the native layer could choke on. The self-test
opens every socket through a stand-in as strict as OkHttp and fails if any of them would
have closed the app.

### Wi-Fi

Both phones must be on the same network. Nothing leaves it and no internet is needed.

Inside **Expo Go** an app cannot open a listening port, so the two phones meet at a tiny
relay on a computer on the same Wi-Fi. **`npm start` runs it for you**, beside Metro, on
the machine the phones are already loading the app from — its lines are the dim ones
marked `relay │`. Nothing to start, and nothing to type: the host's app pre-fills that
machine's address, and the guest finds it by itself.

```bash
npm start            # Metro and the relay together
npm run relay        # or the relay on its own, on some other machine
```

**Whoever presses first waits.** A dial that lands nowhere is tried again for
half a minute or so, on both sides and in every mode — the usual reason nothing
answers is that the other player is a few seconds behind, not that anything is
wrong. The address it could not reach stays on screen while it tries, so a real
typo is no harder to spot, and the lobby has a **TRY AGAIN** button for a longer
wait than that.

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
(`server/relay.js`). The host's address field is pre-filled with your Metro host, which is
the same machine, and the guest searches for it — so neither player types anything but
the code.

In any build that is not Expo Go, `react-native-tcp-socket` is live and the host phone
serves the room itself — the relay is not needed at all. See **Building it as a real app**
above. The app detects this and switches automatically; the lobby says which mode you got.

**When a phone is serving, the guest still types nothing** — it finds that phone on the
Wi-Fi the same way. The phone that opened the table shows its own address in large type
anyway, and the lobby keeps showing it, for a network the search cannot cover (one that
is not a /24, say); typed into **TYPE AN ADDRESS** on the other phone, it is the first
place looked. A host that could not read its own address off the Wi-Fi when the screen
first asked goes back and asks again.

**A seat only goes to a phone with the code.** Opening the host's address in a browser to
check it can be reached, or another phone's search dialling past, does not unseat the
player at the table — only a socket that has passed the handshake with the right code
takes the seat, which is how the same phone gets it back after a drop.

### Hotspot — no router, no network to join

**TWO PHONES → HOTSPOT.** One phone shares its connection, the other joins that
network, and the table is served over it. No router, no computer, no relay — and nothing
to type but the four-character code.

1. Phone A turns on **Personal Hotspot** (iPhone) or **Mobile Hotspot** (Android).
2. Phone B joins that network in Wi-Fi settings. If it asks about staying connected
   without internet, say yes.
3. Phone A: **OPEN → HOTSPOT**, and reads out the code.
4. Phone B: **JOIN → HOTSPOT**, types the code, and presses join.

The order does not matter. Whoever presses first waits at the table and the other one is
found when they arrive — the guest keeps looking for about three quarters of a minute, and
says so while it does.

**The phone sharing the hotspot is the one that opens the table** — and it needs a build
that can open a port, which Expo Go is not. The phone joining can stay on Expo Go.

If a phone says it **cannot open a port**, that is the whole of what the app knows: normal
in Expo Go, and in a downloaded app it means the build went out without the native part
that does it. It is never reported as a port already in use — that is said in those words
instead, and is usually the table this same phone opened a minute ago.

There is no address field because neither phone could fill one in. A phone that is *sharing*
a hotspot cannot read its own address off that interface: both platforms report the Wi-Fi
address of a network you have **joined**, which is exactly the interface a hotspot host is
not using. So the guest works it out instead. It takes its own address (`172.20.10.4`,
say) and dials the gateway of that network (`172.20.10.1`) and the addresses iOS, Android
and Windows hand out by convention — and then **every other address on the network**.

The sweep is not a fallback; on most Androids it is the only thing that works. Since
Android 11 a phone sharing a hotspot picks a random network *and a random address on it*
(`192.168.85.137`, say), steering clear of `.1` on purpose, and nothing an app can read
without native code says which. An iPhone is always at `172.20.10.1`, which is dialled
first. A table turns away the wrong room code during the handshake, so anything that
answers *is* the table; the whole network takes about twelve seconds to walk. A phone that
has only just joined the hotspot may not know its own address for a second or two, so the
list is worked out afresh on every pass rather than once.

If nothing answers in the end, the app names every address it tried. Usually the phones are
not actually on the same hotspot. Two Android quirks are worth knowing:

- **Turn off mobile data on the joining phone if the hotspot has no internet.** Android
  keeps mobile data as the way out when the Wi-Fi it joined cannot reach the internet, and
  sends the game that way too — to a network the other phone is not on. The joining screen
  says so. (If the sharing phone has mobile data on, its hotspot has internet and this
  never comes up.)
- Some Androids will not turn a hotspot on without mobile data, even though the game needs
  none of it.

If the sharing phone says it **could not open the port**, that is not Expo Go talking — a
build that cannot serve at all says so in those words instead. It means something already
has port 8787, almost always the table this same phone opened a minute ago; leave the table
properly, give it a moment, and open it again.

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
2. Phone A: **TWO PHONES → OPEN**. It shows a four-character code (and its own address,
   `192.168.1.31:8787`, in case it is ever needed).
3. Phone B: **TWO PHONES → JOIN**. Enter the code and press join; it finds phone A.
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

If the host phone can serve but cannot open the port this time — usually the table it
opened a moment ago, still letting go — it says so and tries again on its own. It does
not fall back to a relay: the only address it has is its own, and dialling that for a
relay only ever reported that none was there.

`npx expo-doctor` reports `react-native-tcp-socket` as *untested on New Architecture*. It
is a legacy `ReactContextBaseJavaModule`, which the New Architecture interop layer handles;
"untested" means nobody has filed a report with React Native Directory, not that it is
known to fail. It is listed under `expo.doctor.reactNativeDirectoryCheck.exclude` so the
check passes. If a build ever does trip over it, that exclusion is the first thing to
revisit.

## Your artwork

Drop replacements straight over these files — same names, same paths, no code change:

```
assets/cards/emperor.png     assets/cards/citizen.png
assets/cards/slave.png       assets/cards/card-back.png
assets/seals/seal-emperor.png  assets/seals/seal-slave.png
assets/credits/author.png    ← the picture on the credits
assets/icon.png  assets/adaptive-icon.png  assets/splash.png
```

Card art is drawn at a 3:4 aspect ratio (`resizeMode: cover`) — 900×1200 px is plenty.

`assets/credits/author.png` is whatever you want next to your name: it fills a gold ring at
the head of the credits sheet and a small one on the button that opens it. Both are round
and crop to fill from the centre, so a square picture lands exactly as drawn — anything else
keeps its middle and loses its edges.

## Layout

```
app/                 one file per screen, expo-router
  _layout.tsx        fonts + stack, the phase router and the dropped-link banner
  index.tsx          Title
  setup.tsx          The table is set — pass & play terms
  online.tsx         Two phones — open or join a table, on a network or a hotspot
  lobby.tsx          Table code, seats, and the host's terms
  scoreboard.tsx     Game n of twelve + the wager
  handoff.tsx        Pass the device (pass & play only)
  select.tsx         Hand fan + confirm
  reveal.tsx         Flip, verdict, payout
  end.tsx            Match over
src/game/logic.ts    pure rules and money maths (no React)
src/store/useGame.ts zustand match state + actions
src/store/useNet.ts  connection state for the lobby, the banner and the offer to come back
src/net/             see below
src/ui/              kit.tsx (buttons, chips, keypad, rules modal), Terms.tsx, Cards.tsx, Radial.tsx,
                     Motion.tsx (radar, glint, sparks, confetti, dust — all off under reduced motion)
src/theme.ts         every colour and font token from the design
server/relay.js      zero-dependency LAN relay
scripts/dev.mjs      `npm start` — Metro and the relay together
scripts/selftest.ts  the checks behind `npm run selftest`
```

### `src/net/`

```
protocol.ts    message shapes, room codes, encode/decode
snapshot.ts    per-recipient redaction — the guarantee that a hand stays secret
session.ts     host authority: broadcast snapshots, apply guest intents, and get a dropped link back
actions.ts     what screens call; host acts, guest asks
link.ts        the Link / TransportDriver interfaces
wifi.ts        direct-host, relay, or a table on one phone's hotspot — all plain WebSocket
discover.ts    reading a typed address, and every address the other phone could be at
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

**A round runs until a card decides it** — five plays at the outside, which is every card
in hand. It ends the instant a special card wins or loses; drawn Citizens are discarded and
the round carries on.

Play all the way down and the last two cards are the Emperor and the Slave, which the Slave
takes at 5×. That is the whole game: the Emperor side cannot sit on Citizens and wait, it
has to put the Emperor down on a play where the Slave side has not — and the Slave side
spends the round guessing when that will be. A round with no winner is therefore not
reachable from a dealt hand; the rules still say what one would be, so a round always ends.

**The sides do not place together.** One lays its card face down first and the other
answers, then both are flipped. Round 1 opens with the Emperor side; the opener alternates
on every play within a round, and again at the top of each round — so round 1 goes
E, S, E, S, E and round 2 goes S, E, S, E, S.

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

## Made by

Designed and coded by **Mohamed Mehdi Zitouni**. The same links are in the app, under
**CREDITS** on the title screen.

- Portfolio — https://mohamedmehdi-zitouni.netlify.app/
- GitHub — https://github.com/mi2odev/
- Instagram — https://www.instagram.com/_.mi2o/
- LinkedIn — https://www.linkedin.com/in/mohamed-mehdi-zitouni-a84423418/

E-Card is the game from *Kaiji*, by Nobuyuki Fukumoto. This app is a fan-made adaptation of
it and is not affiliated with the rights holders.
