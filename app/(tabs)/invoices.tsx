import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from "react-native";
import { useState, useEffect } from "react";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { DateInput } from "@/components/ui/date-input";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuth } from "@/hooks/use-auth";
import { usePayments } from "@/lib/payments-context";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Installment {
  id: number;
  invoiceId: number;
  installmentNumber: number;
  amount: string;
  dueDate: string;
  paidAt: string | null;
  paymentId: number | null;
  alreadyPaid?: number | boolean; // 1/true = was paid before registration
}

interface Invoice {
  id: number;
  supplierName: string;
  totalAmount: string;
  issueDate: string;
  description: string | null;
  imageUrl: string | null;
  profile: "Pessoal" | "Empresa";
  category: string;
  totalInstallments: number;
  installments: Installment[];
  createdAt?: string | Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1 + months, d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Convert ISO date (YYYY-MM-DD) to Brazilian display format (DD/MM/AAAA) */
function isoToBr(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Convert Brazilian input (DD/MM/AAAA) to ISO (YYYY-MM-DD) for storage */
function brToIso(br: string): string {
  if (!br) return "";
  // Accept both DD/MM/AAAA and YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(br)) return br;
  const parts = br.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    if (d && m && y && y.length === 4) return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return br;
}

/** Today in Brazilian format DD/MM/AAAA */
function todayBr(): string {
  return isoToBr(today());
}

// ─── Review Modal ─────────────────────────────────────────────────────────────

interface AIInstallment {
  number: number;
  amount: number;
  dueDate: string;
}

interface ReviewModalProps {
  visible: boolean;
  imageUrl: string;
  initial: {
    supplierName: string;
    totalAmount: number;
    issueDate: string;
    description: string;
    suggestedInstallments: number;
    installments?: AIInstallment[];
    category: string;
  };
  onClose: () => void;
  onConfirm: (data: {
    supplierName: string;
    totalAmount: number;
    issueDate: string;
    description: string;
    category: string;
    profile: "Pessoal" | "Empresa";
    installments: Array<{ installmentNumber: number; amount: number; dueDate: string }>;
  }) => Promise<void>;
}

function ReviewModal({ visible, imageUrl, initial, onClose, onConfirm }: ReviewModalProps) {
  const colors = useColors();
  const { categories: dbCategories } = usePayments();
  const [supplierName, setSupplierName] = useState(initial.supplierName);
  const [totalAmount, setTotalAmount] = useState(String(initial.totalAmount ?? ""));
  const [issueDate, setIssueDate] = useState(isoToBr(initial.issueDate ?? today()));
  const [description, setDescription] = useState(initial.description ?? "");
  const [category, setCategory] = useState(initial.category ?? dbCategories[0]?.name ?? "Outros");
  const [profile, setProfile] = useState<"Pessoal" | "Empresa">("Empresa");
  const [saving, setSaving] = useState(false);

  // Mode: "ai" = use real installments from AI; "manual" = user picks count
  const hasAiInstallments = (initial.installments?.length ?? 0) > 0;
  const [useAiInstallments, setUseAiInstallments] = useState(hasAiInstallments);
  const [numInstallments, setNumInstallments] = useState(hasAiInstallments ? (initial.installments?.length ?? 3) : (initial.suggestedInstallments ?? 3));

  // AI installments: each row has its own amount and dueDate
  const [aiInstallments, setAiInstallments] = useState<AIInstallment[]>(initial.installments ?? []);
  // Manual installments: shared amount, individual due dates
  const [dueDates, setDueDates] = useState<string[]>([]);

  useEffect(() => {
    if (visible) {
      setSupplierName(initial.supplierName ?? "");
      setTotalAmount(String(initial.totalAmount ?? ""));
      setIssueDate(initial.issueDate ?? today());
      setDescription(initial.description ?? "");
      setCategory(initial.category ?? "Outros");
      setProfile("Empresa");
      setSaving(false);
      const hasAI = (initial.installments?.length ?? 0) > 0;
      setUseAiInstallments(hasAI);
      setAiInstallments(initial.installments ?? []);
      setNumInstallments(hasAI ? (initial.installments?.length ?? 3) : (initial.suggestedInstallments ?? 3));
    }
  }, [visible, initial]);

  // Recalculate manual due dates when numInstallments or issueDate changes
  useEffect(() => {
    if (!useAiInstallments) {
      const base = issueDate || today();
      const dates = Array.from({ length: numInstallments }, (_, i) => addMonths(base, i + 1));
      setDueDates(dates);
    }
  }, [numInstallments, issueDate, useAiInstallments]);

  const total = parseFloat(totalAmount) || 0;
  const perInstallment = numInstallments > 0 ? total / numInstallments : 0;

  async function handleConfirm() {
    if (!supplierName.trim()) {
      Alert.alert("Campo obrigatório", "Informe o nome do fornecedor.");
      return;
    }
    if (!total || total <= 0) {
      Alert.alert("Valor inválido", "Informe o valor total da nota fiscal.");
      return;
    }
    setSaving(true);
    try {
      const installments = useAiInstallments
        ? aiInstallments.map((inst, i) => ({
            installmentNumber: inst.number ?? i + 1,
            amount: inst.amount,
            dueDate: inst.dueDate,
          }))
        : dueDates.map((dueDate, i) => ({
            installmentNumber: i + 1,
            amount: parseFloat(perInstallment.toFixed(2)),
            dueDate,
          }));
      await onConfirm({
        supplierName: supplierName.trim(),
        totalAmount: total,
        issueDate,
        description: description.trim(),
        category,
        profile,
        installments,
      });
    } catch {
      // error handled by caller
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={[styles.modalCancel, { color: colors.muted }]}>Cancelar</Text>
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Revisar Nota Fiscal</Text>
          <Pressable
            onPress={saving ? undefined : handleConfirm}
            style={({ pressed }) => ({ opacity: pressed || saving ? 0.6 : 1 })}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[styles.modalSave, { color: colors.primary }]}>Salvar</Text>
            }
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {/* Supplier */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Fornecedor *</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={supplierName}
              onChangeText={setSupplierName}
              placeholder="Nome do fornecedor"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />
          </View>

          {/* Total + Date row */}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Valor Total *</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={totalAmount}
                onChangeText={setTotalAmount}
                placeholder="0,00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Data de Emissão</Text>
              <DateInput
                style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={issueDate}
                onChangeText={setIssueDate}
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>

          {/* Description */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Descrição</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Produtos / serviços"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
            />
          </View>

          {/* Category — dynamic from DB */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                {dbCategories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => setCategory(cat.name)}
                    style={[
                      styles.chip,
                      { borderColor: colors.border, backgroundColor: category === cat.name ? colors.primary : colors.surface },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: category === cat.name ? "#FFF" : colors.foreground }]}>{cat.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Profile */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Perfil</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["Empresa", "Pessoal"] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setProfile(p)}
                  style={[
                    styles.chip,
                    { borderColor: colors.border, backgroundColor: profile === p ? colors.primary : colors.surface },
                  ]}
                >
                  <Text style={[styles.chipText, { color: profile === p ? "#FFF" : colors.foreground }]}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Installments section */}
          <View style={styles.fieldGroup}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <Text style={[styles.fieldLabel, { color: colors.muted, marginBottom: 0 }]}>Parcelas</Text>
              {hasAiInstallments && (
                <Pressable
                  onPress={() => setUseAiInstallments(!useAiInstallments)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                >
                  <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
                    {useAiInstallments ? "Editar manualmente" : "Usar duplicatas da NF"}
                  </Text>
                </Pressable>
              )}
            </View>

            {useAiInstallments ? (
              /* AI-extracted duplicatas: individual amount + dueDate per row */
              <View style={[styles.installmentsPreview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 10 }}>
                  <IconSymbol name="checkmark.seal.fill" size={14} color={colors.success} />
                  <Text style={[styles.installmentsPreviewTitle, { color: colors.success, marginBottom: 0 }]}>
                    {aiInstallments.length} duplicata{aiInstallments.length !== 1 ? "s" : ""} extraídas da NF
                  </Text>
                </View>
                {aiInstallments.map((inst, i) => (
                  <View key={i} style={[styles.installmentRow, { borderTopColor: colors.border }]}>
                    <Text style={[styles.installmentLabel, { color: colors.muted }]}>
                      {inst.number ?? i + 1}/{aiInstallments.length}
                    </Text>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <DateInput
                        style={[styles.dueDateInput, { borderColor: colors.border, color: colors.foreground }]}
                        value={inst.dueDate}
                        onChangeText={(val) => {
                          const updated = [...aiInstallments];
                          updated[i] = { ...updated[i], dueDate: val };
                          setAiInstallments(updated);
                        }}
                        placeholderTextColor={colors.muted}
                      />
                    </View>
                    <TextInput
                      style={[styles.installmentAmount, styles.dueDateInput, { borderColor: colors.border, color: colors.foreground, minWidth: 90, textAlign: "right" }]}
                      value={String(inst.amount)}
                      onChangeText={(val) => {
                        const updated = [...aiInstallments];
                        updated[i] = { ...updated[i], amount: parseFloat(val) || 0 };
                        setAiInstallments(updated);
                      }}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                ))}
              </View>
            ) : (
              /* Manual mode: pick count + equal installments */
              <>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => setNumInstallments(n)}
                      style={[
                        styles.installmentBtn,
                        { borderColor: colors.border, backgroundColor: numInstallments === n ? colors.primary : colors.surface },
                      ]}
                    >
                      <Text style={[styles.installmentBtnText, { color: numInstallments === n ? "#FFF" : colors.foreground }]}>{n}x</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={[styles.installmentsPreview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.installmentsPreviewTitle, { color: colors.foreground }]}>
                    Parcelas — {formatCurrency(perInstallment)} cada
                  </Text>
                  {dueDates.map((dueDate, i) => (
                    <View key={i} style={[styles.installmentRow, { borderTopColor: colors.border }]}>
                      <Text style={[styles.installmentLabel, { color: colors.muted }]}>
                        Parcela {i + 1}/{numInstallments}
                      </Text>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <DateInput
                          style={[styles.dueDateInput, { borderColor: colors.border, color: colors.foreground }]}
                          value={dueDate}
                          onChangeText={(val) => {
                            const updated = [...dueDates];
                            updated[i] = val;
                            setDueDates(updated);
                          }}
                          placeholderTextColor={colors.muted}
                        />
                      </View>
                      <Text style={[styles.installmentAmount, { color: colors.foreground }]}>
                        {formatCurrency(perInstallment)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Mark Paid Modal ──────────────────────────────────────────────────────────

interface MarkPaidModalProps {
  visible: boolean;
  installment: Installment | null;
  invoiceName: string;
  onClose: () => void;
  onConfirm: (paidDate: string) => Promise<void>;
}

function MarkPaidModal({ visible, installment, invoiceName, onClose, onConfirm }: MarkPaidModalProps) {
  const colors = useColors();
  const [paidDate, setPaidDate] = useState(todayBr());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setPaidDate(todayBr());
      setSaving(false);
    }
  }, [visible]);

  async function handleConfirm() {
    const iso = brToIso(paidDate);
    if (!iso.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert("Data inválida", "Informe a data no formato DD/MM/AAAA.");
      return;
    }
    setSaving(true);
    try {
      await onConfirm(iso);
    } catch {
      // error handled by caller
    } finally {
      setSaving(false);
    }
  }

  if (!installment) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.alertBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.alertTitle, { color: colors.foreground }]}>Marcar como Pago</Text>
          <Text style={[styles.alertSubtitle, { color: colors.muted }]}>
            {invoiceName} — Parcela {installment.installmentNumber}/{installment.installmentNumber}
          </Text>
          <Text style={[styles.alertAmount, { color: colors.primary }]}>
            {formatCurrency(installment.amount)}
          </Text>

          <Text style={[styles.fieldLabel, { color: colors.muted, marginTop: 16 }]}>Data do Pagamento</Text>
          <DateInput
            style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground, marginTop: 6 }]}
            value={paidDate}
            onChangeText={setPaidDate}
            placeholderTextColor={colors.muted}
            autoFocus
          />

          <View style={styles.alertButtons}>
            <Pressable
              onPress={onClose}
              style={[styles.alertBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.alertBtnText, { color: colors.muted }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={saving ? undefined : handleConfirm}
              style={[styles.alertBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
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

// ─── Confirm Delete Modal ────────────────────────────────────────────────────

function ConfirmDeleteModal({
  visible,
  invoiceName,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  invoiceName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const colors = useColors();
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.alertBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.alertTitle, { color: colors.foreground }]}>Excluir Nota Fiscal</Text>
          <Text style={[styles.alertSubtitle, { color: colors.muted, textAlign: "center", marginTop: 4 }]}>
            Deseja excluir a nota de "{invoiceName}"?{"\n"}Todos os pagamentos vinculados também serão removidos.
          </Text>
          <View style={styles.alertButtons}>
            <Pressable
              onPress={onClose}
              style={[styles.alertBtn, { borderColor: colors.border }]}
            >
              <Text style={[styles.alertBtnText, { color: colors.muted }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              onPress={deleting ? undefined : handleConfirm}
              style={[styles.alertBtn, { backgroundColor: colors.error, borderColor: colors.error }]}
            >
              {deleting
                ? <ActivityIndicator size="small" color="#FFF" />
                : <Text style={[styles.alertBtnText, { color: "#FFF" }]}>Excluir</Text>
              }
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Edit Invoice Modal ───────────────────────────────────────────────────────

interface EditInvoiceModalProps {
  visible: boolean;
  invoice: Invoice;
  onClose: () => void;
  onConfirm: (data: {
    supplierName: string;
    totalAmount: number;
    issueDate: string;
    description: string;
    category: string;
    profile: "Pessoal" | "Empresa";
    installments: Array<{ installmentNumber: number; amount: number; dueDate: string }>;
  }) => Promise<void>;
}

function EditInvoiceModal({ visible, invoice, onClose, onConfirm }: EditInvoiceModalProps) {
  const colors = useColors();
  const { categories: dbCategories } = usePayments();
  const [supplierName, setSupplierName] = useState(invoice.supplierName);
  const [totalAmount, setTotalAmount] = useState(invoice.totalAmount);
  const [issueDate, setIssueDate] = useState(isoToBr(invoice.issueDate));
  const [description, setDescription] = useState(invoice.description ?? "");
  const [category, setCategory] = useState(invoice.category);
  const [profile, setProfile] = useState<"Pessoal" | "Empresa">(invoice.profile);
  const [saving, setSaving] = useState(false);

  // Installments: editable rows
  const [editInstallments, setEditInstallments] = useState(
    invoice.installments.map((i) => ({
      installmentNumber: i.installmentNumber,
      amount: parseFloat(i.amount),
      dueDate: isoToBr(i.dueDate),
    }))
  );

  useEffect(() => {
    if (visible) {
      setSupplierName(invoice.supplierName);
      setTotalAmount(invoice.totalAmount);
      setIssueDate(isoToBr(invoice.issueDate));
      setDescription(invoice.description ?? "");
      setCategory(invoice.category);
      setProfile(invoice.profile);
      setSaving(false);
      setEditInstallments(
        invoice.installments.map((i) => ({
          installmentNumber: i.installmentNumber,
          amount: parseFloat(i.amount),
          dueDate: isoToBr(i.dueDate),
        }))
      );
    }
  }, [visible, invoice]);

  async function handleSave() {
    if (!supplierName.trim()) {
      Alert.alert("Campo obrigatório", "Informe o nome do fornecedor.");
      return;
    }
    const total = parseFloat(totalAmount);
    if (!total || total <= 0) {
      Alert.alert("Valor inválido", "Informe o valor total da nota fiscal.");
      return;
    }
    setSaving(true);
    try {
      await onConfirm({
        supplierName: supplierName.trim(),
        totalAmount: total,
        issueDate: brToIso(issueDate),
        description: description.trim(),
        category,
        profile,
        installments: editInstallments.map((inst) => ({ ...inst, dueDate: brToIso(inst.dueDate) })),
      });
    } catch {
      // error handled by caller
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={[styles.modalCancel, { color: colors.muted }]}>Cancelar</Text>
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Editar Nota Fiscal</Text>
          <Pressable
            onPress={saving ? undefined : handleSave}
            style={({ pressed }) => ({ opacity: pressed || saving ? 0.6 : 1 })}
          >
            {saving
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={[styles.modalSave, { color: colors.primary }]}>Salvar</Text>
            }
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {/* Supplier */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Fornecedor *</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={supplierName}
              onChangeText={setSupplierName}
              placeholder="Nome do fornecedor"
              placeholderTextColor={colors.muted}
              returnKeyType="next"
            />
          </View>

          {/* Total + Date row */}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Valor Total *</Text>
              <TextInput
                style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={totalAmount}
                onChangeText={setTotalAmount}
                placeholder="0,00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
            <View style={[styles.fieldGroup, { flex: 1 }]}>
              <Text style={[styles.fieldLabel, { color: colors.muted }]}>Data de Emissão</Text>
              <DateInput
                style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={issueDate}
                onChangeText={setIssueDate}
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>

          {/* Description */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Descrição</Text>
            <TextInput
              style={[styles.fieldInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Produtos / serviços"
              placeholderTextColor={colors.muted}
              returnKeyType="done"
            />
          </View>

          {/* Category — dynamic from DB */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                {dbCategories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => setCategory(cat.name)}
                    style={[
                      styles.chip,
                      { borderColor: colors.border, backgroundColor: category === cat.name ? colors.primary : colors.surface },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: category === cat.name ? "#FFF" : colors.foreground }]}>{cat.name}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Profile */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Perfil</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["Empresa", "Pessoal"] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setProfile(p)}
                  style={[
                    styles.chip,
                    { borderColor: colors.border, backgroundColor: profile === p ? colors.primary : colors.surface },
                  ]}
                >
                  <Text style={[styles.chipText, { color: profile === p ? "#FFF" : colors.foreground }]}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Installments — editable rows */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Parcelas</Text>
            <View style={[styles.installmentsPreview, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {editInstallments.map((inst, i) => (
                <View key={i} style={[styles.installmentRow, { borderTopColor: colors.border, borderTopWidth: i === 0 ? 0 : 0.5 }]}>
                  <Text style={[styles.installmentLabel, { color: colors.muted }]}>
                    Parcela {inst.installmentNumber}/{editInstallments.length}
                  </Text>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <DateInput
                      style={[styles.dueDateInput, { borderColor: colors.border, color: colors.foreground }]}
                      value={inst.dueDate}
                      onChangeText={(val) => {
                        const updated = [...editInstallments];
                        updated[i] = { ...updated[i], dueDate: val };
                        setEditInstallments(updated);
                      }}
                      placeholderTextColor={colors.muted}
                    />
                  </View>
                  <TextInput
                    style={[styles.installmentAmount, styles.dueDateInput, { borderColor: colors.border, color: colors.foreground, minWidth: 90, textAlign: "right", marginLeft: 8 }]}
                    value={String(inst.amount)}
                    onChangeText={(val) => {
                      const updated = [...editInstallments];
                      updated[i] = { ...updated[i], amount: parseFloat(val) || 0 };
                      setEditInstallments(updated);
                    }}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    placeholderTextColor={colors.muted}
                  />
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Invoice Card ─────────────────────────────────────────────────────────────

interface InvoiceCardProps {
  invoice: Invoice;
  onMarkPaid: (installment: Installment) => void;
  onMarkUnpaid: (installment: Installment) => void;
  onMarkAlreadyPaid: (installment: Installment) => void;
  onUnmarkAlreadyPaid: (installment: Installment) => void;
  onDelete: (invoice: Invoice) => void;
  onEdit: (invoice: Invoice) => void;
}

function InvoiceCard({ invoice, onMarkPaid, onMarkUnpaid, onMarkAlreadyPaid, onUnmarkAlreadyPaid, onDelete, onEdit }: InvoiceCardProps) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  // Count as "settled" both properly paid (paidAt) and already-paid-before-registration
  const settledCount = invoice.installments.filter((i) => i.paidAt !== null || i.alreadyPaid).length;
  const paidCount = invoice.installments.filter((i) => i.paidAt !== null).length;
  const totalCount = invoice.installments.length;
  const allPaid = settledCount === totalCount;
  const hasOverdue = invoice.installments.some(
    (i) => !i.paidAt && !i.alreadyPaid && i.dueDate < today()
  );

  const progressPct = totalCount > 0 ? (settledCount / totalCount) * 100 : 0;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Card header */}
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={({ pressed }) => [styles.cardHeader, pressed && { opacity: 0.8 }]}
      >
        <View style={[styles.cardIconBox, { backgroundColor: colors.primary + "18" }]}>
          <IconSymbol name="doc.text.fill" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]} numberOfLines={1}>
            {invoice.supplierName}
          </Text>
          <Text style={[styles.cardSub, { color: colors.muted }]}>
            {formatCurrency(invoice.totalAmount)} · {formatDate(invoice.issueDate)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {allPaid ? (
            <View style={[styles.badge, { backgroundColor: colors.success + "20" }]}>
              <Text style={[styles.badgeText, { color: colors.success }]}>Pago</Text>
            </View>
          ) : hasOverdue ? (
            <View style={[styles.badge, { backgroundColor: colors.error + "20" }]}>
              <Text style={[styles.badgeText, { color: colors.error }]}>Vencido</Text>
            </View>
          ) : (
            <View style={[styles.badge, { backgroundColor: colors.warning + "20" }]}>
              <Text style={[styles.badgeText, { color: colors.warning }]}>{settledCount}/{totalCount} pagas</Text>
            </View>
          )}
          <IconSymbol name={expanded ? "chevron.up" : "chevron.down"} size={18} color={colors.muted} />
        </View>
      </Pressable>

      {/* Progress bar */}
      <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progressPct}%` as any,
              backgroundColor: allPaid ? colors.success : hasOverdue ? colors.error : colors.primary,
            },
          ]}
        />
      </View>

      {/* Expanded installments */}
      {expanded && (
        <View style={[styles.installmentsList, { borderTopColor: colors.border }]}>
          {invoice.installments.map((inst) => {
            const isAlreadyPaid = !!(inst.alreadyPaid);
            const isOverdue = !inst.paidAt && !isAlreadyPaid && inst.dueDate < today();
            return (
              <View
                key={inst.id}
                style={[styles.installmentItem, { borderBottomColor: colors.border }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.installmentItemLabel, { color: colors.foreground }]}>
                    Parcela {inst.installmentNumber}/{totalCount}
                  </Text>
                  <Text style={[styles.installmentItemDate, { color: isOverdue ? colors.error : colors.muted }]}>
                    {isOverdue ? "⚠ Venceu em " : "Vence em "}{formatDate(inst.dueDate)}
                  </Text>
                </View>
                <Text style={[styles.installmentItemAmount, { color: colors.foreground }]}>
                  {formatCurrency(inst.amount)}
                </Text>
                {inst.paidAt ? (
                  <Pressable
                    onPress={() => onMarkUnpaid(inst)}
                    style={({ pressed }) => [styles.paidBtn, { backgroundColor: colors.success + "20", opacity: pressed ? 0.7 : 1 }]}
                  >
                    <IconSymbol name="checkmark.circle.fill" size={16} color={colors.success} />
                    <Text style={[styles.paidBtnText, { color: colors.success }]}>Pago</Text>
                  </Pressable>
                ) : isAlreadyPaid ? (
                  <Pressable
                    onPress={() => onUnmarkAlreadyPaid(inst)}
                    style={({ pressed }) => [styles.paidBtn, { backgroundColor: colors.muted + "20", opacity: pressed ? 0.7 : 1 }]}
                  >
                    <IconSymbol name="checkmark.circle.fill" size={16} color={colors.muted} />
                    <Text style={[styles.paidBtnText, { color: colors.muted }]}>Pago ant.</Text>
                  </Pressable>
                ) : (
                  <View style={{ gap: 4, alignItems: "flex-end" }}>
                    <Pressable
                      onPress={() => onMarkPaid(inst)}
                      style={({ pressed }) => [styles.payBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                    >
                      <Text style={styles.payBtnText}>Pagar</Text>
                    </Pressable>
                    {isOverdue && (
                      <Pressable
                        onPress={() => onMarkAlreadyPaid(inst)}
                        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, paddingHorizontal: 6, paddingVertical: 3 })}
                      >
                        <Text style={{ fontSize: 10, color: colors.muted, textDecorationLine: "underline" }}>Já foi pago</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          {/* Actions row */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
            <Pressable
              onPress={() => onEdit(invoice)}
              style={({ pressed }) => [styles.deleteInvoiceBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <IconSymbol name="pencil" size={14} color={colors.primary} />
              <Text style={[styles.deleteInvoiceBtnText, { color: colors.primary }]}>Editar</Text>
            </Pressable>
            <Pressable
              onPress={() => onDelete(invoice)}
              style={({ pressed }) => [styles.deleteInvoiceBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <IconSymbol name="trash.fill" size={14} color={colors.error} />
              <Text style={[styles.deleteInvoiceBtnText, { color: colors.error }]}>Excluir</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Pending Invoice Review Modal ────────────────────────────────────────────

function PendingInvoiceReviewModal({
  pending,
  pendingList,
  onClose,
  onApprove,
  onReject,
  onSelectPending,
}: {
  pending: any;
  pendingList: any[];
  onClose: () => void;
  onApprove: (id: number, data: any) => Promise<void>;
  onReject: (id: number) => Promise<void>;
  onSelectPending: (p: any) => void;
}) {
  const colors = useColors();
  const { categories: dbCategories } = usePayments();
  const [supplierName, setSupplierName] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Outros");
  const [profile, setProfile] = useState<"Pessoal" | "Empresa">("Empresa");
  const [installments, setInstallments] = useState<{ installmentNumber: number; amount: number; dueDate: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!pending) return;
    setSupplierName(pending.supplierName ?? "");
    setTotalAmount(String(pending.totalAmount ?? ""));
    setIssueDate(isoToBr(pending.issueDate ?? today()));
    setDescription(pending.description ?? "");
    setCategory(pending.category ?? "Outros");
    setProfile(pending.profile ?? "Empresa");
    try {
      const parsed = JSON.parse(pending.installmentsJson || "[]");
      setInstallments(parsed.map((inst: any, idx: number) => ({
        installmentNumber: inst.number ?? idx + 1,
        amount: inst.amount ?? 0,
        dueDate: inst.dueDate ?? today(),
      })));
    } catch { setInstallments([]); }
  }, [pending?.id]);

  if (!pending) return null;

  const handleApprove = async () => {
    setSaving(true);
    try {
      const amt = parseFloat(totalAmount) || 0;
      const finalInstallments = installments.length > 0
        ? installments.map((inst) => ({ ...inst, dueDate: brToIso(inst.dueDate) || inst.dueDate }))
        : [{ installmentNumber: 1, amount: amt, dueDate: brToIso(issueDate) || today() }];
      await onApprove(pending.id, {
        supplierName: supplierName.trim() || "Sem nome",
        totalAmount: amt,
        issueDate: brToIso(issueDate) || today(),
        description: description || null,
        category,
        profile,
        installments: finalInstallments,
      });
    } catch (e: any) {
      console.error("Approve error:", e.message);
    } finally { setSaving(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <Text style={{ fontSize: 15, color: colors.primary }}>Fechar</Text>
        </Pressable>
        <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>Revisar NF ({pendingList.indexOf(pending) + 1}/{pendingList.length})</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        {/* Email info */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, gap: 4, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 }}>Recebido por e-mail</Text>
          <Text style={{ fontSize: 13, color: colors.foreground }}>{pending.fromEmail}</Text>
          {pending.emailSubject ? <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={1}>{pending.emailSubject}</Text> : null}
        </View>

        {/* Image preview */}
        {pending.imageUrl && (
          <View style={{ borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: colors.border, height: 200 }}>
            <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>Imagem da NF processada pela IA</Text>
            </View>
          </View>
        )}

        {/* Editable fields */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: colors.muted, textTransform: "uppercase" }}>Fornecedor *</Text>
          <TextInput
            style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }}
            value={supplierName}
            onChangeText={setSupplierName}
            placeholder="Nome do fornecedor"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
          />
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "500", color: colors.muted, textTransform: "uppercase" }}>Valor Total *</Text>
            <TextInput
              style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }}
              value={totalAmount}
              onChangeText={setTotalAmount}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "500", color: colors.muted, textTransform: "uppercase" }}>Data Emissão</Text>
            <DateInput
              style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }}
              value={issueDate}
              onChangeText={setIssueDate}
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: colors.muted, textTransform: "uppercase" }}>Descrição</Text>
          <TextInput
            style={{ borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }}
            value={description}
            onChangeText={setDescription}
            placeholder="Produtos / serviços"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
          />
        </View>

        {/* Category */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: colors.muted, textTransform: "uppercase" }}>Categoria</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
              {dbCategories.map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() => setCategory(cat.name)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
                    borderColor: colors.border, backgroundColor: category === cat.name ? colors.primary : colors.surface,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <Text style={{ fontSize: 13, fontWeight: "500", color: category === cat.name ? "#FFF" : colors.foreground }}>{cat.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Profile */}
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: "500", color: colors.muted, textTransform: "uppercase" }}>Perfil</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["Empresa", "Pessoal"] as const).map((p) => (
              <Pressable
                key={p}
                onPress={() => setProfile(p)}
                style={({ pressed }) => ({
                  paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1,
                  borderColor: colors.border, backgroundColor: profile === p ? colors.primary : colors.surface,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: "500", color: profile === p ? "#FFF" : colors.foreground }}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Installments */}
        {installments.length > 0 && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: "500", color: colors.muted, textTransform: "uppercase" }}>Parcelas ({installments.length})</Text>
            <View style={{ backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
              {installments.map((inst, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: colors.border }}>
                  <Text style={{ fontSize: 13, color: colors.muted }}>Parcela {inst.installmentNumber}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground }}>{formatCurrency(inst.amount)}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{isoToBr(inst.dueDate) || inst.dueDate}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Action buttons */}
        <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
          <Pressable
            onPress={() => onReject(pending.id)}
            style={({ pressed }) => ({
              flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.error,
              alignItems: "center", opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ fontSize: 15, fontWeight: "600", color: colors.error }}>Rejeitar</Text>
          </Pressable>
          <Pressable
            onPress={handleApprove}
            style={({ pressed }) => ({
              flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: colors.primary,
              alignItems: "center", opacity: pressed || saving ? 0.8 : 1,
            })}
          >
            {saving
              ? <ActivityIndicator size="small" color="#FFF" />
              : <Text style={{ fontSize: 15, fontWeight: "700", color: "#FFF" }}>Aprovar e Salvar</Text>
            }
          </Pressable>
        </View>

        {/* List of other pending */}
        {pendingList.length > 1 && (
          <View style={{ gap: 6, marginTop: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "500", color: colors.muted, textTransform: "uppercase" }}>Outras NFs pendentes</Text>
            {pendingList.filter((p: any) => p.id !== pending.id).map((p: any) => (
              <Pressable
                key={p.id}
                onPress={() => onSelectPending(p)}
                style={({ pressed }) => ({
                  backgroundColor: colors.surface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{p.supplierName || "NF sem nome"}</Text>
                <Text style={{ fontSize: 12, color: colors.muted }}>{formatCurrency(p.totalAmount || 0)} • {p.fromEmail}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function InvoicesScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = trpc.invoices.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const analyzeMutation = trpc.invoices.analyze.useMutation();
  const createMutation = trpc.invoices.create.useMutation();
  const markPaidMutation = trpc.invoices.markPaid.useMutation();
  const markUnpaidMutation = trpc.invoices.markUnpaid.useMutation();
  const markAlreadyPaidMutation = trpc.invoices.markAsAlreadyPaid.useMutation();
  const unmarkAlreadyPaidMutation = trpc.invoices.unmarkAlreadyPaid.useMutation();
  const deleteMutation = trpc.invoices.delete.useMutation();
  const updateMutation = trpc.invoices.update.useMutation();

  // ── NFs pendentes (recebidas por e-mail) ──
  const { data: pendingList = [], refetch: refetchPending } = trpc.pendingInvoices.list.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 30000, // poll a cada 30s
  });
  const approvePendingMutation = trpc.pendingInvoices.approve.useMutation({
    onSuccess: () => { refetchPending(); invalidateAll(); },
  });
  const rejectPendingMutation = trpc.pendingInvoices.reject.useMutation({
    onSuccess: () => refetchPending(),
  });
  const [pendingModalVisible, setPendingModalVisible] = useState(false);
  const [selectedPending, setSelectedPending] = useState<any>(null);
  const [pendingReviewData, setPendingReviewData] = useState<any>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [showPickerMenu, setShowPickerMenu] = useState(false);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [reviewData, setReviewData] = useState<any>(null);
  const [reviewImageUrl, setReviewImageUrl] = useState("");

  const [markPaidVisible, setMarkPaidVisible] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<Installment | null>(null);
  const [selectedInvoiceName, setSelectedInvoiceName] = useState("");

  // Delete confirm modal
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null);

  // Edit modal
  const [editVisible, setEditVisible] = useState(false);
  const [invoiceToEdit, setInvoiceToEdit] = useState<Invoice | null>(null);

  // Search & date filter
  const [searchQuery, setSearchQuery] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);

  // Period filter chips
  type PeriodFilter = "all" | "thisMonth" | "lastMonth" | "thisYear";
  const [activePeriod, setActivePeriod] = useState<PeriodFilter>("all");

  // Calculate totals per period from all invoices
  const periodTotals = (() => {
    const now = new Date();
    const cy = now.getFullYear();
    const cm = now.getMonth();
    let thisMonth = 0, lastMonth = 0, thisYear = 0;
    (invoices as Invoice[]).forEach((inv) => {
      const amt = parseFloat(String(inv.totalAmount)) || 0;
      if (!inv.issueDate) return;
      const [y, m] = inv.issueDate.split("-").map(Number);
      if (y === cy && m - 1 === cm) thisMonth += amt;
      if ((m - 1 === cm - 1 && y === cy) || (cm === 0 && m === 12 && y === cy - 1)) lastMonth += amt;
      if (y === cy) thisYear += amt;
    });
    return { thisMonth, lastMonth, thisYear };
  })();

  // Sort
  type SortKey = "issueDate_desc" | "issueDate_asc" | "createdAt_desc" | "createdAt_asc";
  const [sortKey, setSortKey] = useState<SortKey>("createdAt_desc");
  const [showSortMenu, setShowSortMenu] = useState(false);

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "createdAt_desc", label: "Adicionado: mais recente" },
    { key: "createdAt_asc", label: "Adicionado: mais antigo" },
    { key: "issueDate_desc", label: "Emissão: mais recente" },
    { key: "issueDate_asc", label: "Emissão: mais antiga" },
  ];

  // Apply period chip filter
  const periodFilteredInvoices = (() => {
    if (activePeriod === "all") return invoices as Invoice[];
    const now = new Date();
    const cy = now.getFullYear();
    const cm = now.getMonth();
    return (invoices as Invoice[]).filter((inv) => {
      if (!inv.issueDate) return false;
      const [y, m] = inv.issueDate.split("-").map(Number);
      if (activePeriod === "thisMonth") return y === cy && m - 1 === cm;
      if (activePeriod === "lastMonth") return (m - 1 === cm - 1 && y === cy) || (cm === 0 && m === 12 && y === cy - 1);
      if (activePeriod === "thisYear") return y === cy;
      return true;
    });
  })();

  const filteredInvoices = periodFilteredInvoices.filter((inv) => {
    const q = searchQuery.trim().toLowerCase();
    if (q && !inv.supplierName.toLowerCase().includes(q)) return false;
    if (filterFrom) {
      const fromISO = brToIso(filterFrom);
      if (fromISO && inv.issueDate < fromISO) return false;
    }
    if (filterTo) {
      const toISO = brToIso(filterTo);
      if (toISO && inv.issueDate > toISO) return false;
    }
    return true;
  });
  const isFiltered = searchQuery.trim().length > 0 || filterFrom.length > 0 || filterTo.length > 0 || activePeriod !== "all";

  const sortedInvoices = [...filteredInvoices].sort((a, b) => {
    if (sortKey === "issueDate_desc") return (a.issueDate > b.issueDate ? -1 : 1);
    if (sortKey === "issueDate_asc") return (a.issueDate < b.issueDate ? -1 : 1);
    if (sortKey === "createdAt_asc") {
      const ta = new Date(a.createdAt ?? 0).getTime();
      const tb = new Date(b.createdAt ?? 0).getTime();
      return ta - tb;
    }
    // createdAt_desc (default)
    const ta = new Date(a.createdAt ?? 0).getTime();
    const tb = new Date(b.createdAt ?? 0).getTime();
    return tb - ta;
  });

  const totalFiltered = filteredInvoices.reduce((sum, inv) => sum + (parseFloat(String(inv.totalAmount)) || 0), 0);

  // Quick date filter presets
  function applyQuickFilter(preset: "thisMonth" | "lastMonth" | "last90" | "thisYear") {
    const now = new Date();
    let from: Date;
    let to: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (preset === "thisMonth") {
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (preset === "lastMonth") {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (preset === "last90") {
      from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    } else {
      from = new Date(now.getFullYear(), 0, 1);
      to = new Date(now.getFullYear(), 11, 31);
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    setFilterFrom(`${pad(from.getDate())}/${pad(from.getMonth() + 1)}/${from.getFullYear()}`);
    setFilterTo(`${pad(to.getDate())}/${pad(to.getMonth() + 1)}/${to.getFullYear()}`);
    setShowDateFilter(true);
  }

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.invoices.list) });
    queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.payments.list) });
  }

  async function analyzeFile(base64: string, mimeType: string) {
    setAnalyzing(true);
    try {
      const data = await analyzeMutation.mutateAsync({ imageBase64: base64, mimeType });
      setReviewImageUrl(data.imageUrl ?? "");
      setReviewData({
        supplierName: data.supplierName ?? "",
        totalAmount: data.totalAmount ?? 0,
        issueDate: data.issueDate ?? today(),
        description: data.description ?? "",
        suggestedInstallments: data.suggestedInstallments ?? 3,
        installments: data.installments ?? [],
        category: data.category ?? "Outros",
      });
      setReviewVisible(true);
    } catch (err: any) {
      Alert.alert("Erro ao analisar", err?.message ?? "Não foi possível analisar a nota fiscal.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function pickImage() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPickerMenu(false);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      base64: false,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    let base64: string;
    if (asset.base64) {
      base64 = asset.base64;
    } else {
      base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    }
    await analyzeFile(base64, "image/jpeg");
  }

  async function pickPdf() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPickerMenu(false);

    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    let base64: string;

    if (Platform.OS === "web" && asset.file) {
      // Web: use FileReader
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          resolve(dataUrl.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(asset.file!);
      });
    } else {
      base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
    }

    await analyzeFile(base64, "application/pdf");
  }

  function openPickerMenu() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPickerMenu(true);
  }

  async function handleCreateInvoice(data: any) {
    try {
      await createMutation.mutateAsync({ ...data, imageUrl: reviewImageUrl || undefined });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReviewVisible(false);
      invalidateAll();
    } catch (err: any) {
      Alert.alert("Erro ao salvar", err?.message ?? "Não foi possível salvar a nota fiscal.");
      throw err;
    }
  }

  function handleMarkPaid(inst: Installment, invoiceName: string) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedInstallment(inst);
    setSelectedInvoiceName(invoiceName);
    setMarkPaidVisible(true);
  }

  async function handleConfirmPaid(paidDate: string) {
    if (!selectedInstallment) return;
    try {
      await markPaidMutation.mutateAsync({ installmentId: selectedInstallment.id, paidDate });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setMarkPaidVisible(false);
      invalidateAll();
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Não foi possível marcar como pago.");
      throw err;
    }
  }

  async function handleMarkUnpaid(inst: Installment) {
    Alert.alert(
      "Desfazer pagamento",
      "Deseja remover o registro de pagamento desta parcela?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            try {
              await markUnpaidMutation.mutateAsync({ installmentId: inst.id });
              if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              invalidateAll();
            } catch (err: any) {
              Alert.alert("Erro", err?.message ?? "Não foi possível desfazer o pagamento.");
            }
          },
        },
      ]
    );
  }

  function handleDeleteInvoice(invoice: Invoice) {
    setInvoiceToDelete(invoice);
    setDeleteVisible(true);
  }

  async function handleConfirmDelete() {
    if (!invoiceToDelete) return;
    try {
      await deleteMutation.mutateAsync({ invoiceId: invoiceToDelete.id });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDeleteVisible(false);
      setInvoiceToDelete(null);
      invalidateAll();
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Não foi possível excluir a nota fiscal.");
    }
  }

  function handleEditInvoice(invoice: Invoice) {
    setInvoiceToEdit(invoice);
    setEditVisible(true);
  }

  async function handleConfirmEdit(data: {
    supplierName: string;
    totalAmount: number;
    issueDate: string;
    description: string;
    category: string;
    profile: "Pessoal" | "Empresa";
    installments: Array<{ installmentNumber: number; amount: number; dueDate: string }>;
  }) {
    if (!invoiceToEdit) return;
    try {
      await updateMutation.mutateAsync({
        invoiceId: invoiceToEdit.id,
        ...data,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditVisible(false);
      setInvoiceToEdit(null);
      invalidateAll();
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Não foi possível atualizar a nota fiscal.");
      throw err;
    }
  }

  async function handleMarkAlreadyPaid(inst: Installment) {
    try {
      await markAlreadyPaidMutation.mutateAsync({ installmentId: inst.id });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateAll();
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Não foi possível marcar a parcela.");
    }
  }

  async function handleUnmarkAlreadyPaid(inst: Installment) {
    try {
      await unmarkAlreadyPaidMutation.mutateAsync({ installmentId: inst.id });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateAll();
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Não foi possível desfazer.");
    }
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Notas Fiscais</Text>
        <Pressable
          onPress={analyzing ? undefined : openPickerMenu}
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: colors.primary, opacity: pressed || analyzing ? 0.8 : 1 },
          ]}
        >
          {analyzing
            ? <ActivityIndicator size="small" color="#FFF" />
            : <>
                <IconSymbol name="doc.badge.plus" size={18} color="#FFF" />
                <Text style={styles.addBtnText}>Analisar NF</Text>
              </>
          }
        </Pressable>
      </View>

      {/* Period filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: "row" }}
      >
        {([
          { key: "all" as const, label: "Todas", total: null },
          { key: "thisMonth" as const, label: "Este Mês", total: periodTotals.thisMonth },
          { key: "lastMonth" as const, label: "Mês Passado", total: periodTotals.lastMonth },
          { key: "thisYear" as const, label: "Este Ano", total: periodTotals.thisYear },
        ]).map((chip) => {
          const isActive = activePeriod === chip.key;
          return (
            <Pressable
              key={chip.key}
              onPress={() => {
                setActivePeriod(chip.key);
                if (chip.key !== "all") { setFilterFrom(""); setFilterTo(""); }
              }}
              style={({ pressed }) => ([
                {
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 20,
                  borderWidth: 1.5,
                  alignItems: "center",
                  opacity: pressed ? 0.75 : 1,
                  backgroundColor: isActive ? colors.primary : colors.surface,
                  borderColor: isActive ? colors.primary : colors.border,
                  minWidth: 90,
                },
              ])}
            >
              <Text style={{ fontSize: 13, fontWeight: isActive ? "700" : "500", color: isActive ? "#FFF" : colors.foreground }}>
                {chip.label}
              </Text>
              {chip.total !== null && (
                <Text style={{ fontSize: 11, color: isActive ? "rgba(255,255,255,0.85)" : colors.muted, marginTop: 2 }}>
                  {formatCurrency(chip.total)}
                </Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Search bar */}
      <View style={[styles.invSearchBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
        <TextInput
          style={[styles.invSearchInput, { color: colors.foreground }]}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Pesquisar por fornecedor..."
          placeholderTextColor={colors.muted}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <IconSymbol name="xmark.circle.fill" size={16} color={colors.muted} />
          </Pressable>
        )}
        <Pressable
          onPress={() => setShowDateFilter(!showDateFilter)}
          style={[styles.invFilterBtn, { backgroundColor: showDateFilter ? colors.primary + "20" : "transparent" }]}
        >
          <IconSymbol name="calendar" size={16} color={showDateFilter ? colors.primary : colors.muted} />
        </Pressable>
        <Pressable
          onPress={() => setShowSortMenu(!showSortMenu)}
          style={[styles.invFilterBtn, { backgroundColor: showSortMenu ? colors.primary + "20" : "transparent" }]}
        >
          <IconSymbol name="arrow.up.arrow.down" size={16} color={showSortMenu ? colors.primary : colors.muted} />
        </Pressable>
      </View>

      {/* Sort menu */}
      {showSortMenu && (
        <View style={[styles.invSortMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {SORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => { setSortKey(opt.key); setShowSortMenu(false); }}
              style={({ pressed }) => [styles.invSortOption, { opacity: pressed ? 0.7 : 1, backgroundColor: sortKey === opt.key ? colors.primary + "15" : "transparent" }]}
            >
              <Text style={[styles.invSortOptionText, { color: sortKey === opt.key ? colors.primary : colors.foreground, fontWeight: sortKey === opt.key ? "700" : "400" }]}>
                {opt.label}
              </Text>
              {sortKey === opt.key && <IconSymbol name="checkmark" size={14} color={colors.primary} />}
            </Pressable>
          ))}
        </View>
      )}

      {/* Date filter panel */}
      {showDateFilter && (
        <View style={[styles.invDateFilter, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Quick filter chips */}
          <View style={styles.invQuickFilterRow}>
            {([
              { key: "thisMonth", label: "Este Mês" },
              { key: "lastMonth", label: "Último Mês" },
              { key: "last90", label: "Últimos 90 Dias" },
              { key: "thisYear", label: "Este Ano" },
            ] as const).map((p) => (
              <Pressable
                key={p.key}
                onPress={() => applyQuickFilter(p.key)}
                style={({ pressed }) => [styles.invQuickChip, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40", opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.invQuickChipText, { color: colors.primary }]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
          {/* Manual date range */}
          <View style={styles.invDateRow}>
            <View style={styles.invDateField}>
              <Text style={[styles.invDateLabel, { color: colors.muted }]}>De (emissão)</Text>
              <DateInput
                style={[styles.invDateInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={filterFrom}
                onChangeText={setFilterFrom}
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={styles.invDateField}>
              <Text style={[styles.invDateLabel, { color: colors.muted }]}>Até</Text>
              <DateInput
                style={[styles.invDateInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                value={filterTo}
                onChangeText={setFilterTo}
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>
          {(filterFrom || filterTo) && (
            <Pressable
              onPress={() => { setFilterFrom(""); setFilterTo(""); }}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: "flex-end" })}
            >
              <Text style={[styles.invDateClear, { color: colors.primary }]}>Limpar datas</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Filter result summary with total */}
      {isFiltered && !isLoading && (
        <View style={[styles.invFilterResult, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ gap: 2 }}>
            <Text style={[styles.invFilterResultText, { color: colors.muted }]}>
              {filteredInvoices.length} nota{filteredInvoices.length !== 1 ? "s" : ""} encontrada{filteredInvoices.length !== 1 ? "s" : ""}
            </Text>
            {filteredInvoices.length > 0 && (
              <Text style={[styles.invFilterTotal, { color: colors.foreground }]}>
                Total: {formatCurrency(totalFiltered)}
              </Text>
            )}
          </View>
          <Pressable onPress={() => { setSearchQuery(""); setFilterFrom(""); setFilterTo(""); setActivePeriod("all"); }} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={[styles.invFilterClear, { color: colors.primary }]}>Limpar</Text>
          </Pressable>
        </View>
      )}

      {isLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredInvoices.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol name="doc.text.fill" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {isFiltered ? "Nenhuma nota encontrada" : "Nenhuma nota fiscal"}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.muted }]}>
            {isFiltered
              ? "Tente ajustar os filtros de busca."
              : 'Toque em "Analisar NF" para enviar uma nota fiscal e a IA preencherá os dados automaticamente.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={sortedInvoices}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <InvoiceCard
              invoice={item}
              onMarkPaid={(inst) => handleMarkPaid(inst, item.supplierName)}
              onMarkUnpaid={handleMarkUnpaid}
              onMarkAlreadyPaid={handleMarkAlreadyPaid}
              onUnmarkAlreadyPaid={handleUnmarkAlreadyPaid}
              onDelete={handleDeleteInvoice}
              onEdit={handleEditInvoice}
            />
          )}
        />
      )}

      {/* Review Modal */}
      {reviewData && (
        <ReviewModal
          visible={reviewVisible}
          imageUrl={reviewImageUrl}
          initial={reviewData}
          onClose={() => setReviewVisible(false)}
          onConfirm={handleCreateInvoice}
        />
      )}

      {/* Mark Paid Modal */}
      <MarkPaidModal
        visible={markPaidVisible}
        installment={selectedInstallment}
        invoiceName={selectedInvoiceName}
        onClose={() => setMarkPaidVisible(false)}
        onConfirm={handleConfirmPaid}
      />

      {/* ── NFs Pendentes Banner ── */}
      {pendingList.length > 0 && (
        <Pressable
          onPress={() => { setSelectedPending(pendingList[0]); setPendingReviewData(null); setPendingModalVisible(true); }}
          style={({ pressed }) => ({
            marginHorizontal: 16,
            marginTop: 8,
            marginBottom: 4,
            backgroundColor: colors.warning + "22",
            borderWidth: 1,
            borderColor: colors.warning,
            borderRadius: 12,
            padding: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.warning, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{pendingList.length}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>
              {pendingList.length === 1 ? "1 NF recebida por e-mail" : `${pendingList.length} NFs recebidas por e-mail`}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>Toque para revisar e confirmar</Text>
          </View>
          <IconSymbol name="chevron.right" size={16} color={colors.muted} />
        </Pressable>
      )}

      {/* ── Modal de Revisão de NF Pendente ── */}
      <Modal
        visible={pendingModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPendingModalVisible(false)}
      >
        <PendingInvoiceReviewModal
          pending={selectedPending}
          pendingList={pendingList}
          onClose={() => setPendingModalVisible(false)}
          onApprove={async (id: number, data: any) => {
            await approvePendingMutation.mutateAsync({ id, ...data });
            // Move to next pending if any
            const remaining = pendingList.filter((p: any) => p.id !== id);
            if (remaining.length > 0) {
              setSelectedPending(remaining[0]);
            } else {
              setPendingModalVisible(false);
            }
          }}
          onReject={async (id: number) => {
            await rejectPendingMutation.mutateAsync({ id });
            const remaining = pendingList.filter((p: any) => p.id !== id);
            if (remaining.length > 0) {
              setSelectedPending(remaining[0]);
            } else {
              setPendingModalVisible(false);
            }
          }}
          onSelectPending={(p: any) => setSelectedPending(p)}
        />
      </Modal>

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        visible={deleteVisible}
        invoiceName={invoiceToDelete?.supplierName ?? ""}
        onClose={() => { setDeleteVisible(false); setInvoiceToDelete(null); }}
        onConfirm={handleConfirmDelete}
      />

      {/* Edit Invoice Modal */}
      {invoiceToEdit && (
        <EditInvoiceModal
          visible={editVisible}
          invoice={invoiceToEdit}
          onClose={() => { setEditVisible(false); setInvoiceToEdit(null); }}
          onConfirm={handleConfirmEdit}
        />
      )}

      {/* Picker Menu Modal */}
      <Modal
        visible={showPickerMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPickerMenu(false)}
      >
        <Pressable
          style={styles.pickerOverlay}
          onPress={() => setShowPickerMenu(false)}
        >
          <View style={[styles.pickerMenu, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Selecionar Nota Fiscal</Text>

            <Pressable
              onPress={pickImage}
              style={({ pressed }) => [styles.pickerOption, { borderBottomColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.pickerIconBox, { backgroundColor: colors.primary + "18" }]}>
                <IconSymbol name="photo.on.rectangle" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerOptionTitle, { color: colors.foreground }]}>Imagem / Foto</Text>
                <Text style={[styles.pickerOptionSub, { color: colors.muted }]}>JPG, PNG da galeria ou câmera</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={colors.muted} />
            </Pressable>

            <Pressable
              onPress={pickPdf}
              style={({ pressed }) => [styles.pickerOption, { opacity: pressed ? 0.7 : 1 }]}
            >
              <View style={[styles.pickerIconBox, { backgroundColor: colors.error + "18" }]}>
                <IconSymbol name="doc.richtext.fill" size={22} color={colors.error} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.pickerOptionTitle, { color: colors.foreground }]}>Arquivo PDF</Text>
                <Text style={[styles.pickerOptionSub, { color: colors.muted }]}>Boleto ou NF em PDF</Text>
              </View>
              <IconSymbol name="chevron.right" size={16} color={colors.muted} />
            </Pressable>
          </View>
        </Pressable>
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
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
  },
  cardIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  cardSub: {
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  progressBar: {
    height: 3,
    marginHorizontal: 16,
    marginBottom: 0,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  installmentsList: {
    borderTopWidth: 0.5,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  installmentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    gap: 8,
  },
  installmentItemLabel: {
    fontSize: 13,
    fontWeight: "500",
  },
  installmentItemDate: {
    fontSize: 11,
    marginTop: 2,
  },
  installmentItemAmount: {
    fontSize: 13,
    fontWeight: "600",
    minWidth: 80,
    textAlign: "right",
  },
  paidBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  paidBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  payBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  payBtnText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "600",
  },
  deleteInvoiceBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    alignSelf: "flex-start",
  },
  deleteInvoiceBtnText: {
    fontSize: 12,
  },
  // Modal
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
  },
  modalCancel: {
    fontSize: 15,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  modalSave: {
    fontSize: 15,
    fontWeight: "600",
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: "500",
  },
  installmentBtn: {
    width: 44,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  installmentBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  installmentsPreview: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  installmentsPreviewTitle: {
    fontSize: 13,
    fontWeight: "600",
    padding: 12,
  },
  installmentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 0.5,
  },
  installmentLabel: {
    fontSize: 12,
    minWidth: 90,
  },
  dueDateInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
  },
  installmentAmount: {
    fontSize: 12,
    fontWeight: "600",
    minWidth: 70,
    textAlign: "right",
  },
  // Mark Paid Modal
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
  },
  alertTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  alertSubtitle: {
    fontSize: 13,
  },
  alertAmount: {
    fontSize: 24,
    fontWeight: "700",
    marginTop: 8,
  },
  alertButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  alertBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  alertBtnText: {
    fontSize: 15,
    fontWeight: "600",
  },
  // Picker Menu
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    padding: 16,
    paddingBottom: 32,
  },
  pickerMenu: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
  },
  pickerTitle: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 14,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pickerOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderTopWidth: 0.5,
  },
  pickerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  pickerOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  pickerOptionSub: {
    fontSize: 11,
    marginTop: 2,
  },
  // Search & date filter
  invSearchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  invSearchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  invFilterBtn: {
    padding: 4,
    borderRadius: 8,
  },
  invDateFilter: {
    marginHorizontal: 16,
    marginBottom: 4,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  invDateRow: {
    flexDirection: "row",
    gap: 12,
  },
  invDateField: {
    flex: 1,
    gap: 4,
  },
  invDateLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  invDateInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  invDateClear: {
    fontSize: 13,
    fontWeight: "600",
  },
  invFilterResult: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  invFilterResultText: {
    fontSize: 13,
  },
  invFilterClear: {
    fontSize: 13,
    fontWeight: "600",
  },
  invFilterTotal: {
    fontSize: 14,
    fontWeight: "700",
  },
  invQuickFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  invQuickChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  invQuickChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  invSortMenu: {
    marginHorizontal: 16,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  invSortOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  invSortOptionText: {
    fontSize: 14,
  },
});
