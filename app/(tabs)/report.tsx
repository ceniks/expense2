import {
  Text,
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  Share,
  Platform,
  Alert,
  Image,
  Modal,
  ActivityIndicator,
} from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
import Svg, { Path, G } from "react-native-svg";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { usePayments, getCategoryColor, Profile, Payment } from "@/lib/payments-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Haptics from "expo-haptics";
import { exportCSV, exportXLS, exportPDF, ExportFormat, ExportProfile } from "@/lib/export-utils";
import { trpc } from "@/lib/trpc";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function getMonthLabel(year: number, month: number) {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

interface PieSlice {
  category: string;
  amount: number;
  percentage: number;
  color: string;
}

function PieChart({ slices, size = 200 }: { slices: PieSlice[]; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;

  if (slices.length === 0) return null;

  if (slices.length === 1) {
    return (
      <Svg width={size} height={size}>
        <G>
          <Path
            d={`M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z`}
            fill={slices[0].color}
          />
        </G>
      </Svg>
    );
  }

  let startAngle = -Math.PI / 2;
  const paths: { d: string; color: string }[] = [];

  for (const slice of slices) {
    const angle = (slice.percentage / 100) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    paths.push({
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: slice.color,
    });

    startAngle = endAngle;
  }

  return (
    <Svg width={size} height={size}>
      <G>
        {paths.map((p, i) => (
          <Path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth={1} />
        ))}
      </G>
    </Svg>
  );
}

// ─── Payment item inside category drill-down ─────────────────────────────────

function CategoryPaymentItem({
  payment,
  catColor,
  onDelete,
  onPress,
}: {
  payment: Payment;
  catColor: string;
  onDelete: () => void;
  onPress: () => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.paymentItem,
        { backgroundColor: colors.background, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      {payment.imageUri ? (
        <Image source={{ uri: payment.imageUri }} style={styles.thumbnail} resizeMode="cover" />
      ) : (
        <View style={[styles.thumbnailPlaceholder, { backgroundColor: catColor + "22" }]}>
          <IconSymbol name="doc.text.fill" size={18} color={catColor} />
        </View>
      )}
      <View style={styles.paymentInfo}>
        <Text style={[styles.paymentDesc, { color: colors.foreground }]} numberOfLines={1}>
          {payment.description}
        </Text>
        <Text style={[styles.paymentDate, { color: colors.muted }]}>{formatDate(payment.date)}</Text>
      </View>
      <Text style={[styles.paymentAmount, { color: colors.foreground }]}>
        {formatCurrency(payment.amount)}
      </Text>
      <Pressable
        onPress={onDelete}
        style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.6 : 1 }]}
        hitSlop={8}
      >
        <IconSymbol name="trash.fill" size={16} color={colors.error} />
      </Pressable>
    </Pressable>
  );
}

// ─── Category row with expandable payment list ────────────────────────────────

function CategoryRow({
  slice,
  payments,
  onDeletePayment,
  onPressPayment,
}: {
  slice: PieSlice;
  payments: Payment[];
  onDeletePayment: (id: string) => void;
  onPressPayment: (id: string) => void;
}) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  function handleToggle() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded((v) => !v);
  }

  return (
    <View>
      {/* Category header row */}
      <Pressable
        onPress={handleToggle}
        style={({ pressed }) => [
          styles.categoryRow,
          { borderBottomColor: colors.border, backgroundColor: expanded ? colors.surface : "transparent", opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <View style={[styles.categoryDot, { backgroundColor: slice.color }]} />
        <Text style={[styles.categoryName, { color: colors.foreground }]}>{slice.category}</Text>
        <View style={styles.categoryRight}>
          <Text style={[styles.categoryAmount, { color: colors.foreground }]}>
            {formatCurrency(slice.amount)}
          </Text>
          <Text style={[styles.categoryPercent, { color: colors.muted }]}>
            {slice.percentage.toFixed(1)}% · {payments.length} item{payments.length !== 1 ? "s" : ""}
          </Text>
        </View>
        <IconSymbol
          name={expanded ? "chevron.left" : "chevron.right"}
          size={16}
          color={colors.muted}
          style={{ marginLeft: 4, transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}
        />
      </Pressable>

      {/* Expanded payments list */}
      {expanded && (
        <View style={[styles.expandedContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {payments.map((p) => (
            <CategoryPaymentItem
              key={p.id}
              payment={p}
              catColor={slice.color}
              onPress={() => onPressPayment(p.id)}
              onDelete={() => onDeletePayment(p.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ReportScreen() {
  const colors = useColors();
  const router = useRouter();
  const { payments: allPayments, getMonthPayments, getMonthTotal, categories, deletePayment } = usePayments();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [activeProfile, setActiveProfile] = useState<Profile | "all">("all");
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  const payments = getMonthPayments(year, month, activeProfile);
  const total = getMonthTotal(year, month, activeProfile);

  // Relatório por conta — mês selecionado
  const startDate = `${year}-${String(month).padStart(2,"0")}-01`;
  const endDate = `${year}-${String(month).padStart(2,"0")}-${new Date(year, month, 0).getDate()}`;
  const { data: byAccount = [] } = trpc.payments.byBankAccount.useQuery({ startDate, endDate });
  const backfillMut = trpc.payments.backfillBankAccounts.useMutation({
    onSuccess: (count) => Alert.alert("Backfill concluído", `${count} lançamento(s) vinculado(s) às contas.`),
  });

  // Group by category
  const categoryPaymentsMap: Record<string, Payment[]> = {};
  for (const p of payments) {
    if (!categoryPaymentsMap[p.category]) categoryPaymentsMap[p.category] = [];
    categoryPaymentsMap[p.category].push(p);
  }

  const categoryTotals: Record<string, number> = {};
  for (const [cat, ps] of Object.entries(categoryPaymentsMap)) {
    categoryTotals[cat] = ps.reduce((s, p) => s + p.amount, 0);
  }

  const slices: PieSlice[] = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, amount]) => ({
      category: cat,
      amount,
      percentage: total > 0 ? (amount / total) * 100 : 0,
      color: getCategoryColor(categories, cat),
    }));

  function prevMonth() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextIsAfterNow = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
    if (nextIsAfterNow) return;
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  async function handleShare() {
    const profileLabel = activeProfile === "all" ? "Todos" : activeProfile;
    const lines = [
      `📊 Relatório de Gastos — ${getMonthLabel(year, month)} (${profileLabel})`,
      `Total: ${formatCurrency(total)}`,
      "",
      "Por categoria:",
      ...slices.map(s => `• ${s.category}: ${formatCurrency(s.amount)} (${s.percentage.toFixed(1)}%)`),
      "",
      `${payments.length} pagamento${payments.length !== 1 ? "s" : ""} registrado${payments.length !== 1 ? "s" : ""}`,
    ];
    await Share.share({ message: lines.join("\n") });
  }

  async function handleExport(format: ExportFormat, exportProfile: ExportProfile, allMonths: boolean) {
    setExporting(true);
    try {
      const y = allMonths ? undefined : year;
      const m = allMonths ? undefined : month;
      if (format === "csv") {
        await exportCSV(allPayments, exportProfile, y, m);
      } else if (format === "xls") {
        await exportXLS(allPayments, exportProfile, y, m);
      } else {
        await exportPDF(allPayments, categories, exportProfile, y, m);
      }
      setShowExportModal(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Não foi possível exportar.";
      Alert.alert("Erro ao exportar", msg);
    } finally {
      setExporting(false);
    }
  }

  function handleDeletePayment(id: string) {
    Alert.alert(
      "Excluir pagamento",
      "Tem certeza que deseja excluir este pagamento?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            await deletePayment(id);
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }

  const isNextDisabled = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);

  const profileOptions: { key: Profile | "all"; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "Pessoal", label: "Pessoal" },
    { key: "Empresa", label: "Empresa" },
  ];

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Relatório Mensal</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable onPress={() => setShowExportModal(true)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <IconSymbol name="arrow.down.doc.fill" size={22} color={colors.primary} />
            </Pressable>
            <Pressable onPress={handleShare} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <IconSymbol name="square.and.arrow.up" size={22} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        {/* Export Modal */}
        <Modal
          visible={showExportModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowExportModal(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => !exporting && setShowExportModal(false)}
          >
            <Pressable style={[styles.modalSheet, { backgroundColor: colors.background }]}>
              <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Exportar Dados</Text>
              <Text style={[styles.modalSubtitle, { color: colors.muted }]}>
                Escolha o formato e o período para exportar todos os seus lançamentos.
              </Text>

              {exporting ? (
                <View style={styles.exportingState}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.exportingText, { color: colors.muted }]}>Gerando arquivo...</Text>
                </View>
              ) : (
                <>
                  {/* Format options */}
                  <Text style={[styles.modalSectionLabel, { color: colors.muted }]}>FORMATO</Text>
                  <View style={styles.exportGrid}>
                    {([
                      { format: "csv" as ExportFormat, icon: "doc.text.fill", label: "CSV", desc: "Planilha simples" },
                      { format: "xls" as ExportFormat, icon: "tablecells.fill", label: "Excel", desc: "Planilha Excel (.xlsx)" },
                      { format: "pdf" as ExportFormat, icon: "doc.richtext.fill", label: "PDF", desc: "Relatório formatado" },
                    ]).map((opt) => (
                      <View key={opt.format} style={{ gap: 8 }}>
                        <Text style={[styles.exportFormatLabel, { color: colors.foreground }]}>{opt.label}</Text>
                        <Text style={[styles.exportFormatDesc, { color: colors.muted }]}>{opt.desc}</Text>
                        {/* Period sub-options */}
                        <View style={{ gap: 6 }}>
                          <Pressable
                            onPress={() => handleExport(opt.format, activeProfile === "all" ? "Todos" : activeProfile, false)}
                            style={({ pressed }) => [styles.exportBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                          >
                            <IconSymbol name={opt.icon as any} size={16} color="#FFFFFF" />
                            <Text style={styles.exportBtnText}>Mês atual</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => handleExport(opt.format, activeProfile === "all" ? "Todos" : activeProfile, true)}
                            style={({ pressed }) => [styles.exportBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                          >
                            <IconSymbol name={opt.icon as any} size={16} color={colors.primary} />
                            <Text style={[styles.exportBtnText, { color: colors.primary }]}>Todos os meses</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>

                  <Pressable
                    onPress={() => setShowExportModal(false)}
                    style={({ pressed }) => [styles.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Text style={[styles.cancelBtnText, { color: colors.muted }]}>Cancelar</Text>
                  </Pressable>
                </>
              )}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Profile filter */}
        <View style={[styles.profileFilterRow, { borderBottomColor: colors.border }]}>
          {profileOptions.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => setActiveProfile(opt.key)}
              style={({ pressed }) => [
                styles.profileFilterChip,
                {
                  backgroundColor: activeProfile === opt.key ? colors.primary : colors.surface,
                  borderColor: activeProfile === opt.key ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Text style={[styles.profileFilterText, { color: activeProfile === opt.key ? "#FFFFFF" : colors.muted }]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Month selector */}
        <View style={[styles.monthSelector, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable onPress={prevMonth} style={({ pressed }) => [styles.arrowBtn, { opacity: pressed ? 0.5 : 1 }]}>
            <IconSymbol name="chevron.left" size={22} color={colors.primary} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.foreground }]}>
            {getMonthLabel(year, month)}
          </Text>
          <Pressable
            onPress={nextMonth}
            disabled={isNextDisabled}
            style={({ pressed }) => [styles.arrowBtn, { opacity: pressed || isNextDisabled ? 0.3 : 1 }]}
          >
            <IconSymbol name="chevron.right" size={22} color={colors.primary} />
          </Pressable>
        </View>

        {/* Total card */}
        <View style={[styles.totalCard, { backgroundColor: colors.primary }]}>
          <Text style={styles.totalLabel}>Total do mês</Text>
          <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
          <Text style={styles.totalCount}>{payments.length} pagamento{payments.length !== 1 ? "s" : ""}</Text>
        </View>

        {payments.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol name="chart.pie.fill" size={48} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sem pagamentos</Text>
            <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
              Nenhum pagamento registrado neste mês.
            </Text>
          </View>
        ) : (
          <>
            {/* Pie chart */}
            <View style={styles.chartContainer}>
              <PieChart slices={slices} size={220} />
            </View>

            {/* Category breakdown with drill-down */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Por categoria — toque para ver detalhes
              </Text>
              {slices.map((slice) => (
                <CategoryRow
                  key={slice.category}
                  slice={slice}
                  payments={categoryPaymentsMap[slice.category] ?? []}
                  onDeletePayment={handleDeletePayment}
                  onPressPayment={(id) =>
                    router.push({ pathname: "/(payment)/[id]" as any, params: { id } })
                  }
                />
              ))}
            </View>

            {/* Por conta bancária */}
            <View style={styles.section}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Por conta bancária</Text>
                <Pressable
                  onPress={() => backfillMut.mutate()}
                  disabled={backfillMut.isPending}
                  style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: colors.border, opacity: pressed || backfillMut.isPending ? 0.5 : 1 })}
                >
                  <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>
                    {backfillMut.isPending ? "Atualizando..." : "Atualizar histórico"}
                  </Text>
                </Pressable>
              </View>
              {byAccount.length === 0 ? (
                <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center", paddingVertical: 12 }}>
                  Nenhum lançamento de extrato neste mês.
                </Text>
              ) : (
                byAccount.map((acc) => (
                  <View key={acc.bankAccountId ?? "manual"} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: acc.accountColor }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14 }}>{acc.accountName}</Text>
                      {acc.accountBank && <Text style={{ color: colors.muted, fontSize: 12 }}>{acc.accountBank} · {acc.count} lançamento{acc.count !== 1 ? "s" : ""}</Text>}
                    </View>
                    <Text style={{ color: colors.error, fontWeight: "700", fontSize: 15 }}>
                      {formatCurrency(acc.total)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  profileFilterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  profileFilterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  profileFilterText: {
    fontSize: 13,
    fontWeight: "600",
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    margin: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  arrowBtn: {
    padding: 10,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  totalCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    gap: 4,
  },
  totalLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  totalValue: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -1,
  },
  totalCount: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
  },
  chartContainer: {
    alignItems: "center",
    paddingVertical: 24,
  },
  section: {
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 12,
  },
  // Category row
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 1,
    gap: 10,
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  categoryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
  },
  categoryName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  categoryRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  categoryAmount: {
    fontSize: 15,
    fontWeight: "700",
  },
  categoryPercent: {
    fontSize: 12,
  },
  // Expanded container
  expandedContainer: {
    marginHorizontal: 0,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  // Payment item inside expanded
  paymentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  thumbnailPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  paymentInfo: {
    flex: 1,
    gap: 3,
  },
  paymentDesc: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 18,
  },
  paymentDate: {
    fontSize: 12,
  },
  paymentAmount: {
    fontSize: 14,
    fontWeight: "700",
  },
  deleteBtn: {
    padding: 6,
  },
  // Modal de exportação
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    gap: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginTop: -8,
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: -8,
  },
  exportGrid: {
    gap: 20,
  },
  exportFormatLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  exportFormatDesc: {
    fontSize: 12,
    marginTop: -6,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  exportBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  exportingState: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 16,
  },
  exportingText: {
    fontSize: 14,
  },
  // Empty
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
});
