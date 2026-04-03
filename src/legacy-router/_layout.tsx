import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Slot, usePathname, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View, useColorScheme } from 'react-native';

import { AppSessionProvider, useAppSession } from '@/contexts/app-session';
import { ThemedText } from '@/components/themed-text';

function AppShell() {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, authUser } = useAppSession();
  const requiresAuth = pathname !== '/';

  useEffect(() => {
    if (!ready) return;
    if (!authUser && requiresAuth) {
      router.replace('/');
    }
  }, [authUser, ready, requiresAuth, router]);

  if (!ready) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#2563eb" />
        <ThemedText style={styles.guardCopy}>Preparando app movil...</ThemedText>
      </View>
    );
  }

  const blocked = !authUser && requiresAuth;

  if (blocked) {
    return (
      <View style={styles.guardCard}>
        <ActivityIndicator color="#2563eb" />
        <ThemedText type="subtitle" style={styles.guardTitle}>Acceso restringido</ThemedText>
        <ThemedText style={styles.guardCopy}>Inicia sesion en Inicio para usar la app movil.</ThemedText>
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppSessionProvider>
        <View style={styles.appFrame}>
          <AppShell />
        </View>
      </AppSessionProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  appFrame: {
    flex: 1,
    backgroundColor: '#dff0fb',
  },
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  guardCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  guardTitle: {
    color: '#0f172a',
  },
  guardCopy: {
    textAlign: 'center',
    color: '#475569',
  },
});
