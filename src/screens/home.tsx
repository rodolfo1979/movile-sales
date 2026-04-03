import * as React from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchLotteries, fetchMonazosGames, fetchMyLotterySales, fetchMyMonazosSales, fetchMySellerBalanceSummary, type Lottery, type MonazosGame, type SellerBalanceSummaryItem, type SellerSale } from '../services/api';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { useAppSession } from '../contexts/app-session';
import { useMobileNav } from '../contexts/mobile-nav';

type HomeSale = {
  ticketCode: string;
  gameLabel: string;
  drawLabel: string;
  totalAmount: string;
  status: string;
  customerName: string;
  createdAt: string;
  sellerEmail?: string;
};

export default function HomeScreen() {
  const router = useMobileNav();
  const {
    tenantSlug,
    tenantLabel,
    recentSales,
    setTenantSlug,
    authUser,
    accessToken,
    login,
    logout,
    locationEnabled,
    locationError,
    printerConfig,
  } = useAppSession();
  const [loading, setLoading] = React.useState(true);
  const [savingTenant, setSavingTenant] = React.useState(false);
  const [loggingIn, setLoggingIn] = React.useState(false);
  const [error, setError] = React.useState('');
  const [lotteries, setLotteries] = React.useState<Lottery[]>([]);
  const [monazosGames, setMonazosGames] = React.useState<MonazosGame[]>([]);
  const [remoteSales, setRemoteSales] = React.useState<SellerSale[]>([]);
  const [sellerBalance, setSellerBalance] = React.useState<SellerBalanceSummaryItem | null>(null);
  const [tenantDraft, setTenantDraft] = React.useState(tenantSlug);
  const [email, setEmail] = React.useState(authUser?.email || '');
  const [password, setPassword] = React.useState('');

  React.useEffect(() => {
    setTenantDraft(tenantSlug);
  }, [tenantSlug]);

  React.useEffect(() => {
    setEmail(authUser?.email || '');
  }, [authUser?.email]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError('');
        const requests: Promise<any>[] = [fetchLotteries(tenantSlug), fetchMonazosGames(tenantSlug)];
        if (authUser?.email && accessToken) {
          requests.push(
            fetchMyLotterySales(accessToken),
            fetchMyMonazosSales(accessToken),
            fetchMySellerBalanceSummary(accessToken, { date: new Date().toISOString().slice(0, 10), sellerEmail: authUser.email }),
          );
        }
        const [lotteriesData, monazosData, myLotterySales = [], myMonazosSales = [], sellerBalanceSummary = []] = await Promise.all(requests);
        if (cancelled) return;
        setLotteries(lotteriesData);
        setMonazosGames(monazosData);
        setRemoteSales([...(myLotterySales as SellerSale[]), ...(myMonazosSales as SellerSale[])]);
        setSellerBalance((sellerBalanceSummary as SellerBalanceSummaryItem[])[0] || null);
      } catch (err) {
        if (cancelled) return;
        setLotteries([]);
        setMonazosGames([]);
        setRemoteSales([]);
        setSellerBalance(null);
        setError(err instanceof Error ? err.message : 'No se pudo cargar la app.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, authUser?.email, accessToken]);

  const sellerRecentSales = React.useMemo<HomeSale[]>(() => {
    const localSales: HomeSale[] = !authUser?.email
      ? recentSales
      : recentSales.filter((sale) => sale.sellerEmail === authUser.email);

    if (!authUser?.email) return localSales;

    const remoteMapped: HomeSale[] = remoteSales.map((sale) => ({
      ticketCode: sale.ticketCode,
      gameLabel: sale.lottery?.name || sale.game?.name || 'Venta',
      drawLabel: (sale.draw?.name || 'Sorteo') + (sale.draw?.drawTime ? ' | ' + sale.draw.drawTime : ''),
      totalAmount: 'CRC ' + sale.totalAmount,
      status: sale.status,
      customerName: sale.customerName || 'Cliente general',
      createdAt: new Date(sale.drawDate || '').toLocaleString('es-CR'),
      sellerEmail: sale.sellerEmail || authUser.email,
    }));

    return [
      ...remoteMapped,
      ...localSales.filter((sale) => !remoteMapped.some((item) => item.ticketCode === sale.ticketCode)),
    ].slice(0, 8);
  }, [authUser?.email, recentSales, remoteSales]);

  async function applyTenant() {
    const normalized = tenantDraft.trim();
    if (!normalized) {
      Alert.alert('Tenant', 'Escribe el slug del tenant que quieres usar.');
      return;
    }
    try {
      setSavingTenant(true);
      await setTenantSlug(normalized);
    } finally {
      setSavingTenant(false);
    }
  }

  async function handleLogin() {
    if (!tenantDraft.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Acceso vendedor', 'Completa tenant, correo y contrasena.');
      return;
    }
    try {
      setLoggingIn(true);
      setError('');
      const response = await login({ tenantSlug: tenantDraft.trim(), email: email.trim(), password });
      setPassword('');
      Alert.alert('Sesion iniciada', 'Acceso activo para ' + response.user.email + '.');
    } catch (err) {
      Alert.alert('No se pudo iniciar sesion', err instanceof Error ? err.message : 'Error de acceso.');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    await logout();
    setPassword('');
    setRemoteSales([]);
    setSellerBalance(null);
    Alert.alert('Sesion cerrada', 'La app quedo sin vendedor autenticado.');
  }

  const todaySellerBalance = sellerBalance || {
    sellerEmail: authUser?.email || '',
    openingBalance: 0,
    adminToSeller: 0,
    sellerToAdmin: 0,
    manualAdjustmentIn: 0,
    manualAdjustmentOut: 0,
    lotteryCashSales: 0,
    monazosCashSales: 0,
    totalCashSales: 0,
    lotteryPrizePayments: 0,
    monazosPrizePayments: 0,
    totalPrizePayments: 0,
    operationalBalance: 0,
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.heroCard}>
          <View style={styles.heroTop}>
            <Image source={require('../../assets/images/icon.png')} style={styles.brandIcon} resizeMode="contain" />
            <View style={styles.heroTextWrap}>
              <ThemedText type="small" style={styles.eyebrow}>ONE</ThemedText>
              <ThemedText type="title" style={styles.heroTitle}>Centro de ventas</ThemedText>
              <ThemedText style={styles.heroCopy}>{tenantLabel}</ThemedText>
              <ThemedText style={styles.heroSubcopy}>Una sola app para elegir el juego, vender rapido y compartir el ticket.</ThemedText>
            </View>
            <View style={styles.statusColumn}>
              <View style={[styles.statusDot, locationEnabled ? styles.statusDotOn : styles.statusDotOff]} />
              <ThemedText type="small" style={styles.statusText}>{locationEnabled ? 'OK' : 'OFF'}</ThemedText>
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroMetric}>
              <ThemedText type="small" style={styles.heroMetricLabel}>Loterias</ThemedText>
              <ThemedText type="subtitle" style={styles.heroMetricValue}>{loading ? '...' : String(lotteries.length)}</ThemedText>
            </View>
            <View style={styles.heroMetric}>
              <ThemedText type="small" style={styles.heroMetricLabel}>3 Monazos</ThemedText>
              <ThemedText type="subtitle" style={styles.heroMetricValue}>{loading ? '...' : String(monazosGames.length)}</ThemedText>
            </View>
            <View style={styles.heroMetric}>
              <ThemedText type="small" style={styles.heroMetricLabel}>Vendedor</ThemedText>
              <ThemedText type="small" style={styles.heroMetricValueSmall}>{authUser ? 'Activo' : 'Sin login'}</ThemedText>
            </View>
          </View>
          {locationError ? <ThemedText style={styles.heroError}>{locationError}</ThemedText> : null}
          {error ? <ThemedText style={styles.heroError}>{error}</ThemedText> : null}
        </ThemedView>

        <ThemedView style={styles.surfaceCard}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Acceso del vendedor</ThemedText>
            <ThemedText type="small" style={styles.sectionNote}>{authUser ? 'Sesion activa' : 'Login requerido para vender'}</ThemedText>
          </View>
          {authUser ? (
            <View style={styles.sessionPanel}>
              <View style={styles.sessionMeta}>
                <ThemedText type="subtitle">{authUser.email}</ThemedText>
                <ThemedText style={styles.sessionText}>Rol {authUser.role}</ThemedText>
                <ThemedText style={styles.sessionText}>Tenant {authUser.tenant?.slug || tenantSlug}</ThemedText>
              </View>
              <Pressable style={styles.secondaryButton} onPress={() => void handleLogout()}>
                <ThemedText type="small" style={styles.secondaryButtonText}>Cerrar sesion</ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.loginForm}>
              <TextInput style={styles.input} value={tenantDraft} onChangeText={setTenantDraft} autoCapitalize="none" autoCorrect={false} placeholder="Slug del tenant" placeholderTextColor="#94a3b8" />
              <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Correo del vendedor" placeholderTextColor="#94a3b8" />
              <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Contrasena" placeholderTextColor="#94a3b8" />
              <View style={styles.inlineButtons}>
                <Pressable style={styles.secondaryButton} onPress={() => void applyTenant()}>
                  {savingTenant ? <ActivityIndicator color="#9a3412" /> : <ThemedText type="small" style={styles.secondaryButtonText}>Aplicar tenant</ThemedText>}
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={() => void handleLogin()}>
                  {loggingIn ? <ActivityIndicator color="#ffffff" /> : <ThemedText type="small" style={styles.primaryButtonText}>Entrar</ThemedText>}
                </Pressable>
              </View>
            </View>
          )}
        </ThemedView>

        {authUser ? (
          <ThemedView style={styles.surfaceCard}>
            <View style={styles.sectionHeader}>
              <ThemedText type="subtitle">Caja del vendedor</ThemedText>
              <ThemedText type="small" style={styles.sectionNote}>Saldo operativo del dia</ThemedText>
            </View>
            <View style={styles.balanceHero}>
              <ThemedText type="small" style={styles.balanceHeroLabel}>Disponible para operar</ThemedText>
              <ThemedText type="title" style={styles.balanceHeroValue}>CRC {todaySellerBalance.operationalBalance.toLocaleString('es-CR')}</ThemedText>
              <ThemedText style={styles.balanceHeroHint}>No incluye comisiones. Si el admin te pasa dinero o devuelves caja, aqui se refleja.</ThemedText>
            </View>
            <View style={styles.balanceGrid}>
              <View style={styles.balanceMetricCard}>
                <ThemedText type="small" style={styles.balanceMetricLabel}>Ventas efectivo</ThemedText>
                <ThemedText type="subtitle" style={styles.balanceMetricValue}>CRC {todaySellerBalance.totalCashSales.toLocaleString('es-CR')}</ThemedText>
              </View>
              <View style={styles.balanceMetricCard}>
                <ThemedText type="small" style={styles.balanceMetricLabel}>Premios pagados</ThemedText>
                <ThemedText type="subtitle" style={styles.balanceMetricValue}>CRC {todaySellerBalance.totalPrizePayments.toLocaleString('es-CR')}</ThemedText>
              </View>
              <View style={styles.balanceMetricCard}>
                <ThemedText type="small" style={styles.balanceMetricLabel}>Admin te paso</ThemedText>
                <ThemedText type="subtitle" style={styles.balanceMetricValue}>CRC {todaySellerBalance.adminToSeller.toLocaleString('es-CR')}</ThemedText>
              </View>
              <View style={styles.balanceMetricCard}>
                <ThemedText type="small" style={styles.balanceMetricLabel}>Tu entregaste</ThemedText>
                <ThemedText type="subtitle" style={styles.balanceMetricValue}>CRC {todaySellerBalance.sellerToAdmin.toLocaleString('es-CR')}</ThemedText>
              </View>
            </View>
            <View style={styles.balanceSplitRow}>
              <View style={styles.balanceMiniCard}>
                <ThemedText type="small" style={styles.balanceMetricLabel}>Saldo inicial</ThemedText>
                <ThemedText style={styles.balanceMiniValue}>CRC {todaySellerBalance.openingBalance.toLocaleString('es-CR')}</ThemedText>
              </View>
              <View style={styles.balanceMiniCard}>
                <ThemedText type="small" style={styles.balanceMetricLabel}>Ajustes</ThemedText>
                <ThemedText style={styles.balanceMiniValue}>+ CRC {todaySellerBalance.manualAdjustmentIn.toLocaleString('es-CR')} | - CRC {todaySellerBalance.manualAdjustmentOut.toLocaleString('es-CR')}</ThemedText>
              </View>
            </View>
          </ThemedView>
        ) : null}
        <ThemedView style={styles.surfaceCard}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Impresora del turno</ThemedText>
            <ThemedText type="small" style={styles.sectionNote}>{printerConfig ? printerConfig.printerName : 'Sin configurar'}</ThemedText>
          </View>
          <Pressable style={styles.catalogRow} onPress={() => router.replace('/printer')}>
            <View style={styles.catalogBadge}><ThemedText type="small" style={styles.catalogBadgeText}>PR</ThemedText></View>
            <View style={styles.catalogCopy}>
              <ThemedText type="subtitle">Configuracion de impresora</ThemedText>
              <ThemedText style={styles.catalogHint}>{printerConfig ? 'Lista para auto print' : 'Conecta y guarda la impresora del vendedor'}</ThemedText>
            </View>
            <ThemedText type="small" style={styles.catalogAction}>Abrir</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.surfaceCard}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Seleccion de venta</ThemedText>
            <ThemedText type="small" style={styles.sectionNote}>Toca el juego que el cliente desea jugar</ThemedText>
          </View>
          <View style={styles.catalogSection}>
            <ThemedText type="small" style={styles.catalogEyebrow}>LOTERIAS DISPONIBLES</ThemedText>
            <View style={styles.catalogList}>
              {lotteries.length ? lotteries.map((lottery) => (
                <Pressable key={lottery.id} style={styles.catalogRow} onPress={() => router.openLottery(lottery.id)}>
                  <View style={styles.catalogBadge}><ThemedText type="small" style={styles.catalogBadgeText}>LT</ThemedText></View>
                  <View style={styles.catalogCopy}>
                    <ThemedText type="subtitle">{lottery.name}</ThemedText>
                    <ThemedText style={styles.catalogHint}>{lottery.draws.length} sorteo(s) disponible(s)</ThemedText>
                  </View>
                  <ThemedText type="small" style={styles.catalogAction}>Abrir</ThemedText>
                </Pressable>
              )) : <ThemedText style={styles.emptyText}>No hay loterias abiertas en este momento.</ThemedText>}
            </View>
          </View>
          <View style={styles.catalogSection}>
            <ThemedText type="small" style={styles.catalogEyebrow}>3 MONAZOS DISPONIBLES</ThemedText>
            <View style={styles.catalogList}>
              {monazosGames.length ? monazosGames.map((game) => (
                <Pressable key={game.id} style={styles.catalogRow} onPress={() => router.openMonazos(game.id)}>
                  <View style={[styles.catalogBadge, styles.catalogBadgeAlt]}><ThemedText type="small" style={styles.catalogBadgeText}>3M</ThemedText></View>
                  <View style={styles.catalogCopy}>
                    <ThemedText type="subtitle">{game.name}</ThemedText>
                    <ThemedText style={styles.catalogHint}>{game.draws.length} sorteo(s) disponible(s)</ThemedText>
                  </View>
                  <ThemedText type="small" style={styles.catalogAction}>Abrir</ThemedText>
                </Pressable>
              )) : <ThemedText style={styles.emptyText}>No hay juegos de 3 Monazos abiertos.</ThemedText>}
            </View>
          </View>
        </ThemedView>

        <ThemedView style={styles.surfaceCard}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Ventas recientes</ThemedText>
            <ThemedText type="small" style={styles.sectionNote}>{sellerRecentSales.length} visibles</ThemedText>
          </View>
          {sellerRecentSales.length ? (
            <View style={styles.salesList}>
              {sellerRecentSales.map((sale) => (
                <View key={sale.ticketCode} style={styles.saleCard}>
                  <View style={styles.saleTop}>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="subtitle">{sale.ticketCode}</ThemedText>
                      <ThemedText style={styles.saleText}>{sale.gameLabel}</ThemedText>
                    </View>
                    <View style={styles.saleStatus}>
                      <ThemedText type="small" style={styles.saleStatusText}>{sale.status}</ThemedText>
                    </View>
                  </View>
                  <ThemedText style={styles.saleText}>{sale.customerName}</ThemedText>
                  <ThemedText style={styles.saleText}>{sale.drawLabel}</ThemedText>
                  <ThemedText style={styles.saleText}>Total {sale.totalAmount}</ThemedText>
                  <ThemedText style={styles.saleMuted}>{sale.createdAt}</ThemedText>
                </View>
              ))}
            </View>
          ) : (
            <ThemedText style={styles.emptyText}>{authUser ? 'Todavia no hay ventas registradas para este vendedor.' : 'Inicia sesion para ver el historial del vendedor.'}</ThemedText>
          )}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f1ea' },
  content: { padding: 16, gap: 14, paddingBottom: 26 },
  heroCard: { borderRadius: 30, padding: 20, gap: 14, backgroundColor: '#fffaf1', borderWidth: 1, borderColor: '#f6d8a8' },
  heroTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  brandIcon: { width: 66, height: 66, borderRadius: 18, backgroundColor: '#fff' },
  heroTextWrap: { flex: 1, gap: 3 },
  eyebrow: { color: '#b91c1c', letterSpacing: 2.8, fontWeight: '800' },
  heroTitle: { color: '#22160d', fontSize: 30, lineHeight: 36, fontWeight: '800' },
  heroCopy: { color: '#6b3d15', fontWeight: '700' },
  heroSubcopy: { color: '#7c6855', lineHeight: 20 },
  statusColumn: { alignItems: 'center', gap: 6 },
  statusDot: { width: 14, height: 14, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(0,0,0,0.08)' },
  statusDotOn: { backgroundColor: '#22c55e' },
  statusDotOff: { backgroundColor: '#ef4444' },
  statusText: { color: '#7c6855' },
  heroStats: { flexDirection: 'row', gap: 10 },
  heroMetric: { flex: 1, borderRadius: 18, padding: 12, backgroundColor: '#fff' },
  heroMetricLabel: { color: '#8f6b45' },
  heroMetricValue: { color: '#22160d' },
  heroMetricValueSmall: { color: '#22160d' },
  heroError: { color: '#b91c1c', lineHeight: 20 },
  surfaceCard: { borderRadius: 26, padding: 18, gap: 14, backgroundColor: '#ffffff' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  sectionNote: { color: '#8b7d70', flexShrink: 1 },
  balanceHero: { borderRadius: 22, padding: 16, gap: 6, backgroundColor: '#fff7e2', borderWidth: 1, borderColor: '#f4ddb0' },
  balanceHeroLabel: { color: '#9a3412', letterSpacing: 1.2 },
  balanceHeroValue: { color: '#7f1d1d', fontSize: 28, lineHeight: 34, fontWeight: '800' },
  balanceHeroHint: { color: '#7c6855', lineHeight: 20 },
  balanceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  balanceMetricCard: { width: '48%', minWidth: 140, borderRadius: 18, padding: 12, backgroundColor: '#faf6ee', borderWidth: 1, borderColor: '#efe2cd', gap: 4 },
  balanceMetricLabel: { color: '#8f6b45' },
  balanceMetricValue: { color: '#22160d' },
  balanceSplitRow: { flexDirection: 'row', gap: 10 },
  balanceMiniCard: { flex: 1, borderRadius: 18, padding: 12, backgroundColor: '#fffaf1', borderWidth: 1, borderColor: '#f4e6cd', gap: 4 },
  balanceMiniValue: { color: '#5f5348' },
  sessionPanel: { borderRadius: 20, padding: 14, gap: 12, backgroundColor: '#faf6ee', borderWidth: 1, borderColor: '#efe2cd' },
  sessionMeta: { gap: 4 },
  sessionText: { color: '#6f6255' },
  loginForm: { gap: 10 },
  input: { borderRadius: 16, minHeight: 54, paddingHorizontal: 16, backgroundColor: '#faf6ee', borderWidth: 1, borderColor: '#efe2cd', color: '#22160d' },
  inlineButtons: { flexDirection: 'row', gap: 10 },
  primaryButton: { flex: 1, borderRadius: 16, minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: '#c81e1e' },
  primaryButtonText: { color: '#fff7d1' },
  secondaryButton: { flex: 1, borderRadius: 16, minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff3cf' },
  secondaryButtonText: { color: '#9a3412' },
  catalogSection: { gap: 10 },
  catalogEyebrow: { color: '#9a3412', letterSpacing: 1.6 },
  catalogList: { gap: 10 },
  catalogRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14, backgroundColor: '#faf6ee', borderWidth: 1, borderColor: '#efe2cd' },
  catalogBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff3cf' },
  catalogBadgeAlt: { backgroundColor: '#fee2e2' },
  catalogBadgeText: { color: '#b91c1c', fontWeight: '800' },
  catalogCopy: { flex: 1, gap: 2 },
  catalogHint: { color: '#7c6855' },
  catalogAction: { color: '#b91c1c' },
  emptyText: { color: '#8b7d70', lineHeight: 20 },
  salesList: { gap: 10 },
  saleCard: { borderRadius: 18, padding: 14, gap: 6, backgroundColor: '#faf6ee', borderWidth: 1, borderColor: '#efe2cd' },
  saleTop: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  saleStatus: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#fff3cf' },
  saleStatusText: { color: '#9a3412' },
  saleText: { color: '#5f5348' },
  saleMuted: { color: '#8b7d70' },
});





