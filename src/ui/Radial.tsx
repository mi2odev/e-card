import React, { useMemo } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { C } from '../theme';

let uid = 0;

export type Stops = Array<[offset: number, color: string, opacity?: number]>;

/**
 * CSS radial-gradient() has no React Native equivalent, so every radial in the
 * design is painted with react-native-svg instead. Fills its parent.
 */
export function Radial({
  stops,
  cx = '50%',
  cy = '50%',
  rx = '75%',
  ry = '75%',
  style,
  radius = 0,
}: {
  stops: Stops;
  cx?: string;
  cy?: string;
  rx?: string;
  ry?: string;
  style?: ViewStyle;
  radius?: number;
}) {
  const id = useMemo(() => `rg${++uid}`, []);
  const box = StyleSheet.flatten<ViewStyle>([StyleSheet.absoluteFill as ViewStyle, style]);
  // absoluteFill pins all four edges — drop the opposite edge when a size is given.
  if (box.width != null) box.right = undefined;
  if (box.height != null) box.bottom = undefined;
  return (
    <View pointerEvents="none" style={box}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={id} cx={cx} cy={cy} rx={rx} ry={ry} fx={cx} fy={cy}>
            {stops.map(([offset, color, opacity], i) => (
              <Stop key={i} offset={offset} stopColor={color} stopOpacity={opacity ?? 1} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" rx={radius} ry={radius} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** The felt table: radial(120% 90% at 50% 16%) plus the design's inset vignette. */
export function TableBackground() {
  return (
    <>
      <Radial
        cx="50%"
        cy="16%"
        rx="120%"
        ry="90%"
        stops={[
          [0, C.tableTop],
          [0.46, C.tableMid],
          [0.78, C.tableLow],
          [1, C.tableEdge],
        ]}
      />
      <Radial
        cx="50%"
        cy="45%"
        rx="80%"
        ry="70%"
        stops={[
          [0, '#000000', 0],
          [0.62, '#000000', 0],
          [1, '#000000', 0.55],
        ]}
      />
    </>
  );
}

/** Soft coloured bloom behind seals, card clusters and the reveal zone. */
export function Glow({
  color,
  style,
  edge = 0.68,
}: {
  color: string;
  style?: ViewStyle;
  edge?: number;
}) {
  return (
    <Radial
      style={style}
      stops={[
        [0, color, 1],
        [edge, color, 0],
        [1, color, 0],
      ]}
    />
  );
}
