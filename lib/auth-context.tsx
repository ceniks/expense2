import React, { createContext, useContext, useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as Api from "@/lib/_core/api";
import * as Auth from "@/lib/_core/auth";

export type AuthUser = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: Date;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);

      if (Platform.OS === "web") {
        const apiUser = await Api.getMe();
        if (apiUser) {
          const userInfo: AuthUser = {
            id: apiUser.id,
            openId: apiUser.openId,
            name: apiUser.name,
            email: apiUser.email,
            loginMethod: apiUser.loginMethod,
            lastSignedIn: new Date(apiUser.lastSignedIn),
          };
          setUser(userInfo);
          await Auth.setUserInfo(userInfo);
        } else {
          setUser(null);
          await Auth.clearUserInfo();
        }
        return;
      }

      // Native: token-based auth
      const sessionToken = await Auth.getSessionToken();
      if (!sessionToken) {
        setUser(null);
        return;
      }
      const cachedUser = await Auth.getUserInfo();
      setUser(cachedUser as AuthUser | null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await Api.logout();
    } catch {
      // continue
    } finally {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") {
      fetchUser();
    } else {
      Auth.getUserInfo().then((cached) => {
        if (cached) {
          setUser(cached as AuthUser);
          setLoading(false);
        } else {
          fetchUser();
        }
      });
    }
  }, [fetchUser]);

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated, refresh: fetchUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuthContext must be used inside AuthProvider");
  return ctx;
}
