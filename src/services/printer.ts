import { Alert, Platform } from 'react-native';

import type { PrinterConfig } from '../contexts/app-session';
import { printEscPos, getDeviceEnvironment } from './native-printer';
import { printTicketReceipt, type TicketReceipt } from '../utils/ticket-receipt';

export const KNOWN_ESC_POS_MODELS = ['PT-210', 'MHT-P5801 58mm', 'GOOJPRT MTP-II 58mm', 'PRINTERPOS'];
export const KNOWN_SUNMI_MODELS = ['SUNMI V2'];

export function getPrinterProfileLabel(profile: PrinterConfig['profile']) {
  return profile === 'sunmi' ? 'SUNMI' : 'Bluetooth ESC/POS';
}

export function buildPrinterRuntimeNote(config: PrinterConfig | null) {
  if (!config) return 'Sin impresora configurada.';
  return config.printerName + ' · ' + getPrinterProfileLabel(config.profile) + ' · ' + config.paperWidth;
}

export function buildEscPosReceiptText(input: TicketReceipt) {
  const lines = [
    'ONE',
    input.title.toUpperCase(),
    '-----------------------------',
    'Ticket: ' + input.ticketCode,
    'Juego: ' + input.gameLabel,
    'Sorteo: ' + input.drawName + ' ' + input.drawTime,
    'Fecha: ' + input.drawDate,
    'Cliente: ' + ((input.customerName || '').trim() || 'Cliente general'),
    'Telefono: ' + ((input.customerPhone || '').trim() || 'Sin telefono'),
    'Pago: ' + input.paymentMethod,
    'Estado: ' + input.status,
    '-----------------------------',
    ...input.entries.map((entry) => entry.label + '  ' + entry.amount + (entry.detail ? '  ' + entry.detail : '')),
    '-----------------------------',
    'TOTAL: ' + input.totalAmount,
    '',
    'Gracias por su compra',
    '',
    '',
  ];
  return lines.join('\n');
}

export async function printWithConfiguredPrinter(receipt: TicketReceipt, printerConfig: PrinterConfig | null) {
  if (!printerConfig) {
    Alert.alert('Impresora no configurada', 'Antes de imprimir, entra a Configuracion de impresora y guarda el equipo del vendedor.');
    return;
  }

  if (printerConfig.profile === 'sunmi') {
    const environment = await getDeviceEnvironment();
    if (!environment.isSunmi) {
      Alert.alert('SUNMI no detectado', 'La impresora esta configurada como SUNMI pero este telefono no parece ser un equipo SUNMI.');
      return;
    }
    Alert.alert('SUNMI pendiente', 'La deteccion del entorno SUNMI ya quedo lista. Falta integrar el SDK nativo final para imprimir directo en este equipo.');
    return;
  }

  if (Platform.OS !== 'android') {
    await printTicketReceipt(receipt);
    return;
  }

  if (!printerConfig.printerAddress?.trim()) {
    Alert.alert('Falta direccion Bluetooth', 'Selecciona una impresora vinculada desde Configuracion de impresora para poder imprimir automatico.');
    return;
  }

  await printEscPos(printerConfig.printerAddress.trim(), buildEscPosReceiptText(receipt));
}

export async function attemptAutoPrint(receipt: TicketReceipt, printerConfig: PrinterConfig | null) {
  if (!printerConfig?.autoPrint) return;
  await printWithConfiguredPrinter(receipt, printerConfig);
}
