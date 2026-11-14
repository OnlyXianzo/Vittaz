import type { ComponentProps, ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { B, Input, M } from "../ui";
import { colors } from "../theme";

/** Visible labels belong to forms; the shared bare Input also serves chat. */
export function ProviderField({
  title,
  hint,
  error,
  actions,
  ...input
}: ComponentProps<typeof Input> & {
  title?: string;
  hint?: string;
  error?: string;
  actions?: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <B size={13}>{title ?? input.label}</B>
      <View style={[styles.control, error ? styles.invalid : undefined]}>
        <Input
          {...input}
          autoCapitalize={input.autoCapitalize ?? "none"}
          autoCorrect={false}
          textStyle={[styles.input, input.textStyle]}
        />
        {actions}
      </View>
      {error ? (
        <M style={styles.error}>{error}</M>
      ) : hint ? (
        <M size={12}>{hint}</M>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 8 },
  control: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.panelBorder,
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  input: { flex: 1, minWidth: 0, minHeight: 50, paddingVertical: 12 },
  invalid: { borderColor: colors.amber },
  error: { color: colors.amber, fontSize: 12 },
});
