import * as React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchMyLotteryEarnings, fetchMyMonazosEarnings, type LotteryEarningsSummary, type MonazosEarningsSummary } from '../services/api';
import { useAppSession } from '../contexts/app-session';
import BrandHeader from '../components/brand-header';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';

type GainScope = 'day' | 'month' | 'year';

function todayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currentYearValue() {
  return String(new Date().getFullYear());
}

function monthRange(monthValue: string) {
  const [year, month] = monthValue.split('-').map((value) => Number(value));
  if (!year || !month) {
    return { fromDate: todayIsoDate(), toDate: todayIsoDate() };
  }
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const format = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  return { fromDate: format(start), toDate: format(end) };
}

function yearRange(yearValue: string) {
  const year = Number(yearValue);
  if (!year) {
    return { fromDate: todayIsoDate(), toDate: todayIsoDate() };
  }
  return { fromDate: `${year}-01-01`, toDate: `${year}-12-31` };
}

function buildRange(scope: GainScope, dayValue: string, monthValue: string, yearValue: string) {
  if (scope === 'month') return monthRange(monthValue);
  if (scope === 'year') return yearRange(yearValue);
  return { fromDate: dayValue, toDate: dayValue, date: dayValue };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-CR').format(value || 0);
}

export default function GananciasScreen() {
  const { authUser, accessToken } = useAppSession();
  const [scope, setScope] = React.useState<GainScope>('day');
  const [dayValue, setDayValue] = React.useState(todayIsoDate());
  const [monthValue, setMonthValue] = React.useState(currentMonthValue());
  const [yearValue, setYearValue] = React.useState(currentYearValue());
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [lotterySummary, setLotterySummary] = React.useState<LotteryEarningsSummary | null>(null);
  const [monazosSummary, setMonazosSummary] = React.useState<MonazosEarningsSummary | null>(null);

  const range = React.useMemo(() => buildRange(scope, dayValue, monthValue, yearValue), [scope, dayValue, monthValue, yearValue]);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!authUser || !accessToken) {
        setLotterySummary(null);
        setMonazosSummary(null);
        return;
      }
      try {
        setLoading(true);
        setError('');
        const [lotteryData, monazosData] = await Promise.all([
          fetchMyLotteryEarnings(accessToken, range),
          fetchMyMonazosEarnings(accessToken, range),
        ]);
        if (cancelled) return;
        setLotterySummary(lotteryData);
        setMonazosSummary(monazosData);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'No se pudieron cargar las ganancias.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [authUser?.email, accessToken, range.fromDate, range.toDate]);

  const totalSold = (lotterySummary?.lotteryTotalAmount || 0) + (monazosSummary?.monazosTotalAmount || 0);
  const totalCommission = (lotterySummary?.lotteryCommissionAmount || 0) + (monazosSummary?.monazosCommissionAmount || 0);
  const commissionPercent = lotterySummary?.commissionEnabled ? lotterySummary?.commissionPercent || 0 : monazosSummary?.commissionEnabled ? monazosSummary?.commissionPercent || 0 : 0;
  const commissionEnabled = Boolean(lotterySummary?.commissionEnabled || monazosSummary?.commissionEnabled);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.heroMain}>
              <BrandHeader
                section="GANANCIAS"
                title="Comision del vendedor"
                description="ONE"
                note={authUser ? authUser.email : 'Inicia sesion para consultar tus ganancias.'}
                sectionColor="#FFF29B"
                titleColor="#ffffff"
                bodyColor="#dbeafe"
              />
            </View>
            <ThemedView style={[styles.percentBadge, commissionEnabled ? styles.percentBadgeOn : styles.percentBadgeOff]}>
              <ThemedText type="small" style={commissionEnabled ? styles.percentOnText : styles.percentOffText}>{commissionEnabled ? `${commissionPercent}%` : 'Sin %'}</ThemedText>
            </ThemedView>
          </View>
          <View style={styles.heroGrid}>
            <ThemedView style={styles.metricCard}><ThemedText type="small" style={styles.metricLabel}>Vendido</ThemedText><ThemedText type="subtitle">{formatCurrency(totalSold)}</ThemedText></ThemedView>
            <ThemedView style={styles.metricCard}><ThemedText type="small" style={styles.metricLabel}>Ganancia</ThemedText><ThemedText type="subtitle">{formatCurrency(totalCommission)}</ThemedText></ThemedView>
          </View>
          {loading ? <ActivityIndicator color="#ffffff" /> : null}
          {error ? <ThemedText style={styles.heroError}>{error}</ThemedText> : null}
        </ThemedView>

        <ThemedView style={styles.sectionCard}>
          <View style={styles.scopeRow}>
            <Pressable style={[styles.scopeChip, scope === 'day' && styles.scopeChipActive]} onPress={() => setScope('day')}><ThemedText type="small" style={scope === 'day' ? styles.scopeChipActiveText : styles.scopeChipText}>Dia</ThemedText></Pressable>
            <Pressable style={[styles.scopeChip, scope === 'month' && styles.scopeChipActive]} onPress={() => setScope('month')}><ThemedText type="small" style={scope === 'month' ? styles.scopeChipActiveText : styles.scopeChipText}>Mes</ThemedText></Pressable>
            <Pressable style={[styles.scopeChip, scope === 'year' && styles.scopeChipActive]} onPress={() => setScope('year')}><ThemedText type="small" style={scope === 'year' ? styles.scopeChipActiveText : styles.scopeChipText}>Ano</ThemedText></Pressable>
          </View>
          {scope === 'day' ? <TextInput style={styles.input} value={dayValue} onChangeText={setDayValue} placeholder="YYYY-MM-DD" placeholderTextColor="#94a3b8" /> : null}
          {scope === 'month' ? <TextInput style={styles.input} value={monthValue} onChangeText={setMonthValue} placeholder="YYYY-MM" placeholderTextColor="#94a3b8" /> : null}
          {scope === 'year' ? <TextInput style={styles.input} value={yearValue} onChangeText={setYearValue} placeholder="YYYY" placeholderTextColor="#94a3b8" keyboardType="numeric" /> : null}
          <ThemedText type="small" style={styles.sectionNote}>Rango consultado: {range.fromDate} al {range.toDate}</ThemedText>
        </ThemedView>

        <ThemedView style={styles.sectionCard}>
          <ThemedText type="subtitle">Loteria</ThemedText>
          <View style={styles.summaryRow}>
            <ThemedView style={styles.summaryCard}><ThemedText type="small" style={styles.metricLabel}>Tickets</ThemedText><ThemedText type="subtitle">{lotterySummary?.lotteryTicketCount || 0}</ThemedText></ThemedView>
            <ThemedView style={styles.summaryCard}><ThemedText type="small" style={styles.metricLabel}>Vendido</ThemedText><ThemedText type="subtitle">{formatCurrency(lotterySummary?.lotteryTotalAmount || 0)}</ThemedText></ThemedView>
            <ThemedView style={styles.summaryCard}><ThemedText type="small" style={styles.metricLabel}>Ganancia</ThemedText><ThemedText type="subtitle">{formatCurrency(lotterySummary?.lotteryCommissionAmount || 0)}</ThemedText></ThemedView>
          </View>
          <ThemedText type="small" style={styles.sectionNote}>Por loteria</ThemedText>
          {(lotterySummary?.lotteries || []).length ? lotterySummary!.lotteries.map((item) => (
            <ThemedView key={item.lotteryId} style={styles.breakdownCard}>
              <ThemedText type="subtitle">{item.lotteryName}</ThemedText>
              <ThemedText style={styles.lineText}>Tickets {item.ticketCount} | Vendido {formatCurrency(item.totalAmount)} | Ganancia {formatCurrency(item.commissionAmount)}</ThemedText>
            </ThemedView>
          )) : <ThemedText style={styles.emptyText}>Sin ventas de loteria en este rango.</ThemedText>}
          <ThemedText type="small" style={styles.sectionNote}>Por sorteo</ThemedText>
          {(lotterySummary?.draws || []).length ? lotterySummary!.draws.map((item) => (
            <ThemedView key={item.drawId} style={styles.breakdownCard}>
              <ThemedText type="subtitle">{item.lotteryName} | {item.drawName}</ThemedText>
              <ThemedText style={styles.lineText}>{item.drawTime} | Tickets {item.ticketCount} | Vendido {formatCurrency(item.totalAmount)} | Ganancia {formatCurrency(item.commissionAmount)}</ThemedText>
            </ThemedView>
          )) : <ThemedText style={styles.emptyText}>Sin sorteos con comision en este rango.</ThemedText>}
        </ThemedView>

        <ThemedView style={styles.sectionCard}>
          <ThemedText type="subtitle">3 Monazos</ThemedText>
          <View style={styles.summaryRow}>
            <ThemedView style={styles.summaryCard}><ThemedText type="small" style={styles.metricLabel}>Tickets</ThemedText><ThemedText type="subtitle">{monazosSummary?.monazosTicketCount || 0}</ThemedText></ThemedView>
            <ThemedView style={styles.summaryCard}><ThemedText type="small" style={styles.metricLabel}>Vendido</ThemedText><ThemedText type="subtitle">{formatCurrency(monazosSummary?.monazosTotalAmount || 0)}</ThemedText></ThemedView>
            <ThemedView style={styles.summaryCard}><ThemedText type="small" style={styles.metricLabel}>Ganancia</ThemedText><ThemedText type="subtitle">{formatCurrency(monazosSummary?.monazosCommissionAmount || 0)}</ThemedText></ThemedView>
          </View>
          <ThemedText type="small" style={styles.sectionNote}>Por juego</ThemedText>
          {(monazosSummary?.monazosGames || []).length ? monazosSummary!.monazosGames.map((item) => (
            <ThemedView key={item.gameId} style={styles.breakdownCard}>
              <ThemedText type="subtitle">{item.gameName}</ThemedText>
              <ThemedText style={styles.lineText}>Tickets {item.ticketCount} | Vendido {formatCurrency(item.totalAmount)} | Ganancia {formatCurrency(item.commissionAmount)}</ThemedText>
            </ThemedView>
          )) : <ThemedText style={styles.emptyText}>Sin ventas de 3 Monazos en este rango.</ThemedText>}
          <ThemedText type="small" style={styles.sectionNote}>Por sorteo</ThemedText>
          {(monazosSummary?.monazosDraws || []).length ? monazosSummary!.monazosDraws.map((item) => (
            <ThemedView key={item.drawId} style={styles.breakdownCard}>
              <ThemedText type="subtitle">{item.gameName} | {item.drawName}</ThemedText>
              <ThemedText style={styles.lineText}>{item.drawTime} | Tickets {item.ticketCount} | Vendido {formatCurrency(item.totalAmount)} | Ganancia {formatCurrency(item.commissionAmount)}</ThemedText>
            </ThemedView>
          )) : <ThemedText style={styles.emptyText}>Sin sorteos de 3 Monazos en este rango.</ThemedText>}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#edf4fb' },
  content: { padding: 20, gap: 18 },
  heroCard: { borderRadius: 28, padding: 20, gap: 14, backgroundColor: '#0f4fd6' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  heroMain: { flex: 1 },
  heroError: { color: '#fee2e2' },
  percentBadge: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  percentBadgeOn: { backgroundColor: '#dcfce7' },
  percentBadgeOff: { backgroundColor: '#e2e8f0' },
  percentOnText: { color: '#166534' },
  percentOffText: { color: '#475569' },
  heroGrid: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, borderRadius: 18, padding: 14, backgroundColor: 'rgba(255,255,255,0.14)' },
  metricLabel: { color: '#64748b' },
  sectionCard: { borderRadius: 24, padding: 18, gap: 12, backgroundColor: '#ffffff' },
  scopeRow: { flexDirection: 'row', gap: 10 },
  scopeChip: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: '#e2e8f0' },
  scopeChipActive: { backgroundColor: '#1d4ed8' },
  scopeChipText: { color: '#475569' },
  scopeChipActiveText: { color: '#ffffff' },
  input: { borderRadius: 16, minHeight: 52, paddingHorizontal: 14, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#dbeafe', color: '#0f172a' },
  sectionNote: { color: '#64748b' },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, borderRadius: 18, padding: 14, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#dbeafe' },
  breakdownCard: { borderRadius: 18, padding: 14, gap: 4, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#dbeafe' },
  lineText: { color: '#334155' },
  emptyText: { color: '#94a3b8' },
});
