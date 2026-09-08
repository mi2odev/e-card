/**
 * The small slice of BLE this game needs, kept behind an interface so the rest
 * of the app never imports a native module directly.
 *
 * Reality check, so nobody is surprised on a device:
 *
 *   • Joining a table only needs the *central* role (scan, connect, subscribe,
 *     write). `react-native-ble-plx` does this, and the adapter below uses it.
 *   • Hosting a table needs the *peripheral* role (advertise a service and serve
 *     a characteristic). `react-native-ble-plx` does not implement peripheral
 *     mode at all, so hosting needs a peripheral-capable module registered
 *     through `registerBlePeripheral()` — see README.
 *   • Neither is present inside Expo Go: both need a development build. The
 *     driver reports that instead of throwing, and the Wi-Fi table works today.
 */

export const SERVICE_UUID = '6f2b0001-9c5e-4b1a-9a3f-1d5c7e8a4b21';
/** Peripheral → central. Notifies with inbound chunks. */
export const TX_UUID = '6f2b0002-9c5e-4b1a-9a3f-1d5c7e8a4b21';
/** Central → peripheral. Written with outbound chunks. */
export const RX_UUID = '6f2b0003-9c5e-4b1a-9a3f-1d5c7e8a4b21';

/** Conservative payload budget per notification on the default 23-byte ATT MTU. */
export const CHUNK_BYTES = 128;

export type BleDevice = { id: string; name: string | null };

export type BleCentral = {
  /** Resolves once the adapter is powered on and permissions are granted. */
  ready: () => Promise<void>;
  scan: (onFound: (d: BleDevice) => void) => Promise<void>;
  stopScan: () => void;
  connect: (deviceId: string) => Promise<void>;
  /** Subscribe to TX_UUID. Values arrive base64-encoded, as ble-plx delivers them. */
  subscribe: (onChunk: (base64Value: string) => void) => Promise<void>;
  /** Write one chunk to RX_UUID, base64-encoded. */
  write: (base64Value: string) => Promise<void>;
  disconnect: () => void;
};

export type BlePeripheral = {
  ready: () => Promise<void>;
  /** Advertise SERVICE_UUID with `localName` and serve TX/RX. */
  advertise: (localName: string) => Promise<void>;
  onCentralConnected: (cb: (d: BleDevice) => void) => void;
  onCentralDisconnected: (cb: () => void) => void;
  /** Inbound writes on RX_UUID, base64-encoded. */
  onWrite: (cb: (base64Value: string) => void) => void;
  /** Notify TX_UUID, base64-encoded. */
  notify: (base64Value: string) => Promise<void>;
  stop: () => void;
};

let peripheralFactory: (() => BlePeripheral) | null = null;

/**
 * Register a peripheral implementation from app code (a dev build's native
 * module wrapper). Without one, hosting over Bluetooth reports as unavailable.
 */
export function registerBlePeripheral(factory: () => BlePeripheral): void {
  peripheralFactory = factory;
}

export const getBlePeripheral = () => (peripheralFactory ? peripheralFactory() : null);
