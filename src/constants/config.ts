import { Platform } from 'react-native';

export const DEFAULT_TENANT_SLUG = '205430983';
export const LOCAL_API_HOST = '192.168.100.7';
const DEFAULT_PRODUCTION_API_BASE = 'https://bot-loteria-api.onrender.com/api';
const EXPO_PUBLIC_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

export function getApiBase() {
  if (EXPO_PUBLIC_API_BASE_URL) return EXPO_PUBLIC_API_BASE_URL.replace(/\/$/, '');

  if (__DEV__) {
    if (Platform.OS === 'android') return `http://${LOCAL_API_HOST}:3001/api`;
    return 'http://localhost:3001/api';
  }

  return DEFAULT_PRODUCTION_API_BASE;
}
