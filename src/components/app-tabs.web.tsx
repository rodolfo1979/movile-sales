import * as React from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { useAppSession } from '../contexts/app-session';
import { type MobileRoute, useMobileNav } from '../contexts/mobile-nav';

const tabs: Array<{ href: MobileRoute; label: string; short: string; protected?: boolean }> = [
  { href: '/', label: 'Inicio', short: 'IN' },
  { href: '/loteria', label: 'Loteria', short: 'LT', protected: true },
  { href: '/monazos', label: '3 Monazos', short: '3M', protected: true },
  { href: '/tickets', label: 'Tickets', short: 'TK', protected: true },
  { href: '/ganancias', label: 'Ganancias', short: 'GN', protected: true },
];

export default function AppTabs() {
  const { pathname, replace } = useMobileNav();
  const { authUser } = useAppSession();
  const visibleTabs = React.useMemo(
    () => tabs.filter((tab) => tab.href !== '/ganancias' || authUser?.salesCommissionEnabled),
    [authUser?.salesCommissionEnabled],
  );

  function handleTabPress(tab: (typeof tabs)[number]) {
    if (tab.protected && !authUser) {
      Alert.alert('Acceso vendedor', 'Inicia sesion en Inicio para usar esta seccion.');
      replace('/');
      return;
    }
    replace(tab.href);
  }

  return (
    <ThemedView style={styles.shell}>
      {visibleTabs.map((tab) => {
        const active = pathname === tab.href;
        const locked = tab.protected && !authUser;
        return (
          <Pressable key={String(tab.href)} onPress={() => handleTabPress(tab)} style={[styles.tab, active && styles.tabActive, locked && styles.tabLocked]}>
            <View style={[styles.iconWrap, active && styles.iconWrapActive, locked && styles.iconWrapLocked]}>
              <ThemedText type="small" style={active ? styles.iconTextActive : locked ? styles.iconTextLocked : styles.iconText}>{tab.short}</ThemedText>
            </View>
            <ThemedText type="small" style={active ? styles.labelActive : locked ? styles.labelLocked : styles.label}>{tab.label}</ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 10,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dbe7f5',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 18,
  },
  tabActive: {
    backgroundColor: '#eff6ff',
  },
  tabLocked: {
    opacity: 0.65,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  iconWrapActive: {
    backgroundColor: '#2563eb',
  },
  iconWrapLocked: {
    backgroundColor: '#e2e8f0',
  },
  iconText: {
    color: '#475569',
    letterSpacing: 0.8,
  },
  iconTextActive: {
    color: '#ffffff',
    letterSpacing: 0.8,
  },
  iconTextLocked: {
    color: '#94a3b8',
    letterSpacing: 0.8,
  },
  label: {
    color: '#64748b',
  },
  labelActive: {
    color: '#1e3a8a',
  },
  labelLocked: {
    color: '#94a3b8',
  },
});
