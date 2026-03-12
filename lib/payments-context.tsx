import React, { createContext, useContext, useEffect, useReducer, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { router } from "expo-router";

// ─── Profiles ────────────────────────────────────────────────────────────────

export type Profile = "Pessoal" | "Empresa";
export const PROFILES: Profile[] = ["Pessoal", "Empresa"];

// ─── Categories ──────────────────────────────────────────────────────────────

export interface CustomCategory {
  id: string;
  name: string;
  color: string;
}

export const DEFAULT_CATEGORIES: CustomCategory[] = [
  { id: "alimentacao", name: "Alimentação", color: "#FF6B6B" },
  { id: "transporte", name: "Transporte", color: "#4ECDC4" },
  { id: "saude", name: "Saúde", color: "#45B7D1" },
  { id: "moradia", name: "Moradia", color: "#96CEB4" },
  { id: "lazer", name: "Lazer", color: "#FFEAA7" },
  { id: "educacao", name: "Educação", color: "#DDA0DD" },
  { id: "vestuario", name: "Vestuário", color: "#98D8C8" },
  { id: "servicos", name: "Serviços", color: "#F7DC6F" },
  { id: "outros", name: "Outros", color: "#BDC3C7" },
];

export function getCategoryColor(categories: CustomCategory[], name: string): string {
  return categories.find((c) => c.name === name)?.color ?? "#BDC3C7";
}

// ─── Payment ─────────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  category: string;
  profile: Profile;
  imageUri?: string;
  notes?: string;
  createdAt: string;
}

// ─── State & Actions ─────────────────────────────────────────────────────────

interface AppState {
  payments: Payment[];
  categories: CustomCategory[];
  activeProfile: Profile;
  loading: boolean;
  synced: boolean; // true when data is from cloud
}

type AppAction =
  | { type: "INIT"; payments: Payment[]; categories: CustomCategory[]; synced?: boolean }
  | { type: "ADD_PAYMENT"; payment: Payment }
  | { type: "UPDATE_PAYMENT"; payment: Payment }
  | { type: "DELETE_PAYMENT"; id: string }
  | { type: "SET_PROFILE"; profile: Profile }
  | { type: "ADD_CATEGORY"; category: CustomCategory }
  | { type: "UPDATE_CATEGORY"; category: CustomCategory }
  | { type: "DELETE_CATEGORY"; id: string };

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "INIT":
      return { ...state, payments: action.payments, categories: action.categories, loading: false, synced: action.synced ?? false };
    case "ADD_PAYMENT":
      return { ...state, payments: [action.payment, ...state.payments] };
    case "UPDATE_PAYMENT":
      return { ...state, payments: state.payments.map((p) => (p.id === action.payment.id ? action.payment : p)) };
    case "DELETE_PAYMENT":
      return { ...state, payments: state.payments.filter((p) => p.id !== action.id) };
    case "SET_PROFILE":
      return { ...state, activeProfile: action.profile };
    case "ADD_CATEGORY":
      return { ...state, categories: [...state.categories, action.category] };
    case "UPDATE_CATEGORY":
      return { ...state, categories: state.categories.map((c) => (c.id === action.category.id ? action.category : c)) };
    case "DELETE_CATEGORY":
      return { ...state, categories: state.categories.filter((c) => c.id !== action.id) };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface PaymentsContextValue {
  payments: Payment[];
  categories: CustomCategory[];
  activeProfile: Profile;
  loading: boolean;
  synced: boolean;
  setActiveProfile: (profile: Profile) => void;
  addPayment: (payment: Omit<Payment, "id" | "createdAt">) => Promise<void>;
  updatePayment: (payment: Payment) => Promise<void>;
  deletePayment: (id: string) => Promise<void>;
  getMonthPayments: (year: number, month: number, profile?: Profile | "all") => Payment[];
  getMonthTotal: (year: number, month: number, profile?: Profile | "all") => number;
  addCategory: (name: string, color: string) => Promise<void>;
  updateCategory: (category: CustomCategory) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  refreshFromCloud: () => Promise<void>;
}

const PaymentsContext = createContext<PaymentsContextValue | null>(null);

const PAYMENTS_KEY = "gastopix_payments";
const CATEGORIES_KEY = "gastopix_categories";

// ─── Helper: convert DB payment to local Payment ─────────────────────────────

function dbPaymentToLocal(p: any): Payment {
  return {
    id: String(p.id),
    description: p.description,
    amount: typeof p.amount === "string" ? parseFloat(p.amount) : Number(p.amount),
    date: p.date,
    category: p.category,
    profile: p.profile as Profile,
    imageUri: p.imageUrl ?? undefined,
    notes: p.notes ?? undefined,
    createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
  };
}

function dbCategoryToLocal(c: any): CustomCategory {
  return {
    id: String(c.id),
    name: c.name,
    color: c.color,
  };
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function PaymentsProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [state, dispatch] = useReducer(reducer, {
    payments: [],
    categories: DEFAULT_CATEGORIES,
    activeProfile: "Pessoal",
    loading: true,
    synced: false,
  });

  const utils = trpc.useUtils();

  // ── Cloud sync ────────────────────────────────────────────────────────────

  const refreshFromCloud = useCallback(async () => {
    try {
      const [cloudPayments, cloudCategories] = await Promise.all([
        utils.payments.list.fetch(),
        utils.categories.list.fetch(),
      ]);

      const payments = cloudPayments.map(dbPaymentToLocal);
      const categories =
        cloudCategories.length > 0
          ? cloudCategories.map(dbCategoryToLocal)
          : DEFAULT_CATEGORIES;

      dispatch({ type: "INIT", payments, categories, synced: true });

      // Also cache locally for offline use
      await Promise.all([
        AsyncStorage.setItem(PAYMENTS_KEY, JSON.stringify(payments)),
        AsyncStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories)),
      ]);
    } catch (err: any) {
      if (err?.data?.code === "UNAUTHORIZED") {
        router.replace("/login");
      }
    }
  }, [utils]);

  // ── Initial load ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      // Not logged in — redirect to login
      router.replace("/login");
      dispatch({ type: "INIT", payments: [], categories: DEFAULT_CATEGORIES, synced: false });
      return;
    }

    // Logged in — load from cache first, then sync from cloud
    (async () => {
      try {
        const [paymentsData, categoriesData] = await Promise.all([
          AsyncStorage.getItem(PAYMENTS_KEY),
          AsyncStorage.getItem(CATEGORIES_KEY),
        ]);
        if (paymentsData) {
          const payments: Payment[] = JSON.parse(paymentsData);
          const categories: CustomCategory[] = categoriesData
            ? JSON.parse(categoriesData)
            : DEFAULT_CATEGORIES;
          dispatch({ type: "INIT", payments, categories, synced: false });
        }
      } catch {
        // ignore cache errors
      }

      // Sync from cloud
      await refreshFromCloud();
    })();
  }, [isAuthenticated, authLoading, refreshFromCloud]);

  // ── Payment CRUD ─────────────────────────────────────────────────────────

  const addPayment = useCallback(
    async (data: Omit<Payment, "id" | "createdAt">) => {
      try {
        // Upload image to S3 if it's a local URI
        let imageUrl: string | null = null;
        if (data.imageUri && !data.imageUri.startsWith("http")) {
          try {
            const FileSystem = await import("expo-file-system/legacy");
            const base64 = await FileSystem.readAsStringAsync(data.imageUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            const result = await utils.client.uploadReceiptImage.mutate({
              imageBase64: base64,
              mimeType: "image/jpeg",
            });
            imageUrl = result.url;
          } catch {
            // If upload fails, continue without image URL
          }
        } else if (data.imageUri?.startsWith("http")) {
          imageUrl = data.imageUri;
        }

        const id = await utils.client.payments.create.mutate({
          description: data.description,
          amount: data.amount,
          date: data.date,
          category: data.category,
          profile: data.profile,
          imageUrl,
          notes: data.notes ?? null,
        });

        const payment: Payment = {
          ...data,
          id: String(id),
          imageUri: imageUrl ?? data.imageUri,
          createdAt: new Date().toISOString(),
        };
        dispatch({ type: "ADD_PAYMENT", payment });
      } catch (err: any) {
        if (err?.data?.code === "UNAUTHORIZED") router.replace("/login");
        throw err;
      }
    },
    [utils]
  );

  const updatePayment = useCallback(
    async (payment: Payment) => {
      dispatch({ type: "UPDATE_PAYMENT", payment });
      try {
        await utils.client.payments.update.mutate({
          id: parseInt(payment.id),
          description: payment.description,
          amount: payment.amount,
          date: payment.date,
          category: payment.category,
          profile: payment.profile,
          imageUrl: payment.imageUri ?? null,
          notes: payment.notes ?? null,
        });
      } catch (err: any) {
        if (err?.data?.code === "UNAUTHORIZED") router.replace("/login");
        throw err;
      }
    },
    [utils]
  );

  const deletePayment = useCallback(
    async (id: string) => {
      dispatch({ type: "DELETE_PAYMENT", id });
      try {
        await utils.client.payments.delete.mutate({ id: parseInt(id) });
      } catch (err: any) {
        if (err?.data?.code === "UNAUTHORIZED") router.replace("/login");
        throw err;
      }
    },
    [utils]
  );

  // ── Profile ───────────────────────────────────────────────────────────────

  const setActiveProfile = useCallback((profile: Profile) => {
    dispatch({ type: "SET_PROFILE", profile });
  }, []);

  // ── Queries ───────────────────────────────────────────────────────────────

  const getMonthPayments = useCallback(
    (year: number, month: number, profile: Profile | "all" = "all") => {
      return state.payments.filter((p) => {
        const [y, m] = p.date.split("-").map(Number);
        const matchDate = y === year && m === month;
        const matchProfile = profile === "all" || p.profile === profile;
        return matchDate && matchProfile;
      });
    },
    [state.payments]
  );

  const getMonthTotal = useCallback(
    (year: number, month: number, profile: Profile | "all" = "all") => {
      return getMonthPayments(year, month, profile).reduce((sum, p) => sum + p.amount, 0);
    },
    [getMonthPayments]
  );

  // ── Category CRUD ─────────────────────────────────────────────────────────

  const addCategory = useCallback(
    async (name: string, color: string) => {
      try {
        const id = await utils.client.categories.create.mutate({ name: name.trim(), color });
        const category: CustomCategory = { id: String(id), name: name.trim(), color };
        dispatch({ type: "ADD_CATEGORY", category });
      } catch (err: any) {
        if (err?.data?.code === "UNAUTHORIZED") router.replace("/login");
        throw err;
      }
    },
    [utils]
  );

  const updateCategory = useCallback(
    async (category: CustomCategory) => {
      const numericId = parseInt(category.id);
      // If id is non-numeric (default category), create a new custom one in the backend first
      if (isNaN(numericId)) {
        try {
          const newId = await utils.client.categories.create.mutate({
            name: category.name,
            color: category.color,
          });
          const newCategory: CustomCategory = { id: String(newId), name: category.name, color: category.color };
          // Replace the default category with the new custom one in state
          dispatch({ type: "DELETE_CATEGORY", id: category.id });
          dispatch({ type: "ADD_CATEGORY", category: newCategory });
        } catch (err: any) {
          if (err?.data?.code === "UNAUTHORIZED") router.replace("/login");
          throw err;
        }
        return;
      }
      dispatch({ type: "UPDATE_CATEGORY", category });
      try {
        await utils.client.categories.update.mutate({
          id: numericId,
          name: category.name,
          color: category.color,
        });
      } catch (err: any) {
        // Rollback optimistic update on failure
        await refreshFromCloud();
        if (err?.data?.code === "UNAUTHORIZED") router.replace("/login");
        throw err;
      }
    },
    [utils, refreshFromCloud]
  );

  const deleteCategory = useCallback(
    async (id: string) => {
      const numericId = parseInt(id);
      // If id is non-numeric (default category), just remove from local state
      if (isNaN(numericId)) {
        dispatch({ type: "DELETE_CATEGORY", id });
        return;
      }
      dispatch({ type: "DELETE_CATEGORY", id });
      try {
        await utils.client.categories.delete.mutate({ id: numericId });
      } catch (err: any) {
        // Rollback optimistic delete on failure
        await refreshFromCloud();
        if (err?.data?.code === "UNAUTHORIZED") router.replace("/login");
        throw err;
      }
    },
    [utils, refreshFromCloud]
  );

  return (
    <PaymentsContext.Provider
      value={{
        payments: state.payments,
        categories: state.categories,
        activeProfile: state.activeProfile,
        loading: state.loading,
        synced: state.synced,
        setActiveProfile,
        addPayment,
        updatePayment,
        deletePayment,
        getMonthPayments,
        getMonthTotal,
        addCategory,
        updateCategory,
        deleteCategory,
        refreshFromCloud,
      }}
    >
      {children}
    </PaymentsContext.Provider>
  );
}

export function usePayments() {
  const ctx = useContext(PaymentsContext);
  if (!ctx) throw new Error("usePayments must be used within PaymentsProvider");
  return ctx;
}
