import * as React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import {
  Lottery,
  createLotteryTicketMobile,
  fetchLotteries,
  getDrawClosingLabel,
  isBlockedForDraw,
  normalizeLotteryNumber,
  todayTicketDate,
  uploadLotteryProof,
} from '../services/api';
import { useAppSession } from '../contexts/app-session';
import { useMobileNav } from '../contexts/mobile-nav';
import BrandHeader from '../components/brand-header';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { attemptAutoPrint } from '../services/printer';
import { printTicketReceipt, shareTicketReceipt, type TicketReceipt } from '../utils/ticket-receipt';

const quickAmounts = [50, 100, 500, 1000, 2000, 5000];
const keypad = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '+', '<'];
const paymentMethods = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'sinpe', label: 'Sinpe movil' },
] as const;

type DraftEntry = {
  id: string;
  numberValue: string;
  amount: number;
  reventadoAmount: number;
};

export default function LoteriaScreen() {
  const { tenantSlug, authUser, accessToken, addRecentSale, printerConfig } = useAppSession();
  const { consumeLotterySelection } = useMobileNav();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [lotteries, setLotteries] = React.useState<Lottery[]>([]);
  const [selectedLotteryId, setSelectedLotteryId] = React.useState('');
  const [selectedDrawId, setSelectedDrawId] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [numberValue, setNumberValue] = React.useState('');
  const [multiPlayEnabled, setMultiPlayEnabled] = React.useState(false);
  const [amount, setAmount] = React.useState('500');
  const [reventadoAmount, setReventadoAmount] = React.useState('0');
  const [entries, setEntries] = React.useState<DraftEntry[]>([]);
  const [paymentMethod, setPaymentMethod] = React.useState<'efectivo' | 'sinpe'>('efectivo');
  const [selectedProof, setSelectedProof] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  const [lastTicket, setLastTicket] = React.useState<TicketReceipt | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError('');
        const data = await fetchLotteries(tenantSlug);
        if (cancelled) return;
        setLotteries(data);
        const preferredLotteryId = consumeLotterySelection();
        const preferredLottery = data.find((item) => item.id === preferredLotteryId) ?? data[0];
        if (preferredLottery) {
          setSelectedLotteryId(preferredLottery.id);
          setSelectedDrawId(preferredLottery.draws[0]?.id ?? '');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar las loterias.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, consumeLotterySelection]);

  const selectedLottery = React.useMemo(() => lotteries.find((item) => item.id === selectedLotteryId) ?? null, [lotteries, selectedLotteryId]);
  const selectedDraw = React.useMemo(() => selectedLottery?.draws.find((item) => item.id === selectedDrawId) ?? null, [selectedLottery, selectedDrawId]);
  const normalizedNumber = normalizeLotteryNumber(numberValue);
  const totalAmount = React.useMemo(() => entries.reduce((sum, item) => sum + item.amount + item.reventadoAmount, 0), [entries]);
  const blockedEntries = React.useMemo(() => {
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
  const feedbackTone = error ? 'error' : success ? 'success' : null;
  const feedbackMessage = error || success;

  function clearFeedback() {
    if (error) setError('');
    if (success) setSuccess('');
  }

  function chooseLottery(lottery: Lottery) {
    setSelectedLotteryId(lottery.id);
    setSelectedDrawId(lottery.draws[0]?.id ?? '');
    setEntries([]);
    setNumberValue('');
    setMultiPlayEnabled(false);
    clearFeedback();
  }

  function resetSaleForm() {
    setCustomerName('');
    setCustomerPhone('');
    setNumberValue('');
    setMultiPlayEnabled(false);
    setAmount('500');
    setReventadoAmount('0');
    setEntries([]);
    setPaymentMethod('efectivo');
    setSelectedProof(null);
    setLastTicket(null);
    setSuccess('');
    setError('');
  }

  async function handleShareCurrentTicket() {
    if (!lastTicket) return;
    await shareTicketReceipt(lastTicket);
    resetSaleForm();
  }

  async function commitEntry(nextNumberValue: string, options?: { keepAmounts?: boolean }) {
    if (!selectedLottery || !selectedDraw) {
      setError('Escoge una loteria y un sorteo disponibles.');
      return false;
    }
    const normalizedEntry = normalizeLotteryNumber(nextNumberValue);
    if (normalizedEntry.length !== 2) {
      setError('Escribe un numero de dos cifras.');
      return false;
    }
    if (isBlockedForDraw(selectedLottery, selectedDraw.id, normalizedEntry)) {
      setError(`El numero ${normalizedEntry} esta bloqueado para este sorteo.`);
      return false;
    }
    if (entries.some((item) => item.numberValue === normalizedEntry)) {
      setError('Ese numero ya esta agregado en la venta.');
      return false;
    }
    const entryAmount = Number(amount || 0);
    const entryReventadoAmount = selectedLottery.reventadoEnabled ? Number(reventadoAmount || 0) : 0;
    if (entryAmount <= 0) {
      setError('El monto debe ser mayor que cero.');
      return false;
    }
    setEntries((current) => [
      ...current,
      {
        id: Date.now().toString() + Math.random().toString(16).slice(2),
        numberValue: normalizedEntry,
        amount: entryAmount,
        reventadoAmount: entryReventadoAmount,
      },
    ]);
    setNumberValue('');
    if (!options?.keepAmounts) {
      setAmount('500');
      setReventadoAmount('0');
    }
    clearFeedback();
    return true;
  }

  function pressKey(key: string) {
    if (key === '<') {
      clearFeedback();
      setNumberValue((current) => current.slice(0, -1));
      return;
    }
    if (key === '+') {
      void addEntry();
      return;
    }
    clearFeedback();
    setNumberValue((current) => {
      const nextValue = (current + key).replace(/\D/g, '').slice(0, 2);
      if (multiPlayEnabled && nextValue.length === 2) {
        void commitEntry(nextValue, { keepAmounts: true });
        return '';
      }
      return nextValue;
    });
  }

function removeEntry(entryId: string) {
  setEntries((current) => current.filter((item) => item.id !== entryId));
}

  function formatCurrency(value: number) {
    return 'CRC ' + value.toLocaleString('es-CR');
  }

  async function pickProof() {
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
    if (!result.canceled) {
      setSelectedProof(result.assets[0] ?? null);
      clearFeedback();
    }
  }

  async function addEntry() {
    await commitEntry(normalizedNumber, { keepAmounts: false });
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
    if (!entries.length) {
      setError('Agrega al menos una jugada antes de confirmar la venta.');
      return;
    }
    if (customerPhone.trim() && customerPhone.replace(/\D/g, '').length < 8) {
      setError('Si escribes telefono, debe tener al menos 8 digitos.');
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
        customerName: customerName.trim() || '',
        customerPhone: customerPhone.replace(/\D/g, '') || '',
        lotteryId: selectedLottery.id,
        drawId: selectedDraw.id,
        drawDate,
        paymentMethod,
        paymentProofUrl: uploadedProof?.fileUrl,
        numbers: entries.map((entry) => ({
          numberValue: entry.numberValue,
          amount: entry.amount,
          reventadoAmount: entry.reventadoAmount,
        })),
      }, accessToken);
      const receipt: TicketReceipt = {
        title: 'Ticket de loteria',
        ticketCode: result.ticketCode,
        customerName: customerName.trim() || 'Cliente general',
        customerPhone: customerPhone.replace(/\D/g, '') || '',
        gameLabel: selectedLottery.name,
        drawName: selectedDraw.name,
        drawTime: selectedDraw.drawTime,
        drawDate,
        paymentMethod,
        totalAmount: 'CRC ' + result.totalAmount,
        status: result.status === 'validated' ? 'validado' : 'pendiente de validacion',
        proofName: uploadedProof?.originalName,
        entries: entries.map((entry) => ({
          label: entry.numberValue,
          amount: 'CRC ' + entry.amount,
          detail: entry.reventadoAmount > 0 ? 'Reventado CRC ' + entry.reventadoAmount : 'Normal',
        })),
      };
      setLastTicket(receipt);
      await attemptAutoPrint(receipt, printerConfig);
      await addRecentSale({
        ticketCode: result.ticketCode,
        gameLabel: selectedLottery.name,
        drawLabel: selectedDraw.name + ' | ' + selectedDraw.drawTime,
        totalAmount: 'CRC ' + result.totalAmount,
        status: receipt.status,
        customerName: customerName.trim() || 'Cliente general',
        createdAt: new Date().toLocaleString('es-CR'),
        sellerEmail: authUser.email,
      });
      setSuccess('Venta registrada correctamente.');
      setEntries([]);
      setNumberValue('');
      setAmount('500');
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
          <BrandHeader
            section="LOTERIA"
            title="Venta rapida"
            description={selectedLottery?.name || tenantSlug}
            note={selectedDraw ? `${selectedDraw.name} | ${selectedDraw.drawTime}` : 'Selecciona sorteo'}
            sectionColor="#0f6b3c"
            titleColor="#1f2937"
            bodyColor="#6b7280"
          />
          <View style={styles.heroMetaRow}>
            {authUser ? <ThemedText style={styles.operatorHint}>Vendedor {authUser.email}</ThemedText> : <ThemedText style={styles.operatorWarning}>Inicia sesion en Inicio para vender</ThemedText>}
            {selectedDraw ? <ThemedText style={styles.heroMetaText}>{getDrawClosingLabel(selectedDraw.drawTime, selectedDraw.cutoffMinutes)}</ThemedText> : null}
          </View>
        </ThemedView>

        {loading ? <ActivityIndicator size="large" color="#0f6b3c" /> : null}
        {feedbackTone && feedbackMessage ? (
          <ThemedView style={[styles.feedbackPill, feedbackTone === 'error' ? styles.feedbackPillError : styles.feedbackPillSuccess]}>
            <ThemedText style={feedbackTone === 'error' ? styles.feedbackPillErrorText : styles.feedbackPillSuccessText}>{feedbackMessage}</ThemedText>
          </ThemedView>
        ) : null}

        {!loading && !error && lotteries.length === 0 ? (
          <ThemedView style={styles.warningCard}>
            <ThemedText type="subtitle" style={styles.warningTitle}>No hay sorteos disponibles</ThemedText>
            <ThemedText style={styles.warningText}>Las loterias de este tenant ya cerraron por horario o no tienen sorteos activos en este momento.</ThemedText>
          </ThemedView>
        ) : null}

        <ThemedView style={styles.surfaceCard}>
          <ThemedText style={styles.sectionTitle}>Loteria y sorteo</ThemedText>
          <View style={styles.chipWrap}>
            {lotteries.map((lottery) => (
              <Pressable key={lottery.id} onPress={() => chooseLottery(lottery)} style={[styles.selectorChip, selectedLotteryId === lottery.id && styles.selectorChipActive]}>
                <ThemedText type="small" style={selectedLotteryId === lottery.id ? styles.selectorChipTextActive : styles.selectorChipText}>{lottery.name}</ThemedText>
              </Pressable>
            ))}
          </View>

          {selectedLottery ? (
            <View style={styles.drawList}>
              {selectedLottery.draws.map((draw) => (
                <Pressable key={draw.id} onPress={() => { clearFeedback(); setSelectedDrawId(draw.id); }} style={[styles.drawRow, selectedDrawId === draw.id && styles.drawRowActive]}>
                  <ThemedText style={styles.drawTitle}>{draw.name}</ThemedText>
                  <ThemedText style={styles.drawMeta}>{draw.drawTime}</ThemedText>
                  <ThemedText style={styles.drawHint}>{getDrawClosingLabel(draw.drawTime, draw.cutoffMinutes)}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ThemedView>

        {selectedLottery && selectedDraw ? (
          <ThemedView style={styles.cashierCard}>
            <View style={styles.brandBar}>
              <ThemedText style={styles.brandBarText}>{selectedLottery.name}</ThemedText>
              <ThemedText style={styles.brandBarMeta}>{selectedDraw.name} | {selectedDraw.drawTime}</ThemedText>
            </View>

            <View style={styles.inlineMetaRow}>
              <TextInput
                style={[styles.metaInput, styles.metaInputHalf]}
                value={customerName}
                onChangeText={(value) => { clearFeedback(); setCustomerName(value); }}
                placeholder="Cliente (opcional)"
                placeholderTextColor="#94a3b8"
              />
              <TextInput
                style={[styles.metaInput, styles.metaInputHalf]}
                value={customerPhone}
                onChangeText={(value) => { clearFeedback(); setCustomerPhone(value.replace(/\D/g, '')); }}
                keyboardType="number-pad"
                placeholder="Telefono del cliente (opcional)"
                placeholderTextColor="#94a3b8"
              />
            </View>

            <View style={styles.topFieldRow}>
              <View style={[styles.fieldBlock, styles.fieldGrow]}>
                <ThemedText style={styles.fieldLabel}>Monto CRC</ThemedText>
                <TextInput
                  style={styles.largeInput}
                  value={amount}
                  onChangeText={(value) => { clearFeedback(); setAmount(value.replace(/\D/g, '')); }}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                />
              </View>

              {selectedLottery.reventadoEnabled ? (
                <View style={[styles.fieldBlock, styles.reventadoField]}>
                  <ThemedText style={styles.fieldLabel}>Reventado</ThemedText>
                  <TextInput
                    style={styles.mediumInput}
                    value={reventadoAmount}
                    onChangeText={(value) => { clearFeedback(); setReventadoAmount(value.replace(/\D/g, '')); }}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              ) : null}
            </View>

            <View style={styles.fieldBlock}>
              <ThemedText style={styles.fieldLabel}>Numero</ThemedText>
              <TextInput style={styles.largeInput} value={normalizedNumber} editable={false} placeholder="00" placeholderTextColor="#cbd5e1" />
            </View>

            <Pressable
              onPress={() => {
                clearFeedback();
                setMultiPlayEnabled((current) => !current);
                setNumberValue('');
              }}
              style={[styles.multiPlayToggle, multiPlayEnabled && styles.multiPlayToggleActive]}
            >
              <View style={[styles.multiPlayCheckbox, multiPlayEnabled && styles.multiPlayCheckboxActive]}>
                <ThemedText style={multiPlayEnabled ? styles.multiPlayCheckboxTextActive : styles.multiPlayCheckboxText}>OK</ThemedText>
              </View>
              <View style={styles.multiPlayTextWrap}>
                <ThemedText style={styles.multiPlayTitle}>Multijugada</ThemedText>
                <ThemedText style={styles.multiPlayHint}>
                  {multiPlayEnabled
                    ? 'Activa: cada 2 digitos se agrega una jugada con el mismo monto.'
                    : 'Activa esta opcion para cargar varios numeros seguidos con el mismo monto.'}
                </ThemedText>
              </View>
            </Pressable>

            <View style={styles.quickAmountRow}>
              {quickAmounts.map((item) => (
                <Pressable key={item} style={[styles.quickAmountChip, amount === String(item) && styles.quickAmountChipActive]} onPress={() => { clearFeedback(); setAmount(String(item)); }}>
                  <ThemedText type="small" style={amount === String(item) ? styles.quickAmountChipTextActive : styles.quickAmountChipText}>
                    {item >= 1000 ? `CRC ${item / 1000}k` : `CRC ${item}`}
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            <View style={styles.keypadGrid}>
              {keypad.map((key) => (
                <Pressable key={key} onPress={() => pressKey(key)} style={[styles.keypadButton, key === '+' && styles.keypadButtonAccent, key === '<' && styles.keypadButtonNeutral]}>
                  <ThemedText style={key === '+' ? styles.keypadTextAccent : styles.keypadText}>{key === '<' ? 'DEL' : key}</ThemedText>
                </Pressable>
              ))}
            </View>

            <View style={styles.summaryRow}>
              <ThemedText style={styles.totalText}>Total CRC {totalAmount}</ThemedText>
              <ThemedText style={styles.summaryHint}>{entries.length} jugada(s)</ThemedText>
            </View>

            <View style={styles.entryList}>
              {entries.length ? entries.map((entry) => (
                <View key={entry.id} style={styles.entryRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.entryNumber}>#{entry.numberValue}</ThemedText>
                    <ThemedText style={styles.entryMeta}>
                      CRC {entry.amount}{entry.reventadoAmount > 0 ? `  |  Rev. CRC ${entry.reventadoAmount}` : ''}
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => removeEntry(entry.id)} style={styles.removeButton}>
                    <ThemedText style={styles.removeButtonText}>X</ThemedText>
                  </Pressable>
                </View>
              )) : (
                <ThemedText style={styles.emptyListText}>Agrega jugadas con el teclado y toca + para sumarlas.</ThemedText>
              )}
            </View>

            <View style={styles.paymentPanel}>
              {paymentMethods.map((item) => (
                <Pressable key={item.key} style={[styles.paymentChip, paymentMethod === item.key && styles.paymentChipActive]} onPress={() => { clearFeedback(); setPaymentMethod(item.key); }}>
                  <ThemedText type="small" style={paymentMethod === item.key ? styles.paymentChipTextActive : styles.paymentChipText}>{item.label}</ThemedText>
                </Pressable>
              ))}
            </View>

            {paymentMethod === 'sinpe' ? (
              <ThemedView style={styles.proofCard}>
                <View style={styles.proofHeader}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.sectionSubheading}>Comprobante</ThemedText>
                    <ThemedText style={styles.subtle}>Se adjunta al confirmar.</ThemedText>
                  </View>
                  <Pressable style={styles.proofButton} onPress={() => void pickProof()}>
                    <ThemedText type="small" style={styles.proofButtonText}>{selectedProof ? 'Cambiar' : 'Subir'}</ThemedText>
                  </Pressable>
                </View>
                {selectedProof ? <Image source={{ uri: selectedProof.uri }} style={styles.proofPreview} /> : null}
              </ThemedView>
            ) : null}

            {blockedEntries.length ? (
              <ThemedView style={styles.blockedPanel}>
                <ThemedText type="small" style={styles.blockedTitle}>Bloqueados</ThemedText>
                <View style={styles.blockedWrap}>
                  {blockedEntries.map((item) => (
                    <View key={item.id} style={styles.blockedChip}>
                      <ThemedText type="small" style={styles.blockedChipText}>#{normalizeLotteryNumber(item.numberValue)}</ThemedText>
                    </View>
                  ))}
                </View>
              </ThemedView>
            ) : null}

            <Pressable style={[styles.confirmButton, saving && styles.confirmButtonDisabled]} onPress={() => void handleSell()} disabled={saving}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.confirmButtonText}>Confirmar venta</ThemedText>}
            </Pressable>
          </ThemedView>
        ) : null}

        {lastTicket ? (
          <ThemedView style={styles.ticketCard}>
            <ThemedText type="small" style={styles.ticketEyebrow}>ULTIMO TICKET</ThemedText>
            <ThemedText style={styles.ticketCode}>{lastTicket.ticketCode}</ThemedText>
            <ThemedText style={styles.ticketMeta}>Total {lastTicket.totalAmount}</ThemedText>
            <ThemedText style={styles.ticketMeta}>Estado {lastTicket.status}</ThemedText>
            <View style={styles.ticketActions}>
              <Pressable style={styles.ticketActionPrimary} onPress={() => void handleShareCurrentTicket()}>
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
  safeArea: { flex: 1, backgroundColor: '#eef3f8' },
  content: { padding: 16, gap: 14, paddingBottom: 28 },
  heroCard: { borderRadius: 30, padding: 18, gap: 12, backgroundColor: '#fffaf2', borderWidth: 1, borderColor: '#f2e3cf', overflow: 'hidden' },
  heroGlow: { position: 'absolute', top: -22, right: -14, width: 140, height: 140, borderRadius: 999, backgroundColor: '#d8f5df', opacity: 0.55 },
  heroMetaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  heroMetaText: { color: '#0f6b3c', fontWeight: '700' },
  operatorHint: { color: '#4b5563', fontSize: 13, lineHeight: 18 },
  operatorWarning: { color: '#b91c1c', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  heroStatusChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  heroStatusDot: { width: 8, height: 8, borderRadius: 999 },
  heroStatusDotOn: { backgroundColor: '#22c55e' },
  heroStatusDotOff: { backgroundColor: '#ef4444' },
  heroStatusText: { color: '#4b5563', fontSize: 13, lineHeight: 18 },
  heroDeadline: { color: '#0f6b3c', fontWeight: '700' },
  feedbackPill: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  feedbackPillError: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' },
  feedbackPillSuccess: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' },
  feedbackPillErrorText: { color: '#be123c' },
  feedbackPillSuccessText: { color: '#166534' },
  warningCard: { borderRadius: 18, padding: 14, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', gap: 6 },
  warningTitle: { color: '#c2410c', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  warningText: { color: '#9a3412', lineHeight: 18 },
  sectionCard: { borderRadius: 26, padding: 16, gap: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7edf4' },
  surfaceCard: { borderRadius: 26, padding: 16, gap: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7edf4' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 },
  sectionEyebrow: { color: '#b45309', fontSize: 11, lineHeight: 14, letterSpacing: 1.6, fontWeight: '800' },
  sectionTitle: { color: '#17212b', fontSize: 22, lineHeight: 26, fontWeight: '800' },
  sectionSubheading: { color: '#17212b', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  sectionNote: { color: '#7c8795', fontSize: 12, lineHeight: 16 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectorChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f3efe4' },
  selectorChipActive: { backgroundColor: '#0f6b3c' },
  selectorChipText: { color: '#59616d' },
  selectorChipTextActive: { color: '#ffffff' },
  drawGrid: { gap: 10 },
  drawList: { gap: 10 },
  drawCard: { borderRadius: 18, padding: 14, gap: 4, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  drawCardActive: { backgroundColor: '#eefcf3', borderColor: '#b7e4c7' },
  drawRow: { borderRadius: 18, padding: 14, gap: 4, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  drawRowActive: { backgroundColor: '#eefcf3', borderColor: '#b7e4c7' },
  drawTitle: { color: '#17212b', fontSize: 17, lineHeight: 21, fontWeight: '800' },
  drawTime: { color: '#475569' },
  drawMeta: { color: '#475569' },
  drawHint: { color: '#0f6b3c' },
  salesCard: { borderRadius: 28, padding: 16, gap: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7edf4' },
  cashierCard: { borderRadius: 28, padding: 16, gap: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7edf4' },
  salesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  salesTitle: { color: '#17212b', fontSize: 24, lineHeight: 28, fontWeight: '800' },
  salesSubtitle: { color: '#6b7280' },
  salesTotalChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fef3c7' },
  salesTotalChipText: { color: '#92400e', fontWeight: '700' },
  brandBar: { borderRadius: 22, padding: 16, gap: 4, backgroundColor: '#0f6b3c' },
  brandBarText: { color: '#ffffff', fontSize: 24, lineHeight: 28, fontWeight: '800' },
  brandBarMeta: { color: '#dcfce7' },
  customerGrid: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  customerInputWide: { flex: 1, minWidth: 150 },
  inlineMetaRow: { flexDirection: 'row', gap: 10 },
  metaInput: { minHeight: 52, borderRadius: 18, paddingHorizontal: 15, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#d9e5f2', color: '#17212b', fontSize: 15 },
  metaInputHalf: { flex: 1 },
  input: { minHeight: 52, borderRadius: 18, paddingHorizontal: 15, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#d9e5f2', color: '#17212b', fontSize: 15 },
  captureGrid: { gap: 10 },
  captureMain: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  topFieldRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  fieldBlock: { gap: 8 },
  fieldGrow: { flex: 1 },
  fieldCard: { flex: 1, borderRadius: 20, padding: 14, gap: 8, backgroundColor: '#fbfcfe', borderWidth: 1, borderColor: '#e5edf6' },
  fieldCardCompact: { width: 132, borderRadius: 20, padding: 14, gap: 8, backgroundColor: '#fbfcfe', borderWidth: 1, borderColor: '#e5edf6' },
  reventadoField: { width: 132 },
  fieldLabel: { color: '#7b8794' },
  largeInput: { minHeight: 60, borderRadius: 18, paddingHorizontal: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d7dce3', color: '#17212b', fontSize: 26, fontWeight: '800' },
  mediumInput: { minHeight: 56, borderRadius: 18, paddingHorizontal: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d7dce3', color: '#17212b', fontSize: 20, fontWeight: '800' },
  amountInput: { minHeight: 60, borderRadius: 18, paddingHorizontal: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d7dce3', color: '#17212b', fontSize: 26, fontWeight: '800' },
  compactAmountInput: { minHeight: 56, borderRadius: 18, paddingHorizontal: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d7dce3', color: '#17212b', fontSize: 20, fontWeight: '800' },
  numberDisplay: { minHeight: 64, borderRadius: 18, paddingHorizontal: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d7dce3', color: '#17212b', fontSize: 32, fontWeight: '800', letterSpacing: 4 },
  blockedText: { color: '#b91c1c' },
  multiPlayCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#dbe3ea' },
  multiPlayCardActive: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  multiPlayToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 14, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#dbe3ea' },
  multiPlayToggleActive: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  multiPlayCheckbox: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e5e7eb' },
  multiPlayCheckboxActive: { backgroundColor: '#dc2626' },
  multiPlayCheckboxText: { color: '#6b7280', fontWeight: '800' },
  multiPlayCheckboxTextActive: { color: '#ffffff', fontWeight: '800' },
  multiPlayTextWrap: { flex: 1, gap: 2 },
  multiPlayIndicator: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e5e7eb' },
  multiPlayIndicatorActive: { backgroundColor: '#dc2626' },
  multiPlayIndicatorText: { color: '#6b7280', fontWeight: '800' },
  multiPlayIndicatorTextActive: { color: '#ffffff', fontWeight: '800' },
  multiPlayTitle: { color: '#17212b', fontSize: 16, lineHeight: 20, fontWeight: '800' },
  multiPlayHint: { color: '#64748b', lineHeight: 18 },
  quickAmountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickAmountChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff1f2' },
  quickAmountChipActive: { backgroundColor: '#dc2626' },
  quickAmountChipText: { color: '#b91c1c' },
  quickAmountChipTextActive: { color: '#ffffff' },
  keypadShell: { borderRadius: 22, padding: 12, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  keypadGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  keypadButton: { width: '31%', minWidth: 86, borderRadius: 18, paddingVertical: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f3f7' },
  keypadButtonAccent: { backgroundColor: '#fee2e2' },
  keypadButtonNeutral: { backgroundColor: '#e7e5df' },
  keypadText: { color: '#17212b', fontSize: 24, lineHeight: 28, fontWeight: '800' },
  keypadTextAccent: { color: '#b91c1c', fontSize: 24, lineHeight: 28, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  totalText: { color: '#17212b', fontSize: 20, lineHeight: 24, fontWeight: '800' },
  summaryHint: { color: '#6b7280' },
  entryList: { gap: 8, minHeight: 24 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 12, backgroundColor: '#fbfdff', borderWidth: 1, borderColor: '#e5edf6' },
  entryMeta: { color: '#64748b' },
  entryCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 12, backgroundColor: '#fbfdff', borderWidth: 1, borderColor: '#e5edf6' },
  entryCodeWrap: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff' },
  entryCode: { color: '#1d4ed8', fontSize: 22, lineHeight: 26, fontWeight: '800' },
  entryNumber: { color: '#17212b', fontSize: 19, lineHeight: 22, fontWeight: '800' },
  entryPrimary: { color: '#17212b', fontWeight: '800' },
  entrySecondary: { color: '#64748b' },
  emptyEntryCard: { borderRadius: 18, padding: 14, backgroundColor: '#fbfcfe', borderWidth: 1, borderColor: '#e5edf6' },
  emptyEntryText: { color: '#7c8795', lineHeight: 18 },
  emptyListText: { color: '#7c8795', lineHeight: 18 },
  removeButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff1f2' },
  removeButtonText: { color: '#dc2626', fontSize: 16, lineHeight: 18, fontWeight: '800' },
  paymentPanel: { flexDirection: 'row', gap: 10 },
  paymentChip: { flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f3efe4' },
  paymentChipActive: { backgroundColor: '#17212b' },
  paymentChipText: { color: '#4b5563' },
  paymentChipTextActive: { color: '#ffffff' },
  proofCard: { borderRadius: 20, padding: 14, backgroundColor: '#faf8f2', gap: 12, borderWidth: 1, borderColor: '#ece7db' },
  proofHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  subtle: { color: '#64748b', lineHeight: 18 },
  proofButton: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#17212b' },
  proofButtonText: { color: '#ffffff' },
  proofPreview: { width: '100%', height: 190, borderRadius: 16, backgroundColor: '#e5e7eb' },
  blockedPanel: { borderRadius: 18, padding: 14, backgroundColor: '#fff7ed', gap: 10, borderWidth: 1, borderColor: '#fed7aa' },
  blockedTitle: { color: '#9a3412', letterSpacing: 1.1 },
  blockedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  blockedChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: '#ffffff' },
  blockedChipText: { color: '#c2410c' },
  confirmButton: { borderRadius: 20, paddingVertical: 16, alignItems: 'center', backgroundColor: '#0f6b3c' },
  confirmButtonDisabled: { opacity: 0.7 },
  confirmButtonText: { color: '#ffffff', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  ticketCard: { borderRadius: 28, padding: 18, gap: 8, backgroundColor: '#17212b' },
  ticketEyebrow: { color: '#cbd5e1', letterSpacing: 1.5 },
  ticketCode: { color: '#ffffff', fontSize: 28, lineHeight: 32, fontWeight: '800' },
  ticketMeta: { color: '#e5e7eb' },
  ticketActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 6 },
  ticketActionPrimary: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#2563eb' },
  ticketActionPrimaryText: { color: '#fff' },
  ticketActionSecondary: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#dbeafe' },
  ticketActionSecondaryText: { color: '#1d4ed8' },
});

