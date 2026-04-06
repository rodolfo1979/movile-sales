import { Platform, Share } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

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

function escapeSvg(value?: string) {
  return escapeHtml((value || '').trim());
}

function buildReceiptSvg(input: TicketReceipt) {
  const width = 960;
  const padding = 40;
  const rowHeight = 42;
  const headerHeight = 260;
  const footerHeight = 90;
  const bodyHeight = headerHeight + (input.entries.length * rowHeight) + footerHeight;
  const height = Math.max(620, bodyHeight);
  const customerLabel = [
    (input.customerName || '').trim() || 'Cliente general',
    (input.customerPhone || '').trim() || 'Sin telefono',
  ].join(' | ');
  const rows = input.entries.map((entry, index) => {
    const y = 312 + (index * rowHeight);
    const detail = entry.detail ? `<text x="${width - padding}" y="${y}" text-anchor="end" font-size="18" fill="#475569">${escapeSvg(entry.detail)}</text>` : '';
    return [
      `<line x1="${padding}" y1="${y - 22}" x2="${width - padding}" y2="${y - 22}" stroke="#dbe7fb" stroke-width="1" />`,
      `<text x="${padding}" y="${y}" font-size="24" font-weight="700" fill="#111827">${escapeSvg(entry.label)}</text>`,
      `<text x="${Math.round(width / 2)}" y="${y}" text-anchor="middle" font-size="20" fill="#1f3a68">${escapeSvg(entry.amount)}</text>`,
      detail,
    ].join('');
  }).join('');
  const totalY = height - 42;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" rx="28" fill="#f8fbff" />
  <rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="24" fill="#ffffff" stroke="#dbe7fb" stroke-width="2" />
  <text x="${padding}" y="54" font-size="22" font-weight="700" fill="#2563eb">ONE</text>
  <text x="${width - padding}" y="54" text-anchor="end" font-size="18" fill="#64748b">${escapeSvg(input.title)}</text>
  <text x="${padding}" y="98" font-size="34" font-weight="800" fill="#111827">${escapeSvg(input.ticketCode)}</text>
  <text x="${padding}" y="112" font-size="18" fill="#475569">Cliente</text>
  <text x="${padding}" y="138" font-size="22" font-weight="700" fill="#111827">${escapeSvg(customerLabel)}</text>
  <text x="${padding}" y="174" font-size="18" fill="#475569">Juego</text>
  <text x="${padding}" y="200" font-size="22" font-weight="700" fill="#111827">${escapeSvg(input.gameLabel)}</text>
  <text x="${padding}" y="236" font-size="18" fill="#475569">Sorteo</text>
  <text x="${padding}" y="262" font-size="22" font-weight="700" fill="#111827">${escapeSvg(input.drawName)} | ${escapeSvg(input.drawTime)}</text>
  <text x="${width - padding}" y="112" text-anchor="end" font-size="18" fill="#475569">Fecha</text>
  <text x="${width - padding}" y="138" text-anchor="end" font-size="22" font-weight="700" fill="#111827">${escapeSvg(input.drawDate)}</text>
  <text x="${width - padding}" y="174" text-anchor="end" font-size="18" fill="#475569">Pago</text>
  <text x="${width - padding}" y="200" text-anchor="end" font-size="22" font-weight="700" fill="#111827">${escapeSvg(input.paymentMethod)}</text>
  <text x="${width - padding}" y="236" text-anchor="end" font-size="18" fill="#475569">Estado</text>
  <text x="${width - padding}" y="262" text-anchor="end" font-size="22" font-weight="700" fill="#111827">${escapeSvg(input.status)}</text>
  ${input.proofName ? `<text x="${width - padding}" y="286" text-anchor="end" font-size="16" fill="#64748b">Comp.: ${escapeSvg(input.proofName)}</text>` : ''}
  <line x1="${padding}" y1="270" x2="${width - padding}" y2="270" stroke="#cbd5e1" stroke-width="2" />
  ${rows}
  <line x1="${padding}" y1="${totalY - 28}" x2="${width - padding}" y2="${totalY - 28}" stroke="#cbd5e1" stroke-width="2" />
  <text x="${padding}" y="${totalY}" font-size="24" font-weight="800" fill="#111827">Total</text>
  <text x="${width - padding}" y="${totalY}" text-anchor="end" font-size="28" font-weight="800" fill="#111827">${escapeSvg(input.totalAmount)}</text>
</svg>`;
}

async function createTicketImageFile(input: TicketReceipt) {
  const svg = buildReceiptSvg(input);
  const safeCode = (input.ticketCode || 'ticket').replace(/[^a-zA-Z0-9-_]/g, '-');
  const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!directory) throw new Error('No hay almacenamiento disponible para generar la imagen del ticket.');
  const uri = `${directory}${safeCode}.svg`;
  await FileSystem.writeAsStringAsync(uri, svg, { encoding: FileSystem.EncodingType.UTF8 });
  return uri;
}

export async function shareTicketReceipt(input: TicketReceipt) {
  if (Platform.OS === 'web') {
    await Share.share({ title: input.ticketCode, message: buildShareText(input) });
    return;
  }
  const imageUri = await createTicketImageFile(input);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(imageUri, {
      mimeType: 'image/svg+xml',
      dialogTitle: 'Compartir ticket',
      UTI: 'public.image',
    });
    return;
  }
  await Share.share({ title: input.ticketCode, message: buildShareText(input) });
}

export async function printTicketReceipt(input: TicketReceipt) {
  const html = buildReceiptHtml(input);
  await Print.printAsync({ html });
}

