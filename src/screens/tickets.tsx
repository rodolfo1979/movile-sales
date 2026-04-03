import * as React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchTicketByCode, TicketLookup } from '../services/api';
import { useAppSession } from '../contexts/app-session';
import BrandHeader from '../components/brand-header';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { printWithConfiguredPrinter } from '../services/printer';
import { shareTicketReceipt, type TicketReceipt } from '../utils/ticket-receipt';

export default function TicketsScreen() {
  const { tenantSlug, printerConfig } = useAppSession();
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [ticket, setTicket] = React.useState<TicketLookup | null>(null);

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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.headerCard}>
          <BrandHeader
            section="TICKETS"
            title="Consulta rapida por codigo"
            description="ONE"
            note="Busca tickets normales y tickets de 3 Monazos desde el mismo flujo."
            sectionColor="#B71C1C"
            titleColor="#0f172a"
            bodyColor="#64748b"
          />
        </ThemedView>

        <ThemedView style={styles.searchCard}>
          <ThemedText type="subtitle">Buscar ticket</ThemedText>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            autoCapitalize="characters"
            placeholder="TK-XXXX o MZ-XXXX"
            placeholderTextColor="#94a3b8"
          />
          <Pressable style={styles.searchButton} onPress={() => void handleLookup()}>
            {loading ? <ActivityIndicator color="#ffffff" /> : <ThemedText type="subtitle" style={styles.searchButtonText}>Consultar ticket</ThemedText>}
          </Pressable>
        </ThemedView>

        {ticket ? (
          <ThemedView style={styles.ticketCard}>
            <View style={styles.ticketTop}>
              <View style={styles.ticketTopText}>
                <ThemedText type="subtitle">{ticket.ticketCode}</ThemedText>
                <ThemedText style={styles.copy}>{ticket.lottery?.name || ticket.game?.name || 'Juego'}</ThemedText>
              </View>
              <ThemedView style={[styles.badge, ticket.status === 'validated' ? styles.badgeGood : styles.badgeWarn]}>
                <ThemedText type="small" style={ticket.status === 'validated' ? styles.badgeGoodText : styles.badgeWarnText}>{ticket.status}</ThemedText>
              </ThemedView>
            </View>
            <ThemedText style={styles.copy}>Cliente: {ticket.customerName || 'Cliente general'}</ThemedText>
            <ThemedText style={styles.copy}>Telefono: {ticket.customerPhone || 'Sin telefono'}</ThemedText>
            <ThemedText style={styles.copy}>Sorteo: {ticket.draw?.name || '-'} · {ticket.draw?.drawTime || '-'}</ThemedText>
            <ThemedText style={styles.copy}>Total: C{ticket.totalAmount}</ThemedText>
            <ThemedText style={styles.copy}>Premio: {ticket.prizeStatus}</ThemedText>
            {receipt ? (
              <View style={styles.ticketActions}>
                <Pressable style={styles.ticketActionPrimary} onPress={() => void shareTicketReceipt(receipt)}>
                  <ThemedText type="small" style={styles.ticketActionPrimaryText}>Compartir</ThemedText>
                </Pressable>
                <Pressable style={styles.ticketActionSecondary} onPress={() => void handleReprint()}>
                  <ThemedText type="small" style={styles.ticketActionSecondaryText}>Reimprimir</ThemedText>
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
  safeArea: { flex: 1, backgroundColor: '#edf4fb' },
  content: { padding: 20, gap: 16 },
  headerCard: { borderRadius: 28, padding: 20, gap: 8, backgroundColor: '#fff' },
  copy: { color: '#64748b', lineHeight: 21 },
  searchCard: { borderRadius: 24, padding: 18, gap: 14, backgroundColor: '#fff' },
  input: { borderRadius: 18, minHeight: 56, paddingHorizontal: 16, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#dbeafe', color: '#0f172a' },
  searchButton: { borderRadius: 18, paddingVertical: 14, alignItems: 'center', backgroundColor: '#0f172a' },
  searchButtonText: { color: '#fff' },
  ticketCard: { borderRadius: 24, padding: 18, gap: 10, backgroundColor: '#fff' },
  ticketTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  ticketTopText: { flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  badgeGood: { backgroundColor: '#dcfce7' },
  badgeWarn: { backgroundColor: '#fef3c7' },
  badgeGoodText: { color: '#166534' },
  badgeWarnText: { color: '#92400e' },
  ticketActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 6 },
  ticketActionPrimary: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#0ea5e9' },
  ticketActionPrimaryText: { color: '#fff' },
  ticketActionSecondary: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#dbeafe' },
  ticketActionSecondaryText: { color: '#0369a1' },
});
