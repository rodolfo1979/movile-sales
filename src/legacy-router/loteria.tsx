import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { Lottery, createLotteryTicketMobile, fetchLotteries, getDrawClosingLabel, isBlockedForDraw, normalizeLotteryNumber, todayTicketDate, uploadLotteryProof } from '@/services/api';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { printTicketReceipt, shareTicketReceipt, type TicketReceipt } from '@/utils/ticket-receipt';
import { useAppSession } from '@/contexts/app-session';

const amounts = [500, 1000, 2000, 3000, 4000, 5000];
const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '<'];
const paymentMethods = [
  { key: 'efectivo', label: 'Efectivo', note: 'Validacion automatica' },
  { key: 'sinpe', label: 'Sinpe movil', note: 'Sube comprobante' },
] as const;

export default function LoteriaScreen() {
  const { tenantSlug, authUser, accessToken, addRecentSale } = useAppSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lotteries, setLotteries] = useState<Lottery[]>([]);
  const [selectedLotteryId, setSelectedLotteryId] = useState('');
  const [selectedDrawId, setSelectedDrawId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [numberValue, setNumberValue] = useState('');
  const [amount, setAmount] = useState('1000');
  const [reventadoAmount, setReventadoAmount] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'sinpe'>('efectivo');
  const [selectedProof, setSelectedProof] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [lastTicket, setLastTicket] = useState<TicketReceipt | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError('');
        const data = await fetchLotteries(tenantSlug);
        if (cancelled) return;
        setLotteries(data);
        const firstLottery = data[0];
        if (firstLottery) {
          setSelectedLotteryId(firstLottery.id);
          setSelectedDrawId(firstLottery.draws[0]?.id ?? '');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar las loterias.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = false;
    };
  }, [tenantSlug]);

  const selectedLottery = useMemo(() => lotteries.find((item) => item.id === selectedLotteryId) ?? null, [lotteries, selectedLotteryId]);
  const selectedDraw = useMemo(() => selectedLottery?.draws.find((item) => item.id === selectedDrawId) ?? null, [selectedLottery, selectedDrawId]);
  const normalizedNumber = normalizeLotteryNumber(numberValue);
  const blockedEntries = useMemo(() => {
    if (!selectedLottery || !selectedDraw) return [];
    const seen = new Set<string>();
    return selectedLottery.blockedNumbers
      .filter((item) => !item.drawId || item.drawId === selectedDraw.id)
      .filter((item) => {
        const normalized = normalizeLotteryNumber(item.numberValue);
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
  }, [selectedDraw, selectedLottery]);
  const blocked = selectedLottery && selectedDraw ? isBlockedForDraw(selectedLottery, selectedDraw.id, normalizedNumber) : false;
  const totalAmount = Number(amount || 0) + Number(reventadoAmount || 0);

  function chooseLottery(lottery: Lottery) {
    setSelectedLotteryId(lottery.id);
    setSelectedDrawId(lottery.draws[0]?.id ?? '');
    setSuccess('');
    setError('');
  }

  function pressKey(key: string) {
    setNumberValue((current) => {
      if (key === '<') return current.slice(0, -1);
      return (current + key).replace(/\D/g, '').slice(0, 2);
    });
  }

  async function pickProof() {
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
    if (!result.canceled) {
      setSelectedProof(result.assets[0] ?? null);
      setError('');
    }
  }

  async function handleSell() {
    if (!authUser || !accessToken) {
      setError('Inicia sesion como vendedor antes de generar tickets.');
      return;
    }
    if (!selectedLottery || !selectedDraw) {
      setError('Escoge una loteria y un sorteo disponibles.');
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setError('Escribe nombre y telefono del cliente.');
      return;
    }
    if (customerPhone.replace(/\D/g, '').length < 8) {
      setError('Escribe un telefono valido.');
      return;
    }
    if (normalizedNumber.length !== 2) {
      setError('Escribe un numero de dos cifras.');
      return;
    }
    if (blocked) {
      setError('El numero ' + normalizedNumber + ' esta bloqueado para este sorteo.');
      return;
    }
    if (Number(amount) <= 0) {
      setError('El monto debe ser mayor que cero.');
      return;
    }
    if (paymentMethod === 'sinpe' && !selectedProof) {
      setError('Sube la foto del comprobante para continuar.');
      return;
    }

    try {
      setSaving(true);
      setSuccess('');
      setError('');
      const uploadedProof = paymentMethod === 'sinpe' && selectedProof
        ? await uploadLotteryProof({ uri: selectedProof.uri, fileName: selectedProof.fileName, mimeType: selectedProof.mimeType })
        : null;
      const drawDate = todayTicketDate(selectedDraw.drawTime);
      const result = await createLotteryTicketMobile({
        customerName: customerName.trim(),
        customerPhone: customerPhone.replace(/\D/g, ''),
        lotteryId: selectedLottery.id,
        drawId: selectedDraw.id,
        drawDate,
        paymentMethod,
        paymentProofUrl: uploadedProof?.fileUrl,
        numbers: [{ numberValue: normalizedNumber, amount: Number(amount || 0), reventadoAmount: selectedLottery.reventadoEnabled ? Number(reventadoAmount || 0) : 0 }],
      }, accessToken);
      const receipt: TicketReceipt = {
        title: 'Ticket de loteria',
        ticketCode: result.ticketCode,
        customerName: customerName.trim(),
        customerPhone: customerPhone.replace(/\D/g, ''),
        gameLabel: selectedLottery.name,
        drawName: selectedDraw.name,
        drawTime: selectedDraw.drawTime,
        drawDate,
        paymentMethod,
        totalAmount: '�' + result.totalAmount,
        status: result.status === 'validated' ? 'validado' : 'pendiente de validacion',
        proofName: uploadedProof?.originalName,
        entries: [{
          label: normalizedNumber,
          amount: '�' + amount,
          detail: selectedLottery.reventadoEnabled && Number(reventadoAmount || 0) > 0 ? 'Reventado �' + reventadoAmount : 'Normal',
        }],
      };
      setLastTicket(receipt);
      await addRecentSale({
        ticketCode: result.ticketCode,
        gameLabel: selectedLottery.name,
        drawLabel: selectedDraw.name + ' | ' + selectedDraw.drawTime,
        totalAmount: '�' + result.totalAmount,
        status: receipt.status,
        customerName: customerName.trim(),
        createdAt: new Date().toLocaleString('es-CR'),
        sellerEmail: authUser.email,
      });
      setSuccess('Ticket ' + result.ticketCode + ' generado correctamente.');
      setNumberValue('');
      setAmount('1000');
      setReventadoAmount('0');
      setSelectedProof(null);
      setPaymentMethod('efectivo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el ticket.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.heroCard}>
          <ThemedText type="small" style={styles.eyebrow}>VENTA DE LOTERIA</ThemedText>
          <ThemedText type="title" style={styles.title}>Caja movil</ThemedText>
          <ThemedText style={styles.subtle}>Tenant {tenantSlug}. Escoge el sorteo, captura la jugada y genera el ticket en efectivo o Sinpe desde una sola pantalla.</ThemedText>
          {authUser ? <ThemedText style={styles.operatorHint}>Vendedor activo {authUser.email}</ThemedText> : <ThemedText style={styles.operatorWarning}>Inicia sesion en Inicio para vender.</ThemedText>}
        </ThemedView>

        {loading ? <ActivityIndicator size="large" color="#1d4ed8" /> : null}
        {error ? <ThemedView style={styles.errorCard}><ThemedText style={styles.errorText}>{error}</ThemedText></ThemedView> : null}
        {success ? <ThemedView style={styles.successCard}><ThemedText style={styles.successText}>{success}</ThemedText></ThemedView> : null}
        {!loading && !error && lotteries.length === 0 ? (
          <ThemedView style={styles.warningCard}>
            <ThemedText type="subtitle" style={styles.warningTitle}>No hay sorteos disponibles</ThemedText>
            <ThemedText style={styles.warningText}>Las loterias de este tenant ya cerraron por horario o no tienen sorteos activos en este momento.</ThemedText>
          </ThemedView>
        ) : null}

        <ThemedView style={styles.panel}>
          <ThemedText type="subtitle">Loterias abiertas</ThemedText>
          <View style={styles.chipWrap}>
            {lotteries.map((lottery) => (
              <Pressable key={lottery.id} onPress={() => chooseLottery(lottery)} style={[styles.selectorChip, selectedLotteryId === lottery.id && styles.selectorChipActive]}>
                <ThemedText type="small" style={selectedLotteryId === lottery.id ? styles.selectorChipTextActive : styles.selectorChipText}>{lottery.name}</ThemedText>
              </Pressable>
            ))}
          </View>
          {selectedLottery ? (
            <>
              <ThemedText style={styles.sectionHint}>Sorteo activo</ThemedText>
              <View style={styles.drawList}>
                {selectedLottery.draws.map((draw) => (
                  <Pressable key={draw.id} onPress={() => setSelectedDrawId(draw.id)} style={[styles.drawCard, selectedDrawId === draw.id && styles.drawCardActive]}>
                    <ThemedText type="subtitle">{draw.name}</ThemedText>
                    <ThemedText style={styles.drawMeta}>{draw.drawTime}</ThemedText>
                    <ThemedText style={styles.drawHint}>{getDrawClosingLabel(draw.drawTime, draw.cutoffMinutes)}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </ThemedView>

        {selectedLottery && selectedDraw ? (
          <ThemedView style={styles.operationCard}>
            <View style={styles.operationHeader}>
              <View style={styles.operationTitleWrap}>
                <ThemedText type="small" style={styles.operationEyebrow}>SORTEO SELECCIONADO</ThemedText>
                <ThemedText type="title" style={styles.operationTitle}>{selectedLottery.name} � {selectedDraw.name}</ThemedText>
                <ThemedText style={styles.operationSubtitle}>{selectedDraw.drawTime} � Premio x{selectedLottery.payoutMultiplier}{selectedLottery.reventadoEnabled ? ' � Reventado x' + selectedLottery.reventadoMultiplier : ''}</ThemedText>
              </View>
              <ThemedView style={styles.totalCard}>
                <ThemedText type="small" style={styles.totalLabel}>TOTAL</ThemedText>
                <ThemedText type="subtitle" style={styles.totalValue}>�{totalAmount}</ThemedText>
              </ThemedView>
            </View>

            <View style={styles.inlineInputs}>
              <TextInput style={[styles.input, styles.flexInput]} value={customerName} onChangeText={setCustomerName} placeholder="Nombre del cliente" placeholderTextColor="#94a3b8" />
              <TextInput style={[styles.input, styles.flexInput]} value={customerPhone} onChangeText={(value) => setCustomerPhone(value.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Telefono" placeholderTextColor="#94a3b8" />
            </View>

            <ThemedView style={styles.paymentPanel}>
              <ThemedText type="subtitle">Metodo de pago</ThemedText>
              <View style={styles.paymentRow}>
                {paymentMethods.map((item) => (
                  <Pressable key={item.key} style={[styles.paymentChip, paymentMethod === item.key && styles.paymentChipActive]} onPress={() => setPaymentMethod(item.key)}>
                    <ThemedText type="small" style={paymentMethod === item.key ? styles.paymentChipTextActive : styles.paymentChipText}>{item.label}</ThemedText>
                    <ThemedText style={paymentMethod === item.key ? styles.paymentChipNoteActive : styles.paymentChipNote}>{item.note}</ThemedText>
                  </Pressable>
                ))}
              </View>
              {paymentMethod === 'sinpe' ? (
                <ThemedView style={styles.proofCard}>
                  <View style={styles.proofHeader}>
                    <View style={{ flex: 1 }}>
                      <ThemedText type="subtitle">Comprobante</ThemedText>
                      <ThemedText style={styles.subtle}>Se enviara automaticamente al generar el ticket.</ThemedText>
                    </View>
                    <Pressable style={styles.proofButton} onPress={() => void pickProof()}>
                      <ThemedText type="small" style={styles.proofButtonText}>{selectedProof ? 'Cambiar foto' : 'Subir foto'}</ThemedText>
                    </Pressable>
                  </View>
                  {selectedProof ? <Image source={{ uri: selectedProof.uri }} style={styles.proofPreview} /> : null}
                </ThemedView>
              ) : null}
            </ThemedView>

            <View style={styles.sellGrid}>
              <View style={styles.leftColumn}>
                <ThemedText type="small" style={styles.panelLabel}>Numero</ThemedText>
                <TextInput style={styles.bigInput} value={normalizedNumber} editable={false} placeholder="00" placeholderTextColor="#94a3b8" />
                <View style={styles.keypad}>
                  {keypad.map((key) => (
                    <Pressable key={key} onPress={() => pressKey(key)} style={[styles.keyButton, key === '<' && styles.keyButtonAccent]}>
                      <ThemedText type="subtitle" style={styles.keyButtonText}>{key === '<' ? 'Borrar' : key}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.rightColumn}>
                <ThemedText type="small" style={styles.panelLabel}>Monto</ThemedText>
                <TextInput style={styles.amountInput} value={amount} onChangeText={(value) => setAmount(value.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Monto principal" placeholderTextColor="#94a3b8" />
                <View style={styles.quickAmountGrid}>
                  {amounts.map((item) => (
                    <Pressable key={item} style={[styles.quickAmountButton, amount === String(item) && styles.quickAmountButtonActive]} onPress={() => setAmount(String(item))}>
                      <ThemedText type="small" style={amount === String(item) ? styles.quickAmountTextActive : styles.quickAmountText}>�{item}</ThemedText>
                    </Pressable>
                  ))}
                </View>
                {selectedLottery.reventadoEnabled ? (
                  <>
                    <ThemedText type="small" style={styles.panelLabel}>Reventado</ThemedText>
                    <TextInput style={styles.amountInput} value={reventadoAmount} onChangeText={(value) => setReventadoAmount(value.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Monto reventado" placeholderTextColor="#94a3b8" />
                  </>
                ) : null}
              </View>
            </View>

            <ThemedView style={styles.blockedPanel}>
              <ThemedText type="subtitle">Numeros bloqueados del sorteo</ThemedText>
              <View style={styles.chipWrap}>
                {blockedEntries.length ? blockedEntries.map((item) => (
                  <ThemedView key={item.id} style={styles.blockedChip}>
                    <ThemedText type="small" style={styles.blockedChipText}>#{normalizeLotteryNumber(item.numberValue)}{item.reason ? ' � ' + item.reason : ''}</ThemedText>
                  </ThemedView>
                )) : <ThemedText style={styles.subtle}>Sin numeros bloqueados.</ThemedText>}
              </View>
            </ThemedView>

            <Pressable style={[styles.sellButton, saving && styles.sellButtonDisabled]} onPress={() => void handleSell()} disabled={saving}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText type="subtitle" style={styles.sellButtonText}>Generar ticket</ThemedText>}
            </Pressable>
          </ThemedView>
        ) : null}

        {lastTicket ? (
          <ThemedView style={styles.ticketCard}>
            <ThemedText type="small" style={styles.ticketEyebrow}>ULTIMO TICKET</ThemedText>
            <ThemedText type="title" style={styles.ticketCode}>{lastTicket.ticketCode}</ThemedText>
            <ThemedText style={styles.ticketMeta}>Total registrado {lastTicket.totalAmount}</ThemedText>
            <ThemedText style={styles.ticketMeta}>Estado {lastTicket.status}</ThemedText>
            <View style={styles.ticketActions}>
              <Pressable style={styles.ticketActionPrimary} onPress={() => void shareTicketReceipt(lastTicket)}>
                <ThemedText type="small" style={styles.ticketActionPrimaryText}>Compartir</ThemedText>
              </Pressable>
              <Pressable style={styles.ticketActionSecondary} onPress={() => void printTicketReceipt(lastTicket)}>
                <ThemedText type="small" style={styles.ticketActionSecondaryText}>Imprimir</ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#eaf2fb' },
  content: { padding: 18, gap: 16, paddingBottom: 28 },
  heroCard: { borderRadius: 28, padding: 22, gap: 8, backgroundColor: '#fff' },
  eyebrow: { color: '#2563eb', letterSpacing: 1.8 },
  title: { fontSize: 30, lineHeight: 36 },
  subtle: { color: '#64748b', lineHeight: 21 },
  operatorHint: { color: '#1d4ed8', lineHeight: 21 },
  operatorWarning: { color: '#b91c1c', lineHeight: 21 },
  errorCard: { borderRadius: 18, padding: 14, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { color: '#b91c1c' },
  successCard: { borderRadius: 18, padding: 14, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#86efac' },
  successText: { color: '#166534' },
  warningCard: { borderRadius: 18, padding: 14, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', gap: 6 },
  warningTitle: { color: '#c2410c' },
  warningText: { color: '#9a3412', lineHeight: 21 },
  panel: { borderRadius: 24, padding: 18, gap: 12, backgroundColor: '#fff' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  selectorChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#bfdbfe' },
  selectorChipActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  selectorChipText: { color: '#1d4ed8' },
  selectorChipTextActive: { color: '#fff' },
  sectionHint: { color: '#64748b', marginTop: 4 },
  drawList: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  drawCard: { minWidth: 140, borderRadius: 18, padding: 14, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#dbeafe', gap: 4 },
  drawCardActive: { backgroundColor: '#dbeafe', borderColor: '#60a5fa' },
  drawMeta: { color: '#0f172a' },
  drawHint: { color: '#1d4ed8' },
  operationCard: { borderRadius: 28, padding: 18, gap: 16, backgroundColor: '#ffffff' },
  operationHeader: { gap: 14 },
  operationTitleWrap: { gap: 4 },
  operationEyebrow: { color: '#2563eb', letterSpacing: 1.4 },
  operationTitle: { fontSize: 24, lineHeight: 30 },
  operationSubtitle: { color: '#64748b' },
  totalCard: { borderRadius: 22, padding: 16, backgroundColor: '#dbeafe', alignSelf: 'flex-start', minWidth: 120 },
  totalLabel: { color: '#1d4ed8', letterSpacing: 1.2 },
  totalValue: { color: '#0f172a' },
  inlineInputs: { gap: 12 },
  flexInput: { flex: 1 },
  input: { borderRadius: 18, minHeight: 56, paddingHorizontal: 16, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#dbeafe', color: '#0f172a' },
  paymentPanel: { borderRadius: 22, padding: 14, backgroundColor: '#f8fbff', gap: 12 },
  paymentRow: { gap: 10 },
  paymentChip: { borderRadius: 18, padding: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#dbeafe', gap: 4 },
  paymentChipActive: { backgroundColor: '#1d4ed8', borderColor: '#1d4ed8' },
  paymentChipText: { color: '#1d4ed8' },
  paymentChipTextActive: { color: '#fff' },
  paymentChipNote: { color: '#64748b' },
  paymentChipNoteActive: { color: '#dbeafe' },
  proofCard: { borderRadius: 18, padding: 14, backgroundColor: '#ffffff', gap: 12, borderWidth: 1, borderColor: '#bfdbfe' },
  proofHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  proofButton: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#dbeafe' },
  proofButtonText: { color: '#1d4ed8' },
  proofPreview: { width: '100%', height: 180, borderRadius: 16, backgroundColor: '#dbeafe' },
  sellGrid: { gap: 16 },
  leftColumn: { gap: 10 },
  rightColumn: { gap: 10 },
  panelLabel: { color: '#64748b', letterSpacing: 1.2 },
  bigInput: { borderRadius: 22, minHeight: 68, paddingHorizontal: 18, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#93c5fd', color: '#0f172a', fontSize: 32, fontWeight: '700' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  keyButton: { width: '30%', minWidth: 88, borderRadius: 18, paddingVertical: 16, alignItems: 'center', backgroundColor: '#eff6ff' },
  keyButtonAccent: { backgroundColor: '#dbeafe' },
  keyButtonText: { color: '#0f172a' },
  amountInput: { borderRadius: 18, minHeight: 56, paddingHorizontal: 16, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', color: '#7c2d12' },
  quickAmountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickAmountButton: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ffedd5' },
  quickAmountButtonActive: { backgroundColor: '#f97316' },
  quickAmountText: { color: '#9a3412' },
  quickAmountTextActive: { color: '#fff' },
  blockedPanel: { borderRadius: 20, padding: 14, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', gap: 10 },
  blockedChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#fff1f2' },
  blockedChipText: { color: '#be123c' },
  sellButton: { borderRadius: 20, paddingVertical: 16, alignItems: 'center', backgroundColor: '#1d4ed8' },
  sellButtonDisabled: { opacity: 0.7 },
  sellButtonText: { color: '#fff' },
  ticketCard: { borderRadius: 24, padding: 18, gap: 8, backgroundColor: '#0f172a' },
  ticketEyebrow: { color: '#93c5fd', letterSpacing: 1.5 },
  ticketCode: { color: '#fff', fontSize: 28, lineHeight: 34 },
  ticketMeta: { color: '#cbd5e1' },
  ticketActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 6 },
  ticketActionPrimary: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#2563eb' },
  ticketActionPrimaryText: { color: '#fff' },
  ticketActionSecondary: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#dbeafe' },
  ticketActionSecondaryText: { color: '#1d4ed8' },
});


