import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { getApiBaseUrl } from "@/constants/oauth";
import { useAuthContext } from "@/lib/auth-context";

type AuthMode = "login" | "register";

async function apiPost(path: string, body: Record<string, string>) {
  const base = getApiBaseUrl() || (typeof window !== "undefined" ? window.location.origin : "");
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erro desconhecido");
  return data;
}

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { refresh: refreshAuth } = useAuthContext();
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (!email.trim() || !password.trim()) {
      setError("Preencha email e senha");
      return;
    }
    if (mode === "register" && !name.trim()) {
      setError("Preencha seu nome");
      return;
    }

    setLoading(true);
    try {
      if (mode === "register") {
        await apiPost("/api/auth/register", { name: name.trim(), email: email.trim(), password });
      } else {
        await apiPost("/api/auth/login", { email: email.trim(), password });
      }
      // Após login bem-sucedido, atualizar o estado de auth e redirecionar
      await refreshAuth();
      router.replace("/(tabs)");
    } catch (err: any) {
      setError(err.message || "Erro ao fazer login");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError("");
    setName("");
    setEmail("");
    setPassword("");
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Logo */}
          <View style={[styles.logoContainer, { backgroundColor: colors.primary + "20" }]}>
            <Text style={styles.logoEmoji}>💳</Text>
          </View>

          {/* Título */}
          <View style={styles.titleContainer}>
            <Text style={[styles.title, { color: colors.foreground }]}>GastoPix</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {mode === "login" ? "Bem-vindo de volta!" : "Crie sua conta gratuita"}
            </Text>
          </View>

          {/* Formulário */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {mode === "register" && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.muted }]}>Nome</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                  placeholder="Seu nome completo"
                  placeholderTextColor={colors.muted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>Email</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholder="seu@email.com"
                placeholderTextColor={colors.muted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.muted }]}>Senha</Text>
              <TextInput
                style={[styles.input, { color: colors.foreground, backgroundColor: colors.background, borderColor: colors.border }]}
                placeholder={mode === "register" ? "Mínimo 6 caracteres" : "Sua senha"}
                placeholderTextColor={colors.muted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            {error ? (
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            ) : null}

            <Pressable
              onPress={handleSubmit}
              disabled={loading}
              style={({ pressed }) => [
                styles.submitButton,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                loading && { opacity: 0.7 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {mode === "login" ? "Entrar" : "Criar conta"}
                </Text>
              )}
            </Pressable>
          </View>

          {/* Alternar modo */}
          <Pressable onPress={toggleMode} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
            <Text style={[styles.toggleText, { color: colors.muted }]}>
              {mode === "login" ? (
                <>Não tem conta? <Text style={{ color: colors.primary, fontWeight: "700" }}>Cadastre-se</Text></>
              ) : (
                <>Já tem conta? <Text style={{ color: colors.primary, fontWeight: "700" }}>Entrar</Text></>
              )}
            </Text>
          </Pressable>

          <Text style={[styles.disclaimer, { color: colors.muted }]}>
            Seus dados ficam seguros e sincronizados na nuvem
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 24,
  },
  logoContainer: {
    width: 96,
    height: 96,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  logoEmoji: {
    fontSize: 48,
  },
  titleContainer: {
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 22,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    borderWidth: 1,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  errorText: {
    fontSize: 13,
    textAlign: "center",
    fontWeight: "500",
  },
  submitButton: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  toggleText: {
    fontSize: 14,
    textAlign: "center",
  },
  disclaimer: {
    fontSize: 12,
    textAlign: "center",
  },
});
