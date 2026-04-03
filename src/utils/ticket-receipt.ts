import { Platform, Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export type ReceiptEntry = { label: string; amount: string; detail?: string };
export type TicketReceipt = {
  title: string;
  ticketCode: string;
  customerName?: string;
  customerPhone?: string;
  gameLabel: string;
  drawName: string;
  drawTime: string;
  drawDate: string;
  paymentMethod: string;
  totalAmount: string;
  status: string;
  proofName?: string;
  entries: ReceiptEntry[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function displayCustomerLine(value?: string, fallback = 'No indicado') {
  return escapeHtml((value || '').trim() || fallback);
}

function buildRows(entries: ReceiptEntry[]) {
  return entries
    .map((entry) => '<tr><td>' + escapeHtml(entry.label) + '</td><td>' + escapeHtml(entry.amount) + '</td><td>' + escapeHtml(entry.detail || '') + '</td></tr>')
    .join('');
}

export function buildReceiptHtml(input: TicketReceipt) {
  return [
    '<!doctype html>',
    '<html lang="es">',
    '<head>',
    '<meta charset="UTF-8" />',
    '<title>' + escapeHtml(input.ticketCode) + '</title>',
    '<style>',
    'body{font-family:Segoe UI,Arial,sans-serif;padding:28px;color:#0f172a;background:#f8fafc}',
    '.card{max-width:760px;margin:0 auto;border:1px solid #cbd5e1;border-radius:22px;padding:28px;background:#fff}',
    'h1{margin:0 0 12px;font-size:30px}',
    '.eyebrow{font-size:12px;letter-spacing:2px;color:#2563eb;font-weight:700;margin-bottom:8px}',
    '.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:20px}',
    '.meta div{border:1px solid #e2e8f0;border-radius:14px;padding:12px}',
    'table{width:100%;border-collapse:collapse;margin-top:16px}',
    'th,td{border-bottom:1px solid #e2e8f0;padding:10px;text-align:left}',
    '.total{margin-top:20px;font-size:22px;font-weight:700}',
    '.foot{margin-top:18px;color:#475569}',
    '</style>',
    '</head>',
    '<body>',
    '<div class="card">',
    '<div class="eyebrow">' + escapeHtml(input.title) + '</div>',
    '<h1>' + escapeHtml(input.ticketCode) + '</h1>',
    '<div class="meta">',
    '<div><strong>Cliente</strong><br />' + displayCustomerLine(input.customerName) + '<br />' + displayCustomerLine(input.customerPhone, 'Sin telefono') + '</div>',
    '<div><strong>Juego</strong><br />' + escapeHtml(input.gameLabel) + '<br />' + escapeHtml(input.drawName) + ' | ' + escapeHtml(input.drawTime) + '</div>',
    '<div><strong>Fecha del sorteo</strong><br />' + escapeHtml(input.drawDate) + '</div>',
    '<div><strong>Metodo de pago</strong><br />' + escapeHtml(input.paymentMethod) + (input.proofName ? '<br />Comprobante: ' + escapeHtml(input.proofName) : '') + '</div>',
    '<div><strong>Estado del ticket</strong><br />' + escapeHtml(input.status) + '</div>',
    '</div>',
    '<table><thead><tr><th>Jugada</th><th>Monto</th><th>Detalle</th></tr></thead><tbody>' + buildRows(input.entries) + '</tbody></table>',
    '<div class="total">Total: ' + escapeHtml(input.totalAmount) + '</div>',
    '<p class="foot">Conserva este comprobante como respaldo de tu compra.</p>',
    '</div>',
    '</body>',
    '</html>',
  ].join('');
}

function buildShareText(input: TicketReceipt) {
  return [
    input.title,
    'Codigo: ' + input.ticketCode,
    'Cliente: ' + ((input.customerName || '').trim() || 'No indicado'),
    'Juego: ' + input.gameLabel,
    'Sorteo: ' + input.drawName + ' | ' + input.drawTime,
    'Fecha: ' + input.drawDate,
    'Pago: ' + input.paymentMethod,
    'Estado: ' + input.status,
    'Total: ' + input.totalAmount,
  ].join('\n');
}

export async function shareTicketReceipt(input: TicketReceipt) {
  const html = buildReceiptHtml(input);
  if (Platform.OS === 'web') {
    await Share.share({ title: input.ticketCode, message: buildShareText(input) });
    return;
  }
  const file = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri);
    return;
  }
  await Share.share({ title: input.ticketCode, message: buildShareText(input) });
}

export async function printTicketReceipt(input: TicketReceipt) {
  const html = buildReceiptHtml(input);
  await Print.printAsync({ html });
}
