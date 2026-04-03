import React from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function ExploreScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Pantalla deshabilitada</ThemedText>
        <ThemedText style={styles.copy}>Esta ruta del template de Expo ya no se usa en la app movil.</ThemedText>
      </ThemedView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#edf4fb' },
  card: { flex: 1, margin: 18, borderRadius: 24, padding: 20, backgroundColor: '#fff', justifyContent: 'center', gap: 10 },
  copy: { color: '#64748b' },
});
