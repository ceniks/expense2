import {
  Text, View, Pressable, StyleSheet, ScrollView, Modal,
  Alert, ActivityIndicator, TextInput, Platform,
} from "react-native";
import { useState } from "react";

// No web, Alert.alert não funciona — usa window.alert/confirm nativos do browser
function showAlert(title: string, message?: string) {
  if (Platform.OS === "web") {
    window.alert(message ? `${title}\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

function showConfirm(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === "web") {
    if (window.confirm(`${title}\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: "Cancelar", style: "cancel" },
      { text: "Confirmar", style: "destructive", onPress: onConfirm },
    ]);
  }
}
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
        showAlert("Aprendizado aplicado", `${data.propagated} transação(ões) com o mesmo nome foram categorizadas automaticamente.`);
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
  const revertMut = trpc.bankStatement.revertRow.useMutation({
    onSuccess: () => {
      utils.bankStatement.listRows.invalidate();
      utils.bankStatement.listImports.invalidate();
    }
  });

  const bulkApproveMut = trpc.bankStatement.bulkApprove.useMutation({
    onSuccess: () => {
      utils.bankStatement.listRows.invalidate();
      utils.bankStatement.listImports.invalidate();
      setSelectedIds(new Set());
    }
  });

  const bulkRevertMut = trpc.bankStatement.bulkRevert.useMutation({
    onSuccess: () => {
      utils.bankStatement.listRows.invalidate();
      utils.bankStatement.listImports.invalidate();
      setSelectedRevertIds(new Set());
    }
  });

  const applyAIMut = trpc.bankStatement.applyAIInstruction.useMutation({
    onSuccess: (data) => {
      utils.bankStatement.listRows.invalidate();
      setAiInstruction("");
      if (data.updated > 0) {
        showAlert("IA aplicada", `${data.updated} transação(ões) foram recategorizadas. Revise e aprove.`);
      } else {
        showAlert("Nenhuma correspondência", "A IA não encontrou transações que se encaixem na instrução.");
      }
    },
    onError: (e) => showAlert("Erro", e.message),
  });

  const [aiInstruction, setAiInstruction] = useState("");
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editCat, setEditCat] = useState("");
  const [editProfile, setEditProfile] = useState<"Pessoal" | "Empresa">("Pessoal");
  const [approvingAll, setApprovingAll] = useState(false);

  // Seleção múltipla (pendentes)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCat, setBulkCat] = useState("");
  const [bulkProfile, setBulkProfile] = useState<"Pessoal" | "Empresa">("Pessoal");

  // Seleção múltipla (aprovados para estorno)
  const [selectedRevertIds, setSelectedRevertIds] = useState<Set<number>>(new Set());

  function toggleRevertSelect(id: number) {
    setSelectedRevertIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0 || !bulkCat) {
      showAlert("Selecione uma categoria antes de aprovar.");
      return;
    }
    try {
      await bulkApproveMut.mutateAsync({
        rowIds: Array.from(selectedIds),
        category: bulkCat,
        profile: bulkProfile,
        importId,
      });
    } catch (e: any) {
      showAlert("Erro", e?.message);
    }
  }

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
      showAlert("Erro", e?.message);
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
      showAlert("Erro", e?.message);
    }
  }

  async function handleApproveAll() {
    const highConf = rows.filter((r: any) => parseFloat(r.confidence ?? "0") >= 0.8);
    if (highConf.length === 0) { showAlert("Nenhum lançamento com alta confiança para aprovar."); return; }
    showConfirm("Aprovar todos", `Aprovar ${highConf.length} lançamento(s) com alta confiança?`, async () => {
      setApprovingAll(true);
      try { await approveAllMut.mutateAsync({ importId }); }
      catch (e: any) { showAlert("Erro", e?.message); }
      finally { setApprovingAll(false); }
    });
  }

  const transfers = rows.filter((r: any) => r.status === "pending" && r.isTransfer);
  const pending = rows.filter((r: any) => r.status === "pending" && !r.isTransfer);
  const approved = rows.filter((r: any) => r.status === "approved");
  const [showApproved, setShowApproved] = useState(false);

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
      </View>

      {isLoading
        ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        : pending.length === 0
          ? (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, alignItems: "center" }}>
              <IconSymbol name="checkmark.circle.fill" size={48} color={colors.success} style={{ marginTop: 32 }} />
              <Text style={[{ color: colors.foreground, fontSize: 16, fontWeight: "600", marginTop: 12 }]}>Tudo revisado!</Text>
              {transfers.length > 0 && (
                <Text style={{ color: colors.muted, fontSize: 13, marginTop: 6 }}>
                  {transfers.length} transferência{transfers.length !== 1 ? "s" : ""} ignorada{transfers.length !== 1 ? "s" : ""} automaticamente
                </Text>
              )}
              <Pressable onPress={onBack} style={[s.approveAllBtn, { backgroundColor: colors.primary, marginTop: 16 }]}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>Voltar</Text>
              </Pressable>

              {/* Aprovados para estorno mesmo sem pendentes */}
              {approved.length > 0 && (
                <View style={{ width: "100%", marginTop: 24 }}>
                  <Pressable
                    onPress={() => setShowApproved(v => !v)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 4 }}
                  >
                    <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 13 }}>
                      {approved.length} aprovado{approved.length !== 1 ? "s" : ""} — toque para ver / estornar
                    </Text>
                    <IconSymbol name={showApproved ? "chevron.up" : "chevron.down"} size={14} color={colors.muted} />
                  </Pressable>
                  {showApproved && approved.map((row: any) => {
                    const isRevertSelected = selectedRevertIds.has(row.id);
                    return (
                    <View key={row.id} style={[s.rowCard, { backgroundColor: colors.surface, borderColor: isRevertSelected ? colors.error : colors.border, borderWidth: isRevertSelected ? 2 : 1, opacity: 0.9, width: "100%" }]}>
                      <View style={s.rowTop}>
                        <Pressable
                          onPress={() => toggleRevertSelect(row.id)}
                          style={{ marginRight: 10, marginTop: 2, width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: isRevertSelected ? colors.error : colors.border, backgroundColor: isRevertSelected ? colors.error : "transparent", alignItems: "center", justifyContent: "center" }}
                        >
                          {isRevertSelected && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900", lineHeight: 15 }}>✓</Text>}
                        </Pressable>
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
                          <Text style={[s.catChipText, { color: colors.primary }]}>{row.suggestedCategory ?? "—"}</Text>
                        </View>
                        <View style={[s.catChip, { backgroundColor: "#10B98122" }]}>
                          <Text style={[s.catChipText, { color: "#10B981" }]}>Aprovado</Text>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => showConfirm("Estornar lançamento", `Desfazer aprovação de "${row.suggestedDescription ?? row.description}"? O pagamento será deletado e o lançamento voltará para pendente.`, () => revertMut.mutate({ rowId: row.id }))}
                        style={({ pressed }) => [s.actionBtnOutline, { borderColor: colors.error, opacity: pressed ? 0.6 : 1, justifyContent: "center" }]}
                      >
                        <IconSymbol name="arrow.uturn.backward" size={14} color={colors.error} />
                        <Text style={[s.actionBtnText, { color: colors.error }]}>Estornar</Text>
                      </Pressable>
                    </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          )
          : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              {/* Campo instrução IA */}
              <View style={{ backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <Text style={{ fontSize: 16 }}>✨</Text>
                  <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>Instrução para IA</Text>
                </View>
                <TextInput
                  value={aiInstruction}
                  onChangeText={setAiInstruction}
                  placeholder='Ex: transações com "cancelado" → Estorno'
                  placeholderTextColor={colors.muted}
                  multiline
                  style={{ color: colors.foreground, fontSize: 13, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, minHeight: 60, backgroundColor: colors.background }}
                />
                <Pressable
                  onPress={() => {
                    if (!aiInstruction.trim()) { showAlert("Digite uma instrução para a IA."); return; }
                    applyAIMut.mutate({ importId, instruction: aiInstruction.trim() });
                  }}
                  disabled={applyAIMut.isPending}
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.primary, borderRadius: 8, padding: 10, marginTop: 8, opacity: pressed || applyAIMut.isPending ? 0.6 : 1 })}
                >
                  {applyAIMut.isPending
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Aplicar IA nas transações pendentes</Text>
                  }
                </Pressable>
              </View>

              {/* Botão apagar todos pendentes */}
              <Pressable
                onPress={() => showConfirm("Apagar pendentes", "Apagar todos os lançamentos pendentes desta triagem?", () => deleteAllMut.mutate({ importId }))}
                disabled={deleteAllMut.isPending}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#EF4444", borderRadius: 10, padding: 12, marginBottom: 12, opacity: deleteAllMut.isPending ? 0.6 : 1 }}
              >
                {deleteAllMut.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Apagar todos os pendentes</Text>
                }
              </Pressable>
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
              {pending.map((row: any) => {
                const isSelected = selectedIds.has(row.id);
                return (
                <View key={row.id} style={[s.rowCard, { backgroundColor: colors.surface, borderColor: isSelected ? colors.primary : colors.border, borderWidth: isSelected ? 2 : 1 }]}>
                  <View style={s.rowTop}>
                    {/* Checkbox de seleção */}
                    <Pressable
                      onPress={() => toggleSelect(row.id)}
                      style={{ marginRight: 10, marginTop: 2, width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : "transparent", alignItems: "center", justifyContent: "center" }}
                    >
                      {isSelected && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900", lineHeight: 15 }}>✓</Text>}
                    </Pressable>
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
                );
              })}

              {/* Seção de aprovados — para estorno */}
              {approved.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Pressable
                    onPress={() => setShowApproved(v => !v)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 4 }}
                  >
                    <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 13 }}>
                      {approved.length} aprovado{approved.length !== 1 ? "s" : ""} — toque para ver / estornar
                    </Text>
                    <IconSymbol name={showApproved ? "chevron.up" : "chevron.down"} size={14} color={colors.muted} />
                  </Pressable>
                  {showApproved && approved.map((row: any) => {
                    const isRevertSelected = selectedRevertIds.has(row.id);
                    return (
                    <View key={row.id} style={[s.rowCard, { backgroundColor: colors.surface, borderColor: isRevertSelected ? colors.error : colors.border, borderWidth: isRevertSelected ? 2 : 1, opacity: 0.9 }]}>
                      <View style={s.rowTop}>
                        <Pressable
                          onPress={() => toggleRevertSelect(row.id)}
                          style={{ marginRight: 10, marginTop: 2, width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: isRevertSelected ? colors.error : colors.border, backgroundColor: isRevertSelected ? colors.error : "transparent", alignItems: "center", justifyContent: "center" }}
                        >
                          {isRevertSelected && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "900", lineHeight: 15 }}>✓</Text>}
                        </Pressable>
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
                          <Text style={[s.catChipText, { color: colors.primary }]}>{row.suggestedCategory ?? "—"}</Text>
                        </View>
                        <View style={[s.catChip, { backgroundColor: "#10B98122" }]}>
                          <Text style={[s.catChipText, { color: "#10B981" }]}>Aprovado</Text>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => showConfirm("Estornar lançamento", `Desfazer aprovação de "${row.suggestedDescription ?? row.description}"? O pagamento será deletado e o lançamento voltará para pendente.`, () => revertMut.mutate({ rowId: row.id }))}
                        style={({ pressed }) => [s.actionBtnOutline, { borderColor: colors.error, opacity: pressed ? 0.6 : 1, justifyContent: "center" }]}
                      >
                        <IconSymbol name="arrow.uturn.backward" size={14} color={colors.error} />
                        <Text style={[s.actionBtnText, { color: colors.error }]}>Estornar</Text>
                      </Pressable>
                    </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          )
      }

      {/* Barra de ação em massa */}
      {selectedIds.size > 0 && (
        <View style={[s.bulkBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>
              {selectedIds.size} selecionado{selectedIds.size !== 1 ? "s" : ""}
            </Text>
            <Pressable onPress={() => setSelectedIds(new Set())}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Limpar</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
            {(["Pessoal", "Empresa"] as const).map((p) => (
              <Pressable key={p} onPress={() => { setBulkProfile(p); setBulkCat(""); }}
                style={[s.catSelectChip, {
                  backgroundColor: bulkProfile === p ? colors.primary : colors.background,
                  borderColor: bulkProfile === p ? colors.primary : colors.border,
                }]}>
                <Text style={{ color: bulkProfile === p ? "#fff" : colors.muted, fontSize: 12 }}>{p}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={[s.editLabel, { color: colors.muted, marginBottom: 6 }]}>Categoria</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {(userCategories as any[]).filter((c: any) => c.profile === bulkProfile).map((c: any) => (
              <Pressable key={c.id} onPress={() => setBulkCat(c.name)}
                style={[s.catSelectChip, {
                  backgroundColor: bulkCat === c.name ? c.color : colors.background,
                  borderColor: bulkCat === c.name ? c.color : colors.border,
                }]}>
                <Text style={{ color: bulkCat === c.name ? "#fff" : colors.muted, fontSize: 12 }}>{c.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            onPress={handleBulkApprove}
            disabled={bulkApproveMut.isPending || !bulkCat}
            style={[s.editSaveBtn, { backgroundColor: bulkCat ? colors.primary : colors.border, opacity: bulkApproveMut.isPending ? 0.6 : 1 }]}
          >
            {bulkApproveMut.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                  Aprovar {selectedIds.size} lançamento{selectedIds.size !== 1 ? "s" : ""}
                </Text>
            }
          </Pressable>
        </View>
      )}

      {/* Barra de estorno em massa */}
      {selectedRevertIds.size > 0 && (
        <View style={[s.bulkBar, { backgroundColor: colors.surface, borderTopColor: colors.error }]}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 14 }}>
              {selectedRevertIds.size} selecionado{selectedRevertIds.size !== 1 ? "s" : ""} para estorno
            </Text>
            <Pressable onPress={() => setSelectedRevertIds(new Set())}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Limpar</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => showConfirm(
              "Estornar em massa",
              `Estornar ${selectedRevertIds.size} lançamento${selectedRevertIds.size !== 1 ? "s" : ""}? Os pagamentos serão deletados e os lançamentos voltarão para pendente.`,
              () => bulkRevertMut.mutate({ rowIds: Array.from(selectedRevertIds) })
            )}
            disabled={bulkRevertMut.isPending}
            style={[s.editSaveBtn, { backgroundColor: colors.error, opacity: bulkRevertMut.isPending ? 0.6 : 1 }]}
          >
            {bulkRevertMut.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                  Estornar {selectedRevertIds.size} lançamento{selectedRevertIds.size !== 1 ? "s" : ""}
                </Text>
            }
          </Pressable>
        </View>
      )}

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
              {(userCategories as any[]).filter((c: any) => c.profile === editProfile).map((c: any) => (
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
                <Pressable key={p} onPress={() => { setEditProfile(p); setEditCat(""); }}
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
  const { data: accountMaxDates = [], refetch: refetchMaxDates } = trpc.bankStatement.accountMaxDates.useQuery();
  const uploadMut = trpc.bankStatement.upload.useMutation({
    onSuccess: () => {
      utils.bankStatement.listImports.invalidate();
      refetchMaxDates();
    },
  });

  function getMaxDateForAccount(accountId: number): string | null {
    const entry = (accountMaxDates as any[]).find((r: any) => r.accountId === accountId);
    if (!entry?.maxDate) return null;
    const [y, m, d] = entry.maxDate.split("-");
    return `${d}/${m}/${y}`;
  }

  const [selectedAccount, setSelectedAccount] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [triageImportId, setTriageImportId] = useState<number | null>(null);

  async function handleUpload() {
    if (!selectedAccount) { showAlert("Selecione uma conta antes de importar."); return; }
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
        const fileObj = (asset as any).file as File | undefined;
        if (fileObj) {
          fileBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(fileObj);
          });
        } else {
          const response = await fetch(asset.uri);
          const buffer = await response.arrayBuffer();
          // Converter em chunks para não estourar o call stack em arquivos grandes
          const bytes = new Uint8Array(buffer);
          let binary = "";
          const chunk = 8192;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
          }
          fileBase64 = btoa(binary);
        }
      } else {
        fileBase64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      }

      const { importId, total, autoLearned, overlappingDates, existingMaxDate } = await uploadMut.mutateAsync({
        accountId: selectedAccount,
        fileBase64,
        fileName,
        fileType,
      });
      const learnedMsg = autoLearned > 0 ? `\n${autoLearned} já categorizadas automaticamente pelo histórico.` : "";
      const overlapMsg = overlappingDates && existingMaxDate
        ? `\n\n⚠️ Atenção: esta conta já tinha dados até ${existingMaxDate.slice(8, 10)}/${existingMaxDate.slice(5, 7)}/${existingMaxDate.slice(0, 4)}. Verifique se há lançamentos duplicados na triagem.`
        : "";
      showConfirm("Importado!", `${total} transação(ões) encontrada(s). Revise na triagem.${learnedMsg}${overlapMsg}\n\nAbrir triagem agora?`,
        () => setTriageImportId(importId));
    } catch (e: any) {
      showAlert("Erro", e?.message ?? "Falha ao importar extrato.");
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
                    {getMaxDateForAccount(acc.id) && (
                      <Text style={{ fontSize: 10, color: selectedAccount === acc.id ? "rgba(255,255,255,0.85)" : "#22C55E", marginTop: 1 }}>
                        ✓ até {getMaxDateForAccount(acc.id)}
                      </Text>
                    )}
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
                  {imp.minDate && imp.maxDate && (
                    <Text style={[s.importMeta, { color: colors.primary, marginTop: 2 }]}>
                      {imp.minDate === imp.maxDate
                        ? `📅 ${imp.minDate.slice(8, 10)}/${imp.minDate.slice(5, 7)}/${imp.minDate.slice(0, 4)}`
                        : `📅 ${imp.minDate.slice(8, 10)}/${imp.minDate.slice(5, 7)}/${imp.minDate.slice(0, 4)} a ${imp.maxDate.slice(8, 10)}/${imp.maxDate.slice(5, 7)}/${imp.maxDate.slice(0, 4)}`
                      }
                    </Text>
                  )}
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
  bulkBar: {
    padding: 16, borderTopWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 8,
  },
});
