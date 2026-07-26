import React from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import {
  Barlow_400Regular,
  Barlow_400Regular_Italic,
  Barlow_500Medium,
  Barlow_600SemiBold,
  Barlow_700Bold,
} from '@expo-google-fonts/barlow';
import { C } from '../src/theme';

export default function RootLayout() {
  const [loaded] = useFonts({
    BebasNeue_400Regular,
    Barlow_400Regular,
    Barlow_400Regular_Italic,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
  });

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {loaded ? (
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'fade',
            animationDuration: 220,
            gestureEnabled: false,
            contentStyle: { backgroundColor: C.tableEdge },
          }}
        />
      ) : (
        <View style={{ flex: 1, backgroundColor: C.void }} />
      )}
    </SafeAreaProvider>
  );
}
