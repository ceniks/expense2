import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: string | number) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function progressColor(pct: number) {
  if (pct >= 1) return "#22C55E";
  if (pct >= 0.6) return "#3B82F6";
  if (pct >= 0.3) return "#F59E0B";
  return "#EF4444";
}

const FALLBACK_CATEGORIES = [
  "Imóvel", "Veículo", "Educação", "Saúde", "Eletrônicos",
  "Móveis", "Energia", "Água", "Condomínio", "Internet",
  "Telefone", "Cartão de Crédito", "Streaming", "Seguro", "Outros",
];

// ─── Financing Form ────────────────────────────────────────────────────────────

interface FinancingFormData {
  name: string;
  installmentAmount: string;
  totalInstallments: string;
  paidInstallments: string;
  dueDay: string;
  category: string;
  profile: "Pessoal" | "Empresa";
  notes: string;
}

const emptyFinancingForm = (): FinancingFormData => ({
  name: "",
  installmentAmount: "",
  totalInstallments: "",
  paidInstallments: "0",
  dueDay: "10",
  category: "Imóvel",
  profile: "Pessoal",
  notes: "",
});

// ─── Monthly Bill Form ─────────────────────────────────────────────────────────

interface BillFormData {
  name: string;
  amount: string;
  dueDay: string;
  category: string;
  profile: "Pessoal" | "Empresa";
  notes: string;
}

const emptyBillForm = (): BillFormData => ({
  name: "",
  amount: "",
  dueDay: "10",
  category: "Energia",
  profile: "Pessoal",
  notes: "",
});

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function FinancingsScreen() {
  const colors = useColors();
  const [tab, setTab] = useState<"financings" | "bills">("financings");

  // ── Financing queries ──
  const { data: financings = [], refetch: refetchFinancings, isLoading: loadingFin } =
    trpc.financings.list.useQuery();
  const createFinancing = trpc.financings.create.useMutation({ onSuccess: () => refetchFinancings() });
  const updateFinancing = trpc.financings.update.useMutation({ onSuccess: () => refetchFinancings() });
  const registerPayment = trpc.financings.registerPayment.useMutation({ onSuccess: () => refetchFinancings() });
  const deleteFinancing = trpc.financings.delete.useMutation({ onSuccess: () => refetchFinancings() });

  // ── Monthly bill queries ──
  const { data: bills = [], refetch: refetchBills, isLoading: loadingBills } =
    trpc.monthlyBills.list.useQuery();

  // ── Dynamic categories ──
  const { data: categoriesData = [], refetch: refetchCategories } = trpc.categories.list.useQuery(
    undefined,
    { staleTime: 0 }
  );
  const CATEGORIES = categoriesData.length > 0
    ? categoriesData.map((c: any) => c.name)
    : FALLBACK_CATEGORIES;
  const createBill = trpc.monthlyBills.create.useMutation({ onSuccess: () => refetchBills() });
  const updateBill = trpc.monthlyBills.update.useMutation({ onSuccess: () => refetchBills() });
  const payBill = trpc.monthlyBills.pay.useMutation({ onSuccess: () => refetchBills() });
  const unpayBill = trpc.monthlyBills.unpay.useMutation({ onSuccess: () => refetchBills() });
  const deleteBill = trpc.monthlyBills.delete.useMutation({ onSuccess: () => refetchBills() });

  // ── Financing modal state ──
  const [finModal, setFinModal] = useState(false);
  const [editingFin, setEditingFin] = useState<number | null>(null);
  const [finForm, setFinForm] = useState<FinancingFormData>(emptyFinancingForm());

  // ── Bill modal state ──
  const [billModal, setBillModal] = useState(false);
  const [editingBill, setEditingBill] = useState<number | null>(null);
  const [billForm, setBillForm] = useState<BillFormData>(emptyBillForm());

  // ── Delete confirm modal ──
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "fin" | "bill"; id: number; name: string } | null>(null);

  // ── Financing handlers ──
  function openNewFin() {
    setEditingFin(null);
    setFinForm(emptyFinancingForm());
    refetchCategories();
    setFinModal(true);
  }

  function openEditFin(item: any) {
    setEditingFin(item.id);
    setFinForm({
      name: item.name,
      installmentAmount: item.installmentAmount,
      totalInstallments: String(item.totalInstallments),
      paidInstallments: String(item.paidInstallments),
      dueDay: String(item.dueDay),
      category: item.category,
      profile: item.profile,
      notes: item.notes ?? "",
    });
    setFinModal(true);
  }

  function saveFin() {
    const installmentAmt = parseFloat(finForm.installmentAmount) || 0;
    const totalInst = parseInt(finForm.totalInstallments) || 1;
    const data = {
      name: finForm.name.trim(),
      totalAmount: installmentAmt * totalInst,
      installmentAmount: installmentAmt,
      totalInstallments: totalInst,
      paidInstallments: parseInt(finForm.paidInstallments) || 0,
      startDate: new Date().toISOString().slice(0, 10), // data de cadastro, não usada para cálculo de parcelas
      dueDay: parseInt(finForm.dueDay) || 10,
      category: finForm.category,
      profile: finForm.profile,
      notes: finForm.notes.trim() || null,
    };
    if (!data.name) return;
    if (editingFin !== null) {
      updateFinancing.mutate({ id: editingFin, ...data });
    } else {
      createFinancing.mutate(data);
    }
    setFinModal(false);
  }

  function confirmDeleteFin(id: number, name: string) {
    setDeleteConfirm({ type: "fin", id, name });
  }

  // ── Bill handlers ──
  function openNewBill() {
    setEditingBill(null);
    setBillForm(emptyBillForm());
    refetchCategories();
    setBillModal(true);
  }

  function openEditBill(item: any) {
    setEditingBill(item.id);
    setBillForm({
      name: item.name,
      amount: item.amount,
      dueDay: String(item.dueDay),
      category: item.category,
      profile: item.profile,
      notes: item.notes ?? "",
    });
    setBillModal(true);
  }

  function saveBill() {
    const data = {
      name: billForm.name.trim(),
      amount: parseFloat(billForm.amount) || 0,
      dueDay: parseInt(billForm.dueDay) || 10,
      category: billForm.category,
      profile: billForm.profile,
      notes: billForm.notes.trim() || null,
    };
    if (!data.name) return;
    if (editingBill !== null) {
      updateBill.mutate({ id: editingBill, ...data });
    } else {
      createBill.mutate(data);
    }
    setBillModal(false);
  }

  function toggleBillPaid(bill: any) {
    const now = new Date();
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (bill.paidThisMonth) {
      unpayBill.mutate({ id: bill.id, yearMonth });
    } else {
      payBill.mutate({ id: bill.id, yearMonth });
    }
  }

  function confirmDeleteBill(id: number, name: string) {
    setDeleteConfirm({ type: "bill", id, name });
  }

  function executeDelete() {
    if (!deleteConfirm) return;
    if (deleteConfirm.type === "fin") {
      deleteFinancing.mutate({ id: deleteConfirm.id });
    } else {
      deleteBill.mutate({ id: deleteConfirm.id });
    }
    setDeleteConfirm(null);
  }

  const s = styles(colors);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Compromissos</Text>
        <TouchableOpacity
          style={s.addBtn}
          onPress={tab === "financings" ? openNewFin : openNewBill}
          activeOpacity={0.8}
        >
          <IconSymbol name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={s.tabRow}>
        <TouchableOpacity
          style={[s.tabBtn, tab === "financings" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setTab("financings")}
          activeOpacity={0.8}
        >
          <Text style={[s.tabLabel, { color: tab === "financings" ? colors.primary : colors.muted }]}>
            Financiamentos
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tabBtn, tab === "bills" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          onPress={() => setTab("bills")}
          activeOpacity={0.8}
        >
          <Text style={[s.tabLabel, { color: tab === "bills" ? colors.primary : colors.muted }]}>
            Contas Mensais
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {tab === "financings" ? (
        loadingFin ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <FlatList
            data={financings}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={s.list}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyIcon}>🏦</Text>
                <Text style={s.emptyText}>Nenhum financiamento cadastrado</Text>
                <Text style={s.emptyHint}>Toque em + para adicionar</Text>
              </View>
            }
            renderItem={({ item }) => {
                  const total = item.totalInstallments;
              const paid = item.paidInstallments;
              const remaining = total - paid;
              const pct = total > 0 ? paid / total : 0;
              const installAmt = parseFloat(item.installmentAmount);
              const paidAmount = paid * installAmt;
              const remainingAmount = remaining * installAmt;
              const totalFinanced = total * installAmt;
              const color = progressColor(pct);
              return (
                <View style={[s.card, { borderLeftColor: color, borderLeftWidth: 4 }]}>
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitle}>{item.name}</Text>
                      <Text style={s.cardSub}>{item.category} · Vence dia {item.dueDay}</Text>
                    </View>
                    <View style={s.cardActions}>
                      <TouchableOpacity onPress={() => openEditFin(item)} style={s.iconBtn} activeOpacity={0.7}>
                        <IconSymbol name="pencil" size={16} color={colors.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmDeleteFin(item.id, item.name)} style={s.iconBtn} activeOpacity={0.7}>
                        <IconSymbol name="trash.fill" size={16} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Progress bar */}
                  <View style={s.progressBg}>
                    <View style={[s.progressFill, { width: `${Math.round(pct * 100)}%` as any, backgroundColor: color }]} />
                  </View>
                  <Text style={[s.progressLabel, { color }]}>
                    {paid}/{total} parcelas pagas ({Math.round(pct * 100)}%)
                  </Text>

                  {/* Amounts grid */}
                  <View style={s.amountGrid}>
                    <View style={s.amountCell}>
                      <Text style={s.amountLabel}>Parcela</Text>
                      <Text style={s.amountValue}>{fmt(item.installmentAmount)}</Text>
                    </View>
                    <View style={s.amountCell}>
                      <Text style={s.amountLabel}>Total pago</Text>
                      <Text style={[s.amountValue, { color: "#22C55E" }]}>{fmt(paidAmount)}</Text>
                    </View>
                    <View style={s.amountCell}>
                      <Text style={s.amountLabel}>Saldo devedor</Text>
                      <Text style={[s.amountValue, { color: colors.error }]}>{fmt(remainingAmount)}</Text>
                    </View>
                    <View style={s.amountCell}>
                      <Text style={s.amountLabel}>Total financiado</Text>
                      <Text style={s.amountValue}>{fmt(totalFinanced)}</Text>
                    </View>
                  </View>

                  {/* Register payment button */}
                  {remaining > 0 && (
                    <TouchableOpacity
                      style={[s.payBtn, { backgroundColor: color + "20", borderColor: color }]}
                      onPress={() => registerPayment.mutate({ id: item.id })}
                      activeOpacity={0.8}
                    >
                      <IconSymbol name="checkmark" size={14} color={color} />
                      <Text style={[s.payBtnText, { color }]}>Registrar pagamento da parcela</Text>
                    </TouchableOpacity>
                  )}
                  {remaining === 0 && (
                    <View style={[s.payBtn, { backgroundColor: "#22C55E20", borderColor: "#22C55E" }]}>
                      <IconSymbol name="checkmark.circle.fill" size={14} color="#22C55E" />
                      <Text style={[s.payBtnText, { color: "#22C55E" }]}>Financiamento quitado!</Text>
                    </View>
                  )}
                </View>
              );
            }}
          />
        )
      ) : (
        loadingBills ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : (
          <FlatList
            data={bills}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={s.list}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={s.emptyIcon}>📋</Text>
                <Text style={s.emptyText}>Nenhuma conta mensal cadastrada</Text>
                <Text style={s.emptyHint}>Toque em + para adicionar</Text>
              </View>
            }
            renderItem={({ item }) => {
              const now = new Date();
              const daysUntilDue = item.dueDay - now.getDate();
              const isOverdue = !item.paidThisMonth && daysUntilDue < 0;
              const isDueSoon = !item.paidThisMonth && daysUntilDue >= 0 && daysUntilDue <= 3;
              const statusColor = item.paidThisMonth ? "#22C55E" : isOverdue ? colors.error : isDueSoon ? "#F59E0B" : colors.muted;
              return (
                <View style={[s.card, { borderLeftColor: statusColor, borderLeftWidth: 4 }]}>
                  <View style={s.cardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitle}>{item.name}</Text>
                      <Text style={s.cardSub}>
                        {item.category} · Vence dia {item.dueDay}
                        {isOverdue && " · Vencida"}
                        {isDueSoon && ` · Vence em ${daysUntilDue}d`}
                      </Text>
                    </View>
                    <View style={s.cardActions}>
                      <TouchableOpacity onPress={() => openEditBill(item)} style={s.iconBtn} activeOpacity={0.7}>
                        <IconSymbol name="pencil" size={16} color={colors.muted} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmDeleteBill(item.id, item.name)} style={s.iconBtn} activeOpacity={0.7}>
                        <IconSymbol name="trash.fill" size={16} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={s.billRow}>
                    <Text style={s.billAmount}>{fmt(item.amount)}</Text>
                    <TouchableOpacity
                      style={[
                        s.billToggle,
                        { backgroundColor: item.paidThisMonth ? "#22C55E" : colors.surface, borderColor: item.paidThisMonth ? "#22C55E" : colors.border },
                      ]}
                      onPress={() => toggleBillPaid(item)}
                      activeOpacity={0.8}
                    >
                      {item.paidThisMonth ? (
                        <>
                          <IconSymbol name="checkmark" size={14} color="#fff" />
                          <Text style={[s.billToggleText, { color: "#fff" }]}>Pago</Text>
                        </>
                      ) : (
                        <Text style={[s.billToggleText, { color: colors.muted }]}>Marcar como pago</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )
      )}

      {/* ── Delete Confirm Modal ── */}
      <Modal visible={!!deleteConfirm} transparent animationType="fade" onRequestClose={() => setDeleteConfirm(null)}>
        <View style={s.deleteOverlay}>
          <View style={[s.deleteBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <Text style={[s.deleteTitle, { color: colors.foreground }]}>
              {deleteConfirm?.type === "fin" ? "Excluir Financiamento" : "Excluir Conta Mensal"}
            </Text>
            <Text style={[s.deleteMsg, { color: colors.muted }]}>
              Tem certeza que deseja excluir "{deleteConfirm?.name}"? Esta ação não pode ser desfeita.
            </Text>
            <View style={s.deleteBtns}>
              <TouchableOpacity
                style={[s.deleteCancelBtn, { borderColor: colors.border }]}
                onPress={() => setDeleteConfirm(null)}
                activeOpacity={0.8}
              >
                <Text style={[s.deleteCancelText, { color: colors.foreground }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.deleteConfirmBtn}
                onPress={executeDelete}
                activeOpacity={0.8}
              >
                <Text style={s.deleteConfirmText}>Excluir</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Financing Modal ── */}
      <Modal visible={finModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFinModal(false)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingFin !== null ? "Editar Financiamento" : "Novo Financiamento"}</Text>
            <TouchableOpacity onPress={() => setFinModal(false)} activeOpacity={0.7}>
              <IconSymbol name="xmark.circle.fill" size={26} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalBody}>
            <Text style={s.fieldLabel}>Nome do financiamento *</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Ex: Apartamento, Carro..."
              placeholderTextColor={colors.muted}
              value={finForm.name}
              onChangeText={(v) => setFinForm({ ...finForm, name: v })}
            />

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Valor da parcela (R$) *</Text>
                <TextInput
                  style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder="0,00"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  value={finForm.installmentAmount}
                  onChangeText={(v) => setFinForm({ ...finForm, installmentAmount: v })}
                />
              </View>
            </View>

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Total de parcelas *</Text>
                <TextInput
                  style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder="Ex: 240"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  value={finForm.totalInstallments}
                  onChangeText={(v) => setFinForm({ ...finForm, totalInstallments: v })}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Parcelas já pagas</Text>
                <TextInput
                  style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  value={finForm.paidInstallments}
                  onChangeText={(v) => setFinForm({ ...finForm, paidInstallments: v })}
                />
              </View>
            </View>

            <Text style={s.fieldLabel}>Dia de vencimento</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Ex: 10 (dia do mês em que vence)"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              value={finForm.dueDay}
              onChangeText={(v) => setFinForm({ ...finForm, dueDay: v })}
            />

            <Text style={s.fieldLabel}>Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {CATEGORIES.map((cat: string) => (
                  <TouchableOpacity
                    key={cat}
                    style={[s.chip, finForm.category === cat && { backgroundColor: colors.primary }]}
                    onPress={() => setFinForm({ ...finForm, category: cat })}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.chipText, { color: finForm.category === cat ? "#fff" : colors.muted }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.fieldLabel}>Perfil</Text>
            <View style={s.row}>
              {(["Pessoal", "Empresa"] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[s.chip, finForm.profile === p && { backgroundColor: colors.primary }]}
                  onPress={() => setFinForm({ ...finForm, profile: p })}
                  activeOpacity={0.8}
                >
                  <Text style={[s.chipText, { color: finForm.profile === p ? "#fff" : colors.muted }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Observações</Text>
            <TextInput
              style={[s.input, s.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Opcional..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              value={finForm.notes}
              onChangeText={(v) => setFinForm({ ...finForm, notes: v })}
            />

            <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={saveFin} activeOpacity={0.85}>
              <Text style={s.saveBtnText}>Salvar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Bill Modal ── */}
      <Modal visible={billModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBillModal(false)}>
        <View style={[s.modal, { backgroundColor: colors.background }]}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{editingBill !== null ? "Editar Conta" : "Nova Conta Mensal"}</Text>
            <TouchableOpacity onPress={() => setBillModal(false)} activeOpacity={0.7}>
              <IconSymbol name="xmark.circle.fill" size={26} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.modalBody}>
            <Text style={s.fieldLabel}>Nome da conta *</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Ex: Luz, Água, Condomínio..."
              placeholderTextColor={colors.muted}
              value={billForm.name}
              onChangeText={(v) => setBillForm({ ...billForm, name: v })}
            />

            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Valor mensal (R$) *</Text>
                <TextInput
                  style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder="0,00"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  value={billForm.amount}
                  onChangeText={(v) => setBillForm({ ...billForm, amount: v })}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Dia de vencimento</Text>
                <TextInput
                  style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
                  placeholder="Ex: 10"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  value={billForm.dueDay}
                  onChangeText={(v) => setBillForm({ ...billForm, dueDay: v })}
                />
              </View>
            </View>

            <Text style={s.fieldLabel}>Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {CATEGORIES.map((cat: string) => (
                  <TouchableOpacity
                    key={cat}
                    style={[s.chip, billForm.category === cat && { backgroundColor: colors.primary }]}
                    onPress={() => setBillForm({ ...billForm, category: cat })}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.chipText, { color: billForm.category === cat ? "#fff" : colors.muted }]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={s.fieldLabel}>Perfil</Text>
            <View style={s.row}>
              {(["Pessoal", "Empresa"] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[s.chip, billForm.profile === p && { backgroundColor: colors.primary }]}
                  onPress={() => setBillForm({ ...billForm, profile: p })}
                  activeOpacity={0.8}
                >
                  <Text style={[s.chipText, { color: billForm.profile === p ? "#fff" : colors.muted }]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.fieldLabel}>Observações</Text>
            <TextInput
              style={[s.input, s.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface }]}
              placeholder="Opcional..."
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              value={billForm.notes}
              onChangeText={(v) => setBillForm({ ...billForm, notes: v })}
            />

            <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={saveBill} activeOpacity={0.85}>
              <Text style={s.saveBtnText}>Salvar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 8,
    },
    headerTitle: { fontSize: 24, fontWeight: "800", color: colors.foreground },
    addBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    tabRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginHorizontal: 20,
      marginBottom: 8,
    },
    tabBtn: { flex: 1, paddingVertical: 10, alignItems: "center" },
    tabLabel: { fontSize: 14, fontWeight: "600" },
    list: { padding: 16, gap: 12 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      gap: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    cardHeader: { flexDirection: "row", alignItems: "flex-start" },
    cardTitle: { fontSize: 15, fontWeight: "700", color: colors.foreground },
    cardSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
    cardActions: { flexDirection: "row", gap: 8, marginLeft: 8 },
    iconBtn: { padding: 4 },
    progressBg: { height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" },
    progressFill: { height: 6, borderRadius: 3 },
    progressLabel: { fontSize: 12, fontWeight: "600" },
    amountGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    amountCell: { flex: 1, minWidth: "45%" },
    amountLabel: { fontSize: 11, color: colors.muted },
    amountValue: { fontSize: 14, fontWeight: "700", color: colors.foreground },
    payBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
    },
    payBtnText: { fontSize: 13, fontWeight: "600" },
    billRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    billAmount: { fontSize: 20, fontWeight: "800", color: colors.foreground },
    billToggle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
    },
    billToggleText: { fontSize: 13, fontWeight: "600" },
    empty: { alignItems: "center", paddingTop: 60, gap: 8 },
    emptyIcon: { fontSize: 40 },
    emptyText: { fontSize: 16, fontWeight: "600", color: colors.foreground },
    emptyHint: { fontSize: 13, color: colors.muted },
    modal: { flex: 1 },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 18, fontWeight: "700", color: colors.foreground },
    modalBody: { padding: 20, gap: 4, paddingBottom: 40 },
    fieldLabel: { fontSize: 13, fontWeight: "600", color: colors.muted, marginBottom: 6, marginTop: 8 },
    input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15 },
    textarea: { height: 80, textAlignVertical: "top" },
    row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipText: { fontSize: 13, fontWeight: "500" },
    saveBtn: { marginTop: 20, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
    saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    deleteOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    deleteBox: {
      width: "100%",
      maxWidth: 360,
      borderRadius: 16,
      borderWidth: 1,
      padding: 24,
      gap: 12,
    },
    deleteTitle: { fontSize: 18, fontWeight: "700" },
    deleteMsg: { fontSize: 14, lineHeight: 20 },
    deleteBtns: { flexDirection: "row", gap: 12, marginTop: 4 },
    deleteCancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: "center",
    },
    deleteCancelText: { fontSize: 15, fontWeight: "600" },
    deleteConfirmBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: "#EF4444",
      alignItems: "center",
    },
    deleteConfirmText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  });
}
