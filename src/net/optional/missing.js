/**
 * Stand-in for an optional native module that is not installed in this build.
 * `optionalModule()` in src/net/link.ts treats a null module as "not available",
 * which is how Wi-Fi direct hosting reports itself as absent inside Expo Go
 * rather than crashing the bundle.
 */
module.exports = null;
