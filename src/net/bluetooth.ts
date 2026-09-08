/**
 * Bluetooth LE table.
 *
 * The host advertises the E-Card service under its room code; the guest scans
 * for that code and connects. Messages travel as chunked GATT writes and
 * notifications (see ble/chunks.ts).
 *
 * Both roles need native BLE, which Expo Go does not ship — `availability()`
 * says so plainly and the lobby offers Wi-Fi instead. In a development build
 * that includes `react-native-ble-plx` the guest role works as written; hosting
 * additionally needs a peripheral-capable module registered through
 * `registerBlePeripheral()`, because ble-plx has no peripheral mode.
 */

import { decode, encode, type NetMessage } from './protocol';
import {
  deadLink,
  optionalModule,
  type Availability,
  type HostOptions,
  type JoinOptions,
  type Link,
  type LinkEvents,
  type TransportDriver,
} from './link';
import {
  SERVICE_UUID,
  RX_UUID,
  TX_UUID,
  getBlePeripheral,
  type BleCentral,
  type BleDevice,
} from './ble/bridge';
import { ChunkAssembler, decodeChunk, encodeChunk, splitMessage } from './ble/chunks';
import { errorText } from './ws/tcpHost';

/** Advertised as "ECARD-ABCD" so a scan can match on the room code alone. */
export const advertisedName = (code: string) => `ECARD-${code.toUpperCase()}`;

const NEEDS_DEV_BUILD =
  'BLUETOOTH NEEDS A DEVELOPMENT BUILD — EXPO GO CANNOT LOAD NATIVE BLE. USE WI-FI.';
const NEEDS_PERIPHERAL =
  'HOSTING OVER BLUETOOTH NEEDS A PERIPHERAL-CAPABLE BLE MODULE. USE WI-FI, OR JOIN INSTEAD.';

type BlePlx = {
  BleManager: new () => {
    state: () => Promise<string>;
    onStateChange: (cb: (s: string) => void, emitNow: boolean) => { remove: () => void };
    startDeviceScan: (
      uuids: string[] | null,
      opts: unknown,
      cb: (err: unknown, device: { id: string; name: string | null; localName?: string | null } | null) => void,
    ) => void;
    stopDeviceScan: () => void;
    connectToDevice: (id: string) => Promise<{
      discoverAllServicesAndCharacteristics: () => Promise<unknown>;
      monitorCharacteristicForService: (
        service: string,
        char: string,
        cb: (err: unknown, c: { value?: string | null } | null) => void,
      ) => { remove: () => void };
      writeCharacteristicWithResponseForService: (
        service: string,
        char: string,
        value: string,
      ) => Promise<unknown>;
      cancelConnection: () => Promise<unknown>;
    }>;
  };
};

const loadPlx = () => optionalModule<BlePlx>(() => require('react-native-ble-plx'));

/** Adapts `react-native-ble-plx` to the central half of the bridge. */
function makeCentral(): BleCentral | null {
  const plx = loadPlx();
  if (!plx) return null;
  const manager = new plx.BleManager();
  let device: Awaited<ReturnType<typeof manager.connectToDevice>> | null = null;
  let monitor: { remove: () => void } | null = null;

  return {
    ready: () =>
      new Promise<void>((resolve, reject) => {
        const sub = manager.onStateChange((s) => {
          if (s === 'PoweredOn') {
            sub.remove();
            resolve();
          } else if (s === 'Unsupported' || s === 'Unauthorized') {
            sub.remove();
            reject(new Error(`bluetooth ${s.toLowerCase()}`));
          }
        }, true);
      }),
    scan: async (onFound) => {
      manager.startDeviceScan([SERVICE_UUID], null, (err, d) => {
        if (err || !d) return;
        onFound({ id: d.id, name: d.localName ?? d.name ?? null });
      });
    },
    stopScan: () => manager.stopDeviceScan(),
    connect: async (id) => {
      device = await manager.connectToDevice(id);
      await device.discoverAllServicesAndCharacteristics();
    },
    subscribe: async (onChunk) => {
      if (!device) throw new Error('not connected');
      monitor = device.monitorCharacteristicForService(SERVICE_UUID, TX_UUID, (err, c) => {
        if (err || !c?.value) return;
        onChunk(c.value);
      });
    },
    write: async (value) => {
      if (!device) throw new Error('not connected');
      await device.writeCharacteristicWithResponseForService(SERVICE_UUID, RX_UUID, value);
    },
    disconnect: () => {
      monitor?.remove();
      monitor = null;
      void device?.cancelConnection().catch(() => undefined);
      device = null;
    },
  };
}

/** Serialises chunked sends so writes never interleave between two messages. */
function makeSender(write: (value: string) => Promise<void>, onError: (e: unknown) => void) {
  let nextId = 1;
  let queue: Promise<void> = Promise.resolve();
  return (msg: NetMessage) => {
    const chunks = splitMessage(nextId++, encode(msg));
    queue = queue
      .then(async () => {
        for (const c of chunks) await write(encodeChunk(c));
      })
      .catch(onError);
  };
}

async function host(opts: HostOptions, ev: LinkEvents): Promise<Link> {
  const peripheral = getBlePeripheral();
  if (!peripheral) {
    ev.onStatus('error', loadPlx() ? NEEDS_PERIPHERAL : NEEDS_DEV_BUILD);
    return deadLink;
  }

  ev.onStatus('starting');
  const assembler = new ChunkAssembler();

  peripheral.onWrite((value) => {
    const full = assembler.push(decodeChunk(value));
    if (!full) return;
    const msg = decode(full);
    if (msg) ev.onMessage(msg);
  });
  peripheral.onCentralConnected(() => {
    ev.onStatus('connected');
    ev.onMessage({ t: 'peer', state: 'joined' });
  });
  peripheral.onCentralDisconnected(() => {
    ev.onMessage({ t: 'peer', state: 'left' });
    ev.onStatus('waiting');
  });

  try {
    await peripheral.ready();
    await peripheral.advertise(advertisedName(opts.code));
    ev.onStatus('waiting');
  } catch (e) {
    ev.onStatus('error', errorText(e));
    return deadLink;
  }

  return {
    send: makeSender((v) => peripheral.notify(v), (e) => ev.onStatus('error', errorText(e))),
    info: { mode: 'bluetooth', hint: advertisedName(opts.code) },
    close: () => peripheral.stop(),
  };
}

async function join(opts: JoinOptions, ev: LinkEvents): Promise<Link> {
  const central = makeCentral();
  if (!central) {
    ev.onStatus('error', NEEDS_DEV_BUILD);
    return deadLink;
  }

  ev.onStatus('connecting');
  const wanted = advertisedName(opts.code);
  const assembler = new ChunkAssembler();

  try {
    await central.ready();
    const found = await new Promise<BleDevice>((resolve, reject) => {
      const timer = setTimeout(() => {
        central.stopScan();
        reject(new Error(`no table named ${wanted} in range`));
      }, 20_000);
      void central.scan((d) => {
        if ((d.name ?? '').toUpperCase() !== wanted) return;
        clearTimeout(timer);
        central.stopScan();
        resolve(d);
      });
    });

    await central.connect(found.id);
    await central.subscribe((value) => {
      const full = assembler.push(decodeChunk(value));
      if (!full) return;
      const msg = decode(full);
      if (msg) ev.onMessage(msg);
    });
    ev.onStatus('connected');
  } catch (e) {
    central.disconnect();
    ev.onStatus('error', errorText(e));
    return deadLink;
  }

  return {
    send: makeSender((v) => central.write(v), (e) => ev.onStatus('error', errorText(e))),
    info: { mode: 'bluetooth', hint: wanted },
    close: () => central.disconnect(),
  };
}

async function availability(): Promise<Availability> {
  if (!loadPlx()) return { ok: false, reason: NEEDS_DEV_BUILD };
  if (!getBlePeripheral()) return { ok: true, reason: NEEDS_PERIPHERAL };
  return { ok: true };
}

export const bluetoothDriver: TransportDriver = {
  kind: 'bluetooth',
  label: 'BLUETOOTH',
  blurb: 'NO NETWORK AT ALL · NEEDS A DEV BUILD',
  availability,
  host,
  join,
};
