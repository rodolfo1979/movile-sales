import * as React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BrandHeader from '../components/brand-header';
import { ThemedText } from '../components/themed-text';
import { ThemedView } from '../components/themed-view';
import { useAppSession, type PrinterConfig } from '../contexts/app-session';
import { buildPrinterRuntimeNote, getPrinterProfileLabel } from '../services/printer';
import { getDeviceEnvironment, listBondedPrinters, type BondedPrinter } from '../services/native-printer';

function inferPrinterConfig(printer: BondedPrinter, isSunmiDevice: boolean, current: PrinterConfig | null): PrinterConfig {
  const printerLabel = `${printer.name || ''} ${printer.address || ''}`.toLowerCase();
  const isSunmiProfile = isSunmiDevice || printerLabel.includes('sunmi');
  const inferredWidth: PrinterConfig['paperWidth'] =
    printerLabel.includes('80') || current?.paperWidth === '80mm' ? '80mm' : '58mm';

  return {
    profile: isSunmiProfile ? 'sunmi' : 'generic_escpos',
    printerName: (printer.name || 'Impresora Bluetooth').trim(),
    printerAddress: (printer.address || '').trim(),
    paperWidth: inferredWidth,
    autoPrint: current?.autoPrint ?? true,
  };
}

export default function PrinterScreen() {
  const { printerConfig, savePrinterConfig, clearPrinterConfig } = useAppSession();
  const [bondedPrinters, setBondedPrinters] = React.useState<BondedPrinter[]>([]);
  const [environmentLabel, setEnvironmentLabel] = React.useState('');
  const [isSunmiDevice, setIsSunmiDevice] = React.useState(false);
  const [loadingPrinters, setLoadingPrinters] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function loadEnvironment() {
      const environment = await getDeviceEnvironment();
      if (cancelled) return;
      setIsSunmiDevice(environment.isSunmi);
      setEnvironmentLabel(environment.brand + ' ' + environment.model + (environment.isSunmi ? ' · SUNMI detectado' : ''));
    }

    void loadEnvironment();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLoadBondedPrinters() {
    try {
      setLoadingPrinters(true);
      const printers = await listBondedPrinters();
      setBondedPrinters(printers);
      if (!printers.length) {
        Alert.alert('Sin impresoras', 'Primero empareja la impresora en Bluetooth del telefono y luego vuelve a tocar Buscar.');
      }
    } catch (error) {
      Alert.alert('No se pudieron leer impresoras', error instanceof Error ? error.message : 'Error al consultar Bluetooth.');
    } finally {
      setLoadingPrinters(false);
    }
  }

  async function handleSelectPrinter(printer: BondedPrinter) {
    const nextConfig = inferPrinterConfig(printer, isSunmiDevice, printerConfig);
    await savePrinterConfig(nextConfig);
    Alert.alert('Impresora lista', `${nextConfig.printerName} quedo guardada para imprimir automaticamente.`);
  }

  async function handleDisableAutoPrint() {
    if (!printerConfig) return;
    await savePrinterConfig({ ...printerConfig, autoPrint: false });
    Alert.alert('Impresion automatica desactivada', 'La impresora sigue guardada, pero ya no imprimira sola al vender.');
  }

  async function handleEnableAutoPrint() {
    if (!printerConfig) return;
    await savePrinterConfig({ ...printerConfig, autoPrint: true });
    Alert.alert('Impresion automatica activada', 'Los siguientes tickets intentaran imprimirse automaticamente.');
  }

  async function handleClear() {
    await clearPrinterConfig();
    Alert.alert('Impresora eliminada', 'Se borro la impresora guardada del turno.');
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView style={styles.headerCard}>
          <BrandHeader
            section="IMPRESORA"
            title="Impresora del turno"
            description="ONE"
            note="El vendedor solo debe buscar su impresora, tocarla y listo."
            sectionColor="#B71C1C"
            titleColor="#0f172a"
            bodyColor="#6b7280"
          />
          {environmentLabel ? <ThemedText style={styles.helperText}>{environmentLabel}</ThemedText> : null}
        </ThemedView>

        <ThemedView style={styles.surfaceCard}>
          <ThemedText type="subtitle">1. Busca las impresoras del telefono</ThemedText>
          <ThemedText style={styles.helperText}>Si no aparece ninguna, primero emparejala en Bluetooth de Android.</ThemedText>
          <Pressable style={styles.primaryButton} onPress={() => void handleLoadBondedPrinters()}>
            <ThemedText type="small" style={styles.primaryButtonText}>{loadingPrinters ? 'Buscando...' : 'Buscar impresoras'}</ThemedText>
          </Pressable>
        </ThemedView>

        <ThemedView style={styles.surfaceCard}>
          <ThemedText type="subtitle">2. Toca la impresora que usaras</ThemedText>
          {bondedPrinters.length ? (
            <View style={styles.printerList}>
              {bondedPrinters.map((printer) => {
                const preview = inferPrinterConfig(printer, isSunmiDevice, printerConfig);
                const isSelected =
                  printerConfig?.printerAddress?.trim() &&
                  preview.printerAddress &&
                  printerConfig.printerAddress.trim().toLowerCase() === preview.printerAddress.toLowerCase();

                return (
                  <Pressable
                    key={printer.address || printer.name}
                    style={[styles.printerCard, isSelected && styles.printerCardActive]}
                    onPress={() => void handleSelectPrinter(printer)}
                  >
                    <View style={styles.printerCardTop}>
                      <View style={{ flex: 1 }}>
                        <ThemedText type="subtitle" style={styles.printerName}>{preview.printerName}</ThemedText>
                        <ThemedText style={styles.printerMeta}>{getPrinterProfileLabel(preview.profile)} · {preview.paperWidth}</ThemedText>
                        <ThemedText style={styles.printerMeta}>{preview.printerAddress || 'Sin direccion visible'}</ThemedText>
                      </View>
                      <View style={[styles.statusDot, isSelected && styles.statusDotActive]} />
                    </View>
                    <ThemedText style={styles.tapHint}>{isSelected ? 'Impresora actual' : 'Tocar para guardar e imprimir automatico'}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <ThemedText style={styles.helperText}>Todavia no hay impresoras cargadas.</ThemedText>
          )}
        </ThemedView>

        <ThemedView style={styles.surfaceCard}>
          <ThemedText type="subtitle">Impresora guardada</ThemedText>
          {printerConfig ? (
            <View style={styles.savedCard}>
              <ThemedText type="subtitle" style={styles.savedTitle}>{printerConfig.printerName}</ThemedText>
              <ThemedText style={styles.savedText}>{buildPrinterRuntimeNote(printerConfig)}</ThemedText>
              <ThemedText style={styles.savedText}>{printerConfig.autoPrint ? 'Impresion automatica activada' : 'Impresion automatica desactivada'}</ThemedText>
              <View style={styles.buttonRow}>
                {printerConfig.autoPrint ? (
                  <Pressable style={styles.softButton} onPress={() => void handleDisableAutoPrint()}>
                    <ThemedText type="small" style={styles.softButtonText}>Quitar auto print</ThemedText>
                  </Pressable>
                ) : (
                  <Pressable style={styles.softButton} onPress={() => void handleEnableAutoPrint()}>
                    <ThemedText type="small" style={styles.softButtonText}>Activar auto print</ThemedText>
                  </Pressable>
                )}
                <Pressable style={styles.secondaryButton} onPress={() => void handleClear()}>
                  <ThemedText type="small" style={styles.secondaryButtonText}>Eliminar</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : (
            <ThemedText style={styles.helperText}>No hay impresora guardada para este turno.</ThemedText>
          )}
        </ThemedView>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f1ea' },
  content: { padding: 16, gap: 14, paddingBottom: 28 },
  headerCard: { borderRadius: 28, padding: 18, backgroundColor: '#fff', gap: 10 },
  surfaceCard: { borderRadius: 24, padding: 18, gap: 12, backgroundColor: '#fff' },
  helperText: { color: '#8b7d70', lineHeight: 20 },
  printerList: { gap: 10 },
  printerCard: {
    borderRadius: 18,
    padding: 14,
    gap: 8,
    backgroundColor: '#faf6ee',
    borderWidth: 1,
    borderColor: '#efe2cd',
  },
  printerCardActive: {
    backgroundColor: '#fff3cf',
    borderColor: '#f3c86b',
  },
  printerCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  printerName: { color: '#22160d' },
  printerMeta: { color: '#6b7280', lineHeight: 19 },
  tapHint: { color: '#9a3412', fontSize: 13 },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#d6d3d1',
    marginTop: 6,
  },
  statusDotActive: {
    backgroundColor: '#16a34a',
  },
  savedCard: {
    borderRadius: 18,
    padding: 14,
    gap: 8,
    backgroundColor: '#7c2d12',
  },
  savedTitle: { color: '#fff7d1' },
  savedText: { color: '#fed7aa', lineHeight: 20 },
  buttonRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 4 },
  primaryButton: {
    borderRadius: 18,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#c81e1e',
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: '#fff7d1' },
  softButton: {
    flex: 1,
    minWidth: 150,
    borderRadius: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff3cf',
    paddingHorizontal: 16,
  },
  softButtonText: { color: '#9a3412' },
  secondaryButton: {
    flex: 1,
    minWidth: 120,
    borderRadius: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111827',
    paddingHorizontal: 16,
  },
  secondaryButtonText: { color: '#ffffff' },
});
