// Colour + type tokens lifted verbatim from the approved design.
export const C = {
  void: '#050505',
  handoffBg: '#070708',
  tableTop: '#134029',
  tableMid: '#0b2a1b',
  tableLow: '#061710',
  tableEdge: '#04100a',

  gold: '#d4a53c',
  goldLight: '#f6dd8a',
  goldMid: '#eec55e',
  goldDeep: '#93691c',
  goldBtnTop: '#eec55e',
  goldBtnBottom: '#bd9231',
  goldText: '#e9c86e',
  goldBright: '#f2cf6f',
  goldSoft: '#d8b559',

  cream: '#efe5c8',
  creamWarm: '#f0e4c0',
  creamPale: '#f4ead0',
  creamDim: '#e7dcbc',
  creamMute: '#cfc4a4',
  creamChip: '#cbbf9d',

  muted: '#a3966f',
  muted2: '#93875f',
  muted3: '#8f8568',
  muted4: '#8a8166',
  muted5: '#79704f',
  muted6: '#7d745e',
  muted7: '#6f684f',
  muted8: '#5e5741',
  placeholder: '#6b6551',

  rust: '#d96a3f',
  rustBtnTop: '#cf5a36',
  rustBtnBottom: '#9c3a22',
  rustPipTop: '#c25636',
  rustPipBottom: '#8e3220',
  rustText: '#e5906a',
  rustChip: '#dd9a72',

  inkOnGold: '#1c1305',
  inkOnPip: '#221604',
  creamOnRust: '#f7e9d4',
  creamOnRustBtn: '#f9ecd8',

  panel: 'rgba(0,0,0,0.32)',
  panelSoft: 'rgba(0,0,0,0.28)',
  field: 'rgba(0,0,0,0.38)',
  hairline: 'rgba(212,165,60,0.18)',
  hairlineSoft: 'rgba(212,165,60,0.12)',
  goldBorder: 'rgba(212,165,60,0.4)',
  goldBorderDim: 'rgba(212,165,60,0.3)',
  goldBorderFaint: 'rgba(212,165,60,0.25)',
  rustBorder: 'rgba(199,90,54,0.35)',
} as const;

export const F = {
  display: 'BebasNeue_400Regular',
  body: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  semi: 'Barlow_600SemiBold',
  bold: 'Barlow_700Bold',
  italic: 'Barlow_400Regular_Italic',
} as const;

// Gold gradient used by E-CARD, GAME n and the match-over title.
export const GOLD_TEXT_GRADIENT = [C.goldLight, C.gold, C.goldDeep] as const;
export const GOLD_TEXT_LOCATIONS = [0.08, 0.58, 0.96] as const;

export const sideColor = (side: 'emp' | 'slv') => (side === 'emp' ? C.goldText : C.rust);
