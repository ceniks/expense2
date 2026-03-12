// Fallback for using MaterialIcons on Android and web.

import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<SymbolViewProps["name"], ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

/**
 * Add your SF Symbols to Material Icons mappings here.
 * - see Material Icons in the [Icons Directory](https://icons.expo.fyi).
 * - see SF Symbols in the [SF Symbols](https://developer.apple.com/sf-symbols/) app.
 */
const MAPPING = {
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "chevron.down": "expand-more",
  "chevron.up": "expand-less",
  "plus.circle.fill": "add-circle",
  "plus": "add",
  "chart.pie.fill": "pie-chart",
  "gearshape.fill": "settings",
  "camera.fill": "camera-alt",
  "photo.fill": "photo-library",
  "photo.on.rectangle": "add-photo-alternate",
  "trash.fill": "delete",
  "pencil": "edit",
  "arrow.up.arrow.down": "swap-vert",
  "checkmark": "check",
  "checkmark.circle.fill": "check-circle",
  "checkmark.circle": "radio-button-unchecked",
  "xmark.circle.fill": "cancel",
  "magnifyingglass": "search",
  "calendar": "calendar-today",
  "calendar.badge.clock": "event",
  "tag.fill": "label",
  "dollarsign.circle.fill": "attach-money",
  "banknote.fill": "account-balance",
  "arrow.left": "arrow-back",
  "arrow.clockwise": "refresh",
  "arrow.down.doc.fill": "file-download",
  "arrow.up.doc.fill": "file-upload",
  "square.and.arrow.up": "share",
  "doc.text.fill": "description",
  "doc.badge.plus": "note-add",
  "doc.richtext.fill": "picture-as-pdf",
  "checkmark.seal.fill": "verified",
  "doc.on.doc": "content-copy",
  "tablecells.fill": "table-chart",
  "exclamationmark.triangle.fill": "warning",
  "building.2.fill": "business",
  "person.fill": "person",
  "person.badge.plus": "person-add",
  "person.fill.xmark": "person-remove",
  "circle.fill": "circle",
  "paintbrush.fill": "brush",
  "link": "link",
  "person.2.fill": "group",
  "trash": "delete",
  "person.3.fill": "groups",
} as IconMapping;

/**
 * An icon component that uses native SF Symbols on iOS, and Material Icons on Android and web.
 * This ensures a consistent look across platforms, and optimal resource usage.
 * Icon `name`s are based on SF Symbols and require manual mapping to Material Icons.
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
