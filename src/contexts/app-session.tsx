import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as React from 'react';
import { Alert } from 'react-native';

import { DEFAULT_TENANT_SLUG } from '../constants/config';
import { configureDeviceIdentity, fetchInternalMessageThreads, loginAdmin, sendSellerLocationOffline, sendSellerLocationPing, startSellerConnectionSession, type AuthUser, type LoginResponse } from '../services/api';

type RecentSale = {
  ticketCode: string;
  gameLabel: string;
  drawLabel: string;
  totalAmount: string;
  status: string;
  customerName: string;
  createdAt: string;
  sellerEmail?: string;
};

export type PrinterConfig = {
  profile: 'generic_escpos' | 'sunmi';
  printerName: string;
  printerAddress: string;
  paperWidth: '58mm' | '80mm';
  autoPrint: boolean;
};

type AppSessionContextValue = {
  ready: boolean;
  tenantSlug: string;
  tenantLabel: string;
  tenantInitials: string;
  recentSales: RecentSale[];
  authUser: AuthUser | null;
  accessToken: string | null;
  locationEnabled: boolean;
  locationError: string;
  lastLocationAt: string | null;
  printerConfig: PrinterConfig | null;
  unreadInternalMessages: number;
  setTenantSlug: (value: string) => Promise<void>;
  addRecentSale: (sale: RecentSale) => Promise<void>;
  login: (payload: { email: string; password: string; tenantSlug?: string }) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  savePrinterConfig: (config: PrinterConfig) => Promise<void>;
  clearPrinterConfig: () => Promise<void>;
};

const TENANT_KEY = 'mobile-sales:tenant-slug';
const SALES_KEY = 'mobile-sales:recent-sales';
const AUTH_KEY = 'mobile-sales:auth-session';
const LOCATION_KEY = 'mobile-sales:location-enabled';
const PRINTER_KEY = 'mobile-sales:printer-config';
const DEVICE_ID_KEY = 'mobile-sales:device-id';
const DEVICE_LABEL_KEY = 'mobile-sales:device-label';

const AppSessionContext = React.createContext<AppSessionContextValue | null>(null);

function buildTenantLabel(slug: string) {
  if (!slug.trim()) return 'Sin tenant';
  const cleaned = slug.replace(/[-_]+/g, ' ').trim();
  if (/^[0-9]+$/.test(cleaned)) return 'Cliente ' + cleaned;
  return cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildTenantInitials(label: string) {
  const parts = label.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'TN';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('');
}

function generateDeviceId() {
  return 'mob-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function buildDeviceLabel() {
  const brand = Device.brand?.trim();
  const model = Device.modelName?.trim();
  const os = Device.osName?.trim();
  const pieces = [brand, model].filter(Boolean);
  const label = pieces.join(' ');
  return label ? `${label}${os ? ` | ${os}` : ''}` : `Telefono vendedor${os ? ` | ${os}` : ''}`;
}

export function AppSessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(false);
  const [tenantSlug, setTenantSlugState] = React.useState(DEFAULT_TENANT_SLUG);
  const [recentSales, setRecentSales] = React.useState<RecentSale[]>([]);
  const [authUser, setAuthUser] = React.useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = React.useState<string | null>(null);
  const [locationEnabled, setLocationEnabled] = React.useState(false);
  const [locationError, setLocationError] = React.useState('');
  const [lastLocationAt, setLastLocationAt] = React.useState<string | null>(null);
  const [printerConfig, setPrinterConfig] = React.useState<PrinterConfig | null>(null);
  const [unreadInternalMessages, setUnreadInternalMessages] = React.useState(0);
  const locationWatchRef = React.useRef<Location.LocationSubscription | null>(null);
  const deviceIdRef = React.useRef('');
  const deviceLabelRef = React.useRef('');
  const previousUnreadMessagesRef = React.useRef(0);

  React.useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        const [storedTenant, storedSales, storedAuth, storedLocation, storedPrinter, storedDeviceId, storedDeviceLabel] = await Promise.all([
          AsyncStorage.getItem(TENANT_KEY),
          AsyncStorage.getItem(SALES_KEY),
          AsyncStorage.getItem(AUTH_KEY),
          AsyncStorage.getItem(LOCATION_KEY),
          AsyncStorage.getItem(PRINTER_KEY),
          AsyncStorage.getItem(DEVICE_ID_KEY),
          AsyncStorage.getItem(DEVICE_LABEL_KEY),
        ]);
        if (!mounted) return;
        if (storedTenant?.trim()) setTenantSlugState(storedTenant.trim());
        if (storedSales) {
          try {
            const parsed = JSON.parse(storedSales) as RecentSale[];
            setRecentSales(Array.isArray(parsed) ? parsed : []);
          } catch {
            setRecentSales([]);
          }
        }
        if (storedAuth) {
          try {
            const parsed = JSON.parse(storedAuth) as LoginResponse;
            if (parsed?.user && parsed?.accessToken) {
              setAuthUser(parsed.user);
              setAccessToken(parsed.accessToken);
              if (parsed.user.tenant?.slug?.trim()) setTenantSlugState(parsed.user.tenant.slug.trim());
            }
          } catch {
            setAuthUser(null);
            setAccessToken(null);
          }
        }
        if (storedPrinter) {
          try {
            const parsed = JSON.parse(storedPrinter) as PrinterConfig;
            if (parsed?.printerName) setPrinterConfig(parsed);
          } catch {
            setPrinterConfig(null);
          }
        }
        const nextDeviceId = storedDeviceId?.trim() || generateDeviceId();
        const nextDeviceLabel = storedDeviceLabel?.trim() || buildDeviceLabel();
        deviceIdRef.current = nextDeviceId;
        deviceLabelRef.current = nextDeviceLabel;
        configureDeviceIdentity(nextDeviceId, nextDeviceLabel);
        await Promise.all([
          AsyncStorage.setItem(DEVICE_ID_KEY, nextDeviceId),
          AsyncStorage.setItem(DEVICE_LABEL_KEY, nextDeviceLabel),
        ]);
        setLocationEnabled(storedLocation === 'true');
      } finally {
        if (mounted) setReady(true);
      }
    }
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function startTracking() {
      if (!authUser || !accessToken || !locationEnabled) {
        return;
      }

      try {
        setLocationError('');
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted') {
          setLocationError('Activa el permiso de ubicacion para mantener visible tu jornada en el mapa del admin.');
          setLocationEnabled(false);
          await AsyncStorage.setItem(LOCATION_KEY, 'false');
          return;
        }

        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          await sendSellerLocationPing(accessToken, {
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
            accuracy: current.coords.accuracy ?? null,
          });
          setLastLocationAt(new Date().toISOString());
        }

        locationWatchRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 60000,
            distanceInterval: 50,
          },
          (position) => {
            if (cancelled) return;
            void sendSellerLocationPing(accessToken, {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy ?? null,
            }).then(() => {
              if (!cancelled) setLastLocationAt(new Date().toISOString());
            }).catch((error) => {
              if (!cancelled) setLocationError(error instanceof Error ? error.message : 'No se pudo reportar la ubicacion.');
            });
          },
        );
      } catch (error) {
        if (!cancelled) {
          setLocationError(error instanceof Error ? error.message : 'No se pudo activar la ubicacion.');
        }
      }
    }

    void startTracking();

    return () => {
      cancelled = true;
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
        locationWatchRef.current = null;
      }
    };
  }, [authUser?.id, accessToken, locationEnabled]);
  React.useEffect(() => {
    if (!authUser || !accessToken) {
      setUnreadInternalMessages(0);
      previousUnreadMessagesRef.current = 0;
      return;
    }

    const token = accessToken;
    let cancelled = false;

    async function refreshUnread(silent = true) {
      try {
        const threads = await fetchInternalMessageThreads(token);
        if (cancelled) return;
        const nextUnread = threads.reduce((sum, thread) => sum + (thread.unreadCount || 0), 0);
        const previousUnread = previousUnreadMessagesRef.current;
        setUnreadInternalMessages(nextUnread);
        if (!silent && nextUnread > previousUnread) {
          Alert.alert('Artemis', `Tienes ${nextUnread - previousUnread} mensaje(s) nuevo(s).`);
        }
        previousUnreadMessagesRef.current = nextUnread;
      } catch {
        if (!cancelled) {
          setUnreadInternalMessages((current) => current);
        }
      }
    }

    void refreshUnread(true);
    const interval = setInterval(() => {
      void refreshUnread(false);
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authUser?.id, accessToken]);

  async function persistTenantSlug(value: string) {
    const normalized = value.trim() || DEFAULT_TENANT_SLUG;
    setTenantSlugState(normalized);
    await AsyncStorage.setItem(TENANT_KEY, normalized);
  }

  async function addRecentSale(sale: RecentSale) {
    setRecentSales((current) => {
      const next = [sale, ...current.filter((item) => item.ticketCode !== sale.ticketCode)].slice(0, 20);
      void AsyncStorage.setItem(SALES_KEY, JSON.stringify(next));
      return next;
    });
  }

  async function savePrinterConfig(config: PrinterConfig) {
    setPrinterConfig(config);
    await AsyncStorage.setItem(PRINTER_KEY, JSON.stringify(config));
  }

  async function clearPrinterConfig() {
    setPrinterConfig(null);
    await AsyncStorage.removeItem(PRINTER_KEY);
  }

  async function login(payload: { email: string; password: string; tenantSlug?: string }) {
    configureDeviceIdentity(deviceIdRef.current, deviceLabelRef.current);
    const response = await loginAdmin({
      email: payload.email,
      password: payload.password,
      tenantSlug: payload.tenantSlug?.trim() || tenantSlug,
      deviceId: deviceIdRef.current,
      deviceLabel: deviceLabelRef.current,
    });
    const nextTenant = response.user.tenant?.slug?.trim() || payload.tenantSlug?.trim() || tenantSlug;
    setAuthUser(response.user);
    setAccessToken(response.accessToken);
    setTenantSlugState(nextTenant);
    try {
      await startSellerConnectionSession(response.accessToken);
    } catch {
      // Si la bitacora falla, no bloqueamos el acceso del vendedor.
    }

    let nextLocationEnabled = false;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status === 'granted') {
        nextLocationEnabled = true;
        setLocationEnabled(true);
        setLocationError('');
      } else {
        setLocationEnabled(false);
        setLocationError('La ubicacion no se activo porque el permiso fue denegado. Puedes activarla manualmente desde Inicio.');
      }
    } catch (error) {
      setLocationEnabled(false);
      setLocationError(error instanceof Error ? error.message : 'No se pudo preparar la ubicacion al iniciar sesion.');
    }

    await Promise.all([
      AsyncStorage.setItem(AUTH_KEY, JSON.stringify(response)),
      AsyncStorage.setItem(TENANT_KEY, nextTenant),
      AsyncStorage.setItem(LOCATION_KEY, nextLocationEnabled ? 'true' : 'false'),
    ]);
    return response;
  }

  async function logout() {
    const token = accessToken;
    if (locationWatchRef.current) {
      locationWatchRef.current.remove();
      locationWatchRef.current = null;
    }
    if (token) {
      try {
        await sendSellerLocationOffline(token);
      } catch {
        // Si falla el aviso al backend, igual cerramos sesion localmente.
      }
    }
    setLocationEnabled(false);
    setLocationError('');
    setLastLocationAt(null);
    setAuthUser(null);
    setAccessToken(null);
    await Promise.all([
      AsyncStorage.removeItem(AUTH_KEY),
      AsyncStorage.setItem(LOCATION_KEY, 'false'),
    ]);
  }

  const tenantBaseLabel = React.useMemo(() => buildTenantLabel(tenantSlug), [tenantSlug]);
  const tenantLabel = React.useMemo(() => {
    const authTenantName = authUser?.tenant?.name?.trim();
    const authTenantSlug = authUser?.tenant?.slug?.trim();
    if (authTenantName && authTenantSlug === tenantSlug) return authTenantName;
    return tenantBaseLabel;
  }, [authUser?.tenant?.name, authUser?.tenant?.slug, tenantBaseLabel, tenantSlug]);
  const tenantInitials = React.useMemo(() => buildTenantInitials(tenantLabel), [tenantLabel]);

  const value = React.useMemo<AppSessionContextValue>(() => ({
    ready,
    tenantSlug,
    tenantLabel,
    tenantInitials,
    recentSales,
    authUser,
    accessToken,
    locationEnabled,
    locationError,
    lastLocationAt,
    printerConfig,
    unreadInternalMessages,
    setTenantSlug: persistTenantSlug,
    addRecentSale,
    login,
    logout,
    savePrinterConfig,
    clearPrinterConfig,
  }), [ready, tenantSlug, tenantLabel, tenantInitials, recentSales, authUser, accessToken, locationEnabled, locationError, lastLocationAt, printerConfig, unreadInternalMessages]);

  return <AppSessionContext.Provider value={value}>{children}</AppSessionContext.Provider>;
}

export function useAppSession() {
  const context = React.useContext(AppSessionContext);
  if (!context) throw new Error('useAppSession must be used inside AppSessionProvider');
  return context;
}

export type { RecentSale };







