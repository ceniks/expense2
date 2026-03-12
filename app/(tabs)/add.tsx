import {
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from "react-native";
import { useState, useMemo, useEffect } from "react";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { usePayments, Profile, PROFILES } from "@/lib/payments-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { trpc } from "@/lib/trpc";
import { getTodayBR } from "@/lib/utils";

function getToday() {
  return getTodayBR();
}

export default function AddPaymentScreen() {
  const colors = useColors();
  const router = useRouter();
  const { addPayment, categories, activeProfile, getCategoriesByProfile } = usePayments();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(getToday);
  const [category, setCategory] = useState(categories[0]?.name ?? "Outros");
  const [profile, setProfile] = useState<Profile>(activeProfile);
  const [notes, setNotes] = useState("");

  const profileCategories = useMemo(
    () => getCategoriesByProfile(profile as "Pessoal" | "Empresa"),
    [profile, categories]
  );

  // Reset category when profile changes
  useEffect(() => {
    if (profileCategories.length > 0) {
      setCategory(profileCategories[0].name);
    }
  }, [profile]);

  function resetForm() {
    setImageUri(null);
    setDescription("");
    setAmount("");
    setDate(getToday());
    setProfile(activeProfile);
    setNotes("");
    const cats = getCategoriesByProfile(activeProfile as "Pessoal" | "Empresa");
    setCategory(cats[0]?.name ?? "Outros");
  }

  const analyzeImage = trpc.analyzePaymentImage.useMutation();

  async function pickImage(fromCamera: boolean) {
    if (Platform.OS !== "web") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    let result;
    if (fromCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permissão necessária", "Precisamos de acesso à câmera para tirar fotos.");
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        base64: true,
      });
    } else {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        base64: true,
      });
    }

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setImageUri(asset.uri);
      if (asset.base64) {
        await runAIAnalysis(asset.base64);
      }
    }
  }

  async function runAIAnalysis(base64: string) {
    setAnalyzing(true);
    try {
      const result = await analyzeImage.mutateAsync({ imageBase64: base64 });
      if (result.description) setDescription(result.description);
      if (result.amount) setAmount(result.amount.toString());
      if (result.date) setDate(result.date);
      if (result.category) {
        // Try to match AI category to existing categories
        const match = categories.find(
          (c) => c.name.toLowerCase() === (result.category ?? "").toLowerCase()
        );
        if (match) setCategory(match.name);
      }
    } catch {
      // silently fail — user can fill manually
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!description.trim()) {
      Alert.alert("Campo obrigatório", "Por favor, informe uma descrição.");
      return;
    }
    const parsedAmount = parseFloat(amount.replace(",", "."));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Valor inválido", "Por favor, informe um valor válido.");
      return;
    }
    if (!date) {
      Alert.alert("Campo obrigatório", "Por favor, informe a data.");
      return;
    }

    setSaving(true);
    try {
      await addPayment({
        description: description.trim(),
        amount: parsedAmount,
        date,
        category,
        profile,
        imageUri: imageUri ?? undefined,
        notes: notes.trim() || undefined,
      });
      if (Platform.OS !== "web") {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      resetForm();
      router.replace("/");
    } catch {
      Alert.alert("Erro", "Não foi possível salvar o pagamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Novo Pagamento</Text>
        </View>

        <View style={styles.content}>
          {/* Image picker */}
          {imageUri ? (
            <View style={styles.imageContainer}>
              <Image source={{ uri: imageUri }} style={styles.previewImage} resizeMode="cover" />
              {analyzing && (
                <View style={styles.analyzingOverlay}>
                  <ActivityIndicator size="large" color="#FFFFFF" />
                  <Text style={styles.analyzingText}>Analisando com IA...</Text>
                </View>
              )}
              <Pressable
                onPress={() => { setImageUri(null); }}
                style={[styles.removeImageBtn, { backgroundColor: colors.error }]}
              >
                <IconSymbol name="xmark.circle.fill" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
          ) : (
            <View style={styles.imagePickerRow}>
              <Pressable
                onPress={() => pickImage(true)}
                style={({ pressed }) => [styles.imagePickerBtn, { backgroundColor: colors.accent, borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
              >
                <IconSymbol name="camera.fill" size={28} color={colors.primary} />
                <Text style={[styles.imagePickerLabel, { color: colors.primary }]}>Câmera</Text>
              </Pressable>
              <Pressable
                onPress={() => pickImage(false)}
                style={({ pressed }) => [styles.imagePickerBtn, { backgroundColor: colors.accent, borderColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}
              >
                <IconSymbol name="photo.fill" size={28} color={colors.primary} />
                <Text style={[styles.imagePickerLabel, { color: colors.primary }]}>Galeria</Text>
              </Pressable>
            </View>
          )}

          {analyzing && !imageUri && (
            <View style={[styles.analyzingBanner, { backgroundColor: colors.accent }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.analyzingBannerText, { color: colors.primary }]}>Analisando comprovante com IA...</Text>
            </View>
          )}

          {/* Form */}
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
                placeholder="Ex: Supermercado, Netflix, Conta de luz..."
                placeholderTextColor={colors.muted}
                returnKeyType="next"
              />
            </View>

            <View style={styles.row}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={[styles.label, { color: colors.muted }]}>Valor (R$) *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0,00"
                  placeholderTextColor={colors.muted}
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
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.muted}
                  returnKeyType="next"
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>Categoria</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                {profileCategories.map((cat) => (
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
                    <View style={[styles.categoryDot, { backgroundColor: category === cat.name ? "#FFFFFF" : cat.color }]} />
                    <Text style={[styles.categoryChipText, { color: category === cat.name ? "#FFFFFF" : colors.muted }]}>
                      {cat.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>Observação (opcional)</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.foreground }]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Detalhes adicionais..."
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={3}
                returnKeyType="done"
              />
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Save button */}
      <View style={[styles.footer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveBtn,
            { backgroundColor: colors.primary, opacity: pressed || saving ? 0.7 : 1 },
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <IconSymbol name="checkmark.circle.fill" size={20} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Salvar Pagamento</Text>
            </>
          )}
        </Pressable>
      </View>
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
  content: {
    padding: 16,
    gap: 16,
  },
  imagePickerRow: {
    flexDirection: "row",
    gap: 12,
  },
  imagePickerBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: "dashed",
    gap: 8,
  },
  imagePickerLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  imageContainer: {
    position: "relative",
    borderRadius: 16,
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: 200,
    borderRadius: 16,
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  analyzingText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  removeImageBtn: {
    position: "absolute",
    top: 10,
    right: 10,
    borderRadius: 12,
    padding: 2,
  },
  analyzingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 12,
  },
  analyzingBannerText: {
    fontSize: 14,
    fontWeight: "500",
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
  row: {
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
  categoryScroll: {
    flexGrow: 0,
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
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
