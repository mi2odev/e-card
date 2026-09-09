# Design → React Native parity

Everything not listed below is a literal port: same hex values, same px, same letter
spacing, same durations and easing curves, same copy.

## Effects with no literal RN equivalent

| Design (CSS) | React Native | Difference |
|---|---|---|
| `background-clip: text` gold gradient on **E-CARD**, **GAME n**, match-over title | `@react-native-masked-view/masked-view` + `expo-linear-gradient`, same stops/locations | None visually. If masked-view is ever unavailable the text falls back to solid `#d4a53c` |
| `radial-gradient()` — table felt, seal glows, monograms, reveal bloom, card-back base | `react-native-svg` `<RadialGradient>` with identical stops | None. RN has no radial gradient at all, so SVG is the only faithful route |
| `filter: blur(14px / 24px / 30px)` on the glows | Softer radial falloff instead | Edges are marginally crisper than a Gaussian blur. RN cannot blur an arbitrary view; matching it exactly would need a blurred PNG per glow — say the word if you want that |
| `backdrop-filter: blur(7px)` behind the rules sheet | `expo-blur` `BlurView` (intensity 26, dark) over the same `rgba(3,5,4,.87)` scrim | None |
| Card back: layered `inset` box-shadows + two `repeating-linear-gradient` hatches | Baked into `assets/cards/card-back.png`, generated from the same values (600×800) | None at display size, and it is the `card-back.png` you asked to be able to replace |
| `@keyframes ecPulse` (animated `box-shadow` ring) | A real ring view scaling 1 → 1.06 and fading 0.4 → 0, same 2.4 s loop | Reads the same; the ring is a border rather than a shadow spread |
| `filter: grayscale(1) brightness(.5)` on discarded citizens | RN 0.81 CSS `filter`, with `opacity: 0.6` underneath as the fallback | Identical where filters are supported; a dim colour thumbnail if not |
| `filter: brightness(.94)` on button press | 6 % black overlay + the design's 1 px `translateY` | Imperceptible |
| `backface-visibility: hidden` for the flip | `perspective: 1100` + `rotateY` exactly as designed, but faces swap by opacity at 90° | Same motion; opacity swapping is the reliable way to get a true two-sided flip on Android |
| `:hover` states | Dropped, press states kept | Touch device |

## Deliberate additions for a real device

1. **Safe-area insets** are added on top of the design's paddings (notch, home bar). At 430×900 with no insets the layout is pixel-identical to the design.
2. **The keyboard**, which the browser mock did not have. `KeyboardAvoidingView` handles iOS;
   Android with edge-to-edge does not reliably shrink the window, so the screens make their
   own room: Title folds the card cluster and the wordmark away while a name is being typed
   (leaving a small E-CARD in their place) and unfolds them when the keyboard goes, and Setup
   and Two Phones pad the scroll by the keyboard's height and lift the focused field to the
   top of the screen. Player 1's return key hands the keyboard to Player 2.
3. **Full-bleed width** instead of the mock's `min(100vw, 430px)` frame. Every internal padding, font size and card size is unchanged, so wider phones stretch exactly as the design did.
4. `overflow-y: auto` → `ScrollView`; `100dvh` → `flex: 1`.
5. `min(52vw, 172px)` seal → `useWindowDimensions()` equivalent.
6. Fonts (Bebas Neue, Barlow 400/500/600/700 + italic) are bundled via `@expo-google-fonts`, so they work with no network.
7. The `?` glyph uses Georgia on iOS and the platform serif on Android (Georgia isn't guaranteed there).

## Timing, kept exactly

- Reveal: cards in at 140 ms → flip at 140 ms + 1400 ms (`revealDrama`) → verdict line +1250 ms → banner +2050 ms. Tap anywhere in the card zone to skip to the end state.
- Card raise 260 ms `cubic-bezier(.2,.8,.3,1.18)`; flip 950 ms `cubic-bezier(.3,.75,.2,1)`; entrance 500/550 ms `cubic-bezier(.2,.8,.3,1)`; stakes toggle 250 ms; breathe 3.6 s (handoff) and 2.4 s (reveal).
- Second tap on a raised card commits it, with the same 350 ms guard against a double-fire.

## Designer knobs

The `data-props` tweaks from the design live in `src/store/useGame.ts` under `settings`:
`revealDrama` (1.4 s), `startingBankroll` (100), `minStake` (0), `matchupHints` (true).

`startingBankroll` and `minStake` now have UI — the stakes panel on **The table is set**
(and in the online lobby) — because players asked to choose what they are playing for.
`revealDrama` and `matchupHints` still have none, same as the design.

## Haptics (expo-haptics)

Selection tick on card raise / stake buttons, medium on commit and I'M READY, heavy on the
flip, success on an Emperor-side win, error on the 5× Slave upset, warning on a draw.

## Additions beyond the original design

The design covered one phone. Two later features have no mock to be faithful to, so they
follow its vocabulary rather than a spec:

| Feature | Where | Notes |
|---|---|---|
| Stakes panel — purse presets, table minimum, keypad | `src/ui/Terms.tsx` | Same chip and panel language as the side picker; `AmountPad` is a new bottom sheet in the rules-modal idiom (`#0c130e`, gold hairline, `expo-blur` scrim) |
| Wager controls — scaling ±, MIN/HALF/DOUBLE/¼/ALL IN, live 1× and 5× read-out | `app/scoreboard.tsx` | Replaces the design's fixed −5/+5/+25/ALL IN row. The gold numeral, its size and position are unchanged |
| Two-phones lobby | `app/online.tsx`, `app/lobby.tsx` | The table code uses the `GAME n` gold gradient at 62 px; seats reuse the scoreboard row |
| Credits | `src/ui/Credits.tsx` | The rules-sheet panel, a gold monogram seal, and four round icon buttons (`@expo/vector-icons`, FontAwesome imported by its own path so only that one font is bundled) |

## Motion the design did not specify

The mock was a set of states, not a film: every transition it *did* pin down is kept
exactly (see **Timing, kept exactly**). These are the places it said nothing, where a cut
read as a glitch — each one is a fade or a slide in the same easing vocabulary
(`ease-out`, 190–420 ms), and none of them delays a tap.

| Motion | Where | Why |
|---|---|---|
| The hand is dealt in, 55 ms apart, sliding up into the fan | `src/ui/Cards.tsx` `FanCard` | Five cards appearing at once read as a screenshot; dealt, they read as a hand |
| Purses count from what they were before the round to what they are now (900 ms, ease-out cubic) | `app/scoreboard.tsx`, `useCountUp` in `kit.tsx` | The money moving *is* the game. The reveal announces the payout; the scoreboard shows it happen |
| Segmented options cross-fade between chosen and not, label colour included | `src/ui/kit.tsx` `Segment` | Two simultaneous blinks read as a flicker; one light coming up reads as a choice |
| Seats fade in as somebody sits down, the ✓ scaling over the … | `app/lobby.tsx` | The arrival of the other player is the one thing that lobby is for |
| The table code breathes (1 → 1.03, 3.2 s) while the seat opposite is empty, and settles when it fills | `app/lobby.tsx`, `useWaitingPulse` | Says "still waiting" without a spinner |
| Panels, waiting states and the offer of a seat you left lift in 8–12 px | `Appear` in `kit.tsx` | Used where something *arrives*: `Fade` remains for things that toggle |
| The dropped-link banner drops in, and breathes while it is still dialling | `app/_layout.tsx` | Amber and moving means the app is working on it; rust and still means it wants a tap |
| A field's border warms to gold over 180 ms when it takes focus | `NameField` in `kit.tsx` | The design specified the two colours; the change between them was a jump |
| The title's hero folds away while a name is being typed | `app/index.tsx` | See **Deliberate additions** above: it is a keyboard fix that happens to be the nicest one to look at |
| The title deals itself in — three cards land in turn, then the wordmark, then the terms and the buttons | `app/index.tsx` | The app's opening shot. One timeline sliced into overlapping phases, 1.15 s end to end |
| Touching a title card lifts it off the pile and drops it back, nudging the other two | `app/index.tsx` | Cards you can pick up read as a deck rather than a picture. The cluster carries 20 px of headroom so the fold-away box cannot clip the lift, taken back off the wordmark's margin so nothing else moves |
| At the reveal, the winning card lifts and brightens and the losing one sinks and dims | `app/reveal.tsx` | The verdict was only ever in the banner underneath; now it lands on the cards. Runs on the existing `rev` steps, so the design's timings are untouched |
| Discarded pairs cascade in, 70 ms apart | `app/select.tsx` | They accumulate as a round goes on, and arriving says so |
| The wager bumps when it is moved | `app/scoreboard.tsx` | The number is the whole panel; it should answer a tap |
| Dropped-link banner | `app/_layout.tsx` | One rust line above everything, only when the link is actually broken |
| Confirm before abandoning | `src/ui/ExitGuard.tsx` | The design had no back button to guard. Same sheet as the rules modal; the safe choice is the gold button and the scrim, abandoning is the quiet rust outline. Replaces the scoreboard's old two-tap arm, which was too easy to trigger twice |

Online play changes two things about the flow itself:

1. **No handoff screen.** Each phone holds its own hand, so both players choose at the
   same time; the pass & play sequence (Emperor picks, then Slave) is untouched.
2. **The Slave side deals.** They are the one naming the wager, so the deal button is
   theirs; the other phone shows what it is waiting for.

## Rule corrections against the anime

The first cut of the rules engine had the Emperor side always placing first, which is not
E-Card as played in *Kaiji*. A later cut also capped a round at three plays; that has been
taken back out, because playing every card is the point (see **Rules encoded** in the
README). `npm run selftest` covers all of it:

| Rule | Was | Now |
|---|---|---|
| Round length | Capped at three plays, a round that drew three times going to nobody | **Until a card decides it — five plays, every card in hand** (`PLAYS_PER_GAME`) |
| Stalling | Sitting on Citizens was safe for either side once the cap ran out | The fifth play is always Emperor against Slave, so the Slave side takes a stalled round at 5× — the Emperor side has to strike first |
| Placing order | Emperor side placed first on every play | `firstPlacer(round, play)` — the Emperor side opens round 1, and the opener alternates on every play and again at each new round |
| Order enforcement | None — online, both phones played at once | `picker` is authoritative in both modes; a card from the other side is refused, and the far phone shows *"…side places first"* until its turn |
| Vocabulary | "game", "turn" | "round", "play n of 5", matching the source |

Unchanged, because they were already right: the hands (1 special + 4 Citizens, redealt
each round), the matchups and the Citizen-vs-Citizen discard, 12 rounds in 4 sets of 3
with the sides swapping between sets, and the 1× / 5× payouts capped at the loser's purse.
