import * as React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BrandHeader from '../components/brand-header';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { useAppSession } from '../contexts/app-session';
import { fetchMobilePrizeClaim, payMobilePrize, type MobilePrizeClaim } from '../services/api';

export default function PremiosScreen() {
  const { accessToken, authUser } = useAppSession();
  const [claimCode, setClaimCode] = React.useState('');
  const [verificationCode, setVerificationCode] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState<'efectivo' | 'sinpe'>('efectivo');
  const [reference, setReference] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [paying, setPaying] = React.useState(false);
  const [claim, setClaim] = React.useState<MobilePrizeClaim | null>(null);

  React.useEffect(() => {
    setVerificationCode('');
    setReference('');
  }, [claim?.id]);

  const pendingAmount = React.useMemo(() => Number(claim?.pendingAmount || 0), [claim?.pendingAmount]);
  const canPay = Boolean(accessToken && claim && pendingAmount > 0 && verificationCode.trim().length === 6);

  async function handleLookup() {
    if (!accessToken) {
      Alert.alert('Premios', 'Inicia sesion como vendedor para consultar premios.');
      return;
    }
    if (!claimCode.trim()) {
      Alert.alert('Premios', 'Escribe el codigo del reclamo para consultarlo.');
      return;
    }

    try {
      setLoading(true);
      const result = await fetchMobilePrizeClaim(claimCode, accessToken);
      setClaim(result);
      setClaimCode(result.claimCode);
    } catch (error) {
      setClaim(null);
      Alert.alert('No se pudo consultar', error instanceof Error ? error.message : 'Error al consultar el reclamo.');
    } finally {
      setLoading(false);
    }
  }

  async function handlePay() {
    if (!accessToken || !claim) return;
    if (verificationCode.trim().length !== 6) {
      Alert.alert('PIN requerido', 'Escribe el PIN de 6 digitos que recibio el cliente.');
      return;
    }

    try {
      setPaying(true);
      const result = await payMobilePrize(
        {
          claimCode: claim.claimCode,
          verificationCode: verificationCode.trim(),
          paymentMethod,
          reference: reference.trim() || undefined,
          notes: `Pago confirmado desde app movil por ${authUser?.email || 'vendedor'}`,
        },
        accessToken,
      );
      setClaim(result.claim);
      setVerificationCode('');
      setReference('');
      Alert.alert('Premio pagado', `Se registro el pago por CRC ${Number(result.payment.amount || 0).toLocaleString('es-CR')}.`);
    } catch (error) {
      Alert.alert('No se pudo pagar', error instanceof Error ? error.message : 'Error al registrar el pago.');
    } finally {
      setPaying(false);
    }
  }

  function formatCurrency(value: number | string) {
    const amount = typeof value === 'number' ? value : Number(value || 0);
    return 'CRC ' + amount.toLocaleString('es-CR');
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.heroCard}>
          <BrandHeader
            section="PREMIOS"
            title="Consulta y pago con PIN"
            description="El monto siempre viene desde la API. El vendedor solo confirma el PIN del cliente."
            note={authUser ? `Vendedor ${authUser.email}` : 'Inicia sesion para operar pagos'}
            sectionColor="#0f766e"
            titleColor="#17212b"
            bodyColor="#6b7280"
          />
        </ThemedView>

        <ThemedView style={styles.searchCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <ThemedText style={styles.sectionEyebrow}>RECLAMO</ThemedText>
              <ThemedText style={styles.sectionTitle}>Buscar premio</ThemedText>
              <ThemedText style={styles.sectionNote}>Consulta por codigo CLM o MZC antes de pagar.</ThemedText>
            </View>
          </View>
          <TextInput
            style={styles.input}
            value={claimCode}
            onChangeText={setClaimCode}
            autoCapitalize="characters"
            placeholder="CLM-... o MZC-..."
            placeholderTextColor="#94a3b8"
          />
          <Pressable style={styles.primaryButton} onPress={() => void handleLookup()}>
            {loading ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.primaryButtonText}>Consultar premio</ThemedText>}
          </Pressable>
        </ThemedView>

        {claim ? (
          <ThemedView style={styles.claimCard}>
            <View style={styles.claimTop}>
              <View style={styles.claimTopText}>
                <ThemedText style={styles.claimCode}>{claim.claimCode}</ThemedText>
                <ThemedText style={styles.claimTicket}>{claim.ticketCode}</ThemedText>
              </View>
              <ThemedView style={[styles.badge, pendingAmount > 0 ? styles.badgeWarn : styles.badgeGood]}>
                <ThemedText style={pendingAmount > 0 ? styles.badgeWarnText : styles.badgeGoodText}>
                  {pendingAmount > 0 ? 'Pendiente' : 'Pagado'}
                </ThemedText>
              </ThemedView>
            </View>

            <View style={styles.amountPanel}>
              <View style={styles.amountCardPrimary}>
                <ThemedText style={styles.amountLabel}>Pendiente</ThemedText>
                <ThemedText style={styles.amountPrimaryValue}>{formatCurrency(pendingAmount)}</ThemedText>
              </View>
              <View style={styles.amountSplitRow}>
                <View style={styles.amountCardSecondary}>
                  <ThemedText style={styles.amountLabel}>Premio total</ThemedText>
                  <ThemedText style={styles.amountSecondaryValue}>{formatCurrency(claim.prizeAmount)}</ThemedText>
                </View>
                <View style={styles.amountCardSecondary}>
                  <ThemedText style={styles.amountLabel}>Pagado</ThemedText>
                  <ThemedText style={styles.amountSecondaryValue}>{formatCurrency(claim.paidAmount)}</ThemedText>
                </View>
              </View>
            </View>

            <View style={styles.detailGrid}>
              <View style={styles.detailCard}>
                <ThemedText style={styles.detailLabel}>Cliente</ThemedText>
                <ThemedText style={styles.detailValue}>{claim.customerName || 'Cliente general'}</ThemedText>
              </View>
              <View style={styles.detailCard}>
                <ThemedText style={styles.detailLabel}>Telefono</ThemedText>
                <ThemedText style={styles.detailValue}>{claim.customerPhone || 'Sin telefono'}</ThemedText>
              </View>
              <View style={styles.detailCard}>
                <ThemedText style={styles.detailLabel}>Juego</ThemedText>
                <ThemedText style={styles.detailValue}>{claim.gameType === 'monazos' ? claim.gameName : claim.lotteryName}</ThemedText>
              </View>
              <View style={styles.detailCard}>
                <ThemedText style={styles.detailLabel}>Sorteo</ThemedText>
                <ThemedText style={styles.detailValue}>{claim.drawName} | {claim.drawTime}</ThemedText>
              </View>
            </View>

            <View style={styles.entriesSection}>
              <ThemedText style={styles.entriesTitle}>Jugada ganadora</ThemedText>
              {claim.gameType === 'monazos' ? (
                <View style={styles.entriesWrap}>
                  {claim.plays.map((play, index) => (
                    <View key={`${play.mode}-${play.digits}-${index}`} style={styles.entryChip}>
                      <ThemedText style={styles.entryChipText}>{play.mode} | {play.digits}</ThemedText>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.entriesWrap}>
                  {claim.numbers.map((entry, index) => (
                    <View key={`${entry.numberValue}-${index}`} style={styles.entryChip}>
                      <ThemedText style={styles.entryChipText}>{entry.numberValue}</ThemedText>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {pendingAmount > 0 ? (
              <View style={styles.paySection}>
                <ThemedText style={styles.paySectionTitle}>Confirmar pago</ThemedText>
                <ThemedText style={styles.payHint}>Pidele al cliente el PIN de 6 digitos y registra el pago completo.</ThemedText>
                <TextInput
                  style={styles.input}
                  value={verificationCode}
                  onChangeText={(value) => setVerificationCode(value.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  placeholder="PIN de pago"
                  placeholderTextColor="#94a3b8"
                />
                <View style={styles.methodRow}>
                  {(['efectivo', 'sinpe'] as const).map((method) => {
                    const active = paymentMethod === method;
                    return (
                      <Pressable key={method} style={[styles.methodButton, active && styles.methodButtonActive]} onPress={() => setPaymentMethod(method)}>
                        <ThemedText style={active ? styles.methodButtonTextActive : styles.methodButtonText}>
                          {method === 'efectivo' ? 'Efectivo' : 'SINPE'}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
                <TextInput
                  style={styles.input}
                  value={reference}
                  onChangeText={setReference}
                  placeholder={paymentMethod === 'sinpe' ? 'Referencia SINPE (opcional)' : 'Referencia interna (opcional)'}
                  placeholderTextColor="#94a3b8"
                />
                <Pressable style={[styles.payButton, !canPay && styles.payButtonDisabled]} onPress={() => void handlePay()} disabled={!canPay || paying}>
                  {paying ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.payButtonText}>Pagar premio</ThemedText>}
                </Pressable>
              </View>
            ) : (
              <ThemedView style={styles.paidCard}>
                <ThemedText style={styles.paidTitle}>Este premio ya esta pagado</ThemedText>
                <ThemedText style={styles.paidText}>Si necesitas revisarlo, hazlo desde el admin o consulta el historial del reclamo.</ThemedText>
              </ThemedView>
            )}
          </ThemedView>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#eef3f8' },
  content: { padding: 16, gap: 14, paddingBottom: 28 },
  heroCard: { borderRadius: 30, padding: 18, backgroundColor: '#fffaf2', borderWidth: 1, borderColor: '#f2e3cf' },
  searchCard: { borderRadius: 26, padding: 16, gap: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7edf4' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  sectionCopy: { gap: 4 },
  sectionEyebrow: { color: '#b45309', fontSize: 11, lineHeight: 14, letterSpacing: 1.6, fontWeight: '800' },
  sectionTitle: { color: '#17212b', fontSize: 22, lineHeight: 26, fontWeight: '800' },
  sectionNote: { color: '#7c8795', fontSize: 12, lineHeight: 16 },
  input: { borderRadius: 18, minHeight: 56, paddingHorizontal: 16, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#d9e5f2', color: '#17212b', fontSize: 15 },
  primaryButton: { borderRadius: 18, paddingVertical: 15, alignItems: 'center', backgroundColor: '#17212b' },
  primaryButtonText: { color: '#fff', fontSize: 17, lineHeight: 20, fontWeight: '800' },
  claimCard: { borderRadius: 28, padding: 16, gap: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7edf4' },
  claimTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  claimTopText: { flex: 1 },
  claimCode: { color: '#17212b', fontSize: 24, lineHeight: 28, fontWeight: '800' },
  claimTicket: { color: '#6b7280', lineHeight: 18 },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  badgeWarn: { backgroundColor: '#fef3c7' },
  badgeGood: { backgroundColor: '#dcfce7' },
  badgeWarnText: { color: '#92400e', fontWeight: '800' },
  badgeGoodText: { color: '#166534', fontWeight: '800' },
  amountPanel: { gap: 10 },
  amountCardPrimary: { borderRadius: 22, padding: 16, gap: 4, backgroundColor: '#0f766e' },
  amountLabel: { color: '#d1fae5', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  amountPrimaryValue: { color: '#ffffff', fontSize: 28, lineHeight: 32, fontWeight: '800' },
  amountSplitRow: { flexDirection: 'row', gap: 10 },
  amountCardSecondary: { flex: 1, borderRadius: 18, padding: 14, gap: 4, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#e3edf8' },
  amountSecondaryValue: { color: '#17212b', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  detailGrid: { gap: 10 },
  detailCard: { borderRadius: 18, padding: 14, gap: 4, backgroundColor: '#fbfcfe', borderWidth: 1, borderColor: '#e5edf6' },
  detailLabel: { color: '#7b8794', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  detailValue: { color: '#17212b', lineHeight: 20, fontWeight: '700' },
  entriesSection: { gap: 10 },
  entriesTitle: { color: '#17212b', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  entriesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  entryChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#eff6ff' },
  entryChipText: { color: '#1d4ed8', fontWeight: '700' },
  paySection: { marginTop: 2, gap: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 14 },
  paySectionTitle: { color: '#17212b', fontSize: 20, lineHeight: 24, fontWeight: '800' },
  payHint: { color: '#64748b' },
  methodRow: { flexDirection: 'row', gap: 10 },
  methodButton: { flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: '#e2e8f0' },
  methodButtonActive: { backgroundColor: '#0ea5e9' },
  methodButtonText: { color: '#475569', fontWeight: '700' },
  methodButtonTextActive: { color: '#fff', fontWeight: '800' },
  payButton: { borderRadius: 18, paddingVertical: 15, alignItems: 'center', backgroundColor: '#0f766e' },
  payButtonDisabled: { opacity: 0.55 },
  payButtonText: { color: '#fff', fontSize: 17, lineHeight: 20, fontWeight: '800' },
  paidCard: { marginTop: 2, borderRadius: 18, padding: 14, gap: 6, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#bbf7d0' },
  paidTitle: { color: '#166534', fontSize: 20, lineHeight: 24, fontWeight: '800' },
  paidText: { color: '#166534' },
});
