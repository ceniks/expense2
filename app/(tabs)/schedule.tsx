import { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { DateInput } from "@/components/ui/date-input";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayBR(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function brToISO(br: string): string {
  if (!br) return "";
  if (br.match(/^\d{4}-\d{2}-\d{2}$/)) return br;
  const [d, m, y] = br.split("/");
  if (!d || !m || !y || y.length < 4) return "";
  return `${y}-${m}-${d}`;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const names = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${names[m - 1]} ${y}`;
}

function formatCurrency(val: string | number): string {
  const n = typeof val === "string" ? parseFloat(val) : val;
  return isNaN(n) ? "R$ 0,00" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// Unified item type matching the server's UnifiedScheduleItem
interface UnifiedItem {
  id: string;
  type: "invoice" | "financing" | "bill";
  name: string;
  category: string;
  profile: string;
  amount: string;
  dueDate: string;
  isPaid: boolean;
  // invoice
  installmentId?: number;
  invoiceId?: number;
  installmentNumber?: number;
  totalInstallments?: number;
  paymentId?: number | null;
  paidAt?: Date | null;
  // financing
  financingId?: number;
  financingInstallmentNumber?: number;
  financingTotalInstallments?: number;
  // bill
  billId?: number;
  yearMonth?: string;
}

function getStatusBadge(item: UnifiedItem, todayStr: string) {
  if (item.isPaid) return { label: "Pago", color: "#22C55E" };
  if (item.dueDate < todayStr) return { label: "Vencido", color: "#EF4444" };
  if (item.dueDate === todayStr) return { label: "Hoje", color: "#F59E0B" };
  return null;
}

function getTypeLabel(item: UnifiedItem): string {
  if (item.type === "invoice") {
    return `Parcela ${item.installmentNumber}/${item.totalInstallments} · ${item.category}`;
  }
  if (item.type === "financing") {
    return `Financiamento ${item.financingInstallmentNumber}/${item.financingTotalInstallments} · ${item.category}`;
  }
  if (item.type === "bill") {
    const [y, m] = (item.yearMonth ?? "").split("-");
    const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const monthName = m ? monthNames[parseInt(m) - 1] : "";
    return `Conta Mensal · ${monthName}/${y} · ${item.category}`;
  }
  return item.category;
}

function getTypeIcon(type: UnifiedItem["type"]): string {
  if (type === "invoice") return "📄";
  if (type === "financing") return "🏦";
  if (type === "bill") return "📋";
  return "💳";
}

// ─── Mark Paid Modal ──────────────────────────────────────────────────────────

function MarkPaidModal({
  visible,
  item,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  item: UnifiedItem | null;
  onClose: () => void;
  onConfirm: (paidDate: string) => Promise<void>;
}) {
  const colors = useColors();
  const [paidDate, setPaidDate] = useState(todayBR());
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    const iso = brToISO(paidDate);
    if (!iso) {
      Alert.alert("Data inválida", "Informe a data no formato DD/MM/AAAA.");
      return;
    }
    setSaving(true);
    try {
      await onConfirm(iso);
    } finally {
      setSaving(false);
    }
  };

  if (!item) return null;

  const subtitle = item.type === "invoice"
    ? `${item.name} — Parcela ${item.installmentNumber}/${item.totalInstallments}`
    : item.type === "financing"
    ? `${item.name} — Parcela ${item.financingInstallmentNumber}/${item.financingTotalInstallments}`
    : `${item.name} — ${item.yearMonth}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.alertBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.alertTitle, { color: colors.foreground }]}>Confirmar Pagamento</Text>
          <Text style={[styles.alertSubtitle, { color: colors.muted }]}>{subtitle}</Text>
          <Text style={[styles.alertAmount, { color: colors.primary }]}>{formatCurrency(item.amount)}</Text>
          <Text style={[styles.alertLabel, { color: colors.muted }]}>Data do pagamento</Text>
          <DateInput
            style={[styles.alertInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }]}
            value={paidDate}
            onChangeText={setPaidDate}
            placeholderTextColor={colors.muted}
            autoFocus
          />
          <View style={styles.alertActions}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.alertBtn, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.alertBtnText, { color: colors.muted }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={saving ? undefined : handleConfirm}
              style={({ pressed }) => [styles.alertBtn, styles.alertBtnPrimary, { backgroundColor: colors.primary }, pressed && { opacity: 0.7 }]}
            >
              {saving
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={[styles.alertBtnText, { color: "#FFF" }]}>Confirmar</Text>
              }
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Unified Item Card ────────────────────────────────────────────────────────

function UnifiedCard({
  item,
  onPay,
  onUnpay,
  onEdit,
  onDelete,
}: {
  item: UnifiedItem;
  onPay: (item: UnifiedItem) => void;
  onUnpay: (item: UnifiedItem) => void;
  onEdit: (item: UnifiedItem) => void;
  onDelete: (item: UnifiedItem) => void;
}) {
  const colors = useColors();
  const todayStr = todayISO();
  const badge = getStatusBadge(item, todayStr);
  const isOverdue = !item.isPaid && item.dueDate < todayStr;

  // Color accent per type
  const typeColor = item.type === "invoice" ? colors.primary : item.type === "financing" ? "#8B5CF6" : "#0EA5E9";

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: isOverdue ? "#EF444440" : colors.border }]}>
      {/* Type stripe */}
      <View style={[styles.typeStripe, { backgroundColor: typeColor }]} />
      <View style={styles.cardInner}>
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <Text style={[styles.cardSupplier, { color: colors.foreground }]} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={[styles.cardMeta, { color: colors.muted }]}>
              {getTypeLabel(item)}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.cardAmount, { color: isOverdue ? "#EF4444" : colors.foreground }]}>
              {formatCurrency(item.amount)}
            </Text>
            <Text style={[styles.cardDate, { color: colors.muted }]}>{formatDate(item.dueDate)}</Text>
            <View style={styles.cardActions}>
              <Pressable
                onPress={() => onEdit(item)}
                style={({ pressed }) => [styles.cardActionBtn, pressed && { opacity: 0.5 }]}
              >
                <IconSymbol name="pencil" size={13} color={colors.muted} />
              </Pressable>
              <Pressable
                onPress={() => onDelete(item)}
                style={({ pressed }) => [styles.cardActionBtn, pressed && { opacity: 0.5 }]}
              >
                <IconSymbol name="trash" size={13} color="#EF4444" />
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.cardBottom}>
          {badge && (
            <View style={[styles.badge, { backgroundColor: badge.color + "20" }]}>
              <Text style={[styles.badgeText, { color: badge.color }]}>{badge.label}</Text>
            </View>
          )}
          {/* Type badge */}
          <View style={[styles.badge, { backgroundColor: typeColor + "15" }]}>
            <Text style={[styles.badgeText, { color: typeColor }]}>
              {item.type === "invoice" ? "Nota Fiscal" : item.type === "financing" ? "Financiamento" : "Conta Mensal"}
            </Text>
          </View>
          <View style={{ flex: 1 }} />
          {item.isPaid ? (
            // Only invoices support "undo pay" via installmentId
            item.type === "invoice" ? (
              <Pressable
                onPress={() => onUnpay(item)}
                style={({ pressed }) => [styles.unpayBtn, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.unpayBtnText, { color: colors.muted }]}>Desfazer</Text>
              </Pressable>
            ) : null
          ) : (
            <Pressable
              onPress={() => onPay(item)}
              style={({ pressed }) => [styles.payBtn, { backgroundColor: typeColor }, pressed && { opacity: 0.7 }]}
            >
              <IconSymbol name="checkmark.circle.fill" size={14} color="#FFF" />
              <Text style={styles.payBtnText}>Pagar</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ title, total, color }: { title: string; total: number; color: string }) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionDot, { backgroundColor: color }]} />
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.sectionTotal, { color: colors.muted }]}>{formatCurrency(total)}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const colors = useColors();
  const utils = trpc.useUtils();

  const { data: items = [], isLoading, refetch } = trpc.invoices.unified.useQuery();

  // Mutations for invoices
  const markPaidMutation = trpc.invoices.markPaid.useMutation({
    onSuccess: () => {
      utils.invoices.unified.invalidate();
      utils.invoices.schedule.invalidate();
    },
  });
  const markUnpaidMutation = trpc.invoices.markUnpaid.useMutation({
    onSuccess: () => {
      utils.invoices.unified.invalidate();
      utils.invoices.schedule.invalidate();
    },
  });

  // Mutations for monthly bills
  const payBillMutation = trpc.monthlyBills.pay.useMutation({
    onSuccess: () => {
      utils.invoices.unified.invalidate();
      utils.monthlyBills.list.invalidate();
    },
  });

  // Delete mutations
  const deleteInvoiceMutation = trpc.invoices.delete.useMutation({
    onSuccess: () => utils.invoices.unified.invalidate(),
  });
  const deleteFinancingMutation = trpc.financings.delete.useMutation({
    onSuccess: () => utils.invoices.unified.invalidate(),
  });
  const deleteMonthlyBillMutation = trpc.monthlyBills.delete.useMutation({
    onSuccess: () => utils.invoices.unified.invalidate(),
  });

  // Edit state
  const [editItem, setEditItem] = useState<UnifiedItem | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<UnifiedItem | null>(null);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

  const [selectedItem, setSelectedItem] = useState<UnifiedItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<UnifiedItem["type"] | null>(null);
  const [selectedYearMonth, setSelectedYearMonth] = useState(currentYearMonth);

  const todayStr = todayISO();

  const allCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of items as UnifiedItem[]) {
      if (item.category) cats.add(item.category);
    }
    return Array.from(cats).sort();
  }, [items]);

  // Items do mês selecionado
  const monthItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (items as UnifiedItem[]).filter((item) => {
      const matchesMonth = item.dueDate.startsWith(selectedYearMonth);
      const matchesName = !q || item.name.toLowerCase().includes(q);
      const matchesCat = !selectedCategory || item.category === selectedCategory;
      const matchesType = !selectedType || item.type === selectedType;
      return matchesMonth && matchesName && matchesCat && matchesType;
    });
  }, [items, selectedYearMonth, searchQuery, selectedCategory, selectedType]);

  const isFiltered = searchQuery.trim().length > 0 || selectedCategory !== null || selectedType !== null;

  const pendingItems = useMemo(() =>
    monthItems.filter(i => !i.isPaid).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [monthItems]);
  const paidItems = useMemo(() =>
    monthItems.filter(i => i.isPaid).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [monthItems]);

  const totalPending = pendingItems.reduce((s, i) => s + parseFloat(i.amount), 0);
  const totalPaid = paidItems.reduce((s, i) => s + parseFloat(i.amount), 0);
  const totalMonth = totalPending + totalPaid;

  const overdueItems = pendingItems.filter(i => i.dueDate < todayStr);
  const totalOverdue = overdueItems.reduce((s, i) => s + parseFloat(i.amount), 0);

  const handlePay = useCallback((item: UnifiedItem) => {
    setSelectedItem(item);
    setModalVisible(true);
  }, []);

  const handleUnpay = useCallback(async (item: UnifiedItem) => {
    if (item.type !== "invoice" || !item.installmentId) return;
    Alert.alert(
      "Desfazer pagamento",
      `Remover o pagamento de ${item.name} (Parcela ${item.installmentNumber}/${item.totalInstallments})?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Desfazer",
          style: "destructive",
          onPress: async () => {
            try {
              await markUnpaidMutation.mutateAsync({ installmentId: item.installmentId! });
            } catch {
              Alert.alert("Erro", "Não foi possível desfazer o pagamento.");
            }
          },
        },
      ]
    );
  }, [markUnpaidMutation]);

  const handleConfirmPay = useCallback(async (paidDate: string) => {
    if (!selectedItem) return;
    try {
      if (selectedItem.type === "invoice" && selectedItem.installmentId) {
        await markPaidMutation.mutateAsync({
          installmentId: selectedItem.installmentId,
          paidDate,
        });
      } else if (selectedItem.type === "bill" && selectedItem.billId && selectedItem.yearMonth) {
        await payBillMutation.mutateAsync({
          id: selectedItem.billId,
          yearMonth: selectedItem.yearMonth,
          amount: parseFloat(selectedItem.amount),
        });
      } else if (selectedItem.type === "financing") {
        // Financing: just show success (payment is tracked via paidInstallments in financings screen)
        Alert.alert(
          "Parcela registrada",
          `Para registrar o pagamento do financiamento "${selectedItem.name}", acesse a aba Financiamentos e clique em "Registrar Pagamento".`,
        );
      }
      setModalVisible(false);
      setSelectedItem(null);
    } catch {
      Alert.alert("Erro", "Não foi possível registrar o pagamento.");
    }
  }, [selectedItem, markPaidMutation, payBillMutation]);

  const handleEdit = useCallback((item: UnifiedItem) => {
    setEditItem(item);
    setEditModalVisible(true);
  }, []);

  const handleDelete = useCallback((item: UnifiedItem) => {
    setDeleteConfirmItem(item);
    setDeleteModalVisible(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmItem) return;
    try {
      if (deleteConfirmItem.type === "invoice" && deleteConfirmItem.invoiceId) {
        await deleteInvoiceMutation.mutateAsync({ invoiceId: deleteConfirmItem.invoiceId });
      } else if (deleteConfirmItem.type === "financing" && deleteConfirmItem.financingId) {
        await deleteFinancingMutation.mutateAsync({ id: deleteConfirmItem.financingId });
      } else if (deleteConfirmItem.type === "bill" && deleteConfirmItem.billId) {
        await deleteMonthlyBillMutation.mutateAsync({ id: deleteConfirmItem.billId });
      }
    } catch {
      Alert.alert("Erro", "Não foi possível excluir o item.");
    } finally {
      setDeleteModalVisible(false);
      setDeleteConfirmItem(null);
    }
  }, [deleteConfirmItem, deleteInvoiceMutation, deleteFinancingMutation, deleteMonthlyBillMutation]);

  // Build flat list
  type ListItem =
    | { type: "summary" }
    | { type: "section"; title: string; total: number; color: string }
    | { type: "item"; data: UnifiedItem }
    | { type: "empty"; message: string };

  const listData: ListItem[] = useMemo(() => {
    const data: ListItem[] = [{ type: "summary" }];

    if (pendingItems.length > 0) {
      data.push({ type: "section", title: `A Pagar · ${pendingItems.length}`, total: totalPending, color: "#EF4444" });
      for (const item of pendingItems) data.push({ type: "item", data: item });
    }

    if (paidItems.length > 0) {
      data.push({ type: "section", title: `Pago · ${paidItems.length}`, total: totalPaid, color: "#22C55E" });
      for (const item of paidItems) data.push({ type: "item", data: item });
    }

    if (pendingItems.length === 0 && paidItems.length === 0 && !isLoading) {
      data.push({
        type: "empty",
        message: isFiltered
          ? "Nenhum item encontrado para essa busca."
          : "Nenhum compromisso em " + monthLabel(selectedYearMonth) + ".",
      });
    }

    return data;
  }, [pendingItems, paidItems, totalPending, totalPaid, isFiltered, isLoading, selectedYearMonth]);

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === "summary") {
      return (
        <View style={[styles.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Total do mês */}
          <View style={{ alignItems: "center", marginBottom: 14 }}>
            <Text style={[styles.summaryLabel, { color: colors.muted, marginBottom: 2 }]}>Total do Mês</Text>
            <Text style={[{ fontSize: 26, fontWeight: "800", color: colors.foreground }]}>{formatCurrency(totalMonth)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>A Pagar</Text>
              <Text style={[styles.summaryValue, { color: totalPending > 0 ? "#EF4444" : colors.foreground }]}>
                {formatCurrency(totalPending)}
              </Text>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>Pago</Text>
              <Text style={[styles.summaryValue, { color: totalPaid > 0 ? "#22C55E" : colors.foreground }]}>
                {formatCurrency(totalPaid)}
              </Text>
            </View>
            {overdueItems.length > 0 && (
              <>
                <View style={[styles.summaryDivider, { backgroundColor: colors.border }]} />
                <View style={styles.summaryItem}>
                  <Text style={[styles.summaryLabel, { color: "#EF4444" }]}>Vencido</Text>
                  <Text style={[styles.summaryValue, { color: "#EF4444" }]}>{formatCurrency(totalOverdue)}</Text>
                </View>
              </>
            )}
          </View>
        </View>
      );
    }

    if (item.type === "section") {
      return <SectionHeader title={item.title} total={item.total} color={item.color} />;
    }

    if (item.type === "item") {
      return <UnifiedCard item={item.data} onPay={handlePay} onUnpay={handleUnpay} onEdit={handleEdit} onDelete={handleDelete} />;
    }

    if (item.type === "empty") {
      return (
        <View style={styles.emptyState}>
          <IconSymbol name="calendar.badge.clock" size={48} color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>{item.message}</Text>
          {isFiltered && (
            <Pressable
              onPress={() => { setSearchQuery(""); setSelectedCategory(null); setSelectedType(null); }}
              style={({ pressed }) => [styles.clearFilterBtn, { backgroundColor: colors.primary }, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.clearFilterBtnText}>Limpar filtros</Text>
            </Pressable>
          )}
        </View>
      );
    }

    return null;
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Agenda</Text>
        <Pressable onPress={() => refetch()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <IconSymbol name="arrow.clockwise" size={20} color={colors.primary} />
        </Pressable>
      </View>

      {/* Month navigator */}
      <View style={[styles.monthNav, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Pressable onPress={() => setSelectedYearMonth(m => addMonths(m, -1))} style={({ pressed }) => [styles.monthNavBtn, { opacity: pressed ? 0.5 : 1 }]}>
          <IconSymbol name="chevron.left" size={18} color={colors.primary} />
        </Pressable>
        <Pressable onPress={() => setSelectedYearMonth(currentYearMonth())} style={{ alignItems: "center", flex: 1 }}>
          <Text style={[styles.monthNavLabel, { color: colors.foreground }]}>{monthLabel(selectedYearMonth)}</Text>
          {selectedYearMonth !== currentYearMonth() && (
            <Text style={{ color: colors.primary, fontSize: 11, marginTop: 1 }}>toque para voltar ao atual</Text>
          )}
        </Pressable>
        <Pressable onPress={() => setSelectedYearMonth(m => addMonths(m, 1))} style={({ pressed }) => [styles.monthNavBtn, { opacity: pressed ? 0.5 : 1 }]}>
          <IconSymbol name="chevron.right" size={18} color={colors.primary} />
        </Pressable>
      </View>

      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
        <TextInput
          style={[styles.searchInput, { color: colors.foreground }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Pesquisar por nome..."
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <IconSymbol name="xmark.circle.fill" size={16} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {/* Type filter chips */}
      <View style={styles.categoryChipsWrap}>
        {([
          { label: "Todos", value: null },
          { label: "📄 Nota Fiscal", value: "invoice" as const },
          { label: "🏦 Financiamento", value: "financing" as const },
          { label: "📋 Conta Mensal", value: "bill" as const },
        ] as { label: string; value: UnifiedItem["type"] | null }[]).map(({ label, value }) => (
          <Pressable
            key={label}
            onPress={() => setSelectedType(selectedType === value ? null : value)}
            style={[styles.categoryChip, { borderColor: colors.border, backgroundColor: selectedType === value ? colors.primary : colors.surface }]}
          >
            <Text style={[styles.categoryChipText, { color: selectedType === value ? "#FFF" : colors.foreground }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Category filter chips */}
      {allCategories.length > 0 && (
        <View style={styles.categoryChipsWrap}>
          <Pressable
            onPress={() => setSelectedCategory(null)}
            style={[styles.categoryChip, { borderColor: colors.border, backgroundColor: selectedCategory === null ? colors.primary : colors.surface }]}
          >
            <Text style={[styles.categoryChipText, { color: selectedCategory === null ? "#FFF" : colors.foreground }]}>Todas</Text>
          </Pressable>
          {allCategories.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              style={[styles.categoryChip, { borderColor: colors.border, backgroundColor: selectedCategory === cat ? colors.primary : colors.surface }]}
            >
              <Text style={[styles.categoryChipText, { color: selectedCategory === cat ? "#FFF" : colors.foreground }]}>{cat}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Carregando agenda...</Text>
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item, idx) => {
            if (item.type === "summary") return "summary";
            if (item.type === "section") return `section-${item.title}`;
            if (item.type === "item") return item.data.id;
            return `empty-${idx}`;
          }}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      <MarkPaidModal
        visible={modalVisible}
        item={selectedItem}
        onClose={() => { setModalVisible(false); setSelectedItem(null); }}
        onConfirm={handleConfirmPay}
      />

      {/* Delete Confirmation Modal */}
      <Modal visible={deleteModalVisible} transparent animationType="fade" onRequestClose={() => setDeleteModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.alertBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.alertTitle, { color: colors.foreground }]}>Excluir item?</Text>
            <Text style={[styles.alertSubtitle, { color: colors.muted }]}>
              {deleteConfirmItem?.name}
              {deleteConfirmItem?.type === "invoice" ? " e todas as parcelas" : ""}
              {deleteConfirmItem?.type === "financing" ? " e todo o financiamento" : ""}
              {deleteConfirmItem?.type === "bill" ? " (conta mensal recorrente)" : ""}
            </Text>
            <Text style={[styles.alertSubtitle, { color: "#EF4444" }]}>Esta ação não pode ser desfeita.</Text>
            <View style={styles.alertActions}>
              <Pressable
                onPress={() => { setDeleteModalVisible(false); setDeleteConfirmItem(null); }}
                style={({ pressed }) => [styles.alertBtn, { borderColor: colors.border }, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.alertBtnText, { color: colors.muted }]}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmDelete}
                style={({ pressed }) => [styles.alertBtn, { backgroundColor: "#EF4444", borderColor: "#EF4444" }, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.alertBtnText, { color: "#FFF" }]}>Excluir</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Modal - redirects to respective screen for now */}
      <Modal visible={editModalVisible} transparent animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={[styles.alertBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[styles.alertTitle, { color: colors.foreground }]}>Editar</Text>
            <Text style={[styles.alertSubtitle, { color: colors.muted }]}>
              Para editar "{editItem?.name}", acesse a aba{" "}
              {editItem?.type === "invoice" ? "Notas Fiscais" : editItem?.type === "financing" ? "Financiamentos" : "Financiamentos"}
              {" "}e edite diretamente no item.
            </Text>
            <Pressable
              onPress={() => setEditModalVisible(false)}
              style={({ pressed }) => [styles.alertBtn, styles.alertBtnPrimary, { backgroundColor: colors.primary }, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.alertBtnText, { color: "#FFF" }]}>Entendido</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  monthNavBtn: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  monthNavLabel: {
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  categoryChipsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 40,
  },
  summaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 4,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  summaryLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: "700",
  },
  summaryDivider: {
    width: 1,
    height: 32,
    marginHorizontal: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionTotal: {
    fontSize: 13,
    fontWeight: "600",
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    flexDirection: "row",
  },
  typeStripe: {
    width: 4,
  },
  cardInner: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  cardLeft: {
    flex: 1,
    gap: 3,
  },
  cardRight: {
    alignItems: "flex-end",
    gap: 3,
  },
  cardActions: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  cardActionBtn: {
    padding: 4,
    borderRadius: 6,
  },
  cardSupplier: {
    fontSize: 15,
    fontWeight: "600",
  },
  cardMeta: {
    fontSize: 12,
  },
  cardAmount: {
    fontSize: 16,
    fontWeight: "700",
  },
  cardDate: {
    fontSize: 12,
  },
  cardBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  payBtnText: {
    color: "#FFF",
    fontSize: 13,
    fontWeight: "600",
  },
  unpayBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  unpayBtnText: {
    fontSize: 12,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: 16,
  },
  emptyText: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  clearFilterBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 4,
  },
  clearFilterBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  alertBox: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  alertSubtitle: {
    fontSize: 13,
    textAlign: "center",
  },
  alertAmount: {
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  alertLabel: {
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  alertInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  alertActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  alertBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
  },
  alertBtnPrimary: {
    borderWidth: 0,
  },
  alertBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
