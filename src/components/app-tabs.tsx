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
  { href: '/premios', label: 'Premios', short: 'PR', protected: true },
  { href: '/mensajes', label: 'Artemis', short: 'AR', protected: true },
  { href: '/ganancias', label: 'Ganancias', short: 'GN', protected: true },
];

export default function AppTabs() {
  const { pathname, replace } = useMobileNav();
  const { authUser, unreadInternalMessages } = useAppSession();
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
        const unread = tab.href === '/mensajes' ? unreadInternalMessages : 0;
        return (
          <Pressable key={String(tab.href)} onPress={() => handleTabPress(tab)} style={[styles.tab, active && styles.tabActive, locked && styles.tabLocked]}>
            <View style={styles.iconStack}>
              <View style={[styles.iconWrap, active && styles.iconWrapActive, locked && styles.iconWrapLocked]}>
                <ThemedText type="small" style={active ? styles.iconTextActive : locked ? styles.iconTextLocked : styles.iconText}>{tab.short}</ThemedText>
              </View>
              {unread ? (
                <View style={styles.badge}>
                  <ThemedText type="small" style={styles.badgeText}>{unread > 9 ? '9+' : String(unread)}</ThemedText>
                </View>
              ) : null}
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
    padding: 8,
    borderRadius: 24,
    backgroundColor: '#fffaf1',
    borderWidth: 1,
    borderColor: '#f0dfc3',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 18,
  },
  tabActive: {
    backgroundColor: '#fff3cf',
  },
  tabLocked: {
    opacity: 0.55,
  },
  iconStack: {
    position: 'relative',
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5ead7',
  },
  iconWrapActive: {
    backgroundColor: '#c81e1e',
  },
  iconWrapLocked: {
    backgroundColor: '#ece3d6',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
    borderWidth: 2,
    borderColor: '#fffaf1',
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 10,
    lineHeight: 12,
  },
  iconText: {
    color: '#7c6855',
    letterSpacing: 0.8,
  },
  iconTextActive: {
    color: '#fff7d1',
    letterSpacing: 0.8,
  },
  iconTextLocked: {
    color: '#a39689',
    letterSpacing: 0.8,
  },
  label: {
    color: '#7c6855',
  },
  labelActive: {
    color: '#9a3412',
  },
  labelLocked: {
    color: '#a39689',
  },
});
