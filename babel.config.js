module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 (SDK 54) is powered by react-native-worklets — this plugin must stay last.
    plugins: ['react-native-worklets/plugin'],
  };
};
