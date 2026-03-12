import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  Linking,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";
import { useAuthContext } from "@/lib/auth-context";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

// ─── Types ────────────────────────────────────────────────────────────────────

type Employee = {
  id: number;
  fullName: string;
  role: string;
  baseSalary: string;
  admissionDate: string;
  pixKey: string;
  notes: string | null;
  isActive: boolean;
};

type Tab = "employees" | "payroll" | "payslip";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function downloadPdf(url: string, fileName: string) {
  if (Platform.OS === "web") {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      Linking.openURL(url);
    }
  } else {
    Linking.openURL(url);
  }
}

function fmtBRL(value: string | number | null | undefined): string {
  const n = parseFloat(String(value ?? "0")) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${months[parseInt(m) - 1]}/${y}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

// ─── Employee Form Modal ───────────────────────────────────────────────────────

function EmployeeFormModal({
  visible,
  employee,
  onClose,
  onSaved,
}: {
  visible: boolean;
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const colors = useColors();
  const [fullName, setFullName] = useState(employee?.fullName ?? "");
  const [role, setRole] = useState(employee?.role ?? "");
  const [baseSalary, setBaseSalary] = useState(employee?.baseSalary ?? "");
  const [admissionDate, setAdmissionDate] = useState(employee?.admissionDate ?? "");
  const [pixKey, setPixKey] = useState(employee?.pixKey ?? "");
  const [vtDaily, setVtDaily] = useState((employee as any)?.vtDaily ?? "0");
  const [vaDaily, setVaDaily] = useState((employee as any)?.vaDaily ?? "0");
  const [notes, setNotes] = useState(employee?.notes ?? "");
  const [isActive, setIsActive] = useState(employee ? (employee.isActive !== false) : true);

  React.useEffect(() => {
    if (visible) {
      setFullName(employee?.fullName ?? "");
      setRole(employee?.role ?? "");
      setBaseSalary(employee?.baseSalary ?? "");
      setAdmissionDate(employee?.admissionDate ?? "");
      setPixKey(employee?.pixKey ?? "");
      setVtDaily((employee as any)?.vtDaily ?? "0");
      setVaDaily((employee as any)?.vaDaily ?? "0");
      setNotes(employee?.notes ?? "");
      setIsActive(employee ? (employee.isActive !== false) : true);
    }
  }, [visible, employee]);

  const createMut = trpc.employees.create.useMutation();
  const updateMut = trpc.employees.update.useMutation();

  const handleSave = async () => {
    if (!fullName.trim()) {
      Alert.alert("Erro", "Nome completo é obrigatório.");
      return;
    }
    try {
      if (employee) {
        await updateMut.mutateAsync({
          id: employee.id,
          fullName: fullName.trim(),
          role: role.trim(),
          baseSalary: baseSalary.replace(",", "."),
          admissionDate: admissionDate.trim(),
          pixKey: pixKey.trim(),
          vtDaily: vtDaily.replace(",", "."),
          vaDaily: vaDaily.replace(",", "."),
          notes: notes.trim() || null,
          isActive,
        });
      } else {
        await createMut.mutateAsync({
          fullName: fullName.trim(),
          role: role.trim(),
          baseSalary: baseSalary.replace(",", "."),
          admissionDate: admissionDate.trim(),
          pixKey: pixKey.trim(),
          vtDaily: vtDaily.replace(",", "."),
          vaDaily: vaDaily.replace(",", "."),
          notes: notes.trim() || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha ao salvar funcionário.");
    }
  };

  const isLoading = createMut.isPending || updateMut.isPending;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {employee ? "Editar Funcionário" : "Novo Funcionário"}
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={isLoading} style={styles.modalCloseBtn}>
            {isLoading
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "600" }}>Salvar</Text>
            }
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Nome Completo *</Text>
            <TextInput
              value={fullName}
              onChangeText={setFullName}
              placeholder="Nome completo do funcionário"
              placeholderTextColor={colors.muted}
              style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
              autoCapitalize="characters"
            />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Cargo</Text>
            <TextInput
              value={role}
              onChangeText={setRole}
              placeholder="Ex: Vendedor, Auxiliar Administrativo"
              placeholderTextColor={colors.muted}
              style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
            />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Salário Base (R$)</Text>
            <TextInput
              value={baseSalary}
              onChangeText={setBaseSalary}
              placeholder="0,00"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
            />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Data de Admissão</Text>
            <TextInput
              value={admissionDate}
              onChangeText={setAdmissionDate}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
            />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Chave PIX</Text>
            <TextInput
              value={pixKey}
              onChangeText={setPixKey}
              placeholder="CPF, e-mail, telefone ou chave aleatória"
              placeholderTextColor={colors.muted}
              style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
              autoCapitalize="none"
            />
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.label, { color: colors.muted }]}>VT Diário (R$)</Text>
              <TextInput
                value={vtDaily}
                onChangeText={setVtDaily}
                placeholder="0,00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
              />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.label, { color: colors.muted }]}>VA Diário (R$)</Text>
              <TextInput
                value={vaDaily}
                onChangeText={setVaDaily}
                placeholder="0,00"
                placeholderTextColor={colors.muted}
                keyboardType="decimal-pad"
                style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
              />
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Status</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => setIsActive(true)}
                style={[styles.statusBtn, { backgroundColor: isActive ? colors.success : colors.surface, borderColor: isActive ? colors.success : colors.border }]}
              >
                <Text style={{ color: isActive ? "#fff" : colors.muted, fontWeight: "600", fontSize: 14 }}>Ativo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setIsActive(false)}
                style={[styles.statusBtn, { backgroundColor: !isActive ? colors.error : colors.surface, borderColor: !isActive ? colors.error : colors.border }]}
              >
                <Text style={{ color: !isActive ? "#fff" : colors.muted, fontWeight: "600", fontSize: 14 }}>Inativo</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Observações</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Observações opcionais"
              placeholderTextColor={colors.muted}
              multiline
              numberOfLines={3}
              style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border, height: 80, textAlignVertical: "top" }]}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Delete Confirm ────────────────────────────────────────────────────────────

function DeleteConfirmModal({
  visible,
  employeeName,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  employeeName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.confirmBox, { backgroundColor: colors.surface }]}>
          <Text style={[styles.confirmTitle, { color: colors.foreground }]}>Excluir Funcionário</Text>
          <Text style={[styles.confirmMsg, { color: colors.muted }]}>
            Deseja excluir{" "}
            <Text style={{ fontWeight: "700", color: colors.foreground }}>{employeeName}</Text>?
          </Text>
          <View style={styles.confirmBtns}>
            <TouchableOpacity onPress={onCancel} style={[styles.confirmBtn, { backgroundColor: colors.border }]}>
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConfirm} style={[styles.confirmBtn, { backgroundColor: colors.error }]}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Excluir</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Employees Tab ─────────────────────────────────────────────────────────────

function EmployeesTab() {
  const colors = useColors();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [formVisible, setFormVisible] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  const { data: employees = [], refetch, isLoading } = trpc.employees.list.useQuery();
  const deleteMut = trpc.employees.delete.useMutation();

  const filtered = (employees as Employee[]).filter((e) => {
    const matchSearch = e.fullName.toLowerCase().includes(search.toLowerCase()) ||
      e.role.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || (statusFilter === "active" ? e.isActive !== false : e.isActive === false);
    return matchSearch && matchStatus;
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({ id: deleteTarget.id });
      refetch();
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha ao excluir.");
    }
    setDeleteTarget(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <IconSymbol name="magnifyingglass" size={16} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar funcionário..."
            placeholderTextColor={colors.muted}
            style={[styles.searchInput, { color: colors.foreground }]}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <IconSymbol name="xmark.circle.fill" size={16} color={colors.muted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          onPress={() => { setEditEmployee(null); setFormVisible(true); }}
          style={[styles.addBtn, { backgroundColor: colors.primary }]}
        >
          <IconSymbol name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        {(["active", "inactive", "all"] as const).map((f) => {
          const labels = { active: "Ativos", inactive: "Inativos", all: "Todos" };
          const isSelected = statusFilter === f;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => setStatusFilter(f)}
              style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary + "22" : "transparent" }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: isSelected ? colors.primary : colors.muted }}>{labels[f]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <IconSymbol name="person.2.fill" size={48} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            {search ? "Nenhum funcionário encontrado" : "Nenhum funcionário cadastrado"}
          </Text>
          {!search && (
            <TouchableOpacity
              onPress={() => { setEditEmployee(null); setFormVisible(true); }}
              style={[styles.emptyBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>Cadastrar Funcionário</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 16, gap: 10 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={[styles.cardName, { color: colors.foreground, flex: 1 }]}>{item.fullName}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: item.isActive !== false ? colors.success + "22" : colors.error + "22" }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: item.isActive !== false ? colors.success : colors.error }}>
                      {item.isActive !== false ? "ATIVO" : "INATIVO"}
                    </Text>
                  </View>
                </View>
                {item.role ? <Text style={[styles.cardRole, { color: colors.muted }]}>{item.role}</Text> : null}
                <View style={{ flexDirection: "row", gap: 16, marginTop: 4, flexWrap: "wrap" }}>
                  <Text style={[styles.cardDetail, { color: colors.muted }]}>
                    Salário: <Text style={{ color: colors.foreground }}>{fmtBRL(item.baseSalary)}</Text>
                  </Text>
                  {item.admissionDate ? (
                    <Text style={[styles.cardDetail, { color: colors.muted }]}>
                      Admissão: <Text style={{ color: colors.foreground }}>{item.admissionDate}</Text>
                    </Text>
                  ) : null}
                </View>
                {item.pixKey ? (
                  <Text style={[styles.cardDetail, { color: colors.muted }]}>
                    PIX: <Text style={{ color: colors.foreground }}>{item.pixKey}</Text>
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  onPress={() => { setEditEmployee(item); setFormVisible(true); }}
                  style={[styles.iconBtn, { backgroundColor: colors.background }]}
                >
                  <IconSymbol name="pencil" size={18} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDeleteTarget(item)}
                  style={[styles.iconBtn, { backgroundColor: colors.background }]}
                >
                  <IconSymbol name="trash" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}

      <EmployeeFormModal
        visible={formVisible}
        employee={editEmployee}
        onClose={() => setFormVisible(false)}
        onSaved={() => refetch()}
      />
      <DeleteConfirmModal
        visible={!!deleteTarget}
        employeeName={deleteTarget?.fullName ?? ""}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </View>
  );
}

// ─── Edit Payroll Modal ────────────────────────────────────────────────────────

function EditPayrollModal({
  visible,
  payroll,
  mode,
  onClose,
  onSaved,
}: {
  visible: boolean;
  payroll: any;
  mode: "advance" | "salary";
  onClose: () => void;
  onSaved: () => void;
}) {
  const colors = useColors();
  const [advanceAmount, setAdvanceAmount] = useState(String(payroll.advanceAmount ?? "0"));
  const [netSalary, setNetSalary] = useState(String(payroll.netSalary ?? "0"));
  const [vtDaily, setVtDaily] = useState(String(payroll.vtDaily ?? "0"));
  const [vaDaily, setVaDaily] = useState(String(payroll.vaDaily ?? "0"));
  const [workingDays, setWorkingDays] = useState(String(payroll.workingDays ?? 22));
  const [otherBenefits, setOtherBenefits] = useState(String(payroll.otherBenefits ?? "0"));

  const updateMut = trpc.payroll.updateAmounts.useMutation();

  const vtTotal = (parseFloat(vtDaily || "0") * parseInt(workingDays || "22")).toFixed(2);
  const vaTotal = (parseFloat(vaDaily || "0") * parseInt(workingDays || "22")).toFixed(2);
  const salaryTotal = (
    parseFloat(netSalary || "0") +
    parseFloat(vtTotal) +
    parseFloat(vaTotal) +
    parseFloat(otherBenefits || "0")
  ).toFixed(2);

  const handleSave = async () => {
    try {
      await updateMut.mutateAsync({
        payrollId: payroll.id,
        advanceAmount: advanceAmount.replace(",", "."),
        netSalary: netSalary.replace(",", "."),
        vtDaily: vtDaily.replace(",", "."),
        vaDaily: vaDaily.replace(",", "."),
        workingDays: parseInt(workingDays) || 22,
        otherBenefits: otherBenefits.replace(",", "."),
      });
      onSaved();
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha ao salvar.");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {mode === "advance" ? "Adiantamento" : "Salário"} — {payroll.employeeName}
          </Text>
          <TouchableOpacity onPress={handleSave} disabled={updateMut.isPending} style={styles.modalCloseBtn}>
            {updateMut.isPending
              ? <ActivityIndicator size="small" color={colors.primary} />
              : <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "600" }}>Salvar</Text>
            }
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {mode === "advance" ? (
            <View style={{ gap: 4 }}>
              <Text style={[styles.label, { color: colors.muted }]}>Valor do Adiantamento (R$)</Text>
              <TextInput
                value={advanceAmount}
                onChangeText={setAdvanceAmount}
                keyboardType="decimal-pad"
                style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]}
              />
            </View>
          ) : (
            <>
              <View style={{ gap: 4 }}>
                <Text style={[styles.label, { color: colors.muted }]}>Salário Líquido (R$)</Text>
                <TextInput value={netSalary} onChangeText={setNetSalary} keyboardType="decimal-pad"
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
              </View>
              <View style={{ gap: 4 }}>
                <Text style={[styles.label, { color: colors.muted }]}>Dias Úteis</Text>
                <TextInput value={workingDays} onChangeText={setWorkingDays} keyboardType="number-pad"
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
              </View>
              <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  VT ({fmtBRL(vtDaily)}/dia) e VA ({fmtBRL(vaDaily)}/dia) são puxados do cadastro do funcionário.
                </Text>
              </View>
              <View style={{ gap: 4 }}>
                <Text style={[styles.label, { color: colors.muted }]}>Outros Benefícios (R$)</Text>
                <TextInput value={otherBenefits} onChangeText={setOtherBenefits} keyboardType="decimal-pad"
                  style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
              </View>
              <View style={[styles.totalBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.muted }]}>Total calculado:</Text>
                <Text style={{ color: colors.primary, fontSize: 22, fontWeight: "700" }}>{fmtBRL(salaryTotal)}</Text>
                <Text style={[styles.payDetail, { color: colors.muted }]}>
                  Líquido {fmtBRL(netSalary)} + VT {fmtBRL(vtTotal)} + VA {fmtBRL(vaTotal)} + Outros {fmtBRL(otherBenefits)}
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Payroll Tab ───────────────────────────────────────────────────────────────

function PayrollTab() {
  const colors = useColors();
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [editPayroll, setEditPayroll] = useState<any | null>(null);
  const [editMode, setEditMode] = useState<"advance" | "salary" | null>(null);
  const [payConfirm, setPayConfirm] = useState<{ payrollId: number; type: "advance" | "salary"; name: string } | null>(null);

  const { data: payrollList = [], refetch, isLoading } = trpc.payroll.listMonth.useQuery({ yearMonth });
  const markAdvMut = trpc.payroll.markAdvancePaid.useMutation();
  const markSalMut = trpc.payroll.markSalaryPaid.useMutation();
  const unmarkAdvMut = trpc.payroll.unmarkAdvancePaid.useMutation();
  const unmarkSalMut = trpc.payroll.unmarkSalaryPaid.useMutation();

  const changeMonth = (delta: number) => {
    const [y, m] = yearMonth.split("-").map(Number);
    let nm = m + delta;
    let ny = y;
    if (nm < 1) { nm = 12; ny--; }
    if (nm > 12) { nm = 1; ny++; }
    setYearMonth(`${ny}-${String(nm).padStart(2, "0")}`);
  };

  const handleMarkPaid = async () => {
    if (!payConfirm) return;
    try {
      if (payConfirm.type === "advance") {
        await markAdvMut.mutateAsync({ payrollId: payConfirm.payrollId, paidDate: todayStr() });
      } else {
        await markSalMut.mutateAsync({ payrollId: payConfirm.payrollId, paidDate: todayStr() });
      }
      refetch();
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha ao registrar pagamento.");
    }
    setPayConfirm(null);
  };

  const handleUnmark = async (payrollId: number, type: "advance" | "salary") => {
    try {
      if (type === "advance") await unmarkAdvMut.mutateAsync({ payrollId });
      else await unmarkSalMut.mutateAsync({ payrollId });
      refetch();
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha ao desfazer pagamento.");
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.monthRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthBtn}>
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.monthLabel, { color: colors.foreground }]}>{monthLabel(yearMonth)}</Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthBtn}>
          <IconSymbol name="chevron.right" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (payrollList as any[]).length === 0 ? (
        <View style={styles.center}>
          <IconSymbol name="doc.text.fill" size={48} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>Nenhum funcionário cadastrado</Text>
        </View>
      ) : (
        <FlatList
          data={payrollList as any[]}
          keyExtractor={(item) => String(item.employee.id)}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => {
            const { employee, payroll } = item;
            const vtTotal = (parseFloat(payroll.vtDaily || "0") * (payroll.workingDays || 22)).toFixed(2);
            const vaTotal = (parseFloat(payroll.vaDaily || "0") * (payroll.workingDays || 22)).toFixed(2);
            const salaryTotal = (
              parseFloat(payroll.netSalary || "0") +
              parseFloat(vtTotal) +
              parseFloat(vaTotal) +
              parseFloat(payroll.otherBenefits || "0")
            ).toFixed(2);

            return (
              <View style={[styles.payrollCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardName, { color: colors.foreground, marginBottom: 4 }]}>{employee.fullName}</Text>
                {employee.role ? <Text style={[styles.cardRole, { color: colors.muted, marginBottom: 8 }]}>{employee.role}</Text> : null}

                {/* Adiantamento */}
                <View style={[styles.paySection, { borderColor: colors.border }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.paySectionTitle, { color: colors.foreground }]}>Adiantamento (dia 20)</Text>
                    <TouchableOpacity
                      onPress={() => { setEditPayroll({ ...payroll, employeeName: employee.fullName }); setEditMode("advance"); }}
                      style={{ padding: 4 }}
                    >
                      <IconSymbol name="pencil" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.payAmount, { color: colors.foreground }]}>{fmtBRL(payroll.advanceAmount)}</Text>
                  {payroll.advancePaidAt ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <View style={[styles.paidBadge, { backgroundColor: colors.success + "22" }]}>
                        <Text style={{ color: colors.success, fontSize: 12, fontWeight: "600" }}>✓ Pago</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleUnmark(payroll.id, "advance")}>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>Desfazer</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setPayConfirm({ payrollId: payroll.id, type: "advance", name: employee.fullName })}
                      style={[styles.payBtn, { backgroundColor: colors.primary }]}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Marcar como Pago</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Salário */}
                <View style={[styles.paySection, { borderColor: colors.border, borderTopWidth: 1, marginTop: 10 }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={[styles.paySectionTitle, { color: colors.foreground }]}>Salário (dia 05)</Text>
                    <TouchableOpacity
                      onPress={() => { setEditPayroll({ ...payroll, employeeName: employee.fullName }); setEditMode("salary"); }}
                      style={{ padding: 4 }}
                    >
                      <IconSymbol name="pencil" size={16} color={colors.primary} />
                    </TouchableOpacity>
                  </View>
                  <View style={{ gap: 2, marginTop: 4 }}>
                    <Text style={[styles.payDetail, { color: colors.muted }]}>
                      Líquido: <Text style={{ color: colors.foreground }}>{fmtBRL(payroll.netSalary)}</Text>
                    </Text>
                    <Text style={[styles.payDetail, { color: colors.muted }]}>
                      VT ({payroll.workingDays}d × {fmtBRL(payroll.vtDaily)}): <Text style={{ color: colors.foreground }}>{fmtBRL(vtTotal)}</Text>
                    </Text>
                    <Text style={[styles.payDetail, { color: colors.muted }]}>
                      VA ({payroll.workingDays}d × {fmtBRL(payroll.vaDaily)}): <Text style={{ color: colors.foreground }}>{fmtBRL(vaTotal)}</Text>
                    </Text>
                    {parseFloat(payroll.otherBenefits || "0") > 0 && (
                      <Text style={[styles.payDetail, { color: colors.muted }]}>
                        Outros: <Text style={{ color: colors.foreground }}>{fmtBRL(payroll.otherBenefits)}</Text>
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.payAmount, { color: colors.foreground, marginTop: 6 }]}>Total: {fmtBRL(salaryTotal)}</Text>
                  {payroll.salaryPaidAt ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <View style={[styles.paidBadge, { backgroundColor: colors.success + "22" }]}>
                        <Text style={{ color: colors.success, fontSize: 12, fontWeight: "600" }}>✓ Pago</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleUnmark(payroll.id, "salary")}>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>Desfazer</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => setPayConfirm({ payrollId: payroll.id, type: "salary", name: employee.fullName })}
                      style={[styles.payBtn, { backgroundColor: colors.primary }]}
                    >
                      <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Marcar como Pago</Text>
                    </TouchableOpacity>
                  )}
                  {payroll.pdfUrl && (
                    <TouchableOpacity
                      onPress={() => downloadPdf(payroll.pdfUrl, `holerite_${employee.fullName.replace(/\s+/g, "_")}.pdf`)}
                      style={[styles.downloadBtn, { borderColor: colors.primary, marginTop: 8 }]}
                    >
                      <IconSymbol name="arrow.down.doc" size={14} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>Baixar Holerite</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {editPayroll && editMode && (
        <EditPayrollModal
          visible={!!editPayroll}
          payroll={editPayroll}
          mode={editMode}
          onClose={() => { setEditPayroll(null); setEditMode(null); }}
          onSaved={() => { refetch(); setEditPayroll(null); setEditMode(null); }}
        />
      )}

      <Modal visible={!!payConfirm} transparent animationType="fade" onRequestClose={() => setPayConfirm(null)}>
        <View style={styles.overlay}>
          <View style={[styles.confirmBox, { backgroundColor: colors.surface }]}>
            <Text style={[styles.confirmTitle, { color: colors.foreground }]}>Confirmar Pagamento</Text>
            <Text style={[styles.confirmMsg, { color: colors.muted }]}>
              Registrar {payConfirm?.type === "advance" ? "adiantamento" : "salário"} de{" "}
              <Text style={{ fontWeight: "700", color: colors.foreground }}>{payConfirm?.name}</Text> como pago hoje?
            </Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity onPress={() => setPayConfirm(null)} style={[styles.confirmBtn, { backgroundColor: colors.border }]}>
                <Text style={{ color: colors.foreground, fontWeight: "600" }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleMarkPaid} style={[styles.confirmBtn, { backgroundColor: colors.primary }]}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Approve Payroll Modal ─────────────────────────────────────────────────────

function ApprovePayrollModal({
  visible,
  payroll,
  onClose,
  onApprove,
}: {
  visible: boolean;
  payroll: any;
  onClose: () => void;
  onApprove: (overrides: any) => void;
}) {
  const colors = useColors();
  const [employeeName, setEmployeeName] = useState(payroll.employeeName ?? "");
  const [position, setPosition] = useState(payroll.position ?? "");
  const [baseSalary, setBaseSalary] = useState(String(payroll.baseSalary ?? "0"));
  const [netSalary, setNetSalary] = useState(String(payroll.netSalary ?? "0"));
  const [advanceAmount, setAdvanceAmount] = useState(String(payroll.advanceAmount ?? "0"));
  const [vtDaily, setVtDaily] = useState(String(payroll.vtDaily ?? "0"));
  const [vaDaily, setVaDaily] = useState("0");
  const [workingDays, setWorkingDays] = useState("22");
  const [competenceMonth, setCompetenceMonth] = useState(String(payroll.competenceMonth ?? new Date().getMonth() + 1));
  const [competenceYear, setCompetenceYear] = useState(String(payroll.competenceYear ?? new Date().getFullYear()));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
            <Text style={{ color: colors.primary, fontSize: 16 }}>Cancelar</Text>
          </TouchableOpacity>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>Revisar Holerite</Text>
          <TouchableOpacity
            onPress={() => onApprove({
              employeeName: employeeName.trim(),
              position: position.trim(),
              baseSalary: baseSalary.replace(",", "."),
              netSalary: netSalary.replace(",", "."),
              advanceAmount: advanceAmount.replace(",", "."),
              vtDaily: vtDaily.replace(",", "."),
              vaDaily: vaDaily.replace(",", "."),
              workingDays: parseInt(workingDays) || 22,
              competenceMonth: parseInt(competenceMonth),
              competenceYear: parseInt(competenceYear),
            })}
            style={styles.modalCloseBtn}
          >
            <Text style={{ color: colors.success, fontSize: 16, fontWeight: "700" }}>Aprovar</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {!payroll.employeeId && (
            <View style={[styles.warnBox, { backgroundColor: colors.warning + "22", borderColor: colors.warning }]}>
              <Text style={{ color: colors.warning, fontSize: 13 }}>
                Funcionário não cadastrado. Será criado automaticamente ao aprovar.
              </Text>
            </View>
          )}
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Nome do Funcionário</Text>
            <TextInput value={employeeName} onChangeText={setEmployeeName}
              style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Cargo</Text>
            <TextInput value={position} onChangeText={setPosition}
              style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.label, { color: colors.muted }]}>Mês</Text>
              <TextInput value={competenceMonth} onChangeText={setCompetenceMonth} keyboardType="number-pad"
                style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.label, { color: colors.muted }]}>Ano</Text>
              <TextInput value={competenceYear} onChangeText={setCompetenceYear} keyboardType="number-pad"
                style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Salário Base (R$)</Text>
            <TextInput value={baseSalary} onChangeText={setBaseSalary} keyboardType="decimal-pad"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Salário Líquido (R$)</Text>
            <TextInput value={netSalary} onChangeText={setNetSalary} keyboardType="decimal-pad"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
          </View>
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Adiantamento (R$)</Text>
            <TextInput value={advanceAmount} onChangeText={setAdvanceAmount} keyboardType="decimal-pad"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.label, { color: colors.muted }]}>VT Diário (R$)</Text>
              <TextInput value={vtDaily} onChangeText={setVtDaily} keyboardType="decimal-pad"
                style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.label, { color: colors.muted }]}>VA Diário (R$)</Text>
              <TextInput value={vaDaily} onChangeText={setVaDaily} keyboardType="decimal-pad"
                style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
            </View>
          </View>
          <View style={{ gap: 4 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Dias Úteis</Text>
            <TextInput value={workingDays} onChangeText={setWorkingDays} keyboardType="number-pad"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.foreground, borderColor: colors.border }]} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Payslip Tab ───────────────────────────────────────────────────────────────

function PayslipTab() {
  const colors = useColors();
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ processed: number; total: number; errors: string[] } | null>(null);
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [downloadMonth, setDownloadMonth] = useState(currentYearMonth());

  const { data: pending = [], refetch } = trpc.pendingPayrolls.list.useQuery();
  const { data: monthPayrolls = [] } = trpc.payroll.listMonth.useQuery({ yearMonth: downloadMonth });
  const uploadMut = trpc.pendingPayrolls.uploadPdf.useMutation();
  const approveMut = trpc.pendingPayrolls.approve.useMutation();
  const rejectMut = trpc.pendingPayrolls.reject.useMutation();

  const availableDownloads = (monthPayrolls as any[]).filter((r) => r.payroll?.pdfUrl);

  const changeDownloadMonth = (delta: number) => {
    const [y, m] = downloadMonth.split("-").map(Number);
    let nm = m + delta, ny = y;
    if (nm < 1) { nm = 12; ny--; }
    if (nm > 12) { nm = 1; ny++; }
    setDownloadMonth(`${ny}-${String(nm).padStart(2, "0")}`);
  };

  const handleDownloadAll = async () => {
    for (const r of availableDownloads) {
      const name = `holerite_${r.employee.fullName.replace(/\s+/g, "_")}_${downloadMonth}.pdf`;
      await downloadPdf(r.payroll.pdfUrl, name);
      await new Promise((res) => setTimeout(res, 300));
    }
  };

  const handlePickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploading(true);
      setUploadResult(null);

      let base64: string;
      if (Platform.OS === "web") {
        // Web: use FileReader API if file object available, otherwise fetch the URI
        const fileObj = (asset as any).file;
        if (fileObj) {
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              resolve(dataUrl.split(",")[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(fileObj);
          });
        } else {
          // Fallback: fetch the URI and convert to base64
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const dataUrl = reader.result as string;
              resolve(dataUrl.split(",")[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }
      } else {
        base64 = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      const res = await uploadMut.mutateAsync({ pdfBase64: base64, fileName: asset.name });
      setUploadResult(res);
      refetch();
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha ao processar PDF.");
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async (overrides: any) => {
    if (!approveTarget) return;
    try {
      await approveMut.mutateAsync({ id: approveTarget.id, ...overrides });
      refetch();
      setApproveTarget(null);
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha ao aprovar.");
    }
  };

  const handleReject = async (id: number) => {
    try {
      await rejectMut.mutateAsync({ id });
      refetch();
    } catch (err: any) {
      Alert.alert("Erro", err?.message ?? "Falha ao rejeitar.");
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16 }}>
        <TouchableOpacity
          onPress={handlePickPdf}
          disabled={uploading}
          style={[styles.uploadBtn, { backgroundColor: colors.primary, opacity: uploading ? 0.7 : 1 }]}
        >
          {uploading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "600" }}>Processando holerites...</Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <IconSymbol name="doc.badge.plus" size={20} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "600" }}>Importar PDF de Holerites</Text>
            </View>
          )}
        </TouchableOpacity>

        {uploadResult && (
          <View style={[styles.resultBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>
              {uploadResult.processed} funcionário(s) processado(s).
            </Text>
            {uploadResult.errors.length > 0 && (
              <Text style={{ color: colors.error, fontSize: 12, marginTop: 4 }}>
                {uploadResult.errors.slice(0, 3).join("\n")}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* ── Holerites por Mês ── */}
      <View style={[styles.monthDownloadSection, { borderBottomColor: colors.border, borderTopColor: colors.border }]}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Text style={[styles.paySectionTitle, { color: colors.foreground }]}>Holerites por Mês</Text>
          {availableDownloads.length > 0 && (
            <TouchableOpacity onPress={handleDownloadAll} style={[styles.downloadAllBtn, { backgroundColor: colors.primary }]}>
              <IconSymbol name="arrow.down.doc" size={14} color="#fff" />
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>Baixar Todos ({availableDownloads.length})</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 10 }}>
          <TouchableOpacity onPress={() => changeDownloadMonth(-1)} style={styles.monthBtn}>
            <IconSymbol name="chevron.left" size={18} color={colors.primary} />
          </TouchableOpacity>
          <Text style={[styles.monthLabel, { color: colors.foreground, fontSize: 15 }]}>{monthLabel(downloadMonth)}</Text>
          <TouchableOpacity onPress={() => changeDownloadMonth(1)} style={styles.monthBtn}>
            <IconSymbol name="chevron.right" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>
        {availableDownloads.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center" }}>Nenhum holerite disponível para {monthLabel(downloadMonth)}</Text>
        ) : (
          <View style={{ gap: 6 }}>
            {availableDownloads.map((r: any) => (
              <View key={r.employee.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
                <View>
                  <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 13 }}>{r.employee.fullName}</Text>
                  {r.employee.role ? <Text style={{ color: colors.muted, fontSize: 12 }}>{r.employee.role}</Text> : null}
                </View>
                <TouchableOpacity
                  onPress={() => downloadPdf(r.payroll.pdfUrl, `holerite_${r.employee.fullName.replace(/\s+/g, "_")}_${downloadMonth}.pdf`)}
                  style={[styles.downloadBtn, { borderColor: colors.primary }]}
                >
                  <IconSymbol name="arrow.down.doc" size={13} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 12 }}>Baixar</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* ── Pendentes de Revisão ── */}
      {(pending as any[]).length === 0 ? (
        <View style={styles.center}>
          <IconSymbol name="doc.text.fill" size={48} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>Nenhum holerite aguardando revisão</Text>
        </View>
      ) : (
        <FlatList
          data={pending as any[]}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16, gap: 10 }}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, flexDirection: "column" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[styles.cardName, { color: colors.foreground, flex: 1 }]}>{item.employeeName}</Text>
                {!item.employeeId && (
                  <View style={[styles.newBadge, { backgroundColor: colors.warning + "33" }]}>
                    <Text style={{ color: colors.warning, fontSize: 10, fontWeight: "700" }}>NOVO</Text>
                  </View>
                )}
              </View>
              {item.position ? <Text style={[styles.cardRole, { color: colors.muted }]}>{item.position}</Text> : null}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                <Text style={[styles.cardDetail, { color: colors.muted }]}>
                  Líquido: <Text style={{ color: colors.foreground }}>{fmtBRL(item.netSalary)}</Text>
                </Text>
                <Text style={[styles.cardDetail, { color: colors.muted }]}>
                  Adiantamento: <Text style={{ color: colors.foreground }}>{fmtBRL(item.advanceAmount)}</Text>
                </Text>
                {item.competenceMonth && item.competenceYear && (
                  <Text style={[styles.cardDetail, { color: colors.muted }]}>
                    Competência: <Text style={{ color: colors.foreground }}>
                      {String(item.competenceMonth).padStart(2,"0")}/{item.competenceYear}
                    </Text>
                  </Text>
                )}
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <TouchableOpacity
                  onPress={() => setApproveTarget(item)}
                  style={[styles.approveBtn, { backgroundColor: colors.success }]}
                >
                  <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Revisar e Aprovar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleReject(item.id)}
                  style={[styles.rejectBtn, { backgroundColor: colors.error + "22", borderColor: colors.error }]}
                >
                  <Text style={{ color: colors.error, fontWeight: "600", fontSize: 13 }}>Rejeitar</Text>
                </TouchableOpacity>
              </View>
              {item.pdfUrl && (
                <TouchableOpacity
                  onPress={() => downloadPdf(item.pdfUrl, `holerite_${item.employeeName.replace(/\s+/g, "_")}.pdf`)}
                  style={[styles.downloadBtn, { borderColor: colors.primary }]}
                >
                  <IconSymbol name="arrow.down.doc" size={14} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>Baixar Holerite</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      {approveTarget && (
        <ApprovePayrollModal
          visible={!!approveTarget}
          payroll={approveTarget}
          onClose={() => setApproveTarget(null)}
          onApprove={handleApprove}
        />
      )}
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function EmployeesScreen() {
  const colors = useColors();
  const { isAuthenticated } = useAuthContext();
  const [activeTab, setActiveTab] = useState<Tab>("employees");

  if (!isAuthenticated) {
    return (
      <ScreenContainer className="items-center justify-center p-8">
        <IconSymbol name="person.2.fill" size={64} color={colors.border} />
        <Text style={{ color: colors.muted, textAlign: "center", marginTop: 16, fontSize: 16 }}>
          Faça login para acessar o módulo de Funcionários.
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Funcionários</Text>
      </View>

      <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        {([
          { key: "employees", label: "Cadastro" },
          { key: "payroll", label: "Folha do Mês" },
          { key: "payslip", label: "Holerites" },
        ] as { key: Tab; label: string }[]).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[styles.tabItem, activeTab === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.tabLabel, { color: activeTab === tab.key ? colors.primary : colors.muted }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {activeTab === "employees" && <EmployeesTab />}
        {activeTab === "payroll" && <PayrollTab />}
        {activeTab === "payslip" && <PayslipTab />}
      </View>
    </ScreenContainer>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  headerTitle: { fontSize: 24, fontWeight: "700" },
  tabBar: { flexDirection: "row", borderBottomWidth: 0.5 },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabLabel: { fontSize: 13, fontWeight: "600" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderBottomWidth: 0.5 },
  searchBox: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15 },
  addBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyText: { fontSize: 16, textAlign: "center" },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 4 },
  card: { borderRadius: 12, padding: 14, borderWidth: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  cardName: { fontSize: 15, fontWeight: "700", lineHeight: 20 },
  cardRole: { fontSize: 13, marginTop: 2 },
  cardDetail: { fontSize: 12, marginTop: 2 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  monthBtn: { padding: 8 },
  monthLabel: { fontSize: 18, fontWeight: "700" },
  payrollCard: { borderRadius: 12, padding: 14, borderWidth: 1 },
  paySection: { paddingTop: 10 },
  paySectionTitle: { fontSize: 14, fontWeight: "600" },
  payAmount: { fontSize: 18, fontWeight: "700", marginTop: 4 },
  payDetail: { fontSize: 12 },
  payBtn: { marginTop: 8, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, alignItems: "center" },
  paidBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  modalContainer: { flex: 1 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  modalTitle: { fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  modalCloseBtn: { minWidth: 70 },
  label: { fontSize: 13, fontWeight: "500" },
  input: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  totalBox: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 4, alignItems: "center" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 },
  confirmBox: { borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, gap: 12 },
  confirmTitle: { fontSize: 18, fontWeight: "700", textAlign: "center" },
  confirmMsg: { fontSize: 15, textAlign: "center", lineHeight: 22 },
  confirmBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  uploadBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  resultBox: { marginTop: 10, padding: 12, borderRadius: 10, borderWidth: 1 },
  approveBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  rejectBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", borderWidth: 1 },
  newBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  warnBox: { padding: 12, borderRadius: 10, borderWidth: 1 },
  downloadBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, marginTop: 6, alignSelf: "flex-start" },
  statusBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  infoBox: { padding: 10, borderRadius: 8, borderWidth: 1 },
  monthDownloadSection: { padding: 14, borderTopWidth: 0.5, borderBottomWidth: 0.5 },
  downloadAllBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 },
});
