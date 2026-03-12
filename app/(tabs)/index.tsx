import {
  Text,
  View,
  FlatList,
  Pressable,
  Image,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
  TextInput,
  Modal,
} from "react-native";
import { useState, useMemo } from "react";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { usePayments, Payment, getCategoryColor, Profile, PROFILES } from "@/lib/payments-context";
import { IconSymbol } from "@/components/ui/icon-symbol";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function getMonthName(month: number, year: number) {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** Retorna o rótulo do grupo de dia: "Hoje", "Ontem" ou data formatada */
function getDayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const itemDate = new Date(y, m - 1, d);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (itemDate.getTime() === today.getTime()) return "Hoje";
  if (itemDate.getTime() === yesterday.getTime()) return "Ontem";

  return itemDate.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
  });
}

/** Agrupa pagamentos por dia, retornando lista de itens com cabeçalhos */
type DayGroup = {
  label: string;
  total: number;
  payments: Payment[];
};

function groupByDay(payments: Payment[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const p of payments) {
    const label = getDayLabel(p.date);
    if (!map.has(label)) {
      map.set(label, { label, total: 0, payments: [] });
    }
    const group = map.get(label)!;
    group.total += p.amount;
    group.payments.push(p);
  }
  return Array.from(map.values());
}

/** Item de lista: pode ser cabeçalho de dia ou pagamento */
type ListItem =
  | { type: "header"; label: string; total: number }
  | { type: "payment"; payment: Payment };

function PaymentItem({
  payment,
  onPress,
  onDelete,
  catColor,
  searchQuery,
}: {
  payment: Payment;
  onPress: () => void;
  onDelete: () => void;
  catColor: string;
  searchQuery: string;
}) {
  const colors = useColors();

  function HighlightText({ text, style }: { text: string; style: object }) {
    if (!searchQuery.trim()) return <Text style={style}>{text}</Text>;
    const lower = text.toLowerCase();
    const query = searchQuery.toLowerCase().trim();
    const idx = lower.indexOf(query);
    if (idx === -1) return <Text style={style}>{text}</Text>;
    return (
      <Text style={style}>
        {text.slice(0, idx)}
        <Text style={{ backgroundColor: colors.warning + "55", color: colors.foreground }}>
          {text.slice(idx, idx + query.length)}
        </Text>
        {text.slice(idx + query.length)}
      </Text>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.paymentItem,
        { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      {payment.imageUri ? (
        <Image source={{ uri: payment.imageUri }} style={styles.thumbnail} resizeMode="cover" />
      ) : (
        <View style={[styles.thumbnailPlaceholder, { backgroundColor: catColor + "22" }]}>
          <IconSymbol name="doc.text.fill" size={22} color={catColor} />
        </View>
      )}
      <View style={styles.paymentInfo}>
        <HighlightText
          text={payment.description}
          style={[styles.paymentDesc, { color: colors.foreground }]}
        />
        <View style={styles.paymentMeta}>
          <View style={[styles.categoryBadge, { backgroundColor: catColor + "33" }]}>
            <HighlightText
              text={payment.category}
              style={[styles.categoryText, { color: catColor }]}
            />
          </View>
          {payment.profile === "Empresa" && (
            <View style={[styles.profileBadge, { backgroundColor: colors.primary + "22" }]}>
              <Text style={[styles.profileBadgeText, { color: colors.primary }]}>Empresa</Text>
            </View>
          )}
        </View>
      </View>
      <Text style={[styles.paymentAmount, { color: colors.foreground }]}>
        {formatCurrency(payment.amount)}
      </Text>
      <Pressable
        onPress={onDelete}
        hitSlop={10}
        style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.5 : 1 }]}
      >
        <IconSymbol name="trash.fill" size={16} color={colors.error} />
      </Pressable>
    </Pressable>
  );
}

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { payments, loading, getMonthPayments, getMonthTotal, categories, activeProfile, setActiveProfile, deletePayment } = usePayments();
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; description: string } | null>(null);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthPayments = getMonthPayments(year, month, activeProfile);
  const monthTotal = getMonthTotal(year, month, activeProfile);
  const monthName = getMonthName(month, year);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // Filtra por perfil + busca
  const filteredPayments = useMemo(() => {
    const byProfile = payments.filter((p) => p.profile === activeProfile);
    if (!searchQuery.trim()) return byProfile.slice(0, 100);
    const q = searchQuery.toLowerCase().trim();
    return byProfile.filter((p) => {
      const amountStr = formatCurrency(p.amount).toLowerCase();
      return (
        p.description.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        amountStr.includes(q) ||
        (p.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [payments, activeProfile, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  // Monta lista plana com cabeçalhos de dia intercalados
  const listItems = useMemo((): ListItem[] => {
    const groups = groupByDay(filteredPayments);
    const items: ListItem[] = [];
    for (const group of groups) {
      items.push({ type: "header", label: group.label, total: group.total });
      for (const p of group.payments) {
        items.push({ type: "payment", payment: p });
      }
    }
    return items;
  }, [filteredPayments]);

  function handleDeletePayment(id: string, description: string) {
    if (Platform.OS === "web") {
      // No web, Alert.alert não funciona — usa modal customizado
      setDeleteConfirm({ id, description });
    } else {
      Alert.alert(
        "Excluir pagamento",
        `Excluir "${description}"?`,
        [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Excluir",
            style: "destructive",
            onPress: async () => {
              await deletePayment(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        ]
      );
    }
  }

  async function confirmDelete() {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;
    setDeleteConfirm(null);
    await deletePayment(id);
  }

  if (loading) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <FlatList
        data={listItems}
        keyExtractor={(item, index) =>
          item.type === "header" ? `header-${item.label}` : `payment-${item.payment.id}`
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {/* Header card */}
            <View style={[styles.header, { backgroundColor: colors.primary }]}>
              {/* Profile selector */}
              <View style={styles.profileRow}>
                {PROFILES.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => {
                      setActiveProfile(p);
                      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                    style={({ pressed }) => [
                      styles.profileChip,
                      {
                        backgroundColor: activeProfile === p ? "rgba(255,255,255,0.25)" : "transparent",
                        borderColor: activeProfile === p ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.3)",
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <IconSymbol
                      name={p === "Empresa" ? "building.2.fill" : "person.fill"}
                      size={14}
                      color="#FFFFFF"
                    />
                    <Text style={styles.profileChipText}>{p}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.headerLabel}>MÊS ATUAL</Text>
              <Text style={styles.headerMonth}>{monthName}</Text>
              <Text style={styles.headerTotal}>{formatCurrency(monthTotal)}</Text>
              <Text style={styles.headerCount}>{monthPayments.length} pagamento{monthPayments.length !== 1 ? "s" : ""}</Text>
            </View>

            {/* Search bar */}
            <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: searchFocused ? colors.primary : colors.border }]}>
              <IconSymbol name="magnifyingglass" size={18} color={searchFocused ? colors.primary : colors.muted} />
              <TextInput
                style={[styles.searchInput, { color: colors.foreground }]}
                placeholder="Buscar por descrição, categoria ou valor..."
                placeholderTextColor={colors.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                returnKeyType="search"
                clearButtonMode="while-editing"
                autoCorrect={false}
              />
              {isSearching && (
                <Pressable
                  onPress={() => setSearchQuery("")}
                  hitSlop={8}
                  style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
                >
                  <IconSymbol name="xmark.circle.fill" size={18} color={colors.muted} />
                </Pressable>
              )}
            </View>

            {/* Section title */}
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {isSearching
                  ? `${filteredPayments.length} resultado${filteredPayments.length !== 1 ? "s" : ""} encontrado${filteredPayments.length !== 1 ? "s" : ""}`
                  : "Pagamentos recentes"}
              </Text>
            </View>

            {filteredPayments.length === 0 && (
              <View style={styles.emptyState}>
                <IconSymbol
                  name={isSearching ? "magnifyingglass" : "doc.text.fill"}
                  size={48}
                  color={colors.muted}
                />
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                  {isSearching ? "Nenhum resultado" : "Nenhum pagamento ainda"}
                </Text>
                <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
                  {isSearching
                    ? `Nenhum pagamento encontrado para "${searchQuery}"`
                    : `Toque em "+" para adicionar seu primeiro comprovante`}
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => {
          if (item.type === "header") {
            return (
              <View style={[styles.dayHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.dayLabel, { color: colors.foreground }]}>
                  {item.label}
                </Text>
                <View style={[styles.dayTotalBadge, { backgroundColor: colors.primary + "18" }]}>
                  <Text style={[styles.dayTotal, { color: colors.primary }]}>
                    {formatCurrency(item.total)}
                  </Text>
                </View>
              </View>
            );
          }
          return (
            <PaymentItem
              payment={item.payment}
              catColor={getCategoryColor(categories, item.payment.category)}
              searchQuery={searchQuery}
              onPress={() => router.push({ pathname: "/(payment)/[id]" as any, params: { id: item.payment.id } })}
              onDelete={() => handleDeletePayment(item.payment.id, item.payment.description)}
            />
          );
        }}
      />

      {/* Modal de confirmação de exclusão (para web, onde Alert.alert não funciona) */}
      <Modal
        visible={deleteConfirm !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirm(null)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setDeleteConfirm(null)}
        >
          <View
            style={[styles.modalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Excluir pagamento</Text>
            <Text style={[styles.modalMessage, { color: colors.muted }]} numberOfLines={2}>
              Excluir “{deleteConfirm?.description}”?
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, { backgroundColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                onPress={() => setDeleteConfirm(null)}
              >
                <Text style={[styles.modalBtnText, { color: colors.foreground }]}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnDelete, { backgroundColor: colors.error, opacity: pressed ? 0.7 : 1 }]}
                onPress={confirmDelete}
              >
                <Text style={[styles.modalBtnText, { color: "#FFFFFF" }]}>Excluir</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
    alignItems: "center",
    gap: 4,
  },
  profileRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  profileChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  profileChipText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  headerLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  headerMonth: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  headerTotal: {
    color: "#FFFFFF",
    fontSize: 38,
    fontWeight: "700",
    letterSpacing: -1,
  },
  headerCount: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
  },
  // Search
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 0,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  // Day group header
  dayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "capitalize",
    flex: 1,
  },
  dayTotalBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  dayTotal: {
    fontSize: 13,
    fontWeight: "700",
  },
  // Payment item
  paymentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  thumbnailPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentInfo: {
    flex: 1,
    gap: 4,
  },
  paymentDesc: {
    fontSize: 15,
    fontWeight: "600",
    lineHeight: 20,
  },
  paymentMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  categoryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 11,
    fontWeight: "600",
  },
  profileBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  profileBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  paymentAmount: {
    fontSize: 15,
    fontWeight: "700",
  },
  deleteBtn: {
    padding: 6,
  },
  // Modal de confirmação
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalBox: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modalBtnCancel: {},
  modalBtnDelete: {},
  modalBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
