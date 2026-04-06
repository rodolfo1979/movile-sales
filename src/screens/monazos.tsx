import * as React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import {
  MonazosGame,
  createMonazosTicketMobile,
  fetchMonazosGames,
  getDrawClosingLabel,
  normalizeMonazosDigits,
  todayTicketDate,
  uploadMonazosProof,
} from '../services/api';
import { useAppSession } from '../contexts/app-session';
import { useMobileNav } from '../contexts/mobile-nav';
import BrandHeader from '../components/brand-header';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { attemptAutoPrint } from '../services/printer';
import { printTicketReceipt, shareTicketReceipt, type TicketReceipt } from '../utils/ticket-receipt';

const modes = [
  { key: 'orden', label: 'Orden' },
  { key: 'desorden', label: 'Desorden' },
  { key: 'gallo_tapado', label: 'Gallo tapado' },
] as const;
const quickAmounts = [50, 100, 500, 1000, 2000, 5000];
const keypad = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '+', '<'];
const paymentMethods = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'sinpe', label: 'Sinpe movil' },
] as const;

type DraftPlay = {
  id: string;
  mode: (typeof modes)[number]['key'];
  digits: string;
  amount: number;
};

export default function MonazosScreen() {
  const { tenantSlug, authUser, accessToken, addRecentSale, printerConfig } = useAppSession();
  const { consumeMonazosSelection } = useMobileNav();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState('');
  const [success, setSuccess] = React.useState('');
  const [games, setGames] = React.useState<MonazosGame[]>([]);
  const [selectedGameId, setSelectedGameId] = React.useState('');
  const [selectedDrawId, setSelectedDrawId] = React.useState('');
  const [customerName, setCustomerName] = React.useState('');
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [mode, setMode] = React.useState<(typeof modes)[number]['key']>('orden');
  const [digits, setDigits] = React.useState('');
  const [amount, setAmount] = React.useState('500');
  const [plays, setPlays] = React.useState<DraftPlay[]>([]);
  const [paymentMethod, setPaymentMethod] = React.useState<'efectivo' | 'sinpe'>('efectivo');
  const [selectedProof, setSelectedProof] = React.useState<ImagePicker.ImagePickerAsset | null>(null);
  const [lastTicket, setLastTicket] = React.useState<TicketReceipt | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError('');
        const data = await fetchMonazosGames(tenantSlug);
        if (cancelled) return;
        setGames(data);
        const preferredGameId = consumeMonazosSelection();
        const preferredGame = data.find((item) => item.id === preferredGameId) ?? data[0];
        if (preferredGame) {
          setSelectedGameId(preferredGame.id);
          setSelectedDrawId(preferredGame.draws[0]?.id ?? '');
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudieron cargar los juegos de 3 Monazos.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, consumeMonazosSelection]);

  const selectedGame = React.useMemo(() => games.find((item) => item.id === selectedGameId) ?? null, [games, selectedGameId]);
  const selectedDraw = React.useMemo(() => selectedGame?.draws.find((item) => item.id === selectedDrawId) ?? null, [selectedGame, selectedDrawId]);
  const normalizedDigits = normalizeMonazosDigits(digits);
  const totalAmount = React.useMemo(() => plays.reduce((sum, item) => sum + item.amount, 0), [plays]);
  const feedbackTone = error ? 'error' : success ? 'success' : null;
  const feedbackMessage = error || success;

  function clearFeedback() {
    if (error) setError('');
    if (success) setSuccess('');
  }

  function chooseGame(game: MonazosGame) {
    setSelectedGameId(game.id);
    setSelectedDrawId(game.draws[0]?.id ?? '');
    setPlays([]);
    setDigits('');
    clearFeedback();
  }

  function resetSaleForm() {
    setCustomerName('');
    setCustomerPhone('');
    setDigits('');
    setMode('orden');
    setAmount('500');
    setPlays([]);
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

  function pressKey(key: string) {
    if (mode === 'gallo_tapado') {
      if (key === '+') {
        void addPlay();
      }
      return;
    }
    if (key === '<') {
      clearFeedback();
      setDigits((current) => current.slice(0, -1));
      return;
    }
    if (key === '+') {
      void addPlay();
      return;
    }
    clearFeedback();
    setDigits((current) => (current + key).replace(/\D/g, '').slice(0, 3));
  }

  function removePlay(playId: string) {
    setPlays((current) => current.filter((item) => item.id !== playId));
  }

  async function pickProof() {
    const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.8 });
    if (!result.canceled) {
      setSelectedProof(result.assets[0] ?? null);
      clearFeedback();
    }
  }

  async function addPlay() {
    if (!selectedGame || !selectedDraw) {
      setError('Escoge un juego y un sorteo disponibles.');
      return;
    }
    const entryAmount = Number(amount || 0);
    if (entryAmount <= 0) {
      setError('El monto debe ser mayor que cero.');
      return;
    }
    if (mode !== 'gallo_tapado' && normalizedDigits.length !== 3) {
      setError('Escribe 3 digitos para la jugada.');
      return;
    }
    if (mode !== 'gallo_tapado' && plays.some((item) => item.mode === mode && item.digits === normalizedDigits)) {
      setError('Esa jugada ya esta agregada.');
      return;
    }

    setPlays((current) => [
      ...current,
      {
        id: Date.now().toString() + Math.random().toString(16).slice(2),
        mode,
        digits: mode === 'gallo_tapado' ? 'AUTO' : normalizedDigits,
        amount: entryAmount,
      },
    ]);
    setDigits('');
    setAmount('500');
    clearFeedback();
  }

  async function handleSell() {
    if (!authUser || !accessToken) {
      setError('Inicia sesion como vendedor antes de generar tickets.');
      return;
    }
    if (!selectedGame || !selectedDraw) {
      setError('Escoge un juego y un sorteo disponibles.');
      return;
    }
    if (!plays.length) {
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
      setError('');
      setSuccess('');
      const uploadedProof = paymentMethod === 'sinpe' && selectedProof
        ? await uploadMonazosProof({ uri: selectedProof.uri, fileName: selectedProof.fileName, mimeType: selectedProof.mimeType })
        : null;
      const drawDate = todayTicketDate(selectedDraw.drawTime);
      const result = await createMonazosTicketMobile({
        customerName: customerName.trim() || '',
        customerPhone: customerPhone.replace(/\D/g, '') || '',
        gameId: selectedGame.id,
        drawId: selectedDraw.id,
        drawDate,
        paymentMethod,
        paymentProofUrl: uploadedProof?.fileUrl,
        plays: plays.map((play) => ({
          mode: play.mode,
          digits: play.mode === 'gallo_tapado' ? undefined : play.digits,
          amount: play.amount,
        })),
      }, accessToken);
      const receipt: TicketReceipt = {
        title: 'Ticket 3 Monazos',
        ticketCode: result.ticketCode,
        customerName: customerName.trim() || 'Cliente general',
        customerPhone: customerPhone.replace(/\D/g, '') || '',
        gameLabel: selectedGame.name,
        drawName: selectedDraw.name,
        drawTime: selectedDraw.drawTime,
        drawDate,
        paymentMethod,
        totalAmount: 'CRC ' + result.totalAmount,
        status: result.status === 'validated' ? 'validado' : 'pendiente de validacion',
        proofName: uploadedProof?.originalName,
        entries: plays.map((play, index) => ({
          label: modes.find((item) => item.key === play.mode)?.label || 'Jugada',
          amount: 'CRC ' + play.amount,
          detail: play.mode === 'gallo_tapado' ? (result.plays?.[index]?.digits || 'AUTO') : play.digits,
        })),
      };
      setLastTicket(receipt);
      await attemptAutoPrint(receipt, printerConfig);
      await addRecentSale({
        ticketCode: result.ticketCode,
        gameLabel: selectedGame.name,
        drawLabel: selectedDraw.name + ' | ' + selectedDraw.drawTime,
        totalAmount: 'CRC ' + result.totalAmount,
        status: receipt.status,
        customerName: customerName.trim() || 'Cliente general',
        createdAt: new Date().toLocaleString('es-CR'),
        sellerEmail: authUser.email,
      });
      setSuccess('Venta registrada correctamente.');
      setPlays([]);
      setDigits('');
      setAmount('500');
      setPaymentMethod('efectivo');
      setSelectedProof(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el ticket de 3 Monazos.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.heroCard}>
          <BrandHeader
            section="3 MONAZOS"
            title="Venta rapida"
            description={selectedGame?.name || tenantSlug}
            note={selectedDraw ? `${selectedDraw.name} | ${selectedDraw.drawTime}` : 'Selecciona sorteo'}
            sectionColor="#6d28d9"
            titleColor="#1f2937"
            bodyColor="#6b7280"
          />
          <View style={styles.heroMetaRow}>
            {authUser ? <ThemedText style={styles.operatorHint}>Vendedor {authUser.email}</ThemedText> : <ThemedText style={styles.operatorWarning}>Inicia sesion en Inicio para vender</ThemedText>}
            {selectedDraw ? <ThemedText style={styles.heroMetaText}>{getDrawClosingLabel(selectedDraw.drawTime, selectedDraw.cutoffMinutes)}</ThemedText> : null}
          </View>
        </ThemedView>

        {loading ? <ActivityIndicator size="large" color="#6d28d9" /> : null}
        {feedbackTone && feedbackMessage ? (
          <ThemedView style={[styles.feedbackPill, feedbackTone === 'error' ? styles.feedbackPillError : styles.feedbackPillSuccess]}>
            <ThemedText style={feedbackTone === 'error' ? styles.feedbackPillErrorText : styles.feedbackPillSuccessText}>{feedbackMessage}</ThemedText>
          </ThemedView>
        ) : null}

        {!loading && !error && games.length === 0 ? (
          <ThemedView style={styles.warningCard}>
            <ThemedText style={styles.warningTitle}>No hay juegos abiertos</ThemedText>
            <ThemedText style={styles.warningText}>Los sorteos de 3 Monazos ya cerraron por horario o no hay juegos activos disponibles en este momento.</ThemedText>
          </ThemedView>
        ) : null}

        <ThemedView style={styles.surfaceCard}>
          <ThemedText style={styles.sectionTitle}>Juego y sorteo</ThemedText>
          <View style={styles.chipWrap}>
            {games.map((game) => (
              <Pressable key={game.id} onPress={() => chooseGame(game)} style={[styles.selectorChip, selectedGameId === game.id && styles.selectorChipActive]}>
                <ThemedText style={selectedGameId === game.id ? styles.selectorChipTextActive : styles.selectorChipText}>{game.name}</ThemedText>
              </Pressable>
            ))}
          </View>

          {selectedGame ? (
            <View style={styles.drawList}>
              {selectedGame.draws.map((draw) => (
                <Pressable key={draw.id} onPress={() => { clearFeedback(); setSelectedDrawId(draw.id); }} style={[styles.drawRow, selectedDrawId === draw.id && styles.drawRowActive]}>
                  <ThemedText style={styles.drawTitle}>{draw.name}</ThemedText>
                  <ThemedText style={styles.drawMeta}>{draw.drawTime}</ThemedText>
                  <ThemedText style={styles.drawHint}>{getDrawClosingLabel(draw.drawTime, draw.cutoffMinutes)}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ThemedView>

        {selectedGame && selectedDraw ? (
          <ThemedView style={styles.cashierCard}>
            <View style={styles.brandBar}>
              <ThemedText style={styles.brandBarText}>{selectedGame.name}</ThemedText>
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

            <View style={styles.modeRow}>
              {modes.map((item) => (
                <Pressable key={item.key} style={[styles.modeChip, mode === item.key && styles.modeChipActive]} onPress={() => { clearFeedback(); setMode(item.key); }}>
                  <ThemedText style={mode === item.key ? styles.modeChipTextActive : styles.modeChipText}>{item.label}</ThemedText>
                </Pressable>
              ))}
            </View>

            <View style={styles.fieldBlock}>
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

            <View style={styles.fieldBlock}>
              <ThemedText style={styles.fieldLabel}>{mode === 'gallo_tapado' ? 'Numero' : 'Digitos'}</ThemedText>
              <TextInput style={styles.largeInput} value={mode === 'gallo_tapado' ? 'AUTO' : normalizedDigits} editable={false} placeholder="000" placeholderTextColor="#cbd5e1" />
            </View>

            <View style={styles.quickAmountRow}>
              {quickAmounts.map((item) => (
                <Pressable key={item} style={[styles.quickAmountChip, amount === String(item) && styles.quickAmountChipActive]} onPress={() => { clearFeedback(); setAmount(String(item)); }}>
                  <ThemedText style={amount === String(item) ? styles.quickAmountChipTextActive : styles.quickAmountChipText}>
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
              <ThemedText style={styles.summaryHint}>{plays.length} jugada(s)</ThemedText>
            </View>

            <View style={styles.entryList}>
              {plays.length ? plays.map((play) => (
                <View key={play.id} style={styles.entryRow}>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.entryTitle}>{modes.find((item) => item.key === play.mode)?.label}</ThemedText>
                    <ThemedText style={styles.entryMeta}>CRC {play.amount}  |  {play.mode === 'gallo_tapado' ? 'AUTO' : play.digits}</ThemedText>
                  </View>
                  <Pressable onPress={() => removePlay(play.id)} style={styles.removeButton}>
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
                  <ThemedText style={paymentMethod === item.key ? styles.paymentChipTextActive : styles.paymentChipText}>{item.label}</ThemedText>
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
                    <ThemedText style={styles.proofButtonText}>{selectedProof ? 'Cambiar' : 'Subir'}</ThemedText>
                  </Pressable>
                </View>
                {selectedProof ? <Image source={{ uri: selectedProof.uri }} style={styles.proofPreview} /> : null}
              </ThemedView>
            ) : null}

            <Pressable style={[styles.confirmButton, saving && styles.confirmButtonDisabled]} onPress={() => void handleSell()} disabled={saving}>
              {saving ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.confirmButtonText}>Confirmar venta</ThemedText>}
            </Pressable>
          </ThemedView>
        ) : null}

        {lastTicket ? (
          <ThemedView style={styles.ticketCard}>
            <ThemedText style={styles.ticketEyebrow}>ULTIMO TICKET</ThemedText>
            <ThemedText style={styles.ticketCode}>{lastTicket.ticketCode}</ThemedText>
            <ThemedText style={styles.ticketMeta}>Total {lastTicket.totalAmount}</ThemedText>
            <ThemedText style={styles.ticketMeta}>Estado {lastTicket.status}</ThemedText>
            <View style={styles.ticketActions}>
              <Pressable style={styles.ticketActionPrimary} onPress={() => void handleShareCurrentTicket()}>
                <ThemedText style={styles.ticketActionPrimaryText}>Compartir</ThemedText>
              </Pressable>
              <Pressable style={styles.ticketActionSecondary} onPress={() => void printTicketReceipt(lastTicket)}>
                <ThemedText style={styles.ticketActionSecondaryText}>Imprimir</ThemedText>
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
  heroCard: { borderRadius: 30, padding: 18, gap: 12, backgroundColor: '#fffaf2', borderWidth: 1, borderColor: '#f2e3cf' },
  heroMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  heroMetaText: { color: '#6d28d9', fontWeight: '700' },
  operatorHint: { color: '#4b5563', fontSize: 13, lineHeight: 18 },
  operatorWarning: { color: '#b91c1c', fontSize: 13, lineHeight: 18, fontWeight: '700' },
  subtle: { color: '#64748b', lineHeight: 18 },
  feedbackPill: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  feedbackPillError: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' },
  feedbackPillSuccess: { backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0' },
  feedbackPillErrorText: { color: '#be123c' },
  feedbackPillSuccessText: { color: '#166534' },
  warningCard: { borderRadius: 18, padding: 14, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', gap: 6 },
  warningTitle: { color: '#c2410c', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  warningText: { color: '#9a3412', lineHeight: 18 },
  surfaceCard: { borderRadius: 26, padding: 16, gap: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7edf4' },
  sectionTitle: { color: '#17212b', fontSize: 22, lineHeight: 26, fontWeight: '800' },
  sectionSubheading: { color: '#17212b', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectorChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f3efe4' },
  selectorChipActive: { backgroundColor: '#6d28d9' },
  selectorChipText: { color: '#59616d' },
  selectorChipTextActive: { color: '#ffffff' },
  drawList: { gap: 10 },
  drawRow: { borderRadius: 18, padding: 14, gap: 4, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0' },
  drawRowActive: { backgroundColor: '#f6f0ff', borderColor: '#d8b4fe' },
  drawTitle: { color: '#17212b', fontSize: 17, lineHeight: 21, fontWeight: '800' },
  drawMeta: { color: '#475569' },
  drawHint: { color: '#6d28d9' },
  cashierCard: { borderRadius: 28, padding: 16, gap: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e7edf4' },
  brandBar: { borderRadius: 22, padding: 16, gap: 4, backgroundColor: '#6d28d9' },
  brandBarText: { color: '#ffffff', fontSize: 24, lineHeight: 28, fontWeight: '800' },
  brandBarMeta: { color: '#f3e8ff' },
  inlineMetaRow: { flexDirection: 'row', gap: 10 },
  metaInput: { minHeight: 52, borderRadius: 18, paddingHorizontal: 15, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#d9e5f2', color: '#17212b', fontSize: 15 },
  metaInputHalf: { flex: 1 },
  modeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  modeChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#f3efe4' },
  modeChipActive: { backgroundColor: '#6d28d9' },
  modeChipText: { color: '#4b5563' },
  modeChipTextActive: { color: '#ffffff' },
  fieldBlock: { gap: 8 },
  fieldLabel: { color: '#7b8794' },
  largeInput: { minHeight: 60, borderRadius: 18, paddingHorizontal: 16, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#d7dce3', color: '#17212b', fontSize: 26, fontWeight: '800' },
  quickAmountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickAmountChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff1f2' },
  quickAmountChipActive: { backgroundColor: '#dc2626' },
  quickAmountChipText: { color: '#b91c1c' },
  quickAmountChipTextActive: { color: '#ffffff' },
  keypadGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  keypadButton: { width: '31%', minWidth: 86, borderRadius: 18, paddingVertical: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0f3f7' },
  keypadButtonAccent: { backgroundColor: '#ede9fe' },
  keypadButtonNeutral: { backgroundColor: '#e7e5df' },
  keypadText: { color: '#17212b', fontSize: 24, lineHeight: 28, fontWeight: '800' },
  keypadTextAccent: { color: '#6d28d9', fontSize: 24, lineHeight: 28, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  totalText: { color: '#17212b', fontSize: 20, lineHeight: 24, fontWeight: '800' },
  summaryHint: { color: '#6b7280' },
  entryList: { gap: 8, minHeight: 24 },
  emptyListText: { color: '#7c8795', lineHeight: 18 },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, padding: 12, backgroundColor: '#fbfdff', borderWidth: 1, borderColor: '#e5edf6' },
  entryTitle: { color: '#17212b', fontSize: 19, lineHeight: 22, fontWeight: '800' },
  entryMeta: { color: '#64748b' },
  removeButton: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff1f2' },
  removeButtonText: { color: '#dc2626', fontSize: 16, lineHeight: 18, fontWeight: '800' },
  paymentPanel: { flexDirection: 'row', gap: 10 },
  paymentChip: { flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: '#f3efe4' },
  paymentChipActive: { backgroundColor: '#17212b' },
  paymentChipText: { color: '#4b5563' },
  paymentChipTextActive: { color: '#ffffff' },
  proofCard: { borderRadius: 20, padding: 14, backgroundColor: '#faf8f2', gap: 12, borderWidth: 1, borderColor: '#ece7db' },
  proofHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  proofButton: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#17212b' },
  proofButtonText: { color: '#ffffff' },
  proofPreview: { width: '100%', height: 190, borderRadius: 16, backgroundColor: '#e5e7eb' },
  confirmButton: { borderRadius: 20, paddingVertical: 16, alignItems: 'center', backgroundColor: '#6d28d9' },
  confirmButtonDisabled: { opacity: 0.7 },
  confirmButtonText: { color: '#ffffff', fontSize: 18, lineHeight: 22, fontWeight: '800' },
  ticketCard: { borderRadius: 28, padding: 18, gap: 8, backgroundColor: '#17212b' },
  ticketEyebrow: { color: '#cbd5e1', letterSpacing: 1.5, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  ticketCode: { color: '#ffffff', fontSize: 28, lineHeight: 32, fontWeight: '800' },
  ticketMeta: { color: '#e5e7eb' },
  ticketActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 6 },
  ticketActionPrimary: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#2563eb' },
  ticketActionPrimaryText: { color: '#fff', fontWeight: '800' },
  ticketActionSecondary: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ede9fe' },
  ticketActionSecondaryText: { color: '#6d28d9', fontWeight: '800' },
});

