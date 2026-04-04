import * as React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { cancelMobileTicket, fetchTicketByCode, TicketLookup } from '../services/api';
import { useAppSession } from '../contexts/app-session';
import BrandHeader from '../components/brand-header';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { printWithConfiguredPrinter } from '../services/printer';
import { shareTicketReceipt, type TicketReceipt } from '../utils/ticket-receipt';

export default function TicketsScreen() {
  const { tenantSlug, printerConfig, accessToken, authUser } = useAppSession();
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');
  const [ticket, setTicket] = React.useState<TicketLookup | null>(null);

  React.useEffect(() => {
    setCancelReason('');
  }, [ticket?.id]);

  const receipt = React.useMemo<TicketReceipt | null>(() => {
    if (!ticket) return null;
    return {
      title: ticket.ticketCode.startsWith('MZ-') ? 'Ticket 3 Monazos' : 'Ticket de loteria',
      ticketCode: ticket.ticketCode,
      customerName: ticket.customerName,
      customerPhone: ticket.customerPhone,
      gameLabel: ticket.lottery?.name || ticket.game?.name || 'Juego',
      drawName: ticket.draw?.name || '-',
      drawTime: ticket.draw?.drawTime || '-',
      drawDate: ticket.drawDate,
      paymentMethod: ticket.paymentMethod,
      totalAmount: 'C' + ticket.totalAmount,
      status: ticket.status,
      entries: ticket.numbers?.length
        ? ticket.numbers.map((entry) => ({ label: entry.numberValue, amount: 'C' + entry.amount, detail: entry.reventadoAmount ? 'Reventado C' + entry.reventadoAmount : 'Normal' }))
        : ticket.plays?.map((entry) => ({ label: entry.mode, amount: 'C' + entry.amount, detail: entry.digits })) || [],
    };
  }, [ticket]);

  const canCancelTicket = Boolean(
    ticket
    && accessToken
    && authUser?.role === 'seller'
    && ticket.sellerEmail
    && authUser.email.toLowerCase() === ticket.sellerEmail.toLowerCase()
    && (ticket.status === 'validated' || ticket.status === 'pending_validation')
    && ticket.prizeStatus === 'no_prize'
    && !ticket.cancelledAt,
  );

  async function handleLookup() {
    if (!code.trim()) {
      Alert.alert('Consulta de ticket', 'Escribe un codigo de ticket para buscarlo.');
      return;
    }

    try {
      setLoading(true);
      const result = await fetchTicketByCode(code, tenantSlug);
      if (!result) {
        setTicket(null);
        Alert.alert('Sin resultados', 'No se encontro un ticket con ese codigo para el tenant activo.');
        return;
      }
      setTicket(result);
    } catch (error) {
      Alert.alert('No se pudo consultar', error instanceof Error ? error.message : 'Error al consultar el ticket.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReprint() {
    if (!receipt) return;
    try {
      await printWithConfiguredPrinter(receipt, printerConfig);
    } catch (error) {
      Alert.alert('No se pudo reimprimir', error instanceof Error ? error.message : 'Error al enviar el ticket a la impresora.');
    }
  }

  async function confirmCancelTicket() {
    if (!ticket || !accessToken) return;
    const reason = cancelReason.trim();
    if (reason.length < 4) {
      Alert.alert('Anular ticket', 'Escribe un motivo corto para la anulacion.');
      return;
    }

    try {
      setCancelling(true);
      const updated = await cancelMobileTicket(ticket.id, ticket.ticketCode, accessToken, reason);
      setTicket(updated);
      setCancelReason('');
      Alert.alert('Ticket anulado', 'La venta quedo anulada correctamente.');
    } catch (error) {
      Alert.alert('No se pudo anular', error instanceof Error ? error.message : 'Error al anular el ticket.');
    } finally {
      setCancelling(false);
    }
  }

  function handleCancelTicket() {
    if (!canCancelTicket) return;
    Alert.alert('Anular ticket', 'Esta venta se anulara y dejara de contar en caja y reportes. Deseas continuar?', [
      { text: 'No', style: 'cancel' },
      { text: 'Si, anular', style: 'destructive', onPress: () => void confirmCancelTicket() },
    ]);
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
            section="TICKETS"
            title="Consulta por codigo"
            description="Busca, comparte, reimprime o anula sin salir del mismo flujo."
            note={tenantSlug}
            sectionColor="#b71c1c"
            titleColor="#17212b"
            bodyColor="#6b7280"
          />
        </ThemedView>

        <ThemedView style={styles.searchCard}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionCopy}>
              <ThemedText style={styles.sectionEyebrow}>CONSULTA</ThemedText>
              <ThemedText style={styles.sectionTitle}>Buscar ticket</ThemedText>
              <ThemedText style={styles.sectionNote}>Funciona para loteria y 3 Monazos.</ThemedText>
            </View>
          </View>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            placeholder="TK-XXXX o MZ-XXXX"
            placeholderTextColor="#94a3b8"
          />
          <Pressable style={styles.searchButton} onPress={() => void handleLookup()}>
            {loading ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.searchButtonText}>Consultar ticket</ThemedText>}
          </Pressable>
        </ThemedView>

        {ticket ? (
          <ThemedView style={styles.ticketCard}>
            <View style={styles.ticketTop}>
              <View style={styles.ticketTopText}>
                <ThemedText style={styles.ticketCode}>{ticket.ticketCode}</ThemedText>
                <ThemedText style={styles.ticketGame}>{ticket.lottery?.name || ticket.game?.name || 'Juego'}</ThemedText>
              </View>
              <ThemedView style={[
                styles.badge,
                ticket.status === 'validated' ? styles.badgeGood : ticket.status === 'cancelled' ? styles.badgeDanger : styles.badgeWarn,
              ]}>
                <ThemedText style={ticket.status === 'validated' ? styles.badgeGoodText : ticket.status === 'cancelled' ? styles.badgeDangerText : styles.badgeWarnText}>{ticket.status}</ThemedText>
              </ThemedView>
            </View>

            <View style={styles.detailGrid}>
              <View style={styles.detailCard}>
                <ThemedText style={styles.detailLabel}>Cliente</ThemedText>
                <ThemedText style={styles.detailValue}>{ticket.customerName || 'Cliente general'}</ThemedText>
              </View>
              <View style={styles.detailCard}>
                <ThemedText style={styles.detailLabel}>Telefono</ThemedText>
                <ThemedText style={styles.detailValue}>{ticket.customerPhone || 'Sin telefono'}</ThemedText>
              </View>
              <View style={styles.detailCard}>
                <ThemedText style={styles.detailLabel}>Sorteo</ThemedText>
                <ThemedText style={styles.detailValue}>{ticket.draw?.name || '-'} | {ticket.draw?.drawTime || '-'}</ThemedText>
              </View>
              <View style={styles.detailCard}>
                <ThemedText style={styles.detailLabel}>Total</ThemedText>
                <ThemedText style={styles.detailValue}>{formatCurrency(ticket.totalAmount)}</ThemedText>
              </View>
            </View>

            <View style={styles.prizeBanner}>
              <ThemedText style={styles.prizeBannerLabel}>Estado de premio</ThemedText>
              <ThemedText style={styles.prizeBannerValue}>{ticket.prizeStatus}</ThemedText>
            </View>

            {ticket.cancelledAt ? (
              <ThemedView style={styles.cancelledCard}>
                <ThemedText style={styles.cancelledTitle}>Ticket anulado</ThemedText>
                <ThemedText style={styles.cancelledText}>Por: {ticket.cancelledByEmail || 'Sin registro'}</ThemedText>
                <ThemedText style={styles.cancelledText}>Motivo: {ticket.cancellationReason || 'Sin detalle'}</ThemedText>
              </ThemedView>
            ) : null}

            {receipt ? (
              <View style={styles.ticketActions}>
                <Pressable style={styles.ticketActionPrimary} onPress={() => void shareTicketReceipt(receipt)}>
                  <ThemedText style={styles.ticketActionPrimaryText}>Compartir</ThemedText>
                </Pressable>
                <Pressable style={styles.ticketActionSecondary} onPress={() => void handleReprint()}>
                  <ThemedText style={styles.ticketActionSecondaryText}>Reimprimir</ThemedText>
                </Pressable>
              </View>
            ) : null}

            {canCancelTicket ? (
              <View style={styles.cancelSection}>
                <ThemedText style={styles.cancelSectionTitle}>Anular venta</ThemedText>
                <ThemedText style={styles.cancelHint}>Solo se puede anular tu propio ticket antes del cierre del sorteo.</ThemedText>
                <TextInput
                  style={styles.input}
                  value={cancelReason}
                  onChangeText={setCancelReason}
                  placeholder="Motivo de anulacion"
                  placeholderTextColor="#94a3b8"
                />
                <Pressable style={[styles.cancelButton, cancelling && styles.cancelButtonDisabled]} onPress={handleCancelTicket} disabled={cancelling}>
                  {cancelling ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.cancelButtonText}>Anular ticket</ThemedText>}
                </Pressable>
              </View>
            ) : null}
          </ThemedView>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#eef3f8' },
  content: { padding: 16, gap: 14, paddingBottom: 28 },
  heroCard: { borderRadius: 30, padding: 18, gap: 10, backgroundColor: '#fffaf2', borderWidth: 1, borderColor: '#f2e3cf' },
  searchCard: { borderRadius: 26, padding: 16, gap: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7edf4' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  sectionCopy: { gap: 4 },
  sectionEyebrow: { color: '#b45309', fontSize: 11, lineHeight: 14, letterSpacing: 1.6, fontWeight: '800' },
  sectionTitle: { color: '#17212b', fontSize: 22, lineHeight: 26, fontWeight: '800' },
  sectionNote: { color: '#7c8795', fontSize: 12, lineHeight: 16 },
  input: { borderRadius: 18, minHeight: 56, paddingHorizontal: 16, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#d9e5f2', color: '#17212b', fontSize: 15 },
  searchButton: { borderRadius: 18, paddingVertical: 15, alignItems: 'center', backgroundColor: '#17212b' },
  searchButtonText: { color: '#fff', fontSize: 17, lineHeight: 20, fontWeight: '800' },
  ticketCard: { borderRadius: 28, padding: 16, gap: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7edf4' },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  ticketTopText: { flex: 1 },
  ticketCode: { color: '#17212b', fontSize: 24, lineHeight: 28, fontWeight: '800' },
  ticketGame: { color: '#6b7280', lineHeight: 18 },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  badgeGood: { backgroundColor: '#dcfce7' },
  badgeWarn: { backgroundColor: '#fef3c7' },
  badgeDanger: { backgroundColor: '#fee2e2' },
  badgeGoodText: { color: '#166534', fontWeight: '800' },
  badgeWarnText: { color: '#92400e', fontWeight: '800' },
  badgeDangerText: { color: '#b91c1c', fontWeight: '800' },
  detailGrid: { gap: 10 },
  detailCard: { borderRadius: 18, padding: 14, gap: 4, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#e3edf8' },
  detailLabel: { color: '#7b8794', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  detailValue: { color: '#17212b', lineHeight: 20, fontWeight: '700' },
  prizeBanner: { borderRadius: 18, padding: 14, gap: 4, backgroundColor: '#faf8f2', borderWidth: 1, borderColor: '#ece7db' },
  prizeBannerLabel: { color: '#7c8795', fontSize: 12, lineHeight: 16, fontWeight: '700' },
  prizeBannerValue: { color: '#17212b', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  ticketActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 2 },
  ticketActionPrimary: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#0ea5e9' },
  ticketActionPrimaryText: { color: '#fff', fontWeight: '800' },
  ticketActionSecondary: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#dbeafe' },
  ticketActionSecondaryText: { color: '#0369a1', fontWeight: '800' },
  cancelSection: { marginTop: 4, gap: 10, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 14 },
  cancelSectionTitle: { color: '#17212b', fontSize: 20, lineHeight: 24, fontWeight: '800' },
  cancelHint: { color: '#64748b' },
  cancelButton: { borderRadius: 18, paddingVertical: 14, alignItems: 'center', backgroundColor: '#b91c1c' },
  cancelButtonDisabled: { opacity: 0.7 },
  cancelButtonText: { color: '#fff', fontSize: 17, lineHeight: 20, fontWeight: '800' },
  cancelledCard: { borderRadius: 18, padding: 14, gap: 6, backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' },
  cancelledTitle: { color: '#9f1239', fontSize: 20, lineHeight: 24, fontWeight: '800' },
  cancelledText: { color: '#881337' },
});
