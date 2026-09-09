#!/usr/bin/env node
/**
 * `npm start` — the Metro bundler and the LAN relay together.
 *
 * Inside Expo Go an app cannot open a listening port, so two phones on the same
 * Wi-Fi need something in the middle to pair them, and that something is
 * `server/relay.js` on this machine (see the README). Leaving it to a second
 * terminal meant the most ordinary way to play — two phones, Expo Go, one
 * laptop — did not work until you knew to go and start it, and the app could
 * only say so after the dial had already failed.
 *
 * So it starts here, beside Metro, on the machine the phones are already
 * loading the app from. Its address is the one the app pre-fills.
 *
 * A relay already running on the port is not an error: this steps aside and
 * says so. `npm run relay` still runs one on its own.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIM = '\u001b[2m';
const OFF = '\u001b[0m';

/** Relay output, kept apart from Metro's so neither is mistaken for the other. */
function relayLine(text) {
  for (const line of String(text).split('\n')) {
    if (line.trim()) process.stdout.write(`${DIM}relay │ ${line.trimEnd()}${OFF}\n`);
  }
}

const relay = spawn(process.execPath, [resolve(ROOT, 'server/relay.js')], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
relay.stdout.on('data', relayLine);
relay.stderr.on('data', relayLine);
relay.on('error', (e) => relayLine(`could not start: ${e.message}`));
relay.on('exit', (code) => {
  if (code) relayLine('not started — one is already running, or the port is taken. Carrying on without it.');
});

const expo = spawn(process.execPath, [require.resolve('expo/bin/cli'), ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
});

const stopRelay = () => {
  if (relay.killed || relay.exitCode !== null) return;
  relay.kill('SIGTERM');
  // Nothing here is worth hanging a terminal over.
  setTimeout(() => relay.kill('SIGKILL'), 1500).unref();
};

// Metro owns the terminal, so it owns Ctrl-C too: the relay follows it down
// rather than being left holding the port for the next run.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopRelay();
    if (expo.exitCode === null) expo.kill(signal);
  });
}

// Set the code and let the process end on its own: exiting outright here can
// cut off whatever the relay was still writing, which is exactly the line
// saying it could not start.
expo.on('exit', (code, signal) => {
  stopRelay();
  process.exitCode = signal ? 1 : (code ?? 0);
});
expo.on('error', (e) => {
  stopRelay();
  console.error(`Could not start Expo: ${e.message}`);
  process.exitCode = 1;
});
