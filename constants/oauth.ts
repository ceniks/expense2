import * as Linking from "expo-linking";
import * as ReactNative from "react-native";
import * as WebBrowser from "expo-web-browser";

// Extract scheme from bundle ID (last segment timestamp, prefixed with "manus")
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const bundleId = "space.manus.expense_tracker_ai.t20260301171144";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  portal: process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
  server: process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
  appId: process.env.EXPO_PUBLIC_APP_ID ?? "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID ?? "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME ?? "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  deepLinkScheme: schemeFromBundleId,
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;
export const API_BASE_URL = env.apiBaseUrl;

/**
 * Get the API base URL, deriving from current hostname if not set.
 * - No Railway: frontend e backend estão no mesmo domínio, usa URL relativa ("")
 * - No Manus sandbox: Metro roda em 8081, API em 3000 (portas diferentes)
 * - URL pattern sandbox: https://PORT-sandboxid.region.domain
 */
export function getApiBaseUrl(): string {
  // Se EXPO_PUBLIC_API_BASE_URL estiver definida, usa ela
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/\/$/, "");
  }

  // No web, verifica se está no sandbox do Manus (porta 8081 no hostname)
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    // Padrão sandbox Manus: 8081-sandboxid.region.domain -> 3000-sandboxid.region.domain
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
    // No Railway ou qualquer outro servidor onde frontend e backend estão no mesmo domínio,
    // usa URL relativa para que as chamadas de API funcionem automaticamente
    return "";
  }

  // Fallback para URL relativa
  return "";
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";

const encodeState = (value: string) => {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value);
  }
  const BufferImpl = (globalThis as Record<string, any>).Buffer;
  if (BufferImpl) {
    return BufferImpl.from(value, "utf-8").toString("base64");
  }
  return value;
};

/**
 * Get the redirect URI for OAuth callback.
 * - Web: uses API server callback endpoint
 * - Native: uses deep link scheme (manus*), which works in both Expo Go and published app
 *   via WebBrowser.openAuthSessionAsync (ASWebAuthenticationSession on iOS)
 */
export const getRedirectUri = () => {
  if (ReactNative.Platform.OS === "web") {
    // Quando getApiBaseUrl() retorna "" (mesmo domínio, ex: Railway),
    // usa window.location.origin para garantir URL absoluta com https://
    const base = getApiBaseUrl() || (typeof window !== "undefined" ? window.location.origin : "");
    return `${base}/api/oauth/callback`;
  } else {
    // Always use the app's own scheme (manus*) — works with openAuthSessionAsync
    // which uses ASWebAuthenticationSession on iOS (works in Expo Go too)
    return Linking.createURL("/oauth/callback", {
      scheme: env.deepLinkScheme,
    });
  }
};

export const getLoginUrl = () => {
  const redirectUri = getRedirectUri();
  const state = encodeState(redirectUri);

  const url = new URL(`${OAUTH_PORTAL_URL}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

/**
 * Check if running inside Expo Go (development client).
 * In Expo Go, deep links use exp:// scheme which is not allowed by Manus OAuth.
 * Users should use the web version for login in Expo Go.
 */
export function isRunningInExpoGo(): boolean {
  // In Expo Go, the scheme is always exp:// or exps://
  // In a published app, it uses the custom scheme (manus*)
  try {
    const url = Linking.createURL("/");
    return url.startsWith("exp://") || url.startsWith("exps://");
  } catch {
    return false;
  }
}

/**
 * Start OAuth login flow.
 *
 * On native platforms (iOS/Android), opens the system browser.
 * The OAuth callback returns via deep link to the app.
 * NOTE: In Expo Go, deep links use exp:// which is not allowed by Manus OAuth.
 * Users should use the web version (https://expensetrk-ajmw55p7.manus.space) for login.
 *
 * On web, this simply redirects to the login URL.
 *
 * @returns Always null, the callback is handled via deep link.
 */
export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = getLoginUrl();

  if (ReactNative.Platform.OS === "web") {
    // On web, just redirect
    if (typeof window !== "undefined") {
      window.location.href = loginUrl;
    }
    return null;
  }

  const supported = await Linking.canOpenURL(loginUrl);
  if (!supported) {
    console.warn("[OAuth] Cannot open login URL: URL scheme not supported");
    return null;
  }

  try {
    await Linking.openURL(loginUrl);
  } catch (error) {
    console.error("[OAuth] Failed to open login URL:", error);
  }

  // The OAuth callback will reopen the app via deep link.
  return null;
}
