import * as React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BrandHeader from '../components/brand-header';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { fetchLotteries, fetchMonazosGames, fetchMyLotterySales, fetchMyMonazosSales, fetchMySellerBalanceSummary, type Lottery, type MonazosGame, type SellerBalanceSummaryItem, type SellerSale } from '../services/api';
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

function formatCurrency(value: number) {
  return 'CRC ' + value.toLocaleString('es-CR');
}

function formatMetricCurrency(value: number) {
  return value.toLocaleString('es-CR');
}

function todayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function HomeScreen() {
  const router = useMobileNav();
  const pathname = router.pathname;
  const {
    tenantSlug,
    tenantLabel,
    recentSales,
    setTenantSlug,
    authUser,
    accessToken,
    login,
    logout,
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

  const loadHomeData = React.useCallback(async (showSpinner = true) => {
    const currentTenant = tenantSlug.trim();
    if (!currentTenant) {
      setLotteries([]);
      setMonazosGames([]);
      setRemoteSales([]);
      setSellerBalance(null);
      setError('');
      if (showSpinner) {
        setLoading(false);
      }
      return;
    }

    try {
      if (showSpinner) {
        setLoading(true);
      }
      setError('');

      const [lotteryData, monazosData] = await Promise.all([
        fetchLotteries(currentTenant),
        fetchMonazosGames(currentTenant),
      ]);

      setLotteries(lotteryData || []);
      setMonazosGames(monazosData || []);

      if (accessToken && authUser?.email) {
        const [lotterySales, monazosSales, balanceRows] = await Promise.all([
          fetchMyLotterySales(accessToken),
          fetchMyMonazosSales(accessToken),
          fetchMySellerBalanceSummary(accessToken, {
            sellerEmail: authUser.email,
          }),
        ]);

        const combinedSales = [...(lotterySales || []), ...(monazosSales || [])].sort((left, right) => {
          const leftTime = new Date(left.drawDate || 0).getTime();
          const rightTime = new Date(right.drawDate || 0).getTime();
          return rightTime - leftTime;
        });

        setRemoteSales(combinedSales);
        const normalizedEmail = authUser.email.trim().toLowerCase();
        const balanceItem = (balanceRows || []).find((item) => item.sellerEmail.trim().toLowerCase() === normalizedEmail) || null;
        setSellerBalance(balanceItem);
      } else {
        setRemoteSales([]);
        setSellerBalance(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el inicio.');
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, [tenantSlug, accessToken, authUser?.email]);


  React.useEffect(() => {
    setTenantDraft(tenantSlug);
  }, [tenantSlug]);

  React.useEffect(() => {
    setEmail(authUser?.email || '');
  }, [authUser?.email]);

  React.useEffect(() => {
    void loadHomeData();
  }, [loadHomeData]);

  React.useEffect(() => {
    if (pathname !== '/' || !authUser?.email || !accessToken) return;
    void loadHomeData(false);
    const interval = setInterval(() => {
      void loadHomeData(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [pathname, authUser?.email, accessToken, loadHomeData]);

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

  const quickActions = React.useMemo<Array<{ key: string; label: string; hint: string; badge: string; tone: 'warm' | 'soft' | 'sky' | 'mint' | 'violet' | 'neutral'; onPress: () => void; disabled: boolean }>>(() => {
    const items: Array<{ key: string; label: string; hint: string; badge: string; tone: 'warm' | 'soft' | 'sky' | 'mint' | 'violet' | 'neutral'; onPress: () => void; disabled: boolean }> = [
      {
        key: 'lottery',
        label: 'Loteria',
        hint: lotteries.length ? `${lotteries.length} disponible(s)` : 'Sin sorteos abiertos',
        badge: 'LT',
        tone: 'warm',
        onPress: () => router.openLottery(lotteries[0]?.id),
        disabled: !authUser || lotteries.length === 0,
      },
      {
        key: 'monazos',
        label: '3 Monazos',
        hint: monazosGames.length ? `${monazosGames.length} disponible(s)` : 'Sin juegos abiertos',
        badge: '3M',
        tone: 'soft',
        onPress: () => router.openMonazos(monazosGames[0]?.id),
        disabled: !authUser || monazosGames.length === 0,
      },
      {
        key: 'tickets',
        label: 'Tickets',
        hint: 'Consulta y anula ventas',
        badge: 'TK',
        tone: 'sky',
        onPress: () => router.replace('/tickets'),
        disabled: !authUser,
      },
      {
        key: 'premios',
        label: 'Premios',
        hint: 'Consulta reclamo y PIN',
        badge: 'PR',
        tone: 'mint',
        onPress: () => router.replace('/premios'),
        disabled: !authUser,
      },
    ];

    if (authUser?.salesCommissionEnabled) {
      items.push({
        key: 'ganancias',
        label: 'Ganancias',
        hint: 'Comisiones y resumen',
        badge: 'GN',
        tone: 'violet' as const,
        onPress: () => router.replace('/ganancias'),
        disabled: !authUser,
      });
    }

    items.push({
      key: 'printer',
      label: 'Impresora',
      hint: printerConfig ? printerConfig.printerName : 'Configurar equipo',
      badge: 'BT',
      tone: 'neutral' as const,
      onPress: () => router.replace('/printer'),
      disabled: false,
    });

    return items;
  }, [authUser, lotteries, monazosGames, printerConfig, router]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.heroCard}>
          <View style={styles.heroGlowTop} />
          <BrandHeader
            section="CENTRO DE VENTAS"
            title="ONE Movil"
            description={tenantLabel}
            note="Vende rapido, controla tu caja y resuelve premios desde una sola vista."
            sectionColor="#d43a2f"
            titleColor="#1f1d18"
            bodyColor="#6d6256"
          />
          <View style={styles.heroMetaRow}>
            <View style={styles.heroStatusPillMuted}>
              <ThemedText type="small" style={styles.heroStatusTextMuted}>{authUser ? 'Vendedor activo' : 'Sin sesion'}</ThemedText>
            </View>
          </View>
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatCard}>
              <ThemedText type="small" style={styles.heroStatLabel}>Loterias</ThemedText>
              <ThemedText style={styles.heroStatValue}>{loading ? '...' : String(lotteries.length)}</ThemedText>
            </View>
            <View style={styles.heroStatCard}>
              <ThemedText type="small" style={styles.heroStatLabel}>3 Monazos</ThemedText>
              <ThemedText style={styles.heroStatValue}>{loading ? '...' : String(monazosGames.length)}</ThemedText>
            </View>
            <View style={styles.heroStatCard}>
              <ThemedText type="small" style={styles.heroStatLabel}>Caja</ThemedText>
              <ThemedText style={styles.heroStatValueSmall}>{authUser ? formatMetricCurrency(todaySellerBalance.operationalBalance) : 'Sin login'}</ThemedText>
            </View>
          </View>
          {locationError ? <ThemedText style={styles.inlineError}>{locationError}</ThemedText> : null}
          {error ? <ThemedText style={styles.inlineError}>{error}</ThemedText> : null}
        </ThemedView>

        <ThemedView style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <ThemedText style={styles.sectionEyebrow}>ACCESO</ThemedText>
              <ThemedText style={styles.sectionTitle}>Sesion del vendedor</ThemedText>
            </View>
            <ThemedText type="small" style={styles.sectionNote}>{authUser ? 'Activa' : 'Requerida'}</ThemedText>
          </View>

          {authUser ? (
            <View style={styles.sessionCard}>
              <View style={styles.sessionIdentity}>
                <View style={styles.sessionAvatar}><ThemedText type="small" style={styles.sessionAvatarText}>VD</ThemedText></View>
                <View style={{ flex: 1, gap: 2 }}>
                  <ThemedText style={styles.sessionPrimary}>{authUser.email}</ThemedText>
                  <ThemedText type="small" style={styles.sessionSecondary}>Rol {authUser.role} ï¿½ Tenant {authUser.tenant?.slug || tenantSlug}</ThemedText>
                </View>
              </View>
              <Pressable style={styles.ghostButton} onPress={() => void handleLogout()}>
                <ThemedText type="small" style={styles.ghostButtonText}>Cerrar sesion</ThemedText>
              </Pressable>
            </View>
          ) : (
            <View style={styles.formWrap}>
              <TextInput style={styles.input} value={tenantDraft} onChangeText={setTenantDraft} autoCapitalize="none" autoCorrect={false} placeholder="Slug del tenant" placeholderTextColor="#9aa4b2" />
              <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="Correo del vendedor" placeholderTextColor="#9aa4b2" />
              <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Contrasena" placeholderTextColor="#9aa4b2" />
              <View style={styles.formActions}>
                <Pressable style={styles.ghostButton} onPress={() => void applyTenant()}>
                  {savingTenant ? <ActivityIndicator color="#915228" /> : <ThemedText type="small" style={styles.ghostButtonText}>Aplicar tenant</ThemedText>}
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={() => void handleLogin()}>
                  {loggingIn ? <ActivityIndicator color="#fff" /> : <ThemedText type="small" style={styles.primaryButtonText}>Entrar</ThemedText>}
                </Pressable>
              </View>
            </View>
          )}
        </ThemedView>

        {authUser ? (
          <ThemedView style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View>
                <ThemedText style={styles.sectionEyebrow}>CAJA</ThemedText>
                <ThemedText style={styles.sectionTitle}>Resumen operativo</ThemedText>
              </View>
              <ThemedText type="small" style={styles.sectionNote}>Solo lectura</ThemedText>
            </View>

            <View style={styles.balanceHero}>
              <ThemedText type="small" style={styles.balanceHeroLabel}>Disponible para operar</ThemedText>
              <ThemedText style={styles.balanceHeroValue}>{formatCurrency(todaySellerBalance.operationalBalance)}</ThemedText>
              <ThemedText type="small" style={styles.balanceHeroHint}>No incluye comisiones. Refleja caja real para ventas y pago de premios.</ThemedText>
              <View style={styles.balanceHeroMetaRow}>
                <View style={styles.balanceMiniPill}>
                  <ThemedText type="small" style={styles.balanceMiniPillText}>Ventas {formatMetricCurrency(todaySellerBalance.totalCashSales)}</ThemedText>
                </View>
                <View style={styles.balanceMiniPill}>
                  <ThemedText type="small" style={styles.balanceMiniPillText}>Premios {formatMetricCurrency(todaySellerBalance.totalPrizePayments)}</ThemedText>
                </View>
              </View>
            </View>

            <View style={styles.metricGrid}>
              <View style={styles.metricCard}>
                <ThemedText type="small" style={styles.metricLabel}>Ventas efectivo</ThemedText>
                <ThemedText style={styles.metricValue}>{formatMetricCurrency(todaySellerBalance.totalCashSales)}</ThemedText>
              </View>
              <View style={styles.metricCard}>
                <ThemedText type="small" style={styles.metricLabel}>Premios pagados</ThemedText>
                <ThemedText style={styles.metricValue}>{formatMetricCurrency(todaySellerBalance.totalPrizePayments)}</ThemedText>
              </View>
              <View style={styles.metricCard}>
                <ThemedText type="small" style={styles.metricLabel}>Admin te paso</ThemedText>
                <ThemedText style={styles.metricValue}>{formatMetricCurrency(todaySellerBalance.adminToSeller)}</ThemedText>
              </View>
              <View style={styles.metricCard}>
                <ThemedText type="small" style={styles.metricLabel}>Tu entregaste</ThemedText>
                <ThemedText style={styles.metricValue}>{formatMetricCurrency(todaySellerBalance.sellerToAdmin)}</ThemedText>
              </View>
            </View>

            <View style={styles.subtleRow}>
              <View style={styles.subtleCard}>
                <ThemedText type="small" style={styles.subtleLabel}>Saldo inicial</ThemedText>
                <ThemedText type="small" style={styles.subtleValue}>{formatCurrency(todaySellerBalance.openingBalance)}</ThemedText>
              </View>
              <View style={styles.subtleCard}>
                <ThemedText type="small" style={styles.subtleLabel}>Ajustes</ThemedText>
                <ThemedText type="small" style={styles.subtleValue}>+ {formatMetricCurrency(todaySellerBalance.manualAdjustmentIn)} / - {formatMetricCurrency(todaySellerBalance.manualAdjustmentOut)}</ThemedText>
              </View>
            </View>
          </ThemedView>
        ) : null}

        <ThemedView style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <ThemedText style={styles.sectionEyebrow}>ACCESOS</ThemedText>
              <ThemedText style={styles.sectionTitle}>Centro rapido</ThemedText>
            </View>
            <ThemedText type="small" style={styles.sectionNote}>Flujo diario</ThemedText>
          </View>

          <View style={styles.quickGrid}>
            {quickActions.map((item) => {
              const toneStyle =
                item.tone === 'warm'
                  ? styles.quickBadgeWarm
                  : item.tone === 'soft'
                    ? styles.quickBadgeSoft
                    : item.tone === 'sky'
                      ? styles.quickBadgeSky
                      : item.tone === 'mint'
                        ? styles.quickBadgeMint
                        : item.tone === 'violet'
                          ? styles.quickBadgeViolet
                          : styles.quickBadgeNeutral;

              return (
                <Pressable
                  key={item.key}
                  style={[styles.quickCard, item.disabled && styles.quickCardDisabled]}
                  onPress={item.onPress}
                  disabled={item.disabled}
                >
                  <View style={[styles.quickBadge, toneStyle]}>
                    <ThemedText type="small" style={styles.quickBadgeText}>{item.badge}</ThemedText>
                  </View>
                  <ThemedText style={styles.quickTitle}>{item.label}</ThemedText>
                  <ThemedText type="small" style={styles.quickHint}>{item.hint}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </ThemedView>

        <ThemedView style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <ThemedText style={styles.sectionEyebrow}>ACTIVIDAD</ThemedText>
              <ThemedText style={styles.sectionTitle}>Ventas recientes</ThemedText>
            </View>
            <ThemedText type="small" style={styles.sectionNote}>{sellerRecentSales.length} visibles</ThemedText>
          </View>

          {sellerRecentSales.length ? (
            <View style={styles.salesList}>
              {sellerRecentSales.map((sale) => (
                <View key={sale.ticketCode} style={styles.saleCard}>
                  <View style={styles.saleTopRow}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <ThemedText style={styles.saleCode}>{sale.ticketCode}</ThemedText>
                      <ThemedText type="small" style={styles.saleGame}>{sale.gameLabel}</ThemedText>
                    </View>
                    <View style={styles.saleStatusPill}>
                      <ThemedText type="small" style={styles.saleStatusText}>{sale.status}</ThemedText>
                    </View>
                  </View>
                  <ThemedText type="small" style={styles.saleMeta}>{sale.customerName}</ThemedText>
                  <ThemedText type="small" style={styles.saleMeta}>{sale.drawLabel}</ThemedText>
                  <View style={styles.saleBottomRow}>
                    <ThemedText style={styles.saleAmount}>{sale.totalAmount}</ThemedText>
                    <ThemedText type="small" style={styles.saleTime}>{sale.createdAt}</ThemedText>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <ThemedText type="small" style={styles.emptyState}>{authUser ? 'Todavia no hay ventas registradas para este vendedor.' : 'Inicia sesion para ver la actividad del vendedor.'}</ThemedText>
          )}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#eef3f8',
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 28,
  },
  heroCard: {
    borderRadius: 30,
    padding: 18,
    gap: 14,
    backgroundColor: '#fffaf2',
    borderWidth: 1,
    borderColor: '#f2e3cf',
    overflow: 'hidden',
  },
  heroGlowTop: {
    position: 'absolute',
    top: -20,
    right: -10,
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: '#fde7cf',
    opacity: 0.55,
  },
  heroMetaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  heroStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  heroStatusPillMuted: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5ede1',
  },
  heroStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  heroStatusDotOn: {
    backgroundColor: '#22c55e',
  },
  heroStatusDotOff: {
    backgroundColor: '#ef4444',
  },
  heroStatusText: {
    color: '#4b5563',
    fontSize: 13,
    lineHeight: 18,
  },
  heroStatusTextMuted: {
    color: '#75695b',
    fontSize: 13,
    lineHeight: 18,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  heroStatCard: {
    flex: 1,
    minHeight: 76,
    borderRadius: 20,
    padding: 12,
    gap: 5,
    backgroundColor: '#fff',
  },
  heroStatLabel: {
    color: '#8b6c49',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.4,
  },
  heroStatValue: {
    color: '#1f1d18',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
  },
  heroStatValueSmall: {
    color: '#1f1d18',
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  inlineError: {
    color: '#b91c1c',
    fontSize: 13,
    lineHeight: 18,
  },
  sectionCard: {
    borderRadius: 26,
    padding: 16,
    gap: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e7edf4',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionEyebrow: {
    color: '#b45309',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.6,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#17212b',
    fontSize: 22,
    lineHeight: 26,
    fontWeight: '800',
  },
  sectionNote: {
    color: '#7c8795',
    fontSize: 12,
    lineHeight: 16,
  },
  sessionCard: {
    borderRadius: 20,
    padding: 14,
    gap: 12,
    backgroundColor: '#f7fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sessionIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sessionAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fee2e2',
  },
  sessionAvatarText: {
    color: '#b91c1c',
    fontWeight: '800',
  },
  sessionPrimary: {
    color: '#17212b',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  sessionSecondary: {
    color: '#6b7280',
  },
  formWrap: {
    gap: 10,
  },
  input: {
    minHeight: 52,
    borderRadius: 18,
    paddingHorizontal: 15,
    backgroundColor: '#f8fbff',
    borderWidth: 1,
    borderColor: '#d9e5f2',
    color: '#17212b',
    fontSize: 15,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#cd2e24',
  },
  primaryButtonText: {
    color: '#fff7ec',
    fontWeight: '800',
  },
  ghostButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff3de',
  },
  ghostButtonText: {
    color: '#9a4e1a',
    fontWeight: '700',
  },
  balanceHero: {
    borderRadius: 22,
    padding: 16,
    gap: 4,
    backgroundColor: '#fff7e8',
    borderWidth: 1,
    borderColor: '#f6e1bf',
  },
  balanceHeroLabel: {
    color: '#a16207',
    letterSpacing: 1.1,
    fontSize: 12,
    lineHeight: 16,
  },
  balanceHeroValue: {
    color: '#1f1d18',
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
  },
  balanceHeroHint: {
    color: '#766453',
    fontSize: 13,
    lineHeight: 18,
  },
  balanceHeroMetaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  balanceMiniPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#fff7e2' },
  balanceMiniPillText: { color: '#8a4b10', fontWeight: '700' },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    minWidth: 140,
    borderRadius: 18,
    padding: 12,
    gap: 4,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  metricLabel: {
    color: '#7b8794',
    fontSize: 12,
    lineHeight: 16,
  },
  metricValue: {
    color: '#17212b',
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
  },
  subtleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  subtleCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    gap: 3,
    backgroundColor: '#fbfcfe',
    borderWidth: 1,
    borderColor: '#edf2f7',
  },
  subtleLabel: {
    color: '#7b8794',
    fontSize: 12,
    lineHeight: 16,
  },
  subtleValue: {
    color: '#334155',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickCard: {
    minHeight: 108,
    width: '48%',
    minWidth: 148,
    borderRadius: 22,
    padding: 14,
    gap: 10,
    backgroundColor: '#fbfdff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickCardDisabled: {
    opacity: 0.55,
  },
  quickTextBlock: { flex: 1, gap: 3 },
  quickBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  quickBadgeWarm: {
    backgroundColor: '#fff1d6',
  },
  quickBadgeSoft: {
    backgroundColor: '#ffe4e6',
  },
  quickBadgeSky: {
    backgroundColor: '#e0f2fe',
  },
  quickBadgeMint: {
    backgroundColor: '#dcfce7',
  },
  quickBadgeViolet: {
    backgroundColor: '#ede9fe',
  },
  quickBadgeNeutral: {
    backgroundColor: '#e2e8f0',
  },
  quickBadgeText: {
    color: '#17212b',
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  quickTitle: {
    color: '#17212b',
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '800',
  },
  quickHint: {
    color: '#6b7280',
    lineHeight: 18,
  },
  salesList: {
    gap: 10,
  },
  saleCard: {
    borderRadius: 20,
    padding: 14,
    gap: 8,
    backgroundColor: '#fbfdff',
    borderWidth: 1,
    borderColor: '#e5edf6',
  },
  saleTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  saleCode: {
    color: '#17212b',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  saleGame: {
    color: '#667085',
  },
  saleStatusPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff3de',
  },
  saleStatusText: {
    color: '#9a4e1a',
  },
  saleMeta: {
    color: '#667085',
    lineHeight: 18,
  },
  saleBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  saleAmount: {
    color: '#111827',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
  },
  saleTime: {
    color: '#94a3b8',
    textAlign: 'right',
    flex: 1,
  },
  emptyState: {
    color: '#7c8795',
    lineHeight: 18,
  },
});








