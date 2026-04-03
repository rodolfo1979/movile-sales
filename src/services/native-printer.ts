import { NativeModules, PermissionsAndroid, Platform } from 'react-native';

type BondedPrinter = {
  name: string;
  address: string;
  bondState?: number;
};

type DeviceEnvironment = {
  manufacturer: string;
  brand: string;
  model: string;
  isSunmi: boolean;
};

type NativePrinterModule = {
  listBondedPrinters: () => Promise<BondedPrinter[]>;
  printEscPos: (address: string, payload: string) => Promise<boolean>;
  getDeviceEnvironment: () => Promise<DeviceEnvironment>;
};

const printerModule = NativeModules.OnePrinterModule as NativePrinterModule | undefined;

async function ensureBluetoothPermissions() {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version < 31) return true;
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  return Object.values(result).every((value) => value === PermissionsAndroid.RESULTS.GRANTED);
}

export async function listBondedPrinters() {
  if (!printerModule || Platform.OS !== 'android') return [] as BondedPrinter[];
  const granted = await ensureBluetoothPermissions();
  if (!granted) {
    throw new Error('Debes conceder permisos Bluetooth para ver las impresoras vinculadas.');
  }
  return await printerModule.listBondedPrinters();
}

export async function printEscPos(address: string, payload: string) {
  if (!printerModule || Platform.OS !== 'android') {
    throw new Error('La impresion Bluetooth solo esta disponible en Android.');
  }
  const granted = await ensureBluetoothPermissions();
  if (!granted) {
    throw new Error('Debes conceder permisos Bluetooth para imprimir.');
  }
  return await printerModule.printEscPos(address, payload);
}

export async function getDeviceEnvironment() {
  if (!printerModule || Platform.OS !== 'android') {
    return {
      manufacturer: 'unknown',
      brand: 'unknown',
      model: 'unknown',
      isSunmi: false,
    } satisfies DeviceEnvironment;
  }
  return await printerModule.getDeviceEnvironment();
}

export type { BondedPrinter, DeviceEnvironment };
