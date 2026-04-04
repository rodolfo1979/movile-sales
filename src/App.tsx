import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import * as React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import HomeScreen from './screens/home';
import LoteriaScreen from './screens/loteria';
import MonazosScreen from './screens/monazos';
import TicketsScreen from './screens/tickets';
import GananciasScreen from './screens/ganancias';
import PrinterScreen from './screens/printer';
import AppTabs from './components/app-tabs';
import { AppSessionProvider, useAppSession } from './contexts/app-session';
import { MobileNavProvider, useMobileNav } from './contexts/mobile-nav';

function ActiveScreen() {
  const { pathname, replace } = useMobileNav();
  const { authUser } = useAppSession();
  const canViewEarnings = Boolean(authUser?.salesCommissionEnabled);

  const protectedRoute = pathname !== '/' && pathname !== '/printer';
  if (!authUser && protectedRoute) {
    replace('/');
    return <HomeScreen />;
  }

  if (pathname === '/ganancias' && !canViewEarnings) {
    replace('/');
    return <HomeScreen />;
  }

  switch (pathname) {
    case '/loteria':
      return <LoteriaScreen />;
    case '/monazos':
      return <MonazosScreen />;
    case '/tickets':
      return <TicketsScreen />;
    case '/ganancias':
      return <GananciasScreen />;
    case '/printer':
      return <PrinterScreen />;
    case '/':
    default:
      return <HomeScreen />;
  }
}

function AppShell() {
  return (
    <View style={styles.frame}>
      <View style={styles.content}>
        <ActiveScreen />
      </View>
      <AppTabs />
    </View>
  );
}

export default function App() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppSessionProvider>
        <MobileNavProvider>
          <AppShell />
        </MobileNavProvider>
      </AppSessionProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    backgroundColor: '#f4f1ea',
  },
  content: {
    flex: 1,
  },
});

