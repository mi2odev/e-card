// Learn more: https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Native modules the game can use if a development build provides them, and
 * does without otherwise:
 *
 *   react-native-tcp-socket  — lets the host phone serve the Wi-Fi table itself,
 *                              so two phones need no computer between them.
 *   expo-nearby-connections  — the Bluetooth transport.
 *
 * Metro resolves `require()` at bundle time, so a runtime try/catch is not
 * enough: an uninstalled package fails the build. Point those specifiers at a
 * null stub when they are genuinely absent, and let the real module win when it
 * is installed.
 */
const OPTIONAL_NATIVE_MODULES = ['react-native-tcp-socket', 'expo-nearby-connections'];
const MISSING_STUB = path.resolve(__dirname, 'src/net/optional/missing.js');

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (OPTIONAL_NATIVE_MODULES.includes(moduleName)) {
    try {
      require.resolve(moduleName, { paths: [__dirname] });
    } catch {
      return { type: 'sourceFile', filePath: MISSING_STUB };
    }
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
