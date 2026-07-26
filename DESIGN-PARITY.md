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
2. **KeyboardAvoidingView** on Title and Setup so the name fields aren't covered by the keyboard — the browser mock had no keyboard.
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

The three `data-props` tweaks from the design live in `src/store/useGame.ts` under
`settings`: `revealDrama` (1.4 s), `startingBankroll` (100), `matchupHints` (true).
There is no UI for them, same as the design — change the defaults or wire a debug menu.

## Haptics (expo-haptics)

Selection tick on card raise / stake buttons, medium on commit and I'M READY, heavy on the
flip, success on an Emperor-side win, error on the 5× Slave upset, warning on a draw.
