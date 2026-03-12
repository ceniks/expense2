import { View, Text, Pressable, StyleSheet, Platform, useWindowDimensions, Animated } from "react-native";
import { usePathname, router } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useAuthContext } from "@/lib/auth-context";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useState, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface NavItem {
  label: string;
  icon: any;
  route: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Início", icon: "house.fill", route: "/(tabs)/" },
  { label: "Adicionar", icon: "plus.circle.fill", route: "/(tabs)/add" },
  { label: "Notas Fiscais", icon: "doc.text.fill", route: "/(tabs)/invoices" },
  { label: "Compromissos", icon: "banknote.fill", route: "/(tabs)/financings" },
  { label: "Agenda", icon: "calendar.badge.clock", route: "/(tabs)/schedule" },
  { label: "Funcionários", icon: "person.2.fill", route: "/(tabs)/employees" },
  { label: "Relatório", icon: "chart.pie.fill", route: "/(tabs)/report" },
  { label: "Config.", icon: "gearshape.fill", route: "/(tabs)/settings" },
];

const SIDEBAR_EXPANDED_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const STORAGE_KEY = "gastopix_sidebar_collapsed";

export function WebSidebar() {
  const colors = useColors();
  const pathname = usePathname();
  const { user, logout, isAuthenticated } = useAuthContext();
  const { width: screenWidth } = useWindowDimensions();

  // On small screens (mobile browser), start collapsed
  const isSmallScreen = screenWidth < 768;
  const [collapsed, setCollapsed] = useState(isSmallScreen);

  const animWidth = useRef(new Animated.Value(isSmallScreen ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH)).current;

  // Load persisted state (only on large screens)
  useEffect(() => {
    if (isSmallScreen) return;
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === "true") {
        setCollapsed(true);
        animWidth.setValue(SIDEBAR_COLLAPSED_WIDTH);
      }
    });
  }, []);

  // Collapse when screen becomes small
  useEffect(() => {
    if (isSmallScreen && !collapsed) {
      setCollapsed(true);
      Animated.timing(animWidth, {
        toValue: SIDEBAR_COLLAPSED_WIDTH,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [isSmallScreen]);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    Animated.timing(animWidth, {
      toValue: next ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH,
      duration: 220,
      useNativeDriver: false,
    }).start();
    if (!isSmallScreen) {
      AsyncStorage.setItem(STORAGE_KEY, String(next));
    }
  };

  if (Platform.OS !== "web") return null;
  if (!isAuthenticated) return null;

  return (
    <Animated.View
      style={[
        styles.sidebar,
        {
          width: animWidth,
          backgroundColor: colors.surface,
          borderRightColor: colors.border,
        },
      ]}
    >
      {/* Logo + Toggle button */}
      <View style={styles.logoRow}>
        {!collapsed && (
          <View style={[styles.logoIcon, { backgroundColor: colors.primary + "20" }]}>
            <Text style={styles.logoEmoji}>💳</Text>
          </View>
        )}
        {!collapsed && (
          <Text style={[styles.logoText, { color: colors.foreground }]} numberOfLines={1}>
            GastoPix
          </Text>
        )}
        <Pressable
          onPress={toggle}
          style={({ pressed }) => [
            styles.toggleBtn,
            collapsed && styles.toggleBtnCentered,
            { backgroundColor: colors.border + "80" },
            pressed && { opacity: 0.7 },
          ]}
        >
          <IconSymbol
            name={collapsed ? "chevron.right" : "chevron.left.forwardslash.chevron.right"}
            size={16}
            color={colors.muted}
          />
        </Pressable>
      </View>

      {/* Nav items */}
      <View style={styles.navList}>
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.route === "/(tabs)/"
              ? pathname === "/" || pathname === "/index"
              : pathname.includes(item.route.replace("/(tabs)", ""));

          return (
            <Pressable
              key={item.route}
              onPress={() => router.push(item.route as any)}
              style={({ pressed }) => [
                styles.navItem,
                collapsed && styles.navItemCollapsed,
                isActive && { backgroundColor: colors.primary + "15" },
                pressed && { opacity: 0.7 },
              ]}
            >
              <IconSymbol
                name={item.icon}
                size={22}
                color={isActive ? colors.primary : colors.muted}
              />
              {!collapsed && (
                <Text
                  style={[
                    styles.navLabel,
                    { color: isActive ? colors.primary : colors.muted },
                    isActive && { fontWeight: "600" },
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* User info + logout */}
      {user && (
        <View style={[styles.userSection, { borderTopColor: colors.border }]}>
          {collapsed ? (
            <Pressable
              onPress={logout}
              style={({ pressed }) => [
                styles.navItemCollapsed,
                { alignSelf: "center" },
                pressed && { opacity: 0.7 },
              ]}
            >
              <IconSymbol name="paperplane.fill" size={20} color={colors.muted} />
            </Pressable>
          ) : (
            <>
              <View style={styles.userInfo}>
                <View style={[styles.userAvatar, { backgroundColor: colors.primary + "20" }]}>
                  <Text style={[styles.userAvatarText, { color: colors.primary }]}>
                    {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.userDetails}>
                  <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
                    {user.name ?? "Usuário"}
                  </Text>
                  {user.email && (
                    <Text style={[styles.userEmail, { color: colors.muted }]} numberOfLines={1}>
                      {user.email}
                    </Text>
                  )}
                </View>
              </View>
              <Pressable
                onPress={logout}
                style={({ pressed }) => [
                  styles.logoutBtn,
                  { borderColor: colors.border },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.logoutText, { color: colors.muted }]}>Sair</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    height: "100%",
    borderRightWidth: 1,
    paddingVertical: 20,
    paddingHorizontal: 10,
    flexDirection: "column",
    overflow: "hidden",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 28,
    paddingHorizontal: 2,
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  logoEmoji: {
    fontSize: 18,
  },
  logoText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.5,
    flex: 1,
  },
  toggleBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginLeft: "auto",
  },
  toggleBtnCentered: {
    marginLeft: 0,
    alignSelf: "center",
  },
  navList: {
    flex: 1,
    gap: 2,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  navItemCollapsed: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  navLabel: {
    fontSize: 14,
    flex: 1,
  },
  userSection: {
    borderTopWidth: 1,
    paddingTop: 14,
    gap: 10,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: "700",
  },
  userDetails: {
    flex: 1,
    overflow: "hidden",
  },
  userName: {
    fontSize: 12,
    fontWeight: "600",
  },
  userEmail: {
    fontSize: 10,
  },
  logoutBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: "center",
  },
  logoutText: {
    fontSize: 13,
  },
});
