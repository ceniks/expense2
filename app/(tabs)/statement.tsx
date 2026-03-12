import {
  Text, View, Pressable, StyleSheet, ScrollView, Modal,
  Alert, ActivityIndicator, TextInput, Platform,
} from "react-native";
import { useState } from "react";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";

function fmtAmount(amount: string, type: string) {
  const n = parseFloat(amount);
  const sign = type === "debit" ? "-" : "+";
  return `${sign} R$ ${n.toFixed(2).replace(".", ",")}`;
}

function confidenceColor(confidence: string | null) {
  const v = parseFloat(confidence ?? "0");
  if (v >= 0.8) return "#10B981";
  if (v >= 0.5) return "#F59E0B";
  return "#EF4444";
}

function confidenceLabel(confidence: string | null) {
  const v = parseFloat(confidence ?? "0");
  if (v >= 0.8) return "Alta";
  if (v >= 0.5) return "Média";
  return "Baixa";
}

// ─── Tela de Triagem ──────────────────────────────────────────────────────────

function TriageScreen({ importId, onBack }: { importId: number; onBack: () => void }) {
  const colors = useColors();
  const utils = trpc.useUtils();
  const { data: rows = [], isLoading } = trpc.bankStatement.listRows.useQuery({ importId });
  const approveMut = trpc.bankStatement.approveRow.useMutation({
    onSuccess: (data) => {
      utils.bankStatement.listRows.invalidate();
      if (data?.propagated && data.propagated > 0) {
        Alert.alert("Aprendizado aplicado", `${data.propagated} transação(ões) com o mesmo nome foram categorizadas automaticamente.`);
      }
    }
  });
  const ignoreMut = trpc.bankStatement.ignoreRow.useMutation({ onSuccess: () => utils.bankStatement.listRows.invalidate() });
  const approveAllMut = trpc.bankStatement.approveAll.useMutation({
    onSuccess: () => {
      utils.bankStatement.listRows.invalidate();
      utils.bankStatement.listImports.invalidate();
    }
  });
  const deleteAllMut = trpc.bankStatement.deleteAllPending.useMutation({
    onSuccess: () => {
      utils.bankStatement.listRows.invalidate();
      utils.bankStatement.listImports.invalidate();
    }
  });

  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editProfile, setEditProfile] = useState<"Pessoal" | "Empresa">("Pessoal");
  const [approvingAll, setApprovingAll] = useState(false);

  const { data: userCategories = [] } = trpc.categories.list.useQuery();

  function openEdit(row: any) {
    setEditingRow(row);
    setEditDesc(row.suggestedDescription ?? row.description);
    setEditCat(row.suggestedCategory ?? "Outros");
    setEditProfile(row.suggestedProfile ?? "Pessoal");
  }

  async function handleApprove(row: any) {
    try {
      await approveMut.mutateAsync({
        rowId: row.id,
        description: row.suggestedDescription ?? row.description,
        category: row.suggestedCategory ?? "Outros",
        profile: row.suggestedProfile ?? "Pessoal",
        date: row.date,
        amount: row.amount,
        importId,
        originalDescription: row.description,
      });
    } catch (e: any) {
      Alert.alert("Erro", e?.message);
    }
  }

  async function handleApproveEdited() {
    if (!editingRow) return;
    try {
      await approveMut.mutateAsync({
        rowId: editingRow.id,
        description: editDesc,
        category: editCat,
        profile: editProfile,
        date: editingRow.date,
        amount: editingRow.amount,
        importId,
        originalDescription: editingRow.description,
      });
      setEditingRow(null);
    } catch (e: any) {
      Alert.alert("Erro", e?.message);
    }
  }

  async function handleApproveAll() {
    const highConf = rows.filter((r: any) => parseFloat(r.confidence ?? "0") >= 0.8);
    if (highConf.length === 0) { Alert.alert("Nenhum lançamento com alta confiança para aprovar."); return; }
    Alert.alert("Aprovar todos", `Aprovar ${highConf.length} lançamento(s) com alta confiança?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Aprovar", onPress: async () => {
          setApprovingAll(true);
          try { await approveAllMut.mutateAsync({ importId }); }
          catch (e: any) { Alert.alert("Erro", e?.message); }
          finally { setApprovingAll(false); }
        }
      },
    ]);
  }

  const transfers = rows.filter((r: any) => r.status === "pending" && r.isTransfer);
  const pending = rows.filter((r: any) => r.status === "pending" && !r.isTransfer);

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={[s.triageHeader, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={onBack} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          <IconSymbol name="chevron.left" size={20} color={colors.primary} />
        </Pressable>
        <Text style={[s.triageTitle, { color: colors.foreground }]}>
          Triagem — {pending.length} pendente{pending.length !== 1 ? "s" : ""}
        </Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Pressable
            onPress={handleApproveAll}
            disabled={approvingAll}
            style={({ pressed }) => [s.approveAllBtn, { backgroundColor: colors.primary, opacity: pressed || approvingAll ? 0.6 : 1 }]}
          >
            {approvingAll
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Aprovar Alta Confiança</Text>
            }
          </Pressable>
          <Pressable
            onPress={() => {
              Alert.alert("Apagar pendentes", "Apagar todos os lançamentos pendentes desta triagem?", [
                { text: "Cancelar", style: "cancel" },
                { text: "Apagar", style: "destructive", onPress: () => deleteAllMut.mutate({ importId }) },
              ]);
            }}
            disabled={deleteAllMut.isPending}
            style={({ pressed }) => [s.approveAllBtn, { backgroundColor: "#EF4444", opacity: pressed || deleteAllMut.isPending ? 0.6 : 1 }]}
          >
            {deleteAllMut.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Apagar Pendentes</Text>
            }
          </Pressable>
        </View>
      </View>

      {isLoading
        ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        : pending.length === 0
          ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <IconSymbol name="checkmark.circle.fill" size={48} color={colors.success} />
              <Text style={[{ color: colors.foreground, fontSize: 16, fontWeight: "600", marginTop: 12 }]}>Tudo revisado!</Text>
              {transfers.length > 0 && (
                <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6 }}>
                  {transfers.length} transferência{transfers.length !== 1 ? "s" : ""} ignorada{transfers.length !== 1 ? "s" : ""} automaticamente
                </Text>
              )}
              <Pressable onPress={onBack} style={[s.approveAllBtn, { backgroundColor: colors.primary, marginTop: 16 }]}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>Voltar</Text>
              </Pressable>
            </View>
          )
          : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              {transfers.length > 0 && (
                <View style={[s.transferBanner, { backgroundColor: colors.warning + "18", borderColor: colors.warning }]}>
                  <IconSymbol name="arrow.left.arrow.right" size={16} color={colors.warning} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.transferBannerTitle, { color: colors.foreground }]}>
                      {transfers.length} transferência{transfers.length !== 1 ? "s" : ""} detectada{transfers.length !== 1 ? "s" : ""}
                    </Text>
                    <Text style={[s.transferBannerSub, { color: colors.muted }]}>
                      Mesmo valor e data em contas diferentes — não geram despesa.
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => transfers.forEach((r: any) => ignoreMut.mutate({ rowId: r.id }))}
                    style={[s.transferIgnoreBtn, { backgroundColor: colors.warning }]}
                  >
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>Ignorar Todas</Text>
                  </Pressable>
                </View>
              )}
              {pending.map((row: any) => (
                <View key={row.id} style={[s.rowCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={s.rowTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rowDate, { color: colors.muted }]}>{row.date}</Text>
                      <Text style={[s.rowDesc, { color: colors.foreground }]} numberOfLines={2}>
                        {row.suggestedDescription ?? row.description}
                      </Text>
                    </View>
                    <Text style={[s.rowAmount, { color: row.type === "debit" ? colors.error : colors.success }]}>
                      {fmtAmount(row.amount, row.type)}
                    </Text>
                  </View>

                  <View style={s.rowMeta}>
                    <View style={[s.catChip, { backgroundColor: colors.accent }]}>
                      <Text style={[s.catChipText, { color: colors.primary }]}>{row.suggestedCategory ?? "Outros"}</Text>
                    </View>
                    <View style={[s.catChip, { backgroundColor: colors.accent }]}>
                      <Text style={[s.catChipText, { color: colors.primary }]}>{row.suggestedProfile ?? "Pessoal"}</Text>
                    </View>
                    <View style={[s.confChip, { backgroundColor: confidenceColor(row.confidence) + "22" }]}>
                      <View style={[s.confDot, { backgroundColor: confidenceColor(row.confidence) }]} />
                      <Text style={[s.confText, { color: confidenceColor(row.confidence) }]}>
                        {confidenceLabel(row.confidence)}
                      </Text>
                    </View>
                  </View>

                  <View style={s.rowActions}>
                    <Pressable
                      onPress={() => openEdit(row)}
                      style={({ pressed }) => [s.actionBtnOutline, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                    >
                      <IconSymbol name="pencil" size={14} color={colors.muted} />
                      <Text style={[s.actionBtnText, { color: colors.muted }]}>Editar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => ignoreMut.mutate({ rowId: row.id })}
                      style={({ pressed }) => [s.actionBtnOutline, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
                    >
                      <IconSymbol name="xmark" size={14} color={colors.error} />
                      <Text style={[s.actionBtnText, { color: colors.error }]}>Ignorar</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleApprove(row)}
                      style={({ pressed }) => [s.actionBtnFill, { backgroundColor: colors.primary, opacity: pressed ? 0.6 : 1 }]}
                    >
                      <IconSymbol name="checkmark" size={14} color="#fff" />
                      <Text style={[s.actionBtnText, { color: "#fff" }]}>Aprovar</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
          )
      }

      {/* Modal de edição */}
      <Modal visible={!!editingRow} transparent animationType="slide" onRequestClose={() => setEditingRow(null)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}>
          <View style={[s.editModal, { backgroundColor: colors.surface }]}>
            <Text style={[s.editModalTitle, { color: colors.foreground }]}>Editar Lançamento</Text>

            <Text style={[s.editLabel, { color: colors.muted }]}>Descrição</Text>
            <TextInput
              style={[s.editInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={editDesc} onChangeText={setEditDesc}
            />

            <Text style={[s.editLabel, { color: colors.muted }]}>Categoria</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {(userCategories as any[]).map((c: any) => (
                <Pressable key={c.id} onPress={() => setEditCat(c.name)}
                  style={[s.catSelectChip, {
                    backgroundColor: editCat === c.name ? c.color : colors.background,
                    borderColor: editCat === c.name ? c.color : colors.border,
                  }]}>
                  <Text style={{ color: editCat === c.name ? "#fff" : colors.muted, fontSize: 12 }}>{c.name}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Text style={[s.editLabel, { color: colors.muted }]}>Perfil</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
              {(["Pessoal", "Empresa"] as const).map((p) => (
                <Pressable key={p} onPress={() => setEditProfile(p)}
                  style={[s.catSelectChip, {
                    backgroundColor: editProfile === p ? colors.primary : colors.background,
                    borderColor: editProfile === p ? colors.primary : colors.border,
                  }]}>
                  <Text style={{ color: editProfile === p ? "#fff" : colors.muted, fontSize: 12 }}>{p}</Text>
                </Pressable>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => setEditingRow(null)}
                style={[s.editCancelBtn, { borderColor: colors.border, flex: 1 }]}>
                <Text style={{ color: colors.muted }}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={handleApproveEdited}
                style={[s.editSaveBtn, { backgroundColor: colors.primary, flex: 1 }]}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>Aprovar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Tela Principal ───────────────────────────────────────────────────────────

export default function StatementScreen() {
  const colors = useColors();
  const utils = trpc.useUtils();
  const { data: accounts = [] } = trpc.bankAccounts.list.useQuery();
  const { data: imports = [] } = trpc.bankStatement.listImports.useQuery();
  const uploadMut = trpc.bankStatement.upload.useMutation({
    onSuccess: () => utils.bankStatement.listImports.invalidate(),
  });

  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [triageImportId, setTriageImportId] = useState<number | null>(null);

  async function handleUpload() {
    if (!selectedAccount) { Alert.alert("Selecione uma conta antes de importar."); return; }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "text/csv", "text/comma-separated-values"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const fileName = asset.name ?? "extrato";
      const fileType = fileName.toLowerCase().endsWith(".csv") ? "csv" : "pdf";

      setUploading(true);
      let fileBase64 = "";
      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        const buffer = await response.arrayBuffer();
        fileBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      } else {
        fileBase64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      }

      const { importId, total, autoLearned } = await uploadMut.mutateAsync({
        accountId: selectedAccount,
        fileBase64,
        fileName,
        fileType,
      });
      const learnedMsg = autoLearned > 0 ? `\n${autoLearned} já categorizadas automaticamente pelo histórico.` : "";
      Alert.alert("Importado!", `${total} transação(ões) encontrada(s). Revise na triagem.${learnedMsg}`,
        [{ text: "Revisar agora", onPress: () => setTriageImportId(importId) }, { text: "Depois" }]);
    } catch (e: any) {
      Alert.alert("Erro", e?.message ?? "Falha ao importar extrato.");
    } finally {
      setUploading(false);
    }
  }

  if (triageImportId !== null) {
    return <TriageScreen importId={triageImportId} onBack={() => setTriageImportId(null)} />;
  }

  return (
    <ScreenContainer>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.foreground }]}>Extrato Bancário</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>

        {/* Selecionar conta */}
        <Text style={[s.sectionTitle, { color: colors.foreground }]}>Selecionar Conta</Text>
        {accounts.length === 0
          ? (
            <View style={[s.emptyBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                Nenhuma conta cadastrada. Adicione em Configurações → Contas Bancárias.
              </Text>
            </View>
          )
          : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {(accounts as any[]).map((acc: any) => (
                <Pressable
                  key={acc.id}
                  onPress={() => setSelectedAccount(acc.id)}
                  style={[
                    s.accountChip,
                    {
                      backgroundColor: selectedAccount === acc.id ? acc.color : colors.surface,
                      borderColor: selectedAccount === acc.id ? acc.color : colors.border,
                    },
                  ]}
                >
                  <View style={[s.accountDot, { backgroundColor: selectedAccount === acc.id ? "#fff" : acc.color }]} />
                  <View>
                    <Text style={[s.accountChipName, { color: selectedAccount === acc.id ? "#fff" : colors.foreground }]}>
                      {acc.name}
                    </Text>
                    <Text style={[s.accountChipBank, { color: selectedAccount === acc.id ? "rgba(255,255,255,0.7)" : colors.muted }]}>
                      {acc.bank} · {acc.profile}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          )
        }

        {/* Botão de upload */}
        <Pressable
          onPress={handleUpload}
          disabled={uploading || !selectedAccount}
          style={({ pressed }) => [
            s.uploadBtn,
            { backgroundColor: selectedAccount ? colors.primary : colors.border, opacity: pressed || uploading ? 0.7 : 1 },
          ]}
        >
          {uploading
            ? <ActivityIndicator color="#fff" />
            : <>
              <IconSymbol name="arrow.up.doc.fill" size={20} color="#fff" />
              <Text style={s.uploadBtnText}>Importar Extrato (PDF ou CSV)</Text>
            </>
          }
        </Pressable>

        {/* Histórico de importações */}
        {imports.length > 0 && (
          <>
            <Text style={[s.sectionTitle, { color: colors.foreground, marginTop: 24 }]}>Importações Anteriores</Text>
            {(imports as any[]).map((imp: any) => (
              <Pressable
                key={imp.id}
                onPress={() => setTriageImportId(imp.id)}
                style={({ pressed }) => [s.importCard, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.importFileName, { color: colors.foreground }]} numberOfLines={1}>{imp.fileName}</Text>
                  <Text style={[s.importMeta, { color: colors.muted }]}>
                    {new Date(imp.importedAt).toLocaleDateString("pt-BR")} · {imp.totalRows} transações · {imp.imported} aprovadas
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={16} color={colors.muted} />
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const s = StyleSheet.create({
  header: { padding: 16, borderBottomWidth: 1 },
  headerTitle: { fontSize: 22, fontWeight: "800" },
  sectionTitle: { fontSize: 13, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 },
  emptyBox: { padding: 14, borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  accountChip: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, marginRight: 10,
  },
  accountDot: { width: 8, height: 8, borderRadius: 4 },
  accountChipName: { fontSize: 14, fontWeight: "600" },
  accountChipBank: { fontSize: 11, marginTop: 1 },
  uploadBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    padding: 16, borderRadius: 12, marginBottom: 8,
  },
  uploadBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  importCard: {
    flexDirection: "row", alignItems: "center", padding: 14,
    borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  importFileName: { fontSize: 14, fontWeight: "600" },
  importMeta: { fontSize: 12, marginTop: 2 },
  // Triage
  triageHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1,
  },
  triageTitle: { fontSize: 15, fontWeight: "700", flex: 1, marginLeft: 8 },
  approveAllBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  rowCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  rowDate: { fontSize: 11, marginBottom: 2 },
  rowDesc: { fontSize: 14, fontWeight: "600" },
  rowAmount: { fontSize: 15, fontWeight: "700", flexShrink: 0 },
  rowMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  catChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  catChipText: { fontSize: 11, fontWeight: "600" },
  confChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  confDot: { width: 6, height: 6, borderRadius: 3 },
  confText: { fontSize: 11, fontWeight: "600" },
  rowActions: { flexDirection: "row", gap: 6 },
  actionBtnOutline: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, borderWidth: 1, flex: 1, justifyContent: "center",
  },
  actionBtnFill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7, flex: 1, justifyContent: "center",
  },
  actionBtnText: { fontSize: 12, fontWeight: "600" },
  editModal: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  editModalTitle: { fontSize: 17, fontWeight: "700", marginBottom: 16 },
  editLabel: { fontSize: 12, fontWeight: "600", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  editInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 12 },
  catSelectChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, marginRight: 6 },
  editCancelBtn: { paddingVertical: 12, borderRadius: 10, borderWidth: 1, alignItems: "center" },
  editSaveBtn: { paddingVertical: 12, borderRadius: 10, alignItems: "center" },
  transferBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 12,
  },
  transferBannerTitle: { fontSize: 13, fontWeight: "700" },
  transferBannerSub: { fontSize: 11, marginTop: 2 },
  transferIgnoreBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
});
