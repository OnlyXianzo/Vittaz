import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useApp } from "../store";
import { read_kilo_key, save_kilo_key } from "../assistant/secure_key";
import {
  B,
  Button,
  Card,
  Input,
  M,
  PageHeader,
  Pill,
  Radio,
  Row,
  Screen,
  SectionLabel,
} from "../ui";

export function ModelsScreen() {
  const { state, dispatch } = useApp();
  const [key_value, set_key_value] = useState("");
  const [has_key, set_has_key] = useState(false);
  const [saving, set_saving] = useState(false);

  useEffect(() => {
    let active = true;
    void read_kilo_key(SecureStore)
      .then((key) => {
        if (active) set_has_key(key !== null);
      })
      .catch(() => {
        if (active) set_has_key(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const save_key = async (value: string) => {
    set_saving(true);
    try {
      await save_kilo_key(SecureStore, value);
      set_has_key(value.trim().length > 0);
      set_key_value("");
      dispatch({
        type: "show_toast",
        message: value.trim()
          ? "Kilo key saved securely."
          : "Kilo key removed. Keyless free access remains available.",
      });
    } catch {
      dispatch({
        type: "show_toast",
        message: "Could not save that key. Check its format and try again.",
      });
    } finally {
      set_saving(false);
    }
  };

  return (
    <Screen>
      <PageHeader
        title="Choose model"
        onBack={() => dispatch({ type: "back" })}
      />
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel="Kilo Auto Free"
        accessibilityState={{ checked: state.model === "auto" }}
        onPress={() => dispatch({ type: "select_model", model: "auto" })}
        style={({ pressed }) => [pressed && { opacity: 0.8 }]}
      >
        <Card
          tone="soft"
          style={{ marginTop: 14, borderColor: "rgba(184,242,60,0.5)" }}
        >
          <Row start gap={12} style={{ alignItems: "flex-start" }}>
            <Radio on={state.model === "auto"} />
            <View style={{ flex: 1 }}>
              <B>Kilo Auto Free</B>
              <M style={{ marginTop: 4, lineHeight: 18 }}>
                Read-only ledger questions. Works without a key; adding ledger
                entries remains a separate, on-device action.
              </M>
            </View>
            <Pill>Selected</Pill>
          </Row>
        </Card>
      </Pressable>

      <SectionLabel>Kilo Gateway key (optional)</SectionLabel>
      <Card style={{ gap: 12 }}>
        <M style={{ lineHeight: 18 }}>
          {has_key
            ? "A key is stored in Android secure storage. The key itself is never shown."
            : "No key is required for Kilo Auto Free. Add your own Kilo Gateway key if you prefer."}
        </M>
        <Input
          label="Kilo Gateway API key"
          value={key_value}
          onChangeText={set_key_value}
          placeholder="Paste your key"
          secure
          textStyle={{ minHeight: 48 }}
        />
        <Row gap={8}>
          <Button
            label={saving ? "Saving…" : "Save key"}
            disabled={saving || !key_value.trim()}
            onPress={() => void save_key(key_value)}
            style={{ flex: 1 }}
          />
          {has_key ? (
            <Button
              label="Remove key"
              variant="ghost"
              disabled={saving}
              onPress={() => void save_key("")}
              style={{ flex: 1 }}
            />
          ) : null}
        </Row>
      </Card>

      <SectionLabel>Privacy</SectionLabel>
      <Card>
        <M style={{ lineHeight: 19 }}>
          Kilo Auto Free can route prompts to different providers; free
          providers may log prompts. Do not send real names, account details,
          personal messages, or other confidential information. Use synthetic
          data for testing. The assistant only has read-only ledger tools and
          cannot create or approve entries.
        </M>
      </Card>
      <M
        size={12}
        style={{ marginVertical: 14, marginHorizontal: 4, lineHeight: 17 }}
      >
        Your optional key stays in Expo SecureStore. Removing it returns the app
        to keyless free access.
      </M>
    </Screen>
  );
}
