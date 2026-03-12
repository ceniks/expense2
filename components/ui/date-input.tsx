/**
 * DateInput — TextInput com máscara automática DD/MM/AAAA.
 *
 * Ao digitar apenas números, insere as barras automaticamente:
 *   "2703"     → "27/03"
 *   "270320"   → "27/03/20"
 *   "27032026" → "27/03/2026"
 *
 * Aceita backspace sem duplicar barras.
 * Valor externo deve estar no formato DD/MM/AAAA (use isoToBr para converter antes de passar).
 */

import { TextInput, type TextInputProps, StyleSheet } from "react-native";

interface DateInputProps extends Omit<TextInputProps, "onChangeText" | "value"> {
  value: string;
  onChangeText: (formatted: string) => void;
}

function applyDateMask(raw: string): string {
  // Strip everything that's not a digit
  const digits = raw.replace(/\D/g, "").slice(0, 8);

  let result = "";
  for (let i = 0; i < digits.length; i++) {
    if (i === 2 || i === 4) result += "/";
    result += digits[i];
  }
  return result;
}

export function DateInput({ value, onChangeText, style, ...props }: DateInputProps) {
  function handleChange(text: string) {
    // If user is deleting and the last char is a slash, remove the slash + preceding digit
    if (text.length < (value?.length ?? 0) && text.endsWith("/")) {
      onChangeText(text.slice(0, -1));
      return;
    }
    onChangeText(applyDateMask(text));
  }

  return (
    <TextInput
      value={value}
      onChangeText={handleChange}
      keyboardType="number-pad"
      maxLength={10} // DD/MM/AAAA = 10 chars
      placeholder="DD/MM/AAAA"
      returnKeyType="done"
      style={style}
      {...props}
    />
  );
}
