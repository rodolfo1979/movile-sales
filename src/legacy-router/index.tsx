import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchLotteries, fetchMonazosGames, fetchMyLotterySales, fetchMyMonazosSales, type SellerSale } from '@/services/api';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppSession } from '@/contexts/app-session';
import { useMobileNav } from '@/contexts/mobile-nav';

const actions = [
  { title: 'Venta de loteria', note: 'Captura numeros, montos y bloqueos por sorteo.', tone: 'blue', href: '/loteria' },
  { title: '3 Monazos', note: 'Orden, desorden y gallo tapado en un flujo rapido.', tone: 'violet', href: '/monazos' },
  { title: 'Tickets', note: 'Consulta, comparte y reimprime tickets recientes.', tone: 'green', href: '/tickets' },
] as const;

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
  const { tenantSlug, tenantLabel, tenantInitials, recentSales, setTenantSlug, authUser, accessToken, login, logout, locationEnabled, locationError } = useAppSession();
  const [loading, setLoading] = useState(true);
  const [savingTenant, setSavingTenant] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({ lotteries: 0, monazos: 0 });
  const [remoteSales, setRemoteSales] = useState<SellerSale[]>([]);
  const [tenantDraft, setTenantDraft] = useState(tenantSlug);
  const [email, setEmail] = useState(authUser?.email || '');
  const [password, setPassword] = useState('');

  useEffect(() => {
    setTenantDraft(tenantSlug);
  }, [tenantSlug]);

  useEffect(() => {
    setEmail(authUser?.email || '');
  }, [authUser?.email]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError('');
        const requests: Promise<any>[] = [fetchLotteries(tenantSlug), fetchMonazosGames(tenantSlug)];
        if (authUser?.email && accessToken) {
          requests.push(fetchMyLotterySales(accessToken), fetchMyMonazosSales(accessToken));
        }
        const [lotteries, monazos, myLotterySales = [], myMonazosSales = []] = await Promise.all(requests);
        if (cancelled) return;
        setStats({ lotteries: lotteries.length, monazos: monazos.length });
        setRemoteSales([...(myLotterySales as SellerSale[]), ...(myMonazosSales as SellerSale[])]);
      } catch (err) {
        if (cancelled) return;
        setRemoteSales([]);
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

  const sellerRecentSales = useMemo<HomeSale[]>(() => {
    const localSales: HomeSale[] = !authUser?.email
      ? recentSales
      : recentSales.filter((sale) => sale.sellerEmail === authUser.email);

    if (!authUser?.email) return localSales;

    const remoteMapped: HomeSale[] = remoteSales.map((sale) => ({
      ticketCode: sale.ticketCode,
      gameLabel: sale.lottery?.name || sale.game?.name || 'Venta',
      drawLabel: (sale.draw?.name || 'Sorteo') + (sale.draw?.drawTime ? ' | ' + sale.draw.drawTime : ''),
      totalAmount: '�' + sale.totalAmount,
      status: sale.status,
      customerName: sale.customerName,
      createdAt: new Date(sale.drawDate || '').toLocaleString('es-CR'),
      sellerEmail: sale.sellerEmail || authUser.email,
    }));

    return [
      ...remoteMapped,
      ...localSales.filter((sale) => !remoteMapped.some((item) => item.ticketCode === sale.ticketCode)),
    ];
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
    Alert.alert('Sesion cerrada', 'La app quedo sin vendedor autenticado.');
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.heroCard}>
          <View style={styles.heroTop}>
            <ThemedView style={styles.logoCircle}>
              <ThemedText type="subtitle" style={styles.logoText}>{tenantInitials}</ThemedText>
            </ThemedView>
            <View style={styles.heroTextWrap}>
              <ThemedText type="small" style={styles.eyebrow}>MOBILE SALES</ThemedText>
              <ThemedText type="title" style={styles.heroTitle}>{tenantLabel}</ThemedText>
              <ThemedText style={styles.heroCopy}>Ventas moviles listas para loteria normal y 3 Monazos.</ThemedText>
              {authUser ? <ThemedText style={styles.heroHint}>Operador {authUser.email}</ThemedText> : <ThemedText style={styles.heroHintMuted}>Sin vendedor autenticado</ThemedText>}
            </View>
            <View style={styles.geoStatusWrap}>
              <View style={[styles.geoStatusDot, locationEnabled ? styles.geoStatusOn : styles.geoStatusOff]} />
              <ThemedText type="small" style={styles.geoStatusText}>{locationEnabled ? 'OK' : 'OFF'}</ThemedText>
            </View>
          </View>
          <View style={styles.statRow}>
            <ThemedView style={styles.statCard}>
              <ThemedText type="small" style={styles.statLabel}>Loterias hoy</ThemedText>
              <ThemedText type="subtitle" style={styles.statValue}>{loading ? '...' : String(stats.lotteries)}</ThemedText>
            </ThemedView>
            <ThemedView style={styles.statCard}>
              <ThemedText type="small" style={styles.statLabel}>3 Monazos hoy</ThemedText>
              <ThemedText type="subtitle" style={styles.statValue}>{loading ? '...' : String(stats.monazos)}</ThemedText>
            </ThemedView>
          </View>
          {loading ? <ActivityIndicator color="#ffffff" /> : null}
          {locationError ? <ThemedText style={styles.heroError}>{locationError}</ThemedText> : null}
          {error ? <ThemedText style={styles.heroError}>{error}</ThemedText> : null}
        </ThemedView>

        <ThemedView style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Tenant activo</ThemedText>
            <ThemedText type="small" style={styles.sectionNote}>Cambia de cliente aqui</ThemedText>
          </View>
          <TextInput
            style={styles.input}
            value={tenantDraft}
            onChangeText={setTenantDraft}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Slug del tenant"
            placeholderTextColor="#94a3b8"
          />
          <Pressable style={styles.tenantButton} onPress={() => void applyTenant()}>
            {savingTenant ? <ActivityIndicator color="#ffffff" /> : <ThemedText type="subtitle" style={styles.tenantButtonText}>Aplicar tenant</ThemedText>}
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Acceso del vendedor</ThemedText>
            <ThemedText type="small" style={styles.sectionNote}>{authUser ? 'Sesion activa' : 'Inicia sesion para operar'}</ThemedText>
          </View>
          {authUser ? (
            <ThemedView style={styles.operatorCard}>
              <View style={styles.operatorTop}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="subtitle">{authUser.email}</ThemedText>
                  <ThemedText style={styles.saleText}>Rol {authUser.role}</ThemedText>
                  <ThemedText style={styles.saleText}>Tenant {authUser.tenant?.slug || tenantSlug}</ThemedText>
                  {authUser.tenant?.plan ? <ThemedText style={styles.saleText}>Plan {authUser.tenant.plan}</ThemedText> : null}
                </View>
                <ThemedView style={styles.saleBadge}>
                  <ThemedText type="small" style={styles.saleBadgeText}>Activo</ThemedText>
                </ThemedView>
              </View>
              <Pressable style={styles.logoutButton} onPress={() => void handleLogout()}>
                <ThemedText type="small" style={styles.logoutButtonText}>Cerrar sesion</ThemedText>
              </Pressable>
            </ThemedView>
          ) : (
            <View style={styles.loginWrap}>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="Correo del vendedor"
                placeholderTextColor="#94a3b8"
              />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Contrasena"
                placeholderTextColor="#94a3b8"
              />
              <Pressable style={styles.loginButton} onPress={() => void handleLogin()}>
                {loggingIn ? <ActivityIndicator color="#ffffff" /> : <ThemedText type="subtitle" style={styles.tenantButtonText}>Entrar</ThemedText>}
              </Pressable>
            </View>
          )}
        </ThemedView>

        <ThemedView style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Atajos principales</ThemedText>
            <ThemedText type="small" style={styles.sectionNote}>Conectado al tenant</ThemedText>
          </View>
          <View style={styles.actionList}>
            {actions.map((item) => (
              <Pressable key={item.title} onPress={() => router.replace(item.href)} style={[styles.actionCard, item.tone === 'violet' ? styles.actionViolet : item.tone === 'green' ? styles.actionGreen : styles.actionBlue]}>
                <ThemedText type="subtitle">{item.title}</ThemedText>
                <ThemedText style={styles.actionText}>{item.note}</ThemedText>
              </Pressable>
            ))}
          </View>
        </ThemedView>

        <ThemedView style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <ThemedText type="subtitle">Ventas recientes</ThemedText>
            <ThemedText type="small" style={styles.sectionNote}>{sellerRecentSales.length} visibles para este vendedor</ThemedText>
          </View>
          {sellerRecentSales.length ? (
            <View style={styles.salesList}>
              {sellerRecentSales.map((sale) => (
                <ThemedView key={sale.ticketCode} style={styles.saleCard}>
                  <View style={styles.saleTop}>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="subtitle">{sale.ticketCode}</ThemedText>
                      <ThemedText style={styles.saleText}>{sale.gameLabel}</ThemedText>
                    </View>
                    <ThemedView style={styles.saleBadge}>
                      <ThemedText type="small" style={styles.saleBadgeText}>{sale.status}</ThemedText>
                    </ThemedView>
                  </View>
                  <ThemedText style={styles.saleText}>{sale.customerName}</ThemedText>
                  <ThemedText style={styles.saleText}>{sale.drawLabel}</ThemedText>
                  <ThemedText style={styles.saleText}>Total {sale.totalAmount}</ThemedText>
                  {sale.sellerEmail ? <ThemedText style={styles.saleText}>Vendedor {sale.sellerEmail}</ThemedText> : null}
                  <ThemedText style={styles.saleMuted}>{sale.createdAt}</ThemedText>
                </ThemedView>
              ))}
            </View>
          ) : (
            <ThemedText style={styles.sectionNote}>{authUser ? 'Este vendedor aun no tiene ventas remotas registradas.' : 'Inicia sesion para ver historial por vendedor.'}</ThemedText>
          )}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#edf4fb' },
  content: { padding: 20, gap: 18 },
  heroCard: { borderRadius: 30, padding: 22, gap: 14, backgroundColor: '#0f4fd6', boxShadow: '0px 12px 20px rgba(15,79,214,0.24)' },
  heroTop: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  logoCircle: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  logoText: { color: '#fff' },
  heroTextWrap: { flex: 1, gap: 4 },
  geoStatusWrap: { alignItems: 'center', gap: 6, minWidth: 76 },
  geoStatusDot: { width: 14, height: 14, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  geoStatusOn: { backgroundColor: '#22c55e', boxShadow: '0px 0px 16px rgba(34,197,94,0.45)' },
  geoStatusOff: { backgroundColor: '#ef4444', boxShadow: '0px 0px 12px rgba(239,68,68,0.35)' },
  geoStatusText: { color: '#dbeafe' },
  eyebrow: { color: '#dbeafe', letterSpacing: 2.2 },
  heroTitle: { color: '#fff', fontSize: 30, lineHeight: 36 },
  heroCopy: { color: '#dbeafe', lineHeight: 22 },
  heroHint: { color: '#dbeafe', lineHeight: 21 },
  heroHintMuted: { color: '#bfdbfe', lineHeight: 21 },
  heroError: { color: '#fee2e2', lineHeight: 21 },
  statRow: { gap: 10 },
  statCard: { borderRadius: 20, padding: 14, backgroundColor: 'rgba(255,255,255,0.16)' },
  statLabel: { color: '#bfdbfe', marginBottom: 2 },
  statValue: { color: '#fff' },
  sectionCard: { borderRadius: 26, padding: 18, gap: 14, backgroundColor: '#fff' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sectionNote: { color: '#64748b', flexShrink: 1 },
  input: { borderRadius: 18, minHeight: 56, paddingHorizontal: 16, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#dbeafe', color: '#0f172a' },
  tenantButton: { borderRadius: 18, paddingVertical: 14, alignItems: 'center', backgroundColor: '#0f172a' },
  tenantButtonText: { color: '#fff' },
  loginWrap: { gap: 12 },
  loginButton: { borderRadius: 18, paddingVertical: 14, alignItems: 'center', backgroundColor: '#1d4ed8' },
  operatorCard: { borderRadius: 20, padding: 16, backgroundColor: '#f8fbff', gap: 12, borderWidth: 1, borderColor: '#dbeafe' },
  operatorTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  logoutButton: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#dbeafe', alignSelf: 'flex-start' },
  logoutButtonText: { color: '#1d4ed8' },
  locationActions: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  locationBadgeOn: { backgroundColor: '#dcfce7' },
  locationBadgeOff: { backgroundColor: '#e2e8f0' },
  locationBadgeOffText: { color: '#475569' },
  actionList: { gap: 12 },
  actionCard: { borderRadius: 22, padding: 18, gap: 8, borderWidth: 1 },
  actionBlue: { backgroundColor: '#eef6ff', borderColor: '#bfdbfe' },
  actionViolet: { backgroundColor: '#f3e8ff', borderColor: '#d8b4fe' },
  actionGreen: { backgroundColor: '#ecfdf5', borderColor: '#86efac' },
  actionText: { color: '#5b6678', lineHeight: 21 },
  salesList: { gap: 12 },
  saleCard: { borderRadius: 20, padding: 16, backgroundColor: '#f8fbff', gap: 6, borderWidth: 1, borderColor: '#dbeafe' },
  saleTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  saleText: { color: '#334155' },
  saleMuted: { color: '#64748b' },
  saleBadge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#dcfce7' },
  saleBadgeText: { color: '#166534' },
});


