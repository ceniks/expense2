import {
  Text,
  View,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  StyleSheet,
  Modal,
  ScrollView,
  Platform,
  ActivityIndicator,
  Share,
  Clipboard,
} from "react-native";
import { useState, useEffect } from "react";
import * as Haptics from "expo-haptics";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { usePayments, CustomCategory } from "@/lib/payments-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useAuthContext } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

const PRESET_COLORS = [
  "#FF6B6B", "#FF8E53", "#FECA57", "#48DBFB", "#FF9FF3",
  "#54A0FF", "#5F27CD", "#00D2D3", "#01CBC6", "#10AC84",
  "#EE5A24", "#C8D6E5", "#576574", "#222F3E", "#8395A7",
  "#6C5CE7", "#A29BFE", "#FD79A8", "#FDCB6E", "#00B894",
  "#E17055", "#74B9FF", "#0984E3", "#B2BEC3", "#DFE6E9",
];

function ColorPicker({ selected, onSelect }: { selected: string; onSelect: (color: string) => void }) {
  return (
    <View style={styles.colorGrid}>
      {PRESET_COLORS.map((c) => (
        <Pressable
          key={c}
          onPress={() => onSelect(c)}
          style={({ pressed }) => [
            styles.colorSwatch,
            { backgroundColor: c, opacity: pressed ? 0.7 : 1 },
            selected === c && styles.colorSwatchSelected,
          ]}
        >
          {selected === c && (
            <IconSymbol name="checkmark.circle.fill" size={16} color="#FFFFFF" />
          )}
        </Pressable>
      ))}
    </View>
  );
}

interface CategoryModalProps {
  visible: boolean;
  initial?: CustomCategory;
  onClose: () => void;
  onSave: (name: string, color: string) => Promise<void>;
}

function CategoryModal({ visible, initial, onClose, onSave }: CategoryModalProps) {
  const colors = useColors();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  // Sync state whenever the modal opens or the category changes
  // useEffect is used instead of onShow because onShow is unreliable on web
  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? "");
      setColor(initial?.color ?? PRESET_COLORS[0]);
      setSaving(false);
    }
  }, [visible, initial]);

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert("Campo obrigatório", "Informe um nome para a categoria.");
      return;
    }
    setSaving(true);
    try {
      await onSave(name.trim(), color);
    } catch {
      // onSave already shows errors; just reset saving state
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <Pressable onPress={onClose} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={[styles.modalCancel, { color: colors.muted }]}>Cancelar</Text>
          </Pressable>
          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {initial ? "Editar Categoria" : "Nova Categoria"}
          </Text>
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

        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
          <View style={styles.previewRow}>
            <View style={[styles.previewBadge, { backgroundColor: color + "22" }]}>
              <View style={[styles.previewDot, { backgroundColor: color }]} />
              <Text style={[styles.previewText, { color }]}>{name || "Categoria"}</Text>
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.muted }]}>Nome da categoria</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
              value={name}
              onChangeText={setName}
              placeholder="Ex: Assinaturas, Pet, Investimentos..."
              placeholderTextColor={colors.muted}
              autoFocus
              returnKeyType="done"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.muted }]}>Cor</Text>
            <ColorPicker selected={color} onSelect={setColor} />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Sharing Section ──────────────────────────────────────────────────────────

function SharingSection() {
  const colors = useColors();
  const { user } = useAuthContext();
  const utils = trpc.useUtils();

  const { data: group, isLoading, refetch } = trpc.sharing.myGroup.useQuery(undefined, {
    enabled: !!user,
  });

  const joinMutation = trpc.sharing.joinGroup.useMutation({
    onSuccess: () => {
      utils.sharing.myGroup.invalidate();
      utils.payments.list.invalidate();
      utils.categories.list.invalidate();
      setJoinCode("");
      setShowJoinInput(false);
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("✅ Grupo unido!", "Agora você compartilha dados com os membros deste grupo.");
    },
    onError: (err) => Alert.alert("Erro", err.message),
  });

  const leaveMutation = trpc.sharing.leaveGroup.useMutation({
    onSuccess: () => {
      utils.sharing.myGroup.invalidate();
      utils.payments.list.invalidate();
      utils.categories.list.invalidate();
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Saiu do grupo", "Seus dados agora são privados novamente.");
    },
    onError: (err) => Alert.alert("Erro", err.message),
  });

  const regenMutation = trpc.sharing.regenerateCode.useMutation({
    onSuccess: () => {
      utils.sharing.myGroup.invalidate();
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    },
    onError: (err) => Alert.alert("Erro", err.message),
  });

  const [showJoinInput, setShowJoinInput] = useState(false);
  const [joinCode, setJoinCode] = useState("");

  if (!user) return null;

  function handleCopyCode() {
    if (!group) return;
    if (Platform.OS === "web") {
      navigator.clipboard?.writeText(group.inviteCode).catch(() => {});
    } else {
      Clipboard.setString(group.inviteCode);
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Copiado!", `Código "${group.inviteCode}" copiado para a área de transferência.`);
  }

  function handleShareCode() {
    if (!group) return;
    Share.share({
      message: `Entre no meu grupo no GastoPix para compartilharmos os gastos!\n\nCódigo de convite: ${group.inviteCode}\n\nAcesse: https://expensetrk-ajmw55p7.manus.space`,
      title: "Convite GastoPix",
    });
  }

  function handleJoin() {
    if (!joinCode.trim()) return;
    joinMutation.mutate({ inviteCode: joinCode.trim() });
  }

  function handleLeave() {
    Alert.alert(
      "Sair do grupo",
      "Ao sair, seus pagamentos e categorias serão movidos para um grupo privado. Os dados dos outros membros permanecem no grupo.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Sair", style: "destructive", onPress: () => leaveMutation.mutate() },
      ]
    );
  }

  function handleRegenCode() {
    Alert.alert(
      "Regenerar código",
      "O código atual deixará de funcionar. Deseja continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Regenerar", onPress: () => regenMutation.mutate() },
      ]
    );
  }

  const isShared = group && group.members.length > 1;
  const isCreator = group && group.createdByUserId === (user as any)?.id;

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}>
      {/* Section title */}
      <View style={[styles.sectionHeader, { paddingHorizontal: 0, paddingTop: 16 }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Compartilhamento</Text>
      </View>
      <Text style={[styles.sectionSubtitle, { color: colors.muted, paddingHorizontal: 0, paddingBottom: 12 }]}>
        Compartilhe seus dados com outra conta
      </Text>

      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 12 }} />
      ) : group ? (
        <View style={[styles.sharingCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Group status badge */}
          <View style={styles.groupStatusRow}>
            <View style={[styles.groupStatusBadge, { backgroundColor: isShared ? colors.success + "20" : colors.primary + "15" }]}>
              <View style={[styles.groupStatusDot, { backgroundColor: isShared ? colors.success : colors.primary }]} />
              <Text style={[styles.groupStatusText, { color: isShared ? colors.success : colors.primary }]}>
                {isShared ? `Grupo compartilhado · ${group.members.length} membros` : "Grupo privado"}
              </Text>
            </View>
          </View>

          {/* Invite code */}
          <View style={[styles.inviteCodeBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.inviteCodeLabel, { color: colors.muted }]}>Código de convite</Text>
              <Text style={[styles.inviteCode, { color: colors.foreground }]}>{group.inviteCode}</Text>
            </View>
            <View style={styles.inviteCodeActions}>
              <Pressable
                onPress={handleCopyCode}
                style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <IconSymbol name="doc.on.doc" size={18} color={colors.primary} />
              </Pressable>
              <Pressable
                onPress={handleShareCode}
                style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}
              >
                <IconSymbol name="square.and.arrow.up" size={18} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          {/* Members list */}
          {isShared && (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={[styles.membersLabel, { color: colors.muted }]}>Membros</Text>
              {group.members.map((m) => (
                <View key={m.id} style={styles.memberRow}>
                  <View style={[styles.memberAvatar, { backgroundColor: colors.primary + "20" }]}>
                    <Text style={[styles.memberAvatarText, { color: colors.primary }]}>
                      {(m.name ?? m.email ?? "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.memberName, { color: colors.foreground }]} numberOfLines={1}>
                      {m.name ?? "Usuário"}
                    </Text>
                    {m.email && (
                      <Text style={[styles.memberEmail, { color: colors.muted }]} numberOfLines={1}>
                        {m.email}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Action buttons */}
          <View style={[styles.sharingActions, { borderTopColor: colors.border }]}>
            {!showJoinInput ? (
              <Pressable
                onPress={() => setShowJoinInput(true)}
                style={({ pressed }) => [styles.sharingActionBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
              >
                <IconSymbol name="person.badge.plus" size={16} color="#FFF" />
                <Text style={styles.sharingActionBtnText}>Entrar com código</Text>
              </Pressable>
            ) : (
              <View style={styles.joinInputRow}>
                <TextInput
                  style={[styles.joinInput, { backgroundColor: colors.background, borderColor: colors.border, color: colors.foreground }]}
                  value={joinCode}
                  onChangeText={(t) => setJoinCode(t.toUpperCase())}
                  placeholder="Ex: AB3X7YQZ"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="characters"
                  maxLength={8}
                  returnKeyType="done"
                  onSubmitEditing={handleJoin}
                  autoFocus
                />
                <Pressable
                  onPress={handleJoin}
                  style={({ pressed }) => [styles.joinConfirmBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                >
                  {joinMutation.isPending ? (
                    <ActivityIndicator color="#FFF" size="small" />
                  ) : (
                    <Text style={styles.joinConfirmText}>Entrar</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => { setShowJoinInput(false); setJoinCode(""); }}
                  style={({ pressed }) => [styles.joinCancelBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                >
                  <Text style={[styles.joinCancelText, { color: colors.muted }]}>✕</Text>
                </Pressable>
              </View>
            )}

            {isShared && (
              <Pressable
                onPress={handleLeave}
                style={({ pressed }) => [styles.sharingActionBtn, { backgroundColor: colors.error + "15", opacity: pressed ? 0.8 : 1 }]}
              >
                <IconSymbol name="person.fill.xmark" size={16} color={colors.error} />
                <Text style={[styles.sharingActionBtnText, { color: colors.error }]}>Sair do grupo</Text>
              </Pressable>
            )}

            {isCreator && (
              <Pressable
                onPress={handleRegenCode}
                style={({ pressed }) => [styles.sharingActionBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
              >
                <IconSymbol name="arrow.clockwise" size={16} color={colors.muted} />
                <Text style={[styles.sharingActionBtnText, { color: colors.muted }]}>Novo código</Text>
              </Pressable>
            )}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─── Data Migration Section ──────────────────────────────────────────────────

function DataMigrationSection() {
  const colors = useColors();
  const { payments, categories } = usePayments();
  const { user } = useAuthContext();
  const utils = trpc.useUtils();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);

  const importMutation = trpc.importData.useMutation({
    onSuccess: (result) => {
      utils.payments.list.invalidate();
      utils.categories.list.invalidate();
      utils.financings.list.invalidate();
      utils.monthlyBills.list.invalidate();
      const msg = [
        result.paymentsImported > 0 ? `${result.paymentsImported} pagamento(s)` : null,
        result.categoriesImported > 0 ? `${result.categoriesImported} categoria(s)` : null,
        result.financingsImported > 0 ? `${result.financingsImported} financiamento(s)` : null,
        result.monthlyBillsImported > 0 ? `${result.monthlyBillsImported} conta(s) mensal(is)` : null,
      ].filter(Boolean).join(", ");
      setImportResult(msg ? `✅ Importado: ${msg}` : "✅ Nenhum dado novo encontrado.");
      if (result.errors.length > 0) {
        setImportResult((prev) => `${prev}\n⚠️ ${result.errors.length} erro(s): ${result.errors.slice(0, 3).join("; ")}`);
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err) => {
      setImportResult(`❌ Erro: ${err.message}`);
    },
    onSettled: () => setImporting(false),
  });

  async function handleExport() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExporting(true);
    try {
      // Fetch financings and monthly bills from server
      const financingsData = await utils.client.financings.list.query();
      const billsData = await utils.client.monthlyBills.list.query();

      const exportData = {
        exportedAt: new Date().toISOString(),
        version: 1,
        payments: payments.map((p) => ({
          description: p.description,
          amount: p.amount,
          date: p.date,
          category: p.category,
          profile: p.profile,
          notes: p.notes ?? null,
          imageUri: p.imageUri ?? null,
        })),
        categories: categories
          .filter((c) => ![
            "alimentacao","transporte","saude","moradia","lazer",
            "educacao","vestuario","servicos","outros"
          ].includes(c.id))
          .map((c) => ({ name: c.name, color: c.color })),
        financings: (financingsData ?? []).map((f: any) => ({
          name: f.name,
          totalAmount: parseFloat(f.totalAmount),
          installmentAmount: parseFloat(f.installmentAmount),
          totalInstallments: f.totalInstallments,
          paidInstallments: f.paidInstallments,
          startDate: f.startDate,
          dueDay: f.dueDay,
          category: f.category ?? "Financiamento",
          profile: f.profile ?? "Pessoal",
          notes: f.notes ?? null,
        })),
        monthlyBills: (billsData ?? []).map((b: any) => ({
          name: b.name,
          amount: parseFloat(b.amount),
          dueDay: b.dueDay,
          category: b.category ?? "Contas",
          profile: b.profile ?? "Pessoal",
          notes: b.notes ?? null,
        })),
      };

      const json = JSON.stringify(exportData, null, 2);
      const total = exportData.payments.length + exportData.financings.length + exportData.monthlyBills.length;

      if (Platform.OS === "web") {
        // Web: trigger download via anchor element
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `gastopix-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert("✅ Exportado!", `${total} registro(s) exportado(s) para arquivo JSON.`);
      } else {
        // Mobile: save to temp file and share
        const path = `${FileSystem.cacheDirectory}gastopix-backup-${Date.now()}.json`;
        await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Exportar dados GastoPix" });
        } else {
          Alert.alert("Exportado", `Arquivo salvo em: ${path}`);
        }
      }
    } catch (err: any) {
      Alert.alert("Erro ao exportar", err?.message ?? "Tente novamente.");
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    if (!user) {
      Alert.alert("Login necessário", "Faça login para importar dados para a nuvem.");
      return;
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImporting(true);
    setImportResult(null);
    try {
      let json: string;

      if (Platform.OS === "web") {
        // Web: use file input
        json = await new Promise<string>((resolve, reject) => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".json,application/json";
          input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) { reject(new Error("Nenhum arquivo selecionado")); return; }
            const text = await file.text();
            resolve(text);
          };
          input.oncancel = () => reject(new Error("Cancelado"));
          input.click();
        });
      } else {
        // Mobile: use document picker
        const result = await DocumentPicker.getDocumentAsync({
          type: "application/json",
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.[0]) {
          setImporting(false);
          return;
        }
        json = await FileSystem.readAsStringAsync(result.assets[0].uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      const data = JSON.parse(json);
      if (!data || typeof data !== "object") throw new Error("Arquivo inválido");

      importMutation.mutate({
        payments: Array.isArray(data.payments) ? data.payments : [],
        categories: Array.isArray(data.categories) ? data.categories : [],
        financings: Array.isArray(data.financings) ? data.financings : [],
        monthlyBills: Array.isArray(data.monthlyBills) ? data.monthlyBills : [],
      });
    } catch (err: any) {
      if (err?.message !== "Cancelado") {
        setImportResult(`❌ Erro: ${err?.message ?? "Arquivo inválido"}`);
      }
      setImporting(false);
    }
  }

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 16, gap: 12 }}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Exportar / Importar</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.muted, paddingHorizontal: 0 }]}>
        Exporte seus dados como JSON para backup ou para migrar para outra conta.
      </Text>

      <View style={{ flexDirection: "row", gap: 10 }}>
        {/* Export button */}
        <Pressable
          onPress={exporting ? undefined : handleExport}
          style={({ pressed }) => [{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: colors.primary + "18",
            borderWidth: 1,
            borderColor: colors.primary + "40",
            opacity: pressed || exporting ? 0.7 : 1,
          }]}
        >
          {exporting
            ? <ActivityIndicator size="small" color={colors.primary} />
            : <IconSymbol name="arrow.up.doc.fill" size={18} color={colors.primary} />}
          <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>
            {exporting ? "Exportando..." : "Exportar"}
          </Text>
        </Pressable>

        {/* Import button */}
        <Pressable
          onPress={importing ? undefined : handleImport}
          style={({ pressed }) => [{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 12,
            borderRadius: 12,
            backgroundColor: colors.success + "18",
            borderWidth: 1,
            borderColor: colors.success + "40",
            opacity: pressed || importing ? 0.7 : 1,
          }]}
        >
          {importing
            ? <ActivityIndicator size="small" color={colors.success} />
            : <IconSymbol name="arrow.down.doc.fill" size={18} color={colors.success} />}
          <Text style={{ color: colors.success, fontWeight: "700", fontSize: 14 }}>
            {importing ? "Importando..." : "Importar"}
          </Text>
        </Pressable>
      </View>

      {importResult && (
        <View style={{
          backgroundColor: importResult.startsWith("✅") ? colors.success + "15" : colors.error + "15",
          borderRadius: 10,
          padding: 12,
          borderWidth: 1,
          borderColor: importResult.startsWith("✅") ? colors.success + "40" : colors.error + "40",
        }}>
          <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 20 }}>{importResult}</Text>
        </View>
      )}
    </View>
  );
}

// ─── Contas Bancárias ─────────────────────────────────────────────────────────

const ACCOUNT_COLORS = [
  "#6366f1", "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#14B8A6", "#F97316", "#64748B",
];

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: "Conta Corrente",
  savings: "Poupança",
  credit: "Cartão de Crédito",
};

function BankAccountsSection() {
  const colors = useColors();
  const utils = trpc.useUtils();
  const { data: accounts = [] } = trpc.bankAccounts.list.useQuery();
  const createMut = trpc.bankAccounts.create.useMutation({ onSuccess: () => utils.bankAccounts.list.invalidate() });
  const updateMut = trpc.bankAccounts.update.useMutation({ onSuccess: () => utils.bankAccounts.list.invalidate() });
  const deleteMut = trpc.bankAccounts.delete.useMutation({ onSuccess: () => utils.bankAccounts.list.invalidate() });

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [bank, setBank] = useState("");
  const [accountType, setAccountType] = useState<"checking" | "savings" | "credit">("checking");
  const [profile, setProfile] = useState<"Pessoal" | "Empresa">("Pessoal");
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditingId(null);
    setName(""); setBank(""); setAccountType("checking"); setProfile("Pessoal"); setColor(ACCOUNT_COLORS[0]);
    setShowModal(true);
  }

  function openEdit(acc: any) {
    setEditingId(acc.id);
    setName(acc.name); setBank(acc.bank); setAccountType(acc.accountType); setProfile(acc.profile); setColor(acc.color);
    setShowModal(true);
  }

  async function handleSave() {
    if (!name.trim() || !bank.trim()) { Alert.alert("Preencha nome e banco."); return; }
    setSaving(true);
    try {
      if (editingId) {
        await updateMut.mutateAsync({ id: editingId, name: name.trim(), bank: bank.trim(), accountType, profile, color });
      } else {
        await createMut.mutateAsync({ name: name.trim(), bank: bank.trim(), accountType, profile, color });
      }
      setShowModal(false);
    } catch (e: any) {
      Alert.alert("Erro", e?.message ?? "Falha ao salvar conta.");
    } finally { setSaving(false); }
  }

  function handleDelete(acc: any) {
    Alert.alert("Excluir conta", `Deseja excluir "${acc.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Excluir", style: "destructive", onPress: () => deleteMut.mutate({ id: acc.id }) },
    ]);
  }

  return (
    <View>
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <IconSymbol name="creditcard.fill" size={16} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Contas Bancárias</Text>
        </View>
        <Pressable onPress={openNew} style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
          <IconSymbol name="plus" size={18} color="#FFFFFF" />
          <Text style={styles.addBtnText}>Nova</Text>
        </Pressable>
      </View>
      <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
        {accounts.length} conta{accounts.length !== 1 ? "s" : ""} cadastrada{accounts.length !== 1 ? "s" : ""}
      </Text>

      {accounts.map((acc: any) => (
        <View key={acc.id} style={[styles.categoryRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.colorDot, { backgroundColor: acc.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.categoryName, { color: colors.foreground, fontSize: 14 }]}>{acc.name}</Text>
            <Text style={[{ color: colors.muted, fontSize: 11, marginTop: 2 }]}>{acc.bank} · {ACCOUNT_TYPE_LABELS[acc.accountType]} · {acc.profile}</Text>
          </View>
          <View style={styles.rowActions}>
            <Pressable onPress={() => openEdit(acc)} style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <IconSymbol name="pencil" size={18} color={colors.primary} />
            </Pressable>
            <Pressable onPress={() => handleDelete(acc)} style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.6 : 1 }]}>
              <IconSymbol name="trash.fill" size={18} color={colors.error} />
            </Pressable>
          </View>
        </View>
      ))}

      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>{editingId ? "Editar Conta" : "Nova Conta"}</Text>

            <Text style={[styles.label, { color: colors.muted }]}>Nome da conta</Text>
            <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={name} onChangeText={setName} placeholder="Ex: Nubank Pessoal" placeholderTextColor={colors.muted} />

            <Text style={[styles.label, { color: colors.muted }]}>Banco</Text>
            <TextInput style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              value={bank} onChangeText={setBank} placeholder="Ex: Nubank" placeholderTextColor={colors.muted} />

            <Text style={[styles.label, { color: colors.muted }]}>Tipo</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {(["checking", "savings", "credit"] as const).map((t) => (
                <Pressable key={t} onPress={() => setAccountType(t)}
                  style={[styles.chipBtn, { backgroundColor: accountType === t ? colors.primary : colors.background, borderColor: accountType === t ? colors.primary : colors.border }]}>
                  <Text style={{ color: accountType === t ? "#fff" : colors.muted, fontSize: 12 }}>{ACCOUNT_TYPE_LABELS[t]}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.muted }]}>Perfil</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {(["Pessoal", "Empresa"] as const).map((p) => (
                <Pressable key={p} onPress={() => setProfile(p)}
                  style={[styles.chipBtn, { backgroundColor: profile === p ? colors.primary : colors.background, borderColor: profile === p ? colors.primary : colors.border }]}>
                  <Text style={{ color: profile === p ? "#fff" : colors.muted, fontSize: 12 }}>{p}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { color: colors.muted }]}>Cor</Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              {ACCOUNT_COLORS.map((c) => (
                <Pressable key={c} onPress={() => setColor(c)}
                  style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.foreground }} />
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => setShowModal(false)} style={[styles.modalCancelBtn, { borderColor: colors.border, flex: 1 }]}>
                <Text style={{ color: colors.muted }}>Cancelar</Text>
              </Pressable>
              <Pressable onPress={handleSave} disabled={saving}
                style={[styles.modalSaveBtn, { backgroundColor: colors.primary, flex: 1, opacity: saving ? 0.6 : 1 }]}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>{saving ? "Salvando..." : "Salvar"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const colors = useColors();
  const { categories, addCategory, updateCategory, deleteCategory, getCategoriesByProfile } = usePayments();
  const { user, logout } = useAuthContext();

  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CustomCategory | undefined>(undefined);
  const [addingForProfile, setAddingForProfile] = useState<"Pessoal" | "Empresa">("Empresa");

  const empresaCategories = getCategoriesByProfile("Empresa");
  const pessoalCategories = getCategoriesByProfile("Pessoal");

  function handleAddCategory(profile: "Pessoal" | "Empresa") {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingCategory(undefined);
    setAddingForProfile(profile);
    setShowModal(true);
  }

  function handleEditCategory(cat: CustomCategory) {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingCategory(cat);
    setAddingForProfile(cat.profile ?? "Empresa");
    setShowModal(true);
  }

  async function handleSaveCategory(name: string, color: string): Promise<void> {
    try {
      if (editingCategory) {
        await updateCategory({ ...editingCategory, name, color });
      } else {
        await addCategory(name, color, addingForProfile);
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowModal(false);
    } catch (err: any) {
      Alert.alert("Erro ao salvar", err?.message ?? "Não foi possível salvar a categoria. Tente novamente.");
      throw err;
    }
  }

  function handleDeleteCategory(cat: CustomCategory) {
    Alert.alert(
      "Excluir categoria",
      `Deseja excluir a categoria "${cat.name}"? Os pagamentos que usam esta categoria não serão afetados.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            await deleteCategory(cat.id);
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }

  function renderCategoryItem(item: CustomCategory) {
    return (
      <Pressable
        key={item.id}
        onPress={() => handleEditCategory(item)}
        style={({ pressed }) => [styles.categoryRow, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.75 : 1 }]}
      >
        <View style={[styles.colorDot, { backgroundColor: item.color }]} />
        <View style={[styles.categoryBadge, { backgroundColor: item.color + "22", flex: 1 }]}>
          <Text style={[styles.categoryName, { color: item.color }]}>{item.name}</Text>
        </View>
        <View style={styles.rowActions}>
          <Pressable onPress={() => handleEditCategory(item)} style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="pencil" size={18} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => handleDeleteCategory(item)} style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <IconSymbol name="trash.fill" size={18} color={colors.error} />
          </Pressable>
        </View>
      </Pressable>
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Configurações</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Sharing section */}
        <SharingSection />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Export / Import section */}
        <DataMigrationSection />
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Categorias Empresa */}
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <IconSymbol name="building.2.fill" size={16} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Categorias Empresa</Text>
          </View>
          <Pressable
            onPress={() => handleAddCategory("Empresa")}
            style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
          >
            <IconSymbol name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Nova</Text>
          </Pressable>
        </View>
        <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
          {empresaCategories.length} categoria{empresaCategories.length !== 1 ? "s" : ""} — toque para editar
        </Text>
        {empresaCategories.map(renderCategoryItem)}

        <View style={[styles.divider, { backgroundColor: colors.border, marginTop: 16 }]} />

        {/* Categorias Pessoal */}
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <IconSymbol name="person.fill" size={16} color={colors.success} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Categorias Pessoal</Text>
          </View>
          <Pressable
            onPress={() => handleAddCategory("Pessoal")}
            style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.success, opacity: pressed ? 0.7 : 1 }]}
          >
            <IconSymbol name="plus" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>Nova</Text>
          </Pressable>
        </View>
        <Text style={[styles.sectionSubtitle, { color: colors.muted }]}>
          {pessoalCategories.length} categoria{pessoalCategories.length !== 1 ? "s" : ""} — toque para editar
        </Text>
        {pessoalCategories.map(renderCategoryItem)}

        <View style={[styles.divider, { backgroundColor: colors.border, marginTop: 16 }]} />

        {/* Contas Bancárias */}
        <BankAccountsSection />

      </ScrollView>

      {/* Account section — only on mobile (web has sidebar) */}
      {Platform.OS !== "web" && user && (
        <View style={[styles.accountSection, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.accountInfo}>
            <View style={[styles.accountAvatar, { backgroundColor: colors.primary + "20" }]}>
              <Text style={[styles.accountAvatarText, { color: colors.primary }]}>
                {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.accountName, { color: colors.foreground }]} numberOfLines={1}>
                {user.name ?? "Usuário"}
              </Text>
              {user.email && (
                <Text style={[styles.accountEmail, { color: colors.muted }]} numberOfLines={1}>
                  {user.email}
                </Text>
              )}
            </View>
            <Pressable
              onPress={logout}
              style={({ pressed }) => [styles.logoutBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={[styles.logoutText, { color: colors.error }]}>Sair</Text>
            </Pressable>
          </View>
        </View>
      )}

      <CategoryModal
        visible={showModal}
        initial={editingCategory}
        onClose={() => setShowModal(false)}
        onSave={handleSaveCategory}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  divider: {
    height: 8,
    marginVertical: 4,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  sectionSubtitle: {
    fontSize: 13,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  addBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  categoryBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  categoryName: {
    fontSize: 15,
    fontWeight: "600",
  },
  rowActions: {
    flexDirection: "row",
    gap: 4,
  },
  actionBtn: {
    padding: 8,
  },
  // Modal
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  modalCancel: {
    fontSize: 16,
  },
  modalSave: {
    fontSize: 16,
    fontWeight: "700",
  },
  previewRow: {
    alignItems: "center",
    paddingVertical: 8,
  },
  previewBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  previewDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  previewText: {
    fontSize: 16,
    fontWeight: "600",
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  colorSwatchSelected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  accountSection: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  accountInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  accountAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  accountAvatarText: {
    fontSize: 18,
    fontWeight: "700",
  },
  accountName: {
    fontSize: 14,
    fontWeight: "600",
  },
  accountEmail: {
    fontSize: 12,
    marginTop: 1,
  },
  logoutBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  logoutText: {
    fontSize: 13,
    fontWeight: "600",
  },
  // Sharing
  sharingCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  groupStatusRow: {
    marginBottom: 10,
  },
  groupStatusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: "flex-start",
  },
  groupStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  groupStatusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  inviteCodeBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  inviteCodeLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  inviteCode: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 3,
    fontVariant: ["tabular-nums"],
  },
  inviteCodeActions: {
    flexDirection: "row",
    gap: 4,
  },
  iconBtn: {
    padding: 8,
  },
  membersLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  memberAvatarText: {
    fontSize: 14,
    fontWeight: "700",
  },
  memberName: {
    fontSize: 14,
    fontWeight: "600",
  },
  memberEmail: {
    fontSize: 12,
    marginTop: 1,
  },
  sharingActions: {
    borderTopWidth: 1,
    marginTop: 12,
    paddingTop: 12,
    gap: 8,
  },
  sharingActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  sharingActionBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  joinInputRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  joinInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 2,
    textAlign: "center",
  },
  joinConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 70,
    alignItems: "center",
  },
  joinConfirmText: {
    color: "#FFF",
    fontWeight: "700",
    fontSize: 14,
  },
  joinCancelBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  joinCancelText: {
    fontSize: 14,
    fontWeight: "600",
  },
  chipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  modalCancelBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  modalSaveBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
});
