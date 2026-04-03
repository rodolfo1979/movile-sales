import { DEFAULT_TENANT_SLUG, getApiBase } from '../constants/config';

export type Draw = {
  id: string;
  name: string;
  drawTime: string;
  cutoffMinutes: number;
};

export type Lottery = {
  id: string;
  name: string;
  payoutMultiplier: string;
  numberLimit: string;
  reventadoEnabled?: boolean;
  reventadoMultiplier?: string;
  draws: Draw[];
  blockedNumbers: Array<{ id: string; numberValue: string; reason: string; drawId?: string | null; draw?: { id: string; name: string; drawTime: string } | null }>;
  isActive?: boolean;
};

export type MonazosDraw = {
  id: string;
  name: string;
  drawTime: string;
  cutoffMinutes: number;
  minBetAmount: string;
  maxBetAmount: string;
  orderMultiplier: string;
  disorderMultiplier: string;
  isActive?: boolean;
};

export type MonazosGame = {
  id: string;
  name: string;
  isActive?: boolean;
  draws: MonazosDraw[];
};

export type TicketLookup = {
  ticketCode: string;
  customerName?: string;
  customerPhone?: string;
  drawDate: string;
  totalAmount: string;
  paymentMethod: string;
  status: string;
  prizeStatus: string;
  lottery?: { name: string };
  game?: { name: string };
  draw?: { name: string; drawTime: string };
  numbers?: Array<{ numberValue: string; amount: string; reventadoAmount?: string }>;
  plays?: Array<{ mode: 'orden' | 'desorden' | 'gallo_tapado'; digits: string; amount: string; isQuickPick?: boolean }>;
  paymentProofs: Array<{ fileUrl: string; status?: string }>;
  claim?: { claimCode: string; prizeAmount: string; status: string } | null;
};

export type TicketCreateResponse = {
  ticketCode: string;
  totalAmount: string;
  status?: string;
  numbers?: Array<{ numberValue: string; amount: string; reventadoAmount?: string }>;
  plays?: Array<{ mode: 'orden' | 'desorden' | 'gallo_tapado'; digits: string; amount: string; isQuickPick?: boolean }>;
};
export type UploadedProof = { fileUrl: string; originalName?: string };
export type UploadableProof = { uri: string; fileName?: string | null; mimeType?: string | null };
export type AuthUser = {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  salesCommissionEnabled?: boolean;
  salesCommissionPercent?: number | null;
  tenant?: { id: string; name: string; slug: string; plan?: string; status?: string };
};
export type LoginResponse = { accessToken: string; user: AuthUser };
export type SellerLocationSnapshot = {
  adminId: string;
  sellerEmail: string;
  role: string;
  pingCount: number;
  isOnline: boolean;
  latestPing: { latitude: number; longitude: number; accuracy?: number | null; recordedAt: string };
};

export type SellerSale = {
  ticketCode: string;
  customerName?: string;
  customerPhone?: string;
  drawDate: string;
  totalAmount: string;
  paymentMethod: string;
  status: string;
  sellerEmail?: string | null;
  lottery?: { name: string };
  game?: { name: string };
  draw?: { name: string; drawTime: string };
  numbers?: Array<{ numberValue: string; amount: string; reventadoAmount?: string }>;
  plays?: Array<{ mode: 'orden' | 'desorden' | 'gallo_tapado'; digits: string; amount: string; isQuickPick?: boolean }>;
};

export type LotteryEarningsSummary = {
  sellerEmail: string;
  commissionEnabled: boolean;
  commissionPercent: number;
  lotteryTicketCount: number;
  lotteryTotalAmount: number;
  lotteryCommissionAmount: number;
  lotteryCashCount: number;
  lotterySinpeCount: number;
  lastLotterySaleAt?: string | null;
  lotteries: Array<{ lotteryId: string; lotteryName: string; ticketCount: number; totalAmount: number; commissionAmount: number }>;
  draws: Array<{ drawId: string; drawName: string; drawTime: string; lotteryId: string; lotteryName: string; ticketCount: number; totalAmount: number; commissionAmount: number }>;
};

export type MonazosEarningsSummary = {
  sellerEmail: string;
  commissionEnabled: boolean;
  commissionPercent: number;
  monazosTicketCount: number;
  monazosTotalAmount: number;
  monazosCommissionAmount: number;
  monazosCashCount: number;
  monazosSinpeCount: number;
  lastMonazosSaleAt?: string | null;
  monazosGames: Array<{ gameId: string; gameName: string; ticketCount: number; totalAmount: number; commissionAmount: number }>;
  monazosDraws: Array<{ drawId: string; drawName: string; drawTime: string; gameId: string; gameName: string; ticketCount: number; totalAmount: number; commissionAmount: number }>;
};

type ApiEnvelope<T> = { data: T; message?: string | string[] };

function buildTenantQuery(tenantSlug = DEFAULT_TENANT_SLUG) {
  return '?tenantSlug=' + encodeURIComponent(tenantSlug);
}

async function readEnvelope<T>(path: string) {
  const response = await fetch(getApiBase() + path);
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join('. ') : payload.message || 'No se pudo completar la solicitud.';
    throw new Error(message);
  }
  return payload.data;
}


async function readEnvelopeWithAuth<T>(path: string, token: string) {
  const response = await fetch(getApiBase() + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join('. ') : payload.message || 'No se pudo completar la solicitud.';
    throw new Error(message);
  }
  return payload.data;
}

async function postEnvelopeWithAuth<T>(path: string, token: string, body: unknown) {
  const response = await fetch(getApiBase() + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join('. ') : payload.message || 'No se pudo completar la solicitud.';
    throw new Error(message);
  }
  return payload.data;
}

async function uploadProof(route: string, file: UploadableProof) {
  const formData = new FormData();
  formData.append('file', {
    uri: file.uri,
    name: file.fileName || 'comprobante.jpg',
    type: file.mimeType || 'image/jpeg',
  } as any);

  const response = await fetch(getApiBase() + route, {
    method: 'POST',
    body: formData,
  });
  const payload = (await response.json()) as ApiEnvelope<UploadedProof>;
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join('. ') : payload.message || 'No se pudo subir el comprobante.';
    throw new Error(message);
  }
  return payload.data;
}
export async function loginAdmin(payload: { tenantSlug: string; email: string; password: string }) {
  const response = await fetch(getApiBase() + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = (await response.json()) as ApiEnvelope<LoginResponse>;
  if (!response.ok) {
    const message = Array.isArray(result.message) ? result.message.join('. ') : result.message || 'No se pudo iniciar sesion.';
    throw new Error(message);
  }
  return result.data;
}

export function isDrawAvailableNow(drawTime: string, cutoffMinutes: number) {
  const [hours, minutes] = drawTime.split(':').map((item) => Number(item || 0));
  const now = new Date();
  const drawAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  const closesAt = new Date(drawAt.getTime() - cutoffMinutes * 60 * 1000);
  return now <= closesAt;
}

export function getDrawClosingLabel(drawTime: string, cutoffMinutes: number) {
  const [hours, minutes] = drawTime.split(':').map((item) => Number(item || 0));
  const now = new Date();
  const drawAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  const closesAt = new Date(drawAt.getTime() - cutoffMinutes * 60 * 1000);
  const diffMinutes = Math.max(0, Math.floor((closesAt.getTime() - now.getTime()) / 60000));
  if (diffMinutes <= 0) return 'Cerrando ahora';
  if (diffMinutes < 60) return 'Cierra en ' + diffMinutes + ' min';
  const hoursLeft = Math.floor(diffMinutes / 60);
  const minutesLeft = diffMinutes % 60;
  return minutesLeft ? 'Cierra en ' + hoursLeft + ' h ' + minutesLeft + ' min' : 'Cierra en ' + hoursLeft + ' h';
}

export async function fetchLotteries(tenantSlug = DEFAULT_TENANT_SLUG) {
  const data = await readEnvelope<Lottery[]>('/lotteries' + buildTenantQuery(tenantSlug));
  return (data || [])
    .filter((item) => item.isActive !== false)
    .map((lottery) => ({
      ...lottery,
      draws: (lottery.draws || []).filter((draw) => isDrawAvailableNow(draw.drawTime, draw.cutoffMinutes ?? 0)),
    }))
    .filter((lottery) => lottery.draws.length > 0);
}

export async function fetchMonazosGames(tenantSlug = DEFAULT_TENANT_SLUG) {
  const data = await readEnvelope<MonazosGame[]>('/monazos' + buildTenantQuery(tenantSlug));
  return (data || [])
    .filter((item) => item.isActive !== false)
    .map((game) => ({
      ...game,
      draws: (game.draws || []).filter((draw) => isDrawAvailableNow(draw.drawTime, draw.cutoffMinutes ?? 0)),
    }))
    .filter((game) => game.draws.length > 0);
}

export async function fetchTicketByCode(code: string, tenantSlug = DEFAULT_TENANT_SLUG) {
  const normalized = code.trim().toUpperCase();
  const route = normalized.startsWith('MZ-')
    ? '/monazos/tickets/' + normalized + buildTenantQuery(tenantSlug)
    : '/tickets/' + normalized + buildTenantQuery(tenantSlug);
  return await readEnvelope<TicketLookup | null>(route);
}

export function todayTicketDate(drawTime?: string) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const date = year + '-' + month + '-' + day;
  return drawTime ? date + 'T' + drawTime + ':00.000Z' : date + 'T19:00:00.000Z';
}

export function normalizeLotteryNumber(value: string) {
  return value.replace(/\D/g, '').slice(0, 2).padStart(2, '0');
}

export function normalizeMonazosDigits(value: string) {
  return value.replace(/\D/g, '').slice(0, 3);
}

export function isBlockedForDraw(lottery: Lottery, drawId: string, numberValue: string) {
  const normalized = normalizeLotteryNumber(numberValue);
  return lottery.blockedNumbers.some((item) => normalizeLotteryNumber(item.numberValue) === normalized && (!item.drawId || item.drawId === drawId));
}

export async function uploadLotteryProof(file: UploadableProof) {
  return await uploadProof('/tickets/upload-proof', file);
}

export async function uploadMonazosProof(file: UploadableProof) {
  return await uploadProof('/monazos/tickets/upload-proof', file);
}

export async function createLotteryTicket(payload: {
  customerName?: string;
  customerPhone?: string;
  lotteryId: string;
  drawId: string;
  drawDate: string;
  paymentMethod: string;
  paymentProofUrl?: string;
  numbers: Array<{ numberValue: string; amount: number; reventadoAmount?: number }>;
}, tenantSlug = DEFAULT_TENANT_SLUG) {
  const response = await fetch(getApiBase() + '/tickets' + buildTenantQuery(tenantSlug), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = (await response.json()) as ApiEnvelope<TicketCreateResponse>;
  if (!response.ok) {
    const message = Array.isArray(result.message) ? result.message.join('. ') : result.message || 'No se pudo crear el ticket.';
    throw new Error(message);
  }
  return result.data;
}

export async function createMonazosTicket(payload: {
  customerName?: string;
  customerPhone?: string;
  gameId: string;
  drawId: string;
  drawDate: string;
  paymentMethod: string;
  paymentProofUrl?: string;
  plays: Array<{ mode: 'orden' | 'desorden' | 'gallo_tapado'; digits?: string; amount: number }>;
}, tenantSlug = DEFAULT_TENANT_SLUG) {
  const response = await fetch(getApiBase() + '/monazos/tickets' + buildTenantQuery(tenantSlug), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = (await response.json()) as ApiEnvelope<TicketCreateResponse>;
  if (!response.ok) {
    const message = Array.isArray(result.message) ? result.message.join('. ') : result.message || 'No se pudo crear el ticket de 3 Monazos.';
    throw new Error(message);
  }
  return result.data;
}

export async function fetchMyLotterySales(token: string) {
  return await readEnvelopeWithAuth<SellerSale[]>('/tickets/my-sales', token);
}

export async function fetchMyMonazosSales(token: string) {
  return await readEnvelopeWithAuth<SellerSale[]>('/monazos/my-sales', token);
}

export async function fetchMyLotteryEarnings(token: string, filters?: { date?: string; fromDate?: string; toDate?: string }) {
  const query = new URLSearchParams();
  if (filters?.date) query.set('date', filters.date);
  if (filters?.fromDate) query.set('fromDate', filters.fromDate);
  if (filters?.toDate) query.set('toDate', filters.toDate);
  const suffix = query.toString() ? '?' + query.toString() : '';
  return await readEnvelopeWithAuth<LotteryEarningsSummary>('/tickets/my-earnings' + suffix, token);
}

export async function fetchMyMonazosEarnings(token: string, filters?: { date?: string; fromDate?: string; toDate?: string }) {
  const query = new URLSearchParams();
  if (filters?.date) query.set('date', filters.date);
  if (filters?.fromDate) query.set('fromDate', filters.fromDate);
  if (filters?.toDate) query.set('toDate', filters.toDate);
  const suffix = query.toString() ? '?' + query.toString() : '';
  return await readEnvelopeWithAuth<MonazosEarningsSummary>('/monazos/my-earnings' + suffix, token);
}

export async function createLotteryTicketMobile(payload: {
  customerName?: string;
  customerPhone?: string;
  lotteryId: string;
  drawId: string;
  drawDate: string;
  paymentMethod: string;
  paymentProofUrl?: string;
  numbers: Array<{ numberValue: string; amount: number; reventadoAmount?: number }>;
}, token: string) {
  return await postEnvelopeWithAuth<TicketCreateResponse>('/tickets/mobile', token, payload);
}

export async function createMonazosTicketMobile(payload: {
  customerName?: string;
  customerPhone?: string;
  gameId: string;
  drawId: string;
  drawDate: string;
  paymentMethod: string;
  paymentProofUrl?: string;
  plays: Array<{ mode: 'orden' | 'desorden' | 'gallo_tapado'; digits?: string; amount: number }>;
}, token: string) {
  return await postEnvelopeWithAuth<TicketCreateResponse>('/monazos/tickets/mobile', token, payload);
}


export async function sendSellerLocationPing(token: string, payload: { latitude: number; longitude: number; accuracy?: number | null }) {
  return await postEnvelopeWithAuth<{ ok: boolean; recordedAt: string }>('/tracking/ping', token, payload);
}

export async function startSellerConnectionSession(token: string) {
  return await postEnvelopeWithAuth<{ ok: boolean; connectedAt: string; reused?: boolean }>('/tracking/session/start', token, {});
}

export async function sendSellerLocationOffline(token: string) {
  return await postEnvelopeWithAuth<{ ok: boolean; recordedAt: string }>('/tracking/offline', token, {});
}

