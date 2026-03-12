import {
  Text,
  View,
  ScrollView,
  Pressable,
  Image,
  Alert,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { usePayments, getCategoryColor, Profile, PROFILES } from "@/lib/payments-context";
import { IconSymbol } from "@/components/ui/icon-symbol";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateDisplay(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useColors();
  const { payments, updatePayment, deletePayment, categories } = usePayments();

  const payment = payments.find((p) => p.id === id);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [description, setDescription] = useState(payment?.description ?? "");
  const [amount, setAmount] = useState(payment?.amount.toString() ?? "");
  const [date, setDate] = useState(payment?.date ?? "");
  const [category, setCategory] = useState(payment?.category ?? categories[0]?.name ?? "Outros");
  const [profile, setProfile] = useState<Profile>(payment?.profile ?? "Pessoal");
  const [notes, setNotes] = useState(payment?.notes ?? "");

  if (!payment) {
    return (
      <ScreenContainer>
        <View style={styles.centered}>
          <Text style={[styles.notFound, { color: colors.muted }]}>Pagamento não encontrado.</Text>
          <Pressable onPress={() => router.back()} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={[styles.backLink, { color: colors.primary }]}>Voltar</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const catColor = getCategoryColor(categories, payment?.category ?? "");

  async function handleSave() {
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (!description.trim() || isNaN(parsedAmount) || parsedAmount <= 0 || !date) {
      Alert.alert("Dados inválidos", "Verifique os campos obrigatórios.");
      return;
    }
    if (!payment) return;
    setSaving(true);
    try {
      await updatePayment({
        id: payment.id,
        createdAt: payment.createdAt,
        imageUri: payment.imageUri,
        description: description.trim(),
        amount: parsedAmount,
        date,
        category,
        profile,
        notes: notes.trim() || undefined,
      });
      if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
    } catch {
      Alert.alert("Erro", "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert(
      "Excluir pagamento",
      "Tem certeza que deseja excluir este pagamento?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Excluir",
          style: "destructive",
          onPress: async () => {
            if (!payment) return;
            await deletePayment(payment.id);
            if (Platform.OS !== "web") await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
          },
        },
      ]
    );
  }

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <IconSymbol name="arrow.left" size={22} color={colors.primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Detalhes</Text>
        <View style={styles.headerActions}>
          {!editing && (
            <>
              <Pressable onPress={() => setEditing(true)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}>
                <IconSymbol name="pencil" size={20} color={colors.primary} />
              </Pressable>
              <Pressable onPress={handleDelete} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}>
                <IconSymbol name="trash.fill" size={20} color={colors.error} />
              </Pressable>
            </>
          )}
          {editing && (
            <Pressable onPress={() => setEditing(false)} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}>
              <IconSymbol name="xmark.circle.fill" size={22} color={colors.muted} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {/* Image */}
        {payment.imageUri && (
          <Image source={{ uri: payment.imageUri }} style={styles.image} resizeMode="contain" />
        )}

        <View style={styles.content}>
          {!editing ? (
            <>
              {/* Profile badge */}
              <View style={[styles.profileBadge, { backgroundColor: colors.accent }]}>
                <IconSymbol
                  name={payment.profile === "Empresa" ? "building.2.fill" : "person.fill"}
                  size={14}
                  color={colors.primary}
                />
                <Text style={[styles.profileBadgeText, { color: colors.primary }]}>{payment.profile}</Text>
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardLabel, { color: colors.muted }]}>Descrição</Text>
                <Text style={[styles.cardValue, { color: colors.foreground }]}>{payment.description}</Text>
              </View>

              <View style={styles.row}>
                <View style={[styles.card, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.cardLabel, { color: colors.muted }]}>Valor</Text>
                  <Text style={[styles.cardValue, styles.amountValue, { color: colors.primary }]}>
                    {formatCurrency(payment.amount)}
                  </Text>
                </View>
                <View style={[styles.card, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.cardLabel, { color: colors.muted }]}>Data</Text>
                  <Text style={[styles.cardValue, { color: colors.foreground }]}>{formatDateDisplay(payment.date)}</Text>
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <Text style={[styles.cardLabel, { color: colors.muted }]}>Categoria</Text>
                <View style={[styles.categoryBadge, { backgroundColor: catColor + "22" }]}>
                  <View style={[styles.categoryDot, { backgroundColor: catColor }]} />
                  <Text style={[styles.categoryBadgeText, { color: catColor }]}>{payment.category}</Text>
                </View>
              </View>

              {payment.notes && (
                <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={[styles.cardLabel, { color: colors.muted }]}>Observação</Text>
                  <Text style={[styles.cardValue, { color: colors.foreground }]}>{payment.notes}</Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.form}>
              {/* Profile selector */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.muted }]}>Perfil</Text>
                <View style={styles.profileRow}>
                  {PROFILES.map((p) => (
                    <Pressable
                      key={p}
                      onPress={() => setProfile(p)}
                      style={({ pressed }) => [
                        styles.profileChip,
                        {
                          backgroundColor: profile === p ? colors.primary : colors.surface,
                          borderColor: profile === p ? colors.primary : colors.border,
                          opacity: pressed ? 0.7 : 1,
                          flex: 1,
                        },
                      ]}
                    >
                      <IconSymbol
                        name={p === "Empresa" ? "building.2.fill" : "person.fill"}
                        size={16}
                        color={profile === p ? "#FFFFFF" : colors.muted}
                      />
                      <Text style={[styles.profileChipText, { color: profile === p ? "#FFFFFF" : colors.muted }]}>
                        {p}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.muted }]}>Descrição *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={description}
                  onChangeText={setDescription}
                  returnKeyType="next"
                />
              </View>

              <View style={styles.rowForm}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: colors.muted }]}>Valor (R$) *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: colors.muted }]}>Data *</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                    value={date}
                    onChangeText={setDate}
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.muted }]}>Categoria</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {categories.map((cat) => (
                    <Pressable
                      key={cat.id}
                      onPress={() => setCategory(cat.name)}
                      style={({ pressed }) => [
                        styles.categoryChip,
                        {
                          backgroundColor: category === cat.name ? cat.color : colors.surface,
                          borderColor: category === cat.name ? cat.color : colors.border,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <View style={[styles.categoryDotSmall, { backgroundColor: category === cat.name ? "#FFFFFF" : cat.color }]} />
                      <Text style={[styles.categoryChipText, { color: category === cat.name ? "#FFFFFF" : colors.muted }]}>
                        {cat.name}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.muted }]}>Observação</Text>
                <TextInput
                  style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {editing && (
        <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary, opacity: pressed || saving ? 0.7 : 1 }]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <IconSymbol name="checkmark.circle.fill" size={20} color="#FFFFFF" />
                <Text style={styles.saveBtnText}>Salvar Alterações</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  notFound: {
    fontSize: 16,
  },
  backLink: {
    fontSize: 15,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  image: {
    width: "100%",
    height: 240,
    backgroundColor: "#000",
  },
  content: {
    padding: 16,
    gap: 12,
  },
  profileBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  profileBadgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 22,
  },
  amountValue: {
    fontSize: 22,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  categoryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  categoryBadgeText: {
    fontSize: 14,
    fontWeight: "600",
  },
  form: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
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
  textArea: {
    height: 80,
    textAlignVertical: "top",
    paddingTop: 12,
  },
  rowForm: {
    flexDirection: "row",
    gap: 12,
  },
  profileRow: {
    flexDirection: "row",
    gap: 10,
  },
  profileChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  profileChipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  categoryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  saveBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
