import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { MonazosGame, createMonazosTicketMobile, fetchMonazosGames, getDrawClosingLabel, normalizeMonazosDigits, todayTicketDate, uploadMonazosProof } from '@/services/api';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { printTicketReceipt, shareTicketReceipt, type TicketReceipt } from '@/utils/ticket-receipt';
import { useAppSession } from '@/contexts/app-session';

const modes = [
  { key: 'orden', label: 'Orden', hint: 'Paga mas si acierta exacto.' },
  { key: 'desorden', label: 'Desorden', hint: 'Los 3 digitos en cualquier orden.' },
  { key: 'gallo_tapado', label: 'Gallo tapado', hint: 'El sistema arma la jugada al azar.' },
] as const;
const amounts = [500, 1000, 2000, 5000, 10000];
const keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '<'];
const paymentMethods = [
  { key: 'efectivo', label: 'Efectivo', note: 'Validacion automatica' },
  { key: 'sinpe', label: 'Sinpe movil', note: 'Sube comprobante' },
] as const;

export default function MonazosScreen() {
  const { tenantSlug, authUser, accessToken, addRecentSale } = useAppSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [games, setGames] = useState<MonazosGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState('');
  const [selectedDrawId, setSelectedDrawId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [mode, setMode] = useState<(typeof modes)[number]['key']>('orden');
  const [digits, setDigits] = useState('');
  const [amount, setAmount] = useState('1000');
  const [paymentMethod, setPaymentMethod] = useState<'efectivo' | 'sinpe'>('efectivo');
  const [selectedProof, setSelectedProof] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [lastTicket, setLastTicket] = useState<TicketReceipt | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError('');
        const data = await fetchMonazosGames(tenantSlug);
        if (cancelled) return;
        setGames(data);
        const firstGame = data[0];
        if (firstGame) {
          setSelectedGameId(firstGame.id);
          setSelectedDrawId(firstGame.draws[0]?.id ?? '');
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
  }, [tenantSlug]);

  const selectedGame = useMemo(() => games.find((item) => item.id === selectedGameId) ?? null, [games, selectedGameId]);
  const selectedDraw = useMemo(() => selectedGame?.draws.find((item) => item.id === selectedDrawId) ?? null, [selectedGame, selectedDrawId]);
  const normalizedDigits = normalizeMonazosDigits(digits);
  const selectedMode = modes.find((item) => item.key === mode) ?? modes[0];

  function chooseGame(game: MonazosGame) {
    setSelectedGameId(game.id);
    setSelectedDrawId(game.draws[0]?.id ?? '');
    setSuccess('');
    setError('');
  }

  function pressKey(key: string) {
    if (mode === 'gallo_tapado') return;
    setDigits((current) => {
      if (key === '<') return current.slice(0, -1);
      return (current + key).replace(/\D/g, '').slice(0, 3);
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
    if (!selectedGame || !selectedDraw) {
      setError('Escoge un juego y un sorteo disponibles.');
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
    if (mode !== 'gallo_tapado' && normalizedDigits.length !== 3) {
      setError('Escribe 3 digitos para la jugada.');
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
      setError('');
      setSuccess('');
      const uploadedProof = paymentMethod === 'sinpe' && selectedProof
        ? await uploadMonazosProof({ uri: selectedProof.uri, fileName: selectedProof.fileName, mimeType: selectedProof.mimeType })
        : null;
      const drawDate = todayTicketDate(selectedDraw.drawTime);
      const result = await createMonazosTicketMobile({
        customerName: customerName.trim(),
        customerPhone: customerPhone.replace(/\D/g, ''),
        gameId: selectedGame.id,
        drawId: selectedDraw.id,
        drawDate,
        paymentMethod,
        paymentProofUrl: uploadedProof?.fileUrl,
        plays: [{ mode, digits: mode === 'gallo_tapado' ? undefined : normalizedDigits, amount: Number(amount) }],
      }, accessToken);
      const receipt: TicketReceipt = {
        title: 'Ticket 3 Monazos',
        ticketCode: result.ticketCode,
        customerName: customerName.trim(),
        customerPhone: customerPhone.replace(/\D/g, ''),
        gameLabel: selectedGame.name,
        drawName: selectedDraw.name,
        drawTime: selectedDraw.drawTime,
        drawDate,
        paymentMethod,
        totalAmount: '¢' + result.totalAmount,
        status: result.status === 'validated' ? 'validado' : 'pendiente de validacion',
        proofName: uploadedProof?.originalName,
        entries: [{
          label: selectedMode.label,
          amount: '¢' + amount,
          detail: mode === 'gallo_tapado' ? 'Jugada al azar' : normalizedDigits,
        }],
      };
      setLastTicket(receipt);
      await addRecentSale({
        ticketCode: result.ticketCode,
        gameLabel: selectedGame.name,
        drawLabel: selectedDraw.name + ' | ' + selectedDraw.drawTime,
        totalAmount: '¢' + result.totalAmount,
        status: receipt.status,
        customerName: customerName.trim(),
        createdAt: new Date().toLocaleString('es-CR'),
        sellerEmail: authUser?.email,
      });
      setSuccess('Ticket ' + result.ticketCode + ' generado correctamente.');
      setDigits('');
      setAmount('1000');
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
          <ThemedText type="small" style={styles.eyebrow}>3 MONAZOS</ThemedText>
          <ThemedText type="title" style={styles.title}>Venta movil</ThemedText>
          <ThemedText style={styles.copy}>Tenant {tenantSlug}. Orden, desorden o gallo tapado con soporte para efectivo o Sinpe movil.</ThemedText>
          {authUser ? <ThemedText style={styles.operatorHint}>Vendedor activo {authUser.email}</ThemedText> : <ThemedText style={styles.operatorWarning}>Inicia sesion en Inicio para vender.</ThemedText>}
        </ThemedView>

        {loading ? <ActivityIndicator size="large" color="#7c3aed" /> : null}
        {error ? <ThemedView style={styles.errorCard}><ThemedText style={styles.errorText}>{error}</ThemedText></ThemedView> : null}
        {success ? <ThemedView style={styles.successCard}><ThemedText style={styles.successText}>{success}</ThemedText></ThemedView> : null}
        {!loading && !error && games.length === 0 ? (
          <ThemedView style={styles.warningCard}>
            <ThemedText type="subtitle" style={styles.warningTitle}>No hay juegos abiertos</ThemedText>
            <ThemedText style={styles.warningText}>Los sorteos de 3 Monazos ya cerraron por horario o no hay juegos activos disponibles en este momento.</ThemedText>
          </ThemedView>
        ) : null}

        <ThemedView style={styles.panel}>
          <ThemedText type="subtitle">Juegos activos</ThemedText>
          <View style={styles.chipWrap}>
            {games.map((game) => (
              <Pressable key={game.id} onPress={() => chooseGame(game)} style={[styles.selectorChip, selectedGameId === game.id && styles.selectorChipActive]}>
                <ThemedText type="small" style={selectedGameId === game.id ? styles.selectorChipTextActive : styles.selectorChipText}>{game.name}</ThemedText>
              </Pressable>
            ))}
          </View>
          {selectedGame ? (
            <View style={styles.drawList}>
              {selectedGame.draws.map((draw) => (
                <Pressable key={draw.id} onPress={() => setSelectedDrawId(draw.id)} style={[styles.drawCard, selectedDrawId === draw.id && styles.drawCardActive]}>
                  <ThemedText type="subtitle">{draw.name} · {draw.drawTime}</ThemedText>
                  <ThemedText style={styles.copy}>Orden x{draw.orderMultiplier} · Desorden x{draw.disorderMultiplier}</ThemedText>
                  <ThemedText style={styles.closeText}>{getDrawClosingLabel(draw.drawTime, draw.cutoffMinutes)}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ThemedView>

        {selectedGame && selectedDraw ? (
          <ThemedView style={styles.operationCard}>
            <View style={styles.operationHeader}>
              <View style={styles.operationTitleWrap}>
                <ThemedText type="small" style={styles.operationEyebrow}>JUEGO SELECCIONADO</ThemedText>
                <ThemedText type="title" style={styles.operationTitle}>{selectedGame.name} · {selectedDraw.name}</ThemedText>
                <ThemedText style={styles.operationSubtitle}>{selectedDraw.drawTime} · Min ¢{selectedDraw.minBetAmount} · Max ¢{selectedDraw.maxBetAmount}</ThemedText>
              </View>
              <ThemedView style={styles.totalCard}>
                <ThemedText type="small" style={styles.totalLabel}>TOTAL</ThemedText>
                <ThemedText type="subtitle" style={styles.totalValue}>¢{amount || '0'}</ThemedText>
              </ThemedView>
            </View>

            <View style={styles.inlineInputs}>
              <TextInput style={[styles.input, styles.flexInput]} value={customerName} onChangeText={setCustomerName} placeholder="Nombre del cliente" placeholderTextColor="#94a3b8" />
              <TextInput style={[styles.input, styles.flexInput]} value={customerPhone} onChangeText={(value) => setCustomerPhone(value.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Telefono" placeholderTextColor="#94a3b8" />
            </View>

            <ThemedView style={styles.modePanel}>
              <ThemedText type="subtitle">Modalidad</ThemedText>
              <View style={styles.modeWrap}>
                {modes.map((item) => (
                  <Pressable key={item.key} style={[styles.modeCard, mode === item.key && styles.modeCardActive]} onPress={() => setMode(item.key)}>
                    <ThemedText type="subtitle" style={mode === item.key ? styles.modeTitleActive : styles.modeTitle}>{item.label}</ThemedText>
                    <ThemedText style={mode === item.key ? styles.modeHintActive : styles.modeHint}>{item.hint}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </ThemedView>

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
                      <ThemedText style={styles.copy}>Se enviara automaticamente al generar el ticket.</ThemedText>
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
                <ThemedText type="small" style={styles.panelLabel}>Numeros</ThemedText>
                <TextInput style={styles.bigInput} value={mode === 'gallo_tapado' ? 'AUTO' : normalizedDigits} editable={false} placeholder="000" placeholderTextColor="#94a3b8" />
                {mode === 'gallo_tapado' ? (
                  <ThemedView style={styles.autoPanel}>
                    <ThemedText style={styles.autoText}>El sistema generara los 3 digitos al crear el ticket.</ThemedText>
                  </ThemedView>
                ) : (
                  <View style={styles.keypad}>
                    {keypad.map((key) => (
                      <Pressable key={key} onPress={() => pressKey(key)} style={[styles.keyButton, key === '<' && styles.keyButtonAccent]}>
                        <ThemedText type="subtitle" style={styles.keyButtonText}>{key === '<' ? 'Borrar' : key}</ThemedText>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.rightColumn}>
                <ThemedText type="small" style={styles.panelLabel}>Monto</ThemedText>
                <TextInput style={styles.amountInput} value={amount} onChangeText={(value) => setAmount(value.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Monto" placeholderTextColor="#94a3b8" />
                <View style={styles.quickAmountGrid}>
                  {amounts.map((item) => (
                    <Pressable key={item} style={[styles.quickAmountButton, amount === String(item) && styles.quickAmountButtonActive]} onPress={() => setAmount(String(item))}>
                      <ThemedText type="small" style={amount === String(item) ? styles.quickAmountTextActive : styles.quickAmountText}>¢{item}</ThemedText>
                    </Pressable>
                  ))}
                </View>
                <ThemedView style={styles.ruleCard}>
                  <ThemedText style={styles.ruleText}>Modo actual: {selectedMode.label}</ThemedText>
                  <ThemedText style={styles.ruleText}>Orden x{selectedDraw.orderMultiplier} · Desorden x{selectedDraw.disorderMultiplier}</ThemedText>
                </ThemedView>
              </View>
            </View>

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
  safeArea: { flex: 1, backgroundColor: '#eef2ff' },
  content: { padding: 18, gap: 16, paddingBottom: 28 },
  heroCard: { borderRadius: 28, padding: 22, gap: 8, backgroundColor: '#fff' },
  eyebrow: { color: '#7c3aed', letterSpacing: 1.8 },
  title: { fontSize: 30, lineHeight: 36 },
  copy: { color: '#64748b', lineHeight: 21 },
  operatorHint: { color: '#ede9fe', lineHeight: 21 },
  operatorWarning: { color: '#fee2e2', lineHeight: 21 },
  closeText: { color: '#6d28d9', lineHeight: 21 },
  errorCard: { borderRadius: 18, padding: 14, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  errorText: { color: '#b91c1c' },
  successCard: { borderRadius: 18, padding: 14, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#86efac' },
  successText: { color: '#166534' },
  warningCard: { borderRadius: 18, padding: 14, backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fdba74', gap: 6 },
  warningTitle: { color: '#c2410c' },
  warningText: { color: '#9a3412', lineHeight: 21 },
  panel: { borderRadius: 24, padding: 18, gap: 12, backgroundColor: '#fff' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  selectorChip: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f5f3ff', borderWidth: 1, borderColor: '#ddd6fe' },
  selectorChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  selectorChipText: { color: '#6d28d9' },
  selectorChipTextActive: { color: '#fff' },
  drawList: { gap: 10 },
  drawCard: { borderRadius: 18, padding: 14, backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#ddd6fe', gap: 4 },
  drawCardActive: { backgroundColor: '#f3e8ff', borderColor: '#c084fc' },
  operationCard: { borderRadius: 28, padding: 18, gap: 16, backgroundColor: '#ffffff' },
  operationHeader: { gap: 14 },
  operationTitleWrap: { gap: 4 },
  operationEyebrow: { color: '#7c3aed', letterSpacing: 1.4 },
  operationTitle: { fontSize: 24, lineHeight: 30 },
  operationSubtitle: { color: '#64748b' },
  totalCard: { borderRadius: 22, padding: 16, backgroundColor: '#ede9fe', alignSelf: 'flex-start', minWidth: 120 },
  totalLabel: { color: '#7c3aed', letterSpacing: 1.2 },
  totalValue: { color: '#0f172a' },
  inlineInputs: { gap: 12 },
  flexInput: { flex: 1 },
  input: { borderRadius: 18, minHeight: 56, paddingHorizontal: 16, backgroundColor: '#f8fbff', borderWidth: 1, borderColor: '#dbeafe', color: '#0f172a' },
  modePanel: { borderRadius: 22, padding: 14, backgroundColor: '#faf5ff', gap: 12 },
  modeWrap: { gap: 10 },
  modeCard: { borderRadius: 18, padding: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e9d5ff', gap: 4 },
  modeCardActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  modeTitle: { color: '#6d28d9' },
  modeTitleActive: { color: '#fff' },
  modeHint: { color: '#7c3aed' },
  modeHintActive: { color: '#ede9fe' },
  paymentPanel: { borderRadius: 22, padding: 14, backgroundColor: '#faf5ff', gap: 12 },
  paymentRow: { gap: 10 },
  paymentChip: { borderRadius: 18, padding: 14, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#ddd6fe', gap: 4 },
  paymentChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  paymentChipText: { color: '#6d28d9' },
  paymentChipTextActive: { color: '#fff' },
  paymentChipNote: { color: '#7c3aed' },
  paymentChipNoteActive: { color: '#ede9fe' },
  proofCard: { borderRadius: 18, padding: 14, backgroundColor: '#ffffff', gap: 12, borderWidth: 1, borderColor: '#e9d5ff' },
  proofHeader: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  proofButton: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#ede9fe' },
  proofButtonText: { color: '#6d28d9' },
  proofPreview: { width: '100%', height: 180, borderRadius: 16, backgroundColor: '#ede9fe' },
  sellGrid: { gap: 16 },
  leftColumn: { gap: 10 },
  rightColumn: { gap: 10 },
  panelLabel: { color: '#64748b', letterSpacing: 1.2 },
  bigInput: { borderRadius: 22, minHeight: 68, paddingHorizontal: 18, backgroundColor: '#f3e8ff', borderWidth: 1, borderColor: '#c4b5fd', color: '#581c87', fontSize: 32, fontWeight: '700' },
  autoPanel: { borderRadius: 16, padding: 14, backgroundColor: '#ede9fe' },
  autoText: { color: '#6d28d9' },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  keyButton: { width: '30%', minWidth: 88, borderRadius: 18, paddingVertical: 16, alignItems: 'center', backgroundColor: '#f5f3ff' },
  keyButtonAccent: { backgroundColor: '#ede9fe' },
  keyButtonText: { color: '#581c87' },
  amountInput: { borderRadius: 18, minHeight: 56, paddingHorizontal: 16, backgroundColor: '#fdf2f8', borderWidth: 1, borderColor: '#f9a8d4', color: '#9d174d' },
  quickAmountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickAmountButton: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fdf2f8' },
  quickAmountButtonActive: { backgroundColor: '#db2777' },
  quickAmountText: { color: '#9d174d' },
  quickAmountTextActive: { color: '#fff' },
  ruleCard: { borderRadius: 18, padding: 14, backgroundColor: '#ede9fe', gap: 6 },
  ruleText: { color: '#6d28d9' },
  sellButton: { borderRadius: 20, paddingVertical: 16, alignItems: 'center', backgroundColor: '#7c3aed' },
  sellButtonDisabled: { opacity: 0.7 },
  sellButtonText: { color: '#fff' },
  ticketCard: { borderRadius: 24, padding: 18, gap: 8, backgroundColor: '#3b0764' },
  ticketEyebrow: { color: '#ddd6fe', letterSpacing: 1.5 },
  ticketCode: { color: '#fff', fontSize: 28, lineHeight: 34 },
  ticketMeta: { color: '#e9d5ff' },
  ticketActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 6 },
  ticketActionPrimary: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#8b5cf6' },
  ticketActionPrimaryText: { color: '#fff' },
  ticketActionSecondary: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#ede9fe' },
  ticketActionSecondaryText: { color: '#6d28d9' },
});




