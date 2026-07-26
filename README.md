# E-Card — pass & play

Two-player bluffing card game, one device. Expo SDK 54 · TypeScript · expo-router · Reanimated · zustand. Fully offline.

## Run it

```bash
cd ecard-app
npm install
npx expo install --fix     # pins every package to the exact SDK 54 version
npx expo start
```

Then scan the QR with **Expo Go** (iOS or Android), or press `a` / `i` for an emulator.
If the bundler ever caches something stale: `npx expo start -c`.

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
  _layout.tsx        fonts + stack (fade, no gestures, no headers)
  index.tsx          Title
  setup.tsx          The table is set
  scoreboard.tsx     Game n of twelve + wager
  handoff.tsx        Pass the device
  select.tsx         Hand fan + confirm
  reveal.tsx         Flip, verdict, payout
  end.tsx            Match over
src/game/logic.ts    pure rules (no React) — side swaps, matchups, payouts
src/store/useGame.ts zustand match state + actions
src/ui/              kit.tsx (buttons, chips, rules modal), Cards.tsx, Radial.tsx
src/theme.ts         every colour and font token from the design
```

Screen transitions use `router.replace`, so the previous screen is **unmounted** — the
hidden hand does not exist in the tree while the handoff cover is up.

## Rules encoded

Emperor › Citizen › Slave › Emperor. Citizen vs Citizen is a draw and the game continues.
12 games, sides swap every 3. Emperor-side win pays 1×, Slave-side win pays 5×, capped at
the loser's bankroll. Stakes are set each game by whoever holds the Slave side.

Portrait-locked, dark, 44 px minimum touch targets.

See `DESIGN-PARITY.md` for the handful of CSS effects that have no literal React Native
equivalent and what each one became.
