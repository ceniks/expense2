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
  section?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Início",        icon: "house.fill",             route: "/(tabs)/",          section: "main" },
  { label: "Adicionar",     icon: "plus.circle.fill",       route: "/(tabs)/add",       section: "main" },
  { label: "Notas Fiscais", icon: "doc.text.fill",          route: "/(tabs)/invoices",  section: "financeiro" },
  { label: "Compromissos",  icon: "banknote.fill",          route: "/(tabs)/financings",section: "financeiro" },
  { label: "Agenda",        icon: "calendar.badge.clock",   route: "/(tabs)/schedule",  section: "financeiro" },
  { label: "Funcionários",  icon: "person.2.fill",          route: "/(tabs)/employees", section: "rh" },
  { label: "Relatório",     icon: "chart.pie.fill",         route: "/(tabs)/report",    section: "rh" },
  { label: "Config.",       icon: "gearshape.fill",         route: "/(tabs)/settings",  section: "sistema" },
];

const SECTIONS: Record<string, string> = {
  main: "Principal",
  financeiro: "Financeiro",
  rh: "Pessoas",
  sistema: "Sistema",
};

const SIDEBAR_EXPANDED_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 68;
const STORAGE_KEY = "gastopix_sidebar_collapsed";

export function WebSidebar() {
  const colors = useColors();
  const pathname = usePathname();
  const { user, logout, isAuthenticated } = useAuthContext();
  const { width: screenWidth } = useWindowDimensions();

  const isSmallScreen = screenWidth < 768;
  const [collapsed, setCollapsed] = useState(isSmallScreen);

  const animWidth = useRef(
    new Animated.Value(isSmallScreen ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH)
  ).current;

  useEffect(() => {
    if (isSmallScreen) return;
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === "true") {
        setCollapsed(true);
        animWidth.setValue(SIDEBAR_COLLAPSED_WIDTH);
      }
    });
  }, []);

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

  // Group nav items by section
  const sections = Array.from(new Set(NAV_ITEMS.map((i) => i.section)));

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
      {/* Logo */}
      <View style={[styles.logoRow, collapsed && styles.logoRowCollapsed]}>
        <View style={[styles.logoIcon, { backgroundColor: colors.primary }]}>
          <Text style={styles.logoEmoji}>G</Text>
        </View>
        {!collapsed && (
          <View style={{ flex: 1 }}>
            <Text style={[styles.logoText, { color: colors.foreground }]} numberOfLines={1}>
              GastoPix
            </Text>
            <Text style={[styles.logoSub, { color: colors.muted }]}>Gestão Financeira</Text>
          </View>
        )}
        <Pressable
          onPress={toggle}
          style={({ pressed }) => [
            styles.toggleBtn,
            { backgroundColor: colors.background },
            pressed && { opacity: 0.7 },
          ]}
        >
          <IconSymbol
            name={collapsed ? "chevron.right" : "chevron.left"}
            size={14}
            color={colors.muted}
          />
        </Pressable>
      </View>

      {/* Nav items grouped by section */}
      <View style={styles.navList}>
        {sections.map((section) => {
          const items = NAV_ITEMS.filter((i) => i.section === section);
          return (
            <View key={section} style={styles.navSection}>
              {!collapsed && section && (
                <Text style={[styles.sectionLabel, { color: colors.muted }]}>
                  {SECTIONS[section!] ?? section}
                </Text>
              )}
              {items.map((item) => {
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
                      isActive
                        ? { backgroundColor: colors.primary + "18" }
                        : pressed
                        ? { backgroundColor: colors.background }
                        : {},
                    ]}
                  >
                    <View
                      style={[
                        styles.navIconWrap,
                        isActive && { backgroundColor: colors.primary + "25" },
                      ]}
                    >
                      <IconSymbol
                        name={item.icon}
                        size={18}
                        color={isActive ? colors.primary : colors.muted}
                      />
                    </View>
                    {!collapsed && (
                      <Text
                        style={[
                          styles.navLabel,
                          { color: isActive ? colors.primary : colors.foreground },
                          isActive && { fontWeight: "600" },
                        ]}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                    )}
                    {!collapsed && isActive && (
                      <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>

      {/* User section */}
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
              <View style={[styles.userAvatarSmall, { backgroundColor: colors.primary + "20" }]}>
                <Text style={[styles.userAvatarText, { color: colors.primary }]}>
                  {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
                </Text>
              </View>
            </Pressable>
          ) : (
            <View style={styles.userRow}>
              <View style={[styles.userAvatar, { backgroundColor: colors.primary }]}>
                <Text style={styles.userAvatarTextLg}>
                  {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1, overflow: "hidden" }}>
                <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>
                  {user.name ?? "Usuário"}
                </Text>
                {user.email && (
                  <Text style={[styles.userEmail, { color: colors.muted }]} numberOfLines={1}>
                    {user.email}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={logout}
                style={({ pressed }) => [
                  styles.logoutBtn,
                  { backgroundColor: colors.background },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <IconSymbol name="rectangle.portrait.and.arrow.right" size={16} color={colors.muted} />
              </Pressable>
            </View>
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
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 12,
    flexDirection: "column",
    overflow: "hidden",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  logoRowCollapsed: {
    flexDirection: "column",
    gap: 8,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  logoEmoji: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fff",
  },
  logoText: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  logoSub: {
    fontSize: 10,
    marginTop: 1,
  },
  toggleBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginLeft: "auto",
  },
  navList: {
    flex: 1,
    gap: 4,
  },
  navSection: {
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingHorizontal: 10,
    marginBottom: 4,
    marginTop: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    position: "relative",
  },
  navItemCollapsed: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },
  navIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  navLabel: {
    fontSize: 14,
    flex: 1,
  },
  activeIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginRight: 2,
  },
  userSection: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  userAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  userAvatarSmall: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  userAvatarText: {
    fontSize: 14,
    fontWeight: "700",
  },
  userAvatarTextLg: {
    fontSize: 15,
    fontWeight: "800",
    color: "#fff",
  },
  userName: {
    fontSize: 13,
    fontWeight: "600",
  },
  userEmail: {
    fontSize: 11,
    marginTop: 1,
  },
  logoutBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
